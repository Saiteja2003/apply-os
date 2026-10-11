"use server";

import { z } from "zod";

import type { ActionResult } from "@/lib/action-result";
import { getApplication } from "@/lib/db/applications";
import {
  CalendarNotProvisionedError,
  createCalendarEvent,
  deleteCalendarEvent,
  listCalendarEvents,
  updateCalendarEvent,
} from "@/lib/db/calendar";
import { getSessionUser } from "@/lib/supabase/server";
import {
  CALENDAR_EVENT_TYPES,
  type CalendarEvent,
  type CalendarEventsResult,
} from "@/lib/types/calendar";

const SIGNED_OUT = "You are signed out. Sign in and try again.";
const NOT_PROVISIONED =
  "Calendar events need a database migration. Run supabase/migrations/007_calendar_overhaul.sql in the Supabase SQL editor.";

const validDateString = z.string().refine((val) => !isNaN(Date.parse(val)), {
  message: "Choose a valid date and time.",
});

const newEventSchema = z.object({
  applicationId: z
    .string()
    .uuid("Choose a valid application.")
    .nullish()
    .transform((val) => val || null),
  type: z.enum(CALENDAR_EVENT_TYPES),
  title: z.string().trim().min(1, "Give the event a title.").max(160),
  startsAt: validDateString,
  endsAt: validDateString.nullish().transform((val) => val || null),
  allDay: z.boolean().default(false),
  notes: z
    .string()
    .trim()
    .max(2000, "Notes are too long (2,000 characters max).")
    .nullish()
    .transform((value) => value || null),
});

export type NewCalendarEventInput = z.input<typeof newEventSchema>;

const updateEventSchema = z.object({
  applicationId: z
    .string()
    .uuid("Choose a valid application.")
    .nullish()
    .transform((val) => (val === undefined ? undefined : val || null)),
  type: z.enum(CALENDAR_EVENT_TYPES).optional(),
  title: z.string().trim().min(1, "Give the event a title.").max(160).optional(),
  startsAt: validDateString.optional(),
  endsAt: validDateString.nullish().transform((val) => (val === undefined ? undefined : val || null)),
  allDay: z.boolean().optional(),
  notes: z
    .string()
    .trim()
    .max(2000, "Notes are too long (2,000 characters max).")
    .nullish()
    .transform((val) => (val === undefined ? undefined : val || null)),
});

export type UpdateCalendarEventInput = z.input<typeof updateEventSchema>;

function failure(error: unknown, fallback: string): { ok: false; error: string } {
  if (error instanceof CalendarNotProvisionedError) {
    return { ok: false, error: NOT_PROVISIONED };
  }
  console.error(error);
  return { ok: false, error: error instanceof Error ? error.message : fallback };
}

export async function listCalendarEventsAction(): Promise<
  ActionResult<CalendarEventsResult>
> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: SIGNED_OUT };

  try {
    const events = await listCalendarEvents(user.id);
    return {
      ok: true,
      data: { events, provisioned: true },
    };
  } catch (error) {
    if (error instanceof CalendarNotProvisionedError) {
      return { ok: true, data: { events: [], provisioned: false } };
    }
    return failure(error, "Could not load calendar events.");
  }
}

export async function createCalendarEventAction(
  rawInput: NewCalendarEventInput,
): Promise<ActionResult<CalendarEvent>> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: SIGNED_OUT };

  const parsed = newEventSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid event details." };
  }

  try {
    if (parsed.data.applicationId) {
      const application = await getApplication(user.id, parsed.data.applicationId);
      if (!application) return { ok: false, error: "Application not found." };
    }

    const created = await createCalendarEvent(user.id, {
      applicationId: parsed.data.applicationId,
      type: parsed.data.type,
      title: parsed.data.title,
      startsAt: new Date(parsed.data.startsAt).toISOString(),
      endsAt: parsed.data.endsAt ? new Date(parsed.data.endsAt).toISOString() : null,
      allDay: parsed.data.allDay,
      notes: parsed.data.notes,
    });

    return { ok: true, data: created };
  } catch (error) {
    return failure(error, "Could not save the event.");
  }
}

export async function updateCalendarEventAction(
  eventId: string,
  rawInput: UpdateCalendarEventInput,
): Promise<ActionResult<CalendarEvent>> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: SIGNED_OUT };

  const idCheck = z.string().uuid().safeParse(eventId);
  if (!idCheck.success) return { ok: false, error: "Invalid event id." };

  const parsed = updateEventSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid update details." };
  }

  try {
    if (parsed.data.applicationId) {
      const application = await getApplication(user.id, parsed.data.applicationId);
      if (!application) return { ok: false, error: "Application not found." };
    }

    const updated = await updateCalendarEvent(user.id, idCheck.data, {
      ...(parsed.data.applicationId !== undefined && { applicationId: parsed.data.applicationId }),
      ...(parsed.data.type !== undefined && { type: parsed.data.type }),
      ...(parsed.data.title !== undefined && { title: parsed.data.title }),
      ...(parsed.data.startsAt !== undefined && {
        startsAt: new Date(parsed.data.startsAt).toISOString(),
      }),
      ...(parsed.data.endsAt !== undefined && {
        endsAt: parsed.data.endsAt ? new Date(parsed.data.endsAt).toISOString() : null,
      }),
      ...(parsed.data.allDay !== undefined && { allDay: parsed.data.allDay }),
      ...(parsed.data.notes !== undefined && { notes: parsed.data.notes }),
    });

    return { ok: true, data: updated };
  } catch (error) {
    return failure(error, "Could not update the event.");
  }
}

export async function deleteCalendarEventAction(
  eventId: string,
): Promise<ActionResult<{ id: string }>> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: SIGNED_OUT };

  const idCheck = z.string().uuid().safeParse(eventId);
  if (!idCheck.success) return { ok: false, error: "Invalid event id." };

  try {
    await deleteCalendarEvent(user.id, idCheck.data);
    return { ok: true, data: { id: idCheck.data } };
  } catch (error) {
    return failure(error, "Could not delete the event.");
  }
}
