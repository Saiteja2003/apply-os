import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getAdminClient } from "@/lib/supabase/admin";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import {
  PLAN_TIERS,
  type CreditLedgerEntry,
  type CreditReferenceType,
  type PlanTier,
  type UserCredits,
} from "@/lib/types/billing";

/**
 * Credits for tailoring on ApplyOS's own model keys. Balances change only
 * inside the database functions of migration 004: nothing here writes to
 * `user_credits` or `credit_ledger` directly.
 */

/** The balance cannot cover the run. The message is shown to the user. */
export class InsufficientCreditsError extends Error {
  constructor() {
    super(
      "You have no applications left. Add your own API key in Settings for unlimited runs, or see Plans & credits there.",
    );
    this.name = "InsufficientCreditsError";
  }
}

export class CreditStoreError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "CreditStoreError";
  }
}

interface PostgrestFailure {
  code?: string;
  message: string;
}

/** Table or function missing: migration 004 has not been run. */
const NOT_PROVISIONED = new Set(["PGRST202", "PGRST205", "42883", "42P01"]);
/** Raised by `debit_user_credits` when the balance is too low. */
const INSUFFICIENT = "23000";

const notProvisioned = (error: PostgrestFailure) =>
  NOT_PROVISIONED.has(error.code ?? "");

let warned = false;
function warnNotProvisioned() {
  if (warned) return;
  warned = true;
  console.warn(
    "Credits are not set up: run supabase/migrations/004_billing_and_credit_ledger.sql in the Supabase SQL editor. Until then runs on platform keys are not metered.",
  );
}

/** The database functions let a signed-in user act on their own balance only. */
async function creditStore(userId: string): Promise<SupabaseClient> {
  const sessionUser = await getSessionUser();
  if (!sessionUser || sessionUser.id !== userId) {
    throw new CreditStoreError("Credits can only be accessed by their owner.");
  }
  return getAdminClient() ?? (await createClient());
}

interface UserCreditsRow {
  balance: number;
  tier: string;
  tier_expires_at: string | null;
}

interface CreditLedgerRow {
  id: string;
  amount: number;
  balance_after: number;
  reference_type: CreditReferenceType;
  reference_id: string | null;
  description: string;
  created_at: string;
}

const isPlanTier = (value: string): value is PlanTier =>
  (PLAN_TIERS as readonly string[]).includes(value);

/**
 * The user's balance and plan, brought up to date first (today's free
 * allowance, an expired plan). `null` when credits are not set up.
 */
export async function getUserCredits(userId: string): Promise<UserCredits | null> {
  const store = await creditStore(userId);
  const { data, error } = await store
    .rpc("refresh_user_credits", { p_user_id: userId })
    .single<UserCreditsRow>();

  if (error) {
    if (notProvisioned(error)) {
      warnNotProvisioned();
      return null;
    }
    throw new CreditStoreError("Could not load your credits.", { cause: error });
  }
  return {
    balance: data.balance,
    tier: isPlanTier(data.tier) ? data.tier : "free",
    tierExpiresAt: data.tier_expires_at,
  };
}

/** Most recent ledger entries, newest first. */
export async function getCreditLedger(
  userId: string,
  limit = 25,
): Promise<CreditLedgerEntry[]> {
  const store = await creditStore(userId);
  const { data, error } = await store
    .from("credit_ledger")
    .select("id, amount, balance_after, reference_type, reference_id, description, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit)
    .returns<CreditLedgerRow[]>();

  if (error) {
    if (notProvisioned(error)) return [];
    throw new CreditStoreError("Could not load your credit history.", {
      cause: error,
    });
  }
  return data.map((row) => ({
    id: row.id,
    amount: row.amount,
    balanceAfter: row.balance_after,
    referenceType: row.reference_type,
    referenceId: row.reference_id,
    description: row.description,
    createdAt: row.created_at,
  }));
}

/**
 * Counts how many times each model was tailored today (since 00:00 UTC).
 * Used to track remaining daily quotas for FREE_FAST and FREE_STANDARD models.
 */
export async function getDailyQuotaUsage(
  userId: string,
): Promise<Record<string, number>> {
  const store = await creditStore(userId);
  const startOfUtcDay = new Date();
  startOfUtcDay.setUTCHours(0, 0, 0, 0);

  const { data, error } = await store
    .from("applications")
    .select("tailored_by_model")
    .eq("user_id", userId)
    .gte("updated_at", startOfUtcDay.toISOString())
    .not("tailored_by_model", "is", null);

  if (error) {
    console.error("Could not load daily quota usage", error);
    return {};
  }

  const usage: Record<string, number> = {};
  for (const row of data ?? []) {
    if (row.tailored_by_model) {
      usage[row.tailored_by_model] = (usage[row.tailored_by_model] ?? 0) + 1;
    }
  }
  return usage;
}

/**
 * Takes one credit for tailoring `applicationId`, atomically. Returns true
 * when a credit was taken, false when credits are not set up (the run is
 * then not metered). Throws InsufficientCreditsError on an empty balance.
 */
export async function spendCreditForTailoring(
  userId: string,
  applicationId: string,
  description: string,
): Promise<boolean> {
  const store = await creditStore(userId);
  const { error } = await store.rpc("debit_user_credits", {
    p_user_id: userId,
    p_amount: 1,
    p_reference_type: "TAILOR_APPLICATION",
    p_reference_id: applicationId,
    p_description: description.slice(0, 300),
  });

  if (!error) return true;
  if (error.code === INSUFFICIENT) throw new InsufficientCreditsError();
  if (notProvisioned(error)) {
    warnNotProvisioned();
    return false;
  }
  throw new CreditStoreError("Could not check your credits. Try again.", {
    cause: error,
  });
}

/**
 * Gives back the credit taken for a run that then failed. Needs the service
 * role: the database refuses a refund asked for with a user's own session,
 * since that would let a user refund runs that succeeded. Never throws.
 */
export async function refundTailoringCredit(
  userId: string,
  applicationId: string,
): Promise<boolean> {
  const admin = getAdminClient();
  if (!admin) {
    console.error(
      "A failed tailoring run could not be refunded: SUPABASE_SERVICE_ROLE_KEY is not a service-role key.",
      { userId, applicationId },
    );
    return false;
  }
  const { data, error } = await admin.rpc("refund_tailoring_credit", {
    p_user_id: userId,
    p_application_id: applicationId,
  });
  if (error) {
    console.error("Refund of a failed tailoring run failed", {
      userId,
      applicationId,
      error,
    });
    return false;
  }
  return data !== null;
}
