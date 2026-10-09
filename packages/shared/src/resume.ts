/**
 * Master Resume AST.
 *
 * Every entry and bullet carries a stable `id` that never changes once
 * assigned, so a PatchDocument can address nodes without copying them.
 * The AST itself is never edited in place: a change produces a new
 * MasterResumeVersion row (append-only).
 */

/** `YYYY-MM` or `YYYY-MM-DD`. */
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

export interface MasterResume {
  schemaVersion: 1;
  basics: ResumeBasics;
  summary: string;
  experience: ResumeExperience[];
  education: ResumeEducation[];
  projects: ResumeProject[];
  skills: ResumeSkillGroup[];
}

/** One immutable snapshot of the master resume. Rows are only ever inserted. */
export interface MasterResumeVersion {
  id: string;
  userId: string;
  /** Monotonically increasing per user, starting at 1. */
  version: number;
  parentVersionId: string | null;
  createdAt: string;
  resume: MasterResume;
}
