import { getKeyHintsAction } from "@/app/actions/api-keys";
import { getBillingAction } from "@/app/actions/billing";
import { listEmailInteractionsAction } from "@/app/actions/email";
import { listCalendarEventsAction } from "@/app/actions/calendar";
import {
  getResumeVersionAction,
  listResumeVersionsAction,
} from "@/app/actions/resume";
import type { KeyHints } from "@/lib/db/api-keys";
import {
  toJobApplication,
  toMasterResumeVersion,
  type ApplicationRow,
  type MasterResumeRow,
} from "@/lib/db/mappers";
import { createClient } from "@/lib/supabase/client";
import type { BillingSummary } from "@/lib/types/billing";
import type { CalendarEventsResult } from "@/lib/types/calendar";
import type { EmailInteraction } from "@/lib/types/email";
import type {
  JobApplication,
  MasterResumeVersion,
  MasterResumeVersionSummary,
} from "@/lib/types/resume";

/**
 * Browser-side reads for TanStack Query. Keys include the user id so one
 * account's cached data can never be shown to the next account that signs
 * in on the same browser.
 */

export const queryKeys = {
  applications: (userId: string) => ["applications", userId] as const,
  masterResume: (userId: string) => ["master-resume", userId] as const,
  keyHints: (userId: string) => ["byok-key-hints", userId] as const,
  billing: (userId: string) => ["billing", userId] as const,
  emailInteractions: (userId: string, applicationId: string) =>
    ["email-interactions", userId, applicationId] as const,
  calendarEvents: (userId: string) => ["calendar-events", userId] as const,
  resumeVersions: (userId: string) => ["resume-versions", userId] as const,
  resumeVersion: (userId: string, versionId: string) =>
    ["resume-version", userId, versionId] as const,
};

export async function fetchApplications(): Promise<JobApplication[]> {
  const { data, error } = await createClient()
    .from("applications")
    .select("*")
    .order("created_at", { ascending: false })
    .returns<ApplicationRow[]>();

  if (error) throw new Error(error.message);
  return data.map(toJobApplication);
}

export async function fetchMasterResume(): Promise<MasterResumeVersion | null> {
  const { data, error } = await createClient()
    .from("master_resumes")
    .select("*")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle<MasterResumeRow>();

  if (error) throw new Error(error.message);
  return data ? toMasterResumeVersion(data) : null;
}

export async function fetchKeyHints(): Promise<KeyHints> {
  const result = await getKeyHintsAction();
  if (!result.ok) throw new Error(result.error);
  return result.data;
}

export async function fetchEmailInteractions(
  applicationId: string,
): Promise<EmailInteraction[]> {
  const result = await listEmailInteractionsAction(applicationId);
  if (!result.ok) throw new Error(result.error);
  return result.data;
}

export async function fetchBilling(): Promise<BillingSummary> {
  const result = await getBillingAction();
  if (!result.ok) throw new Error(result.error);
  return result.data;
}

export async function fetchCalendarEvents(): Promise<CalendarEventsResult> {
  const result = await listCalendarEventsAction();
  if (!result.ok) throw new Error(result.error);
  return result.data;
}

export async function fetchResumeVersions(): Promise<MasterResumeVersionSummary[]> {
  const result = await listResumeVersionsAction();
  if (!result.ok) throw new Error(result.error);
  return result.data;
}

export async function fetchResumeVersion(
  versionId: string,
): Promise<MasterResumeVersion> {
  const result = await getResumeVersionAction(versionId);
  if (!result.ok) throw new Error(result.error);
  return result.data;
}
