"use client";

import {
  AlertCircle,
  AlertTriangle,
  Building2,
  CheckCircle2,
  DollarSign,
  ExternalLink,
  Filter,
  Globe2,
  MapPin,
  Play,
  Plus,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  StopCircle,
} from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { createApplicationAction } from "@/app/actions/applications";
import { createAutoApplyAuditLogAction } from "@/app/actions/discovery";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  evaluateApplicationQuestions,
  isJobEligibleForApplication,
} from "@/lib/matching/preference-filter";
import type {
  AutoApplyAuditLog,
  CandidatePreferences,
  DiscoveredJob,
  JobEligibilityResult,
} from "@/lib/types/discovery";
import type { JobApplication } from "@/lib/types/resume";
import { cn } from "@/lib/utils";

const SAMPLE_DISCOVERED_JOBS: DiscoveredJob[] = [
  {
    id: "job-1",
    title: "Staff Distributed Systems Engineer",
    company: "Vercel",
    location: "Remote (Global)",
    remote: true,
    salaryMin: 195000,
    salaryMax: 240000,
    description:
      "Join our Edge Infrastructure team building next-generation serverless runtimes. Looking for deep experience with distributed consensus, high-throughput streaming, and TypeScript/Rust.",
    url: "https://vercel.com/careers/distributed-systems",
    postedAt: "2h ago",
  },
  {
    id: "job-2",
    title: "Senior Full Stack Engineer",
    company: "Stripe",
    location: "San Francisco, CA / Remote",
    remote: true,
    salaryMin: 185000,
    salaryMax: 225000,
    description:
      "Design mission-critical checkout workflows and payment APIs. Requires strong system architecture skills, Ruby, Go, or TypeScript proficiency.",
    url: "https://stripe.com/jobs/full-stack-engineer",
    postedAt: "4h ago",
  },
  {
    id: "job-3",
    title: "Frontend Software Engineer",
    company: "Linear",
    location: "Remote (US / EU)",
    remote: true,
    salaryMin: 150000,
    salaryMax: 185000,
    description:
      "Craft world-class high-density desktop and web software. We care deeply about 60fps animations, keyboard navigation, and local-first data sync architectures.",
    url: "https://linear.app/careers/frontend-engineer",
    postedAt: "1d ago",
  },
  {
    id: "job-4",
    title: "Cloud Infrastructure Architect",
    company: "Datadog",
    location: "New York, NY",
    remote: false,
    salaryMin: 170000,
    salaryMax: 210000,
    description:
      "Scale our telemetry ingest engines processing tens of petabytes of metrics. Heavy focus on Kubernetes, Terraform, and cloud networking.",
    url: "https://datadoghq.com/careers/cloud-infra",
    postedAt: "1d ago",
  },
  {
    id: "job-5",
    title: "Senior Backend Engineer (US Citizen Only)",
    company: "DefenseCore Dynamics",
    location: "Arlington, VA",
    remote: false,
    salaryMin: 160000,
    salaryMax: 190000,
    description:
      "Mission-critical defense software. Candidate must be a U.S. Citizen. Active secret clearance required. We cannot offer visa sponsorship.",
    url: "https://defensecore.example.com/careers",
    postedAt: "2d ago",
  },
  {
    id: "job-6",
    title: "Software Engineer",
    company: "Revature",
    location: "Reston, VA",
    remote: false,
    salaryMin: 55000,
    salaryMax: 65000,
    description:
      "Entry-level enterprise software development consultancy. Mandatory multi-year placement contract with client relocation required.",
    url: "https://revature.com/careers",
    postedAt: "3d ago",
  },
  {
    id: "job-7",
    title: "Platform Engineer",
    company: "Meta",
    location: "Menlo Park, CA",
    remote: false,
    salaryMin: 175000,
    salaryMax: 215000,
    description:
      "Scale foundational compute clusters across our global data centers. Experience with Linux kernel, C++, and custom hardware topologies.",
    url: "https://meta.com/careers/platform-engineer",
    postedAt: "3d ago",
  },
];

interface DiscoveredJobsFeedProps {
  preferences: CandidatePreferences | null;
  onAuditLogged?: (log: AutoApplyAuditLog) => void;
  onApplicationStaged?: (application: JobApplication) => void;
}

export function DiscoveredJobsFeed({
  preferences,
  onAuditLogged,
  onApplicationStaged,
}: DiscoveredJobsFeedProps) {
  const [filter, setFilter] = useState<"ALL" | "PASSED" | "BLOCKED">("ALL");
  const [isPending, startTransition] = useTransition();

  // Test Halt Modal state
  const [testModalOpen, setTestModalOpen] = useState(false);
  const [testJob, setTestJob] = useState<DiscoveredJob | null>(null);
  const [haltResult, setHaltResult] = useState<{
    canProceed: boolean;
    haltReason?: string;
    unknownQuestions: string[];
  } | null>(null);

  // Evaluate each job
  const evaluatedJobs = SAMPLE_DISCOVERED_JOBS.map((job) => {
    let evaluation: JobEligibilityResult = { eligible: true };
    if (preferences) {
      evaluation = isJobEligibleForApplication(preferences, job);
    }
    return { job, evaluation };
  });

  const passedCount = evaluatedJobs.filter((j) => j.evaluation.eligible).length;
  const blockedCount = evaluatedJobs.filter((j) => !j.evaluation.eligible).length;

  const filteredJobs = evaluatedJobs.filter(({ evaluation }) => {
    if (filter === "PASSED") return evaluation.eligible;
    if (filter === "BLOCKED") return !evaluation.eligible;
    return true;
  });

  function handleStageApplication(job: DiscoveredJob) {
    startTransition(async () => {
      const res = await createApplicationAction({
        companyName: job.company,
        roleTitle: job.title,
        location: job.location,
        jobUrl: job.url,
        jobDescription: job.description,
      });

      if (!res.ok) {
        toast.error(res.error);
        return;
      }

      toast.success(
        `Application for "${job.title}" at ${job.company} staged into workspace.`,
      );
      onApplicationStaged?.(res.data);
    });
  }

  function handleOpenHaltSimulator(job: DiscoveredJob) {
    setTestJob(job);
    setHaltResult(null);
    setTestModalOpen(true);
  }

  function handleExecuteHaltSimulation() {
    if (!testJob) return;

    // Simulated custom questionnaire that contains non-standard questions
    const simulatedQuestions = [
      "Full Legal Name",
      "Work Authorization Status",
      "What is your notice period?",
      "Describe an instance where you debugged a distributed race condition under zero-downtime SLA pressure.",
    ];

    const audit = evaluateApplicationQuestions(
      simulatedQuestions,
      preferences?.standardAnswers ?? {},
    );
    setHaltResult(audit);

    // Record an audit log entry demonstrating strict compliance circuit breaker
    startTransition(async () => {
      const logRes = await createAutoApplyAuditLogAction({
        companyName: testJob.company,
        jobUrl: testJob.url,
        matchScore: 92,
        dispatchedVia: "BROWSER_ASSIST",
        status: audit.canProceed ? "SUCCESS" : "HALTED_UNKNOWN_QUESTION",
        haltReason: audit.haltReason ?? null,
      });

      if (logRes.ok) {
        onAuditLogged?.(logRes.data);
      }
    });
  }

  return (
    <div className="space-y-4">
      {/* Feed Controls & Tab Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-zinc-800 pb-3">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-indigo-400" />
          <h3 className="text-sm font-semibold tracking-tight text-zinc-100">
            Preference-Gated Job Radar
          </h3>
          <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs font-mono text-zinc-400">
            {evaluatedJobs.length} Discovered
          </span>
        </div>

        <div className="flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900/60 p-1 text-xs">
          <button
            type="button"
            onClick={() => setFilter("ALL")}
            className={cn(
              "rounded-md px-2.5 py-1 font-medium transition-colors",
              filter === "ALL"
                ? "bg-zinc-800 text-zinc-100"
                : "text-zinc-400 hover:text-zinc-200",
            )}
          >
            All ({evaluatedJobs.length})
          </button>
          <button
            type="button"
            onClick={() => setFilter("PASSED")}
            className={cn(
              "flex items-center gap-1 rounded-md px-2.5 py-1 font-medium transition-colors",
              filter === "PASSED"
                ? "bg-emerald-950/80 text-emerald-300 border border-emerald-800/60"
                : "text-zinc-400 hover:text-emerald-400",
            )}
          >
            <ShieldCheck className="size-3 text-emerald-400" />
            Passed Gates ({passedCount})
          </button>
          <button
            type="button"
            onClick={() => setFilter("BLOCKED")}
            className={cn(
              "flex items-center gap-1 rounded-md px-2.5 py-1 font-medium transition-colors",
              filter === "BLOCKED"
                ? "bg-red-950/80 text-red-300 border border-red-800/60"
                : "text-zinc-400 hover:text-red-400",
            )}
          >
            <ShieldAlert className="size-3 text-red-400" />
            Blocked ({blockedCount})
          </button>
        </div>
      </div>

      {/* Discovered Jobs List */}
      <div className="grid grid-cols-1 gap-3">
        {filteredJobs.map(({ job, evaluation }) => {
          const isEligible = evaluation.eligible;

          return (
            <div
              key={job.id}
              className={cn(
                "rounded-xl border p-4 transition-all duration-150",
                isEligible
                  ? "border-zinc-800/80 bg-zinc-900/30 hover:border-zinc-700/90 hover:bg-zinc-900/60"
                  : "border-red-900/30 bg-red-950/10 hover:border-red-800/40",
              )}
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1.5 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-sm text-zinc-100">
                      {job.title}
                    </span>
                    <span className="text-xs text-zinc-400">at</span>
                    <span className="font-medium text-xs text-indigo-300">
                      {job.company}
                    </span>

                    {/* Eligibility Badge */}
                    {isEligible ? (
                      <Badge
                        variant="success"
                        className="gap-1 text-[10px] bg-emerald-950/70 text-emerald-300 border border-emerald-800/70"
                      >
                        <CheckCircle2 className="size-3 text-emerald-400" />
                        Passes Hard Gates
                      </Badge>
                    ) : (
                      <Badge
                        variant="danger"
                        className="gap-1 text-[10px] bg-red-950/70 text-red-300 border border-red-800/70"
                      >
                        <ShieldAlert className="size-3 text-red-400" />
                        Blocked
                      </Badge>
                    )}
                  </div>

                  {/* Metadata Chips */}
                  <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-400 pt-0.5">
                    <span className="flex items-center gap-1">
                      <MapPin className="size-3 text-zinc-500" />
                      {job.location}
                    </span>
                    {job.remote && (
                      <span className="flex items-center gap-1 text-indigo-400">
                        <Globe2 className="size-3" />
                        Remote
                      </span>
                    )}
                    {job.salaryMin && (
                      <span className="flex items-center gap-0.5 font-mono text-zinc-300">
                        <DollarSign className="size-3 text-zinc-500" />
                        ${(job.salaryMin / 1000).toFixed(0)}k - $
                        {((job.salaryMax ?? job.salaryMin) / 1000).toFixed(0)}k
                      </span>
                    )}
                    {job.postedAt && (
                      <span className="text-zinc-500 text-[11px]">
                        Posted {job.postedAt}
                      </span>
                    )}
                  </div>

                  {/* Description preview */}
                  <p className="text-xs text-zinc-400 leading-relaxed pt-1 line-clamp-2">
                    {job.description}
                  </p>

                  {/* Rejection Reason Pill */}
                  {!isEligible && evaluation.reason && (
                    <div className="mt-2 flex items-center gap-2 rounded-lg border border-red-800/30 bg-red-950/30 px-2.5 py-1.5 text-xs text-red-300">
                      <AlertTriangle className="size-3.5 text-red-400 shrink-0" />
                      <span>{evaluation.reason}</span>
                    </div>
                  )}
                </div>

                {/* Card Actions */}
                <div className="flex sm:flex-col items-center sm:items-end gap-2 shrink-0 pt-2 sm:pt-0">
                  {isEligible ? (
                    <>
                      <Button
                        size="sm"
                        onClick={() => handleStageApplication(job)}
                        disabled={isPending}
                        className="h-8 text-xs bg-indigo-600 hover:bg-indigo-500 text-white gap-1"
                      >
                        <Plus className="size-3.5" /> Stage Application
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleOpenHaltSimulator(job)}
                        className="h-8 text-xs gap-1 border-zinc-800 hover:bg-zinc-800/60 text-zinc-300"
                        title="Test unknown question circuit breaker"
                      >
                        <StopCircle className="size-3.5 text-amber-400" />
                        Simulate Halt Guard
                      </Button>
                    </>
                  ) : (
                    <span className="text-[11px] text-zinc-500 italic py-1">
                      Filtered out
                    </span>
                  )}

                  <a
                    href={job.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors"
                  >
                    <span>View Posting</span>
                    <ExternalLink className="size-3" />
                  </a>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Simulator Modal for Unknown Question Halt */}
      {testJob && (
        <Dialog open={testModalOpen} onOpenChange={setTestModalOpen}>
          <DialogContent className="max-w-md border-zinc-800 bg-zinc-950 p-6 text-zinc-100 shadow-2xl">
            <div className="border-b border-zinc-800/80 pb-3">
              <DialogTitle className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
                <StopCircle className="size-4 text-amber-400" />
                Compliance Halt Simulator
              </DialogTitle>
              <DialogDescription className="text-xs text-zinc-400 mt-1">
                Verifies ApplyOS&apos;s non-negotiable safety halt when encountering
                questions outside your calibrated profile.
              </DialogDescription>
            </div>

            <div className="mt-4 space-y-3">
              <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3 text-xs">
                <div className="font-medium text-zinc-300">
                  Target: {testJob.title} at {testJob.company}
                </div>
                <div className="mt-2 text-[11px] text-zinc-400">
                  Simulated application questions detected on ATS form:
                  <ul className="list-disc list-inside mt-1 space-y-0.5 text-zinc-500 font-mono text-[10px]">
                    <li>1. Full Legal Name (Known profile field)</li>
                    <li>2. Work Authorization (Known profile field)</li>
                    <li className="text-amber-400 font-medium">
                      3. Notice Period (Unconfigured custom question)
                    </li>
                    <li className="text-amber-400 font-medium">
                      4. Describe debugging a distributed race condition... (Unknown)
                    </li>
                  </ul>
                </div>
              </div>

              {haltResult && (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 space-y-2 animate-fade-in text-xs">
                  <div className="flex items-center gap-2 text-amber-300 font-semibold">
                    <AlertTriangle className="size-4" />
                    <span>Autonomous Submission Aborted</span>
                  </div>
                  <p className="text-zinc-300 text-[11px] leading-relaxed">
                    {haltResult.haltReason}
                  </p>
                  <div className="pt-1 border-t border-amber-500/20 text-[10px] text-amber-400 font-mono">
                    Audit log written with status:{" "}
                    <strong>HALTED_UNKNOWN_QUESTION</strong>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-5 flex items-center justify-end gap-2 border-t border-zinc-800/80 pt-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setTestModalOpen(false)}
              >
                Close
              </Button>
              <Button
                size="sm"
                onClick={handleExecuteHaltSimulation}
                disabled={isPending || haltResult !== null}
                className="bg-amber-600 hover:bg-amber-500 text-white text-xs"
              >
                {haltResult ? "Halt Verified" : "Run Safety Check"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
