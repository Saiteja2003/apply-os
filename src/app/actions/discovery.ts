"use server";

import { z } from "zod";

import type { ActionResult } from "@/lib/action-result";
import {
  createAutoApplyAuditLog,
  getAutoApplyAuditLogs,
  getCandidatePreferences,
  getLatestAutoApplyConsent,
  recordAutoApplyConsent,
  saveCandidatePreferences,
} from "@/lib/db/discovery";
import { isJobEligibleForApplication } from "@/lib/matching/preference-filter";
import { getSessionUser } from "@/lib/supabase/server";
import {
  PERMISSION_TIERS,
  WORK_AUTHORIZATIONS,
  type AutoApplyAuditLog,
  type AutoApplyConsent,
  type CandidatePreferences,
  type DiscoveredJob,
  type JobEligibilityResult,
  type PermissionTier,
} from "@/lib/types/discovery";

const SIGNED_OUT = "You are signed out. Sign in and try again.";

const preferencesSchema = z.object({
  targetRoles: z.array(z.string().trim()).optional(),
  seniorityLevels: z.array(z.string().trim()).optional(),
  locations: z.array(z.string().trim()).optional(),
  remoteOnly: z.boolean().optional(),
  minSalaryFloor: z.number().nonnegative().optional(),
  workAuthorization: z.enum(WORK_AUTHORIZATIONS).optional(),
  companyBlocklist: z.array(z.string().trim()).optional(),
  standardAnswers: z.record(z.string(), z.string()).optional(),
});

const consentSchema = z.object({
  permissionTier: z.enum(PERMISSION_TIERS),
  consentText: z.string().trim(),
});

const auditLogSchema = z.object({
  companyName: z.string().trim().min(1),
  jobUrl: z.string().trim().url(),
  matchScore: z.number().min(0).max(100),
  dispatchedVia: z.enum(["REST_API", "BROWSER_ASSIST", "MANUAL"]),
  status: z.enum(["SUCCESS", "HALTED_UNKNOWN_QUESTION", "FAILED"]),
  haltReason: z.string().nullable().optional(),
});

function failure(error: unknown, fallback: string): { ok: false; error: string } {
  console.error(error);
  return {
    ok: false,
    error: error instanceof Error ? error.message : fallback,
  };
}

export async function getCandidatePreferencesAction(): Promise<
  ActionResult<CandidatePreferences | null>
> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: SIGNED_OUT };

  try {
    const preferences = await getCandidatePreferences(user.id);
    return { ok: true, data: preferences };
  } catch (error) {
    return failure(error, "Could not load candidate preferences.");
  }
}

export async function saveCandidatePreferencesAction(
  rawInput: z.infer<typeof preferencesSchema>,
): Promise<ActionResult<CandidatePreferences>> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: SIGNED_OUT };

  const parsed = preferencesSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid candidate preferences input.",
    };
  }

  try {
    const saved = await saveCandidatePreferences(user.id, parsed.data);
    return { ok: true, data: saved };
  } catch (error) {
    return failure(error, "Could not save candidate preferences.");
  }
}

export async function getAutoApplyConsentAction(): Promise<
  ActionResult<AutoApplyConsent | null>
> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: SIGNED_OUT };

  try {
    const consent = await getLatestAutoApplyConsent(user.id);
    return { ok: true, data: consent };
  } catch (error) {
    return failure(error, "Could not load consent settings.");
  }
}

export async function recordAutoApplyConsentAction(rawInput: {
  permissionTier: PermissionTier;
  consentText: string;
}): Promise<ActionResult<AutoApplyConsent>> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: SIGNED_OUT };

  const parsed = consentSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid consent payload.",
    };
  }

  const { permissionTier, consentText } = parsed.data;

  if (permissionTier === "AUTONOMOUS" && consentText.length < 3) {
    return {
      ok: false,
      error:
        "Tier 3 Autonomous Dispatch requires an explicit electronic signature before activation.",
    };
  }

  try {
    const record = await recordAutoApplyConsent(
      user.id,
      permissionTier,
      consentText,
    );
    return { ok: true, data: record };
  } catch (error) {
    return failure(error, "Could not record consent.");
  }
}

export async function getAutoApplyAuditLogsAction(
  limit = 20,
): Promise<ActionResult<AutoApplyAuditLog[]>> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: SIGNED_OUT };

  try {
    const logs = await getAutoApplyAuditLogs(user.id, limit);
    return { ok: true, data: logs };
  } catch (error) {
    return failure(error, "Could not load auto-apply audit logs.");
  }
}

export async function createAutoApplyAuditLogAction(
  rawInput: z.infer<typeof auditLogSchema>,
): Promise<ActionResult<AutoApplyAuditLog>> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: SIGNED_OUT };

  const parsed = auditLogSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid audit log entry.",
    };
  }

  try {
    const log = await createAutoApplyAuditLog({
      userId: user.id,
      companyName: parsed.data.companyName,
      jobUrl: parsed.data.jobUrl,
      matchScore: parsed.data.matchScore,
      dispatchedVia: parsed.data.dispatchedVia,
      status: parsed.data.status,
      haltReason: parsed.data.haltReason ?? null,
    });
    return { ok: true, data: log };
  } catch (error) {
    return failure(error, "Could not create audit log entry.");
  }
}

export async function evaluateJobEligibilityAction(
  job: DiscoveredJob,
): Promise<ActionResult<JobEligibilityResult>> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: SIGNED_OUT };

  try {
    const preferences = await getCandidatePreferences(user.id);
    if (!preferences) {
      return {
        ok: true,
        data: {
          eligible: false,
          reason: "Candidate calibration preferences have not been set.",
        },
      };
    }

    const result = isJobEligibleForApplication(preferences, job);
    return { ok: true, data: result };
  } catch (error) {
    return failure(error, "Could not evaluate job eligibility.");
  }
}
