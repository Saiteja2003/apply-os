"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useState, type FormEvent } from "react";

import {
  createCalendarEventAction,
  type NewCalendarEventInput,
} from "@/app/actions/calendar";
import { Field, TextField } from "@/components/resume/fields";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { InlineAlert } from "@/components/ui/inline-alert";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { ActionResult } from "@/lib/action-result";
import { dayKey } from "@/lib/calendar/items";
import {
  CALENDAR_EVENT_TYPES,
  type CalendarEvent,
  type CalendarEventType,
} from "@/lib/types/calendar";
import type { JobApplication } from "@/lib/types/resume";
import { cn } from "@/lib/utils";

export const EVENT_TYPE_LABELS: Record<CalendarEventType, string> = {
  INTERVIEW: "Interview",
  SCREENING: "Screening call",
  FOLLOW_UP: "Follow-up reminder",
  DEADLINE: "Deadline",
  OFFER_EXPIRY: "Offer expiry",
  NOTE: "Note",
};

const TITLE_PLACEHOLDERS: Record<CalendarEventType, string> = {
  INTERVIEW: "Technical round, onsite loop…",
  SCREENING: "Recruiter screen",
  FOLLOW_UP: "Follow-up reminder",
  DEADLINE: "Application deadline",
  OFFER_EXPIRY: "Offer decision date",
  NOTE: "What to remember",
};

interface AddEventDialogProps {
  /** The day the event is being added to, or `null` when closed. */
  date: Date | null;
  applications: JobApplication[];
  onClose: () => void;
  onCreated: (event: CalendarEvent) => void;
}

/** Mount with a `key` per opening so the form starts clean each time. */
export function AddEventDialog({
  date,
  applications,
  onClose,
  onCreated,
}: AddEventDialogProps) {
  const [applicationId, setApplicationId] = useState("");
  const [type, setType] = useState<CalendarEventType>("INTERVIEW");
  const [title, setTitle] = useState("");
  const [day, setDay] = useState(date ? dayKey(date) : "");
  const [time, setTime] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const sorted = [...applications].sort((a, b) =>
    a.companyName.localeCompare(b.companyName),
  );

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    // Entered in local time; stored as an instant.
    const startsAt = new Date(`${day}T${time || "00:00"}`);
    if (Number.isNaN(startsAt.getTime())) {
      setError("Choose a valid date.");
      return;
    }

    const input: NewCalendarEventInput = {
      applicationId,
      type,
      title: title.trim() || EVENT_TYPE_LABELS[type],
      startsAt: startsAt.toISOString(),
      allDay: time === "",
      notes,
    };

    setSaving(true);
    const result = await createCalendarEventAction(input).catch(
      (): ActionResult<CalendarEvent> => ({
        ok: false,
        error: "Could not reach the server. Try again.",
      }),
    );
    setSaving(false);

    if (result.ok) onCreated(result.data);
    else setError(result.error);
  }

  return (
    <Dialog
      open={date !== null}
      onOpenChange={(open) => {
        if (!open && !saving) onClose();
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogTitle className="text-base font-semibold tracking-tight">
          Add to calendar
        </DialogTitle>
        <DialogDescription className="mt-1 text-sm text-muted-foreground">
          An interview stage, a screening call or a note, linked to one of
          your applications.
        </DialogDescription>

        {applications.length === 0 ? (
          <div className="mt-5 rounded-lg border border-dashed border-zinc-800 px-4 py-8 text-center">
            <p className="text-sm font-medium">No applications to link to</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Add a job on the{" "}
              <Link
                href="/dashboard"
                className="rounded text-indigo-400 transition-colors outline-none hover:text-indigo-300 focus-visible:ring-2 focus-visible:ring-ring"
              >
                dashboard
              </Link>{" "}
              first.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            <Field label="Application">
              <Select
                required
                autoFocus
                value={applicationId}
                disabled={saving}
                onChange={(event) => setApplicationId(event.target.value)}
              >
                <option value="" disabled>
                  Choose an application
                </option>
                {sorted.map((application) => (
                  <option key={application.id} value={application.id}>
                    {application.companyName} · {application.roleTitle}
                  </option>
                ))}
              </Select>
            </Field>

            <div>
              <p className="mb-1.5 text-xs font-medium text-zinc-400">Type</p>
              <div
                className="flex gap-1 rounded-md bg-zinc-950/60 p-1"
                role="radiogroup"
                aria-label="Event type"
              >
                {CALENDAR_EVENT_TYPES.map((option) => (
                  <button
                    key={option}
                    type="button"
                    role="radio"
                    aria-checked={type === option}
                    disabled={saving}
                    onClick={() => setType(option)}
                    className={cn(
                      "flex-1 rounded px-2 py-1.5 text-sm transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      type === option
                        ? "bg-zinc-800 font-medium text-zinc-100 shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {EVENT_TYPE_LABELS[option]}
                  </button>
                ))}
              </div>
            </div>

            <TextField
              label="Title"
              hint="optional"
              maxLength={160}
              disabled={saving}
              placeholder={TITLE_PLACEHOLDERS[type]}
              value={title}
              onChange={setTitle}
            />

            <div className="grid grid-cols-2 gap-3">
              <Field label="Date">
                <Input
                  type="date"
                  required
                  disabled={saving}
                  value={day}
                  onChange={(event) => setDay(event.target.value)}
                />
              </Field>
              <Field label="Time" hint="blank = all day">
                <Input
                  type="time"
                  disabled={saving}
                  value={time}
                  onChange={(event) => setTime(event.target.value)}
                />
              </Field>
            </div>

            <Field label="Notes" hint="optional">
              <Textarea
                rows={3}
                maxLength={2000}
                disabled={saving}
                value={notes}
                placeholder="Interviewers, meeting link, what to prepare."
                className="resize-y"
                onChange={(event) => setNotes(event.target.value)}
              />
            </Field>

            {error && <InlineAlert tone="error">{error}</InlineAlert>}

            <div className="flex justify-end gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="animate-spin" aria-hidden />}
                {saving ? "Adding…" : "Add event"}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
