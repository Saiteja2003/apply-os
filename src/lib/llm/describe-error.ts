import type { GatewayError } from "./errors";
import { MODEL_REGISTRY } from "./models";

/** A user-facing sentence for a failed gateway call. */
export function describeGatewayError(error: GatewayError, task: string): string {
  const last = error.attempts.at(-1);
  const provider =
    MODEL_REGISTRY.providers.find((entry) => entry.id === last?.providerId)
      ?.label ?? "the provider";

  switch (error.code) {
    case "missing_key":
      return "No API key is available for the selected model. Add your key from the key button in the top bar.";
    case "auth":
      return `${provider} rejected the API key. Check the key saved for it and try again.`;
    case "rate_limit":
      return `${provider} is rate limiting this key. Wait a moment and try again.`;
    case "timeout":
    case "network":
      return `${provider} did not respond in time. Try again.`;
    case "refusal":
      return "The model declined to process this request.";
    case "token_limit":
      return "The model ran out of room before finishing. Try a shorter input.";
    case "invalid_json":
    case "schema_mismatch":
      return "The model returned a malformed result twice. Try again or switch model.";
    default:
      return `${task} failed: ${error.message}`;
  }
}
