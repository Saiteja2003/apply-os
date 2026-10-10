import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { CalendarEvent, CalendarEventType } from "@/lib/types/calendar";

import { toCalendarEvent, type CalendarEventRow } from "./mappers";

/** The calendar_events table does not exist yet (migration 002 not run). */
export class CalendarNotProvisionedError extends Error {
  constructor() {
    super("The calendar_events table has not been created.");
    this.name = "CalendarNotProvisionedError";
  }
}

// Postgres "undefined_table", and PostgREST's schema-cache miss for the same.
const MISSING_TABLE_CODES = new Set(["42P01", "PGRST205"]);

function failure(
  action: string,
  error: { code?: string; message: string },
): Error {
  if (error.code && MISSING_TABLE_CODES.has(error.code)) {
    return new CalendarNotProvisionedError();
  }
  return new Error(`Could not ${action}: ${error.message}`);
}

// Queries run as the signed-in user, so RLS limits them to that user's rows.

export async function listCalendarEvents(userId: string): Promise<CalendarEvent[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("calendar_events")
    .select("*")
    .eq("user_id", userId)
    .order("starts_at", { ascending: true })
    .returns<CalendarEventRow[]>();

  if (error) throw failure("load calendar events", error);
  return data.map(toCalendarEvent);
}

export interface NewCalendarEvent {
  applicationId: string;
  type: CalendarEventType;
  title: string;
  startsAt: string;
  allDay: boolean;
  notes: string | null;
}

export async function createCalendarEvent(
  userId: string,
  input: NewCalendarEvent,
): Promise<CalendarEvent> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("calendar_events")
    .insert({
      user_id: userId,
      application_id: input.applicationId,
      event_type: input.type,
      title: input.title,
      starts_at: input.startsAt,
      all_day: input.allDay,
      notes: input.notes,
    })
    .select("*")
    .single<CalendarEventRow>();

  if (error) throw failure("save the event", error);
  return toCalendarEvent(data);
}

export async function deleteCalendarEvent(
  userId: string,
  eventId: string,
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("calendar_events")
    .delete()
    .eq("user_id", userId)
    .eq("id", eventId);

  if (error) throw failure("delete the event", error);
}
