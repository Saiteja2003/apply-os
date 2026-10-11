"use client";

import {
  Code2,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { useState, type KeyboardEvent } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { newId } from "@/lib/resume/ids";
import type { ResumeSkillGroup } from "@/lib/types/resume";

const DEFAULT_CATEGORIES = [
  "Languages",
  "Frameworks & Libraries",
  "Cloud & DevOps",
  "Databases & Storage",
  "Developer Tools",
];

interface SkillsSectionProps {
  skills: ResumeSkillGroup[];
  onChange: (updated: ResumeSkillGroup[]) => void;
}

export function SkillsSection({ skills, onChange }: SkillsSectionProps) {
  const [newCategoryName, setNewCategoryName] = useState("");
  const [inputs, setInputs] = useState<Record<string, string>>({});

  function handleAddSkillGroup(category: string) {
    const trimmed = category.trim();
    if (!trimmed || skills.some((s) => s.category.toLowerCase() === trimmed.toLowerCase())) {
      return;
    }
    const newGroup: ResumeSkillGroup = {
      id: newId("sk"),
      category: trimmed,
      skills: [],
    };
    onChange([...skills, newGroup]);
    setNewCategoryName("");
  }

  function handleRemoveSkillGroup(index: number) {
    onChange(skills.filter((_, i) => i !== index));
  }

  function handleAddSkillTag(groupIndex: number, tag: string) {
    const trimmed = tag.trim();
    const group = skills[groupIndex];
    if (!trimmed || group.skills.includes(trimmed)) return;

    const list = [...skills];
    list[groupIndex] = {
      ...group,
      skills: [...group.skills, trimmed],
    };
    onChange(list);
    setInputs((prev) => ({ ...prev, [group.id]: "" }));
  }

  function handleRemoveSkillTag(groupIndex: number, skillToRemove: string) {
    const group = skills[groupIndex];
    const list = [...skills];
    list[groupIndex] = {
      ...group,
      skills: group.skills.filter((s) => s !== skillToRemove),
    };
    onChange(list);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>, groupIndex: number, groupId: string) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      handleAddSkillTag(groupIndex, inputs[groupId] || "");
    }
  }

  return (
    <div className="space-y-4">
      {/* Category presets helper */}
      <div className="flex flex-wrap items-center gap-1.5 pb-1">
        <span className="text-[11px] text-zinc-400">Quick-Add Category:</span>
        {DEFAULT_CATEGORIES.map((cat) => {
          const exists = skills.some((s) => s.category.toLowerCase() === cat.toLowerCase());
          if (exists) return null;
          return (
            <button
              key={cat}
              type="button"
              onClick={() => handleAddSkillGroup(cat)}
              className="rounded border border-zinc-800 bg-zinc-900/60 px-2 py-0.5 text-[11px] text-zinc-300 hover:border-zinc-700 hover:text-white transition-colors"
            >
              + {cat}
            </button>
          );
        })}
      </div>

      {skills.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-800 p-6 text-center text-xs text-zinc-500">
          No skill taxonomies configured. Click any preset above or add a custom category below.
        </div>
      ) : (
        <div className="space-y-3">
          {skills.map((group, groupIdx) => (
            <div
              key={group.id || groupIdx}
              className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-3.5 space-y-2 transition-colors hover:border-zinc-700/80"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Code2 className="size-3.5 text-indigo-400" />
                  <span className="text-xs font-semibold text-zinc-200">
                    {group.category}
                  </span>
                  <span className="text-[10px] font-mono text-zinc-500">
                    ({group.skills.length})
                  </span>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => handleRemoveSkillGroup(groupIdx)}
                  className="size-6 p-0 text-zinc-500 hover:text-red-400"
                >
                  <Trash2 className="size-3" />
                </Button>
              </div>

              {/* Tag Container */}
              <div className="flex flex-wrap items-center gap-1.5 min-h-[38px] rounded-lg border border-zinc-800 bg-zinc-950/70 p-2">
                {group.skills.map((skill) => (
                  <Badge
                    key={skill}
                    variant="neutral"
                    className="gap-1 border border-zinc-700/80 bg-zinc-800/90 text-xs text-zinc-200 font-mono py-0.5 px-2"
                  >
                    <span>{skill}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveSkillTag(groupIdx, skill)}
                      className="rounded p-0.5 hover:bg-zinc-700 hover:text-red-300"
                    >
                      <X className="size-2.5" />
                    </button>
                  </Badge>
                ))}
                <input
                  type="text"
                  value={inputs[group.id] || ""}
                  onChange={(e) =>
                    setInputs((prev) => ({ ...prev, [group.id]: e.target.value }))
                  }
                  onKeyDown={(e) => handleKeyDown(e, groupIdx, group.id)}
                  placeholder="Type skill & press Enter..."
                  className="flex-1 bg-transparent px-1 text-xs text-zinc-200 placeholder:text-zinc-600 outline-none min-w-[120px]"
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Custom Category Row */}
      <div className="flex items-center gap-2 pt-2 border-t border-zinc-800/60">
        <Input
          value={newCategoryName}
          onChange={(e) => setNewCategoryName(e.target.value)}
          placeholder="New category name (e.g. AI & Machine Learning)..."
          className="text-xs bg-zinc-900/90 h-8 max-w-sm"
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => handleAddSkillGroup(newCategoryName)}
          disabled={!newCategoryName.trim()}
          className="h-8 text-xs gap-1 border-zinc-800 hover:bg-zinc-800 text-zinc-300"
        >
          <Plus className="size-3" /> Add Category
        </Button>
      </div>
    </div>
  );
}
