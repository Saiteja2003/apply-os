"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  BellRing,
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Clock,
  Compass,
  Edit2,
  ExternalLink,
  Flame,
  LayoutGrid,
  ListFilter,
  Mail,
  MapPin,
  MessagesSquare,
  Phone,
  Plus,
  Radio,
  Sparkles,
  StickyNote,
  Trash2,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { deleteCalendarEventAction } from "@/app/actions/calendar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useWorkspace } from "@/components/workspace-provider";
import { fetchCalendarEvents, queryKeys } from "@/lib/api";
import {
  addDays,
  addMonths,
  dayKey,
  monthGrid,
  startOfDay,
  startOfWeek,
} from "@/lib/calendar/items";
import type { CalendarEvent, CalendarEventType } from "@/lib/types/calendar";
import { cn } from "@/lib/utils";

import { EVENT_TYPE_CONFIG, EventModal } from "./event-modal";

interface CalendarCommandCenterProps {
  initialEvents?: CalendarEvent[];
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const WEEKDAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function formatEventTime(dateStr: string, allDay: boolean): string {
  if (allDay) return "All Day";
  const date = new Date(dateStr);
  return date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function getCountdownBadge(dateStr: string, allDay: boolean): { text: string; urgent: boolean } {
  const target = new Date(dateStr);
  const now = new Date();
  const diffMs = target.getTime() - now.getTime();

  if (diffMs < -3600000) {
    return { text: "Past Milestone", urgent: false };
  }
  if (diffMs < 0) {
    return { text: "In Progress Now", urgent: true };
  }

  const mins = Math.floor(diffMs / 60000);
  if (mins < 60) {
    return { text: `Starts in ${mins}m`, urgent: true };
  }

  const hours = Math.floor(diffMs / 3600000);
  if (hours < 24) {
    const isToday = target.getDate() === now.getDate();
    return {
      text: isToday ? `Today at ${formatEventTime(dateStr, allDay)}` : `In ${hours}h`,
      urgent: hours < 6,
    };
  }

  const days = Math.floor(diffMs / 86400000);
  const remainingHours = hours % 24;
  return {
    text: `In ${days}d, ${remainingHours}h`,
    urgent: days <= 1,
  };
}

export function CalendarCommandCenter({ initialEvents = [] }: CalendarCommandCenterProps) {
  const { applications, openApplication, userId } = useWorkspace();
  const queryClient = useQueryClient();
  const [isPending, startTransition] = useTransition();

  // Navigation states
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [viewMode, setViewMode] = useState<"agenda" | "month">("agenda");

  // Modal dialog states
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [defaultScheduleDate, setDefaultScheduleDate] = useState<Date | null>(null);

  // TanStack Query for calendar events
  const { data } = useQuery({
    queryKey: queryKeys.calendarEvents(userId),
    queryFn: fetchCalendarEvents,
    initialData: { events: initialEvents, provisioned: true },
  });

  const events: CalendarEvent[] = data?.events ?? initialEvents;

  // Nearest upcoming interview for Hero Card
  const nextInterview = useMemo(() => {
    const nowMs = Date.now() - 3600000; // include items within past hour
    const upcoming = events
      .filter((e) => new Date(e.startsAt).getTime() >= nowMs)
      .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());

    // Prioritize INTERVIEW or SCREENING types, then any other milestone
    const nextInterviewRound = upcoming.find(
      (e) => e.type === "INTERVIEW" || e.type === "SCREENING",
    );
    return nextInterviewRound || upcoming[0] || null;
  }, [events]);

  // Agenda Categorization
  const agendaSections = useMemo(() => {
    const now = new Date();
    const todayMidnight = startOfDay(now).getTime();
    const tomorrowMidnight = todayMidnight + 86400000;
    const weekEnd = todayMidnight + 7 * 86400000;

    const todayItems: CalendarEvent[] = [];
    const tomorrowItems: CalendarEvent[] = [];
    const thisWeekItems: CalendarEvent[] = [];
    const laterItems: CalendarEvent[] = [];
    const pastItems: CalendarEvent[] = [];

    events.forEach((event) => {
      const eventTime = new Date(event.startsAt).getTime();
      const eventDayStart = startOfDay(new Date(event.startsAt)).getTime();

      if (eventDayStart < todayMidnight) {
        pastItems.push(event);
      } else if (eventDayStart === todayMidnight) {
        todayItems.push(event);
      } else if (eventDayStart === tomorrowMidnight) {
        tomorrowItems.push(event);
      } else if (eventDayStart < weekEnd) {
        thisWeekItems.push(event);
      } else {
        laterItems.push(event);
      }
    });

    const sortByStart = (a: CalendarEvent, b: CalendarEvent) =>
      new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime();

    return {
      today: todayItems.sort(sortByStart),
      tomorrow: tomorrowItems.sort(sortByStart),
      thisWeek: thisWeekItems.sort(sortByStart),
      later: laterItems.sort(sortByStart),
      past: pastItems.sort((a, b) => new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime()),
    };
  }, [events]);

  // Month grid dates
  const gridDays = useMemo(() => monthGrid(currentDate), [currentDate]);

  // Group events by day key for Month Matrix
  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    events.forEach((event) => {
      const key = dayKey(new Date(event.startsAt));
      const list = map.get(key) ?? [];
      list.push(event);
      map.set(key, list);
    });
    return map;
  }, [events]);

  function handleOpenCreate(date?: Date) {
    setSelectedEvent(null);
    setDefaultScheduleDate(date || null);
    setModalOpen(true);
  }

  function handleOpenEdit(event: CalendarEvent) {
    setSelectedEvent(event);
    setDefaultScheduleDate(new Date(event.startsAt));
    setModalOpen(true);
  }

  function handleEventSaved(saved: CalendarEvent) {
    queryClient.setQueryData(
      queryKeys.calendarEvents(userId),
      (prev: { events: CalendarEvent[]; provisioned: boolean } | undefined) => {
        if (!prev) return { events: [saved], provisioned: true };
        const exists = prev.events.some((e) => e.id === saved.id);
        const updated = exists
          ? prev.events.map((e) => (e.id === saved.id ? saved : e))
          : [...prev.events, saved];
        return {
          ...prev,
          events: updated.sort(
            (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
          ),
        };
      },
    );
  }

  function handleEventDeleted(deletedId: string) {
    queryClient.setQueryData(
      queryKeys.calendarEvents(userId),
      (prev: { events: CalendarEvent[]; provisioned: boolean } | undefined) => {
        if (!prev) return { events: [], provisioned: true };
        return {
          ...prev,
          events: prev.events.filter((e) => e.id !== deletedId),
        };
      },
    );
  }

  function handleDeleteEventDirect(eventId: string) {
    startTransition(async () => {
      const res = await deleteCalendarEventAction(eventId);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Event removed from calendar.");
      handleEventDeleted(eventId);
    });
  }

  // Navigation handlers
  function handlePrev() {
    setCurrentDate((prev) => addMonths(prev, -1));
  }

  function handleNext() {
    setCurrentDate((prev) => addMonths(prev, 1));
  }

  function handleToday() {
    setCurrentDate(new Date());
  }

  const todayStr = dayKey(new Date());

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 md:px-6">
      {/* Top Header & Command Center Controls */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-zinc-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <CalendarIcon className="size-5 text-indigo-400" />
            <h1 className="text-xl font-bold tracking-tight text-zinc-100">
              Interview Command Center
            </h1>
          </div>
          <p className="mt-0.5 text-xs text-zinc-400">
            Real-time interview telemetry, STAR studio rehearsal bridge, and recruiter milestones.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Month / Period Navigator */}
          <div className="flex items-center gap-1 rounded-lg border border-zinc-800 bg-zinc-900/60 p-1">
            <Button
              size="sm"
              variant="ghost"
              onClick={handlePrev}
              className="size-7 p-0 text-zinc-400 hover:text-white"
              title="Previous Month"
            >
              <ChevronLeft className="size-4" />
            </Button>
            <span className="px-2 text-xs font-semibold text-zinc-200 min-w-[110px] text-center">
              {MONTH_NAMES[currentDate.getMonth()]} {currentDate.getFullYear()}
            </span>
            <Button
              size="sm"
              variant="ghost"
              onClick={handleNext}
              className="size-7 p-0 text-zinc-400 hover:text-white"
              title="Next Month"
            >
              <ChevronRight className="size-4" />
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleToday}
              className="h-7 px-2 text-[11px] font-medium border-zinc-700 bg-zinc-800/80 text-zinc-200 hover:text-white"
            >
              Today
            </Button>
          </div>

          {/* View Switcher Segmented Control */}
          <div className="flex items-center rounded-lg border border-zinc-800 bg-zinc-900/60 p-1">
            <button
              type="button"
              onClick={() => setViewMode("agenda")}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                viewMode === "agenda"
                  ? "bg-zinc-800 text-zinc-100 shadow-sm"
                  : "text-zinc-400 hover:text-zinc-200",
              )}
            >
              <ListFilter className="size-3.5" />
              <span>Agenda & Rounds</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode("month")}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                viewMode === "month"
                  ? "bg-zinc-800 text-zinc-100 shadow-sm"
                  : "text-zinc-400 hover:text-zinc-200",
              )}
            >
              <LayoutGrid className="size-3.5" />
              <span>Month Matrix</span>
            </button>
          </div>

          {/* Primary Action Button */}
          <Button
            size="sm"
            onClick={() => handleOpenCreate()}
            className="h-8 gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs"
          >
            <Plus className="size-3.5" />
            <span>Schedule Round</span>
          </Button>
        </div>
      </div>

      {/* Hero Countdown Card ("Next Up") */}
      {nextInterview ? (
        (() => {
          const cfg = EVENT_TYPE_CONFIG[nextInterview.type];
          const countdown = getCountdownBadge(nextInterview.startsAt, nextInterview.allDay);
          const hasLinkedApp = Boolean(nextInterview.applicationId);

          return (
            <div className="relative overflow-hidden rounded-xl border border-indigo-500/30 bg-gradient-to-r from-indigo-950/40 via-zinc-900/70 to-zinc-950 p-5 shadow-xl shadow-indigo-950/20">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="space-y-2 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="flex items-center gap-1.5 text-xs font-mono font-semibold uppercase tracking-wider text-indigo-400">
                      <Radio className="size-3.5 text-indigo-400 animate-pulse" />
                      Next Up in Queue
                    </span>

                    <Badge
                      variant="warning"
                      className={cn(
                        "text-[11px] font-mono",
                        countdown.urgent
                          ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                          : "bg-indigo-500/20 text-indigo-300 border-indigo-500/40",
                      )}
                    >
                      <Clock className="size-3 inline mr-1" />
                      {countdown.text}
                    </Badge>

                    <Badge variant="outline" className={cn("text-[10px]", cfg.badgeStyle)}>
                      {cfg.label}
                    </Badge>
                  </div>

                  <div>
                    <h2 className="text-lg font-bold tracking-tight text-zinc-100">
                      {nextInterview.title}
                    </h2>
                    {nextInterview.application ? (
                      <p className="text-xs text-zinc-300 font-medium mt-0.5">
                        {nextInterview.application.companyName} · {nextInterview.application.roleTitle}
                      </p>
                    ) : (
                      <p className="text-xs text-zinc-400 mt-0.5">Standalone Career Milestone</p>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-400 pt-1">
                    <span className="flex items-center gap-1">
                      <CalendarIcon className="size-3.5 text-zinc-500" />
                      {new Date(nextInterview.startsAt).toLocaleDateString(undefined, {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                    <span className="text-zinc-600">•</span>
                    <span className="flex items-center gap-1 font-mono text-zinc-300">
                      <Clock className="size-3.5 text-zinc-500" />
                      {formatEventTime(nextInterview.startsAt, nextInterview.allDay)}
                    </span>
                    {nextInterview.notes && (
                      <>
                        <span className="text-zinc-600">•</span>
                        <span className="text-zinc-400 text-[11px] truncate max-w-md">
                          {nextInterview.notes.split("\n")[0]}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {/* Hero Action Buttons */}
                <div className="flex flex-wrap items-center gap-2 pt-2 md:pt-0 shrink-0">
                  {hasLinkedApp && (
                    <>
                      <Button
                        size="sm"
                        onClick={() => openApplication(nextInterview.applicationId!, "prep")}
                        className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs gap-1.5 shadow-md shadow-indigo-600/20"
                      >
                        <Sparkles className="size-3.5 text-indigo-200" />
                        <span>Open STAR Studio</span>
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openApplication(nextInterview.applicationId!, "mail")}
                        className="border-zinc-800 bg-zinc-900/60 hover:bg-zinc-800 text-xs text-zinc-200 gap-1.5"
                      >
                        <Mail className="size-3.5 text-indigo-400" />
                        <span>View Email Thread</span>
                      </Button>
                    </>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleOpenEdit(nextInterview)}
                    className="border-zinc-800 hover:bg-zinc-800 text-xs text-zinc-300 gap-1"
                  >
                    <Edit2 className="size-3" />
                    <span>Edit Round</span>
                  </Button>
                </div>
              </div>
            </div>
          );
        })()
      ) : (
        <div className="rounded-xl border border-dashed border-zinc-800 bg-zinc-950/60 p-6 text-center">
          <CalendarIcon className="mx-auto size-7 text-zinc-600 mb-2" />
          <h3 className="text-sm font-semibold text-zinc-200">
            No Upcoming Interview Rounds Scheduled
          </h3>
          <p className="mt-1 text-xs text-zinc-500 max-w-md mx-auto leading-relaxed">
            Interview invites received via email integration land here automatically. You can
            also schedule technical screenings, follow-up reminders, and offer decision dates.
          </p>
          <div className="mt-4 flex items-center justify-center gap-3">
            <Button
              size="sm"
              onClick={() => handleOpenCreate()}
              className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs gap-1"
            >
              <Plus className="size-3.5" /> Schedule Round
            </Button>
            <Link href="/discover">
              <Button
                size="sm"
                variant="outline"
                className="border-zinc-800 hover:bg-zinc-800 text-xs text-zinc-300 gap-1"
              >
                <Compass className="size-3.5 text-indigo-400" /> Explore Opportunities
              </Button>
            </Link>
          </div>
        </div>
      )}

      {/* Main View Mode Content */}
      {viewMode === "agenda" ? (
        <div className="space-y-6">
          {/* Section Helper */}
          {[
            { title: "Today", items: agendaSections.today, badgeColor: "text-emerald-400 border-emerald-800/60 bg-emerald-950/40" },
            { title: "Tomorrow", items: agendaSections.tomorrow, badgeColor: "text-indigo-400 border-indigo-800/60 bg-indigo-950/40" },
            { title: "This Week", items: agendaSections.thisWeek, badgeColor: "text-zinc-300 border-zinc-800 bg-zinc-900/60" },
            { title: "Later & Upcoming", items: agendaSections.later, badgeColor: "text-zinc-400 border-zinc-800 bg-zinc-900/40" },
            { title: "Past Milestones", items: agendaSections.past, badgeColor: "text-zinc-500 border-zinc-800/60 bg-zinc-950/40" },
          ].map((sec) => {
            if (sec.items.length === 0) return null;

            return (
              <div key={sec.title} className="space-y-3">
                <div className="flex items-center gap-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                    {sec.title}
                  </h3>
                  <Badge variant="neutral" className={cn("text-[10px] py-0 px-1.5", sec.badgeColor)}>
                    {sec.items.length}
                  </Badge>
                </div>

                <div className="grid grid-cols-1 gap-2.5">
                  {sec.items.map((event) => {
                    const cfg = EVENT_TYPE_CONFIG[event.type];
                    const hasApp = Boolean(event.applicationId);

                    return (
                      <div
                        key={event.id}
                        className="group flex flex-col gap-3 rounded-xl border border-zinc-800/80 bg-zinc-900/30 p-4 transition-all duration-150 hover:border-zinc-700 hover:bg-zinc-900/60 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="space-y-1.5 flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={cn("size-2 rounded-full shrink-0", cfg.dotColor)} />
                            <span className="font-semibold text-sm text-zinc-100 truncate">
                              {event.title}
                            </span>
                            <Badge variant="outline" className={cn("text-[10px]", cfg.badgeStyle)}>
                              {cfg.label}
                            </Badge>
                          </div>

                          <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-400">
                            {event.application ? (
                              <button
                                type="button"
                                onClick={() => openApplication(event.applicationId!, "prep")}
                                className="font-medium text-indigo-300 hover:underline text-xs"
                              >
                                {event.application.companyName} · {event.application.roleTitle}
                              </button>
                            ) : (
                              <span className="text-zinc-500">Standalone Milestone</span>
                            )}
                            <span className="text-zinc-600">•</span>
                            <span className="flex items-center gap-1 font-mono text-zinc-300 text-[11px]">
                              <Clock className="size-3 text-zinc-500" />
                              {new Date(event.startsAt).toLocaleDateString(undefined, {
                                month: "short",
                                day: "numeric",
                              })}{" "}
                              at {formatEventTime(event.startsAt, event.allDay)}
                            </span>
                          </div>

                          {event.notes && (
                            <p className="text-xs text-zinc-400 line-clamp-1 font-mono text-[11px] pt-0.5">
                              {event.notes}
                            </p>
                          )}
                        </div>

                        {/* Event Card Quick Actions */}
                        <div className="flex items-center gap-1.5 shrink-0 pt-2 sm:pt-0">
                          {hasApp && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openApplication(event.applicationId!, "prep")}
                              className="h-7 text-xs border-indigo-900/50 bg-indigo-950/30 text-indigo-300 hover:bg-indigo-900/40 gap-1"
                              title="Open STAR Response Studio"
                            >
                              <Sparkles className="size-3 text-indigo-400" />
                              <span>Prep</span>
                            </Button>
                          )}

                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleOpenEdit(event)}
                            className="size-7 p-0 text-zinc-400 hover:text-zinc-200"
                            title="Edit Event"
                          >
                            <Edit2 className="size-3.5" />
                          </Button>

                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDeleteEventDirect(event.id)}
                            disabled={isPending}
                            className="size-7 p-0 text-zinc-400 hover:text-red-400"
                            title="Delete Event"
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Month Matrix Grid View */
        <div className="rounded-xl border border-zinc-800 bg-zinc-950 shadow-md overflow-hidden">
          {/* Day of Week Headers */}
          <div className="grid grid-cols-7 border-b border-zinc-800 bg-zinc-900/80 text-center text-[11px] font-semibold text-zinc-400 uppercase py-2">
            {WEEKDAY_NAMES.map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>

          {/* 7-column Calendar Cells */}
          <div className="grid grid-cols-7 divide-x divide-y divide-zinc-800/60">
            {gridDays.map((date) => {
              const dKey = dayKey(date);
              const isToday = dKey === todayStr;
              const isCurrentMonth = date.getMonth() === currentDate.getMonth();
              const dayEvents = eventsByDay.get(dKey) ?? [];

              return (
                <div
                  key={dKey}
                  onClick={() => handleOpenCreate(date)}
                  className={cn(
                    "min-h-[100px] p-2 transition-colors cursor-pointer group flex flex-col justify-between",
                    isCurrentMonth ? "bg-zinc-950/70 hover:bg-zinc-900/40" : "bg-zinc-950/20 text-zinc-600 hover:bg-zinc-900/20",
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={cn(
                        "flex size-6 items-center justify-center rounded-full text-xs font-mono font-medium",
                        isToday
                          ? "bg-indigo-600 text-white font-bold"
                          : isCurrentMonth
                            ? "text-zinc-300"
                            : "text-zinc-600",
                      )}
                    >
                      {date.getDate()}
                    </span>
                    {dayEvents.length > 0 && (
                      <span className="text-[10px] font-mono text-zinc-500">
                        {dayEvents.length}
                      </span>
                    )}
                  </div>

                  {/* Event Chips inside Cell */}
                  <div className="mt-1 space-y-1 flex-1">
                    {dayEvents.slice(0, 3).map((ev) => {
                      const cfg = EVENT_TYPE_CONFIG[ev.type];
                      return (
                        <div
                          key={ev.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenEdit(ev);
                          }}
                          className={cn(
                            "group/pill flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium border truncate transition-transform hover:scale-[1.02]",
                            cfg.badgeStyle,
                          )}
                          title={`${ev.title} (${formatEventTime(ev.startsAt, ev.allDay)})`}
                        >
                          <span className={cn("size-1.5 rounded-full shrink-0", cfg.dotColor)} />
                          <span className="truncate">{ev.title}</span>
                        </div>
                      );
                    })}

                    {dayEvents.length > 3 && (
                      <span className="block text-[10px] text-zinc-500 pl-1">
                        +{dayEvents.length - 3} more
                      </span>
                    )}
                  </div>

                  {/* Add icon on hover */}
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity text-right">
                    <span className="text-[10px] text-indigo-400">+ Add</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* CRUD Event Modal Dialog */}
      <EventModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        initialEvent={selectedEvent}
        defaultDate={defaultScheduleDate}
        applications={applications}
        onSaved={handleEventSaved}
        onDeleted={handleEventDeleted}
      />
    </div>
  );
}
