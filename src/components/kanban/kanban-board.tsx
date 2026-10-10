"use client";

import {
  closestCorners,
  DndContext,
  DragOverlay,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  Bookmark,
  CircleSlash,
  MessagesSquare,
  Plus,
  Send,
  Trophy,
  type LucideIcon,
} from "lucide-react";
import { useState, type ReactNode } from "react";

import { STATUS_LABELS } from "@/components/status-badge";
import {
  APPLICATION_STATUSES,
  type ApplicationStatus,
  type JobApplication,
} from "@/lib/types/resume";
import { cn } from "@/lib/utils";

import { ApplicationCard, ApplicationCardBody } from "./application-card";

interface KanbanBoardProps {
  applications: JobApplication[];
  /** Applications with a tailoring run in flight. */
  tailoringIds: ReadonlySet<string>;
  onSelect: (applicationId: string) => void;
  onMove: (applicationId: string, status: ApplicationStatus) => void;
  onAdd: () => void;
}

const COLUMN_META: Record<
  ApplicationStatus,
  { icon: LucideIcon; dot: string; empty: string }
> = {
  SAVED: {
    icon: Bookmark,
    dot: "bg-zinc-400",
    empty: "Jobs you are considering land here.",
  },
  APPLIED: {
    icon: Send,
    dot: "bg-indigo-400",
    empty: "Drag a job here once you have applied.",
  },
  INTERVIEWING: {
    icon: MessagesSquare,
    dot: "bg-amber-400",
    empty: "Interviews in progress show up here.",
  },
  REJECTED: {
    icon: CircleSlash,
    dot: "bg-red-400",
    empty: "Closed applications are kept for reference.",
  },
  OFFER: {
    icon: Trophy,
    dot: "bg-emerald-400",
    empty: "Offers will be celebrated here.",
  },
};

function EmptyColumn({ status }: { status: ApplicationStatus }) {
  const { icon: Icon, empty } = COLUMN_META[status];
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-zinc-800 px-3 py-7 text-center">
      <span className="flex size-8 items-center justify-center rounded-full bg-zinc-800/60 text-zinc-500">
        <Icon className="size-4" aria-hidden />
      </span>
      <p className="text-xs leading-relaxed text-zinc-500">{empty}</p>
    </div>
  );
}

function isStatus(value: unknown): value is ApplicationStatus {
  return (APPLICATION_STATUSES as readonly unknown[]).includes(value);
}

function Column({
  status,
  count,
  children,
}: {
  status: ApplicationStatus;
  count: number;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });

  return (
    <section
      ref={setNodeRef}
      aria-label={STATUS_LABELS[status]}
      className={cn(
        "flex w-64 shrink-0 flex-col rounded-xl border border-zinc-800/60 bg-zinc-900/40 transition-[background-color,border-color,box-shadow] duration-200 ease-out xl:w-auto xl:flex-1",
        isOver &&
          "border-indigo-500/50 bg-indigo-500/[0.07] shadow-lg shadow-indigo-500/10",
      )}
    >
      <header className="flex items-center justify-between px-3 py-2.5">
        <h2 className="flex items-center gap-2 text-[13px] font-medium text-zinc-200">
          <span
            className={cn("size-2 rounded-full", COLUMN_META[status].dot)}
            aria-hidden
          />
          {STATUS_LABELS[status]}
        </h2>
        <span className="min-w-5 rounded-full bg-zinc-800/80 px-1.5 py-0.5 text-center text-[11px] font-medium text-zinc-400 tabular-nums">
          {count}
        </span>
      </header>
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2">
        {children}
      </div>
    </section>
  );
}

export function KanbanBoard({
  applications,
  tailoringIds,
  onSelect,
  onMove,
  onAdd,
}: KanbanBoardProps) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  // When a card lands in another column it is already rendered there, so
  // the overlay must not glide back to where the card used to be.
  const [landed, setLanded] = useState(false);
  // A small drag threshold keeps a plain click opening the detail drawer.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const dragging =
    applications.find((application) => application.id === draggingId) ?? null;

  function handleDragStart(event: DragStartEvent) {
    setLanded(false);
    setDraggingId(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    const id = String(event.active.id);
    const target = event.over?.id;
    const moved =
      isStatus(target) &&
      applications.find((application) => application.id === id)?.status !== target;

    setLanded(moved);
    setDraggingId(null);
    // Optimistic: the card is in its new column in this same render.
    if (moved) onMove(id, target);
  }

  return (
    <DndContext
      id="pipeline"
      sensors={sensors}
      collisionDetection={closestCorners}
      autoScroll={{ layoutShiftCompensation: false }}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setDraggingId(null)}
    >
      <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto px-4 pb-4 md:px-6">
        {APPLICATION_STATUSES.map((status) => {
          const column = applications.filter(
            (application) => application.status === status,
          );
          return (
            <Column key={status} status={status} count={column.length}>
              {column.map((application) => (
                <ApplicationCard
                  key={application.id}
                  application={application}
                  isTailoring={tailoringIds.has(application.id)}
                  onSelect={onSelect}
                />
              ))}
              {column.length === 0 &&
                (status === "SAVED" && applications.length === 0 ? (
                  <button
                    type="button"
                    onClick={onAdd}
                    className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-zinc-700 px-3 py-7 text-center text-[13px] text-zinc-400 transition-colors duration-150 outline-none hover:border-indigo-500/60 hover:bg-indigo-500/5 hover:text-zinc-100 focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="flex size-8 items-center justify-center rounded-full bg-indigo-500/15 text-indigo-300">
                      <Plus className="size-4" aria-hidden />
                    </span>
                    Add your first job
                  </button>
                ) : (
                  <EmptyColumn status={status} />
                ))}
            </Column>
          );
        })}
      </div>

      <DragOverlay
        dropAnimation={
          landed
            ? null
            : { duration: 200, easing: "cubic-bezier(0.2, 0, 0, 1)" }
        }
      >
        {dragging && (
          <div className="scale-[1.03] rotate-[1.5deg] cursor-grabbing rounded-lg border border-indigo-500/50 bg-zinc-900 p-3 shadow-2xl shadow-indigo-500/20">
            <ApplicationCardBody application={dragging} isTailoring={false} />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
