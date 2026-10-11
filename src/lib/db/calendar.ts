import "server-only";

import { createClient } from "@/lib/supabase/server";
import type {
  CalendarEvent,
  CalendarEventApplication,
  CalendarEventType,
} from "@/lib/types/calendar";
import type { InterviewPrep } from "@/lib/types/resume";

/** The calendar_events table does not exist yet (migration 002/007 not run). */
export class CalendarNotProvisionedError extends Error {
  constructor() {
    super("The calendar_events table has not been created.");
    this.name = "CalendarNotProvisionedError";
  }
}

// Postgres "undefined_table", and PostgREST's schema-cache miss for the same.
const MISSING_TABLE_CODES = new Set(["42P01", "PGRST205"]);

function failure(action: string, error: { code?: string; message: string }): Error {
  if (error.code && MISSING_TABLE_CODES.has(error.code)) {
    return new CalendarNotProvisionedError();
  }
  return new Error(`Could not ${action}: ${error.message}`);
}

interface RawCalendarEventRow {
  id: string;
  user_id: string;
  application_id: string | null;
  event_type: CalendarEventType;
  title: string;
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
  application?: {
    id: string;
    company_name: string;
    role_title: string;
    status: string;
    interview_prep?: InterviewPrep | null;
  } | null;
}

function mapCalendarRow(row: RawCalendarEventRow): CalendarEvent {
  const app = row.application
    ? {
        id: row.application.id,
        companyName: row.application.company_name,
        roleTitle: row.application.role_title,
        status: row.application.status,
        interviewPrep: row.application.interview_prep ?? null,
      }
    : null;

  return {
    id: row.id,
    userId: row.user_id,
    applicationId: row.application_id ?? null,
    type: row.event_type,
    title: row.title,
    startsAt: row.starts_at,
    endsAt: row.ends_at ?? null,
    allDay: row.all_day,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    application: app,
  };
}

export async function listCalendarEvents(userId: string): Promise<CalendarEvent[]> {
  const supabase = await createClient();

  // Attempt foreign-key join on application
  const { data, error } = await supabase
    .from("calendar_events")
    .select(`
      *,
      application:applications (
        id,
        company_name,
        role_title,
        status,
        interview_prep
      )
    `)
    .eq("user_id", userId)
    .order("starts_at", { ascending: true })
    .returns<RawCalendarEventRow[]>();

  if (error) {
    if (MISSING_TABLE_CODES.has(error.code ?? "")) {
      throw new CalendarNotProvisionedError();
    }

    // Fallback: fetch without relational embed if schema cache isn't refreshed
    const fallback = await supabase
      .from("calendar_events")
      .select("*")
      .eq("user_id", userId)
      .order("starts_at", { ascending: true })
      .returns<RawCalendarEventRow[]>();

    if (fallback.error) {
      throw failure("load calendar events", fallback.error);
    }

    const events = fallback.data ?? [];
    const appIds = [
      ...new Set(
        events
          .map((e) => e.application_id)
          .filter((id): id is string => Boolean(id)),
      ),
    ];

    if (appIds.length === 0) {
      return events.map(mapCalendarRow);
    }

    const { data: apps } = await supabase
      .from("applications")
      .select("id, company_name, role_title, status, interview_prep")
      .in("id", appIds);

    const appMap = new Map((apps ?? []).map((a) => [a.id, a]));

    return events.map((row) => ({
      ...mapCalendarRow(row),
      application: row.application_id && appMap.has(row.application_id)
        ? {
            id: row.application_id,
            companyName: appMap.get(row.application_id)!.company_name,
            roleTitle: appMap.get(row.application_id)!.role_title,
            status: appMap.get(row.application_id)!.status,
            interviewPrep: appMap.get(row.application_id)!.interview_prep ?? null,
          }
        : null,
    }));
  }

  return (data ?? []).map(mapCalendarRow);
}

export interface NewCalendarEventInput {
  applicationId?: string | null;
  type: CalendarEventType;
  title: string;
  startsAt: string;
  endsAt?: string | null;
  allDay: boolean;
  notes?: string | null;
}

export async function createCalendarEvent(
  userId: string,
  input: NewCalendarEventInput,
): Promise<CalendarEvent> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("calendar_events")
    .insert({
      user_id: userId,
      application_id: input.applicationId || null,
      event_type: input.type,
      title: input.title,
      starts_at: input.startsAt,
      ends_at: input.endsAt || null,
      all_day: input.allDay,
      notes: input.notes || null,
    })
    .select(`
      *,
      application:applications (
        id,
        company_name,
        role_title,
        status,
        interview_prep
      )
    `)
    .single<RawCalendarEventRow>();

  if (error) throw failure("save the event", error);
  return mapCalendarRow(data);
}

export interface UpdateCalendarEventInput {
  applicationId?: string | null;
  type?: CalendarEventType;
  title?: string;
  startsAt?: string;
  endsAt?: string | null;
  allDay?: boolean;
  notes?: string | null;
}

export async function updateCalendarEvent(
  userId: string,
  eventId: string,
  input: UpdateCalendarEventInput,
): Promise<CalendarEvent> {
  const supabase = await createClient();

  const payload: Record<string, unknown> = {};
  if (input.applicationId !== undefined) payload.application_id = input.applicationId || null;
  if (input.type !== undefined) payload.event_type = input.type;
  if (input.title !== undefined) payload.title = input.title;
  if (input.startsAt !== undefined) payload.starts_at = input.startsAt;
  if (input.endsAt !== undefined) payload.ends_at = input.endsAt || null;
  if (input.allDay !== undefined) payload.all_day = input.allDay;
  if (input.notes !== undefined) payload.notes = input.notes || null;

  const { data, error } = await supabase
    .from("calendar_events")
    .update(payload)
    .eq("user_id", userId)
    .eq("id", eventId)
    .select(`
      *,
      application:applications (
        id,
        company_name,
        role_title,
        status,
        interview_prep
      )
    `)
    .single<RawCalendarEventRow>();

  if (error) throw failure("update the event", error);
  return mapCalendarRow(data);
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
