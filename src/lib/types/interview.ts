/**
 * Practice telemetry types for the Interview Simulator.
 *
 * These are persisted under the `progress` key inside the existing
 * `applications.interview_prep` JSONB column — no schema change required.
 */

export type ConfidenceLevel = "needs_work" | "solid" | "mastered";

export interface QuestionProgress {
  confidence: ConfidenceLevel;
  /** Candidate's personal reminder note for this question. */
  notes?: string;
  /** ISO 8601 timestamp of when the confidence was last set. */
  practicedAt: string;
}

/** Map from question id → practice entry. */
export interface InterviewPrepProgress {
  [questionId: string]: QuestionProgress;
}
