import "server-only";

import Anthropic from "@anthropic-ai/sdk";

import { GatewayError } from "../errors";
import type { ProviderAdapter } from "./types";

const REFUSAL_FALLBACK_BETA = "server-side-fallback-2026-07-01";

function toGatewayError(error: unknown): GatewayError {
  if (error instanceof GatewayError) return error;
  if (
    error instanceof Anthropic.AuthenticationError ||
    error instanceof Anthropic.PermissionDeniedError
  ) {
    return new GatewayError("auth", "Anthropic rejected the API key.", {
      cause: error,
    });
  }
  if (error instanceof Anthropic.RateLimitError) {
    return new GatewayError("rate_limit", "Anthropic rate limit reached.", {
      cause: error,
    });
  }
  if (error instanceof Anthropic.APIConnectionTimeoutError) {
    return new GatewayError("timeout", "Anthropic request timed out.", {
      cause: error,
    });
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return new GatewayError("network", "Could not reach Anthropic.", {
      cause: error,
    });
  }
  if (error instanceof Anthropic.BadRequestError) {
    return new GatewayError("bad_request", error.message, { cause: error });
  }
  if (error instanceof Anthropic.APIError) {
    return new GatewayError(
      "provider_error",
      `Anthropic error ${error.status ?? "unknown"}: ${error.message}`,
      { cause: error },
    );
  }
  return new GatewayError("provider_error", "Unexpected Anthropic failure.", {
    cause: error,
  });
}

export const anthropicAdapter: ProviderAdapter = async (request) => {
  const client = new Anthropic({ apiKey: request.apiKey, maxRetries: 1 });

  try {
    const response = await client.beta.messages.create(
      {
        model: request.model,
        max_tokens: request.maxOutputTokens,
        ...(request.system ? { system: request.system } : {}),
        messages: [{ role: "user", content: request.prompt }],
        output_config: {
          format: { type: "json_schema", schema: request.jsonSchema },
        },
        ...(request.serverSideRefusalFallback
          ? { betas: [REFUSAL_FALLBACK_BETA], fallbacks: "default" as const }
          : {}),
      },
      { timeout: request.timeoutMs },
    );

    if (response.stop_reason === "refusal") {
      throw new GatewayError("refusal", "Claude declined this request.");
    }
    if (response.stop_reason === "max_tokens") {
      throw new GatewayError(
        "token_limit",
        "Claude hit the output token limit before finishing.",
      );
    }

    const text = response.content
      .flatMap((block) => (block.type === "text" ? [block.text] : []))
      .join("");

    return {
      text,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    };
  } catch (error) {
    throw toGatewayError(error);
  }
};
