"use client";

import {
  Code,
  ExternalLink,
  Plus,
  Trash2,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { newId } from "@/lib/resume/ids";
import type { ResumeBullet, ResumeProject } from "@/lib/types/resume";

import { detectQuantifiedMetrics } from "./metric-detector";

interface ProjectsSectionProps {
  projects: ResumeProject[];
  onChange: (updated: ResumeProject[]) => void;
}

export function ProjectsSection({ projects, onChange }: ProjectsSectionProps) {
  function handleAddProject() {
    const newProj: ResumeProject = {
      id: newId("prj"),
      name: "",
      url: null,
      technologies: [],
      bullets: [{ id: newId("b"), text: "" }],
    };
    onChange([...projects, newProj]);
  }

  function handleUpdateProject(index: number, updated: Partial<ResumeProject>) {
    const list = [...projects];
    list[index] = { ...list[index], ...updated };
    onChange(list);
  }

  function handleRemoveProject(index: number) {
    const list = projects.filter((_, i) => i !== index);
    onChange(list);
  }

  function handleAddBullet(projIndex: number) {
    const proj = projects[projIndex];
    const newBullet: ResumeBullet = { id: newId("b"), text: "" };
    handleUpdateProject(projIndex, {
      bullets: [...(proj.bullets || []), newBullet],
    });
  }

  function handleUpdateBullet(projIndex: number, bulletIndex: number, text: string) {
    const proj = projects[projIndex];
    const bullets = [...(proj.bullets || [])];
    bullets[bulletIndex] = { ...bullets[bulletIndex], text };
    handleUpdateProject(projIndex, { bullets });
  }

  function handleRemoveBullet(projIndex: number, bulletIndex: number) {
    const proj = projects[projIndex];
    const bullets = proj.bullets.filter((_, i) => i !== bulletIndex);
    handleUpdateProject(projIndex, { bullets });
  }

  function handleTechChange(projIndex: number, raw: string) {
    const technologies = raw
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    handleUpdateProject(projIndex, { technologies });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between pb-1">
        <span className="text-[11px] text-zinc-400">
          {projects.length} key {projects.length === 1 ? "project" : "projects"} recorded
        </span>
        <Button
          type="button"
          size="sm"
          onClick={handleAddProject}
          className="h-7 text-xs bg-indigo-600 hover:bg-indigo-500 text-white gap-1"
        >
          <Plus className="size-3.5" /> Add Project
        </Button>
      </div>

      {projects.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-800 p-6 text-center text-xs text-zinc-500">
          No featured projects added yet. Click &quot;Add Project&quot; to highlight open source or flagship technical builds.
        </div>
      ) : (
        <div className="space-y-3">
          {projects.map((proj, idx) => (
            <div
              key={proj.id || idx}
              className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-4 space-y-3 transition-colors hover:border-zinc-700/80"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="flex size-6 items-center justify-center rounded-md bg-zinc-800 text-zinc-300">
                    <Code className="size-3.5" />
                  </span>
                  <span className="text-xs font-semibold text-zinc-200">
                    {proj.name || "Untitled Project"}
                  </span>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => handleRemoveProject(idx)}
                  className="size-7 p-0 text-zinc-500 hover:text-red-400"
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>

              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                    Project Name
                  </label>
                  <Input
                    required
                    value={proj.name}
                    onChange={(e) =>
                      handleUpdateProject(idx, { name: e.target.value })
                    }
                    placeholder="e.g. Distributed Vector KV Store"
                    className="mt-1 text-xs bg-zinc-950/80"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                    Live Demo / GitHub Repo URL
                  </label>
                  <Input
                    value={proj.url ?? ""}
                    onChange={(e) =>
                      handleUpdateProject(idx, { url: e.target.value || null })
                    }
                    placeholder="https://github.com/..."
                    className="mt-1 text-xs bg-zinc-950/80 font-mono text-[11px]"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                    Technologies Used (comma separated)
                  </label>
                  <Input
                    value={proj.technologies.join(", ")}
                    onChange={(e) => handleTechChange(idx, e.target.value)}
                    placeholder="e.g. Rust, Raft, RocksDB, gRPC, Docker"
                    className="mt-1 text-xs bg-zinc-950/80"
                  />
                </div>
              </div>

              {/* Project Bullets */}
              <div className="space-y-2 pt-2 border-t border-zinc-800/60">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-medium text-zinc-400">
                    Technical Architecture & Highlights
                  </label>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => handleAddBullet(idx)}
                    className="h-5 text-[10px] text-indigo-400 p-0"
                  >
                    + Add Bullet
                  </Button>
                </div>

                {proj.bullets.map((b, bIdx) => {
                  const metric = detectQuantifiedMetrics(b.text);
                  return (
                    <div key={b.id || bIdx} className="space-y-1">
                      <div className="flex items-start gap-1.5">
                        <Textarea
                          rows={2}
                          value={b.text}
                          onChange={(e) => handleUpdateBullet(idx, bIdx, e.target.value)}
                          placeholder="Engineered high-throughput partition engine achieving <2ms p99 latency..."
                          className="text-xs bg-zinc-950/80 resize-y flex-1"
                        />
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => handleRemoveBullet(idx, bIdx)}
                          className="size-7 p-0 text-zinc-500 hover:text-red-400"
                        >
                          <Trash2 className="size-3" />
                        </Button>
                      </div>
                      {metric.hasMetrics && (
                        <div className="text-[10px] text-emerald-400 font-mono pl-1">
                          ✓ Metric detected: {metric.matches.join(", ")}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
