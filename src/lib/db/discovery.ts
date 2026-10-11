import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import type {
  AutoApplyAuditLog,
  AutoApplyConsent,
  CandidatePreferences,
  PermissionTier,
  WorkAuthorization,
} from "@/lib/types/discovery";

interface CandidatePreferencesRow {
  user_id: string;
  target_roles: string[];
  seniority_levels: string[];
  locations: string[];
  remote_only: boolean;
  min_salary_floor: number;
  work_authorization: WorkAuthorization;
  company_blocklist: string[];
  standard_answers: Record<string, string>;
  created_at: string;
  updated_at: string;
}

interface AutoApplyConsentRow {
  id: string;
  user_id: string;
  permission_tier: PermissionTier;
  consent_text: string;
  signed_at: string;
  revoked_at: string | null;
}

interface AutoApplyAuditLogRow {
  id: string;
  user_id: string;
  company_name: string;
  job_url: string;
  match_score: number;
  dispatched_via: AutoApplyAuditLog["dispatchedVia"];
  status: AutoApplyAuditLog["status"];
  halt_reason: string | null;
  created_at: string;
}

function toCandidatePreferences(row: CandidatePreferencesRow): CandidatePreferences {
  return {
    userId: row.user_id,
    targetRoles: row.target_roles ?? [],
    seniorityLevels: row.seniority_levels ?? [],
    locations: row.locations ?? [],
    remoteOnly: row.remote_only,
    minSalaryFloor: row.min_salary_floor ?? 0,
    workAuthorization: row.work_authorization,
    companyBlocklist: row.company_blocklist ?? [],
    standardAnswers: row.standard_answers ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getCandidatePreferences(
  userId: string,
): Promise<CandidatePreferences | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("candidate_preferences")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle<CandidatePreferencesRow>();

  if (error) {
    throw new Error(`Could not load candidate preferences: ${error.message}`);
  }

  return data ? toCandidatePreferences(data) : null;
}

export async function saveCandidatePreferences(
  userId: string,
  input: {
    targetRoles?: string[];
    seniorityLevels?: string[];
    locations?: string[];
    remoteOnly?: boolean;
    minSalaryFloor?: number;
    workAuthorization?: WorkAuthorization;
    companyBlocklist?: string[];
    standardAnswers?: Record<string, string>;
  },
): Promise<CandidatePreferences> {
  const supabase = await createClient();

  const payload: Partial<CandidatePreferencesRow> = {
    user_id: userId,
    ...(input.targetRoles !== undefined && { target_roles: input.targetRoles }),
    ...(input.seniorityLevels !== undefined && { seniority_levels: input.seniorityLevels }),
    ...(input.locations !== undefined && { locations: input.locations }),
    ...(input.remoteOnly !== undefined && { remote_only: input.remoteOnly }),
    ...(input.minSalaryFloor !== undefined && { min_salary_floor: input.minSalaryFloor }),
    ...(input.workAuthorization !== undefined && { work_authorization: input.workAuthorization }),
    ...(input.companyBlocklist !== undefined && { company_blocklist: input.companyBlocklist }),
    ...(input.standardAnswers !== undefined && { standard_answers: input.standardAnswers }),
  };

  const { data, error } = await supabase
    .from("candidate_preferences")
    .upsert(payload, { onConflict: "user_id" })
    .select("*")
    .single<CandidatePreferencesRow>();

  if (error) {
    throw new Error(`Could not save candidate preferences: ${error.message}`);
  }

  return toCandidatePreferences(data);
}

export async function getLatestAutoApplyConsent(
  userId: string,
): Promise<AutoApplyConsent | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("auto_apply_consent")
    .select("*")
    .eq("user_id", userId)
    .is("revoked_at", null)
    .order("signed_at", { ascending: false })
    .limit(1)
    .maybeSingle<AutoApplyConsentRow>();

  if (error) {
    throw new Error(`Could not load consent record: ${error.message}`);
  }

  if (!data) return null;

  return {
    id: data.id,
    userId: data.user_id,
    permissionTier: data.permission_tier,
    consentText: data.consent_text,
    signedAt: data.signed_at,
    revokedAt: data.revoked_at,
  };
}

export async function recordAutoApplyConsent(
  userId: string,
  permissionTier: PermissionTier,
  consentText: string,
): Promise<AutoApplyConsent> {
  const supabase = await createClient();

  // Revoke any previous unrevoked consents first
  await supabase
    .from("auto_apply_consent")
    .update({ revoked_at: new Date().toISOString() })
    .eq("user_id", userId)
    .is("revoked_at", null);

  const { data, error } = await supabase
    .from("auto_apply_consent")
    .insert({
      user_id: userId,
      permission_tier: permissionTier,
      consent_text: consentText,
    })
    .select("*")
    .single<AutoApplyConsentRow>();

  if (error) {
    throw new Error(`Could not record consent: ${error.message}`);
  }

  return {
    id: data.id,
    userId: data.user_id,
    permissionTier: data.permission_tier,
    consentText: data.consent_text,
    signedAt: data.signed_at,
    revokedAt: data.revoked_at,
  };
}

export async function getAutoApplyAuditLogs(
  userId: string,
  limit = 20,
): Promise<AutoApplyAuditLog[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("auto_apply_audit_log")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit)
    .returns<AutoApplyAuditLogRow[]>();

  if (error) {
    throw new Error(`Could not load audit logs: ${error.message}`);
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    userId: row.user_id,
    companyName: row.company_name,
    jobUrl: row.job_url,
    matchScore: row.match_score,
    dispatchedVia: row.dispatched_via,
    status: row.status,
    haltReason: row.halt_reason,
    createdAt: row.created_at,
  }));
}

export async function createAutoApplyAuditLog(
  entry: Omit<AutoApplyAuditLog, "id" | "createdAt">,
): Promise<AutoApplyAuditLog> {
  const client = getAdminClient() ?? (await createClient());
  const { data, error } = await client
    .from("auto_apply_audit_log")
    .insert({
      user_id: entry.userId,
      company_name: entry.companyName,
      job_url: entry.jobUrl,
      match_score: entry.matchScore,
      dispatched_via: entry.dispatchedVia,
      status: entry.status,
      halt_reason: entry.haltReason,
    })
    .select("*")
    .single<AutoApplyAuditLogRow>();

  if (error) {
    throw new Error(`Could not create audit log: ${error.message}`);
  }

  return {
    id: data.id,
    userId: data.user_id,
    companyName: data.company_name,
    jobUrl: data.job_url,
    matchScore: data.match_score,
    dispatchedVia: data.dispatched_via,
    status: data.status,
    haltReason: data.halt_reason,
    createdAt: data.created_at,
  };
}
