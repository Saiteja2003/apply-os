"use client";

import {
  CircleCheck,
  FileJson,
  FileText,
  Loader2,
  Sparkles,
  Type,
  Upload,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useRef, useState, type DragEvent } from "react";

import { importResumeTextAction } from "@/app/actions/resume";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { InlineAlert } from "@/components/ui/inline-alert";
import { Textarea } from "@/components/ui/textarea";
import type { ActionResult } from "@/lib/action-result";
import { getModel } from "@/lib/llm/models";
import { formatBytes, PdfTextError } from "@/lib/pdf/extract-text";
import type { ImportedResume } from "@/lib/resume/ids";
import { parseResumeJson, ResumeImportError } from "@/lib/resume/json-import";
import type { VerbatimGuardResult } from "@/lib/resume/verbatim-guard";
import { useModelConfig } from "@/lib/store";
import { cn } from "@/lib/utils";

interface QuickImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** A file dropped on the page: the dialog opens already importing it. */
  initialFile?: File | null;
  /**
   * Receives the parsed resume and the labels of anything the verification
   * guard left out. The caller decides what to do with it; nothing is saved.
   */
  onImport: (resume: ImportedResume, dropped: string[]) => void;
}

type Mode = "pdf" | "text" | "json";

const MODES: { id: Mode; label: string; icon: LucideIcon }[] = [
  { id: "pdf", label: "Upload PDF", icon: FileText },
  { id: "text", label: "Paste text", icon: Type },
  { id: "json", label: "Upload JSON", icon: FileJson },
];

const MAX_JSON_BYTES = 1_000_000;

/** Where a PDF import currently is. */
type PdfStage = "reading" | "structuring";

interface PdfJob {
  name: string;
  size: number;
  pages: number | null;
  stage: PdfStage;
}

export const isPdf = (file: File) =>
  file.type === "application/pdf" || /\.pdf$/i.test(file.name);
export const isJson = (file: File) =>
  file.type === "application/json" || /\.json$/i.test(file.name);

function Dropzone({
  icon: Icon,
  title,
  hint,
  accept,
  disabled,
  onFile,
}: {
  icon: LucideIcon;
  title: string;
  hint: string;
  accept: string;
  disabled?: boolean;
  onFile: (file: File) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function handleDrop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file && !disabled) onFile(file);
  }

  return (
    <>
      <input
        ref={input}
        type="file"
        accept={accept}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) onFile(file);
        }}
      />
      <button
        type="button"
        disabled={disabled}
        onClick={() => input.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={cn(
          "flex w-full flex-col items-center gap-2 rounded-xl border border-dashed px-4 py-12 text-center transition-colors duration-150 ease-out outline-none focus-visible:ring-2 focus-visible:ring-ring",
          dragging
            ? "border-indigo-400 bg-indigo-500/10 shadow-lg shadow-indigo-500/10"
            : "border-zinc-700 hover:border-indigo-500/60 hover:bg-indigo-500/5",
        )}
      >
        <span
          className={cn(
            "flex size-11 items-center justify-center rounded-full bg-indigo-500/15 text-indigo-300 transition-transform duration-150 ease-out",
            dragging && "scale-110",
          )}
        >
          {dragging ? (
            <Upload className="size-5" aria-hidden />
          ) : (
            <Icon className="size-5" aria-hidden />
          )}
        </span>
        <span className="text-sm font-medium">{title}</span>
        <span className="max-w-sm text-xs text-muted-foreground">{hint}</span>
      </button>
    </>
  );
}

function PdfProgress({ job, modelLabel }: { job: PdfJob; modelLabel: string }) {
  const steps: { id: PdfStage; label: string }[] = [
    { id: "reading", label: "Reading the PDF on this device" },
    { id: "structuring", label: `Structuring it with ${modelLabel}` },
  ];
  const active = steps.findIndex((step) => step.id === job.stage);

  return (
    <div
      className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-indigo-500/15 text-indigo-300">
          <FileText className="size-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{job.name}</p>
          <p className="text-xs text-muted-foreground">
            {formatBytes(job.size)}
            {job.pages !== null &&
              ` · ${job.pages} ${job.pages === 1 ? "page" : "pages"}`}
          </p>
        </div>
      </div>

      <div
        className="mt-4 h-1 w-full animate-shimmer rounded-full bg-[linear-gradient(90deg,#27272a_0%,#818cf8_50%,#27272a_100%)] bg-[length:200%_100%]"
        aria-hidden
      />

      <ol className="mt-4 space-y-2">
        {steps.map((step, index) => (
          <li
            key={step.id}
            className={cn(
              "flex items-center gap-2 text-sm transition-colors duration-150",
              index > active ? "text-zinc-600" : "text-zinc-200",
            )}
          >
            {index < active ? (
              <CircleCheck className="size-4 text-emerald-400" aria-hidden />
            ) : index === active ? (
              <Loader2 className="size-4 animate-spin text-indigo-400" aria-hidden />
            ) : (
              <span
                className="mx-1 size-2 rounded-full border border-zinc-700"
                aria-hidden
              />
            )}
            {step.label}
          </li>
        ))}
      </ol>
      <p className="mt-3 text-xs text-muted-foreground">
        Usually under a minute. Everything it returns is checked against the
        text of your PDF before it reaches the editor.
      </p>
    </div>
  );
}

export function QuickImportDialog({
  open,
  onOpenChange,
  initialFile = null,
  onImport,
}: QuickImportDialogProps) {
  const modelConfig = useModelConfig();
  const modelLabel = getModel(modelConfig.modelId)?.label ?? modelConfig.modelId;

  const [mode, setMode] = useState<Mode>("pdf");
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [parsingText, setParsingText] = useState(false);
  const [pdfJob, setPdfJob] = useState<PdfJob | null>(null);

  const busy = parsingText || pdfJob !== null;

  function close() {
    onOpenChange(false);
    setText("");
    setError(null);
    setPdfJob(null);
    setMode("pdf");
  }

  function finish(resume: ImportedResume, dropped: string[]) {
    onImport(resume, dropped);
    close();
  }

  /** Sends resume text to the model, then on to the editor. */
  async function structure(source: string): Promise<boolean> {
    const result = await importResumeTextAction(source, modelConfig).catch(
      (): ActionResult<VerbatimGuardResult> => ({
        ok: false,
        error: "Could not reach the server. Try again.",
      }),
    );
    if (result.ok) {
      finish(result.data.resume, result.data.dropped);
      return true;
    }
    setError(result.error);
    return false;
  }

  function importJson(source: string) {
    try {
      finish(parseResumeJson(source), []);
    } catch (caught) {
      setError(
        caught instanceof ResumeImportError
          ? caught.message
          : "That file could not be read.",
      );
    }
  }

  async function importPdf(file: File) {
    setError(null);
    if (!isPdf(file)) {
      setError("Choose a PDF file.");
      return;
    }
    setMode("pdf");
    setPdfJob({ name: file.name, size: file.size, pages: null, stage: "reading" });

    try {
      // The PDF engine is loaded only when a PDF is actually imported.
      const { extractPdfText } = await import("@/lib/pdf/extract-text");
      const extracted = await extractPdfText(file);
      setPdfJob({
        name: file.name,
        size: file.size,
        pages: extracted.pages,
        stage: "structuring",
      });
      if (!(await structure(extracted.text))) setPdfJob(null);
    } catch (caught) {
      setPdfJob(null);
      setError(
        caught instanceof PdfTextError
          ? caught.message
          : "That PDF could not be read.",
      );
    }
  }

  async function importJsonFile(file: File) {
    setError(null);
    if (!isJson(file)) {
      setError("Choose a JSON file.");
      return;
    }
    if (file.size > MAX_JSON_BYTES) {
      setError("That file is too large (1 MB max).");
      return;
    }
    setMode("json");
    importJson(await file.text());
  }

  async function importText() {
    setError(null);
    const source = text.trim();
    // Pasted JSON does not need a model.
    if (source.startsWith("{")) {
      importJson(source);
      return;
    }
    setParsingText(true);
    await structure(source);
    setParsingText(false);
  }

  // A file dropped on the page starts importing as the dialog opens. The ref
  // makes sure each dropped file is imported once, however often this runs.
  const startedFile = useRef<File | null>(null);
  useEffect(() => {
    if (!open || !initialFile || startedFile.current === initialFile) return;
    startedFile.current = initialFile;
    if (isJson(initialFile)) void importJsonFile(initialFile);
    else void importPdf(initialFile);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialFile]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Closing mid-import would discard the result.
        if (!next && busy) return;
        if (next) onOpenChange(true);
        else close();
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogTitle className="text-base font-semibold tracking-tight">
          Quick import
        </DialogTitle>
        <DialogDescription className="mt-1 text-sm text-muted-foreground">
          Importing replaces what is in the editor so you can review it.
          Nothing is saved until you choose Save new version.
        </DialogDescription>

        <div
          className="mt-4 flex gap-1 rounded-lg bg-zinc-950/60 p-1"
          role="tablist"
          aria-label="Import source"
        >
          {MODES.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={mode === id}
              disabled={busy}
              onClick={() => {
                setMode(id);
                setError(null);
              }}
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-sm transition-colors duration-150 ease-out outline-none focus-visible:ring-2 focus-visible:ring-ring",
                mode === id
                  ? "bg-zinc-800 font-medium text-zinc-100 shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="size-3.5" aria-hidden />
              {label}
            </button>
          ))}
        </div>

        <div key={mode} className="mt-4 animate-fade-in">
          {mode === "pdf" &&
            (pdfJob ? (
              <PdfProgress job={pdfJob} modelLabel={modelLabel} />
            ) : (
              <Dropzone
                icon={FileText}
                title="Drop your resume PDF here, or choose a file"
                hint={`The PDF is read in your browser and never uploaded. Its text is structured by ${modelLabel}, and anything not found in the PDF word for word is left out.`}
                accept="application/pdf,.pdf"
                onFile={(file) => void importPdf(file)}
              />
            ))}

          {mode === "text" && (
            <div className="space-y-3">
              <Textarea
                rows={12}
                autoFocus
                value={text}
                disabled={busy}
                maxLength={40_000}
                aria-label="Resume text"
                placeholder="Paste your resume as plain text: contact details, summary, each role with its bullets, education, skills."
                className="max-h-[45dvh] min-h-48 resize-y"
                onChange={(event) => setText(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                {modelLabel} structures the text. Every name, bullet and skill
                is then checked against what you pasted, and anything that is
                not there word for word is left out.
              </p>
            </div>
          )}

          {mode === "json" && (
            <Dropzone
              icon={FileJson}
              title="Drop a JSON file here, or choose one"
              hint="Accepts an ApplyOS resume or the JSON Resume standard (jsonresume.org). Ids already in the file are kept. No model is involved."
              accept="application/json,.json"
              onFile={(file) => void importJsonFile(file)}
            />
          )}
        </div>

        {error && (
          <InlineAlert tone="error" className="mt-3">
            {error}
          </InlineAlert>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={close} disabled={busy}>
            Cancel
          </Button>
          {mode === "text" && (
            <Button
              onClick={() => void importText()}
              disabled={busy || text.trim().length === 0}
            >
              {parsingText ? (
                <Loader2 className="animate-spin" aria-hidden />
              ) : (
                <Sparkles aria-hidden />
              )}
              {parsingText ? "Reading your resume…" : "Import into editor"}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
