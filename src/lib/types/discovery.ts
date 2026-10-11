/**
 * Domain types for Candidate Calibration, Permission Gates, and Job Matching.
 */

export const WORK_AUTHORIZATIONS = [
  "CITIZEN",
  "PERMANENT_RESIDENT",
  "REQUIRES_SPONSORSHIP",
  "OTHER",
] as const;

export type WorkAuthorization = (typeof WORK_AUTHORIZATIONS)[number];

export const PERMISSION_TIERS = [
  "NOTIFY",
  "STAGE_AND_CONFIRM",
  "AUTONOMOUS",
] as const;

export type PermissionTier = (typeof PERMISSION_TIERS)[number];

export type AuditLogDispatchMethod = "REST_API" | "BROWSER_ASSIST" | "MANUAL";

export type AuditLogStatus = "SUCCESS" | "HALTED_UNKNOWN_QUESTION" | "FAILED";

export interface StandardAnswers {
  gender?: string;
  raceOrEthnicity?: string;
  veteranStatus?: string;
  disabilityStatus?: string;
  [key: string]: string | undefined;
}

export interface CandidatePreferences {
  userId: string;
  targetRoles: string[];
  seniorityLevels: string[];
  locations: string[];
  remoteOnly: boolean;
  minSalaryFloor: number;
  workAuthorization: WorkAuthorization;
  companyBlocklist: string[];
  standardAnswers: StandardAnswers;
  createdAt?: string;
  updatedAt: string;
}

export interface AutoApplyConsent {
  id: string;
  userId: string;
  permissionTier: PermissionTier;
  consentText: string;
  signedAt: string;
  revokedAt: string | null;
}

export interface AutoApplyAuditLog {
  id: string;
  userId: string;
  companyName: string;
  jobUrl: string;
  matchScore: number;
  dispatchedVia: AuditLogDispatchMethod;
  status: AuditLogStatus;
  haltReason: string | null;
  createdAt: string;
}

export interface DiscoveredJob {
  id: string;
  title: string;
  company: string;
  location: string;
  remote: boolean;
  salaryMin?: number;
  salaryMax?: number;
  description: string;
  url: string;
  source?: string;
  postedAt?: string;
}

export interface JobEligibilityResult {
  eligible: boolean;
  reason?: string;
}
