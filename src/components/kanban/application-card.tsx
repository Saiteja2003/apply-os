"use client";

import { useDraggable } from "@dnd-kit/core";
import { Loader2, MapPin } from "lucide-react";

import { MatchScore } from "@/components/match-score";
import type { JobApplication } from "@/lib/types/resume";
import { cn, formatDate } from "@/lib/utils";

interface ApplicationCardBodyProps {
  application: JobApplication;
  isTailoring: boolean;
}

export function ApplicationCardBody({
  application,
  isTailoring,
}: ApplicationCardBodyProps) {
  return (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium">{application.companyName}</p>
        {isTailoring ? (
          <span className="inline-flex items-center gap-1 text-xs whitespace-nowrap text-primary">
            <Loader2 className="size-3 animate-spin" aria-hidden />
            Tailoring
          </span>
        ) : (
          <MatchScore score={application.matchScore} />
        )}
      </div>
      <p className="mt-0.5 text-sm text-muted-foreground">
        {application.roleTitle}
      </p>
      <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        {application.location && (
          <span className="inline-flex items-center gap-1">
            <MapPin className="size-3" aria-hidden />
            {application.location}
          </span>
        )}
        <span>
          {application.appliedAt
            ? `Applied ${formatDate(application.appliedAt)}`
            : `Saved ${formatDate(application.createdAt)}`}
        </span>
      </div>
    </>
  );
}

interface ApplicationCardProps extends ApplicationCardBodyProps {
  onSelect: (applicationId: string) => void;
}

export function ApplicationCard({
  application,
  isTailoring,
  onSelect,
}: ApplicationCardProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: application.id,
  });

  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={() => onSelect(application.id)}
      className={cn(
        "animate-rise-in cursor-grab touch-none rounded-lg border border-zinc-800/80 bg-zinc-900/80 p-3 text-left shadow-sm shadow-black/20 transition-[border-color,box-shadow,opacity,translate] duration-150 ease-out outline-none hover:-translate-y-px hover:border-zinc-700 hover:shadow-md hover:shadow-indigo-500/10 focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing",
        isDragging && "opacity-30",
      )}
      {...listeners}
      {...attributes}
    >
      <ApplicationCardBody application={application} isTailoring={isTailoring} />
    </button>
  );
}
