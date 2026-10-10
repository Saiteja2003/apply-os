import type { CalendarEvent, CalendarEventType } from "@/lib/types/calendar";
import type {
  ApplicationStatus,
  AtsKeywords,
  CoverLetter,
  InterviewPrep,
  JobApplication,
  MasterResume,
  MasterResumeVersion,
  PatchDocument,
  RecruiterOutreach,
} from "@/lib/types/resume";

/**
 * Row shapes as stored in Postgres (snake_case) and their mapping to the
 * camelCase domain types. Pure, so both server and browser code can use it.
 */

export interface MasterResumeRow {
  id: string;
  user_id: string;
  version: number;
  parent_id: string | null;
  resume: MasterResume;
  created_at: string;
}

export interface ApplicationRow {
  id: string;
  user_id: string;
  company_name: string;
  role_title: string;
  location: string | null;
  job_board_source: string | null;
  job_url: string | null;
  job_description: string;
  status: ApplicationStatus;
  applied_at: string | null;
  match_score: number | null;
  ats_keywords: AtsKeywords;
  patch_document: PatchDocument | null;
  tailored_by_model: string | null;
  interview_prep: InterviewPrep | null;
  // Absent until migration 003 has been run.
  cover_letter?: CoverLetterJson | null;
  recruiter_outreach?: RecruiterOutreachJson | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/** The cover letter as stored in `applications.cover_letter`. */
export interface CoverLetterJson {
  content: string;
  tailored_hook: string;
  call_to_action: string;
}

/** The outreach message as stored in `applications.recruiter_outreach`. */
export interface RecruiterOutreachJson {
  subject: string;
  inmail_body: string;
  short_hook: string;
}

export const toCoverLetterJson = (letter: CoverLetter): CoverLetterJson => ({
  content: letter.content,
  tailored_hook: letter.tailoredHook,
  call_to_action: letter.callToAction,
});

export const toRecruiterOutreachJson = (
  outreach: RecruiterOutreach,
): RecruiterOutreachJson => ({
  subject: outreach.subject,
  inmail_body: outreach.inmailBody,
  short_hook: outreach.shortHook,
});

export function toMasterResumeVersion(row: MasterResumeRow): MasterResumeVersion {
  return {
    id: row.id,
    userId: row.user_id,
    version: row.version,
    parentId: row.parent_id,
    createdAt: row.created_at,
    // Versions saved before custom sections existed do not have the field.
    resume: { ...row.resume, customSections: row.resume.customSections ?? [] },
  };
}

export interface CalendarEventRow {
  id: string;
  user_id: string;
  application_id: string;
  event_type: CalendarEventType;
  title: string;
  starts_at: string;
  all_day: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export function toCalendarEvent(row: CalendarEventRow): CalendarEvent {
  return {
    id: row.id,
    userId: row.user_id,
    applicationId: row.application_id,
    type: row.event_type,
    title: row.title,
    startsAt: row.starts_at,
    allDay: row.all_day,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Fills in briefing fields missing from rows saved before they existed. */
function normalizePrep(prep: InterviewPrep | null): InterviewPrep | null {
  if (!prep) return null;
  const questions = (list: InterviewPrep["technicalQuestions"] | undefined) =>
    (list ?? []).map((question) => ({
      ...question,
      talkingPoints: question.talkingPoints ?? [],
    }));
  return {
    ...prep,
    technicalQuestions: questions(prep.technicalQuestions),
    behavioralQuestions: questions(prep.behavioralQuestions),
    reviewTopics: prep.reviewTopics ?? [],
  };
}

export function toJobApplication(row: ApplicationRow): JobApplication {
  return {
    id: row.id,
    userId: row.user_id,
    companyName: row.company_name,
    roleTitle: row.role_title,
    location: row.location,
    jobBoardSource: row.job_board_source,
    jobUrl: row.job_url,
    jobDescription: row.job_description,
    status: row.status,
    appliedAt: row.applied_at,
    matchScore: row.match_score,
    atsKeywords: row.ats_keywords,
    patchDocument: row.patch_document,
    tailoredByModel: row.tailored_by_model,
    interviewPrep: normalizePrep(row.interview_prep),
    coverLetter: row.cover_letter
      ? {
          content: row.cover_letter.content ?? "",
          tailoredHook: row.cover_letter.tailored_hook ?? "",
          callToAction: row.cover_letter.call_to_action ?? "",
        }
      : null,
    recruiterOutreach: row.recruiter_outreach
      ? {
          subject: row.recruiter_outreach.subject ?? "",
          inmailBody: row.recruiter_outreach.inmail_body ?? "",
          shortHook: row.recruiter_outreach.short_hook ?? "",
        }
      : null,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
