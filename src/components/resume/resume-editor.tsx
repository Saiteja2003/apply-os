"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  Eye,
  EyeOff,
  Loader2,
  Plus,
  Redo2,
  RotateCcw,
  Save,
  Trash2,
  Undo2,
  Upload,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
  type DragEvent,
} from "react";
import { toast } from "sonner";

import { saveMasterResumeAction } from "@/app/actions/resume";
import { ResumePreview } from "@/components/resume-preview";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { InlineAlert } from "@/components/ui/inline-alert";
import { Kbd } from "@/components/ui/kbd";
import { Textarea } from "@/components/ui/textarea";
import { useWorkspace } from "@/components/workspace-provider";
import type { ActionResult } from "@/lib/action-result";
import { fetchResumeVersion, fetchResumeVersions, queryKeys } from "@/lib/api";
import {
  collectIds,
  ID_PREFIX,
  newId,
  toMasterResume,
  type ImportedResume,
} from "@/lib/resume/ids";
import { validateResume } from "@/lib/resume/schema";
import { resumeDraftStorageKey, useResumeDraftStore } from "@/lib/store";
import type {
  MasterResume,
  MasterResumeVersion,
  MasterResumeVersionSummary,
  ResumeCustomEntry,
  ResumeCustomSection,
  ResumeEducation,
  ResumeExperience,
  ResumeProject,
} from "@/lib/types/resume";
import { cn, formatDate } from "@/lib/utils";

import { EntrySection, type EntryField } from "./entry-section";
import { CommaListField, Field, IdChip, SectionCard, TextField } from "./fields";
import { isJson, isPdf, QuickImportDialog } from "./quick-import-dialog";
import { moveById } from "./sortable-list";
import { VersionMenu } from "./version-menu";

const EMPTY_RESUME: MasterResume = {
  schemaVersion: 1,
  basics: {
    name: "",
    headline: null,
    email: "",
    phone: null,
    location: null,
    links: [],
  },
  summary: "",
  experience: [],
  education: [],
  projects: [],
  skills: [],
  customSections: [],
};

/** Section headings offered in the Add custom section menu. */
const SECTION_PRESETS = [
  "Certifications",
  "Open Source & Publications",
  "Languages",
  "Awards",
  "Volunteering",
];

const DATE_HINT = "YYYY-MM";
const PREVIEW_DEBOUNCE_MS = 600;

const EXPERIENCE_FIELDS: EntryField<ResumeExperience>[] = [
  {
    name: "title",
    label: "Title",
    get: (entry) => entry.title,
    set: (entry, title) => ({ ...entry, title }),
  },
  {
    name: "company",
    label: "Company",
    get: (entry) => entry.company,
    set: (entry, company) => ({ ...entry, company }),
  },
  {
    name: "startDate",
    label: "Start",
    hint: DATE_HINT,
    placeholder: "2022-03",
    get: (entry) => entry.startDate,
    set: (entry, startDate) => ({ ...entry, startDate }),
  },
  {
    name: "endDate",
    label: "End",
    hint: "blank = present",
    placeholder: "Present",
    get: (entry) => entry.endDate ?? "",
    set: (entry, endDate) => ({ ...entry, endDate: endDate.trim() || null }),
  },
  {
    name: "location",
    label: "Location",
    wide: true,
    get: (entry) => entry.location ?? "",
    set: (entry, location) => ({ ...entry, location: location || null }),
  },
];

const EDUCATION_FIELDS: EntryField<ResumeEducation>[] = [
  {
    name: "institution",
    label: "Institution",
    wide: true,
    get: (entry) => entry.institution,
    set: (entry, institution) => ({ ...entry, institution }),
  },
  {
    name: "degree",
    label: "Degree",
    placeholder: "B.S.",
    get: (entry) => entry.degree,
    set: (entry, degree) => ({ ...entry, degree }),
  },
  {
    name: "field",
    label: "Field of study",
    get: (entry) => entry.field ?? "",
    set: (entry, field) => ({ ...entry, field: field || null }),
  },
  {
    name: "startDate",
    label: "Start",
    hint: DATE_HINT,
    get: (entry) => entry.startDate ?? "",
    set: (entry, startDate) => ({ ...entry, startDate: startDate.trim() || null }),
  },
  {
    name: "endDate",
    label: "End",
    hint: DATE_HINT,
    get: (entry) => entry.endDate ?? "",
    set: (entry, endDate) => ({ ...entry, endDate: endDate.trim() || null }),
  },
];

const PROJECT_FIELDS: EntryField<ResumeProject>[] = [
  {
    name: "name",
    label: "Name",
    get: (entry) => entry.name,
    set: (entry, name) => ({ ...entry, name }),
  },
  {
    name: "url",
    label: "Link",
    placeholder: "https://",
    get: (entry) => entry.url ?? "",
    set: (entry, url) => ({ ...entry, url: url.trim() || null }),
  },
  {
    kind: "list",
    name: "technologies",
    label: "Technologies",
    hint: "comma separated",
    wide: true,
    get: (entry) => entry.technologies,
    set: (entry, technologies) => ({ ...entry, technologies }),
  },
];

const CUSTOM_FIELDS: EntryField<ResumeCustomEntry>[] = [
  {
    name: "title",
    label: "Title",
    wide: true,
    placeholder: "AWS Certified Solutions Architect",
    get: (entry) => entry.title,
    set: (entry, title) => ({ ...entry, title }),
  },
  {
    name: "subtitle",
    label: "Detail",
    hint: "issuer, venue, level",
    get: (entry) => entry.subtitle ?? "",
    set: (entry, subtitle) => ({ ...entry, subtitle: subtitle || null }),
  },
  {
    name: "date",
    label: "Date",
    hint: "as you want it shown",
    placeholder: "2024",
    get: (entry) => entry.date ?? "",
    set: (entry, date) => ({ ...entry, date: date || null }),
  },
];

const SECTION_LABELS: Record<string, string> = {
  basics: "Contact",
  summary: "Executive summary",
  experience: "Experience",
  education: "Education",
  projects: "Projects",
  skills: "Skills",
  customSections: "Custom section",
};

const SEGMENT_LABELS: Record<string, string> = {
  bullets: "bullet",
  links: "link",
  entries: "item",
  startDate: "start date",
  endDate: "end date",
  url: "link address",
};

/** `experience.1.bullets.0.text` -> "Experience 2 › bullet 1". */
function describeIssuePath(path: string): string {
  const [section, ...segments] = path.split(".");
  const parts = [SECTION_LABELS[section] ?? section];
  for (const segment of segments) {
    if (/^\d+$/.test(segment)) {
      parts[parts.length - 1] += ` ${Number(segment) + 1}`;
    } else if (segment !== "text" && segment !== "id") {
      parts.push(SEGMENT_LABELS[segment] ?? segment);
    }
  }
  return parts.join(" › ");
}

/**
 * Whether a value read back from localStorage is a draft the editor can
 * open. It came from disk, so its shape is checked before it is trusted.
 */
function isStoredDraft(
  value: unknown,
): value is { baseId: string; draft: MasterResume } {
  if (typeof value !== "object" || value === null) return false;
  if (!("baseId" in value) || typeof value.baseId !== "string") return false;
  if (!("draft" in value) || typeof value.draft !== "object" || value.draft === null) {
    return false;
  }
  const draft = value.draft as Record<string, unknown>;
  const basics = draft.basics as Record<string, unknown> | null | undefined;
  return (
    typeof draft.summary === "string" &&
    typeof basics === "object" &&
    basics !== null &&
    typeof basics.name === "string" &&
    typeof basics.email === "string" &&
    Array.isArray(basics.links) &&
    ["experience", "education", "projects", "skills", "customSections"].every(
      (key) => Array.isArray(draft[key]),
    )
  );
}

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

const iconButtonClass =
  "flex size-8 shrink-0 items-center justify-center rounded-md text-zinc-500 transition-colors duration-150 outline-none hover:bg-zinc-800/60 hover:text-zinc-200 focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-zinc-500";
const dangerButtonClass =
  "flex size-8 shrink-0 items-center justify-center rounded-md text-zinc-500 transition-colors duration-150 outline-none hover:bg-red-500/10 hover:text-red-300 focus-visible:ring-2 focus-visible:ring-ring";

export function ResumeEditor() {
  const { master, setMaster, userId } = useWorkspace();
  const queryClient = useQueryClient();

  const baseId = master?.id ?? "new";
  const saved = master?.resume ?? EMPTY_RESUME;

  const storedBaseId = useResumeDraftStore((state) => state.baseId);
  const storedDraft = useResumeDraftStore((state) => state.draft);
  const setDraft = useResumeDraftStore((state) => state.setDraft);
  const clearDraft = useResumeDraftStore((state) => state.clearDraft);
  const undoDraft = useResumeDraftStore((state) => state.undo);
  const redoDraft = useResumeDraftStore((state) => state.redo);
  const canUndo = useResumeDraftStore(
    (state) => state.baseId === baseId && state.past.length > 0,
  );
  const canRedo = useResumeDraftStore(
    (state) => state.baseId === baseId && state.future.length > 0,
  );

  // A draft belongs to the version it was started from; otherwise show
  // the saved resume.
  const draft = storedBaseId === baseId && storedDraft ? storedDraft : saved;

  const [importOpen, setImportOpen] = useState(false);
  const [droppedFile, setDroppedFile] = useState<File | null>(null);
  const [pageDragging, setPageDragging] = useState(false);
  const [leftOut, setLeftOut] = useState<string[]>([]);
  // Bumped when the draft is replaced wholesale, to reset per-field state.
  const [revision, setRevision] = useState(0);
  const [showPreview, setShowPreview] = useState(false);
  const [inspectingId, setInspectingId] = useState<string | null>(null);
  const [projectsAdded, setProjectsAdded] = useState(false);
  const [focusSectionId, setFocusSectionId] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  // Side-by-side preview is on by default where there is room for it.
  useEffect(() => {
    if (window.matchMedia("(min-width: 1280px)").matches) setShowPreview(true);
  }, []);

  const versionsQuery = useQuery({
    queryKey: queryKeys.resumeVersions(userId),
    queryFn: fetchResumeVersions,
  });
  const inspectedQuery = useQuery({
    queryKey: queryKeys.resumeVersion(userId, inspectingId ?? "none"),
    queryFn: () => fetchResumeVersion(inspectingId ?? ""),
    enabled: inspectingId !== null,
    // A saved version never changes.
    staleTime: Infinity,
  });

  const currentDraft = useCallback((): MasterResume => {
    const state = useResumeDraftStore.getState();
    return state.baseId === baseId && state.draft ? state.draft : saved;
  }, [baseId, saved]);

  const mutate = useCallback(
    (update: (current: MasterResume) => MasterResume) => {
      setDraft(baseId, update(currentDraft()), { coalesce: true });
    },
    [baseId, currentDraft, setDraft],
  );

  const section = useCallback(
    <K extends keyof MasterResume>(key: K) =>
      (update: (current: MasterResume[K]) => MasterResume[K]) =>
        mutate((current) => ({ ...current, [key]: update(current[key]) })),
    [mutate],
  );

  /** A new id that neither the draft nor the saved version has used. */
  const makeId = useCallback(
    (prefix: string) => {
      const taken = collectIds(currentDraft());
      for (const id of collectIds(saved)) taken.add(id);
      return newId(prefix, taken);
    },
    [currentDraft, saved],
  );

  const validation = useMemo(() => validateResume(draft), [draft]);
  const issues = useMemo(() => {
    const byPath = new Map<string, string>();
    for (const issue of validation.issues) {
      if (!byPath.has(issue.path)) byPath.set(issue.path, issue.message);
    }
    return byPath;
  }, [validation]);
  const dirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(saved),
    [draft, saved],
  );
  const canSave = dirty && validation.valid && !saving;
  const previewDraft = useDebouncedValue(draft, PREVIEW_DEBOUNCE_MS);

  /**
   * Swaps the whole draft (import, discard, restore). The previous state
   * goes onto the undo stack, so none of these can lose work.
   */
  const replaceDraft = useCallback(
    (next: MasterResume | null) => {
      setDraft(baseId, next);
      setRevision((current) => current + 1);
    },
    [baseId, setDraft],
  );

  const undo = useCallback(() => {
    undoDraft();
    setRevision((current) => current + 1);
  }, [undoDraft]);
  const redo = useCallback(() => {
    redoDraft();
    setRevision((current) => current + 1);
  }, [redoDraft]);

  // Mirror the unsaved draft to localStorage, so a refresh, a crash or a
  // dropped connection cannot lose edits or an imported resume.
  const storageKey = resumeDraftStorageKey(userId);
  const [storageChecked, setStorageChecked] = useState(false);
  useEffect(() => {
    setStorageChecked(true);
    const state = useResumeDraftStore.getState();
    if (state.baseId === baseId && state.draft) return;
    try {
      const stored: unknown = JSON.parse(localStorage.getItem(storageKey) ?? "null");
      if (isStoredDraft(stored) && stored.baseId === baseId) {
        state.restore(baseId, stored.draft);
        setRevision((current) => current + 1);
        toast("Restored your unsaved changes", {
          description: "They were kept in this browser when the page closed.",
        });
      }
    } catch {
      // Unreadable or blocked storage: carry on with the saved version.
    }
  }, [baseId, storageKey]);

  useEffect(() => {
    if (!storageChecked) return;
    const timer = setTimeout(() => {
      try {
        if (storedBaseId === baseId && storedDraft) {
          localStorage.setItem(
            storageKey,
            JSON.stringify({ baseId, draft: storedDraft, savedAt: Date.now() }),
          );
        } else {
          localStorage.removeItem(storageKey);
        }
      } catch {
        // Storage full or blocked: the in-memory draft still works.
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [baseId, storageChecked, storageKey, storedBaseId, storedDraft]);

  const save = useCallback(() => {
    if (!validation.valid || !dirty) return;
    const resume = validation.resume;
    startSaving(async () => {
      const result = await saveMasterResumeAction(resume).catch(
        (): ActionResult<MasterResumeVersion> => ({
          ok: false,
          error: "Could not reach the server. Try again.",
        }),
      );
      if (result.ok) {
        const { id, version, createdAt } = result.data;
        setMaster(result.data);
        queryClient.setQueryData<MasterResumeVersionSummary[]>(
          queryKeys.resumeVersions(userId),
          (current) => [{ id, version, createdAt }, ...(current ?? [])],
        );
        clearDraft();
        setRevision((current) => current + 1);
        setLeftOut([]);
        toast.success(`Saved as version ${version}`, {
          description:
            "Earlier versions are kept unchanged. Re-tailor an application to use the new one.",
        });
      } else {
        toast.error("Could not save", { description: result.error });
      }
    });
  }, [clearDraft, dirty, queryClient, setMaster, userId, validation]);

  // Ctrl/Cmd+S saves. Leaving the tab with unsaved edits asks first.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!event.metaKey && !event.ctrlKey) return;
      const key = event.key.toLowerCase();
      if (key === "s") {
        event.preventDefault();
        save();
        return;
      }
      // Undo and redo act on the whole resume, not one text field. Dialogs
      // (import, key entry) keep the browser's own undo.
      if (document.querySelector('[role="dialog"]')) return;
      if (key === "z" && !event.shiftKey) {
        event.preventDefault();
        undo();
      } else if (key === "y" || (key === "z" && event.shiftKey)) {
        event.preventDefault();
        redo();
      }
    }
    function onBeforeUnload(event: BeforeUnloadEvent) {
      if (dirty) event.preventDefault();
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [dirty, redo, save, undo]);

  function handleImport(imported: ImportedResume, dropped: string[]) {
    const next = toMasterResume(imported, currentDraft());
    replaceDraft(next);
    setLeftOut(dropped);

    const bulletCount = next.experience.reduce(
      (total, entry) => total + entry.bullets.length,
      0,
    );
    toast.success("Imported into the editor", {
      description: `${next.experience.length} ${
        next.experience.length === 1 ? "role" : "roles"
      } and ${bulletCount} ${
        bulletCount === 1 ? "bullet" : "bullets"
      }. Review, then save a new version.`,
      duration: 15_000,
      action: {
        label: "Undo",
        onClick: () => {
          undo();
          setLeftOut([]);
        },
      },
    });
  }

  // ---- dropping a file anywhere on the page -------------------------------

  const carriesFiles = (event: DragEvent) =>
    event.dataTransfer.types.includes("Files");

  function handlePageDrop(event: DragEvent) {
    if (!carriesFiles(event)) return;
    event.preventDefault();
    setPageDragging(false);

    const file = event.dataTransfer.files[0];
    if (!file) return;
    if (!isPdf(file) && !isJson(file)) {
      toast.error("That file type is not supported", {
        description: "Drop a PDF or a JSON resume.",
      });
      return;
    }
    setDroppedFile(file);
    setImportOpen(true);
  }

  // ---- custom sections -----------------------------------------------------

  const setCustomSections = section("customSections");

  function addCustomSection(title: string) {
    const created: ResumeCustomSection = {
      id: makeId(ID_PREFIX.customSection),
      title,
      entries: [],
    };
    setCustomSections((current) => [...current, created]);
    if (!title) setFocusSectionId(created.id);
  }

  function removeCustomSection(index: number) {
    const removed = draft.customSections[index];
    setCustomSections((current) =>
      current.filter((entry) => entry.id !== removed.id),
    );
    toast(`Removed "${removed.title || "Untitled section"}"`, {
      description: "Nothing changes in your saved resume until you save.",
      action: {
        label: "Undo",
        onClick: () =>
          setCustomSections((current) =>
            current.some((entry) => entry.id === removed.id)
              ? current
              : [
                  ...current.slice(0, index),
                  removed,
                  ...current.slice(index),
                ],
          ),
      },
    });
  }

  function moveCustomSection(id: string, direction: -1 | 1) {
    setCustomSections((current) => {
      const from = current.findIndex((entry) => entry.id === id);
      const target = current[from + direction];
      return from === -1 || !target ? current : moveById(current, id, target.id);
    });
  }

  const basics = draft.basics;
  const setBasics = section("basics");
  const setSkills = section("skills");
  const issuesUnder = (prefix: string) =>
    [...issues.keys()].filter((path) => path.startsWith(prefix)).length;

  const projectsVisible = projectsAdded || draft.projects.length > 0;
  const takenTitles = new Set(
    draft.customSections.map((entry) => entry.title.trim().toLowerCase()),
  );
  const availablePresets = SECTION_PRESETS.filter(
    (title) => !takenTitles.has(title.toLowerCase()),
  );

  const versions = versionsQuery.data;
  const activeSummary: MasterResumeVersionSummary | null = master
    ? { id: master.id, version: master.version, createdAt: master.createdAt }
    : null;
  const inspected = inspectingId ? inspectedQuery.data : undefined;
  const previewVisible = showPreview || inspectingId !== null;

  return (
    <>
      <div
        className="relative flex min-h-full flex-col"
        onDragEnter={(event) => {
          if (carriesFiles(event)) setPageDragging(true);
        }}
        onDragOver={(event) => {
          if (carriesFiles(event)) event.preventDefault();
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            setPageDragging(false);
          }
        }}
        onDrop={handlePageDrop}
      >
        <header className="sticky top-0 z-20 border-b border-zinc-800/80 bg-zinc-950/80 px-4 py-3 backdrop-blur-md md:px-6">
          <div
            className={cn(
              "mx-auto flex flex-wrap items-center gap-x-4 gap-y-2 transition-[max-width] duration-200 ease-out",
              previewVisible ? "max-w-7xl" : "max-w-4xl",
            )}
          >
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-lg font-semibold tracking-tight">
                  Master resume
                </h1>
                <VersionMenu
                  active={activeSummary}
                  versions={versions}
                  inspectingId={inspectingId}
                  onInspect={setInspectingId}
                  loadFailed={versionsQuery.isError}
                />
              </div>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
                {master
                  ? `Saved ${formatDate(master.createdAt)}`
                  : "Not saved yet"}
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium transition-colors duration-150",
                    dirty
                      ? "bg-amber-500/15 text-amber-300"
                      : "bg-zinc-800/80 text-zinc-400",
                  )}
                >
                  <span
                    className={cn(
                      "size-1.5 rounded-full",
                      dirty ? "bg-amber-400" : "bg-zinc-500",
                    )}
                    aria-hidden
                  />
                  {dirty ? "Unsaved changes" : "Up to date"}
                </span>
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Undo"
                  title="Undo (Ctrl+Z)"
                  disabled={!canUndo || saving}
                  onClick={undo}
                >
                  <Undo2 aria-hidden />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Redo"
                  title="Redo (Ctrl+Y or Ctrl+Shift+Z)"
                  disabled={!canRedo || saving}
                  onClick={redo}
                >
                  <Redo2 aria-hidden />
                </Button>
              </div>
              <Button
                variant="ghost"
                aria-pressed={previewVisible}
                onClick={() => {
                  setShowPreview(!previewVisible);
                  setInspectingId(null);
                }}
              >
                {previewVisible ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
                {previewVisible ? "Hide preview" : "Live preview"}
              </Button>
              <Button variant="outline" onClick={() => setImportOpen(true)}>
                <Upload aria-hidden />
                Quick import
              </Button>
              <Button
                variant="ghost"
                disabled={!dirty || saving}
                onClick={() => {
                  // Not destructive: the draft moves onto the undo stack.
                  replaceDraft(null);
                  setLeftOut([]);
                  toast("Changes discarded", {
                    description: "Undo brings them back. Ctrl+Z works too.",
                    duration: 15_000,
                    action: { label: "Undo", onClick: undo },
                  });
                }}
              >
                <RotateCcw aria-hidden />
                Discard
              </Button>
              <Button
                disabled={!canSave}
                onClick={save}
                title="Saves a new version (Ctrl+S)"
              >
                {saving ? (
                  <Loader2 className="animate-spin" aria-hidden />
                ) : (
                  <Save aria-hidden />
                )}
                {saving ? "Saving…" : "Save new version"}
                {!saving && (
                  <Kbd className="ml-0.5 hidden border-white/20 bg-white/10 text-white/80 2xl:inline-flex">
                    Ctrl S
                  </Kbd>
                )}
              </Button>
            </div>
          </div>
        </header>

        <div
          className={cn(
            "mx-auto grid w-full flex-1 gap-6 px-4 py-5 md:px-6",
            previewVisible
              ? "max-w-7xl xl:grid-cols-[minmax(0,1fr)_minmax(0,30rem)]"
              : "max-w-4xl",
          )}
        >
          <div key={revision} className="min-w-0 space-y-4">
            <p className="text-sm text-muted-foreground">
              This is the verified record every tailored resume is built from.
              Saving adds a new version; earlier versions are never changed.
              Each entry keeps its id for good, which is how tailored resumes
              point back to it. Drop a PDF anywhere on this page to import it.
            </p>

            {issues.size > 0 && (
              <div
                role="alert"
                className="animate-rise-in rounded-lg border border-red-500/25 bg-red-500/10 px-3.5 py-3 text-sm text-red-200"
              >
                <p className="font-medium">
                  {issues.size}{" "}
                  {issues.size === 1 ? "thing needs" : "things need"} fixing
                  before this can be saved
                </p>
                <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-red-200/90">
                  {[...issues].slice(0, 5).map(([path, message]) => (
                    <li key={path}>
                      <span className="font-medium">
                        {describeIssuePath(path)}:
                      </span>{" "}
                      {message}
                    </li>
                  ))}
                  {issues.size > 5 && <li>and {issues.size - 5} more</li>}
                </ul>
              </div>
            )}

            {leftOut.length > 0 && (
              <div
                role="status"
                className="animate-rise-in rounded-lg border border-amber-500/25 bg-amber-500/10 px-3.5 py-3 text-sm text-amber-100"
              >
                <div className="flex items-start gap-3">
                  <p className="flex-1 font-medium">
                    {leftOut.length} imported{" "}
                    {leftOut.length === 1 ? "item was" : "items were"} left out
                    because the wording was not found in your source
                  </p>
                  <button
                    type="button"
                    aria-label="Dismiss"
                    onClick={() => setLeftOut([])}
                    className="rounded p-0.5 text-amber-200/70 transition-colors outline-none hover:text-amber-100 focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <X className="size-4" aria-hidden />
                  </button>
                </div>
                <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-amber-100/85">
                  {leftOut.slice(0, 6).map((label, index) => (
                    <li key={index}>{label}</li>
                  ))}
                  {leftOut.length > 6 && <li>and {leftOut.length - 6} more</li>}
                </ul>
              </div>
            )}

            <SectionCard title="Contact" issueCount={issuesUnder("basics.")}>
              <div className="grid gap-3 sm:grid-cols-2">
                <TextField
                  label="Name"
                  autoComplete="name"
                  value={basics.name}
                  error={issues.get("basics.name")}
                  onChange={(name) =>
                    setBasics((current) => ({ ...current, name }))
                  }
                />
                <TextField
                  label="Headline"
                  placeholder="Senior Software Engineer"
                  value={basics.headline ?? ""}
                  error={issues.get("basics.headline")}
                  onChange={(headline) =>
                    setBasics((current) => ({
                      ...current,
                      headline: headline || null,
                    }))
                  }
                />
                <TextField
                  label="Email"
                  type="email"
                  autoComplete="email"
                  value={basics.email}
                  error={issues.get("basics.email")}
                  onChange={(email) =>
                    setBasics((current) => ({ ...current, email }))
                  }
                />
                <TextField
                  label="Phone"
                  type="tel"
                  autoComplete="tel"
                  value={basics.phone ?? ""}
                  error={issues.get("basics.phone")}
                  onChange={(phone) =>
                    setBasics((current) => ({ ...current, phone: phone || null }))
                  }
                />
                <TextField
                  label="Location"
                  className="sm:col-span-2"
                  placeholder="City, State"
                  value={basics.location ?? ""}
                  error={issues.get("basics.location")}
                  onChange={(location) =>
                    setBasics((current) => ({
                      ...current,
                      location: location || null,
                    }))
                  }
                />
              </div>

              <div className="mt-4">
                <p className="mb-1.5 text-xs font-medium text-zinc-400">Links</p>
                <ul className="space-y-2">
                  {basics.links.map((link, index) => (
                    <li key={link.id} className="flex items-start gap-2">
                      <TextField
                        label="Label"
                        className="w-32 shrink-0"
                        placeholder="LinkedIn"
                        value={link.label}
                        error={issues.get(`basics.links.${index}.label`)}
                        onChange={(label) =>
                          setBasics((current) => ({
                            ...current,
                            links: current.links.map((entry) =>
                              entry.id === link.id ? { ...entry, label } : entry,
                            ),
                          }))
                        }
                      />
                      <TextField
                        label="Address"
                        className="min-w-0 flex-1"
                        type="url"
                        placeholder="https://"
                        value={link.url}
                        error={issues.get(`basics.links.${index}.url`)}
                        onChange={(url) =>
                          setBasics((current) => ({
                            ...current,
                            links: current.links.map((entry) =>
                              entry.id === link.id ? { ...entry, url } : entry,
                            ),
                          }))
                        }
                      />
                      <button
                        type="button"
                        aria-label={`Delete link ${link.label || index + 1}`}
                        title="Delete link"
                        className={cn(dangerButtonClass, "mt-[1.375rem] size-9")}
                        onClick={() =>
                          setBasics((current) => ({
                            ...current,
                            links: current.links.filter(
                              (entry) => entry.id !== link.id,
                            ),
                          }))
                        }
                      >
                        <Trash2 className="size-4" aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-2 text-zinc-300"
                  onClick={() => {
                    const id = makeId(ID_PREFIX.link);
                    setBasics((current) => ({
                      ...current,
                      links: [...current.links, { id, label: "", url: "" }],
                    }));
                  }}
                >
                  <Plus aria-hidden />
                  Add link
                </Button>
              </div>
            </SectionCard>

            <SectionCard
              title="Executive summary"
              issueCount={issuesUnder("summary")}
            >
              <Field
                label="Summary"
                hint={`${draft.summary.trim().length} characters`}
                error={issues.get("summary")}
              >
                <Textarea
                  rows={3}
                  value={draft.summary}
                  aria-invalid={issues.has("summary") ? true : undefined}
                  placeholder="Two or three sentences on who you are professionally and what you are known for."
                  className="min-h-20 resize-y [field-sizing:content]"
                  onChange={(event) => {
                    const summary = event.target.value;
                    mutate((current) => ({ ...current, summary }));
                  }}
                />
              </Field>
            </SectionCard>

            <EntrySection
              section="experience"
              title="Experience"
              itemLabel="role"
              addLabel="Add role"
              emptyHint="Add your first role"
              untitled="New role"
              entries={draft.experience}
              fields={EXPERIENCE_FIELDS}
              heading={(entry) =>
                [entry.title, entry.company].filter(Boolean).join(" · ")
              }
              subheading={(entry) =>
                entry.startDate
                  ? `${entry.startDate} – ${entry.endDate ?? "Present"}`
                  : ""
              }
              idPrefix={ID_PREFIX.experience}
              create={(id) => ({
                id,
                company: "",
                title: "",
                location: null,
                startDate: "",
                endDate: null,
                bullets: [],
              })}
              makeId={makeId}
              issues={issues}
              onChange={section("experience")}
            />

            <EntrySection
              section="education"
              title="Education"
              itemLabel="education entry"
              addLabel="Add education"
              emptyHint="Add a degree or course"
              untitled="New education entry"
              entries={draft.education}
              fields={EDUCATION_FIELDS}
              heading={(entry) =>
                [entry.degree, entry.field].filter(Boolean).join(", ")
              }
              subheading={(entry) => entry.institution}
              idPrefix={ID_PREFIX.education}
              create={(id) => ({
                id,
                institution: "",
                degree: "",
                field: null,
                startDate: null,
                endDate: null,
                bullets: [],
              })}
              makeId={makeId}
              issues={issues}
              onChange={section("education")}
            />

            <SectionCard
              title="Skills"
              count={draft.skills.length}
              issueCount={issuesUnder("skills.")}
              action={
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const id = makeId(ID_PREFIX.skillGroup);
                    setSkills((current) => [
                      ...current,
                      { id, category: "", skills: [] },
                    ]);
                  }}
                >
                  <Plus aria-hidden />
                  Add group
                </Button>
              }
            >
              {draft.skills.length === 0 ? (
                <p className="rounded-lg border border-dashed border-zinc-800 px-3 py-6 text-center text-[13px] text-zinc-500">
                  Group your skills, for example Languages, Infrastructure,
                  Frameworks.
                </p>
              ) : (
                <ul className="space-y-3">
                  {draft.skills.map((group, index) => (
                    <li key={group.id}>
                      <div className="flex items-start gap-2">
                        <TextField
                          label="Category"
                          className="w-40 shrink-0"
                          placeholder="Languages"
                          value={group.category}
                          error={issues.get(`skills.${index}.category`)}
                          onChange={(category) =>
                            setSkills((current) =>
                              current.map((entry) =>
                                entry.id === group.id
                                  ? { ...entry, category }
                                  : entry,
                              ),
                            )
                          }
                        />
                        <CommaListField
                          label="Skills"
                          hint="comma separated"
                          className="min-w-0 flex-1"
                          placeholder="Python, TypeScript, SQL"
                          values={group.skills}
                          onChange={(skills) =>
                            setSkills((current) =>
                              current.map((entry) =>
                                entry.id === group.id
                                  ? { ...entry, skills }
                                  : entry,
                              ),
                            )
                          }
                        />
                        <button
                          type="button"
                          aria-label={`Delete skill group ${
                            group.category || index + 1
                          }`}
                          title="Delete group"
                          className={cn(dangerButtonClass, "mt-[1.375rem] size-9")}
                          onClick={() =>
                            setSkills((current) =>
                              current.filter((entry) => entry.id !== group.id),
                            )
                          }
                        >
                          <Trash2 className="size-4" aria-hidden />
                        </button>
                      </div>
                      <IdChip id={group.id} className="mt-1" />
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>

            {projectsVisible && (
              <EntrySection
                section="projects"
                title="Projects"
                itemLabel="project"
                addLabel="Add project"
                emptyHint="Add a project"
                untitled="New project"
                entries={draft.projects}
                fields={PROJECT_FIELDS}
                heading={(entry) => entry.name}
                subheading={(entry) => entry.technologies.join(", ")}
                idPrefix={ID_PREFIX.project}
                create={(id) => ({
                  id,
                  name: "",
                  url: null,
                  technologies: [],
                  bullets: [],
                })}
                makeId={makeId}
                issues={issues}
                onChange={section("projects")}
              />
            )}

            {draft.customSections.map((custom, index) => (
              <EntrySection
                key={custom.id}
                section={`customSections.${index}.entries`}
                title={custom.title || "Untitled section"}
                itemLabel="item"
                addLabel="Add item"
                emptyHint={`Add the first item to ${custom.title || "this section"}`}
                untitled="New item"
                entries={custom.entries}
                fields={CUSTOM_FIELDS}
                heading={(entry) => entry.title}
                subheading={(entry) =>
                  [entry.subtitle, entry.date].filter(Boolean).join(" · ")
                }
                idPrefix={ID_PREFIX.customEntry}
                create={(id) => ({
                  id,
                  title: "",
                  subtitle: null,
                  date: null,
                  bullets: [],
                })}
                makeId={makeId}
                issues={issues}
                extraIssueCount={
                  issues.has(`customSections.${index}.title`) ? 1 : 0
                }
                onChange={(update) =>
                  setCustomSections((current) =>
                    current.map((entry) =>
                      entry.id === custom.id
                        ? { ...entry, entries: update(entry.entries) }
                        : entry,
                    ),
                  )
                }
                preface={
                  <div className="flex items-end gap-3">
                    <TextField
                      label="Section title"
                      className="min-w-0 flex-1"
                      placeholder="Certifications"
                      autoFocus={custom.id === focusSectionId}
                      value={custom.title}
                      error={issues.get(`customSections.${index}.title`)}
                      onChange={(title) =>
                        setCustomSections((current) =>
                          current.map((entry) =>
                            entry.id === custom.id ? { ...entry, title } : entry,
                          ),
                        )
                      }
                    />
                    <IdChip id={custom.id} className="mb-2.5 shrink-0" />
                  </div>
                }
                headerAction={
                  <>
                    <button
                      type="button"
                      aria-label={`Move ${custom.title || "section"} up`}
                      title="Move section up"
                      disabled={index === 0}
                      className={iconButtonClass}
                      onClick={() => moveCustomSection(custom.id, -1)}
                    >
                      <ArrowUp className="size-4" aria-hidden />
                    </button>
                    <button
                      type="button"
                      aria-label={`Move ${custom.title || "section"} down`}
                      title="Move section down"
                      disabled={index === draft.customSections.length - 1}
                      className={iconButtonClass}
                      onClick={() => moveCustomSection(custom.id, 1)}
                    >
                      <ArrowDown className="size-4" aria-hidden />
                    </button>
                    <button
                      type="button"
                      aria-label={`Remove ${custom.title || "section"}`}
                      title="Remove section"
                      className={dangerButtonClass}
                      onClick={() => removeCustomSection(index)}
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </button>
                  </>
                }
              />
            ))}

            <DropdownMenu>
              <DropdownMenuTrigger className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-zinc-700 px-4 py-4 text-sm text-zinc-400 transition-colors duration-150 ease-out outline-none hover:border-indigo-500/60 hover:bg-indigo-500/5 hover:text-zinc-100 focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:border-indigo-500/60 data-[state=open]:text-zinc-100">
                <Plus className="size-4" aria-hidden />
                Add custom section
              </DropdownMenuTrigger>
              <DropdownMenuContent align="center" className="w-64">
                <DropdownMenuLabel>Add a section</DropdownMenuLabel>
                {!projectsVisible && (
                  <DropdownMenuItem onSelect={() => setProjectsAdded(true)}>
                    Projects
                  </DropdownMenuItem>
                )}
                {availablePresets.map((title) => (
                  <DropdownMenuItem
                    key={title}
                    onSelect={() => addCustomSection(title)}
                  >
                    {title}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => addCustomSection("")}>
                  <Plus aria-hidden />
                  Blank section, name it yourself
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {previewVisible && (
            <aside
              aria-label="Resume preview"
              className="order-first min-w-0 animate-rise-in xl:sticky xl:top-24 xl:order-last xl:max-h-[calc(100dvh-10.5rem)] xl:self-start xl:overflow-y-auto"
            >
              {inspectingId ? (
                <div className="space-y-3">
                  <div className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-3.5 py-3 text-sm text-amber-100">
                    <p className="font-medium">
                      {inspected
                        ? `Version ${inspected.version}, saved ${formatDate(inspected.createdAt)}`
                        : "Earlier version"}{" "}
                      · read-only
                    </p>
                    <p className="mt-0.5 text-amber-100/80">
                      Saved versions cannot be edited. Copy this one into the
                      editor to build a new version from it.
                    </p>
                    <div className="mt-2.5 flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        disabled={!inspected}
                        onClick={() => {
                          if (!inspected) return;
                          replaceDraft(inspected.resume);
                          setInspectingId(null);
                          toast.success(
                            `Version ${inspected.version} copied into the editor`,
                            {
                              description:
                                "Nothing is saved until you choose Save new version.",
                              duration: 15_000,
                              action: { label: "Undo", onClick: undo },
                            },
                          );
                        }}
                      >
                        Use as draft
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setInspectingId(null)}
                      >
                        Back to current
                      </Button>
                    </div>
                  </div>
                  {inspectedQuery.isError ? (
                    <InlineAlert tone="error">
                      That version could not be loaded.
                    </InlineAlert>
                  ) : inspected ? (
                    <ResumePreview
                      master={inspected.resume}
                      patch={null}
                      companyName={null}
                    />
                  ) : (
                    <div
                      className="aspect-[8.5/11] w-full animate-pulse rounded-lg border border-zinc-800 bg-zinc-900"
                      aria-busy="true"
                      aria-label="Loading version"
                    />
                  )}
                </div>
              ) : (
                <ResumePreview
                  master={previewDraft}
                  patch={null}
                  companyName={null}
                />
              )}
            </aside>
          )}
        </div>

        {pageDragging && (
          <div
            className="pointer-events-none absolute inset-0 z-30 flex animate-fade-in items-center justify-center bg-zinc-950/70 p-6 backdrop-blur-sm"
            aria-hidden
          >
            <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-indigo-400/70 bg-indigo-500/10 px-12 py-10 text-center shadow-2xl shadow-indigo-500/20">
              <span className="flex size-12 items-center justify-center rounded-full bg-indigo-500/20 text-indigo-200">
                <Upload className="size-6" aria-hidden />
              </span>
              <p className="text-base font-medium">Drop your resume to import it</p>
              <p className="text-sm text-muted-foreground">
                PDF or JSON. It opens in the editor for review; nothing is saved.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Outside the drop target above, so drops inside the dialog are its own. */}
      <QuickImportDialog
        open={importOpen}
        initialFile={droppedFile}
        onOpenChange={(open) => {
          setImportOpen(open);
          if (!open) setDroppedFile(null);
        }}
        onImport={handleImport}
      />
    </>
  );
}
