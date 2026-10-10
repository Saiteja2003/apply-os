"use client";

import { Check, Copy, Download, Loader2, Save } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { updateCoverLetterAction } from "@/app/actions/applications";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { ActionResult } from "@/lib/action-result";
import type { JobApplication, MasterResumeVersion } from "@/lib/types/resume";
import { cn } from "@/lib/utils";

interface ApplicationAssetsProps {
  application: JobApplication;
  master: MasterResumeVersion | null;
  isTailoring: boolean;
  onTailor: () => void;
  /** Called with the saved row after the cover letter is edited. */
  onSaved: (application: JobApplication) => void;
}

const wordCount = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

/** Copies `text`; the icon turns into a check for a moment to confirm. */
function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      toast.error("Could not copy", {
        description: "Your browser blocked clipboard access. Select the text and copy it by hand.",
      });
      return;
    }
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1800);
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => void copy()}
      className={cn(copied && "border-emerald-500/40 text-emerald-300")}
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
            "absolute inset-0 text-emerald-400 transition-[opacity,scale] duration-200 ease-out",
            !copied && "scale-50 opacity-0",
          )}
          aria-hidden
        />
      </span>
      <span aria-live="polite">{copied ? "Copied" : label}</span>
    </Button>
  );
}

function Block({
  title,
  meta,
  action,
  children,
}: {
  title: string;
  meta?: string;
  action: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-zinc-800/80 bg-zinc-900/60">
      <div className="flex items-center justify-between gap-3 border-b border-zinc-800/80 px-3.5 py-2">
        <p className="text-xs font-medium text-zinc-400">
          {title}
          {meta && <span className="ml-2 font-normal text-zinc-600">{meta}</span>}
        </p>
        {action}
      </div>
      <div className="px-3.5 py-3 text-sm leading-relaxed whitespace-pre-wrap text-zinc-200">
        {children}
      </div>
    </div>
  );
}

export function ApplicationAssets({
  application,
  master,
  isTailoring,
  onTailor,
  onSaved,
}: ApplicationAssetsProps) {
  const letter = application.coverLetter;
  const outreach = application.recruiterOutreach;

  const [draft, setDraft] = useState(letter?.content ?? "");
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);

  // A fresh tailoring run replaces the letter: show the new text.
  const savedContent = letter?.content ?? "";
  const [syncedContent, setSyncedContent] = useState(savedContent);
  if (savedContent !== syncedContent) {
    setSyncedContent(savedContent);
    setDraft(savedContent);
  }

  const dirty = draft.trim() !== savedContent.trim();

  if (!letter && !outreach) {
    const tailored = application.patchDocument !== null;
    return (
      <div className="rounded-xl border border-dashed border-zinc-800 px-4 py-10 text-center">
        <p className="text-sm font-medium">No cover letter or outreach yet</p>
        <p className="mx-auto mt-1 mb-4 max-w-sm text-sm text-muted-foreground">
          {tailored
            ? "This application was tailored before letters were part of the run. Tailor it again to write them. If they still do not appear, run supabase/migrations/003_application_assets.sql in the Supabase SQL editor."
            : "Tailoring writes the resume patch, a cover letter and a recruiter message in one run, all from your master resume."}
        </p>
        <Button disabled={isTailoring} onClick={onTailor}>
          {isTailoring && <Loader2 className="animate-spin" aria-hidden />}
          {isTailoring ? "Tailoring…" : tailored ? "Tailor again" : "Tailor now"}
        </Button>
      </div>
    );
  }

  async function save() {
    setSaving(true);
    const result = await updateCoverLetterAction(application.id, draft).catch(
      (): ActionResult<JobApplication> => ({
        ok: false,
        error: "Could not reach the server. Try again.",
      }),
    );
    setSaving(false);
    if (result.ok) {
      onSaved(result.data);
      toast.success("Cover letter saved");
    } else {
      toast.error("Could not save the cover letter", { description: result.error });
    }
  }

  async function download() {
    if (!master) return;
    setExporting(true);
    try {
      // The PDF engine is large, so it is loaded on demand.
      const { renderCoverLetter } = await import("@/lib/pdf/cover-letter");
      const { blob, fileName } = await renderCoverLetter({
        basics: master.resume.basics,
        companyName: application.companyName,
        roleTitle: application.roleTitle,
        content: draft,
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (error) {
      console.error(error);
      toast.error("Could not create the PDF");
    } finally {
      setExporting(false);
    }
  }

  const messageWords = outreach ? wordCount(outreach.inmailBody) : 0;

  return (
    <div className="space-y-6">
      {letter && (
        <section>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-medium">Cover letter</h3>
              <p className="text-xs text-muted-foreground">
                {wordCount(draft)} words · edit freely; the greeting and your
                signature are added in the PDF
              </p>
            </div>
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
                disabled={exporting || !master || !draft.trim()}
                onClick={() => void download()}
              >
                {exporting ? (
                  <Loader2 className="animate-spin" aria-hidden />
                ) : (
                  <Download aria-hidden />
                )}
                Download Cover Letter PDF
              </Button>
            </div>
          </div>
          <Textarea
            value={draft}
            aria-label="Cover letter"
            rows={14}
            className="mt-2 min-h-64 resize-y [field-sizing:content]"
            onChange={(event) => setDraft(event.target.value)}
          />
        </section>
      )}

      {outreach && (
        <section className="space-y-2.5">
          <div>
            <h3 className="text-sm font-medium">Recruiter outreach</h3>
            <p className="text-xs text-muted-foreground">
              For LinkedIn InMail or a cold email
            </p>
          </div>
          <Block
            title="Subject"
            action={<CopyButton text={outreach.subject} label="Copy Subject" />}
          >
            {outreach.subject}
          </Block>
          <Block
            title="Message"
            meta={`${messageWords} words${messageWords > 100 ? " · over the 100-word target" : ""}`}
            action={<CopyButton text={outreach.inmailBody} label="Copy InMail" />}
          >
            {outreach.inmailBody}
          </Block>
          {outreach.shortHook && (
            <Block
              title="One-line hook"
              meta="for a connection request"
              action={<CopyButton text={outreach.shortHook} label="Copy" />}
            >
              {outreach.shortHook}
            </Block>
          )}
        </section>
      )}

      <p className="border-t border-zinc-800/80 pt-4 text-xs text-muted-foreground">
        Written from your master resume and the job description. Sentences
        with a figure or skill found in neither were removed before you saw
        them. Read it through before you send it.
      </p>
    </div>
  );
}
