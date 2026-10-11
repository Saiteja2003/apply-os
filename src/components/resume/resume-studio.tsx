"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  Briefcase,
  Check,
  ChevronDown,
  Clock,
  Download,
  Eye,
  FileCode,
  FileText,
  FolderGit2,
  GraduationCap,
  History,
  Loader2,
  Maximize2,
  Redo,
  RotateCcw,
  Save,
  Sparkles,
  User,
  Wrench,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import {
  getMasterResumeHistoryAction,
  getResumeVersionAction,
  restoreMasterResumeVersionAction,
  saveMasterResumeVersionAction,
} from "@/app/actions/resume";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useWorkspace } from "@/components/workspace-provider";
import { queryKeys } from "@/lib/api";
import { validateResume } from "@/lib/resume/schema";
import type {
  MasterResume,
  MasterResumeVersion,
  MasterResumeVersionSummary,
} from "@/lib/types/resume";
import { cn } from "@/lib/utils";

import { BasicsSection } from "./editor/basics-section";
import { EducationSection } from "./editor/education-section";
import { ExperienceSection } from "./editor/experience-section";
import { ProjectsSection } from "./editor/projects-section";
import { SkillsSection } from "./editor/skills-section";

interface ResumeStudioProps {
  initialResume: MasterResumeVersion | null;
}

type EditorTab = "basics" | "experience" | "education" | "skills" | "projects";

const TABS: { id: EditorTab; label: string; icon: typeof User }[] = [
  { id: "basics", label: "Basics & Links", icon: User },
  { id: "experience", label: "Experience", icon: Briefcase },
  { id: "education", label: "Education", icon: GraduationCap },
  { id: "skills", label: "Skills", icon: Wrench },
  { id: "projects", label: "Projects", icon: FolderGit2 },
];

export function ResumeStudio({ initialResume }: ResumeStudioProps) {
  const { setMaster, userId } = useWorkspace();
  const queryClient = useQueryClient();
  const [isPending, startTransition] = useTransition();

  // Active version and working AST draft
  const [activeVersion, setActiveVersion] = useState<MasterResumeVersion | null>(
    initialResume,
  );
  const [draftAST, setDraftAST] = useState<MasterResume>(() => {
    return initialResume?.resume ?? {
      schemaVersion: 1,
      basics: {
        name: "Alex Morgan",
        headline: "Senior Software Engineer",
        email: "alex@example.com",
        phone: null,
        location: "San Francisco, CA",
        links: [],
      },
      summary: "Staff Engineer specializing in distributed systems and cloud services.",
      experience: [],
      education: [],
      projects: [],
      skills: [],
      customSections: [],
    };
  });

  const [activeTab, setActiveTab] = useState<EditorTab>("basics");
  const [isDirty, setIsDirty] = useState(false);

  // PDF Preview states
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewPages, setPreviewPages] = useState<number>(1);
  const [fileName, setFileName] = useState<string>("Master_Resume.pdf");
  const [isRenderingPdf, setIsRenderingPdf] = useState(false);
  const [zoomLevel, setZoomLevel] = useState<"fit" | "75" | "100">("fit");

  // Version History Query
  const { data: historyData, refetch: refetchHistory } = useQuery({
    queryKey: queryKeys.resumeVersions(userId),
    queryFn: async () => {
      const res = await getMasterResumeHistoryAction();
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
  });

  const versionHistory: MasterResumeVersionSummary[] = historyData ?? [];

  // Update dirty state
  function updateDraft(updater: (prev: MasterResume) => MasterResume) {
    setDraftAST((prev) => {
      const next = updater(prev);
      setIsDirty(true);
      return next;
    });
  }

  // Debounced PDF Compiler
  useEffect(() => {
    let cancelled = false;
    let urlToRevoke: string | null = null;
    setIsRenderingPdf(true);

    const timer = setTimeout(() => {
      import("@/lib/pdf/render")
        .then(async ({ renderTailoredResume, resumeFileName }) => {
          const { blob, pages } = await renderTailoredResume(draftAST, null);
          if (cancelled) return;

          const url = URL.createObjectURL(blob);
          urlToRevoke = url;
          setPreviewUrl(url);
          setPreviewPages(pages);
          setFileName(resumeFileName(draftAST.basics.name, null));
          setIsRenderingPdf(false);
        })
        .catch((err) => {
          console.error("PDF preview compilation error:", err);
          if (!cancelled) setIsRenderingPdf(false);
        });
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (urlToRevoke) URL.revokeObjectURL(urlToRevoke);
    };
  }, [draftAST]);

  // Save New Version (Append-Only)
  function handleSaveNewVersion() {
    const validation = validateResume(draftAST);
    if (!validation.valid) {
      toast.error(`Invalid resume AST: ${validation.issues[0]?.message}`);
      return;
    }

    startTransition(async () => {
      const res = await saveMasterResumeVersionAction(draftAST);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }

      toast.success(`Saved as Version ${res.data.version} (Append-Only)`);
      setActiveVersion(res.data);
      setIsDirty(false);
      setMaster(res.data);
      void refetchHistory();
    });
  }

  // Restore or inspect historical version
  function handleSelectHistoryVersion(summary: MasterResumeVersionSummary) {
    startTransition(async () => {
      const res = await getResumeVersionAction(summary.id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }

      setDraftAST(res.data.resume);
      setActiveVersion(res.data);
      setIsDirty(false);
      toast.info(`Loaded snapshot from Version ${res.data.version}`);
    });
  }

  function handleRestoreHistoricalTip(versionNumber: number) {
    startTransition(async () => {
      const res = await restoreMasterResumeVersionAction(versionNumber);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }

      toast.success(`Restored Version ${versionNumber} as new tip Version ${res.data.version}`);
      setActiveVersion(res.data);
      setDraftAST(res.data.resume);
      setIsDirty(false);
      setMaster(res.data);
      void refetchHistory();
    });
  }

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] flex-col overflow-hidden bg-zinc-950">
      {/* Sticky Studio Topbar */}
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-zinc-800 bg-zinc-950/90 px-4 md:px-6">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <FileText className="size-4 text-indigo-400" />
            <h1 className="text-sm font-semibold tracking-tight text-zinc-100">
              Master Resume Studio
            </h1>
          </div>

          {/* Active Version Badge & History Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex items-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-900/60 px-2 py-1 text-xs text-zinc-300 hover:border-zinc-700 hover:text-white transition-colors"
              >
                <History className="size-3 text-indigo-400" />
                <span className="font-mono font-medium">
                  v{activeVersion?.version ?? 1}
                </span>
                <span className="text-[10px] text-zinc-500">
                  ({versionHistory.length || 1} saved)
                </span>
                <ChevronDown className="size-3 text-zinc-500" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="w-72 border-zinc-800 bg-zinc-950 text-zinc-200"
            >
              <DropdownMenuLabel className="text-xs text-zinc-400">
                Append-Only Version Ledger
              </DropdownMenuLabel>
              <DropdownMenuSeparator className="bg-zinc-800" />
              {versionHistory.map((item) => {
                const isCurrent = item.version === activeVersion?.version;
                return (
                  <DropdownMenuItem
                    key={item.id}
                    onClick={() => handleSelectHistoryVersion(item)}
                    className="flex items-center justify-between text-xs py-2 cursor-pointer focus:bg-zinc-900 focus:text-white"
                  >
                    <div className="min-w-0 pr-2">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono font-semibold text-zinc-200">
                          Version {item.version}
                        </span>
                        {isCurrent && (
                          <Badge variant="success" className="text-[9px] py-0 px-1">
                            Current
                          </Badge>
                        )}
                      </div>
                      <p className="text-[10px] text-zinc-500 truncate mt-0.5">
                        {item.summary || new Date(item.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    {item.version !== activeVersion?.version && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRestoreHistoricalTip(item.version);
                        }}
                        className="text-[10px] text-indigo-400 hover:underline shrink-0"
                        title="Fork this snapshot as newest version"
                      >
                        Restore
                      </button>
                    )}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Dirty state indicator */}
          {isDirty && (
            <Badge
              variant="warning"
              className="text-[10px] bg-amber-950/60 text-amber-300 border-amber-800/60"
            >
              Unsaved Changes
            </Badge>
          )}
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {previewUrl && (
            <Button
              asChild
              size="sm"
              variant="outline"
              className="h-7 text-xs border-zinc-800 hover:bg-zinc-900 text-zinc-300 gap-1.5"
            >
              <a href={previewUrl} download={fileName}>
                <Download className="size-3.5" />
                <span>PDF</span>
              </a>
            </Button>
          )}

          <Button
            size="sm"
            onClick={handleSaveNewVersion}
            disabled={isPending || !isDirty}
            className="h-7 text-xs bg-indigo-600 hover:bg-indigo-500 text-white gap-1.5"
          >
            {isPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Save className="size-3.5" />
            )}
            <span>Save New Version</span>
          </Button>
        </div>
      </div>

      {/* Split-Pane 2-Column Desktop Grid */}
      <div className="grid flex-1 grid-cols-1 overflow-hidden lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-zinc-800">
        {/* Left Pane: AST Form Studio */}
        <div className="flex flex-col h-full overflow-hidden bg-zinc-950/60">
          {/* Section Navigation Tabs */}
          <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-zinc-800/80 bg-zinc-950/90 px-4 py-2">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors duration-150 outline-none",
                    active
                      ? "bg-zinc-800 text-zinc-100 shadow-sm"
                      : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200",
                  )}
                >
                  <Icon className={cn("size-3.5", active ? "text-indigo-400" : "text-zinc-500")} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* Scrollable Form Content */}
          <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
            {activeTab === "basics" && (
              <BasicsSection
                basics={draftAST.basics}
                summary={draftAST.summary}
                onChangeBasics={(basics) => updateDraft((d) => ({ ...d, basics }))}
                onChangeSummary={(summary) => updateDraft((d) => ({ ...d, summary }))}
              />
            )}

            {activeTab === "experience" && (
              <ExperienceSection
                experience={draftAST.experience}
                onChange={(experience) => updateDraft((d) => ({ ...d, experience }))}
              />
            )}

            {activeTab === "education" && (
              <EducationSection
                education={draftAST.education}
                onChange={(education) => updateDraft((d) => ({ ...d, education }))}
              />
            )}

            {activeTab === "skills" && (
              <SkillsSection
                skills={draftAST.skills}
                onChange={(skills) => updateDraft((d) => ({ ...d, skills }))}
              />
            )}

            {activeTab === "projects" && (
              <ProjectsSection
                projects={draftAST.projects}
                onChange={(projects) => updateDraft((d) => ({ ...d, projects }))}
              />
            )}
          </div>
        </div>

        {/* Right Pane: Live ATS Vector PDF Preview */}
        <div className="flex flex-col h-full overflow-hidden bg-zinc-900/30">
          {/* Preview Toolbar */}
          <div className="flex h-10 shrink-0 items-center justify-between border-b border-zinc-800 bg-zinc-950/80 px-4">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-zinc-300">
                ATS Vector Preview
              </span>
              {isRenderingPdf ? (
                <span className="flex items-center gap-1 text-[10px] text-zinc-400 font-mono">
                  <Loader2 className="size-2.5 animate-spin text-indigo-400" />
                  Rendering...
                </span>
              ) : (
                <span className="text-[10px] font-mono text-zinc-500">
                  {previewPages} {previewPages === 1 ? "page" : "pages"}
                </span>
              )}
            </div>

            {/* Zoom Controls */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setZoomLevel("fit")}
                className={cn(
                  "rounded px-2 py-0.5 text-[10px] font-mono transition-colors",
                  zoomLevel === "fit"
                    ? "bg-zinc-800 text-zinc-100 font-semibold"
                    : "text-zinc-500 hover:text-zinc-300",
                )}
              >
                Fit
              </button>
              <button
                type="button"
                onClick={() => setZoomLevel("75")}
                className={cn(
                  "rounded px-2 py-0.5 text-[10px] font-mono transition-colors",
                  zoomLevel === "75"
                    ? "bg-zinc-800 text-zinc-100 font-semibold"
                    : "text-zinc-500 hover:text-zinc-300",
                )}
              >
                75%
              </button>
              <button
                type="button"
                onClick={() => setZoomLevel("100")}
                className={cn(
                  "rounded px-2 py-0.5 text-[10px] font-mono transition-colors",
                  zoomLevel === "100"
                    ? "bg-zinc-800 text-zinc-100 font-semibold"
                    : "text-zinc-500 hover:text-zinc-300",
                )}
              >
                100%
              </button>
            </div>
          </div>

          {/* Live Vector PDF Document Viewport */}
          <div className="flex-1 overflow-auto p-4 md:p-6 flex items-start justify-center">
            {previewPages > 1 && (
              <div className="absolute top-14 left-1/2 -translate-x-1/2 z-10 rounded-md border border-amber-500/30 bg-amber-950/80 px-3 py-1 text-xs text-amber-300 shadow-lg">
                ⚠️ Spills to {previewPages} pages. Trim bullets to maintain single-page density.
              </div>
            )}

            {previewUrl ? (
              <div
                className={cn(
                  "relative rounded-lg border border-zinc-800 bg-white shadow-2xl transition-all duration-200",
                  zoomLevel === "fit" && "w-full max-w-xl aspect-[8.5/11]",
                  zoomLevel === "75" && "w-[75%] aspect-[8.5/11]",
                  zoomLevel === "100" && "w-[95%] aspect-[8.5/11]",
                )}
              >
                <iframe
                  src={`${previewUrl}#toolbar=0&navpanes=0&scrollbar=0`}
                  title="Master Resume ATS Preview"
                  className="w-full h-full rounded-lg border-0"
                />
              </div>
            ) : (
              <div className="flex h-96 w-full items-center justify-center rounded-lg border border-dashed border-zinc-800 text-xs text-zinc-500">
                Compiling ATS PDF preview...
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
