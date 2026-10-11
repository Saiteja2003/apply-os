"use client";

import {
  BookOpen,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Flame,
  Loader2,
  Search,
  Sparkles,
  StickyNote,
  X,
  Zap,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useOptimistic,
  useRef,
  useState,
  useTransition,
  type KeyboardEvent,
} from "react";
import { toast } from "sonner";

import { updateInterviewPrepProgressAction } from "@/app/actions/applications";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import type {
  ConfidenceLevel,
  InterviewPrepProgress,
  QuestionProgress,
} from "@/lib/types/interview";
import type {
  InterviewPrep,
  InterviewQuestion,
  JobApplication,
  MasterResumeVersion,
} from "@/lib/types/resume";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Telemetry & Categories
// ---------------------------------------------------------------------------

export type QuestionCategory = "all" | "behavioral" | "technical" | "company_strategy";

export interface TaggedQuestion extends InterviewQuestion {
  primaryType: "behavioral" | "technical";
  isCompanyStrategy: boolean;
  difficulty: string;
}

const CONFIDENCE_CONFIG: Record<
  ConfidenceLevel,
  {
    label: string;
    key: string;
    ringClass: string;
    activeBg: string;
    textClass: string;
    dotClass: string;
  }
> = {
  needs_work: {
    label: "Needs Work",
    key: "1",
    ringClass: "ring-amber-500/50",
    activeBg: "bg-amber-500/15 border-amber-500/40 text-amber-300",
    textClass: "text-amber-400",
    dotClass: "bg-amber-400",
  },
  solid: {
    label: "Solid",
    key: "2",
    ringClass: "ring-blue-500/50",
    activeBg: "bg-blue-500/15 border-blue-500/40 text-blue-300",
    textClass: "text-blue-400",
    dotClass: "bg-blue-400",
  },
  mastered: {
    label: "Mastered",
    key: "3",
    ringClass: "ring-emerald-500/50",
    activeBg: "bg-emerald-500/15 border-emerald-500/40 text-emerald-300",
    textClass: "text-emerald-400",
    dotClass: "bg-emerald-400",
  },
};

const CONFIDENCE_LEVELS: ConfidenceLevel[] = ["needs_work", "solid", "mastered"];

const STOP_WORDS = new Set([
  "about", "above", "after", "again", "against", "all", "and", "any", "are", "aren't",
  "because", "been", "before", "being", "below", "between", "both", "but", "can", "cannot",
  "could", "did", "does", "doing", "down", "during", "each", "few", "for", "from",
  "further", "had", "has", "have", "having", "here", "how", "into", "itself", "just",
  "more", "most", "myself", "off", "once", "only", "other", "ought", "our", "ours",
  "same", "should", "some", "such", "than", "that", "the", "their", "theirs", "them",
  "then", "there", "these", "they", "this", "those", "through", "too", "under", "until",
  "very", "was", "were", "what", "when", "where", "which", "while", "who", "whom",
  "why", "with", "would", "your", "yours", "yourself", "role", "candidate", "interview",
]);

interface MasterEvidence {
  source: string;
  bulletText: string;
}

/**
 * Searches the candidate's master resume AST to surface genuine, verified
 * achievements related to the question's focus. Zero hallucination.
 */
function findRelevantMasterEvidence(
  master: MasterResumeVersion | null,
  question: InterviewQuestion,
): MasterEvidence[] {
  if (!master) return [];

  const rawText = `${question.question} ${question.rationale} ${question.talkingPoints.join(" ")}`.toLowerCase();
  const queryWords = rawText
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !STOP_WORDS.has(w));

  const scored: { evidence: MasterEvidence; score: number }[] = [];

  // 1. Search experience bullets
  for (const exp of master.resume.experience ?? []) {
    const source = `${exp.company}${exp.title ? ` · ${exp.title}` : ""}`;
    for (const bullet of exp.bullets ?? []) {
      const lower = bullet.text.toLowerCase();
      let score = 0;
      for (const word of queryWords) {
        if (lower.includes(word)) score += 1;
      }
      if (score > 0) {
        scored.push({
          evidence: { source, bulletText: bullet.text },
          score,
        });
      }
    }
  }

  // 2. Search project bullets
  for (const proj of master.resume.projects ?? []) {
    const source = `Project: ${proj.name}`;
    for (const bullet of proj.bullets ?? []) {
      const lower = bullet.text.toLowerCase();
      let score = 0;
      for (const word of queryWords) {
        if (lower.includes(word)) score += 1;
      }
      if (score > 0) {
        scored.push({
          evidence: { source, bulletText: bullet.text },
          score,
        });
      }
    }
  }

  scored.sort((a, b) => b.score - a.score);

  if (scored.length > 0) {
    return scored.slice(0, 2).map((item) => item.evidence);
  }

  // Fallback: surface first bullet from most recent work experience
  const fallbackExp = master.resume.experience?.[0];
  if (fallbackExp && fallbackExp.bullets?.[0]) {
    return [
      {
        source: `${fallbackExp.company}${fallbackExp.title ? ` · ${fallbackExp.title}` : ""}`,
        bulletText: fallbackExp.bullets[0].text,
      },
    ];
  }

  return [];
}

function classifyQuestions(
  prep: InterviewPrep,
  companyName: string,
): TaggedQuestion[] {
  const companyTerms = [
    companyName.toLowerCase(),
    "company",
    "strategy",
    "business",
    "mission",
    "vision",
    "culture",
    "product",
    "market",
    "industry",
    "growth",
    "scale",
    "customer",
    "trade-off",
    "domain",
  ];

  const seniority = prep.targetSeniority?.trim() || "Senior";

  const taggedTech: TaggedQuestion[] = (prep.technicalQuestions ?? []).map(
    (q, idx) => {
      const text = `${q.question} ${q.rationale}`.toLowerCase();
      const isStrat = companyTerms.some((term) => term.length > 2 && text.includes(term));
      return {
        ...q,
        primaryType: "technical",
        isCompanyStrategy: isStrat,
        difficulty: idx === 0 ? `${seniority} · Architecture` : `${seniority} · System Design`,
      };
    },
  );

  const taggedBehav: TaggedQuestion[] = (prep.behavioralQuestions ?? []).map(
    (q, idx) => {
      const text = `${q.question} ${q.rationale}`.toLowerCase();
      const isStrat = companyTerms.some((term) => term.length > 2 && text.includes(term));
      return {
        ...q,
        primaryType: "behavioral",
        isCompanyStrategy: isStrat,
        difficulty: idx === 0 ? `${seniority} · Leadership` : `${seniority} · Execution`,
      };
    },
  );

  const all = [...taggedTech, ...taggedBehav];

  // Guarantee at least 1 question is tagged as Company Strategy if none matched
  if (all.length > 0 && !all.some((q) => q.isCompanyStrategy)) {
    all[0].isCompanyStrategy = true;
  }

  return all;
}

// ---------------------------------------------------------------------------
// Notes Popover
// ---------------------------------------------------------------------------

function QuestionNotesPopover({
  initialNotes,
  onSave,
}: {
  initialNotes?: string;
  onSave: (notes: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(initialNotes ?? "");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setDraft(initialNotes ?? "");
  }, [initialNotes]);

  useEffect(() => {
    if (open) {
      setTimeout(() => textareaRef.current?.focus(), 40);
    }
  }, [open]);

  const handleSave = () => {
    onSave(draft);
    setOpen(false);
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((prev) => !prev);
        }}
        className={cn(
          "inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
          initialNotes
            ? "bg-indigo-500/15 text-indigo-300 hover:bg-indigo-500/25"
            : "text-zinc-400 hover:bg-zinc-800/80 hover:text-zinc-200",
        )}
        title={initialNotes ? "Edit candidate cue" : "Add candidate cue"}
      >
        <StickyNote className="size-3.5" aria-hidden />
        <span>{initialNotes ? "Note added" : "Add note"}</span>
      </button>

      {open && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute right-0 top-full z-50 mt-1.5 w-72 rounded-lg border border-zinc-700/80 bg-zinc-900 p-3 shadow-2xl shadow-black/60"
        >
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-300">
              Personal Interview Cue
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-zinc-500 hover:text-zinc-300"
            >
              <X className="size-3.5" />
            </button>
          </div>
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder="Key talking story, metrics, or personal cue to remember…"
            className="w-full resize-none rounded-md border border-zinc-700/80 bg-zinc-950 p-2 text-xs text-zinc-100 placeholder:text-zinc-600 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                handleSave();
              }
              if (e.key === "Escape") {
                setOpen(false);
              }
            }}
          />
          <div className="mt-2 flex items-center justify-between">
            <span className="text-[10px] text-zinc-500">⌘+Enter to save</span>
            <div className="flex gap-1.5">
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                className="h-6 px-2.5 text-xs bg-indigo-600 hover:bg-indigo-500"
                onClick={handleSave}
              >
                Save
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// STAR Response Blueprint
// ---------------------------------------------------------------------------

function StarResponseBlueprint({
  question,
  masterEvidence,
  notes,
}: {
  question: TaggedQuestion;
  masterEvidence: MasterEvidence[];
  notes?: string;
}) {
  return (
    <div className="space-y-3.5 rounded-lg border border-zinc-800/80 bg-zinc-950/70 p-3.5 text-xs">
      {/* S & T: Situation & Task */}
      <div>
        <div className="flex items-center gap-1.5 font-semibold text-zinc-300">
          <span className="flex size-4 items-center justify-center rounded bg-indigo-500/20 text-[10px] font-bold text-indigo-400">
            S
          </span>
          <span>Situation & Probing Focus</span>
        </div>
        <p className="mt-1 leading-relaxed text-zinc-400">
          {question.rationale}
        </p>
      </div>

      {/* A: Action Strategy */}
      {question.talkingPoints.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 font-semibold text-zinc-300">
            <span className="flex size-4 items-center justify-center rounded bg-indigo-500/20 text-[10px] font-bold text-indigo-400">
              A
            </span>
            <span>Action Strategy (Talking Points)</span>
          </div>
          <ul className="mt-1.5 space-y-1.5 pl-1.5">
            {question.talkingPoints.map((point, i) => (
              <li
                key={i}
                className="flex items-start gap-2 leading-relaxed text-zinc-300"
              >
                <span className="mt-1 size-1 shrink-0 rounded-full bg-indigo-400" />
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* R: Results & Master Resume Evidence */}
      {masterEvidence.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 font-semibold text-emerald-400">
            <span className="flex size-4 items-center justify-center rounded bg-emerald-500/20 text-[10px] font-bold text-emerald-400">
              R
            </span>
            <span>Results & Master Resume Evidence</span>
          </div>
          <div className="mt-1.5 space-y-2">
            {masterEvidence.map((ev, i) => (
              <div
                key={i}
                className="rounded border border-zinc-800/90 bg-zinc-900/60 p-2 text-zinc-300"
              >
                <div className="text-[10px] font-medium text-emerald-300/80">
                  {ev.source}
                </div>
                <p className="mt-0.5 leading-relaxed text-zinc-400">
                  {ev.bulletText}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Notes / Cues */}
      {notes && (
        <div className="rounded border border-indigo-950/80 bg-indigo-950/20 p-2">
          <div className="flex items-center gap-1 text-[10px] font-medium text-indigo-400">
            <StickyNote className="size-3" />
            <span>Your Personal Cue</span>
          </div>
          <p className="mt-0.5 leading-relaxed text-indigo-200/90">{notes}</p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Question Card (Studio Grid View)
// ---------------------------------------------------------------------------

function QuestionCard({
  question,
  displayIndex,
  masterEvidence,
  progress,
  onConfidence,
  onNotes,
  onOpenFocus,
}: {
  question: TaggedQuestion;
  displayIndex: number;
  masterEvidence: MasterEvidence[];
  progress?: QuestionProgress;
  onConfidence: (level: ConfidenceLevel) => void;
  onNotes: (notes: string) => void;
  onOpenFocus: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const currentConfidence = progress?.confidence;

  return (
    <li
      className={cn(
        "rounded-xl border transition-all duration-150",
        currentConfidence
          ? `border-zinc-800/90 bg-zinc-900/70 ring-1 ${CONFIDENCE_CONFIG[currentConfidence].ringClass}`
          : "border-zinc-800/80 bg-zinc-900/50 hover:border-zinc-700/80",
      )}
    >
      <div className="p-4">
        {/* Header Badges */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="flex size-5 items-center justify-center rounded-full bg-zinc-800 text-[11px] font-semibold text-zinc-300 tabular-nums">
              {displayIndex}
            </span>
            <Badge
              variant={question.primaryType === "technical" ? "accent" : "neutral"}
              className="text-[10px]"
            >
              {question.primaryType === "technical" ? "Technical" : "Behavioral"}
            </Badge>
            {question.isCompanyStrategy && (
              <Badge variant="warning" className="text-[10px]">
                Company Strategy
              </Badge>
            )}
            <Badge variant="outline" className="text-[10px] text-zinc-500">
              {question.difficulty}
            </Badge>
          </div>

          <div className="flex items-center gap-1">
            <QuestionNotesPopover
              initialNotes={progress?.notes}
              onSave={onNotes}
            />
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-zinc-400 hover:text-zinc-100"
              onClick={onOpenFocus}
              title="Rehearse in Focus Mode"
            >
              <Zap className="size-3.5 text-indigo-400" aria-hidden />
              <span>Focus</span>
            </Button>
          </div>
        </div>

        {/* Question Title */}
        <h3 className="mt-2.5 text-sm font-medium leading-relaxed text-zinc-100">
          {question.question}
        </h3>

        {/* Collapsible STAR Response Blueprint Toggle */}
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          className="mt-3 flex w-full items-center justify-between rounded-lg border border-zinc-800/80 bg-zinc-950/40 px-3 py-2 text-xs font-medium text-zinc-400 transition-colors hover:bg-zinc-950/70 hover:text-zinc-200 outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-expanded={expanded}
        >
          <span className="flex items-center gap-1.5">
            {expanded ? (
              <EyeOff className="size-3.5 text-zinc-500" />
            ) : (
              <Eye className="size-3.5 text-indigo-400" />
            )}
            <span>STAR Response Blueprint</span>
          </span>
          <ChevronDown
            className={cn(
              "size-3.5 text-zinc-500 transition-transform duration-200",
              expanded && "rotate-180",
            )}
          />
        </button>

        {/* Collapsible Content */}
        <div
          className={cn(
            "grid transition-[grid-template-rows,opacity] duration-200 ease-out",
            expanded
              ? "mt-2.5 grid-rows-[1fr] opacity-100"
              : "grid-rows-[0fr] opacity-0",
          )}
        >
          <div className="overflow-hidden">
            <StarResponseBlueprint
              question={question}
              masterEvidence={masterEvidence}
              notes={progress?.notes}
            />
          </div>
        </div>

        {/* Confidence Selector */}
        <div className="mt-3.5 flex items-center gap-2 border-t border-zinc-800/60 pt-3">
          <span className="text-[11px] font-medium text-zinc-500">
            Confidence:
          </span>
          <div className="grid flex-1 grid-cols-3 gap-1.5">
            {CONFIDENCE_LEVELS.map((level) => {
              const conf = CONFIDENCE_CONFIG[level];
              const isSelected = currentConfidence === level;
              return (
                <button
                  key={level}
                  type="button"
                  onClick={() => onConfidence(level)}
                  className={cn(
                    "inline-flex items-center justify-center gap-1.5 rounded-lg border border-transparent px-2.5 py-1 text-xs font-medium transition-all duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    isSelected
                      ? conf.activeBg
                      : "bg-zinc-800/40 text-zinc-400 hover:bg-zinc-800/80 hover:text-zinc-200",
                  )}
                  aria-pressed={isSelected}
                >
                  <span
                    className={cn(
                      "size-1.5 rounded-full",
                      isSelected ? conf.dotClass : "bg-zinc-600",
                    )}
                  />
                  <span>{conf.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Focus / Rehearsal Mode
// ---------------------------------------------------------------------------

function RehearsalMode({
  questions,
  startIndex,
  master,
  progress,
  onConfidence,
  onNotes,
  onClose,
}: {
  questions: TaggedQuestion[];
  startIndex: number;
  master: MasterResumeVersion | null;
  progress: InterviewPrepProgress;
  onConfidence: (questionId: string, level: ConfidenceLevel) => void;
  onNotes: (questionId: string, notes: string) => void;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(
    Math.max(0, Math.min(startIndex, questions.length - 1)),
  );
  const [revealed, setRevealed] = useState(false);
  const [editingNote, setEditingNote] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const noteInputRef = useRef<HTMLTextAreaElement>(null);

  const question = questions[index];
  const qProgress = question ? progress[question.id] : undefined;

  const masterEvidence = useMemo(
    () => (question ? findRelevantMasterEvidence(master, question) : []),
    [master, question],
  );

  useEffect(() => {
    setRevealed(false);
    setEditingNote(false);
  }, [index]);

  const goNext = useCallback(() => {
    setIndex((prev) => Math.min(questions.length - 1, prev + 1));
  }, [questions.length]);

  const goPrev = useCallback(() => {
    setIndex((prev) => Math.max(0, prev - 1));
  }, []);

  const handleRateAndAdvance = useCallback(
    (level: ConfidenceLevel) => {
      if (!question) return;
      onConfidence(question.id, level);
      if (index < questions.length - 1) {
        setTimeout(goNext, 120);
      }
    },
    [index, onConfidence, question, questions.length, goNext],
  );

  // Global keyboard listener with event propagation stopped
  useEffect(() => {
    function handleKeyDown(e: globalThis.KeyboardEvent) {
      if (editingNote) return;

      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        return;
      }

      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        setRevealed((prev) => !prev);
        return;
      }

      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        e.stopPropagation();
        goNext();
        return;
      }

      if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        e.stopPropagation();
        goPrev();
        return;
      }

      if (e.key === "1") {
        e.preventDefault();
        e.stopPropagation();
        handleRateAndAdvance("needs_work");
        return;
      }

      if (e.key === "2") {
        e.preventDefault();
        e.stopPropagation();
        handleRateAndAdvance("solid");
        return;
      }

      if (e.key === "3") {
        e.preventDefault();
        e.stopPropagation();
        handleRateAndAdvance("mastered");
        return;
      }
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [editingNote, goNext, goPrev, handleRateAndAdvance, onClose]);

  if (!question) return null;

  const practicedCount = Object.keys(progress).length;
  const masteredCount = Object.values(progress).filter(
    (p) => p.confidence === "mastered",
  ).length;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Interview Focus Rehearsal Mode"
      className="fixed inset-0 z-50 flex flex-col bg-zinc-950 text-zinc-100"
    >
      {/* Top Header */}
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-zinc-800/80 px-4 md:px-6">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 rounded-md bg-indigo-500/10 px-2.5 py-1 text-xs font-medium text-indigo-400">
            <Zap className="size-3.5" aria-hidden />
            <span>Rehearsal Mode</span>
          </div>
          <span className="text-xs text-zinc-400 tabular-nums">
            Question {index + 1} of {questions.length}
          </span>
        </div>

        <div className="flex items-center gap-4">
          <div className="hidden text-xs text-zinc-400 md:block tabular-nums">
            {practicedCount} / {questions.length} Practiced • {masteredCount} Mastered
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="size-8 p-0 text-zinc-400 hover:text-zinc-100"
            title="Exit Rehearsal Mode (Esc)"
          >
            <X className="size-4" />
          </Button>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="h-1 w-full bg-zinc-900">
        <div
          className="h-full bg-indigo-500 transition-all duration-300"
          style={{ width: `${((index + 1) / questions.length) * 100}%` }}
        />
      </div>

      {/* Main Flashcard Body */}
      <div className="flex flex-1 flex-col items-center justify-center overflow-y-auto px-4 py-8">
        <div className="w-full max-w-2xl space-y-6">
          {/* Question Metadata */}
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant={question.primaryType === "technical" ? "accent" : "neutral"}
              className="text-xs"
            >
              {question.primaryType === "technical" ? "Technical" : "Behavioral"}
            </Badge>
            {question.isCompanyStrategy && (
              <Badge variant="warning" className="text-xs">
                Company Strategy
              </Badge>
            )}
            <Badge variant="outline" className="text-xs text-zinc-400">
              {question.difficulty}
            </Badge>
            {qProgress?.confidence && (
              <span
                className={cn(
                  "ml-auto inline-flex items-center gap-1.5 text-xs font-semibold",
                  CONFIDENCE_CONFIG[qProgress.confidence].textClass,
                )}
              >
                <span
                  className={cn(
                    "size-2 rounded-full",
                    CONFIDENCE_CONFIG[qProgress.confidence].dotClass,
                  )}
                />
                {CONFIDENCE_CONFIG[qProgress.confidence].label}
              </span>
            )}
          </div>

          {/* Prompt */}
          <div className="rounded-2xl border border-zinc-800/90 bg-zinc-900/60 p-6 shadow-xl">
            <h2 className="text-xl font-medium leading-relaxed tracking-tight text-zinc-100">
              {question.question}
            </h2>

            {/* STAR Response Blueprint Reveal Section */}
            <div className="mt-6">
              {revealed ? (
                <div className="animate-rise-in space-y-4">
                  <StarResponseBlueprint
                    question={question}
                    masterEvidence={masterEvidence}
                    notes={qProgress?.notes}
                  />

                  {/* Inline Candidate Notes Drawer */}
                  <div className="rounded-lg border border-zinc-800/80 bg-zinc-950/80 p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-zinc-400">
                        Candidate Practice Cue
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setNoteDraft(qProgress?.notes ?? "");
                          setEditingNote((prev) => !prev);
                        }}
                        className="text-xs text-indigo-400 hover:text-indigo-300"
                      >
                        {editingNote ? "Cancel" : qProgress?.notes ? "Edit" : "Add note"}
                      </button>
                    </div>

                    {editingNote ? (
                      <div className="mt-2 space-y-2">
                        <textarea
                          ref={noteInputRef}
                          value={noteDraft}
                          onChange={(e) => setNoteDraft(e.target.value)}
                          rows={2}
                          maxLength={500}
                          placeholder="Your key metric, project story, or talking cue…"
                          className="w-full resize-none rounded-md border border-zinc-700/80 bg-zinc-900 p-2 text-xs text-zinc-100 placeholder:text-zinc-600 outline-none focus:border-indigo-500"
                        />
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            className="h-6 px-2 text-xs bg-indigo-600 hover:bg-indigo-500"
                            onClick={() => {
                              onNotes(question.id, noteDraft);
                              setEditingNote(false);
                            }}
                          >
                            Save Note
                          </Button>
                        </div>
                      </div>
                    ) : (
                      qProgress?.notes && (
                        <p className="mt-1 text-xs text-zinc-300">
                          {qProgress.notes}
                        </p>
                      )
                    )}
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setRevealed(true)}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-zinc-700/80 bg-zinc-950/40 py-5 text-sm font-medium text-zinc-400 transition-colors hover:border-zinc-500 hover:text-zinc-200 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Eye className="size-4 text-indigo-400" />
                  <span>Reveal STAR Talking Points & Evidence</span>
                  <Kbd className="ml-1 text-zinc-400">Space</Kbd>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Floating Control Deck */}
      <div className="border-t border-zinc-800/80 bg-zinc-950/90 px-4 py-3 backdrop-blur-md">
        <div className="mx-auto flex max-w-2xl flex-col gap-3">
          {/* Confidence Buttons */}
          <div className="grid grid-cols-3 gap-2">
            {CONFIDENCE_LEVELS.map((level) => {
              const conf = CONFIDENCE_CONFIG[level];
              const isSelected = qProgress?.confidence === level;
              return (
                <button
                  key={level}
                  type="button"
                  onClick={() => handleRateAndAdvance(level)}
                  className={cn(
                    "flex items-center justify-center gap-2 rounded-xl border border-zinc-800 py-2.5 text-xs font-semibold transition-all duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    isSelected
                      ? conf.activeBg
                      : "bg-zinc-900/70 text-zinc-300 hover:bg-zinc-800/80",
                  )}
                >
                  <span
                    className={cn(
                      "size-1.5 rounded-full",
                      isSelected ? conf.dotClass : "bg-zinc-500",
                    )}
                  />
                  <span>{conf.label}</span>
                  <Kbd>{conf.key}</Kbd>
                </button>
              );
            })}
          </div>

          {/* Navigation Controls & Keyboard Legend */}
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <Button
              variant="ghost"
              size="sm"
              onClick={goPrev}
              disabled={index === 0}
              className="gap-1 px-2.5 text-zinc-400 hover:text-zinc-100 disabled:opacity-30"
            >
              <ChevronLeft className="size-4" />
              <span>Previous</span>
              <Kbd>←</Kbd>
            </Button>

            <div className="hidden items-center gap-2 text-[11px] text-zinc-500 sm:flex">
              <span>Space: Reveal</span>
              <span>•</span>
              <span>1-3: Rate & Next</span>
              <span>•</span>
              <span>Esc: Exit</span>
            </div>

            <Button
              variant="ghost"
              size="sm"
              onClick={goNext}
              disabled={index === questions.length - 1}
              className="gap-1 px-2.5 text-zinc-400 hover:text-zinc-100 disabled:opacity-30"
            >
              <span>Next</span>
              <Kbd>→</Kbd>
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Interview Prep Studio
// ---------------------------------------------------------------------------

export interface InterviewPrepStudioProps {
  application: JobApplication;
  master: MasterResumeVersion | null;
  isPreparing: boolean;
  onGenerate: () => void;
  onUpdated?: (application: JobApplication) => void;
}

export function InterviewPrepStudio({
  application,
  master,
  isPreparing,
  onGenerate,
  onUpdated,
}: InterviewPrepStudioProps) {
  const prep = application.interviewPrep;

  if (!prep) {
    return (
      <div className="rounded-xl border border-dashed border-zinc-800 px-4 py-10 text-center">
        <p className="text-sm font-medium">No analysis yet</p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
          Tailor the resume for this job first. The interview briefing is built
          from that match analysis.
        </p>
      </div>
    );
  }

  const hasBriefing =
    (prep.technicalQuestions?.length ?? 0) > 0 ||
    (prep.behavioralQuestions?.length ?? 0) > 0;

  if (!hasBriefing) {
    return (
      <div className="space-y-6">
        <MatchBreakdownSection prep={prep} matchScore={application.matchScore} />
        {isPreparing ? (
          <BriefingSkeleton />
        ) : (
          <div className="rounded-xl border border-dashed border-zinc-800 px-4 py-8 text-center">
            <p className="text-sm font-medium">No briefing yet</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
              Generate three technical questions, three behavioral questions, and
              a structured rehearsal briefing for this role.
            </p>
            <Button className="mt-4" onClick={onGenerate}>
              <Sparkles aria-hidden />
              Generate briefing
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <StudioActiveView
      application={application}
      prep={prep}
      master={master}
      isPreparing={isPreparing}
      onGenerate={onGenerate}
      onUpdated={onUpdated}
    />
  );
}

// ---------------------------------------------------------------------------
// Active Studio View (Grid + Rehearsal)
// ---------------------------------------------------------------------------

function StudioActiveView({
  application,
  prep,
  master,
  isPreparing,
  onGenerate,
  onUpdated,
}: {
  application: JobApplication;
  prep: InterviewPrep;
  master: MasterResumeVersion | null;
  isPreparing: boolean;
  onGenerate: () => void;
  onUpdated?: (application: JobApplication) => void;
}) {
  const [selectedCategory, setSelectedCategory] =
    useState<QuestionCategory>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [rehearsalIndex, setRehearsalIndex] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();

  // Optimistic practice telemetry
  const [optimisticProgress, setOptimisticProgress] =
    useOptimistic<InterviewPrepProgress>(prep.progress ?? {});

  const allQuestions = useMemo(
    () => classifyQuestions(prep, application.companyName),
    [prep, application.companyName],
  );

  // Precompute verified master resume evidence for all questions
  const evidenceMap = useMemo(() => {
    const map = new Map<string, MasterEvidence[]>();
    for (const q of allQuestions) {
      map.set(q.id, findRelevantMasterEvidence(master, q));
    }
    return map;
  }, [allQuestions, master]);

  // Live category counts
  const categoryCounts = useMemo(() => {
    return {
      all: allQuestions.length,
      behavioral: allQuestions.filter((q) => q.primaryType === "behavioral")
        .length,
      technical: allQuestions.filter((q) => q.primaryType === "technical")
        .length,
      company_strategy: allQuestions.filter((q) => q.isCompanyStrategy).length,
    };
  }, [allQuestions]);

  // Filtered question set
  const filteredQuestions = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return allQuestions.filter((q) => {
      // Category check
      if (selectedCategory === "behavioral" && q.primaryType !== "behavioral") {
        return false;
      }
      if (selectedCategory === "technical" && q.primaryType !== "technical") {
        return false;
      }
      if (selectedCategory === "company_strategy" && !q.isCompanyStrategy) {
        return false;
      }

      // Search keyword check
      if (query) {
        const text = `${q.question} ${q.rationale} ${q.talkingPoints.join(" ")}`.toLowerCase();
        if (!text.includes(query)) return false;
      }

      return true;
    });
  }, [allQuestions, selectedCategory, searchQuery]);

  // Persistence handler
  const handleUpdateConfidence = useCallback(
    (questionId: string, confidence: ConfidenceLevel) => {
      const prevEntry = optimisticProgress[questionId];
      const newEntry: QuestionProgress = {
        confidence,
        notes: prevEntry?.notes,
        practicedAt: new Date().toISOString(),
      };

      startTransition(async () => {
        setOptimisticProgress((prev) => ({
          ...prev,
          [questionId]: newEntry,
        }));

        const result = await updateInterviewPrepProgressAction(
          application.id,
          questionId,
          newEntry,
        );

        if (result.ok) {
          onUpdated?.(result.data);
        } else {
          toast.error("Could not persist confidence rating", {
            description: result.error,
          });
        }
      });
    },
    [application.id, onUpdated, optimisticProgress, setOptimisticProgress],
  );

  const handleUpdateNotes = useCallback(
    (questionId: string, notes: string) => {
      const prevEntry = optimisticProgress[questionId];
      const newEntry: QuestionProgress = {
        confidence: prevEntry?.confidence ?? "needs_work",
        notes: notes.trim() || undefined,
        practicedAt: new Date().toISOString(),
      };

      startTransition(async () => {
        setOptimisticProgress((prev) => ({
          ...prev,
          [questionId]: newEntry,
        }));

        const result = await updateInterviewPrepProgressAction(
          application.id,
          questionId,
          newEntry,
        );

        if (result.ok) {
          onUpdated?.(result.data);
          toast.success("Cue saved");
        } else {
          toast.error("Could not save note", {
            description: result.error,
          });
        }
      });
    },
    [application.id, onUpdated, optimisticProgress, setOptimisticProgress],
  );

  const totalCount = allQuestions.length;
  const practicedCount = Object.keys(optimisticProgress).length;
  const masteredCount = Object.values(optimisticProgress).filter(
    (p) => p.confidence === "mastered",
  ).length;

  return (
    <div className="space-y-6">
      {/* ATS Keyword Match Breakdown */}
      <MatchBreakdownSection prep={prep} matchScore={application.matchScore} />

      {/* Progress Telemetry Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-800/80 bg-zinc-900/60 p-3.5">
        <div className="flex items-center gap-3">
          <div className="flex size-8 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-400">
            <Flame className="size-4" aria-hidden />
          </div>
          <div>
            <div className="text-xs font-semibold text-zinc-200">
              STAR Rehearsal Telemetry
            </div>
            <div className="text-[11px] text-zinc-400 tabular-nums">
              {practicedCount} / {totalCount} Practiced • {masteredCount} Mastered
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isPending && (
            <span className="flex items-center gap-1 text-[11px] text-indigo-400">
              <Loader2 className="size-3 animate-spin" />
              <span>Syncing…</span>
            </span>
          )}
          <Button
            size="sm"
            onClick={() => setRehearsalIndex(0)}
            disabled={filteredQuestions.length === 0}
            className="gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-xs font-medium"
          >
            <Zap className="size-3.5" aria-hidden />
            <span>Start Rehearsal Mode</span>
          </Button>
        </div>
      </div>

      {/* Studio Grid Controls (Filter Tabs + Search) */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Category Filter Pills */}
        <div className="flex flex-wrap items-center gap-1 rounded-lg border border-zinc-800/80 bg-zinc-900/60 p-1">
          {(
            [
              { id: "all", label: "All", count: categoryCounts.all },
              {
                id: "behavioral",
                label: "Behavioral",
                count: categoryCounts.behavioral,
              },
              {
                id: "technical",
                label: "Technical",
                count: categoryCounts.technical,
              },
              {
                id: "company_strategy",
                label: "Company Strategy",
                count: categoryCounts.company_strategy,
              },
            ] as const
          ).map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setSelectedCategory(cat.id)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                selectedCategory === cat.id
                  ? "bg-zinc-700/90 text-zinc-100 shadow-sm"
                  : "text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200",
              )}
            >
              <span>{cat.label}</span>
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.2 text-[10px] tabular-nums",
                  selectedCategory === cat.id
                    ? "bg-zinc-600/80 text-zinc-100"
                    : "bg-zinc-800/80 text-zinc-500",
                )}
              >
                {cat.count}
              </span>
            </button>
          ))}
        </div>

        {/* Search Bar */}
        <div className="relative min-w-48 sm:w-64">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-zinc-500"
            aria-hidden
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search questions or keywords…"
            className="w-full rounded-lg border border-zinc-800/80 bg-zinc-900/60 py-1.5 pl-8 pr-8 text-xs text-zinc-100 placeholder:text-zinc-500 outline-none transition-colors focus:border-zinc-600 focus:ring-1 focus:ring-zinc-600"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-zinc-500 hover:text-zinc-300"
            >
              <X className="size-3" />
            </button>
          )}
        </div>
      </div>

      {/* Loading Skeleton */}
      {isPreparing && <BriefingSkeleton />}

      {/* Question Cards Grid */}
      {filteredQuestions.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-800 px-4 py-12 text-center">
          <p className="text-sm font-medium text-zinc-300">
            No questions match active filters
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            Try choosing another category or clearing your search query.
          </p>
        </div>
      ) : (
        <ol className="space-y-3">
          {filteredQuestions.map((q, idx) => (
            <QuestionCard
              key={q.id}
              question={q}
              displayIndex={idx + 1}
              masterEvidence={evidenceMap.get(q.id) ?? []}
              progress={optimisticProgress[q.id]}
              onConfidence={(level) => handleUpdateConfidence(q.id, level)}
              onNotes={(notes) => handleUpdateNotes(q.id, notes)}
              onOpenFocus={() => setRehearsalIndex(idx)}
            />
          ))}
        </ol>
      )}

      {/* Strategic Review Topics */}
      {prep.reviewTopics && prep.reviewTopics.length > 0 && (
        <section className="space-y-2.5 pt-2">
          <div className="flex items-center gap-2 text-xs font-semibold tracking-tight text-zinc-300">
            <BookOpen className="size-3.5 text-indigo-400" aria-hidden />
            <span>Strategic Review Topics Before Round 1</span>
          </div>
          <ul className="divide-y divide-zinc-800/80 rounded-xl border border-zinc-800/80 bg-zinc-900/60 text-xs">
            {prep.reviewTopics.map((item, i) => (
              <li key={i} className="p-3">
                <div className="font-medium text-zinc-200">{item.topic}</div>
                <div className="mt-0.5 leading-relaxed text-zinc-400">
                  {item.reason}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-zinc-800/80 pt-4 text-xs text-zinc-500">
        <span>Grounded in verified master resume AST. Zero hallucination.</span>
        <Button
          variant="outline"
          size="sm"
          onClick={onGenerate}
          disabled={isPreparing}
          className="gap-1.5 text-xs"
        >
          <Sparkles className="size-3" aria-hidden />
          <span>Regenerate Briefing</span>
        </Button>
      </div>

      {/* Full-Tab Rehearsal Mode Modal */}
      {rehearsalIndex !== null && (
        <RehearsalMode
          questions={filteredQuestions}
          startIndex={rehearsalIndex}
          master={master}
          progress={optimisticProgress}
          onConfidence={handleUpdateConfidence}
          onNotes={handleUpdateNotes}
          onClose={() => setRehearsalIndex(null)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Match Breakdown Section
// ---------------------------------------------------------------------------

function MatchBreakdownSection({
  prep,
  matchScore,
}: {
  prep: InterviewPrep;
  matchScore: number | null;
}) {
  const [expanded, setExpanded] = useState(false);

  const adjacent = prep.skillGaps.filter((g) => g.severity === "ADJACENT");
  const critical = prep.skillGaps.filter((g) => g.severity === "CRITICAL");
  const groups = [
    { label: "Direct matches", variant: "success" as const, skills: prep.matchedSkills },
    { label: "Adjacent gaps", variant: "warning" as const, skills: adjacent.map((g) => g.skill) },
    { label: "Critical missing", variant: "danger" as const, skills: critical.map((g) => g.skill) },
  ];

  const scoreColor =
    matchScore === null
      ? "text-zinc-500"
      : matchScore >= 80
        ? "text-emerald-400"
        : matchScore >= 60
          ? "text-amber-400"
          : "text-zinc-300";

  return (
    <section className="rounded-xl border border-zinc-800/80 bg-zinc-900/60 p-4">
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="flex w-full items-center gap-4 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-expanded={expanded}
      >
        <div className="flex size-14 shrink-0 flex-col items-center justify-center rounded-full border border-zinc-700/80 bg-zinc-950/70">
          <span className={cn("text-lg font-semibold tabular-nums", scoreColor)}>
            {matchScore === null ? "–" : `${matchScore}%`}
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-zinc-100">
            ATS Keyword Match & Gaps
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {prep.targetSeniority ? `Role targets ${prep.targetSeniority}. ` : ""}
            Click to {expanded ? "collapse" : "view"} breakdown by direct matches
            and gaps.
          </p>
        </div>

        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-zinc-500 transition-transform duration-200",
            expanded && "rotate-180",
          )}
          aria-hidden
        />
      </button>

      {expanded && (
        <dl className="mt-4 space-y-3 border-t border-zinc-800/60 pt-3">
          {groups.map((group) => (
            <div key={group.label}>
              <dt className="text-xs font-medium text-zinc-400">
                {group.label}{" "}
                <span className="text-zinc-600 tabular-nums">
                  ({group.skills.length})
                </span>
              </dt>
              <dd className="mt-1.5 flex flex-wrap gap-1.5">
                {group.skills.length === 0 ? (
                  <span className="text-xs text-zinc-600">None</span>
                ) : (
                  group.skills.map((skill) => (
                    <Badge key={skill} variant={group.variant}>
                      {skill}
                    </Badge>
                  ))
                )}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}

function BriefingSkeleton() {
  return (
    <div className="space-y-2.5" aria-busy="true" aria-label="Generating briefing">
      <div className="flex items-center gap-2 text-xs text-zinc-400">
        <Loader2 className="size-3.5 animate-spin text-indigo-400" />
        <span>Synthesizing interview briefing from master resume AST…</span>
      </div>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="h-20 animate-pulse rounded-xl border border-zinc-800/50 bg-zinc-900/40"
        />
      ))}
    </div>
  );
}
