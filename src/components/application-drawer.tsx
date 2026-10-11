"use client";

import {
  Building2,
  ExternalLink,
  Loader2,
  Mail,
  MapPin,
  Send,
  Sparkles,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { ApplicationAssets } from "@/components/application-assets";
import {
  ApplicationCommunications,
  useEmailInteractions,
} from "@/components/application-communications";
import { InterviewPrepStudio } from "@/components/interview/interview-prep-studio";
import { MatchScore } from "@/components/match-score";
import { ResumeDiffViewer } from "@/components/applications/resume-diff-viewer";
import { ResumePreview } from "@/components/resume-preview";
import { STATUS_LABELS } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogTitle,
  SheetContent,
} from "@/components/ui/dialog";
import { getModel } from "@/lib/llm/models";
import {
  APPLICATION_STATUSES,
  type ApplicationStatus,
  type JobApplication,
  type MasterResumeVersion,
} from "@/lib/types/resume";
import { cn, formatDate } from "@/lib/utils";

interface ApplicationDrawerProps {
  application: JobApplication | null;
  /** Changes on every open, so the drawer starts on `initialTab` again. */
  openKey: number;
  initialTab: DrawerTab;
  master: MasterResumeVersion | null;
  isTailoring: boolean;
  isPreparing: boolean;
  onClose: () => void;
  onMove: (
    applicationId: string,
    status: ApplicationStatus,
  ) => void | Promise<void>;
  onTailor: (applicationId: string) => void;
  onPrepare: (applicationId: string) => void;
  /** Called with the saved row when an asset is edited in the drawer. */
  onUpdated: (application: JobApplication) => void;
}

const TABS = [
  { id: "diff", label: "Before vs. After" },
  { id: "preview", label: "Resume preview" },
  { id: "assets", label: "Cover Letter & Outreach" },
  { id: "prep", label: "Interview prep" },
  { id: "mail", label: "Communications" },
] as const;

export type DrawerTab = (typeof TABS)[number]["id"];

type DrawerBodyProps = Omit<
  ApplicationDrawerProps,
  "application" | "onClose" | "openKey"
> & {
  application: JobApplication;
};

function DiffTab({
  application,
  master,
  isTailoring,
  onTailor,
}: Pick<DrawerBodyProps, "application" | "master" | "isTailoring" | "onTailor">) {
  const patch = application.patchDocument;

  return (
    <div className="space-y-6">
      {application.notes && (
        <p className="rounded-md bg-accent px-3 py-2 text-sm text-accent-foreground">
          {application.notes}
        </p>
      )}

      {patch && master ? (
        <ResumeDiffViewer
          master={master.resume}
          patch={patch}
          application={application}
          onTailor={() => onTailor(application.id)}
          isTailoring={isTailoring}
        />
      ) : (
        <section className="rounded-xl border border-dashed border-zinc-800 bg-zinc-900/40 p-8 text-center shadow-sm">
          <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-indigo-500/10 text-indigo-400 ring-1 ring-indigo-500/20">
            <Sparkles className="size-6" />
          </div>
          <h3 className="text-base font-semibold text-zinc-100">Ready to Tailor</h3>
          <p className="mx-auto mt-1.5 mb-6 max-w-md text-sm text-zinc-400 leading-relaxed">
            Generate an ATS-optimized variant of your resume tailored specifically for{" "}
            <span className="font-medium text-zinc-200">{application.roleTitle}</span> at{" "}
            <span className="font-medium text-zinc-200">{application.companyName}</span>. Your master resume remains 100% immutable and unedited.
          </p>
          <Button
            size="default"
            disabled={isTailoring}
            onClick={() => onTailor(application.id)}
            className="bg-indigo-600 hover:bg-indigo-500 text-white font-medium shadow-md shadow-indigo-600/20 transition-all duration-150"
          >
            {isTailoring ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Tailoring in progress…
              </>
            ) : (
              <>
                <Sparkles className="mr-2 size-4" />
                Tailor Resume with Honing
              </>
            )}
          </Button>
        </section>
      )}

      <section className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
          Job Description
        </h3>
        <p className="mt-2 text-xs font-mono leading-relaxed whitespace-pre-wrap text-zinc-400 max-h-60 overflow-y-auto pr-2">
          {application.jobDescription}
        </p>
      </section>
    </div>
  );
}

/** Opens a link in a new tab, severed from this one, as an anchor would. */
function openInNewTab(url: string) {
  const link = document.createElement("a");
  link.href = url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.click();
}

/**
 * Assisted apply for a saved, tailored job: downloads the tailored PDF,
 * copies the cover letter (or recruiter note), opens the posting and moves
 * the card to Applied. The submission itself stays with the user.
 */
function ApplyNowButton({
  application,
  master,
  patchCurrent,
  onMove,
}: {
  application: JobApplication;
  master: MasterResumeVersion | null;
  /** The patch was made against the current master resume. */
  patchCurrent: boolean;
  onMove: DrawerBodyProps["onMove"];
}) {
  const [busy, setBusy] = useState(false);
  const patch = application.patchDocument;
  const ready = Boolean(master && patch && patchCurrent);

  // The PDF engine is large: have it loaded by the time the button is used.
  useEffect(() => {
    void import("@/lib/pdf/render");
  }, []);

  async function apply() {
    if (busy || !master || !patch || !patchCurrent) return;
    setBusy(true);

    // Copy first, while the click still counts as a user gesture.
    const text =
      application.coverLetter?.content.trim() ||
      application.recruiterOutreach?.inmailBody.trim() ||
      "";
    let copied = false;
    if (text) {
      try {
        await navigator.clipboard.writeText(text);
        copied = true;
      } catch {
        // Reported in the final toast.
      }
    }

    // A failed PDF stops here: nothing is opened and nothing is marked.
    try {
      const { renderTailoredResume, resumeFileName } = await import(
        "@/lib/pdf/render"
      );
      const { blob } = await renderTailoredResume(master.resume, patch);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = resumeFileName(master.resume.basics.name, application.companyName);
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (error) {
      console.error(error);
      toast.error("Could not create the PDF", {
        description: "Nothing was opened and the job is still Saved.",
      });
      setBusy(false);
      return;
    }

    const jobUrl =
      application.jobUrl && /^https?:\/\//i.test(application.jobUrl)
        ? application.jobUrl
        : null;
    if (jobUrl) openInNewTab(jobUrl);

    await onMove(application.id, "APPLIED");

    const done = [
      "PDF downloaded",
      copied
        ? application.coverLetter
          ? "cover letter copied"
          : "recruiter note copied"
        : text
          ? "could not copy the text, copy it from the Cover Letter tab"
          : "no cover letter to copy",
      jobUrl ? "job page opened" : "no job link saved",
    ];
    toast.success(`Ready to apply to ${application.companyName}`, {
      description: `${done.join(" · ")}. Moved to Applied.`,
      action: jobUrl
        ? { label: "Open job page", onClick: () => openInNewTab(jobUrl) }
        : undefined,
    });
    setBusy(false);
  }

  return (
    <Button
      size="sm"
      className="sm:ml-auto"
      disabled={busy || !ready}
      onClick={() => void apply()}
      title={
        ready
          ? "Downloads your tailored PDF, copies your cover letter, opens the job page and moves this to Applied"
          : "Re-tailor first: this patch was made against an earlier master resume"
      }
    >
      {busy ? (
        <Loader2 className="animate-spin" aria-hidden />
      ) : (
        <Send aria-hidden />
      )}
      {busy ? "Preparing…" : "Apply now"}
    </Button>
  );
}

function DrawerBody({
  application,
  initialTab,
  master,
  isTailoring,
  isPreparing,
  onMove,
  onTailor,
  onPrepare,
  onUpdated,
}: DrawerBodyProps) {
  const [tab, setTab] = useState<DrawerTab>(initialTab);
  const emailCount = useEmailInteractions(application.id).data?.length ?? 0;
  const patch = application.patchDocument;
  const previewPatch =
    patch && master && patch.masterResumeId === master.id ? patch : null;

  return (
    <>
      <header className="border-b border-zinc-800/80 px-5 pt-4 pr-12">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <DialogTitle className="text-lg font-semibold tracking-tight">
            {application.roleTitle}
          </DialogTitle>
          <select
            aria-label="Stage"
            value={application.status}
            onChange={(event) =>
              onMove(application.id, event.target.value as ApplicationStatus)
            }
            className="h-7 rounded-md border border-zinc-800 bg-zinc-900 px-2 text-xs font-medium text-zinc-200 transition-colors duration-150 outline-none hover:border-zinc-700 focus:border-indigo-500"
          >
            {APPLICATION_STATUSES.map((status) => (
              <option key={status} value={status}>
                {STATUS_LABELS[status]}
              </option>
            ))}
          </select>
          {application.status === "SAVED" && patch && (
            <ApplyNowButton
              application={application}
              master={master}
              patchCurrent={previewPatch !== null}
              onMove={onMove}
            />
          )}
        </div>
        <DialogDescription asChild>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Building2 className="size-3.5" aria-hidden />
              {application.companyName}
            </span>
            {application.location && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-3.5" aria-hidden />
                {application.location}
              </span>
            )}
            <span>
              {application.appliedAt
                ? `Applied ${formatDate(application.appliedAt)}`
                : `Saved ${formatDate(application.createdAt)}`}
            </span>
            {application.jobUrl && (
              <a
                href={application.jobUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded text-indigo-400 outline-none hover:text-indigo-300 focus-visible:ring-2 focus-visible:ring-ring"
              >
                Posting
                <ExternalLink className="size-3" aria-hidden />
              </a>
            )}
          </div>
        </DialogDescription>

        <div className="mt-3 flex gap-1 overflow-x-auto" role="tablist" aria-label="Application detail" style={{ scrollbarWidth: "none" }}>
          {TABS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              role="tab"
              id={`tab-${id}`}
              aria-selected={tab === id}
              aria-controls={`panel-${id}`}
              onClick={() => setTab(id)}
              className={cn(
                "relative -mb-px flex shrink-0 items-center gap-1.5 rounded-t-md border-b-2 px-3 py-2 text-[13px] whitespace-nowrap transition-colors duration-150 ease-out outline-none focus-visible:ring-2 focus-visible:ring-ring",
                tab === id
                  ? "border-indigo-400 font-medium text-zinc-100"
                  : "border-transparent text-zinc-400 hover:text-zinc-200",
              )}
            >
              {label}
              {id === "prep" && isPreparing && (
                <Loader2 className="size-3 animate-spin text-indigo-400" aria-hidden />
              )}
              {id === "mail" && (
                <>
                  <Mail className="size-3.5" aria-hidden />
                  {emailCount > 0 && (
                    <span className="rounded-full bg-indigo-500/20 px-1.5 text-[11px] leading-4 font-medium text-indigo-200 tabular-nums">
                      {emailCount}
                    </span>
                  )}
                </>
              )}
            </button>
          ))}
        </div>
      </header>

      <div
        key={tab}
        role="tabpanel"
        id={`panel-${tab}`}
        aria-labelledby={`tab-${tab}`}
        className="min-h-0 flex-1 animate-rise-in overflow-y-auto px-5 py-5"
      >
        {tab === "diff" && (
          <DiffTab
            application={application}
            master={master}
            isTailoring={isTailoring}
            onTailor={onTailor}
          />
        )}
        {tab === "preview" &&
          (master ? (
            <ResumePreview
              master={master.resume}
              patch={previewPatch}
              companyName={previewPatch ? application.companyName : null}
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              No master resume found.
            </p>
          ))}
        {tab === "assets" && (
          <ApplicationAssets
            application={application}
            master={master}
            isTailoring={isTailoring}
            onTailor={() => onTailor(application.id)}
            onSaved={onUpdated}
          />
        )}
        {tab === "prep" && (
          <InterviewPrepStudio
            application={application}
            master={master}
            isPreparing={isPreparing}
            onGenerate={() => onPrepare(application.id)}
            onUpdated={onUpdated}
          />
        )}
        {tab === "mail" && (
          <ApplicationCommunications applicationId={application.id} />
        )}
      </div>
    </>
  );
}

export function ApplicationDrawer({
  application,
  openKey,
  onClose,
  ...rest
}: ApplicationDrawerProps) {
  return (
    <Dialog
      open={application !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent>
        {application && (
          <DrawerBody
            key={`${application.id}:${openKey}`}
            application={application}
            {...rest}
          />
        )}
      </SheetContent>
    </Dialog>
  );
}
