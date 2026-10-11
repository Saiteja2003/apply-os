"use server";

import type { ActionResult } from "@/lib/action-result";
import { getCreditLedger, getDailyQuotaUsage, getUserCredits } from "@/lib/db/credits";
import { getSessionUser } from "@/lib/supabase/server";
import { FREE_DAILY_CREDITS, type BillingSummary } from "@/lib/types/billing";

/** The signed-in user's balance, plan, daily usage, and recent credit history. */
export async function getBillingAction(): Promise<ActionResult<BillingSummary>> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "You are signed out. Sign in and try again." };

  try {
    const credits = await getUserCredits(user.id);
    const dailyUsage = await getDailyQuotaUsage(user.id);
    return {
      ok: true,
      data: {
        credits,
        ledger: credits ? await getCreditLedger(user.id) : [],
        freeDailyCredits: FREE_DAILY_CREDITS,
        dailyUsage,
      },
    };
  } catch (error) {
    console.error(error);
    return { ok: false, error: "Could not load your plan and credits." };
  }
}
