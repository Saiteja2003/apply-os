import type { Metadata } from "next";

import { CalendarCommandCenter } from "@/components/calendar/calendar-command-center";
import { listCalendarEvents } from "@/lib/db/calendar";
import { getSessionUser } from "@/lib/supabase/server";
import type { CalendarEvent } from "@/lib/types/calendar";

export const metadata: Metadata = {
  title: "Calendar & Interview Command Center · ApplyOS",
  description:
    "Institutional agenda timeline, interview countdown telemetry, and direct STAR Studio response practice bridge.",
};

export default async function CalendarPage() {
  const user = await getSessionUser();
  if (!user) return null;

  let initialEvents: CalendarEvent[] = [];
  try {
    initialEvents = await listCalendarEvents(user.id);
  } catch {
    initialEvents = [];
  }

  return <CalendarCommandCenter initialEvents={initialEvents} />;
}
