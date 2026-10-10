import "server-only";

import { createClient } from "@/lib/supabase/server";
import type {
  ApplicationStatus,
  AtsKeywords,
  CoverLetter,
  InterviewPrep,
  JobApplication,
  PatchDocument,
  RecruiterOutreach,
} from "@/lib/types/resume";

import {
  toCoverLetterJson,
  toJobApplication,
  toRecruiterOutreachJson,
  type ApplicationRow,
} from "./mappers";

/** The asset columns do not exist yet (migration 003 not run). */
export class AssetsNotProvisionedError extends Error {
  constructor() {
    super("The cover_letter and recruiter_outreach columns have not been created.");
    this.name = "AssetsNotProvisionedError";
  }
}

// Postgres "undefined_column", and PostgREST's schema-cache miss for the same.
const MISSING_COLUMN_CODES = new Set(["42703", "PGRST204"]);

// All queries run as the signed-in user, so RLS already limits them to that
// user's rows. The explicit user_id filters keep the intent visible.

export async function listApplications(userId: string): Promise<JobApplication[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("applications")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .returns<ApplicationRow[]>();

  if (error) throw new Error(`Could not load applications: ${error.message}`);
  return data.map(toJobApplication);
}

export async function getApplication(
  userId: string,
  applicationId: string,
): Promise<JobApplication | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("applications")
    .select("*")
    .eq("user_id", userId)
    .eq("id", applicationId)
    .maybeSingle<ApplicationRow>();

  if (error) throw new Error(`Could not load application: ${error.message}`);
  return data ? toJobApplication(data) : null;
}

export interface NewApplication {
  companyName: string;
  roleTitle: string;
  location: string | null;
  jobUrl: string | null;
  jobDescription: string;
  /** True when the application has already been submitted. */
  applied?: boolean;
}

export async function createApplication(
  userId: string,
  input: NewApplication,
): Promise<JobApplication> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("applications")
    .insert({
      user_id: userId,
      company_name: input.companyName,
      role_title: input.roleTitle,
      location: input.location,
      job_url: input.jobUrl,
      job_description: input.jobDescription,
      status: (input.applied ? "APPLIED" : "SAVED") satisfies ApplicationStatus,
      applied_at: input.applied ? new Date().toISOString() : null,
    })
    .select("*")
    .single<ApplicationRow>();

  if (error) throw new Error(`Could not save application: ${error.message}`);
  return toJobApplication(data);
}

export async function updateApplicationStatus(
  userId: string,
  applicationId: string,
  status: ApplicationStatus,
): Promise<JobApplication> {
  const current = await getApplication(userId, applicationId);
  if (!current) throw new Error("Application not found.");

  // The first move out of Saved is when the application was submitted.
  const appliedAt =
    current.appliedAt ?? (status === "SAVED" ? null : new Date().toISOString());

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("applications")
    .update({ status, applied_at: appliedAt })
    .eq("user_id", userId)
    .eq("id", applicationId)
    .select("*")
    .single<ApplicationRow>();

  if (error) throw new Error(`Could not update status: ${error.message}`);
  return toJobApplication(data);
}

export async function saveInterviewPrep(
  userId: string,
  applicationId: string,
  interviewPrep: InterviewPrep,
): Promise<JobApplication> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("applications")
    .update({ interview_prep: interviewPrep })
    .eq("user_id", userId)
    .eq("id", applicationId)
    .select("*")
    .single<ApplicationRow>();

  if (error) throw new Error(`Could not save interview prep: ${error.message}`);
  return toJobApplication(data);
}

export interface TailoringResult {
  matchScore: number | null;
  atsKeywords: AtsKeywords;
  patchDocument: PatchDocument;
  tailoredByModel: string;
  interviewPrep: InterviewPrep;
  coverLetter: CoverLetter | null;
  recruiterOutreach: RecruiterOutreach | null;
}

export async function saveTailoringResult(
  userId: string,
  applicationId: string,
  result: TailoringResult,
): Promise<JobApplication> {
  const supabase = await createClient();
  const core = {
    match_score: result.matchScore,
    ats_keywords: result.atsKeywords,
    patch_document: result.patchDocument,
    tailored_by_model: result.tailoredByModel,
    interview_prep: result.interviewPrep,
  };
  const assets = {
    cover_letter: result.coverLetter && toCoverLetterJson(result.coverLetter),
    recruiter_outreach:
      result.recruiterOutreach && toRecruiterOutreachJson(result.recruiterOutreach),
  };

  const save = (values: Record<string, unknown>) =>
    supabase
      .from("applications")
      .update(values)
      .eq("user_id", userId)
      .eq("id", applicationId)
      .select("*")
      .single<ApplicationRow>();

  let { data, error } = await save({ ...core, ...assets });
  // Before migration 003 the asset columns are missing. The resume patch is
  // still worth saving, so fall back to the columns that do exist.
  if (error?.code && MISSING_COLUMN_CODES.has(error.code)) {
    ({ data, error } = await save(core));
  }

  if (error || !data) {
    throw new Error(`Could not save tailored resume: ${error?.message ?? "no row"}`);
  }
  return toJobApplication(data);
}

/** Saves the user's edits to the cover letter text. */
export async function saveCoverLetter(
  userId: string,
  applicationId: string,
  coverLetter: CoverLetter,
): Promise<JobApplication> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("applications")
    .update({ cover_letter: toCoverLetterJson(coverLetter) })
    .eq("user_id", userId)
    .eq("id", applicationId)
    .select("*")
    .single<ApplicationRow>();

  if (error?.code && MISSING_COLUMN_CODES.has(error.code)) {
    throw new AssetsNotProvisionedError();
  }
  if (error) throw new Error(`Could not save the cover letter: ${error.message}`);
  return toJobApplication(data);
}
