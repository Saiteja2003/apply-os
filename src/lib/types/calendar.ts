import type { InterviewPrep } from "@/lib/types/resume";

export const CALENDAR_EVENT_TYPES = [
  "INTERVIEW",
  "SCREENING",
  "FOLLOW_UP",
  "DEADLINE",
  "OFFER_EXPIRY",
  "NOTE",
] as const;

export type CalendarEventType = (typeof CALENDAR_EVENT_TYPES)[number];

export interface CalendarEventApplication {
  id: string;
  companyName: string;
  roleTitle: string;
  status: string;
  interviewPrep?: InterviewPrep | null;
}

/** A calendar entry, linked optionally to an application. */
export interface CalendarEvent {
  id: string;
  userId: string;
  applicationId: string | null;
  type: CalendarEventType;
  title: string;
  /** ISO timestamp. For all-day events this is local midnight of the day. */
  startsAt: string;
  /** Optional ISO timestamp for multi-hour or multi-day intervals. */
  endsAt?: string | null;
  allDay: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  /** Joined application metadata (company name, role, status, prep AST). */
  application?: CalendarEventApplication | null;
}

export interface CalendarEventsResult {
  events: CalendarEvent[];
  /** False until the calendar_events migration has been run. */
  provisioned: boolean;
}
