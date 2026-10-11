"use client";

import {
  Calendar as CalendarIcon,
  Clock,
  FileText,
  Loader2,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useState, useTransition, type FormEvent } from "react";
import { toast } from "sonner";

import {
  createCalendarEventAction,
  deleteCalendarEventAction,
  updateCalendarEventAction,
} from "@/app/actions/calendar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { dayKey } from "@/lib/calendar/items";
import {
  CALENDAR_EVENT_TYPES,
  type CalendarEvent,
  type CalendarEventType,
} from "@/lib/types/calendar";
import type { JobApplication } from "@/lib/types/resume";
import { cn } from "@/lib/utils";

export const EVENT_TYPE_CONFIG: Record<
  CalendarEventType,
  {
    label: string;
    defaultTitle: (company?: string) => string;
    badgeStyle: string;
    dotColor: string;
  }
> = {
  INTERVIEW: {
    label: "Interview Round",
    defaultTitle: (c) => (c ? `Interview with ${c}` : "Technical Interview"),
    badgeStyle: "bg-emerald-950/70 text-emerald-300 border-emerald-800/60",
    dotColor: "bg-emerald-400",
  },
  SCREENING: {
    label: "Recruiter Screen",
    defaultTitle: (c) => (c ? `Screening Call with ${c}` : "Recruiter Screen"),
    badgeStyle: "bg-teal-950/70 text-teal-300 border-teal-800/60",
    dotColor: "bg-teal-400",
  },
  FOLLOW_UP: {
    label: "Follow-Up Reminder",
    defaultTitle: (c) => (c ? `Follow up with ${c}` : "Send Follow-Up"),
    badgeStyle: "bg-amber-950/70 text-amber-300 border-amber-800/60",
    dotColor: "bg-amber-400",
  },
  DEADLINE: {
    label: "Submission Deadline",
    defaultTitle: (c) => (c ? `Application Deadline for ${c}` : "Application Deadline"),
    badgeStyle: "bg-rose-950/70 text-rose-300 border-rose-800/60",
    dotColor: "bg-rose-400",
  },
  OFFER_EXPIRY: {
    label: "Offer Decision / Expiry",
    defaultTitle: (c) => (c ? `Offer Decision Deadline (${c})` : "Offer Decision Deadline"),
    badgeStyle: "bg-purple-950/70 text-purple-300 border-purple-800/60",
    dotColor: "bg-purple-400",
  },
  NOTE: {
    label: "Note / Milestone",
    defaultTitle: () => "Career Milestone",
    badgeStyle: "bg-zinc-800 text-zinc-300 border-zinc-700/60",
    dotColor: "bg-zinc-400",
  },
};

interface EventModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialEvent?: CalendarEvent | null;
  defaultDate?: Date | null;
  applications: JobApplication[];
  onSaved: (event: CalendarEvent) => void;
  onDeleted?: (id: string) => void;
}

export function EventModal({
  open,
  onOpenChange,
  initialEvent,
  defaultDate,
  applications,
  onSaved,
  onDeleted,
}: EventModalProps) {
  const [isPending, startTransition] = useTransition();
  const [isDeleting, setIsDeleting] = useState(false);

  // Form states
  const [applicationId, setApplicationId] = useState<string>("");
  const [type, setType] = useState<CalendarEventType>("INTERVIEW");
  const [title, setTitle] = useState("");
  const [startDate, setStartDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endDate, setEndDate] = useState("");
  const [endTime, setEndTime] = useState("");
  const [allDay, setAllDay] = useState(false);
  const [notes, setNotes] = useState("");

  // Initialize or reset when modal opens or initialEvent changes
  useEffect(() => {
    if (!open) return;

    if (initialEvent) {
      setApplicationId(initialEvent.applicationId ?? "");
      setType(initialEvent.type);
      setTitle(initialEvent.title);
      setAllDay(initialEvent.allDay);
      setNotes(initialEvent.notes ?? "");

      const start = new Date(initialEvent.startsAt);
      setStartDate(dayKey(start));
      if (!initialEvent.allDay) {
        const hh = String(start.getHours()).padStart(2, "0");
        const mm = String(start.getMinutes()).padStart(2, "0");
        setStartTime(`${hh}:${mm}`);
      } else {
        setStartTime("");
      }

      if (initialEvent.endsAt) {
        const end = new Date(initialEvent.endsAt);
        setEndDate(dayKey(end));
        if (!initialEvent.allDay) {
          const hh = String(end.getHours()).padStart(2, "0");
          const mm = String(end.getMinutes()).padStart(2, "0");
          setEndTime(`${hh}:${mm}`);
        } else {
          setEndTime("");
        }
      } else {
        setEndDate("");
        setEndTime("");
      }
    } else {
      // Create mode
      const anchor = defaultDate ? defaultDate : new Date();
      setApplicationId("");
      setType("INTERVIEW");
      setTitle("");
      setAllDay(false);
      setStartDate(dayKey(anchor));
      setStartTime("14:00");
      setEndDate(dayKey(anchor));
      setEndTime("15:00");
      setNotes("");
    }
    setIsDeleting(false);
  }, [open, initialEvent, defaultDate]);

  const selectedApp = applications.find((a) => a.id === applicationId);

  function handleApplicationChange(newAppId: string) {
    setApplicationId(newAppId);
    const app = applications.find((a) => a.id === newAppId);
    if (app && (!title || title.trim().length === 0 || title.includes("Interview") || title.includes("Screening"))) {
      setTitle(EVENT_TYPE_CONFIG[type].defaultTitle(app.companyName));
    }
  }

  function handleTypeChange(newType: CalendarEventType) {
    setType(newType);
    if (!title || Object.values(EVENT_TYPE_CONFIG).some((cfg) => cfg.defaultTitle(selectedApp?.companyName) === title)) {
      setTitle(EVENT_TYPE_CONFIG[newType].defaultTitle(selectedApp?.companyName));
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();

    if (!title.trim()) {
      toast.error("Please provide an event title.");
      return;
    }

    if (!startDate) {
      toast.error("Please specify a start date.");
      return;
    }

    const startDateTime = allDay || !startTime
      ? new Date(`${startDate}T12:00:00Z`)
      : new Date(`${startDate}T${startTime}:00`);

    let endDateTime: Date | null = null;
    if (endDate) {
      endDateTime = allDay || !endTime
        ? new Date(`${endDate}T12:00:00Z`)
        : new Date(`${endDate}T${endTime}:00`);
    }

    startTransition(async () => {
      if (initialEvent) {
        // Edit mode
        const res = await updateCalendarEventAction(initialEvent.id, {
          applicationId: applicationId || null,
          type,
          title: title.trim(),
          startsAt: startDateTime.toISOString(),
          endsAt: endDateTime ? endDateTime.toISOString() : null,
          allDay,
          notes: notes.trim() || null,
        });

        if (!res.ok) {
          toast.error(res.error);
          return;
        }

        toast.success("Event updated successfully.");
        onSaved(res.data);
        onOpenChange(false);
      } else {
        // Create mode
        const res = await createCalendarEventAction({
          applicationId: applicationId || null,
          type,
          title: title.trim(),
          startsAt: startDateTime.toISOString(),
          endsAt: endDateTime ? endDateTime.toISOString() : null,
          allDay,
          notes: notes.trim() || null,
        });

        if (!res.ok) {
          toast.error(res.error);
          return;
        }

        toast.success("Event scheduled on calendar.");
        onSaved(res.data);
        onOpenChange(false);
      }
    });
  }

  function handleDelete() {
    if (!initialEvent) return;

    startTransition(async () => {
      const res = await deleteCalendarEventAction(initialEvent.id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }

      toast.success("Event removed from calendar.");
      onDeleted?.(initialEvent.id);
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg border-zinc-800 bg-zinc-950 p-6 text-zinc-100 shadow-2xl">
        <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3">
          <div>
            <DialogTitle className="flex items-center gap-2 text-base font-semibold tracking-tight text-zinc-100">
              <CalendarIcon className="size-4 text-indigo-400" />
              {initialEvent ? "Edit Milestone / Round" : "Schedule Milestone / Round"}
            </DialogTitle>
            <DialogDescription className="text-xs text-zinc-400">
              Track interviews, follow-ups, and offer decision windows with automated reminders.
            </DialogDescription>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {/* Application Selector */}
          <div>
            <label className="text-xs font-semibold tracking-wide text-zinc-300 uppercase">
              Linked Application
            </label>
            <p className="text-[11px] text-zinc-500 mb-1.5">
              Connect to an active job to unlock the STAR Response Studio and email thread integration.
            </p>
            <Select
              value={applicationId}
              onChange={(e) => handleApplicationChange(e.target.value)}
              className="bg-zinc-900 text-xs"
            >
              <option value="">None · Standalone Career Milestone</option>
              {applications.map((app) => (
                <option key={app.id} value={app.id}>
                  {app.companyName} · {app.roleTitle} ({app.status})
                </option>
              ))}
            </Select>
          </div>

          {/* Event Type Grid Selector */}
          <div>
            <label className="text-xs font-semibold tracking-wide text-zinc-300 uppercase">
              Event Classification
            </label>
            <div className="mt-1.5 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {CALENDAR_EVENT_TYPES.map((t) => {
                const config = EVENT_TYPE_CONFIG[t];
                const active = type === t;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => handleTypeChange(t)}
                    className={cn(
                      "flex items-center gap-2 rounded-md border p-2 text-left text-xs transition-colors duration-150 outline-none",
                      active
                        ? "border-indigo-500/60 bg-indigo-500/10 font-medium text-zinc-100"
                        : "border-zinc-800 bg-zinc-900/40 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200",
                    )}
                  >
                    <span className={cn("size-2 rounded-full", config.dotColor)} />
                    <span className="truncate">{config.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Event Title */}
          <div>
            <label className="text-xs font-semibold tracking-wide text-zinc-300 uppercase">
              Event Title
            </label>
            <Input
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Technical System Design Round with Stripe"
              className="mt-1 text-xs bg-zinc-900"
            />
          </div>

          {/* Date & Time Settings */}
          <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/30 p-3.5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-zinc-300">
                Date & Time Scheduling
              </span>
              <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={allDay}
                  onChange={(e) => setAllDay(e.target.checked)}
                  className="size-3.5 rounded border-zinc-700 bg-zinc-900 text-indigo-600 focus:ring-indigo-500"
                />
                <span>All-Day Event</span>
              </label>
            </div>

            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <div>
                <label className="text-[11px] text-zinc-500">Start Date & Time</label>
                <div className="mt-1 flex gap-1.5">
                  <Input
                    type="date"
                    required
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="text-xs bg-zinc-900 flex-1"
                  />
                  {!allDay && (
                    <Input
                      type="time"
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                      className="text-xs bg-zinc-900 w-28"
                    />
                  )}
                </div>
              </div>

              <div>
                <label className="text-[11px] text-zinc-500">End Date & Time (Optional)</label>
                <div className="mt-1 flex gap-1.5">
                  <Input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="text-xs bg-zinc-900 flex-1"
                  />
                  {!allDay && (
                    <Input
                      type="time"
                      value={endTime}
                      onChange={(e) => setEndTime(e.target.value)}
                      className="text-xs bg-zinc-900 w-28"
                    />
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Notes & Links */}
          <div>
            <label className="text-xs font-semibold tracking-wide text-zinc-300 uppercase">
              Meeting Notes & Links
            </label>
            <p className="text-[11px] text-zinc-500 mb-1">
              Store Google Meet/Zoom links, interviewer names, or specific STAR topics to rehearse.
            </p>
            <Textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Zoom link: https://zoom.us/j/... Interviewers: Dave (Staff Eng) & Sarah (EM). Prep topics: distributed transactions and raft replication."
              className="text-xs bg-zinc-900 resize-none font-mono text-[11px]"
            />
          </div>

          {/* Modal Actions */}
          <div className="flex items-center justify-between border-t border-zinc-800/80 pt-4">
            {initialEvent ? (
              isDeleting ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-red-400 font-medium">Confirm delete?</span>
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    onClick={handleDelete}
                    disabled={isPending}
                    className="h-8 text-xs bg-red-600 hover:bg-red-500"
                  >
                    {isPending ? "Deleting..." : "Yes, Delete"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setIsDeleting(false)}
                    className="h-8 text-xs"
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsDeleting(true)}
                  disabled={isPending}
                  className="h-8 text-xs text-red-400 border-red-900/40 hover:bg-red-950/40 gap-1.5"
                >
                  <Trash2 className="size-3.5" /> Delete
                </Button>
              )
            ) : (
              <div />
            )}

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onOpenChange(false)}
                disabled={isPending}
                className="h-8 text-xs"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={isPending}
                className="h-8 text-xs bg-indigo-600 hover:bg-indigo-500 text-white gap-1"
              >
                {isPending && <Loader2 className="size-3 animate-spin" />}
                {initialEvent ? "Update Milestone" : "Schedule Event"}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
