"use client";

import { ChevronDown, History } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { MasterResumeVersionSummary } from "@/lib/types/resume";
import { cn, formatDate } from "@/lib/utils";

interface VersionMenuProps {
  /** The version tailoring uses: the latest one. `null` before the first save. */
  active: MasterResumeVersionSummary | null;
  /** All saved versions, newest first. `undefined` while loading. */
  versions: MasterResumeVersionSummary[] | undefined;
  /** The earlier version being inspected, if any. */
  inspectingId: string | null;
  /** Called with a version id to inspect it, or `null` to return to the active one. */
  onInspect: (versionId: string | null) => void;
  loadFailed: boolean;
}

/** The `v3 (Active)` badge: a read-only window onto every saved version. */
export function VersionMenu({
  active,
  versions,
  inspectingId,
  onInspect,
  loadFailed,
}: VersionMenuProps) {
  if (!active) {
    return (
      <span className="inline-flex h-7 items-center rounded-full border border-zinc-800 px-2.5 text-xs text-zinc-500">
        Not saved yet
      </span>
    );
  }

  const inspecting = versions?.find((version) => version.id === inspectingId);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Version history. Showing version ${
          inspecting?.version ?? active.version
        }.`}
        className={cn(
          "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors duration-150 ease-out outline-none focus-visible:ring-2 focus-visible:ring-ring",
          inspecting
            ? "border-amber-500/30 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20"
            : "border-indigo-500/30 bg-indigo-500/10 text-indigo-300 hover:bg-indigo-500/20",
        )}
      >
        <History className="size-3.5" aria-hidden />
        {inspecting
          ? `v${inspecting.version} (read-only)`
          : `v${active.version} (Active)`}
        <ChevronDown className="size-3.5 opacity-70" aria-hidden />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="max-h-80 w-64 overflow-y-auto">
        <DropdownMenuLabel>Version history</DropdownMenuLabel>
        {versions ? (
          <DropdownMenuRadioGroup
            value={inspectingId ?? active.id}
            onValueChange={(id) => onInspect(id === active.id ? null : id)}
          >
            {versions.map((version) => (
              <DropdownMenuRadioItem key={version.id} value={version.id}>
                <span className="flex items-baseline justify-between gap-3">
                  <span>
                    v{version.version}
                    {version.id === active.id && (
                      <span className="ml-1.5 text-xs text-indigo-300">Active</span>
                    )}
                  </span>
                  <span className="text-xs text-zinc-500">
                    {formatDate(version.createdAt)}
                  </span>
                </span>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        ) : (
          <DropdownMenuItem disabled>
            {loadFailed ? "History could not be loaded" : "Loading history…"}
          </DropdownMenuItem>
        )}
        <p className="px-2 pt-2 pb-1.5 text-[11px] leading-snug text-zinc-500">
          Saved versions are never changed. Pick one to inspect it read-only.
        </p>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
