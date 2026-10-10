/**
 * Model registry. Safe to import from client components: it holds no keys
 * and pulls in no vendor SDK.
 *
 * Providers are fixed by the adapters that exist in `./providers`. Models
 * are data: adding or retiring one is an edit to MODEL_REGISTRY only.
 */

export const PROVIDER_IDS = ["anthropic", "openai", "google"] as const;

export type ProviderId = (typeof PROVIDER_IDS)[number];

export type AuthType = "platform" | "byok";

export interface ProviderDescriptor {
  id: ProviderId;
  label: string;
  supportsByok: boolean;
}

export interface ModelDescriptor {
  /** Stable id stored in the database (`applications.tailored_by_model`). */
  id: string;
  providerId: ProviderId;
  label: string;
  /** Model string sent to the provider API. */
  apiModelId: string;
  /** Hard output-token ceiling for this model. */
  maxOutputTokens: number;
  /**
   * Anthropic only: let the API re-run a safety-declined request on its
   * default fallback model inside the same call.
   */
  serverSideRefusalFallback?: boolean;
}

export interface ModelRegistry {
  providers: ProviderDescriptor[];
  models: ModelDescriptor[];
  defaultModelId: string;
}

export const MODEL_REGISTRY: ModelRegistry = {
  providers: [
    { id: "anthropic", label: "Anthropic", supportsByok: true },
    { id: "openai", label: "OpenAI", supportsByok: true },
    { id: "google", label: "Google", supportsByok: true },
  ],
  models: [
    {
      id: "claude-sonnet-5-5",
      providerId: "anthropic",
      label: "Claude Sonnet 5.5",
      apiModelId: "claude-sonnet-5-5",
      maxOutputTokens: 128_000,
      serverSideRefusalFallback: true,
    },
    {
      id: "gpt-4o",
      providerId: "openai",
      label: "GPT-4o",
      apiModelId: "gpt-4o",
      maxOutputTokens: 16_384,
    },
    {
      id: "gemini-3.5-flash-lite",
      providerId: "google",
      label: "Gemini 3.5 Flash Lite",
      apiModelId: "gemini-3.5-flash-lite",
      maxOutputTokens: 65_536,
    },
  ],
  defaultModelId: "gemini-3.5-flash-lite",
};

export function getModel(modelId: string): ModelDescriptor | null {
  return MODEL_REGISTRY.models.find((model) => model.id === modelId) ?? null;
}
