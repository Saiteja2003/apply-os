import type { ProviderKeys } from "@/lib/llm/gateway";
import { getModel, MODEL_REGISTRY } from "@/lib/llm/models";
import type { PlanTier } from "@/lib/types/billing";

/**
 * Which models a run may use. A model on the user's own API key is always
 * allowed and free. A model on ApplyOS's platform keys is limited to the
 * default fast model unless the user holds a paid plan.
 */

export const MODEL_NOT_ALLOWED_MESSAGE =
  "Claude and GPT-4o on platform keys require a Pro Credit Pack or your own API key.";

/** The chosen model is not available to this account on platform keys. */
export class ModelNotAllowedError extends Error {
  constructor() {
    super(MODEL_NOT_ALLOWED_MESSAGE);
    this.name = "ModelNotAllowedError";
  }
}

/** True when the user has a stored key for the model's provider. */
export function hasOwnKeyFor(modelId: string, byokKeys: ProviderKeys): boolean {
  const model = getModel(modelId);
  return Boolean(model && byokKeys[model.providerId]?.trim());
}

const PAID_TIERS: ReadonlySet<PlanTier> = new Set(["pro_credits", "sprint_pass"]);

/**
 * Whether ApplyOS's platform key may run `modelId` for this plan. `null`
 * (credits not set up, or unknown) is treated as the free plan, so an
 * unprovisioned workspace cannot spend platform money on dearer models.
 */
export function platformAllows(tier: PlanTier | null, modelId: string): boolean {
  if (tier && PAID_TIERS.has(tier)) return true;
  return modelId === MODEL_REGISTRY.defaultModelId;
}

/** The ids the user may actually run: own-key models and allowed platform ones. */
export function runnableModelIds(
  modelIds: readonly string[] | undefined,
  tier: PlanTier | null,
  byokKeys: ProviderKeys,
): string[] {
  return (modelIds ?? []).filter(
    (id) => hasOwnKeyFor(id, byokKeys) || platformAllows(tier, id),
  );
}
