"use client";

import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  ArrowUpRight,
  BellRing,
  CalendarClock,
  CheckCircle2,
  MessagesSquare,
  Send,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import type { DrawerTab } from "@/components/application-drawer";
import { NAV_ITEMS } from "@/components/layout/sidebar";
import { STATUS_LABELS } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { useWorkspace } from "@/components/workspace-provider";
import { fetchCalendarEvents, queryKeys } from "@/lib/api";
import {
  addDays,
  buildCalendarItems,
  dayKey,
  startOfDay,
  type CalendarItem,
} from "@/lib/calendar/items";
import {
  APPLICATION_STATUSES,
  type ApplicationStatus,
  type JobApplication,
} from "@/lib/types/resume";
import { cn, formatDate } from "@/lib/utils";

/** How far ahead the "Coming up" list looks. */
const UPCOMING_DAYS = 14;
const LIST_LIMIT = 5;

const CARD =
  "rounded-xl border border-zinc-800/80 bg-zinc-900/60 shadow-lg shadow-black/20 backdrop-blur-md";
const FOCUS =
  "outline-none focus-visible:ring-2 focus-visible:ring-ring";

// Same stage colours as the pipeline board.
const STAGE_COLOR: Record<ApplicationStatus, string> = {
  SAVED: "bg-zinc-400",
  APPLIED: "bg-indigo-400",
  INTERVIEWING: "bg-amber-400",
  REJECTED: "bg-red-400",
  OFFER: "bg-emerald-400",
};

interface NextAction {
  key: string;
  icon: LucideIcon;
  tone: string;
  title: string;
  detail: string;
  applicationId: string;
  tab: DrawerTab;
}

/**
 * What to do next, most urgent first. Every entry is derived from the state
 * of a tracked application; nothing here is generated.
 */
function buildNextActions(
  applications: JobApplication[],
  dueFollowUps: CalendarItem[],
): NextAction[] {
  const actions: NextAction[] = dueFollowUps.map((item) => ({
    key: item.key,
    icon: BellRing,
    tone: "bg-amber-500/10 text-amber-300",
    title: item.title,
    detail: `${item.role} · no reply yet`,
    applicationId: item.applicationId,
    tab: "assets",
  }));

  for (const application of applications) {
    if (application.status === "INTERVIEWING" && !application.interviewPrep) {
      actions.push({
        key: `prep:${application.id}`,
        icon: MessagesSquare,
        tone: "bg-emerald-500/10 text-emerald-300",
        title: `Prepare for ${application.companyName}`,
        detail: `${application.roleTitle} · no interview briefing yet`,
        applicationId: application.id,
        tab: "prep",
      });
    } else if (application.status === "SAVED" && application.patchDocument) {
      actions.push({
        key: `submit:${application.id}`,
        icon: Send,
        tone: "bg-indigo-500/10 text-indigo-300",
        title: `Review and submit ${application.companyName}`,
        detail: `${application.roleTitle} · tailored resume is ready`,
        applicationId: application.id,
        tab: "preview",
      });
    } else if (application.status === "SAVED") {
      actions.push({
        key: `tailor:${application.id}`,
        icon: Sparkles,
        tone: "bg-violet-500/10 text-violet-300",
        title: `Tailor your resume for ${application.companyName}`,
        detail: `${application.roleTitle} · not tailored yet`,
        applicationId: application.id,
        tab: "diff",
      });
    }
  }
  return actions;
}

const dayFormat = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
});

function timeLabel(minutes: number): string | null {
  if (minutes < 0) return null;
  const hour = Math.floor(minutes / 60);
  const suffix = hour >= 12 ? "PM" : "AM";
  return `${hour % 12 || 12}:${String(minutes % 60).padStart(2, "0")} ${suffix}`;
}

function Panel({
  title,
  action,
  className,
  children,
}: {
  title: string;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn(CARD, "flex flex-col", className)}>
      <header className="flex h-11 shrink-0 items-center justify-between gap-3 border-b border-zinc-800/80 px-4">
        <h2 className="text-[13px] font-medium text-zinc-100">{title}</h2>
        {action}
      </header>
      {children}
    </section>
  );
}

function PanelLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className={cn(
        "group/link -mr-1 flex items-center gap-1 rounded px-1 py-0.5 text-xs text-zinc-400 transition-colors duration-150 hover:text-zinc-100",
        FOCUS,
      )}
    >
      {children}
      <ArrowRight
        className="size-3 transition-transform duration-150 group-hover/link:translate-x-0.5"
        aria-hidden
      />
    </Link>
  );
}

function EmptyNote({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 py-9 text-center">
      <span className="flex size-8 items-center justify-center rounded-full bg-zinc-800/60 text-zinc-500">
        <Icon className="size-4" aria-hidden />
      </span>
      <p className="max-w-64 text-sm text-muted-foreground">{children}</p>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className={cn(CARD, "px-4 py-3.5")}>
      <p className="text-xs text-zinc-400">{label}</p>
      <p className="mt-1.5 text-2xl font-semibold tracking-tight text-zinc-50 tabular-nums">
        {value}
      </p>
      <p className="mt-1 truncate text-xs text-zinc-500">{hint}</p>
    </div>
  );
}

export function WorkspaceView() {
  const { applications, master, userId, openApplication } = useWorkspace();

  // "Today" depends on the viewer's time zone, so it is only known in the
  // browser (same approach as the calendar).
  const [today, setToday] = useState<Date | null>(null);
  useEffect(() => setToday(startOfDay(new Date())), []);

  const eventsQuery = useQuery({
    queryKey: queryKeys.calendarEvents(userId),
    queryFn: fetchCalendarEvents,
  });
  const events = eventsQuery.data?.events;

  const counts = useMemo(() => {
    const byStatus = Object.fromEntries(
      APPLICATION_STATUSES.map((status) => [status, 0]),
    ) as Record<ApplicationStatus, number>;
    for (const application of applications) byStatus[application.status]++;
    return byStatus;
  }, [applications]);

  const { dueFollowUps, upcoming } = useMemo(() => {
    if (!today) return { dueFollowUps: [], upcoming: [] };
    const byDay = buildCalendarItems(applications, events ?? [], today);
    const all = [...byDay.values()].flat();
    const upcomingItems: { day: Date; item: CalendarItem }[] = [];
    for (let offset = 0; offset < UPCOMING_DAYS; offset++) {
      const day = addDays(today, offset);
      for (const item of byDay.get(dayKey(day)) ?? []) {
        if (
          item.kind === "interview" ||
          item.kind === "screening" ||
          item.kind === "note" ||
          (item.kind === "follow_up" && !item.due)
        ) {
          upcomingItems.push({ day, item });
        }
      }
    }
    return {
      dueFollowUps: all.filter((item) => item.kind === "follow_up" && item.due),
      upcoming: upcomingItems,
    };
  }, [applications, events, today]);

  const actions = useMemo(
    () => buildNextActions(applications, dueFollowUps),
    [applications, dueFollowUps],
  );

  const total = applications.length;
  const submitted = applications.filter((entry) => entry.appliedAt).length;
  const inFlight = counts.APPLIED + counts.INTERVIEWING;
  const scores = applications.flatMap((entry) =>
    entry.matchScore === null ? [] : [entry.matchScore],
  );
  const averageMatch = scores.length
    ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length)
    : null;

  const sectionMeta: Record<string, string> = {
    "/dashboard": `${total} in the pipeline`,
    "/applications": `${submitted} submitted`,
    "/calendar": today
      ? `${upcoming.length} in the next ${UPCOMING_DAYS} days`
      : "Interviews and follow-ups",
    "/resume": master
      ? `Version ${master.version} · saved ${formatDate(master.createdAt)}`
      : "Master resume",
    "/settings": "Models and API keys",
  };

  return (
    <div className="mx-auto flex w-full max-w-6xl animate-rise-in flex-col gap-4 px-4 py-5 md:px-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Workspace</h1>
          <p className="text-sm text-muted-foreground">
            {total === 0
              ? "Your job search at a glance. Add a job to get started."
              : actions.length === 0
                ? "Your job search at a glance · nothing needs you right now"
                : `Your job search at a glance · ${actions.length} ${
                    actions.length === 1 ? "item needs" : "items need"
                  } you`}
          </p>
        </div>
        <Button asChild>
          <Link href="/dashboard">
            Open pipeline
            <ArrowRight aria-hidden />
          </Link>
        </Button>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Tracked"
          value={String(total)}
          hint={`${counts.SAVED} saved, not yet applied`}
        />
        <Stat
          label="In flight"
          value={String(inFlight)}
          hint={`${counts.APPLIED} awaiting reply · ${counts.INTERVIEWING} interviewing`}
        />
        <Stat
          label="Offers"
          value={String(counts.OFFER)}
          hint={`${counts.REJECTED} closed as rejected`}
        />
        <Stat
          label="Average match"
          value={averageMatch === null ? "–" : `${averageMatch}%`}
          hint={
            scores.length === 0
              ? "No jobs scored yet"
              : `ATS keywords across ${scores.length} ${
                  scores.length === 1 ? "job" : "jobs"
                }`
          }
        />
      </div>

      <Panel
        title="Pipeline"
        action={<PanelLink href="/dashboard">Open board</PanelLink>}
      >
        <div className="px-4 py-4">
          <div
            className="flex h-2 gap-0.5 overflow-hidden rounded-full bg-zinc-800/60"
            role="img"
            aria-label={APPLICATION_STATUSES.map(
              (status) => `${STATUS_LABELS[status]} ${counts[status]}`,
            ).join(", ")}
          >
            {APPLICATION_STATUSES.map(
              (status) =>
                counts[status] > 0 && (
                  <span
                    key={status}
                    className={cn(
                      "h-full transition-[flex-grow] duration-200 ease-out",
                      STAGE_COLOR[status],
                    )}
                    style={{ flexGrow: counts[status] }}
                  />
                ),
            )}
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-5">
            {APPLICATION_STATUSES.map((status) => (
              <div key={status}>
                <dt className="flex items-center gap-1.5 text-xs text-zinc-400">
                  <span
                    className={cn("size-1.5 rounded-full", STAGE_COLOR[status])}
                    aria-hidden
                  />
                  {STATUS_LABELS[status]}
                </dt>
                <dd className="mt-0.5 text-base font-semibold text-zinc-100 tabular-nums">
                  {counts[status]}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </Panel>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <Panel
          title="Next best actions"
          className="lg:col-span-3"
          action={
            actions.length > LIST_LIMIT && (
              <span className="text-xs text-zinc-500">
                Showing {LIST_LIMIT} of {actions.length}
              </span>
            )
          }
        >
          {actions.length === 0 ? (
            <EmptyNote icon={CheckCircle2}>
              {total === 0 ? (
                <>
                  Nothing tracked yet. Add your first job from the{" "}
                  <Link
                    href="/dashboard"
                    className={cn(
                      "rounded text-indigo-400 transition-colors hover:text-indigo-300",
                      FOCUS,
                    )}
                  >
                    dashboard
                  </Link>
                  .
                </>
              ) : (
                "You are all caught up."
              )}
            </EmptyNote>
          ) : (
            <ul className="p-1.5">
              {actions.slice(0, LIST_LIMIT).map((action) => (
                <li key={action.key}>
                  <button
                    type="button"
                    onClick={() =>
                      openApplication(action.applicationId, action.tab)
                    }
                    className={cn(
                      "group flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors duration-150 hover:bg-zinc-800/40",
                      FOCUS,
                    )}
                  >
                    <span
                      className={cn(
                        "flex size-8 shrink-0 items-center justify-center rounded-lg",
                        action.tone,
                      )}
                    >
                      <action.icon className="size-4" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium text-zinc-100">
                        {action.title}
                      </span>
                      <span className="block truncate text-xs text-zinc-400">
                        {action.detail}
                      </span>
                    </span>
                    <ArrowUpRight
                      className="size-4 shrink-0 text-zinc-600 transition-colors duration-150 group-hover:text-zinc-200"
                      aria-hidden
                    />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel
          title="Coming up"
          className="lg:col-span-2"
          action={<PanelLink href="/calendar">Calendar</PanelLink>}
        >
          {!today || (eventsQuery.isPending && upcoming.length === 0) ? (
            <div className="space-y-2 p-4" aria-busy="true">
              {[0, 1, 2].map((row) => (
                <div
                  key={row}
                  className="h-9 animate-pulse rounded-lg bg-zinc-800/40"
                />
              ))}
            </div>
          ) : upcoming.length === 0 ? (
            <EmptyNote icon={CalendarClock}>
              {eventsQuery.isError
                ? "Your saved events could not be loaded."
                : `Nothing scheduled in the next ${UPCOMING_DAYS} days.`}
            </EmptyNote>
          ) : (
            <ul className="p-1.5">
              {upcoming.slice(0, LIST_LIMIT).map(({ day, item }) => (
                <li key={item.key}>
                  <button
                    type="button"
                    onClick={() =>
                      openApplication(
                        item.applicationId,
                        item.kind === "follow_up" ? "assets" : "prep",
                      )
                    }
                    className={cn(
                      "flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors duration-150 hover:bg-zinc-800/40",
                      FOCUS,
                    )}
                  >
                    <span
                      className={cn(
                        "size-1.5 shrink-0 rounded-full",
                        item.kind === "follow_up"
                          ? "bg-amber-400"
                          : item.kind === "note"
                            ? "bg-zinc-500"
                            : "bg-emerald-400",
                      )}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium text-zinc-100">
                        {item.title}
                      </span>
                      <span className="block truncate text-xs text-zinc-400">
                        {item.company} · {item.role}
                      </span>
                    </span>
                    <span className="shrink-0 text-right text-xs text-zinc-400 tabular-nums">
                      {day.getTime() === today.getTime()
                        ? "Today"
                        : dayFormat.format(day)}
                      {timeLabel(item.minutes) && (
                        <span className="block text-zinc-500">
                          {timeLabel(item.minutes)}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <section aria-label="Sections">
        <h2 className="mb-2 px-0.5 text-[11px] font-medium tracking-wider text-zinc-500 uppercase">
          Sections
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {NAV_ITEMS.map(({ href, label, icon: Icon, shortcut }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                CARD,
                "group flex flex-col gap-3 p-3.5 transition-[border-color,background-color,box-shadow] duration-150 ease-out hover:border-indigo-500/40 hover:bg-zinc-900/90 hover:shadow-indigo-500/10",
                FOCUS,
              )}
            >
              <span className="flex items-center justify-between">
                <span className="flex size-8 items-center justify-center rounded-lg bg-zinc-800/70 text-zinc-300 transition-colors duration-150 group-hover:bg-indigo-500/15 group-hover:text-indigo-300">
                  <Icon className="size-4" aria-hidden />
                </span>
                <span className="flex items-center gap-0.5" aria-hidden>
                  <Kbd>G</Kbd>
                  <Kbd>{shortcut}</Kbd>
                </span>
              </span>
              <span className="min-w-0">
                <span className="block text-[13px] font-medium text-zinc-100">
                  {label}
                </span>
                <span className="block truncate text-xs text-zinc-500">
                  {sectionMeta[href]}
                </span>
              </span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
