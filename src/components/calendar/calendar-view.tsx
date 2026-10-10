"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BellRing,
  Bookmark,
  ChevronLeft,
  ChevronRight,
  MessagesSquare,
  Phone,
  Plus,
  Send,
  StickyNote,
  X,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import {
  createCalendarEventAction,
  deleteCalendarEventAction,
} from "@/app/actions/calendar";
import { isTypingTarget } from "@/components/layout/sidebar";
import { Button } from "@/components/ui/button";
import { InlineAlert } from "@/components/ui/inline-alert";
import { Kbd } from "@/components/ui/kbd";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useWorkspace } from "@/components/workspace-provider";
import type { ActionResult } from "@/lib/action-result";
import { fetchCalendarEvents, queryKeys } from "@/lib/api";
import {
  addDays,
  addMonths,
  buildCalendarItems,
  dayKey,
  FOLLOW_UP_DAYS,
  monthGrid,
  startOfDay,
  weekDays,
  type CalendarItem,
  type CalendarItemKind,
} from "@/lib/calendar/items";
import type { CalendarEvent, CalendarEventsResult } from "@/lib/types/calendar";
import { cn } from "@/lib/utils";

import { AddEventDialog } from "./add-event-dialog";

type View = "month" | "week";

const VIOLET =
  "border-violet-500/25 bg-violet-500/10 text-violet-200 hover:border-violet-400/50 hover:bg-violet-500/20";
const EMERALD =
  "border-emerald-500/25 bg-emerald-500/10 text-emerald-200 hover:border-emerald-400/50 hover:bg-emerald-500/20";
const AMBER =
  "border-amber-500/25 bg-amber-500/10 text-amber-200 hover:border-amber-400/50 hover:bg-amber-500/20";
const ZINC =
  "border-zinc-700/70 bg-zinc-800/50 text-zinc-300 hover:border-zinc-600 hover:bg-zinc-800";

const KIND_META: Record<
  CalendarItemKind,
  { label: string; icon: LucideIcon; chip: string; dot: string }
> = {
  applied: { label: "Applied", icon: Send, chip: VIOLET, dot: "bg-violet-400" },
  interview: {
    label: "Interview",
    icon: MessagesSquare,
    chip: EMERALD,
    dot: "bg-emerald-400",
  },
  screening: {
    label: "Screening call",
    icon: Phone,
    chip: EMERALD,
    dot: "bg-emerald-400",
  },
  follow_up: {
    label: "Follow-up reminder",
    icon: BellRing,
    chip: AMBER,
    dot: "bg-amber-400",
  },
  note: { label: "Note", icon: StickyNote, chip: ZINC, dot: "bg-zinc-500" },
  saved: { label: "Saved", icon: Bookmark, chip: ZINC, dot: "bg-zinc-500" },
};

const LEGEND: { label: string; dot: string }[] = [
  { label: "Applied", dot: "bg-violet-400" },
  { label: "Interview / Screening", dot: "bg-emerald-400" },
  { label: "Follow-up reminder", dot: "bg-amber-400" },
  { label: "Note / Saved", dot: "bg-zinc-500" },
];

const MAX_MONTH_ITEMS = 3;
const MIGRATION_PATH =
  "supabase/migrations/002_api_key_policies_and_calendar_events.sql";

const TODAY_BADGE = "border-indigo-500/30 bg-indigo-500/10 text-indigo-400";

const timeFormat = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
});
const monthTitleFormat = new Intl.DateTimeFormat(undefined, {
  month: "long",
  year: "numeric",
});
const rangeFormat = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
});
const weekdayFormat = new Intl.DateTimeFormat(undefined, { weekday: "short" });
const longDateFormat = new Intl.DateTimeFormat(undefined, {
  weekday: "long",
  month: "long",
  day: "numeric",
});

const timeLabel = (item: CalendarItem) =>
  item.event && !item.event.allDay
    ? timeFormat.format(new Date(item.event.startsAt))
    : null;

interface ItemHandlers {
  onOpen: (item: CalendarItem) => void;
  onDelete: (event: CalendarEvent) => void;
}

/** What a chip stands for, shown on hover and on keyboard focus. */
function ItemDetails({ item, day }: { item: CalendarItem; day: Date }) {
  const { label, dot } = KIND_META[item.kind];
  const time = timeLabel(item);

  return (
    <div className="space-y-1.5">
      <p className="flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-zinc-400 uppercase">
        <span className={cn("size-1.5 rounded-full", dot)} aria-hidden />
        {label}
        {item.due && <span className="text-amber-300 normal-case">· due</span>}
      </p>
      <p className="text-[13px] leading-snug font-medium text-zinc-100">
        {item.title}
      </p>
      <p className="leading-snug text-zinc-300">
        {item.company} · {item.role}
      </p>
      <p className="text-zinc-400">
        {longDateFormat.format(day)}
        {time ? ` · ${time}` : item.event ? " · all day" : ""}
      </p>
      {item.kind === "follow_up" && (
        <p className="leading-snug text-zinc-400">
          {item.due
            ? `No reply ${FOLLOW_UP_DAYS} business days after applying. Worth a nudge.`
            : `Shown ${FOLLOW_UP_DAYS} business days after applying, while the stage is still Applied.`}
        </p>
      )}
      {item.event?.notes && (
        <p className="line-clamp-4 border-t border-zinc-800 pt-1.5 leading-snug whitespace-pre-wrap text-zinc-300">
          {item.event.notes}
        </p>
      )}
      <p className="text-[11px] text-zinc-500">Select to open the application</p>
    </div>
  );
}

function DeleteEventButton({
  item,
  onDelete,
  className,
}: {
  item: CalendarItem;
  onDelete: (event: CalendarEvent) => void;
  className?: string;
}) {
  if (!item.event) return null;
  const event = item.event;
  return (
    <button
      type="button"
      onClick={() => onDelete(event)}
      aria-label={`Delete ${item.title}`}
      title="Delete event"
      className={cn(
        "absolute flex items-center justify-center rounded bg-zinc-950/90 text-zinc-400 opacity-0 transition-opacity duration-150 outline-none group-hover/item:opacity-100 hover:text-red-300 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      <X className="size-3" aria-hidden />
    </button>
  );
}

/** One line in a month cell. */
function ItemChip({
  item,
  day,
  onOpen,
  onDelete,
}: { item: CalendarItem; day: Date } & ItemHandlers) {
  const { icon: Icon, chip } = KIND_META[item.kind];
  const time = timeLabel(item);

  return (
    <div className="group/item pointer-events-auto relative">
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => onOpen(item)}
            className={cn(
              "flex w-full items-center gap-1.5 rounded-md border px-1.5 py-1 text-left text-[11px] leading-tight transition-colors duration-150 ease-out outline-none focus-visible:ring-2 focus-visible:ring-ring",
              chip,
              item.due && "ring-1 ring-amber-400/60",
            )}
          >
            <Icon className="size-3 shrink-0" aria-hidden />
            <span className="truncate font-medium">
              {time && <span className="font-normal opacity-70">{time} </span>}
              {item.title}
            </span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" align="start">
          <ItemDetails item={item} day={day} />
        </TooltipContent>
      </Tooltip>
      <DeleteEventButton
        item={item}
        onDelete={onDelete}
        className="top-1 right-1 size-4"
      />
    </div>
  );
}

/** One row in the week agenda. */
function AgendaRow({
  item,
  day,
  onOpen,
  onDelete,
}: { item: CalendarItem; day: Date } & ItemHandlers) {
  const { icon: Icon, chip, label } = KIND_META[item.kind];
  const time = timeLabel(item);

  return (
    <div className="group/item pointer-events-auto relative animate-rise-in">
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => onOpen(item)}
            className={cn(
              "flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors duration-150 ease-out outline-none focus-visible:ring-2 focus-visible:ring-ring",
              chip,
              item.due && "ring-1 ring-amber-400/60",
            )}
          >
            <span className="w-16 shrink-0 text-xs tabular-nums opacity-80">
              {time ?? (item.event ? "All day" : "")}
            </span>
            <Icon className="size-4 shrink-0" aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium">
                {item.title}
              </span>
              <span className="block truncate text-xs opacity-70">
                {label} · {item.detail}
              </span>
            </span>
            {item.due && (
              <span className="shrink-0 rounded-full bg-amber-400/20 px-2 py-0.5 text-[11px] font-medium text-amber-200">
                Due
              </span>
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" align="start">
          <ItemDetails item={item} day={day} />
        </TooltipContent>
      </Tooltip>
      <DeleteEventButton
        item={item}
        onDelete={onDelete}
        className="top-1/2 right-2 size-6 -translate-y-1/2"
      />
    </div>
  );
}

interface GridProps extends ItemHandlers {
  days: Date[];
  todayKey: string;
  items: Map<string, CalendarItem[]>;
  onAdd: (day: Date) => void;
}

function MonthGrid({
  days,
  month,
  todayKey,
  items,
  onAdd,
  onOpen,
  onDelete,
  onShowDay,
}: GridProps & { month: number; onShowDay: (day: Date) => void }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-zinc-800/80 bg-zinc-900/40 backdrop-blur-md">
      <div className="grid grid-cols-7 border-b border-zinc-800/60 text-center text-[11px] font-medium tracking-wider text-zinc-500 uppercase">
        {days.slice(0, 7).map((day) => (
          <div key={day.getDay()} className="py-2">
            {weekdayFormat.format(day)}
          </div>
        ))}
      </div>
      <div
        className="grid min-h-0 flex-1 grid-cols-7 overflow-y-auto"
        style={{
          gridTemplateRows: `repeat(${days.length / 7}, minmax(min-content, 1fr))`,
        }}
      >
        {days.map((day, index) => {
          const key = dayKey(day);
          const dayItems = items.get(key) ?? [];
          const outside = day.getMonth() !== month;
          const isToday = key === todayKey;
          const hidden = dayItems.length - MAX_MONTH_ITEMS;

          return (
            <div
              key={key}
              className={cn(
                "group/cell relative min-h-28 border-zinc-800/60 p-1.5 transition-colors duration-150 ease-out",
                index % 7 !== 6 && "border-r",
                index < days.length - 7 && "border-b",
                outside && "bg-zinc-950/50",
                isToday && "bg-indigo-500/[0.06]",
              )}
            >
              {/* The whole cell adds an event; chips sit above it. */}
              <button
                type="button"
                onClick={() => onAdd(day)}
                aria-label={`Add an event on ${longDateFormat.format(day)}`}
                className="absolute inset-0 transition-colors duration-150 ease-out outline-none hover:bg-indigo-500/[0.05] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
              />
              <div className="pointer-events-none relative flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <span
                    className="flex size-5 items-center justify-center rounded-md border border-zinc-700/80 bg-zinc-900 text-zinc-300 opacity-0 shadow-sm transition-opacity duration-150 ease-out group-focus-within/cell:opacity-100 group-hover/cell:opacity-100"
                    aria-hidden
                  >
                    <Plus className="size-3" />
                  </span>
                  <span
                    className={cn(
                      "flex h-6 min-w-6 items-center justify-center rounded-full border px-1 text-xs tabular-nums",
                      isToday
                        ? cn(TODAY_BADGE, "font-semibold")
                        : outside
                          ? "border-transparent text-zinc-600"
                          : "border-transparent text-zinc-400",
                    )}
                  >
                    {day.getDate()}
                  </span>
                </div>
                {dayItems.slice(0, MAX_MONTH_ITEMS).map((item) => (
                  <ItemChip
                    key={item.key}
                    item={item}
                    day={day}
                    onOpen={onOpen}
                    onDelete={onDelete}
                  />
                ))}
                {hidden > 0 && (
                  <button
                    type="button"
                    onClick={() => onShowDay(day)}
                    className="pointer-events-auto rounded px-1.5 py-0.5 text-left text-[11px] text-zinc-400 transition-colors duration-150 outline-none hover:bg-zinc-800/60 hover:text-zinc-100 focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    +{hidden} more
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WeekAgenda({ days, todayKey, items, onAdd, onOpen, onDelete }: GridProps) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-zinc-800/80 bg-zinc-900/40 backdrop-blur-md">
      <ul className="flex min-h-full flex-col divide-y divide-zinc-800/60">
        {days.map((day) => {
          const key = dayKey(day);
          const dayItems = items.get(key) ?? [];
          const isToday = key === todayKey;

          return (
            <li
              key={key}
              className={cn(
                "group/cell relative flex min-h-20 flex-1 gap-4 px-4 py-3 transition-colors duration-150 ease-out",
                isToday && "bg-indigo-500/[0.06]",
              )}
            >
              <button
                type="button"
                onClick={() => onAdd(day)}
                aria-label={`Add an event on ${longDateFormat.format(day)}`}
                className="absolute inset-0 transition-colors duration-150 ease-out outline-none hover:bg-indigo-500/[0.05] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
              />
              <div className="pointer-events-none relative flex w-14 shrink-0 flex-col items-start gap-1">
                <span
                  className={cn(
                    "text-[11px] font-medium tracking-wider uppercase",
                    isToday ? "text-indigo-400" : "text-zinc-500",
                  )}
                >
                  {weekdayFormat.format(day)}
                </span>
                <span
                  className={cn(
                    "flex h-8 min-w-8 items-center justify-center rounded-full border px-1.5 text-sm tabular-nums",
                    isToday
                      ? cn(TODAY_BADGE, "font-semibold")
                      : "border-transparent text-zinc-300",
                  )}
                >
                  {day.getDate()}
                </span>
              </div>
              <div className="pointer-events-none relative min-w-0 flex-1 space-y-1.5">
                {dayItems.map((item) => (
                  <AgendaRow
                    key={item.key}
                    item={item}
                    day={day}
                    onOpen={onOpen}
                    onDelete={onDelete}
                  />
                ))}
                <p
                  className={cn(
                    "flex items-center gap-1.5 text-xs transition-opacity duration-150 ease-out",
                    dayItems.length === 0
                      ? "py-2 text-zinc-600"
                      : "text-indigo-300 opacity-0 group-focus-within/cell:opacity-100 group-hover/cell:opacity-100",
                  )}
                >
                  {dayItems.length === 0 && <span>Nothing scheduled</span>}
                  <span
                    className={cn(
                      "flex items-center gap-1 text-indigo-300",
                      dayItems.length === 0 &&
                        "opacity-0 transition-opacity duration-150 ease-out group-focus-within/cell:opacity-100 group-hover/cell:opacity-100",
                    )}
                  >
                    <Plus className="size-3.5" aria-hidden />
                    Add event
                  </span>
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function CalendarSkeleton() {
  return (
    <div
      className="grid min-h-0 flex-1 animate-pulse grid-cols-7 grid-rows-5 overflow-hidden rounded-xl border border-zinc-800/60 bg-zinc-900/40"
      aria-busy="true"
      aria-label="Loading calendar"
    >
      {Array.from({ length: 35 }, (_, index) => (
        <div
          key={index}
          className={cn(
            "border-zinc-800/40",
            index % 7 !== 6 && "border-r",
            index < 28 && "border-b",
          )}
        />
      ))}
    </div>
  );
}

export function CalendarView() {
  const { applications, userId, openApplication } = useWorkspace();
  const queryClient = useQueryClient();
  const eventsKey = queryKeys.calendarEvents(userId);

  // The calendar depends on the viewer's time zone, so "today" is only
  // known in the browser. Until then a skeleton is shown.
  const [today, setToday] = useState<Date | null>(null);
  const [anchor, setAnchor] = useState<Date | null>(null);
  const [view, setView] = useState<View>("month");
  const [addDate, setAddDate] = useState<Date | null>(null);

  useEffect(() => {
    const now = startOfDay(new Date());
    setToday(now);
    setAnchor(now);
  }, []);

  const eventsQuery = useQuery({
    queryKey: eventsKey,
    queryFn: fetchCalendarEvents,
  });
  const events = eventsQuery.data?.events;
  const provisioned = eventsQuery.data?.provisioned ?? true;

  const items = useMemo(
    () =>
      today
        ? buildCalendarItems(applications, events ?? [], today)
        : new Map<string, CalendarItem[]>(),
    [applications, events, today],
  );

  const step = useCallback(
    (direction: 1 | -1) =>
      setAnchor((current) =>
        current
          ? view === "month"
            ? addMonths(current, direction)
            : addDays(current, direction * 7)
          : current,
      ),
    [view],
  );

  const requestAdd = useCallback(
    (day: Date) => {
      if (!provisioned) {
        toast.error("Calendar events are not set up yet", {
          description: `Run ${MIGRATION_PATH} in the Supabase SQL editor, then reload.`,
        });
        return;
      }
      setAddDate(day);
    },
    [provisioned],
  );

  // T: today, M: month, W: week, arrows: previous / next.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;
      if (document.querySelector('[role="dialog"]')) return;

      switch (event.key.toLowerCase()) {
        case "t":
          setAnchor(startOfDay(new Date()));
          break;
        case "m":
          setView("month");
          break;
        case "w":
          setView("week");
          break;
        case "arrowleft":
          step(-1);
          break;
        case "arrowright":
          step(1);
          break;
        default:
          return;
      }
      event.preventDefault();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [step]);

  const addToCache = useCallback(
    (event: CalendarEvent) => {
      queryClient.setQueryData<CalendarEventsResult>(eventsKey, (current) => ({
        provisioned: true,
        events: [...(current?.events ?? []), event],
      }));
    },
    [eventsKey, queryClient],
  );

  const restoreEvent = useCallback(
    async (event: CalendarEvent) => {
      const result = await createCalendarEventAction({
        applicationId: event.applicationId,
        type: event.type,
        title: event.title,
        startsAt: new Date(event.startsAt).toISOString(),
        allDay: event.allDay,
        notes: event.notes ?? "",
      }).catch(
        (): ActionResult<CalendarEvent> => ({
          ok: false,
          error: "Could not reach the server.",
        }),
      );
      if (result.ok) addToCache(result.data);
      else toast.error("Could not restore the event", { description: result.error });
    },
    [addToCache],
  );

  const deleteEvent = useCallback(
    async (event: CalendarEvent) => {
      const previous = queryClient.getQueryData<CalendarEventsResult>(eventsKey);
      queryClient.setQueryData<CalendarEventsResult>(eventsKey, (current) =>
        current
          ? {
              ...current,
              events: current.events.filter((entry) => entry.id !== event.id),
            }
          : current,
      );

      const result = await deleteCalendarEventAction(event.id).catch(
        (): ActionResult<{ id: string }> => ({
          ok: false,
          error: "Could not reach the server.",
        }),
      );
      if (result.ok) {
        toast(`Deleted "${event.title}"`, {
          action: { label: "Undo", onClick: () => void restoreEvent(event) },
        });
      } else {
        queryClient.setQueryData(eventsKey, previous);
        toast.error("Could not delete the event", { description: result.error });
      }
    },
    [eventsKey, queryClient, restoreEvent],
  );

  // Interviews and calls open on Interview Prep; everything else on the diff.
  const openItem = useCallback(
    (item: CalendarItem) =>
      openApplication(
        item.applicationId,
        item.kind === "interview" || item.kind === "screening" ? "prep" : "diff",
      ),
    [openApplication],
  );

  const days = anchor ? (view === "month" ? monthGrid(anchor) : weekDays(anchor)) : [];
  const title = anchor
    ? view === "month"
      ? monthTitleFormat.format(anchor)
      : rangeFormat.formatRange(days[0], days[6])
    : "";

  return (
    <TooltipProvider delayDuration={200} skipDelayDuration={300}>
      <div className="flex h-full flex-col gap-3 px-4 py-5 md:px-6">
        <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-semibold tracking-tight">
              {title || "Calendar"}
            </h1>
            <p className="text-sm text-muted-foreground">
              Applications, follow-ups and interviews · select a day to add an
              event
            </p>
          </div>

          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              aria-label={view === "month" ? "Previous month" : "Previous week"}
              title="Previous (←)"
              disabled={!anchor}
              onClick={() => step(-1)}
            >
              <ChevronLeft aria-hidden />
            </Button>
            <Button
              variant="outline"
              disabled={!anchor}
              onClick={() => setAnchor(startOfDay(new Date()))}
            >
              Today
              <Kbd className="hidden lg:inline-flex">T</Kbd>
            </Button>
            <Button
              variant="outline"
              size="icon"
              aria-label={view === "month" ? "Next month" : "Next week"}
              title="Next (→)"
              disabled={!anchor}
              onClick={() => step(1)}
            >
              <ChevronRight aria-hidden />
            </Button>
          </div>

          {/* Segmented switch: the thumb slides between the two views. */}
          <div
            className="relative grid grid-cols-2 rounded-lg border border-zinc-800 bg-zinc-900 p-1"
            role="tablist"
            aria-label="Calendar view"
          >
            <span
              className={cn(
                "absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-md bg-zinc-800 shadow-sm transition-transform duration-200 ease-out",
                view === "week" && "translate-x-full",
              )}
              aria-hidden
            />
            {(["month", "week"] as const).map((option) => (
              <button
                key={option}
                type="button"
                role="tab"
                aria-selected={view === option}
                onClick={() => setView(option)}
                className={cn(
                  "relative flex items-center justify-center gap-1.5 rounded-md px-3 py-1 text-[13px] capitalize transition-colors duration-200 ease-out outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  view === option
                    ? "font-medium text-zinc-100"
                    : "text-zinc-400 hover:text-zinc-100",
                )}
              >
                {option}
                <Kbd className="hidden lg:inline-flex">
                  {option === "month" ? "M" : "W"}
                </Kbd>
              </button>
            ))}
          </div>

          <Button disabled={!today} onClick={() => today && requestAdd(today)}>
            <Plus aria-hidden />
            Add event
          </Button>
        </header>

        {!provisioned && (
          <div
            role="status"
            className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-3.5 py-2.5 text-sm text-amber-100"
          >
            Application dates and follow-ups work now. To add interviews, calls
            and notes, run{" "}
            <code className="rounded bg-amber-500/15 px-1 py-0.5 font-mono text-xs">
              {MIGRATION_PATH}
            </code>{" "}
            in the Supabase SQL editor, then reload.
          </div>
        )}
        {eventsQuery.isError && (
          <InlineAlert tone="error">
            Your saved events could not be loaded, so only application dates
            and follow-ups are shown.{" "}
            <button
              type="button"
              onClick={() => void eventsQuery.refetch()}
              className="rounded font-medium underline underline-offset-2 outline-none hover:text-red-200 focus-visible:ring-2 focus-visible:ring-ring"
            >
              Try again
            </button>
          </InlineAlert>
        )}
        {today && applications.length === 0 && (
          <div className="rounded-lg border border-dashed border-zinc-800 px-4 py-3 text-sm text-muted-foreground">
            Nothing to show yet. Add a job on the{" "}
            <Link
              href="/dashboard"
              className="rounded text-indigo-400 transition-colors outline-none hover:text-indigo-300 focus-visible:ring-2 focus-visible:ring-ring"
            >
              dashboard
            </Link>{" "}
            and it appears here on the day you apply.
          </div>
        )}

        {!anchor || !today ? (
          <CalendarSkeleton />
        ) : (
          // Keyed so switching view or period fades the new grid in.
          <div
            key={`${view}:${dayKey(days[0])}`}
            className="flex min-h-0 flex-1 animate-fade-in flex-col"
          >
            {view === "month" ? (
              <MonthGrid
                days={days}
                month={anchor.getMonth()}
                todayKey={dayKey(today)}
                items={items}
                onAdd={requestAdd}
                onOpen={openItem}
                onDelete={deleteEvent}
                onShowDay={(day) => {
                  setAnchor(day);
                  setView("week");
                }}
              />
            ) : (
              <WeekAgenda
                days={days}
                todayKey={dayKey(today)}
                items={items}
                onAdd={requestAdd}
                onOpen={openItem}
                onDelete={deleteEvent}
              />
            )}
          </div>
        )}

        <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-500">
          {LEGEND.map((entry) => (
            <li key={entry.label} className="flex items-center gap-1.5">
              <span className={cn("size-2 rounded-full", entry.dot)} aria-hidden />
              {entry.label}
            </li>
          ))}
          <li className="ml-auto hidden items-center gap-1.5 lg:flex">
            <Kbd>←</Kbd>
            <Kbd>→</Kbd>
            to move
          </li>
        </ul>

        <AddEventDialog
          key={addDate ? dayKey(addDate) : "closed"}
          date={addDate}
          applications={applications}
          onClose={() => setAddDate(null)}
          onCreated={(event) => {
            addToCache(event);
            setAddDate(null);
            toast.success("Added to your calendar", { description: event.title });
          }}
        />
      </div>
    </TooltipProvider>
  );
}
