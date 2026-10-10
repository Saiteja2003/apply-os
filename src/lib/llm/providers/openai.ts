import "server-only";

import OpenAI from "openai";

import { GatewayError } from "../errors";
import type { ProviderAdapter } from "./types";

function toGatewayError(error: unknown): GatewayError {
  if (error instanceof GatewayError) return error;
  if (
    error instanceof OpenAI.AuthenticationError ||
    error instanceof OpenAI.PermissionDeniedError
  ) {
    return new GatewayError("auth", "OpenAI rejected the API key.", {
      cause: error,
    });
  }
  if (error instanceof OpenAI.RateLimitError) {
    return new GatewayError("rate_limit", "OpenAI rate limit reached.", {
      cause: error,
    });
  }
  if (error instanceof OpenAI.APIConnectionTimeoutError) {
    return new GatewayError("timeout", "OpenAI request timed out.", {
      cause: error,
    });
  }
  if (error instanceof OpenAI.APIConnectionError) {
    return new GatewayError("network", "Could not reach OpenAI.", {
      cause: error,
    });
  }
  if (error instanceof OpenAI.BadRequestError) {
    return new GatewayError("bad_request", error.message, { cause: error });
  }
  if (error instanceof OpenAI.APIError) {
    return new GatewayError(
      "provider_error",
      `OpenAI error ${error.status ?? "unknown"}: ${error.message}`,
      { cause: error },
    );
  }
  return new GatewayError("provider_error", "Unexpected OpenAI failure.", {
    cause: error,
  });
}

export const openaiAdapter: ProviderAdapter = async (request) => {
  const client = new OpenAI({ apiKey: request.apiKey, maxRetries: 1 });

  try {
    const completion = await client.chat.completions.create(
      {
        model: request.model,
        max_completion_tokens: request.maxOutputTokens,
        messages: [
          ...(request.system
            ? [{ role: "system" as const, content: request.system }]
            : []),
          { role: "user" as const, content: request.prompt },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: request.schemaName,
            schema: request.jsonSchema,
            strict: true,
          },
        },
      },
      { timeout: request.timeoutMs },
    );

    const choice = completion.choices[0];
    if (!choice) {
      throw new GatewayError("provider_error", "OpenAI returned no choices.");
    }
    if (choice.message.refusal || choice.finish_reason === "content_filter") {
      throw new GatewayError(
        "refusal",
        choice.message.refusal ?? "OpenAI filtered this response.",
      );
    }
    if (choice.finish_reason === "length") {
      throw new GatewayError(
        "token_limit",
        "OpenAI hit the output token limit before finishing.",
      );
    }

    return {
      text: choice.message.content ?? "",
      usage: {
        inputTokens: completion.usage?.prompt_tokens ?? 0,
        outputTokens: completion.usage?.completion_tokens ?? 0,
      },
    };
  } catch (error) {
    throw toGatewayError(error);
  }
};
