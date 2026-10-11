"use client";

import {
  ArrowDown,
  ArrowUp,
  Building2,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  MapPin,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { newId } from "@/lib/resume/ids";
import type { ResumeBullet, ResumeExperience } from "@/lib/types/resume";
import { cn } from "@/lib/utils";

import { detectQuantifiedMetrics } from "./metric-detector";

interface ExperienceSectionProps {
  experience: ResumeExperience[];
  onChange: (updated: ResumeExperience[]) => void;
}

export function ExperienceSection({ experience, onChange }: ExperienceSectionProps) {
  const [expandedId, setExpandedId] = useState<string | null>(
    experience[0]?.id ?? null,
  );

  function handleAddRole() {
    const newRole: ResumeExperience = {
      id: newId("exp"),
      company: "",
      title: "",
      location: null,
      startDate: new Date().getFullYear().toString(),
      endDate: null,
      bullets: [
        {
          id: newId("b"),
          text: "",
        },
      ],
    };
    onChange([newRole, ...experience]);
    setExpandedId(newRole.id);
  }

  function handleUpdateRole(index: number, updated: Partial<ResumeExperience>) {
    const list = [...experience];
    list[index] = { ...list[index], ...updated };
    onChange(list);
  }

  function handleRemoveRole(index: number) {
    const list = experience.filter((_, i) => i !== index);
    onChange(list);
  }

  // Bullet management
  function handleAddBullet(roleIndex: number) {
    const role = experience[roleIndex];
    const newBullet: ResumeBullet = {
      id: newId("b"),
      text: "",
    };
    handleUpdateRole(roleIndex, {
      bullets: [...(role.bullets || []), newBullet],
    });
  }

  function handleUpdateBullet(roleIndex: number, bulletIndex: number, text: string) {
    const role = experience[roleIndex];
    const bullets = [...(role.bullets || [])];
    bullets[bulletIndex] = { ...bullets[bulletIndex], text };
    handleUpdateRole(roleIndex, { bullets });
  }

  function handleRemoveBullet(roleIndex: number, bulletIndex: number) {
    const role = experience[roleIndex];
    const bullets = role.bullets.filter((_, i) => i !== bulletIndex);
    handleUpdateRole(roleIndex, { bullets });
  }

  function handleMoveBullet(roleIndex: number, bulletIndex: number, direction: "up" | "down") {
    const role = experience[roleIndex];
    const bullets = [...(role.bullets || [])];
    const targetIndex = direction === "up" ? bulletIndex - 1 : bulletIndex + 1;
    if (targetIndex < 0 || targetIndex >= bullets.length) return;

    const temp = bullets[bulletIndex];
    bullets[bulletIndex] = bullets[targetIndex];
    bullets[targetIndex] = temp;
    handleUpdateRole(roleIndex, { bullets });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between pb-1">
        <span className="text-[11px] text-zinc-400">
          {experience.length} career {experience.length === 1 ? "role" : "roles"} recorded
        </span>
        <Button
          type="button"
          size="sm"
          onClick={handleAddRole}
          className="h-7 text-xs bg-indigo-600 hover:bg-indigo-500 text-white gap-1"
        >
          <Plus className="size-3.5" /> Add Experience
        </Button>
      </div>

      {experience.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-800 p-6 text-center text-xs text-zinc-500">
          No work experience roles added yet. Click &quot;Add Experience&quot; to begin.
        </div>
      ) : (
        <div className="space-y-3">
          {experience.map((role, roleIdx) => {
            const isExpanded = expandedId === role.id;
            const isCurrent = role.endDate === null;

            return (
              <div
                key={role.id || roleIdx}
                className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 overflow-hidden transition-all duration-150 hover:border-zinc-700/80"
              >
                {/* Header card preview */}
                <div
                  className="flex items-center justify-between p-3.5 cursor-pointer bg-zinc-900/60 hover:bg-zinc-900/80"
                  onClick={() => setExpandedId(isExpanded ? null : role.id)}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="flex size-7 items-center justify-center rounded-lg bg-zinc-800 text-zinc-300 shrink-0">
                      <Building2 className="size-3.5" />
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className="text-xs font-semibold text-zinc-100 truncate">
                          {role.title || "Untitled Role"}
                        </h4>
                        <span className="text-zinc-500 text-xs">at</span>
                        <span className="text-xs font-medium text-indigo-300 truncate">
                          {role.company || "Company"}
                        </span>
                      </div>
                      <p className="text-[11px] text-zinc-400 font-mono">
                        {role.startDate || "YYYY"} – {isCurrent ? "Present" : role.endDate || "YYYY"}
                        {role.location && ` · ${role.location}`}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] font-mono text-zinc-500">
                      {role.bullets?.length || 0} bullets
                    </span>
                    {isExpanded ? (
                      <ChevronUp className="size-4 text-zinc-400" />
                    ) : (
                      <ChevronDown className="size-4 text-zinc-400" />
                    )}
                  </div>
                </div>

                {/* Expanded Form Details */}
                {isExpanded && (
                  <div className="p-4 border-t border-zinc-800/80 space-y-4 animate-fade-in">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                          Company / Organization
                        </label>
                        <Input
                          required
                          value={role.company}
                          onChange={(e) =>
                            handleUpdateRole(roleIdx, { company: e.target.value })
                          }
                          placeholder="e.g. Stripe"
                          className="mt-1 text-xs bg-zinc-950/80"
                        />
                      </div>

                      <div>
                        <label className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                          Job Title
                        </label>
                        <Input
                          required
                          value={role.title}
                          onChange={(e) =>
                            handleUpdateRole(roleIdx, { title: e.target.value })
                          }
                          placeholder="e.g. Senior Software Engineer"
                          className="mt-1 text-xs bg-zinc-950/80"
                        />
                      </div>

                      <div>
                        <label className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                          Location
                        </label>
                        <Input
                          value={role.location ?? ""}
                          onChange={(e) =>
                            handleUpdateRole(roleIdx, { location: e.target.value || null })
                          }
                          placeholder="San Francisco, CA (or Remote)"
                          className="mt-1 text-xs bg-zinc-950/80"
                        />
                      </div>

                      <div>
                        <label className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                          Tenure Window
                        </label>
                        <div className="mt-1 flex items-center gap-2">
                          <Input
                            value={role.startDate}
                            onChange={(e) =>
                              handleUpdateRole(roleIdx, { startDate: e.target.value })
                            }
                            placeholder="YYYY-MM (e.g. 2022-03)"
                            className="text-xs bg-zinc-950/80 font-mono text-[11px]"
                          />
                          <span className="text-zinc-500 text-xs">to</span>
                          {isCurrent ? (
                            <span className="rounded bg-indigo-500/10 border border-indigo-500/30 px-3 py-1.5 text-xs text-indigo-300 font-medium">
                              Present
                            </span>
                          ) : (
                            <Input
                              value={role.endDate ?? ""}
                              onChange={(e) =>
                                handleUpdateRole(roleIdx, { endDate: e.target.value || null })
                              }
                              placeholder="YYYY-MM"
                              className="text-xs bg-zinc-950/80 font-mono text-[11px]"
                            />
                          )}
                          <label className="flex items-center gap-1.5 text-xs text-zinc-400 whitespace-nowrap cursor-pointer ml-1">
                            <input
                              type="checkbox"
                              checked={isCurrent}
                              onChange={(e) =>
                                handleUpdateRole(roleIdx, {
                                  endDate: e.target.checked ? null : "2024",
                                })
                              }
                              className="size-3.5 rounded border-zinc-700 bg-zinc-900 text-indigo-600 focus:ring-indigo-500"
                            />
                            <span>Current</span>
                          </label>
                        </div>
                      </div>
                    </div>

                    {/* Bullet Points with Metric Detector */}
                    <div className="space-y-2 pt-2 border-t border-zinc-800/80">
                      <div className="flex items-center justify-between">
                        <label className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                          Accomplishment Bullets & Quantified Impact
                        </label>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => handleAddBullet(roleIdx)}
                          className="h-6 text-[11px] text-indigo-400 hover:text-indigo-300 gap-1 p-1"
                        >
                          <Plus className="size-3" /> Add Bullet
                        </Button>
                      </div>

                      <div className="space-y-2">
                        {role.bullets.map((bullet, bIdx) => {
                          const metric = detectQuantifiedMetrics(bullet.text);

                          return (
                            <div
                              key={bullet.id || bIdx}
                              className="group rounded-lg border border-zinc-800/80 bg-zinc-950/60 p-2.5 space-y-1.5 transition-colors hover:border-zinc-700"
                            >
                              <div className="flex items-start gap-2">
                                <Textarea
                                  rows={2}
                                  value={bullet.text}
                                  onChange={(e) =>
                                    handleUpdateBullet(roleIdx, bIdx, e.target.value)
                                  }
                                  placeholder="Action verb + context + measurable quantified impact (e.g. Scaled database throughput by 45%...)"
                                  className="text-xs bg-transparent resize-y leading-relaxed flex-1 border-0 focus:ring-0 p-0 text-zinc-200"
                                />

                                <div className="flex items-center gap-1 shrink-0 pt-0.5">
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    disabled={bIdx === 0}
                                    onClick={() => handleMoveBullet(roleIdx, bIdx, "up")}
                                    className="size-6 p-0 text-zinc-500 hover:text-zinc-200 disabled:opacity-20"
                                    title="Move up"
                                  >
                                    <ArrowUp className="size-3" />
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    disabled={bIdx === role.bullets.length - 1}
                                    onClick={() => handleMoveBullet(roleIdx, bIdx, "down")}
                                    className="size-6 p-0 text-zinc-500 hover:text-zinc-200 disabled:opacity-20"
                                    title="Move down"
                                  >
                                    <ArrowDown className="size-3" />
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => handleRemoveBullet(roleIdx, bIdx)}
                                    className="size-6 p-0 text-zinc-500 hover:text-red-400"
                                    title="Delete bullet"
                                  >
                                    <Trash2 className="size-3" />
                                  </Button>
                                </div>
                              </div>

                              {/* Real-time Metric Badge Telemetry */}
                              <div className="flex items-center justify-between pt-1 border-t border-zinc-800/40 text-[10px]">
                                {metric.hasMetrics ? (
                                  <div className="flex items-center gap-1.5 text-emerald-400">
                                    <CheckCircle2 className="size-3 shrink-0" />
                                    <span>
                                      Quantified impact detected:{" "}
                                      <strong className="font-mono text-emerald-300">
                                        {metric.matches.slice(0, 3).join(", ")}
                                      </strong>
                                    </span>
                                  </div>
                                ) : (
                                  <span className="text-zinc-500 italic">
                                    Tip: Add numbers, % gains, or scale metrics to boost ATS score
                                  </span>
                                )}
                                <span className="font-mono text-zinc-600">
                                  {bullet.text.length} chars
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="flex justify-end pt-2 border-t border-zinc-800/60">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => handleRemoveRole(roleIdx)}
                        className="text-xs text-red-400 hover:text-red-300 hover:bg-red-950/30 gap-1 h-7"
                      >
                        <Trash2 className="size-3" /> Delete Role
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
