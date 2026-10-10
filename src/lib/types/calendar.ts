export const CALENDAR_EVENT_TYPES = ["SCREENING", "INTERVIEW", "NOTE"] as const;

export type CalendarEventType = (typeof CALENDAR_EVENT_TYPES)[number];

/** A user-created calendar entry, always linked to one application. */
export interface CalendarEvent {
  id: string;
  userId: string;
  applicationId: string;
  type: CalendarEventType;
  title: string;
  /** ISO timestamp. For all-day events this is local midnight of the day. */
  startsAt: string;
  allDay: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CalendarEventsResult {
  events: CalendarEvent[];
  /** False until the calendar_events migration has been run. */
  provisioned: boolean;
}
