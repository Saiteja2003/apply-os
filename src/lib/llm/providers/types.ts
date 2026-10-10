export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface ProviderRequest {
  apiKey: string;
  /** Provider-side model string (`ModelDescriptor.apiModelId`). */
  model: string;
  system: string | null;
  prompt: string;
  /** JSON Schema the response must conform to. */
  jsonSchema: Record<string, unknown>;
  schemaName: string;
  maxOutputTokens: number;
  timeoutMs: number;
  serverSideRefusalFallback: boolean;
}

export interface ProviderResponse {
  /** Raw JSON text. The gateway parses and validates it. */
  text: string;
  usage: TokenUsage;
}

/**
 * One vendor SDK call. Adapters translate every vendor failure into a
 * GatewayError and never throw anything else.
 */
export type ProviderAdapter = (
  request: ProviderRequest,
) => Promise<ProviderResponse>;
