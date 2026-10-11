/**
 * Types for ApplyOS In-Page Form Autofill.
 */

export interface CandidateProfile {
  fullName: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  location: string;
  linkedInUrl: string;
  gitHubUrl: string;
  portfolioUrl: string;
  workAuthorization: "CITIZEN" | "PERMANENT_RESIDENT" | "REQUIRES_SPONSORSHIP" | "OTHER";
  requiresSponsorship: boolean;
  legallyAuthorized: boolean;
  eeo?: {
    gender?: string;
    race?: string;
    veteran?: string;
    disability?: string;
  };
  standardAnswers?: Record<string, string | boolean>;
}

export type PortalType = "greenhouse" | "lever" | "ashby" | "linkedin" | "generic";

export interface AutofillResult {
  portal: PortalType;
  filledCount: number;
  unhandledFields: string[];
}
