"use client";

import { Download, FileWarning, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { InlineAlert } from "@/components/ui/inline-alert";
import type { MasterResume, PatchDocument } from "@/lib/types/resume";

interface ResumePreviewProps {
  master: MasterResume;
  /** `null` previews the master resume as it is. */
  patch: PatchDocument | null;
  companyName: string | null;
}

type PreviewState =
  | { status: "rendering" }
  | { status: "ready"; url: string; pages: number; fileName: string }
  | { status: "error" };

export function ResumePreview({ master, patch, companyName }: ResumePreviewProps) {
  const [state, setState] = useState<PreviewState>({ status: "rendering" });

  useEffect(() => {
    let cancelled = false;
    let url: string | null = null;
    setState({ status: "rendering" });

    // The PDF engine is large, so it is loaded only when a preview is opened.
    import("@/lib/pdf/render")
      .then(async ({ renderTailoredResume, resumeFileName }) => {
        const { blob, pages } = await renderTailoredResume(master, patch);
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setState({
          status: "ready",
          url,
          pages,
          fileName: resumeFileName(master.basics.name, companyName),
        });
      })
      .catch((error) => {
        console.error(error);
        if (!cancelled) setState({ status: "error" });
      });

    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [master, patch, companyName]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-medium">
            {patch ? "Tailored resume" : "Master resume"}
          </h3>
          <p className="text-xs text-muted-foreground">
            Single column, real text and standard headings, so applicant
            tracking systems can parse it.
          </p>
        </div>
        {state.status === "ready" ? (
          <Button asChild>
            <a href={state.url} download={state.fileName}>
              <Download aria-hidden />
              Download ATS PDF
            </a>
          </Button>
        ) : (
          <Button disabled>
            {state.status === "rendering" ? (
              <Loader2 className="animate-spin" aria-hidden />
            ) : (
              <Download aria-hidden />
            )}
            Download ATS PDF
          </Button>
        )}
      </div>

      {state.status === "ready" && state.pages > 1 && (
        <InlineAlert tone="error">
          This resume runs to {state.pages} pages even at the tightest layout.
          Trim the master resume to get back to one page.
        </InlineAlert>
      )}

      <div className="relative aspect-[8.5/11] w-full overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900 shadow-xl shadow-black/30">
        {state.status === "rendering" && (
          <div
            className="absolute inset-0 flex flex-col gap-3 bg-white p-[8%]"
            aria-busy="true"
            aria-label="Rendering PDF"
          >
            <div className="h-6 w-2/5 animate-pulse rounded bg-zinc-200" />
            <div className="h-3 w-3/5 animate-pulse rounded bg-zinc-200" />
            {[92, 100, 84, 96, 70, 100, 88, 94, 60].map((width, index) => (
              <div
                key={index}
                className="h-2.5 animate-pulse rounded bg-zinc-200"
                style={{ width: `${width}%`, marginTop: index % 3 === 0 ? 14 : 0 }}
              />
            ))}
          </div>
        )}
        {state.status === "ready" && (
          <iframe
            key={state.url}
            src={`${state.url}#toolbar=0&navpanes=0&view=FitH`}
            title="Resume PDF preview"
            className="absolute inset-0 size-full animate-fade-in bg-white"
          />
        )}
        {state.status === "error" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center">
            <FileWarning className="size-6 text-zinc-500" aria-hidden />
            <p className="text-sm text-muted-foreground">
              The PDF could not be rendered. Reopen this tab to try again.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
