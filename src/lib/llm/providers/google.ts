import "server-only";

import { ApiError, FinishReason, GoogleGenAI } from "@google/genai";

import { GatewayError } from "../errors";
import type { ProviderAdapter } from "./types";

const REFUSAL_FINISH_REASONS: ReadonlySet<FinishReason> = new Set([
  FinishReason.SAFETY,
  FinishReason.RECITATION,
  FinishReason.BLOCKLIST,
  FinishReason.PROHIBITED_CONTENT,
  FinishReason.SPII,
]);

function toGatewayError(error: unknown): GatewayError {
  if (error instanceof GatewayError) return error;
  if (error instanceof ApiError) {
    if (error.status === 401 || error.status === 403) {
      return new GatewayError("auth", "Google rejected the API key.", {
        cause: error,
      });
    }
    if (error.status === 429) {
      return new GatewayError("rate_limit", "Google rate limit reached.", {
        cause: error,
      });
    }
    if (error.status === 408 || error.status === 504) {
      return new GatewayError("timeout", "Google request timed out.", {
        cause: error,
      });
    }
    if (error.status === 400) {
      // Gemini also reports an invalid API key as a 400.
      return new GatewayError("bad_request", error.message, { cause: error });
    }
    return new GatewayError(
      "provider_error",
      `Google error ${error.status}: ${error.message}`,
      { cause: error },
    );
  }
  if (
    error instanceof Error &&
    (error.name === "AbortError" || error.name === "TimeoutError")
  ) {
    return new GatewayError("timeout", "Google request timed out.", {
      cause: error,
    });
  }
  return new GatewayError("network", "Could not reach Google.", {
    cause: error,
  });
}

export const googleAdapter: ProviderAdapter = async (request) => {
  const client = new GoogleGenAI({ apiKey: request.apiKey });

  try {
    const response = await client.models.generateContent({
      model: request.model,
      contents: request.prompt,
      config: {
        ...(request.system ? { systemInstruction: request.system } : {}),
        responseMimeType: "application/json",
        responseJsonSchema: request.jsonSchema,
        maxOutputTokens: request.maxOutputTokens,
        httpOptions: { timeout: request.timeoutMs },
      },
    });

    const finishReason = response.candidates?.[0]?.finishReason;
    if (
      response.promptFeedback?.blockReason ||
      (finishReason && REFUSAL_FINISH_REASONS.has(finishReason))
    ) {
      throw new GatewayError("refusal", "Gemini blocked this request.");
    }
    if (finishReason === FinishReason.MAX_TOKENS) {
      throw new GatewayError(
        "token_limit",
        "Gemini hit the output token limit before finishing.",
      );
    }

    return {
      text: response.text ?? "",
      usage: {
        inputTokens: response.usageMetadata?.promptTokenCount ?? 0,
        outputTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
      },
    };
  } catch (error) {
    throw toGatewayError(error);
  }
};
