import type { CalendarEvent } from "@/lib/types/calendar";
import type { JobApplication } from "@/lib/types/resume";

/**
 * Pure date helpers and the projection from applications + events to what
 * the calendar shows. Everything works in the viewer's local time zone.
 */

/** 0 = Sunday, 1 = Monday. */
export const WEEK_STARTS_ON = 1;

/** Business days after submission at which an unanswered application is flagged. */
export const FOLLOW_UP_DAYS = 7;

export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

/** `date` moved forward by whole working days, skipping Saturdays and Sundays. */
export function addBusinessDays(date: Date, days: number): Date {
  const next = new Date(date);
  let remaining = days;
  while (remaining > 0) {
    next.setDate(next.getDate() + 1);
    const weekday = next.getDay();
    if (weekday !== 0 && weekday !== 6) remaining--;
  }
  return next;
}

export function addMonths(date: Date, months: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

/** Local calendar day as `YYYY-MM-DD`. */
export function dayKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function startOfWeek(date: Date): Date {
  const day = startOfDay(date);
  return addDays(day, -((day.getDay() - WEEK_STARTS_ON + 7) % 7));
}

export function weekDays(anchor: Date): Date[] {
  const start = startOfWeek(anchor);
  return Array.from({ length: 7 }, (_, index) => addDays(start, index));
}

/** Whole weeks covering the anchor's month: 28, 35 or 42 days. */
export function monthGrid(anchor: Date): Date[] {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const start = startOfWeek(first);
  const daysInMonth = new Date(
    anchor.getFullYear(),
    anchor.getMonth() + 1,
    0,
  ).getDate();
  const leading = Math.round((first.getTime() - start.getTime()) / 86_400_000);
  const weeks = Math.ceil((leading + daysInMonth) / 7);
  return Array.from({ length: weeks * 7 }, (_, index) => addDays(start, index));
}

export type CalendarItemKind =
  | "saved"
  | "applied"
  | "follow_up"
  | "screening"
  | "interview"
  | "deadline"
  | "offer_expiry"
  | "note";

export interface CalendarItem {
  key: string;
  kind: CalendarItemKind;
  dayKey: string;
  /** Minutes after local midnight, or -1 for items without a time. */
  minutes: number;
  title: string;
  detail: string;
  applicationId: string;
  company: string;
  role: string;
  /** Set for user-created events, which can be deleted. */
  event: CalendarEvent | null;
  /** Follow-ups only: the follow-up date has arrived. */
  due: boolean;
}

const KIND_ORDER: CalendarItemKind[] = [
  "interview",
  "screening",
  "follow_up",
  "deadline",
  "offer_expiry",
  "applied",
  "saved",
  "note",
];

const EVENT_KINDS: Record<CalendarEvent["type"], CalendarItemKind> = {
  INTERVIEW: "interview",
  SCREENING: "screening",
  FOLLOW_UP: "follow_up",
  DEADLINE: "deadline",
  OFFER_EXPIRY: "offer_expiry",
  NOTE: "note",
};

/** Calendar items grouped by local day key, each day sorted for display. */
export function buildCalendarItems(
  applications: JobApplication[],
  events: CalendarEvent[],
  now: Date,
): Map<string, CalendarItem[]> {
  const today = startOfDay(now);
  const items: CalendarItem[] = [];
  const byId = new Map(applications.map((entry) => [entry.id, entry]));

  for (const application of applications) {
    const base = {
      minutes: -1,
      applicationId: application.id,
      company: application.companyName,
      role: application.roleTitle,
      event: null,
      due: false,
    };

    if (application.appliedAt) {
      const appliedOn = startOfDay(new Date(application.appliedAt));
      items.push({
        ...base,
        key: `applied:${application.id}`,
        kind: "applied",
        dayKey: dayKey(appliedOn),
        title: application.companyName,
        detail: application.roleTitle,
      });

      // Still waiting on a reply: flag the follow-up.
      if (application.status === "APPLIED") {
        const followUpOn = addBusinessDays(appliedOn, FOLLOW_UP_DAYS);
        items.push({
          ...base,
          key: `follow-up:${application.id}`,
          kind: "follow_up",
          dayKey: dayKey(followUpOn),
          title: `Follow up with ${application.companyName}`,
          detail: `${FOLLOW_UP_DAYS} business days since submission`,
          due: followUpOn.getTime() <= today.getTime(),
        });
      }
    } else {
      items.push({
        ...base,
        key: `saved:${application.id}`,
        kind: "saved",
        dayKey: dayKey(new Date(application.createdAt)),
        title: application.companyName,
        detail: application.roleTitle,
      });
    }
  }

  for (const event of events) {
    const application = event.applicationId ? byId.get(event.applicationId) : null;
    const startsAt = new Date(event.startsAt);
    items.push({
      key: `event:${event.id}`,
      kind: EVENT_KINDS[event.type],
      dayKey: dayKey(startsAt),
      minutes: event.allDay
        ? -1
        : startsAt.getHours() * 60 + startsAt.getMinutes(),
      title: event.title,
      detail: application ? application.companyName : "Milestone",
      applicationId: application ? application.id : (event.applicationId ?? ""),
      company: application ? application.companyName : "General",
      role: application ? application.roleTitle : "",
      event,
      due: false,
    });
  }

  const byDay = new Map<string, CalendarItem[]>();
  for (const item of items) {
    const day = byDay.get(item.dayKey);
    if (day) day.push(item);
    else byDay.set(item.dayKey, [item]);
  }
  for (const day of byDay.values()) {
    day.sort(
      (a, b) =>
        a.minutes - b.minutes ||
        KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) ||
        a.title.localeCompare(b.title),
    );
  }
  return byDay;
}
