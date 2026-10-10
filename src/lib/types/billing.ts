/** Plans and credits. One credit is one full tailored application. */

export const PLAN_TIERS = ["free", "byok", "pro_credits", "sprint_pass"] as const;

export type PlanTier = (typeof PLAN_TIERS)[number];

export interface UserCredits {
  balance: number;
  tier: PlanTier;
  /** ISO timestamp, or `null` for a plan that does not end. */
  tierExpiresAt: string | null;
}

export type CreditReferenceType =
  | "PURCHASE"
  | "TAILOR_APPLICATION"
  | "REFUND"
  | "GRANT";

export interface CreditLedgerEntry {
  id: string;
  /** Positive for a purchase, grant or refund; negative for usage. */
  amount: number;
  balanceAfter: number;
  referenceType: CreditReferenceType;
  /** Application id for usage; otherwise a payment or ledger reference. */
  referenceId: string | null;
  description: string;
  createdAt: string;
}

export interface BillingSummary {
  /** `null` until supabase/migrations/004_billing_and_credit_ledger.sql is run. */
  credits: UserCredits | null;
  ledger: CreditLedgerEntry[];
  /** Free applications a free-plan user starts each day with. */
  freeDailyCredits: number;
}

/** Mirrors `public.free_daily_credits()` in the database. */
export const FREE_DAILY_CREDITS = 3;

/** `ActionResult` error code for a run refused for lack of credits. */
export const INSUFFICIENT_CREDITS = "insufficient_credits";

/** `ActionResult` error code for a model the plan does not cover on platform keys. */
export const MODEL_NOT_ALLOWED = "model_not_allowed";
