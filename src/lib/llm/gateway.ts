import "server-only";

import { z } from "zod";

import { GatewayError, type GatewayAttempt } from "./errors";
import {
  getModel,
  type AuthType,
  type ModelDescriptor,
  type ProviderId,
} from "./models";
import { anthropicAdapter } from "./providers/anthropic";
import { googleAdapter } from "./providers/google";
import { openaiAdapter } from "./providers/openai";
import type { ProviderAdapter, TokenUsage } from "./providers/types";

/**
 * The single entry point for every AI call in the app. Route handlers and
 * server actions call `generateStructured`; nothing else imports a vendor SDK.
 */

const ADAPTERS: Record<ProviderId, ProviderAdapter> = {
  anthropic: anthropicAdapter,
  openai: openaiAdapter,
  google: googleAdapter,
};

const PLATFORM_KEY_ENV: Record<ProviderId, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  google: "GEMINI_API_KEY",
};

const DEFAULT_MAX_OUTPUT_TOKENS = 16_000;
/** Ceiling for the automatic retry after a truncated response. */
const RETRY_MAX_OUTPUT_TOKENS = 32_000;
const DEFAULT_TIMEOUT_MS = 90_000;
const MAX_TRIES_PER_MODEL = 2;

/** The user's own keys, already decrypted, by provider. */
export type ProviderKeys = Partial<Record<ProviderId, string>>;

export interface GenerateStructuredRequest<T> {
  /** Registry id of the model to try first. */
  modelId: string;
  /**
   * Zod schema for the response. Use only required fields (model optional
   * values as `.nullable()`), since strict structured output requires every
   * property to be present.
   */
  schema: z.ZodType<T>;
  /** Short identifier for the schema: letters, digits, `_` or `-`. */
  schemaName: string;
  system?: string;
  prompt: string;
  /** BYOK keys for this user. A provider without one uses the platform key. */
  byokKeys?: ProviderKeys;
  /** Registry ids to try, in order, if the first model fails. */
  fallbackModelIds?: string[];
  maxOutputTokens?: number;
  timeoutMs?: number;
}

export interface StructuredResult<T> {
  data: T;
  /** Registry id of the model that produced `data`. */
  modelId: string;
  providerId: ProviderId;
  authType: AuthType;
  usage: TokenUsage;
  /** Failed attempts that preceded the successful one. */
  attempts: GatewayAttempt[];
}

interface ResolvedKey {
  apiKey: string;
  authType: AuthType;
}

function resolveKey(
  providerId: ProviderId,
  byokKeys: ProviderKeys | undefined,
): ResolvedKey | null {
  const byok = byokKeys?.[providerId]?.trim();
  if (byok) return { apiKey: byok, authType: "byok" };

  const platform = process.env[PLATFORM_KEY_ENV[providerId]]?.trim();
  if (platform) return { apiKey: platform, authType: "platform" };

  return null;
}

function toJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const { $schema: _dialect, ...jsonSchema } = z.toJSONSchema(schema);
  return jsonSchema;
}

function parseResponse<T>(text: string, schema: z.ZodType<T>): T {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    throw new GatewayError("invalid_json", "Model response was not valid JSON.", {
      cause: error,
    });
  }

  const result = schema.safeParse(json);
  if (!result.success) {
    throw new GatewayError(
      "schema_mismatch",
      `Model response did not match the schema: ${z.prettifyError(result.error)}`,
      { cause: result.error },
    );
  }
  return result.data;
}

function asGatewayError(error: unknown): GatewayError {
  if (error instanceof GatewayError) return error;
  return new GatewayError("provider_error", "Unexpected gateway failure.", {
    cause: error,
  });
}

export async function generateStructured<T>(
  request: GenerateStructuredRequest<T>,
): Promise<StructuredResult<T>> {
  const jsonSchema = toJsonSchema(request.schema);
  const timeoutMs = request.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const candidateIds = [
    ...new Set([request.modelId, ...(request.fallbackModelIds ?? [])]),
  ];

  const attempts: GatewayAttempt[] = [];
  let lastError: GatewayError | null = null;

  const fail = (
    modelId: string,
    model: ModelDescriptor | null,
    error: GatewayError,
  ) => {
    attempts.push({
      modelId,
      providerId: model?.providerId ?? null,
      code: error.code,
      message: error.message,
    });
    lastError = error;
  };

  for (const modelId of candidateIds) {
    const model = getModel(modelId);
    if (!model) {
      fail(
        modelId,
        null,
        new GatewayError("unknown_model", `Unknown model "${modelId}".`),
      );
      continue;
    }

    const key = resolveKey(model.providerId, request.byokKeys);
    if (!key) {
      fail(
        modelId,
        model,
        new GatewayError(
          "missing_key",
          `No API key available for ${model.providerId}.`,
        ),
      );
      continue;
    }

    let maxOutputTokens = Math.min(
      request.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
      model.maxOutputTokens,
    );

    for (let attempt = 1; attempt <= MAX_TRIES_PER_MODEL; attempt++) {
      try {
        const response = await ADAPTERS[model.providerId]({
          apiKey: key.apiKey,
          model: model.apiModelId,
          system: request.system ?? null,
          prompt: request.prompt,
          jsonSchema,
          schemaName: request.schemaName,
          maxOutputTokens,
          timeoutMs,
          serverSideRefusalFallback: model.serverSideRefusalFallback ?? false,
        });

        return {
          data: parseResponse(response.text, request.schema),
          modelId: model.id,
          providerId: model.providerId,
          authType: key.authType,
          usage: response.usage,
          attempts,
        };
      } catch (caught) {
        const error = asGatewayError(caught);
        fail(modelId, model, error);

        // A rejected key is the user's to fix: surface it rather than
        // quietly billing a different provider.
        if (error.code === "auth") {
          error.attempts = attempts;
          throw error;
        }

        if (attempt === MAX_TRIES_PER_MODEL) break;

        if (error.code === "token_limit") {
          const raised = Math.min(
            maxOutputTokens * 2,
            model.maxOutputTokens,
            RETRY_MAX_OUTPUT_TOKENS,
          );
          if (raised <= maxOutputTokens) break;
          maxOutputTokens = raised;
          continue;
        }
        if (error.code === "invalid_json" || error.code === "schema_mismatch") {
          continue;
        }
        // Rate limits, timeouts, refusals and provider errors: the SDK has
        // already retried what is retryable, so move to the next model.
        break;
      }
    }
  }

  const error: GatewayError =
    lastError ?? new GatewayError("unknown_model", "No model was requested.");
  error.attempts = attempts;
  throw error;
}
