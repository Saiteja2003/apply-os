import type { ProviderId } from "./models";

export type GatewayErrorCode =
  /** Model id is not in the registry. */
  | "unknown_model"
  /** No BYOK key and no platform key for the provider. */
  | "missing_key"
  /** Provider rejected the key. */
  | "auth"
  | "rate_limit"
  | "timeout"
  | "network"
  /** Output was cut off at the output-token ceiling. */
  | "token_limit"
  /** Provider rejected the request itself (e.g. prompt too long). */
  | "bad_request"
  /** Model declined to answer. */
  | "refusal"
  /** Response was not parseable JSON. */
  | "invalid_json"
  /** Response was JSON but did not match the requested schema. */
  | "schema_mismatch"
  | "provider_error";

export interface GatewayAttempt {
  modelId: string;
  providerId: ProviderId | null;
  code: GatewayErrorCode;
  message: string;
}

export class GatewayError extends Error {
  readonly code: GatewayErrorCode;
  /** Every failed attempt, in order, including the one that raised this. */
  attempts: GatewayAttempt[] = [];

  constructor(code: GatewayErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "GatewayError";
    this.code = code;
  }
}
