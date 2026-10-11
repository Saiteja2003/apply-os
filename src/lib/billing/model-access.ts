import type { ProviderKeys } from "@/lib/llm/gateway";
import { getModel, MODEL_REGISTRY, type ModelDescriptor } from "@/lib/llm/models";
import type { PlanTier } from "@/lib/types/billing";

/**
 * Access rules for AI models:
 * 1. BYOK: Any request backed by a user-supplied key in `user_api_keys` bypasses
 *    all credit and quota debits (unlimited, zero-cost).
 * 2. FREE_FAST (e.g. Gemini 3.5 Flash Lite): 5 free runs per UTC day on platform keys.
 * 3. FREE_STANDARD (e.g. Gemini 3.8 Flash): 3 free runs per UTC day on platform keys.
 * 4. PREMIUM_INSTITUTIONAL (Claude 3.5/3.7 Sonnet, GPT-4o): Requires either positive
 *    credit bundle balance (balance > 0) or active BYOK key.
 */

export const MODEL_NOT_ALLOWED_MESSAGE =
  "Claude and GPT-4o on platform keys require a credit bundle or your own API key.";

export class ModelNotAllowedError extends Error {
  constructor(message: string = MODEL_NOT_ALLOWED_MESSAGE) {
    super(message);
    this.name = "ModelNotAllowedError";
  }
}

export class DailyQuotaExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DailyQuotaExceededError";
  }
}

/** True when the user has a stored key for the model's provider. */
export function hasOwnKeyFor(modelId: string, byokKeys: ProviderKeys): boolean {
  const model = getModel(modelId);
  return Boolean(model && byokKeys[model.providerId]?.trim());
}

/**
 * Checks whether ApplyOS's platform key may run `modelId`.
 * Accepts either `PlanTier` string or numeric balance for flexibility across caller sites.
 */
export function platformAllows(
  tierOrBalance: PlanTier | number | null,
  modelId: string,
  dailyUsageCount = 0,
): boolean {
  const model = getModel(modelId);
  if (!model) return false;

  const balance =
    typeof tierOrBalance === "number"
      ? tierOrBalance
      : tierOrBalance === "pro_credits" || tierOrBalance === "sprint_pass"
        ? 1
        : 0;

  if (model.tier === "PREMIUM_INSTITUTIONAL") {
    return balance > 0;
  }

  if (model.tier === "FREE_FAST") {
    return dailyUsageCount < model.dailyFreeQuota || balance > 0;
  }

  if (model.tier === "FREE_STANDARD") {
    return dailyUsageCount < model.dailyFreeQuota || balance > 0;
  }

  return false;
}

/** The ids the user may actually run: own-key models and allowed platform ones. */
export function runnableModelIds(
  modelIds: readonly string[] | undefined,
  tierOrBalance: PlanTier | number | null,
  byokKeys: ProviderKeys,
  dailyUsage: Record<string, number> = {},
): string[] {
  return (modelIds ?? []).filter(
    (id) =>
      hasOwnKeyFor(id, byokKeys) ||
      platformAllows(tierOrBalance, id, dailyUsage[id] ?? 0),
  );
}

/**
 * Evaluates whether a requested model run is allowed.
 * Returns { allowed: true, onOwnKey: boolean, chargeCredit: boolean } or throws an error.
 */
export function evaluateModelAccess(
  model: ModelDescriptor,
  byokKeys: ProviderKeys,
  balance: number,
  dailyUsageCount = 0,
): { allowed: boolean; onOwnKey: boolean; chargeCredit: boolean } {
  // 1. BYOK bypasses all credit/quota constraints
  if (hasOwnKeyFor(model.id, byokKeys)) {
    return { allowed: true, onOwnKey: true, chargeCredit: false };
  }

  // 2. Institutional models require positive credit balance
  if (model.tier === "PREMIUM_INSTITUTIONAL") {
    if (balance <= 0) {
      throw new ModelNotAllowedError(
        `${model.label} on platform keys requires a credit pack or your own API key.`,
      );
    }
    return { allowed: true, onOwnKey: false, chargeCredit: true };
  }

  // 3. Free Fast / Standard models
  const quota = model.dailyFreeQuota;
  if (dailyUsageCount < quota) {
    // Within free daily quota: no credit charged
    return { allowed: true, onOwnKey: false, chargeCredit: false };
  }

  // Exhausted daily quota: if user has paid credits, allow spending 1 credit
  if (balance > 0) {
    return { allowed: true, onOwnKey: false, chargeCredit: true };
  }

  throw new DailyQuotaExceededError(
    `You have reached your daily limit of ${quota} free runs for ${model.label}. Quota resets daily at 00:00 UTC.`,
  );
}
