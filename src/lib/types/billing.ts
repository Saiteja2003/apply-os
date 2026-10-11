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
  /** Number of platform runs today per model id. */
  dailyUsage?: Record<string, number>;
}

/** One-time credit bundles (Zero subscriptions). */
export type CreditBundleId = "bundle_starter" | "bundle_pro" | "bundle_sprint";

export interface CreditBundle {
  id: CreditBundleId;
  name: string;
  credits: number;
  priceCents: number;
  priceFormatted: string;
  pricePerApp: string;
  popular?: boolean;
  description: string;
  points: string[];
}

export const CREDIT_BUNDLES: Record<CreditBundleId, CreditBundle> = {
  bundle_starter: {
    id: "bundle_starter",
    name: "Starter Pack",
    credits: 50,
    priceCents: 1200,
    priceFormatted: "$12",
    pricePerApp: "$0.24/app",
    description: "Ideal for kickstarting a targeted application round.",
    points: [
      "50 tailored applications",
      "Full access to Claude 3.7 Sonnet & GPT-4o",
      "Credits never expire",
      "One-time payment — zero auto-renewals",
    ],
  },
  bundle_pro: {
    id: "bundle_pro",
    name: "Pro Pack",
    credits: 100,
    priceCents: 1900,
    priceFormatted: "$19",
    pricePerApp: "$0.19/app",
    popular: true,
    description: "Most popular for active job hunters applying across tech & enterprise.",
    points: [
      "100 tailored applications",
      "Full access to Claude 3.7 Sonnet & GPT-4o",
      "Priority token limits & high-density interview prep",
      "Credits never expire",
      "One-time payment — zero auto-renewals",
    ],
  },
  bundle_sprint: {
    id: "bundle_sprint",
    name: "Sprint Pack",
    credits: 250,
    priceCents: 3900,
    priceFormatted: "$39",
    pricePerApp: "$0.15/app",
    description: "Best per-application value for high-intensity, multi-track search sprints.",
    points: [
      "250 tailored applications",
      "Lowest cost per application ($0.15/app)",
      "Full access to Claude 3.7 Sonnet & GPT-4o",
      "Credits never expire",
      "One-time payment — zero auto-renewals",
    ],
  },
};

/** Mirrors `public.free_daily_credits()` in the database. */
export const FREE_DAILY_CREDITS = 3;

/** `ActionResult` error code for a run refused for lack of credits. */
export const INSUFFICIENT_CREDITS = "insufficient_credits";

/** `ActionResult` error code for a model the plan does not cover on platform keys. */
export const MODEL_NOT_ALLOWED = "model_not_allowed";

/** `ActionResult` error code when daily free quota is exhausted. */
export const DAILY_QUOTA_EXCEEDED = "daily_quota_exceeded";
