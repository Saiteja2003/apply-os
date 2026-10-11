/**
 * Core domain types.
 *
 * These are the camelCase shapes used throughout the app. The JSONB columns
 * in `supabase/schema.sql` (`master_resumes.resume`, `applications.patch_document`,
 * `applications.interview_prep`, `applications.ats_keywords`) store these
 * objects verbatim; row-level columns are snake_case and mapped at the data
 * access layer.
 */

// ---------------------------------------------------------------------------
// Master resume (immutable)
// ---------------------------------------------------------------------------

/** `YYYY`, `YYYY-MM` or `YYYY-MM-DD`. */
export type ResumeDate = string;

export interface ResumeLink {
  id: string;
  label: string;
  url: string;
}

export interface ResumeBasics {
  name: string;
  headline: string | null;
  email: string;
  phone: string | null;
  location: string | null;
  links: ResumeLink[];
}

export interface ResumeBullet {
  id: string;
  text: string;
}

export interface ResumeExperience {
  id: string;
  company: string;
  title: string;
  location: string | null;
  startDate: ResumeDate;
  /** `null` means current role. */
  endDate: ResumeDate | null;
  bullets: ResumeBullet[];
}

export interface ResumeEducation {
  id: string;
  institution: string;
  degree: string;
  field: string | null;
  startDate: ResumeDate | null;
  endDate: ResumeDate | null;
  bullets: ResumeBullet[];
}

export interface ResumeProject {
  id: string;
  name: string;
  url: string | null;
  technologies: string[];
  bullets: ResumeBullet[];
}

export interface ResumeSkillGroup {
  id: string;
  category: string;
  skills: string[];
}

/** One item in a user-defined section: a certification, a publication... */
export interface ResumeCustomEntry {
  id: string;
  title: string;
  /** Issuer, venue, proficiency level and the like. */
  subtitle: string | null;
  /** Free text as the resume states it, e.g. "2023" or "Mar 2021 - Present". */
  date: string | null;
  bullets: ResumeBullet[];
}

/** A section the user added, e.g. "Certifications" or "Languages". */
export interface ResumeCustomSection {
  id: string;
  title: string;
  entries: ResumeCustomEntry[];
}

/**
 * The master resume AST. Every job, project, education entry and bullet
 * carries a stable `id` that never changes once assigned, so a PatchDocument
 * can address nodes without copying them.
 *
 * It is never edited in place: a change inserts a new MasterResumeVersion.
 */
export interface MasterResume {
  schemaVersion: 1;
  basics: ResumeBasics;
  summary: string;
  experience: ResumeExperience[];
  education: ResumeEducation[];
  projects: ResumeProject[];
  skills: ResumeSkillGroup[];
  customSections: ResumeCustomSection[];
}

/** One immutable row of `master_resumes`. Rows are only ever inserted. */
export interface MasterResumeVersion {
  id: string;
  userId: string;
  /** Monotonically increasing per user, starting at 1. */
  version: number;
  parentId: string | null;
  createdAt: string;
  resume: MasterResume;
}

/** A version without its content, for listing history. */
export interface MasterResumeVersionSummary {
  id: string;
  version: number;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Delta patch
// ---------------------------------------------------------------------------

export interface AdaptedBullet {
  /** Id of an existing bullet in the referenced master resume. */
  id: string;
  /** ATS-adapted phrasing of that bullet. */
  text: string;
}

export interface ExperienceOverride {
  /** Id of an existing experience entry in the referenced master resume. */
  experienceId: string;
  /** Bullets to surface first, in display order. The rest keep master order. */
  promotedBulletIds: string[];
  adaptedBullets: AdaptedBullet[];
}

export interface PatchModifications {
  /** Customised summary, or `null` to keep the master summary. */
  summary: string | null;
  highlightedSkills: string[];
  experienceOverrides: ExperienceOverride[];
}

/**
 * Output of the tailoring pipeline. A patch can only re-order and re-word
 * nodes that already exist in the master resume it references: it has no
 * way to express a new job, date or bullet.
 */
export interface PatchDocument {
  /** `master_resumes.id` this patch was computed against. */
  masterResumeId: string;
  modifications: PatchModifications;
}

// ---------------------------------------------------------------------------
// Interview prep
// ---------------------------------------------------------------------------

export type SkillGapSeverity = "ADJACENT" | "CRITICAL";

export interface SkillGap {
  skill: string;
  /** ADJACENT: related experience exists. CRITICAL: nothing comparable. */
  severity: SkillGapSeverity;
  note: string;
}

export interface InterviewQuestion {
  id: string;
  question: string;
  /** Why this role is likely to ask it. */
  rationale: string;
  /** Points to make in the answer, drawn only from the master resume. */
  talkingPoints: string[];
}

export interface ReviewTopic {
  topic: string;
  /** Why it is worth reviewing before the first round. */
  reason: string;
}

export interface InterviewPrep {
  generatedByModel: string;
  generatedAt: string;
  /** Seniority the job description is targeting, e.g. "Senior". */
  targetSeniority: string | null;
  matchedSkills: string[];
  skillGaps: SkillGap[];
  // The three fields below are the interview briefing. They stay empty
  // until it has been generated (src/lib/tailoring/prep.ts).
  technicalQuestions: InterviewQuestion[];
  behavioralQuestions: InterviewQuestion[];
  reviewTopics: ReviewTopic[];
  /**
   * Per-question practice telemetry — persisted inside this same JSONB blob.
   * Absent on rows generated before the studio was introduced.
   */
  progress?: import("@/lib/types/interview").InterviewPrepProgress;
}

// ---------------------------------------------------------------------------
// Application assets
// ---------------------------------------------------------------------------

export interface CoverLetter {
  /** The full letter body: paragraphs separated by blank lines. */
  content: string;
  /** The opening line, tied to this company and role. */
  tailoredHook: string;
  /** The closing ask. */
  callToAction: string;
}

export interface RecruiterOutreach {
  subject: string;
  /** Under 100 words, for LinkedIn InMail or a cold email. */
  inmailBody: string;
  /** One line, e.g. for a connection request note. */
  shortHook: string;
}

// ---------------------------------------------------------------------------
// Job application
// ---------------------------------------------------------------------------

export const APPLICATION_STATUSES = [
  "SAVED",
  "APPLIED",
  "INTERVIEWING",
  "REJECTED",
  "OFFER",
] as const;

export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export interface AtsKeywords {
  matched: string[];
  missing: string[];
}

export interface JobApplication {
  id: string;
  userId: string;
  companyName: string;
  roleTitle: string;
  location: string | null;
  /** LinkedIn, Indeed, Greenhouse, etc. */
  jobBoardSource: string | null;
  jobUrl: string | null;
  jobDescription: string;
  status: ApplicationStatus;
  /** `null` until the application is actually submitted. */
  appliedAt: string | null;
  /** ATS keyword match, 0-100. `null` until the match engine has run. */
  matchScore: number | null;
  atsKeywords: AtsKeywords;
  /** `null` until a tailored resume has been generated. */
  patchDocument: PatchDocument | null;
  /** Model registry id that produced `patchDocument`. */
  tailoredByModel: string | null;
  interviewPrep: InterviewPrep | null;
  /** `null` until tailoring has produced one. */
  coverLetter: CoverLetter | null;
  recruiterOutreach: RecruiterOutreach | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}
