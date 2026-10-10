"use server";

import { z } from "zod";

import type { ActionResult } from "@/lib/action-result";
import { getApplication } from "@/lib/db/applications";
import {
  CalendarNotProvisionedError,
  createCalendarEvent,
  deleteCalendarEvent,
  listCalendarEvents,
} from "@/lib/db/calendar-events";
import { getSessionUser } from "@/lib/supabase/server";
import {
  CALENDAR_EVENT_TYPES,
  type CalendarEvent,
  type CalendarEventsResult,
} from "@/lib/types/calendar";

const SIGNED_OUT = "You are signed out. Sign in and try again.";
const NOT_PROVISIONED =
  "Calendar events need a one-time database migration. Run supabase/migrations/002_api_key_policies_and_calendar_events.sql in the Supabase SQL editor.";

const newEventSchema = z.object({
  applicationId: z.uuid("Choose an application."),
  type: z.enum(CALENDAR_EVENT_TYPES),
  title: z.string().trim().min(1, "Give the event a title.").max(160),
  startsAt: z.iso.datetime("Choose a valid date."),
  allDay: z.boolean(),
  notes: z
    .string()
    .trim()
    .max(2000, "Notes are too long (2,000 characters max).")
    .transform((value) => value || null),
});

export type NewCalendarEventInput = z.input<typeof newEventSchema>;

function failure(error: unknown, fallback: string): { ok: false; error: string } {
  if (error instanceof CalendarNotProvisionedError) {
    return { ok: false, error: NOT_PROVISIONED };
  }
  console.error(error);
  return { ok: false, error: fallback };
}

export async function listCalendarEventsAction(): Promise<
  ActionResult<CalendarEventsResult>
> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: SIGNED_OUT };

  try {
    return {
      ok: true,
      data: { events: await listCalendarEvents(user.id), provisioned: true },
    };
  } catch (error) {
    // Before the migration the calendar still works from application dates.
    if (error instanceof CalendarNotProvisionedError) {
      return { ok: true, data: { events: [], provisioned: false } };
    }
    return failure(error, "Could not load calendar events.");
  }
}

export async function createCalendarEventAction(
  input: NewCalendarEventInput,
): Promise<ActionResult<CalendarEvent>> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: SIGNED_OUT };

  const parsed = newEventSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  try {
    const application = await getApplication(user.id, parsed.data.applicationId);
    if (!application) return { ok: false, error: "Application not found." };

    return { ok: true, data: await createCalendarEvent(user.id, parsed.data) };
  } catch (error) {
    return failure(error, "Could not save the event.");
  }
}

export async function deleteCalendarEventAction(
  eventId: string,
): Promise<ActionResult<{ id: string }>> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: SIGNED_OUT };

  const id = z.uuid().safeParse(eventId);
  if (!id.success) return { ok: false, error: "Unknown event." };

  try {
    await deleteCalendarEvent(user.id, id.data);
    return { ok: true, data: { id: id.data } };
  } catch (error) {
    return failure(error, "Could not delete the event.");
  }
}
