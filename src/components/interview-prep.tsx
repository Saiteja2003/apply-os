"use client";

import { BookOpen, ChevronDown, Loader2, Sparkles } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type {
  InterviewPrep as InterviewPrepData,
  InterviewQuestion,
  JobApplication,
} from "@/lib/types/resume";
import { cn } from "@/lib/utils";

interface InterviewPrepProps {
  application: JobApplication;
  /** A briefing is being generated for this application. */
  isPreparing: boolean;
  onGenerate: () => void;
}

function scoreTone(score: number): string {
  if (score >= 80) return "text-emerald-400";
  if (score >= 60) return "text-amber-400";
  return "text-zinc-300";
}

function MatchBreakdown({
  score,
  prep,
}: {
  score: number | null;
  prep: InterviewPrepData;
}) {
  const adjacent = prep.skillGaps.filter((gap) => gap.severity === "ADJACENT");
  const critical = prep.skillGaps.filter((gap) => gap.severity === "CRITICAL");
  const groups = [
    { label: "Direct matches", variant: "success", skills: prep.matchedSkills },
    { label: "Adjacent gaps", variant: "warning", skills: adjacent.map((gap) => gap.skill) },
    { label: "Critical missing", variant: "danger", skills: critical.map((gap) => gap.skill) },
  ] as const;

  return (
    <section className="rounded-xl border border-zinc-800/80 bg-zinc-900/60 p-4">
      <div className="flex items-center gap-4">
        <div className="flex size-16 shrink-0 flex-col items-center justify-center rounded-full border border-zinc-700/80 bg-zinc-950/60">
          <span
            className={cn(
              "text-lg leading-none font-semibold tabular-nums",
              score === null ? "text-zinc-500" : scoreTone(score),
            )}
          >
            {score === null ? "–" : `${score}%`}
          </span>
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-medium">ATS keyword match</h3>
          <p className="text-sm text-muted-foreground">
            {prep.targetSeniority
              ? `Role targets ${prep.targetSeniority}. `
              : ""}
            Full credit for a direct match, half for an adjacent one.
          </p>
        </div>
      </div>

      <dl className="mt-4 space-y-3">
        {groups.map((group) => (
          <div key={group.label}>
            <dt className="text-xs font-medium text-zinc-400">
              {group.label}{" "}
              <span className="text-zinc-600 tabular-nums">
                {group.skills.length}
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
    </section>
  );
}

function Flashcard({
  question,
  index,
}: {
  question: InterviewQuestion;
  index: number;
}) {
  const [revealed, setRevealed] = useState(false);
  const answerId = `answer-${question.id}`;

  return (
    <li className="overflow-hidden rounded-lg border border-zinc-800/80 bg-zinc-900/60 transition-colors duration-150 hover:border-zinc-700">
      <button
        type="button"
        onClick={() => setRevealed((current) => !current)}
        aria-expanded={revealed}
        aria-controls={answerId}
        className="flex w-full items-start gap-3 px-3.5 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
      >
        <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-indigo-500/15 text-[11px] font-medium text-indigo-300 tabular-nums">
          {index + 1}
        </span>
        <span className="flex-1 text-sm leading-relaxed">{question.question}</span>
        <span className="mt-0.5 flex shrink-0 items-center gap-1 text-xs text-zinc-500">
          {revealed ? "Hide" : "Reveal"}
          <ChevronDown
            className={cn(
              "size-3.5 transition-transform duration-200 ease-out",
              revealed && "rotate-180",
            )}
            aria-hidden
          />
        </span>
      </button>

      {/* Grid rows animate the height without measuring the content. */}
      <div
        id={answerId}
        className={cn(
          "grid transition-[grid-template-rows,opacity] duration-200 ease-out",
          revealed ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
        )}
      >
        <div className="overflow-hidden" inert={!revealed}>
          <div className="space-y-3 border-t border-zinc-800/80 bg-zinc-950/40 px-3.5 py-3">
            <div>
              <p className="text-xs font-medium text-zinc-400">
                What they are probing
              </p>
              <p className="mt-1 text-sm leading-relaxed text-zinc-300">
                {question.rationale}
              </p>
            </div>
            {question.talkingPoints.length > 0 && (
              <div>
                <p className="text-xs font-medium text-zinc-400">
                  Points to make, from your resume
                </p>
                <ul className="mt-1 list-disc space-y-1 pl-4 text-sm leading-relaxed text-zinc-300 marker:text-indigo-400">
                  {question.talkingPoints.map((point, pointIndex) => (
                    <li key={pointIndex}>{point}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}

function QuestionDeck({
  title,
  questions,
}: {
  title: string;
  questions: InterviewQuestion[];
}) {
  if (questions.length === 0) return null;
  return (
    <section>
      <h3 className="text-sm font-medium">{title}</h3>
      <ol className="mt-2 space-y-2">
        {questions.map((question, index) => (
          <Flashcard key={question.id} question={question} index={index} />
        ))}
      </ol>
    </section>
  );
}

function BriefingSkeleton() {
  return (
    <div className="space-y-2" aria-busy="true" aria-label="Generating briefing">
      {[0, 1, 2, 3].map((row) => (
        <div
          key={row}
          className="h-12 animate-pulse rounded-lg bg-zinc-800/40"
        />
      ))}
    </div>
  );
}

export function InterviewPrep({
  application,
  isPreparing,
  onGenerate,
}: InterviewPrepProps) {
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
    prep.technicalQuestions.length > 0 ||
    prep.behavioralQuestions.length > 0 ||
    prep.reviewTopics.length > 0;

  return (
    <div className="space-y-6">
      <MatchBreakdown score={application.matchScore} prep={prep} />

      {isPreparing ? (
        <section>
          <p className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin text-indigo-400" aria-hidden />
            Writing your interview briefing…
          </p>
          <BriefingSkeleton />
        </section>
      ) : hasBriefing ? (
        <>
          {prep.reviewTopics.length > 0 && (
            <section>
              <h3 className="flex items-center gap-2 text-sm font-medium">
                <BookOpen className="size-4 text-indigo-400" aria-hidden />
                Review before round 1
              </h3>
              <ul className="mt-2 divide-y divide-zinc-800/80 rounded-lg border border-zinc-800/80 bg-zinc-900/60">
                {prep.reviewTopics.map((entry) => (
                  <li key={entry.topic} className="px-3.5 py-2.5">
                    <p className="text-sm font-medium">{entry.topic}</p>
                    <p className="text-sm text-muted-foreground">{entry.reason}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <QuestionDeck
            title="Technical and architecture questions"
            questions={prep.technicalQuestions}
          />
          <QuestionDeck
            title="Behavioral questions"
            questions={prep.behavioralQuestions}
          />

          <div className="flex items-center justify-between gap-3 border-t border-zinc-800/80 pt-4">
            <p className="text-xs text-muted-foreground">
              Questions are generated from the job description. They are
              practice material, not a prediction of the real interview.
            </p>
            <Button variant="outline" size="sm" onClick={onGenerate}>
              <Sparkles aria-hidden />
              Regenerate
            </Button>
          </div>
        </>
      ) : (
        <div className="rounded-xl border border-dashed border-zinc-800 px-4 py-8 text-center">
          <p className="text-sm font-medium">No briefing yet</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            Generate three technical questions, three behavioral questions and
            a short review list for this role.
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
