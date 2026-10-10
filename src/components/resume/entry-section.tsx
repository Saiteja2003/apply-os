"use client";

import { ChevronDown, Hash, Plus, Trash2, TriangleAlert } from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  assessBullet,
  BULLET_MAX_CHARS,
  type BulletLength,
} from "@/lib/resume/bullet-quality";
import { ID_PREFIX } from "@/lib/resume/ids";
import type { ResumeBullet } from "@/lib/types/resume";
import { cn } from "@/lib/utils";

import {
  Collapse,
  CommaListField,
  IdChip,
  SectionCard,
  TextField,
} from "./fields";
import { moveById, SortableList } from "./sortable-list";

interface FieldBase {
  /** Key in the entry, used to look up validation issues. */
  name: string;
  label: string;
  hint?: string;
  placeholder?: string;
  /** Span both columns. */
  wide?: boolean;
}

export type EntryField<T> = FieldBase &
  (
    | {
        kind?: "text";
        get: (entry: T) => string;
        set: (entry: T, value: string) => T;
      }
    | {
        kind: "list";
        get: (entry: T) => string[];
        set: (entry: T, value: string[]) => T;
      }
  );

type Entry = { id: string; bullets: ResumeBullet[] };

interface EntrySectionProps<T extends Entry> {
  /** Path of the entry list in the resume, e.g. `experience`. */
  section: string;
  title: string;
  /** Singular name of one entry, e.g. "role". */
  itemLabel: string;
  addLabel: string;
  emptyHint: string;
  /** Shown when an entry has no heading yet, e.g. "New role". */
  untitled: string;
  entries: T[];
  fields: EntryField<T>[];
  heading: (entry: T) => string;
  subheading: (entry: T) => string;
  idPrefix: string;
  create: (id: string) => T;
  /** A new id that no node in the resume has ever used. */
  makeId: (prefix: string) => string;
  /** Validation issues by dotted path. */
  issues: ReadonlyMap<string, string>;
  onChange: (update: (entries: T[]) => T[]) => void;
  /** Extra controls above the entries, e.g. a field for the section's title. */
  preface?: ReactNode;
  /** Extra controls in the section header, e.g. Remove section. */
  headerAction?: ReactNode;
  /** Other issues that belong to this section but not to one entry. */
  extraIssueCount?: number;
}

const insertAt = <V,>(list: V[], index: number, value: V) => [
  ...list.slice(0, index),
  value,
  ...list.slice(index),
];

const iconButtonClass =
  "flex size-8 shrink-0 items-center justify-center rounded-md text-zinc-500 transition-colors duration-150 outline-none hover:bg-red-500/10 hover:text-red-300 focus-visible:ring-2 focus-visible:ring-ring";

const LENGTH_TONE: Record<BulletLength, { bar: string; text: string; label: string }> = {
  empty: { bar: "bg-zinc-700", text: "text-zinc-600", label: "Empty" },
  short: { bar: "bg-amber-400", text: "text-amber-300", label: "Thin: add what you did and the result" },
  good: { bar: "bg-emerald-400", text: "text-zinc-400", label: "Good length" },
  long: { bar: "bg-amber-400", text: "text-amber-300", label: "Long: likely to wrap to three lines" },
};

/** Length and impact signals for one bullet. Hints only; they never block saving. */
function BulletMeter({ text }: { text: string }) {
  const quality = assessBullet(text);
  const tone = LENGTH_TONE[quality.length];

  return (
    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px]">
      <span className="flex items-center gap-1.5" title={tone.label}>
        <span className="h-1 w-12 overflow-hidden rounded-full bg-zinc-800" aria-hidden>
          <span
            className={cn(
              "block h-full rounded-full transition-[width,background-color] duration-200 ease-out",
              tone.bar,
            )}
            style={{
              width: `${Math.min(100, (quality.chars / BULLET_MAX_CHARS) * 100)}%`,
            }}
          />
        </span>
        <span className={cn("tabular-nums", tone.text)}>
          {quality.chars}
          <span className="sr-only"> characters. {tone.label}</span>
        </span>
      </span>

      {quality.length !== "empty" &&
        (quality.quantified ? (
          <span className="flex items-center gap-1 text-emerald-300" title="Carries a number, which is what makes impact concrete">
            <Hash className="size-3" aria-hidden />
            Quantified
          </span>
        ) : (
          <span className="text-zinc-500" title="Bullets with a number (how much, how many, how fast) read as stronger">
            No metric
          </span>
        ))}

      {quality.weakOpener && (
        <span
          className="flex items-center gap-1 text-amber-300"
          title={`"${quality.weakOpener}" describes a duty. Lead with what you did.`}
        >
          <TriangleAlert className="size-3" aria-hidden />
          Passive opener
        </span>
      )}
    </div>
  );
}

/** A list of resume entries (jobs, schools, projects, custom items) with their bullets. */
export function EntrySection<T extends Entry>({
  section,
  title,
  itemLabel,
  addLabel,
  emptyHint,
  untitled,
  entries,
  fields,
  heading,
  subheading,
  idPrefix,
  create,
  makeId,
  issues,
  onChange,
  preface,
  headerAction,
  extraIssueCount = 0,
}: EntrySectionProps<T>) {
  const [openIds, setOpenIds] = useState<ReadonlySet<string>>(new Set());
  const [focusBulletId, setFocusBulletId] = useState<string | null>(null);

  const issuePaths = [...issues.keys()];
  const issuesUnder = (prefix: string) =>
    issuePaths.filter((path) => path.startsWith(prefix)).length;

  const setOpen = (id: string, open: boolean) =>
    setOpenIds((current) => {
      const next = new Set(current);
      if (open) next.add(id);
      else next.delete(id);
      return next;
    });

  const updateEntry = (id: string, update: (entry: T) => T) =>
    onChange((current) =>
      current.map((entry) => (entry.id === id ? update(entry) : entry)),
    );

  function addEntry() {
    const entry = create(makeId(idPrefix));
    onChange((current) => [entry, ...current]);
    setOpen(entry.id, true);
  }

  function removeEntry(index: number) {
    const removed = entries[index];
    onChange((current) => current.filter((entry) => entry.id !== removed.id));
    toast(`Removed "${heading(removed) || untitled}"`, {
      description: "Nothing changes in your saved resume until you save.",
      action: {
        label: "Undo",
        onClick: () =>
          onChange((current) =>
            current.some((entry) => entry.id === removed.id)
              ? current
              : insertAt(current, Math.min(index, current.length), removed),
          ),
      },
    });
  }

  function addBullet(entryId: string) {
    const bullet: ResumeBullet = { id: makeId(ID_PREFIX.bullet), text: "" };
    updateEntry(entryId, (entry) => ({
      ...entry,
      bullets: [...entry.bullets, bullet],
    }));
    setFocusBulletId(bullet.id);
  }

  function removeBullet(entryId: string, bulletIndex: number, bullet: ResumeBullet) {
    updateEntry(entryId, (entry) => ({
      ...entry,
      bullets: entry.bullets.filter((candidate) => candidate.id !== bullet.id),
    }));
    // An empty bullet has nothing worth restoring.
    if (!bullet.text.trim()) return;
    toast("Bullet removed", {
      action: {
        label: "Undo",
        onClick: () =>
          updateEntry(entryId, (entry) =>
            entry.bullets.some((candidate) => candidate.id === bullet.id)
              ? entry
              : {
                  ...entry,
                  bullets: insertAt(
                    entry.bullets,
                    Math.min(bulletIndex, entry.bullets.length),
                    bullet,
                  ),
                },
          ),
      },
    });
  }

  return (
    <SectionCard
      title={title}
      count={entries.length}
      issueCount={issuesUnder(`${section}.`) + extraIssueCount}
      action={
        <>
          <Button variant="outline" size="sm" onClick={addEntry}>
            <Plus aria-hidden />
            {addLabel}
          </Button>
          {headerAction}
        </>
      }
    >
      {preface && <div className="mb-4">{preface}</div>}

      {entries.length === 0 ? (
        <button
          type="button"
          onClick={addEntry}
          className="flex w-full flex-col items-center gap-2 rounded-lg border border-dashed border-zinc-800 px-3 py-7 text-center text-[13px] text-zinc-400 transition-colors duration-150 outline-none hover:border-indigo-500/60 hover:bg-indigo-500/5 hover:text-zinc-100 focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="flex size-8 items-center justify-center rounded-full bg-indigo-500/15 text-indigo-300">
            <Plus className="size-4" aria-hidden />
          </span>
          {emptyHint}
        </button>
      ) : (
        <SortableList
          items={entries}
          itemLabel={itemLabel}
          className="space-y-2"
          onMove={(fromId, toId) =>
            onChange((current) => moveById(current, fromId, toId))
          }
        >
          {(entry, index, entryHandle) => {
            const open = openIds.has(entry.id);
            const path = `${section}.${index}`;
            const entryIssues = issuesUnder(`${path}.`);
            const panelId = `${section}-${entry.id}`;

            return (
              <div
                className={cn(
                  "rounded-lg border bg-zinc-950/60 transition-colors duration-150",
                  entryIssues > 0 ? "border-red-500/30" : "border-zinc-800/80",
                )}
              >
                <div className="flex items-center gap-1 p-1.5">
                  {entryHandle}
                  <button
                    type="button"
                    onClick={() => setOpen(entry.id, !open)}
                    aria-expanded={open}
                    aria-controls={panelId}
                    className="flex min-w-0 flex-1 items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors duration-150 outline-none hover:bg-zinc-800/40 focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <ChevronDown
                      className={cn(
                        "size-4 shrink-0 text-zinc-500 transition-transform duration-200 ease-out",
                        !open && "-rotate-90",
                      )}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1">
                      <span
                        className={cn(
                          "block truncate text-sm font-medium",
                          !heading(entry) && "text-zinc-500",
                        )}
                      >
                        {heading(entry) || untitled}
                      </span>
                      <span className="block truncate text-xs text-zinc-500">
                        {[
                          subheading(entry),
                          `${entry.bullets.length} ${
                            entry.bullets.length === 1 ? "bullet" : "bullets"
                          }`,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                    {entryIssues > 0 && (
                      <span className="shrink-0 text-xs text-red-400">
                        {entryIssues} to fix
                      </span>
                    )}
                    <IdChip id={entry.id} className="hidden shrink-0 sm:inline-block" />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeEntry(index)}
                    aria-label={`Delete ${heading(entry) || untitled}`}
                    title="Delete"
                    className={iconButtonClass}
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                </div>

                <Collapse open={open} id={panelId}>
                  <div className="space-y-4 border-t border-zinc-800/80 p-3.5">
                    <div className="grid gap-3 sm:grid-cols-2">
                      {fields.map((field) => {
                        const shared = {
                          label: field.label,
                          hint: field.hint,
                          placeholder: field.placeholder,
                          error: issues.get(`${path}.${field.name}`),
                          className: field.wide ? "sm:col-span-2" : undefined,
                        };
                        return field.kind === "list" ? (
                          <CommaListField
                            key={field.name}
                            {...shared}
                            values={field.get(entry)}
                            onChange={(value) =>
                              updateEntry(entry.id, (current) =>
                                field.set(current, value),
                              )
                            }
                          />
                        ) : (
                          <TextField
                            key={field.name}
                            {...shared}
                            value={field.get(entry)}
                            onChange={(value) =>
                              updateEntry(entry.id, (current) =>
                                field.set(current, value),
                              )
                            }
                          />
                        );
                      })}
                    </div>

                    <div>
                      <p className="mb-1.5 text-xs font-medium text-zinc-400">
                        Bullets
                      </p>
                      <SortableList
                        items={entry.bullets}
                        itemLabel="bullet"
                        className="space-y-1.5"
                        onMove={(fromId, toId) =>
                          updateEntry(entry.id, (current) => ({
                            ...current,
                            bullets: moveById(current.bullets, fromId, toId),
                          }))
                        }
                      >
                        {(bullet, bulletIndex, bulletHandle) => {
                          const error = issues.get(
                            `${path}.bullets.${bulletIndex}.text`,
                          );
                          return (
                            <div
                              className={cn(
                                "group/bullet flex items-start gap-1 rounded-lg border bg-zinc-900/70 p-1.5 transition-colors duration-150 focus-within:border-indigo-500/50 hover:border-zinc-700",
                                error ? "border-red-500/40" : "border-zinc-800/80",
                              )}
                            >
                              <div className="pt-0.5">{bulletHandle}</div>
                              <div className="min-w-0 flex-1">
                                <Textarea
                                  rows={2}
                                  value={bullet.text}
                                  autoFocus={bullet.id === focusBulletId}
                                  aria-label={`Bullet ${bulletIndex + 1}`}
                                  aria-invalid={error ? true : undefined}
                                  placeholder="What you did and the result, with the numbers."
                                  className="min-h-[3.25rem] resize-none border-transparent bg-transparent px-2 py-1.5 [field-sizing:content] hover:border-transparent focus:border-transparent focus:ring-0"
                                  onChange={(event) => {
                                    const text = event.target.value;
                                    updateEntry(entry.id, (current) => ({
                                      ...current,
                                      bullets: current.bullets.map((candidate) =>
                                        candidate.id === bullet.id
                                          ? { ...candidate, text }
                                          : candidate,
                                      ),
                                    }));
                                  }}
                                />
                                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 px-2 pb-1">
                                  <IdChip id={bullet.id} />
                                  <BulletMeter text={bullet.text} />
                                  {error && (
                                    <span role="alert" className="text-[11px] text-red-400">
                                      {error}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() =>
                                  removeBullet(entry.id, bulletIndex, bullet)
                                }
                                aria-label={`Delete bullet ${bulletIndex + 1}`}
                                title="Delete bullet"
                                className={cn(
                                  iconButtonClass,
                                  "mt-0.5 opacity-60 group-focus-within/bullet:opacity-100 group-hover/bullet:opacity-100",
                                )}
                              >
                                <Trash2 className="size-4" aria-hidden />
                              </button>
                            </div>
                          );
                        }}
                      </SortableList>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="mt-2 text-zinc-300"
                        onClick={() => addBullet(entry.id)}
                      >
                        <Plus aria-hidden />
                        Add bullet
                      </Button>
                    </div>
                  </div>
                </Collapse>
              </div>
            );
          }}
        </SortableList>
      )}
    </SectionCard>
  );
}
