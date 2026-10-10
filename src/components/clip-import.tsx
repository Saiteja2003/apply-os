"use client";

import { ClipboardPaste, Loader2, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { createApplicationAction } from "@/app/actions/applications";
import { Field, TextField } from "@/components/resume/fields";
import { Button } from "@/components/ui/button";
import { InlineAlert } from "@/components/ui/inline-alert";
import { Textarea } from "@/components/ui/textarea";
import { useWorkspace } from "@/components/workspace-provider";
import type { ActionResult } from "@/lib/action-result";
import { getModel } from "@/lib/llm/models";
import { useModelConfig } from "@/lib/store";
import type { JobApplication } from "@/lib/types/resume";

/**
 * Landing page for the bookmarklet. The clipped job arrives in the URL
 * fragment (which never reaches the server or its logs) and is shown for
 * one-click confirmation. It is never imported automatically: a link that
 * could create jobs and spend model credit just by being opened would be
 * an open door for any website.
 */

interface Clip {
  company: string;
  role: string;
  location: string;
  url: string;
  jobDescription: string;
}

const EMPTY: Clip = { company: "", role: "", location: "", url: "", jobDescription: "" };

const FIELD_LABELS: Record<keyof Clip, string> = {
  company: "company",
  role: "role",
  location: "location",
  url: "job link",
  jobDescription: "job description",
};

type FieldErrors = Partial<Record<keyof Clip, string>>;

function validate(clip: Clip): FieldErrors {
  const errors: FieldErrors = {};
  if (!clip.company.trim()) errors.company = "Company is required.";
  if (!clip.role.trim()) errors.role = "Role is required.";
  if (clip.url.trim() && !/^https?:\/\//i.test(clip.url.trim())) {
    errors.url = "Job link must start with http:// or https://.";
  }
  if (clip.jobDescription.trim().length < 80) {
    errors.jobDescription =
      "Paste the full job description (at least a few sentences).";
  }
  return errors;
}

/** Decodes a fragment value, tolerating a stray "%" that is not an escape. */
function decodeFragment(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    try {
      return decodeURIComponent(raw.replace(/%(?![\da-f]{2})/gi, "%25"));
    } catch {
      return raw;
    }
  }
}

/**
 * Reads `#data=<encodeURIComponent(JSON)>`. The value is taken as everything
 * after `data=` rather than through URLSearchParams, which would turn a bare
 * "+" into a space and stop at an unescaped "&".
 */
function readClip(hash: string): { clip: Clip | null; unreadable: boolean } {
  const start = hash.indexOf("data=");
  const raw = start === -1 ? "" : hash.slice(start + "data=".length);
  if (!raw) return { clip: null, unreadable: false };

  try {
    const data: unknown = JSON.parse(decodeFragment(raw));
    if (typeof data !== "object" || data === null || Array.isArray(data)) {
      return { clip: null, unreadable: true };
    }
    const text = (key: string, max: number) => {
      const value = (data as Record<string, unknown>)[key];
      return typeof value === "string" ? value.trim().slice(0, max) : "";
    };
    return {
      clip: {
        company: text("company", 200),
        role: text("role", 200),
        location: text("location", 200),
        url: text("url", 2000),
        jobDescription: text("jobDescription", 30_000),
      },
      unreadable: false,
    };
  } catch {
    return { clip: null, unreadable: true };
  }
}

export function ClipImport() {
  const router = useRouter();
  const { upsertApplication, tailor, openApplication } = useWorkspace();
  const modelConfig = useModelConfig();
  const modelLabel = getModel(modelConfig.modelId)?.label ?? modelConfig.modelId;

  const [clip, setClip] = useState<Clip | null>(null);
  const [ready, setReady] = useState(false);
  const [autoTailor, setAutoTailor] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [unreadable, setUnreadable] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const parsed = readClip(window.location.hash);
    // In development React runs this effect twice, and the address bar is
    // cleared below, so the second pass sees no data: keep the first read.
    setClip((current) => current ?? parsed.clip);
    if (parsed.unreadable) setUnreadable(true);
    setReady(true);
    // The job is in state now; keep it out of history and the address bar.
    if (window.location.hash) {
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  const set = (key: keyof Clip) => (value: string) => {
    setClip((current) => ({ ...(current ?? EMPTY), [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };

  /** Required fields the page did not give us, named for the note above the form. */
  const unread = clip
    ? (["company", "role", "jobDescription"] as const)
        .filter((key) => !clip[key])
        .map((key) => FIELD_LABELS[key])
    : [];

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!clip) return;
    setError(null);

    const found = validate(clip);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      const form = event.currentTarget as HTMLFormElement;
      requestAnimationFrame(() =>
        form.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(),
      );
      return;
    }
    setSaving(true);

    const created = await createApplicationAction({
      companyName: clip.company,
      roleTitle: clip.role,
      location: clip.location,
      jobUrl: clip.url,
      jobDescription: clip.jobDescription,
    }).catch(
      (): ActionResult<JobApplication> => ({
        ok: false,
        error: "Could not reach the server. Try again.",
      }),
    );
    if (!created.ok) {
      setSaving(false);
      setError(created.error);
      return;
    }

    upsertApplication(created.data);
    toast.success(`${created.data.companyName} added to your pipeline`, {
      description: autoTailor ? `Tailoring with ${modelLabel}…` : undefined,
    });
    if (autoTailor) {
      // Runs in the workspace, so it carries on while the dashboard opens.
      void tailor(created.data.id).then((result) => {
        if (!result.ok) {
          toast.error("Tailoring failed", { description: result.error });
        }
      });
    }
    router.push("/dashboard");
    openApplication(created.data.id);
  }

  if (!ready) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8 md:px-6" aria-busy="true">
        <div className="h-96 animate-pulse rounded-xl border border-zinc-800/60 bg-zinc-900/40" />
      </div>
    );
  }

  if (!clip) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8 md:px-6">
        <div className="rounded-xl border border-dashed border-zinc-800 px-6 py-12 text-center">
          <span className="mx-auto flex size-10 items-center justify-center rounded-full bg-indigo-500/15 text-indigo-300">
            <ClipboardPaste className="size-5" aria-hidden />
          </span>
          <h1 className="mt-3 text-base font-semibold tracking-tight">
            {unreadable ? "Could not read the clipped job" : "Nothing to import"}
          </h1>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            {unreadable
              ? "The link carried a job that could not be decoded, most likely because it was cut short. Clip the posting again, or add it by hand from the "
              : "This page receives jobs from the ApplyOS clipper. Open a job posting and use the bookmarklet or the browser extension, or add one by hand from the "}
            <Link
              href="/dashboard"
              className="rounded text-indigo-400 transition-colors outline-none hover:text-indigo-300 focus-visible:ring-2 focus-visible:ring-ring"
            >
              dashboard
            </Link>
            .
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl animate-rise-in px-4 py-6 md:px-6">
      <h1 className="text-lg font-semibold tracking-tight">Import clipped job</h1>
      <p className="mb-4 text-sm text-muted-foreground">
        Check what was captured, then import it. Nothing is saved until you do.
      </p>

      {unread.length > 0 && (
        <p
          role="status"
          className="mb-4 rounded-md border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-sm text-amber-200"
        >
          The page did not give us the {unread.join(", ")}. Fill{" "}
          {unread.length === 1 ? "it" : "them"} in below before importing.
        </p>
      )}

      <form
        onSubmit={handleSubmit}
        noValidate
        className="space-y-4 rounded-xl border border-zinc-800/80 bg-zinc-900/60 p-5 backdrop-blur-md"
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField
            label="Company"
            required
            autoFocus={!clip.company}
            maxLength={200}
            disabled={saving}
            error={errors.company}
            value={clip.company}
            onChange={set("company")}
          />
          <TextField
            label="Role"
            required
            maxLength={200}
            disabled={saving}
            error={errors.role}
            value={clip.role}
            onChange={set("role")}
          />
          <TextField
            label="Location"
            hint="optional"
            maxLength={200}
            disabled={saving}
            value={clip.location}
            onChange={set("location")}
          />
          <TextField
            label="Job link"
            hint="optional"
            type="url"
            disabled={saving}
            error={errors.url}
            value={clip.url}
            onChange={set("url")}
          />
        </div>
        <Field
          label="Job description"
          hint={`${clip.jobDescription.length.toLocaleString()} characters`}
          error={errors.jobDescription}
        >
          <Textarea
            required
            aria-invalid={errors.jobDescription ? true : undefined}
            rows={12}
            maxLength={30_000}
            disabled={saving}
            value={clip.jobDescription}
            className="min-h-40 resize-y"
            onChange={(event) => set("jobDescription")(event.target.value)}
          />
        </Field>

        <label className="flex items-center gap-2.5 text-sm">
          <input
            type="checkbox"
            checked={autoTailor}
            disabled={saving}
            onChange={(event) => setAutoTailor(event.target.checked)}
            className="size-4 rounded border-zinc-700 bg-zinc-900 accent-indigo-500"
          />
          Tailor my resume, cover letter and outreach with {modelLabel}
        </label>

        {error && <InlineAlert tone="error">{error}</InlineAlert>}

        <div className="flex justify-end gap-2">
          <Button variant="outline" asChild>
            <Link href="/dashboard">Cancel</Link>
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? (
              <Loader2 className="animate-spin" aria-hidden />
            ) : (
              <Sparkles aria-hidden />
            )}
            {saving ? "Importing…" : autoTailor ? "Import and tailor" : "Import"}
          </Button>
        </div>
      </form>
    </div>
  );
}
