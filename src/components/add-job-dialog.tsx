"use client";

import { Loader2, Sparkles } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";

import { createApplicationAction } from "@/app/actions/applications";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogTitle,
  SheetContent,
} from "@/components/ui/dialog";
import { InlineAlert } from "@/components/ui/inline-alert";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ActionResult } from "@/lib/action-result";
import { getModel } from "@/lib/llm/models";
import { useModelConfig } from "@/lib/store";
import type { JobApplication } from "@/lib/types/resume";

interface AddJobDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called as soon as the job is saved, before tailoring starts. */
  onCreated: (application: JobApplication) => void;
  tailor: (applicationId: string) => Promise<ActionResult<JobApplication>>;
  /** Called with the application id once tailoring succeeds. */
  onTailored: (applicationId: string) => void;
}

type Phase =
  | { step: "form"; error: string | null }
  | { step: "saving" }
  | { step: "tailoring"; applicationId: string }
  | { step: "failed"; applicationId: string; error: string };

const EMPTY_FORM = {
  companyName: "",
  roleTitle: "",
  location: "",
  jobUrl: "",
  jobDescription: "",
};

const PROGRESS_MESSAGES = [
  "Reading the job description…",
  "Extracting ATS keywords and seniority…",
  "Matching against your master resume…",
  "Re-ordering and rephrasing bullets…",
  "Verifying every change against your master resume…",
];

function TailoringProgress({ modelLabel }: { modelLabel: string }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(
      () => setIndex((current) => Math.min(current + 1, PROGRESS_MESSAGES.length - 1)),
      6000,
    );
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="flex flex-col items-center px-2 py-8 text-center" role="status">
      <span className="flex size-11 items-center justify-center rounded-full bg-accent text-accent-foreground">
        <Sparkles className="size-5 animate-pulse" aria-hidden />
      </span>
      <p key={index} className="mt-4 animate-rise-in text-sm font-medium">
        {PROGRESS_MESSAGES[index]}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        Tailoring with {modelLabel}. This usually takes under a minute.
      </p>
      <div
        className="mt-5 h-1 w-48 animate-shimmer rounded-full bg-[linear-gradient(90deg,#27272a_0%,#818cf8_50%,#27272a_100%)] bg-[length:200%_100%]"
        aria-hidden
      />
      <p className="mt-5 text-xs text-muted-foreground">
        The job is already saved to your pipeline.
      </p>
    </div>
  );
}

export function AddJobDialog({
  open,
  onOpenChange,
  onCreated,
  tailor,
  onTailored,
}: AddJobDialogProps) {
  const modelConfig = useModelConfig();
  const modelLabel = getModel(modelConfig.modelId)?.label ?? modelConfig.modelId;

  const [form, setForm] = useState(EMPTY_FORM);
  const [phase, setPhase] = useState<Phase>({ step: "form", error: null });

  const busy = phase.step === "saving" || phase.step === "tailoring";

  function close() {
    onOpenChange(false);
    setForm(EMPTY_FORM);
    setPhase({ step: "form", error: null });
  }

  async function runTailoring(applicationId: string) {
    setPhase({ step: "tailoring", applicationId });
    const result = await tailor(applicationId);
    if (result.ok) {
      close();
      onTailored(applicationId);
    } else {
      setPhase({ step: "failed", applicationId, error: result.error });
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setPhase({ step: "saving" });

    const created = await createApplicationAction(form).catch(
      (): ActionResult<JobApplication> => ({
        ok: false,
        error: "Could not reach the server. Try again.",
      }),
    );
    if (!created.ok) {
      setPhase({ step: "form", error: created.error });
      return;
    }
    onCreated(created.data);
    await runTailoring(created.data.id);
  }

  const field = (name: keyof typeof EMPTY_FORM) => ({
    value: form[name],
    disabled: busy,
    onChange: (
      event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) => setForm((current) => ({ ...current, [name]: event.target.value })),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Closing mid-run would hide the result; the run itself continues.
        if (!next && busy) return;
        if (next) onOpenChange(true);
        else close();
      }}
    >
      <SheetContent className="max-w-xl border-zinc-800 bg-zinc-900/90 backdrop-blur-xl">
        <div className="border-b border-zinc-800/80 px-6 py-4 pr-12">
          <DialogTitle className="text-base font-semibold tracking-tight">
            Add a job
          </DialogTitle>
          <DialogDescription className="mt-1 text-sm text-muted-foreground">
            Paste the job description. Your master resume is tailored to it as
            a patch; nothing in the master is changed.
          </DialogDescription>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        {phase.step === "tailoring" ? (
          <TailoringProgress modelLabel={modelLabel} />
        ) : phase.step === "failed" ? (
          <div className="py-6">
            <InlineAlert tone="error">{phase.error}</InlineAlert>
            <p className="mt-3 text-sm text-muted-foreground">
              The job is saved in your pipeline without a tailored resume. You
              can retry now or later from the job&apos;s detail view.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" onClick={close}>
                Close
              </Button>
              <Button onClick={() => runTailoring(phase.applicationId)}>
                Retry tailoring
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label htmlFor="job-company" className="text-sm font-medium">
                  Company
                </label>
                <Input id="job-company" autoFocus required maxLength={200} {...field("companyName")} />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="job-role" className="text-sm font-medium">
                  Role
                </label>
                <Input id="job-role" required maxLength={200} {...field("roleTitle")} />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="job-location" className="text-sm font-medium">
                  Location{" "}
                  <span className="font-normal text-muted-foreground">(optional)</span>
                </label>
                <Input id="job-location" maxLength={200} {...field("location")} />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="job-url" className="text-sm font-medium">
                  Job link{" "}
                  <span className="font-normal text-muted-foreground">(optional)</span>
                </label>
                <Input id="job-url" type="url" placeholder="https://" {...field("jobUrl")} />
              </div>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="job-description" className="text-sm font-medium">
                Job description
              </label>
              <Textarea
                id="job-description"
                required
                rows={12}
                maxLength={30_000}
                placeholder="Paste the full posting: responsibilities, requirements, nice-to-haves."
                className="min-h-40 resize-y"
                {...field("jobDescription")}
              />
            </div>

            {phase.step === "form" && phase.error && (
              <InlineAlert tone="error">{phase.error}</InlineAlert>
            )}

            <div className="flex items-center justify-between gap-3 pt-1">
              <p className="text-xs text-muted-foreground">
                Tailors with {modelLabel}
              </p>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={close} disabled={busy}>
                  Cancel
                </Button>
                <Button type="submit" disabled={busy}>
                  {phase.step === "saving" ? (
                    <Loader2 className="animate-spin" aria-hidden />
                  ) : (
                    <Sparkles aria-hidden />
                  )}
                  Save and tailor
                </Button>
              </div>
            </div>
          </form>
        )}
        </div>
      </SheetContent>
    </Dialog>
  );
}
