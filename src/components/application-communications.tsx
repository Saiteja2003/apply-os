"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  ChevronDown,
  Copy,
  Loader2,
  Mail,
  Save,
  Sparkles,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import {
  generateDraftResponseAction,
  updateDraftResponseAction,
} from "@/app/actions/email";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InlineAlert } from "@/components/ui/inline-alert";
import { Textarea } from "@/components/ui/textarea";
import { useWorkspace } from "@/components/workspace-provider";
import type { ActionResult } from "@/lib/action-result";
import { fetchEmailInteractions, queryKeys } from "@/lib/api";
import type { EmailIntent, EmailInteraction } from "@/lib/types/email";
import { cn, formatDate } from "@/lib/utils";

/** A fresh email gets its draft within about this long, if one is coming. */
const DRAFT_WINDOW_MS = 3 * 60_000;

const INTENT_LABELS: Record<EmailIntent, string> = {
  SCREENING: "Screening",
  INTERVIEW: "Interview",
  REJECTION: "Rejection",
  OTHER: "Message",
};

const INTENT_VARIANTS: Record<EmailIntent, BadgeProps["variant"]> = {
  SCREENING: "accent",
  INTERVIEW: "success",
  REJECTION: "danger",
  OTHER: "neutral",
};

/**
 * The emails received for one application. Shared by the drawer's tab label
 * (the count) and the tab itself, so they read one cache entry. Refetches on
 * every open, and while a draft is still being written.
 */
export function useEmailInteractions(applicationId: string) {
  const { userId } = useWorkspace();
  return useQuery({
    queryKey: queryKeys.emailInteractions(userId, applicationId),
    queryFn: () => fetchEmailInteractions(applicationId),
    staleTime: 0,
    refetchInterval: (query) => {
      const waiting = query.state.data?.some(
        (item) =>
          !item.draftResponse &&
          Date.now() - new Date(item.receivedAt).getTime() < DRAFT_WINDOW_MS,
      );
      return waiting ? 5_000 : false;
    },
  });
}

function DraftCard({
  interaction,
  onSaved,
}: {
  interaction: EmailInteraction;
  onSaved: (interaction: EmailInteraction) => void;
}) {
  const saved = interaction.draftResponse ?? "";
  const [draft, setDraft] = useState(saved);
  const [syncedFrom, setSyncedFrom] = useState(saved);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // A draft that arrives from the server (the webhook, or Draft a reply)
  // replaces the box, unless the user has started typing their own.
  if (saved !== syncedFrom) {
    setSyncedFrom(saved);
    if (draft.trim() === syncedFrom.trim()) setDraft(saved);
  }

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const dirty = draft.trim() !== saved.trim();
  const waiting =
    !saved && Date.now() - new Date(interaction.receivedAt).getTime() < DRAFT_WINDOW_MS;

  async function run(
    task: () => Promise<ActionResult<EmailInteraction>>,
    success: string,
    failure: string,
  ) {
    const result = await task().catch(
      (): ActionResult<EmailInteraction> => ({
        ok: false,
        error: "Could not reach the server. Try again.",
      }),
    );
    if (result.ok) {
      onSaved(result.data);
      toast.success(success);
    } else {
      toast.error(failure, { description: result.error });
    }
    return result.ok;
  }

  async function save() {
    setSaving(true);
    await run(
      () => updateDraftResponseAction(interaction.id, draft),
      "Reply saved",
      "Could not save the reply",
    );
    setSaving(false);
  }

  async function generate() {
    setGenerating(true);
    await run(
      () => generateDraftResponseAction(interaction.id),
      "Reply drafted",
      "Could not draft a reply",
    );
    setGenerating(false);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(draft);
    } catch {
      toast.error("Could not copy", {
        description: "Your browser blocked clipboard access. Select the text and copy it by hand.",
      });
      return;
    }
    setCopied(true);
    toast.success("Reply copied", { description: "Paste it into your email to send." });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1800);
  }

  if (!saved && !dirty) {
    return (
      <div className="rounded-lg border border-dashed border-zinc-800 px-4 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium">
              {waiting ? "Drafting a reply…" : "No reply drafted yet"}
            </p>
            <p className="text-xs text-muted-foreground">
              {waiting
                ? "It will appear here in a moment."
                : "Write one from this email, then edit it before you send."}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={generating || waiting}
            onClick={() => void generate()}
          >
            {generating || waiting ? (
              <Loader2 className="animate-spin" aria-hidden />
            ) : (
              <Sparkles aria-hidden />
            )}
            {generating ? "Drafting…" : "Draft a reply"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-indigo-500/25 bg-indigo-500/5">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-indigo-500/15 px-3.5 py-2">
        <p className="text-xs font-medium text-indigo-200">Draft reply</p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={!dirty || saving || !draft.trim()}
            onClick={() => void save()}
          >
            {saving ? (
              <Loader2 className="animate-spin" aria-hidden />
            ) : (
              <Save aria-hidden />
            )}
            {dirty ? "Save changes" : "Saved"}
          </Button>
          <Button
            size="sm"
            disabled={!draft.trim()}
            onClick={() => void copy()}
            className={cn(copied && "bg-emerald-600 hover:bg-emerald-600")}
          >
            <span className="relative size-4">
              <Copy
                className={cn(
                  "absolute inset-0 transition-[opacity,scale] duration-200 ease-out",
                  copied && "scale-50 opacity-0",
                )}
                aria-hidden
              />
              <Check
                className={cn(
                  "absolute inset-0 transition-[opacity,scale] duration-200 ease-out",
                  !copied && "scale-50 opacity-0",
                )}
                aria-hidden
              />
            </span>
            <span aria-live="polite">{copied ? "Copied" : "Copy Reply"}</span>
          </Button>
        </div>
      </div>
      <div className="p-3">
        <Textarea
          value={draft}
          aria-label="Draft reply"
          rows={7}
          className="min-h-36 resize-y [field-sizing:content]"
          onChange={(event) => setDraft(event.target.value)}
        />
      </div>
    </div>
  );
}

function EmailCard({
  interaction,
  defaultOpen,
  onSaved,
}: {
  interaction: EmailInteraction;
  defaultOpen: boolean;
  onSaved: (interaction: EmailInteraction) => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const body = interaction.bodyText.trim();
  const sender = interaction.senderName
    ? `${interaction.senderName} · ${interaction.sender}`
    : interaction.sender;

  return (
    <li className="space-y-3 rounded-xl border border-zinc-800/80 bg-zinc-900/60 p-4 backdrop-blur-md">
      <div>
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <Badge variant={INTENT_VARIANTS[interaction.intent]}>
            {INTENT_LABELS[interaction.intent]}
          </Badge>
          <span className="min-w-0 truncate text-xs text-muted-foreground">
            {sender}
          </span>
          <span className="ml-auto text-xs whitespace-nowrap text-zinc-500">
            {formatDate(interaction.receivedAt)}
          </span>
        </div>
        <h3 className="mt-2 text-sm font-medium">
          {interaction.subject || "(no subject)"}
        </h3>
      </div>

      <div>
        <p
          className={cn(
            "text-sm leading-relaxed whitespace-pre-wrap text-zinc-300",
            !open && "line-clamp-3",
          )}
        >
          {body || "(empty message)"}
        </p>
        {body.length > 160 || body.split("\n").length > 3 ? (
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((current) => !current)}
            className="mt-1.5 inline-flex cursor-pointer items-center gap-1 rounded text-xs text-indigo-400 transition-colors duration-150 outline-none hover:text-indigo-300 focus-visible:ring-2 focus-visible:ring-ring"
          >
            {open ? "Show less" : "Show full message"}
            <ChevronDown
              className={cn(
                "size-3.5 transition-transform duration-150",
                open && "rotate-180",
              )}
              aria-hidden
            />
          </button>
        ) : null}
      </div>

      <DraftCard interaction={interaction} onSaved={onSaved} />
    </li>
  );
}

/** The Communications tab: recruiter emails and the replies drafted for them. */
export function ApplicationCommunications({
  applicationId,
}: {
  applicationId: string;
}) {
  const { userId } = useWorkspace();
  const queryClient = useQueryClient();
  const { data, isPending, isError, refetch } = useEmailInteractions(applicationId);

  function replace(updated: EmailInteraction) {
    queryClient.setQueryData<EmailInteraction[]>(
      queryKeys.emailInteractions(userId, applicationId),
      (current = []) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
    );
  }

  if (isPending) {
    return (
      <div className="space-y-3" aria-busy="true">
        <div className="h-40 animate-pulse rounded-xl bg-zinc-800/40" />
        <div className="h-24 animate-pulse rounded-xl bg-zinc-800/30" />
      </div>
    );
  }

  // A failed refresh keeps showing what was already loaded.
  if (isError && !data) {
    return (
      <div className="flex flex-wrap items-center gap-3 [&>div]:flex-1">
        <InlineAlert tone="error">Could not load the emails for this job.</InlineAlert>
        <Button variant="outline" size="sm" onClick={() => void refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-zinc-800 px-4 py-10 text-center">
        <span className="mx-auto flex size-10 items-center justify-center rounded-full bg-indigo-500/15 text-indigo-300">
          <Mail className="size-5" aria-hidden />
        </span>
        <p className="mt-3 text-sm font-medium">No emails yet</p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
          Recruiter emails forwarded to ApplyOS appear here, matched to the
          right job, with a reply drafted for you to review.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Replies are drafts. ApplyOS never sends email: copy a reply into your
        own mail client after you have read it.
      </p>
      <ul className="space-y-4">
        {data.map((interaction, index) => (
          <EmailCard
            key={interaction.id}
            interaction={interaction}
            defaultOpen={index === 0}
            onSaved={replace}
          />
        ))}
      </ul>
    </div>
  );
}
