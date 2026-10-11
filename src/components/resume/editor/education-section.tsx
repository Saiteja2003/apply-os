"use client";

import {
  GraduationCap,
  Plus,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { newId } from "@/lib/resume/ids";
import type { ResumeBullet, ResumeEducation } from "@/lib/types/resume";

interface EducationSectionProps {
  education: ResumeEducation[];
  onChange: (updated: ResumeEducation[]) => void;
}

export function EducationSection({ education, onChange }: EducationSectionProps) {
  function handleAddEducation() {
    const newEdu: ResumeEducation = {
      id: newId("edu"),
      institution: "",
      degree: "",
      field: null,
      startDate: null,
      endDate: new Date().getFullYear().toString(),
      bullets: [],
    };
    onChange([...education, newEdu]);
  }

  function handleUpdateEducation(index: number, updated: Partial<ResumeEducation>) {
    const list = [...education];
    list[index] = { ...list[index], ...updated };
    onChange(list);
  }

  function handleRemoveEducation(index: number) {
    const list = education.filter((_, i) => i !== index);
    onChange(list);
  }

  function handleAddBullet(eduIndex: number) {
    const edu = education[eduIndex];
    const newBullet: ResumeBullet = { id: newId("b"), text: "" };
    handleUpdateEducation(eduIndex, {
      bullets: [...(edu.bullets || []), newBullet],
    });
  }

  function handleUpdateBullet(eduIndex: number, bulletIndex: number, text: string) {
    const edu = education[eduIndex];
    const bullets = [...(edu.bullets || [])];
    bullets[bulletIndex] = { ...bullets[bulletIndex], text };
    handleUpdateEducation(eduIndex, { bullets });
  }

  function handleRemoveBullet(eduIndex: number, bulletIndex: number) {
    const edu = education[eduIndex];
    const bullets = edu.bullets.filter((_, i) => i !== bulletIndex);
    handleUpdateEducation(eduIndex, { bullets });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between pb-1">
        <span className="text-[11px] text-zinc-400">
          {education.length} academic {education.length === 1 ? "degree" : "degrees"} recorded
        </span>
        <Button
          type="button"
          size="sm"
          onClick={handleAddEducation}
          className="h-7 text-xs bg-indigo-600 hover:bg-indigo-500 text-white gap-1"
        >
          <Plus className="size-3.5" /> Add Degree
        </Button>
      </div>

      {education.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-800 p-6 text-center text-xs text-zinc-500">
          No education entries added yet. Click &quot;Add Degree&quot; to begin.
        </div>
      ) : (
        <div className="space-y-3">
          {education.map((item, idx) => (
            <div
              key={item.id || idx}
              className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-4 space-y-3 transition-colors hover:border-zinc-700/80"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="flex size-6 items-center justify-center rounded-md bg-zinc-800 text-zinc-300">
                    <GraduationCap className="size-3.5" />
                  </span>
                  <span className="text-xs font-semibold text-zinc-200">
                    {item.institution || "Institution"}
                  </span>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => handleRemoveEducation(idx)}
                  className="size-7 p-0 text-zinc-500 hover:text-red-400"
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>

              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                    University / Institution
                  </label>
                  <Input
                    required
                    value={item.institution}
                    onChange={(e) =>
                      handleUpdateEducation(idx, { institution: e.target.value })
                    }
                    placeholder="e.g. University of California, Berkeley"
                    className="mt-1 text-xs bg-zinc-950/80"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                    Degree
                  </label>
                  <Input
                    required
                    value={item.degree}
                    onChange={(e) =>
                      handleUpdateEducation(idx, { degree: e.target.value })
                    }
                    placeholder="e.g. Bachelor of Science"
                    className="mt-1 text-xs bg-zinc-950/80"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                    Field of Study / Major
                  </label>
                  <Input
                    value={item.field ?? ""}
                    onChange={(e) =>
                      handleUpdateEducation(idx, { field: e.target.value || null })
                    }
                    placeholder="e.g. Computer Science"
                    className="mt-1 text-xs bg-zinc-950/80"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                    Graduation Year / Date
                  </label>
                  <div className="mt-1 flex items-center gap-2">
                    <Input
                      value={item.startDate ?? ""}
                      onChange={(e) =>
                        handleUpdateEducation(idx, { startDate: e.target.value || null })
                      }
                      placeholder="Start YYYY"
                      className="text-xs bg-zinc-950/80 font-mono text-[11px]"
                    />
                    <span className="text-zinc-500 text-xs">to</span>
                    <Input
                      value={item.endDate ?? ""}
                      onChange={(e) =>
                        handleUpdateEducation(idx, { endDate: e.target.value || null })
                      }
                      placeholder="End YYYY"
                      className="text-xs bg-zinc-950/80 font-mono text-[11px]"
                    />
                  </div>
                </div>
              </div>

              {/* Honors / Relevant Coursework */}
              <div className="pt-2 border-t border-zinc-800/60">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[11px] font-medium text-zinc-400">
                    Honors, GPA, or Relevant Coursework
                  </label>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => handleAddBullet(idx)}
                    className="h-5 text-[10px] text-indigo-400 p-0"
                  >
                    + Add Detail
                  </Button>
                </div>
                {item.bullets.map((b, bIdx) => (
                  <div key={b.id || bIdx} className="flex items-center gap-1.5 mt-1">
                    <Input
                      value={b.text}
                      onChange={(e) => handleUpdateBullet(idx, bIdx, e.target.value)}
                      placeholder="e.g. Magna Cum Laude, GPA: 3.9/4.0, Algorithms, Operating Systems"
                      className="text-xs bg-zinc-950/80 h-7"
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
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
