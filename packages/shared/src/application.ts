import type { PatchDocument } from "./patch";

export const APPLICATION_STATUSES = [
  "SAVED",
  "APPLIED",
  "INTERVIEWING",
  "REJECTED",
  "OFFER",
] as const;

export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export interface JobApplication {
  id: string;
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
  /** ATS keyword match, 0-100. `null` until a variant has been generated. */
  matchScore: number | null;
  notes: string | null;
  createdAt: string;
}

export interface ResumeVariant {
  id: string;
  applicationId: string;
  /** ModelDescriptor.id of the model that produced the patch. */
  modelUsed: string;
  patch: PatchDocument;
  renderedPdfUrl: string | null;
  createdAt: string;
}

export interface AtsKeywords {
  matched: string[];
  missing: string[];
}

export interface ApplicationDetail extends JobApplication {
  variant: ResumeVariant | null;
  atsKeywords: AtsKeywords;
}
