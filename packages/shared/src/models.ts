/**
 * Model registry served by the API at runtime. Provider and model ids are
 * plain strings on purpose: adding a model is a registry change, not a
 * type change.
 */

export type AuthType = "platform" | "byok";

export interface ProviderDescriptor {
  id: string;
  label: string;
  supportsByok: boolean;
}

export interface ModelDescriptor {
  id: string;
  providerId: string;
  label: string;
}

export interface ModelRegistry {
  providers: ProviderDescriptor[];
  models: ModelDescriptor[];
  defaultModelId: string;
}
