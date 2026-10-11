"use client";

import {
  ArrowUp,
  Check,
  CheckCircle2,
  Columns2,
  FileText,
  Loader2,
  Rows2,
  ShieldCheck,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { useState, type ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { diffWords, type DiffToken } from "@/lib/diff";
import type {
  AtsKeywords,
  ExperienceOverride,
  JobApplication,
  MasterResume,
  PatchDocument,
  ResumeExperience,
} from "@/lib/types/resume";
import { cn } from "@/lib/utils";

export interface ResumeDiffViewerProps {
  master: MasterResume;
  patch: PatchDocument;
  application?: JobApplication | null;
  onTailor?: () => void;
  isTailoring?: boolean;
}

interface BulletRow {
  id: string;
  original: string;
  tailored: string;
  isAdapted: boolean;
  promotedRank: number | null; // 1-based rank if promoted
  addedKeywords: string[];
}

function calculateBaselineScore(
  master: MasterResume,
  atsKeywords?: AtsKeywords,
  tailoredScore = 85,
): number {
  if (!atsKeywords || !atsKeywords.matched || atsKeywords.matched.length === 0) {
    return Math.max(30, tailoredScore - 26);
  }

  const masterText = [
    master.summary || "",
    master.basics.headline || "",
    ...master.skills.flatMap((s) => s.skills),
    ...master.experience.flatMap((e) => [
      e.company,
      e.title,
      ...e.bullets.map((b) => b.text),
    ]),
  ]
    .join(" ")
    .toLowerCase();

  let rawMatches = 0;
  for (const kw of atsKeywords.matched) {
    if (masterText.includes(kw.toLowerCase())) rawMatches++;
  }

  const totalKws =
    atsKeywords.matched.length + (atsKeywords.missing?.length || 0);
  if (totalKws === 0) return Math.max(30, tailoredScore - 26);

  const rawPct = Math.round((rawMatches / totalKws) * 100);
  return Math.min(tailoredScore - 8, Math.max(25, rawPct));
}

function findAddedKeywords(
  original: string,
  tailored: string,
  matchedKeywords: string[] = [],
): string[] {
  const origLower = original.toLowerCase();
  const tailLower = tailored.toLowerCase();
  const added: string[] = [];

  for (const kw of matchedKeywords) {
    const kwLower = kw.toLowerCase();
    if (tailLower.includes(kwLower) && !origLower.includes(kwLower)) {
      added.push(kw);
    }
  }
  return added;
}

function buildBulletRows(
  experience: ResumeExperience,
  override?: ExperienceOverride,
  matchedKeywords: string[] = [],
): BulletRow[] {
  const byId = new Map(experience.bullets.map((b) => [b.id, b.text]));
  if (!override) {
    return experience.bullets.map((b) => ({
      id: b.id,
      original: b.text,
      tailored: b.text,
      isAdapted: false,
      promotedRank: null,
      addedKeywords: [],
    }));
  }

  const adaptedMap = new Map(
    override.adaptedBullets.map((ab) => [ab.id, ab.text]),
  );
  const promotedList = override.promotedBulletIds.filter((id) => byId.has(id));
  const remainingIds = experience.bullets
    .map((b) => b.id)
    .filter((id) => !promotedList.includes(id));

  return [...promotedList, ...remainingIds].map((id, index) => {
    const original = byId.get(id) || "";
    const tailored = adaptedMap.get(id) || original;
    const isPromoted = promotedList.includes(id);
    const isAdapted = adaptedMap.has(id);
    const addedKeywords = isAdapted
      ? findAddedKeywords(original, tailored, matchedKeywords)
      : [];

    return {
      id,
      original,
      tailored,
      isAdapted,
      promotedRank: isPromoted ? index + 1 : null,
      addedKeywords,
    };
  });
}

function DiffTokensView({
  tokens,
  tone,
}: {
  tokens: DiffToken[];
  tone: "removed" | "added";
}) {
  return (
    <>
      {tokens.map((token, idx) => (
        <span key={idx}>
          {idx > 0 && " "}
          <span
            className={cn(
              token.changed &&
                tone === "removed" &&
                "rounded bg-rose-500/10 px-0.5 text-zinc-400 line-through decoration-rose-500/60",
              token.changed &&
                tone === "added" &&
                "rounded bg-emerald-500/15 px-1 py-0.5 font-medium text-emerald-300 ring-1 ring-emerald-500/30",
            )}
          >
            {token.text}
          </span>
        </span>
      ))}
    </>
  );
}

export function ResumeDiffViewer({
  master,
  patch,
  application,
  onTailor,
  isTailoring = false,
}: ResumeDiffViewerProps) {
  const [viewMode, setViewMode] = useState<"split" | "unified">("split");
  const [mobileTab, setMobileTab] = useState<"master" | "tailored">("tailored");

  const tailoredScore = application?.matchScore ?? 88;
  const baseScore = calculateBaselineScore(
    master,
    application?.atsKeywords,
    tailoredScore,
  );
  const scoreDelta = Math.max(1, tailoredScore - baseScore);

  const matchedKeywords = application?.atsKeywords?.matched || [];
  const missingKeywords = application?.atsKeywords?.missing || [];

  const summaryOriginal = master.summary || master.basics.headline || "";
  const summaryTailored =
    patch.modifications.summary ||
    summaryOriginal;
  const summaryDiff =
    summaryOriginal && summaryTailored
      ? diffWords(summaryOriginal, summaryTailored)
      : null;

  return (
    <div className="space-y-6">
      {/* 1. Header Comparison Bar */}
      <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/60 p-4 backdrop-blur-md shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          {/* Score Jump Badge */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                ATS Match Jump:
              </span>
              <div className="inline-flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-1.5 font-mono text-sm shadow-inner">
                <span className="text-zinc-400 font-medium">{baseScore}% Base</span>
                <span className="text-zinc-600">→</span>
                <span className="font-semibold text-emerald-400">
                  {tailoredScore}% Tailored
                </span>
                <span className="inline-flex items-center gap-1 rounded bg-emerald-500/15 px-1.5 py-0.5 text-xs font-semibold text-emerald-300">
                  <TrendingUp className="size-3" />
                  +{scoreDelta}%
                </span>
              </div>
            </div>

            {application?.tailoredByModel && (
              <span className="hidden text-xs text-zinc-500 md:inline">
                via {application.tailoredByModel}
              </span>
            )}
          </div>

          {/* Controls: View Mode & Re-tailor */}
          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-lg border border-zinc-800 bg-zinc-950 p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setViewMode("split")}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-2.5 py-1 font-medium transition-colors",
                  viewMode === "split"
                    ? "bg-zinc-800 text-zinc-100 shadow-sm"
                    : "text-zinc-400 hover:text-zinc-200",
                )}
              >
                <Columns2 className="size-3.5" />
                <span className="hidden xs:inline">Side-by-Side</span>
                <span className="xs:hidden">Split</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode("unified")}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-2.5 py-1 font-medium transition-colors",
                  viewMode === "unified"
                    ? "bg-zinc-800 text-zinc-100 shadow-sm"
                    : "text-zinc-400 hover:text-zinc-200",
                )}
              >
                <Rows2 className="size-3.5" />
                <span className="hidden xs:inline">Unified Diff</span>
                <span className="xs:hidden">Unified</span>
              </button>
            </div>

            {onTailor && (
              <Button
                variant="outline"
                size="sm"
                disabled={isTailoring}
                onClick={onTailor}
                className="h-8 border-zinc-800 bg-zinc-900/80 text-xs font-medium text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
              >
                {isTailoring ? (
                  <Loader2 className="mr-1.5 size-3 animate-spin" />
                ) : (
                  <Sparkles className="mr-1.5 size-3 text-indigo-400" />
                )}
                {isTailoring ? "Tailoring…" : "Re-tailor"}
              </Button>
            )}
          </div>
        </div>

        {/* ATS Keyword Match Pills */}
        <div className="mt-3.5 border-t border-zinc-800/60 pt-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-xs font-medium text-zinc-400">
              Matched Keywords:
            </span>
            {matchedKeywords.map((kw) => (
              <Badge
                key={kw}
                variant="success"
                className="gap-1 bg-emerald-950/40 text-emerald-300 border-emerald-800/50 text-[11px] font-normal"
              >
                <Check className="size-3 text-emerald-400" />
                {kw}
              </Badge>
            ))}
            {missingKeywords.slice(0, 4).map((kw) => (
              <Badge
                key={kw}
                variant="outline"
                className="border-zinc-800 text-zinc-500 text-[11px] font-normal"
              >
                {kw}
              </Badge>
            ))}
            {missingKeywords.length > 4 && (
              <span className="text-[11px] text-zinc-500">
                +{missingKeywords.length - 4} more
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Mobile-only view toggle for Split Mode */}
      {viewMode === "split" && (
        <div className="flex sm:hidden rounded-lg border border-zinc-800 bg-zinc-950 p-1 text-xs">
          <button
            type="button"
            onClick={() => setMobileTab("master")}
            className={cn(
              "flex-1 py-1.5 font-medium rounded-md transition-colors",
              mobileTab === "master"
                ? "bg-zinc-800 text-zinc-100 shadow"
                : "text-zinc-400",
            )}
          >
            Master Baseline
          </button>
          <button
            type="button"
            onClick={() => setMobileTab("tailored")}
            className={cn(
              "flex-1 py-1.5 font-medium rounded-md transition-colors",
              mobileTab === "tailored"
                ? "bg-indigo-950/80 text-indigo-200 border border-indigo-800/50 shadow"
                : "text-zinc-400",
            )}
          >
            Tailored Patch (ATS)
          </button>
        </div>
      )}

      {/* 2. Summary Comparison Card */}
      {summaryTailored && (
        <div className="overflow-hidden rounded-xl border border-zinc-800/80 bg-zinc-900/60 shadow-sm">
          <div className="flex items-center justify-between border-b border-zinc-800/80 bg-zinc-900/80 px-4 py-2.5">
            <div className="flex items-center gap-2">
              <FileText className="size-4 text-indigo-400" />
              <span className="text-xs font-semibold text-zinc-200 uppercase tracking-wider">
                Summary & Role Framing
              </span>
            </div>
            {summaryTailored !== summaryOriginal ? (
              <Badge
                variant="accent"
                className="bg-indigo-500/15 text-indigo-300 border-indigo-500/30 text-[10px]"
              >
                Framing Optimized
              </Badge>
            ) : (
              <Badge variant="outline" className="border-zinc-800 text-zinc-400 text-[10px]">
                Kept Master Baseline
              </Badge>
            )}
          </div>

          {viewMode === "split" ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-zinc-800/80">
              {/* Left: Master Original */}
              <div
                className={cn(
                  "p-4 bg-zinc-950/40",
                  mobileTab === "tailored" && "hidden sm:block",
                )}
              >
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-medium text-zinc-400">
                    Master Baseline
                  </span>
                  {master.basics.headline && (
                    <span className="text-[11px] font-mono text-zinc-500 truncate max-w-[200px]">
                      {master.basics.headline}
                    </span>
                  )}
                </div>
                <p className="text-sm leading-relaxed text-zinc-400">
                  {summaryDiff ? (
                    <DiffTokensView tokens={summaryDiff.original} tone="removed" />
                  ) : (
                    summaryOriginal
                  )}
                </p>
              </div>

              {/* Right: Tailored Variant */}
              <div
                className={cn(
                  "p-4 bg-indigo-950/10",
                  mobileTab === "master" && "hidden sm:block",
                )}
              >
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-semibold text-indigo-300">
                    ATS Tailored Overlay
                  </span>
                  {application?.roleTitle && (
                    <span className="text-[11px] font-mono text-indigo-400 font-medium truncate max-w-[200px]">
                      {application.roleTitle}
                    </span>
                  )}
                </div>
                <p className="text-sm leading-relaxed text-zinc-200">
                  {summaryDiff ? (
                    <DiffTokensView tokens={summaryDiff.tailored} tone="added" />
                  ) : (
                    summaryTailored
                  )}
                </p>
              </div>
            </div>
          ) : (
            /* Unified Git-Style Diff */
            <div className="divide-y divide-zinc-800/80 p-3 font-mono text-xs space-y-2">
              {summaryDiff ? (
                <>
                  <div className="rounded border-l-2 border-rose-500/60 bg-rose-950/15 p-2.5 text-zinc-400 leading-relaxed">
                    <span className="mr-2 text-rose-400 select-none">-</span>
                    <DiffTokensView tokens={summaryDiff.original} tone="removed" />
                  </div>
                  <div className="rounded border-l-2 border-emerald-500/70 bg-emerald-950/20 p-2.5 text-emerald-200 leading-relaxed">
                    <span className="mr-2 text-emerald-400 select-none">+</span>
                    <DiffTokensView tokens={summaryDiff.tailored} tone="added" />
                  </div>
                </>
              ) : (
                <div className="p-2.5 text-zinc-300">{summaryOriginal}</div>
              )}
            </div>
          )}
        </div>
      )}

      {/* 3. Experience Bullets Comparison Grid */}
      <div className="space-y-4">
        <div className="hidden sm:grid sm:grid-cols-2 px-3 text-xs font-semibold uppercase tracking-wider text-zinc-400">
          <span>Column 1: Master Baseline (Original)</span>
          <span className="pl-4 text-emerald-400">
            Column 2: Tailored Patch (ATS Optimized)
          </span>
        </div>

        {master.experience.map((exp) => {
          const override = patch.modifications.experienceOverrides.find(
            (o) => o.experienceId === exp.id,
          );
          const rows = buildBulletRows(exp, override, matchedKeywords);

          return (
            <div
              key={exp.id}
              className="overflow-hidden rounded-xl border border-zinc-800/80 bg-zinc-900/60 shadow-sm"
            >
              {/* Role Header */}
              <div className="flex flex-wrap items-center justify-between border-b border-zinc-800/80 bg-zinc-900/90 px-4 py-2.5">
                <div>
                  <h4 className="text-sm font-semibold text-zinc-100">
                    {exp.title}
                  </h4>
                  <p className="text-xs text-zinc-400">
                    {exp.company}
                    {exp.location ? ` · ${exp.location}` : ""}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-zinc-500">
                    {exp.startDate} – {exp.endDate ?? "Present"}
                  </span>
                  {override && (
                    <Badge
                      variant="success"
                      className="bg-emerald-950/50 text-emerald-300 border-emerald-800/60 text-[10px]"
                    >
                      {override.promotedBulletIds.length} re-ranked
                    </Badge>
                  )}
                </div>
              </div>

              {/* Bullet Rows */}
              <div className="divide-y divide-zinc-800/70">
                {rows.map((row) => {
                  const diff = row.isAdapted
                    ? diffWords(row.original, row.tailored)
                    : null;

                  return (
                    <div key={row.id}>
                      {viewMode === "split" ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 sm:divide-x divide-zinc-800/70">
                          {/* Column 1: Master Baseline */}
                          <div
                            className={cn(
                              "p-3.5 bg-zinc-950/30 text-sm text-zinc-400 leading-relaxed",
                              mobileTab === "tailored" && "hidden sm:block",
                            )}
                          >
                            <div className="flex items-start gap-2">
                              <span className="mt-1 size-1.5 shrink-0 rounded-full bg-zinc-600" />
                              <div className="flex-1">
                                {diff ? (
                                  <DiffTokensView
                                    tokens={diff.original}
                                    tone="removed"
                                  />
                                ) : (
                                  <span>{row.original}</span>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Column 2: Tailored Variant */}
                          <div
                            className={cn(
                              "p-3.5 bg-zinc-900/40 text-sm text-zinc-200 leading-relaxed sm:border-l-0",
                              mobileTab === "master" && "hidden sm:block",
                              (row.isAdapted || row.promotedRank) &&
                                "bg-emerald-950/10",
                            )}
                          >
                            <div className="flex items-start gap-2">
                              <span
                                className={cn(
                                  "mt-1 size-1.5 shrink-0 rounded-full",
                                  row.isAdapted || row.promotedRank
                                    ? "bg-emerald-400"
                                    : "bg-zinc-600",
                                )}
                              />
                              <div className="flex-1">
                                {diff ? (
                                  <DiffTokensView
                                    tokens={diff.tailored}
                                    tone="added"
                                  />
                                ) : (
                                  <span>{row.original}</span>
                                )}

                                {/* Indicator Badges */}
                                {(row.promotedRank !== null ||
                                  row.isAdapted ||
                                  row.addedKeywords.length > 0) && (
                                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                    {row.promotedRank !== null && (
                                      <Badge
                                        variant="warning"
                                        className="gap-1 bg-amber-500/15 text-amber-300 border-amber-500/30 text-[10px] font-semibold"
                                      >
                                        <ArrowUp className="size-2.5" />
                                        Re-ranked #{row.promotedRank}
                                      </Badge>
                                    )}
                                    {row.isAdapted && (
                                      <Badge
                                        variant="success"
                                        className="bg-emerald-500/15 text-emerald-300 border-emerald-500/30 text-[10px] font-medium"
                                      >
                                        Reworded for ATS
                                      </Badge>
                                    )}
                                    {row.addedKeywords.map((kw) => (
                                      <Badge
                                        key={kw}
                                        variant="accent"
                                        className="bg-indigo-500/15 text-indigo-300 border-indigo-500/30 text-[10px] font-medium"
                                      >
                                        + {kw}
                                      </Badge>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      ) : (
                        /* Unified View */
                        <div className="p-3 text-xs font-mono space-y-1.5 bg-zinc-950/40">
                          {diff ? (
                            <>
                              <div className="flex items-start gap-2 rounded bg-rose-950/15 px-2 py-1.5 text-zinc-400">
                                <span className="font-bold text-rose-500 select-none">
                                  -
                                </span>
                                <div className="leading-relaxed">
                                  <DiffTokensView
                                    tokens={diff.original}
                                    tone="removed"
                                  />
                                </div>
                              </div>
                              <div className="flex items-start gap-2 rounded bg-emerald-950/20 px-2 py-1.5 text-emerald-200">
                                <span className="font-bold text-emerald-400 select-none">
                                  +
                                </span>
                                <div className="leading-relaxed">
                                  <DiffTokensView
                                    tokens={diff.tailored}
                                    tone="added"
                                  />
                                </div>
                              </div>
                            </>
                          ) : (
                            <div className="flex items-start gap-2 px-2 py-1 text-zinc-300 leading-relaxed">
                              <span className="text-zinc-600 select-none">•</span>
                              <div>{row.original}</div>
                            </div>
                          )}

                          {row.promotedRank !== null && (
                            <div className="pl-4 pt-0.5">
                              <Badge
                                variant="warning"
                                className="gap-1 bg-amber-500/15 text-amber-300 border-amber-500/30 text-[10px]"
                              >
                                <ArrowUp className="size-2.5" />
                                Re-ranked #{row.promotedRank}
                              </Badge>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* 4. Highlighted Skills */}
      {patch.modifications.highlightedSkills &&
        patch.modifications.highlightedSkills.length > 0 && (
          <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/60 p-4 shadow-sm">
            <h4 className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Prioritized ATS Skills for this Role
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {patch.modifications.highlightedSkills.map((skill) => (
                <Badge
                  key={skill}
                  variant="accent"
                  className="bg-indigo-950/40 text-indigo-300 border-indigo-800/50 text-xs"
                >
                  <CheckCircle2 className="mr-1 size-3 text-indigo-400" />
                  {skill}
                </Badge>
              ))}
            </div>
          </div>
        )}

      {/* 5. Zero-Hallucination Audit Verification Banner */}
      <div className="flex items-start gap-3 rounded-xl border border-emerald-900/50 bg-emerald-950/20 p-4 shadow-sm">
        <ShieldCheck className="mt-0.5 size-5 shrink-0 text-emerald-400" />
        <div>
          <h5 className="text-xs font-semibold text-emerald-300">
            Verified Truth Guarantee
          </h5>
          <p className="mt-0.5 text-xs text-emerald-200/80 leading-relaxed">
            Zero metrics, companies, or dates were fabricated. Only verified
            achievements from your master resume were re-ranked and phrased for
            ATS alignment.
          </p>
        </div>
      </div>
    </div>
  );
}
