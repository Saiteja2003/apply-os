"use client";

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type Modifier,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { useId, type ReactNode } from "react";

import { cn } from "@/lib/utils";

const verticalOnly: Modifier = ({ transform }) => ({ ...transform, x: 0 });

interface SortableListProps<T extends { id: string }> {
  items: T[];
  /** What one item is called, for the handle's label: "bullet", "role". */
  itemLabel: string;
  /** Move the item with id `fromId` to where `toId` currently sits. */
  onMove: (fromId: string, toId: string) => void;
  className?: string;
  /** Render one item. Place `handle` wherever the grip should appear. */
  children: (item: T, index: number, handle: ReactNode) => ReactNode;
}

function SortableRow({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: (handle: ReactNode) => ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const handle = (
    <button
      type="button"
      ref={setActivatorNodeRef}
      aria-label={`Reorder ${label}`}
      title="Drag to reorder, or focus and use Space then the arrow keys"
      className="flex h-8 w-5 shrink-0 cursor-grab touch-none items-center justify-center rounded text-zinc-600 transition-colors duration-150 outline-none hover:bg-zinc-800/60 hover:text-zinc-300 focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
      {...attributes}
      {...listeners}
    >
      <GripVertical className="size-4" aria-hidden />
    </button>
  );

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        "relative",
        isDragging && "z-10 [&>*]:shadow-xl [&>*]:shadow-black/50",
      )}
    >
      {children(handle)}
    </li>
  );
}

/** A vertical list whose items can be dragged, or keyboard-moved, into a new order. */
export function SortableList<T extends { id: string }>({
  items,
  itemLabel,
  onMove,
  className,
  children,
}: SortableListProps<T>) {
  const contextId = useId();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd({ active, over }: DragEndEvent) {
    if (over && active.id !== over.id) onMove(String(active.id), String(over.id));
  }

  return (
    <DndContext
      id={contextId}
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[verticalOnly]}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={items.map((item) => item.id)}
        strategy={verticalListSortingStrategy}
      >
        <ul className={className}>
          {items.map((item, index) => (
            <SortableRow key={item.id} id={item.id} label={itemLabel}>
              {(handle) => children(item, index, handle)}
            </SortableRow>
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

/** `list` with the item `fromId` moved to the position of `toId`. */
export function moveById<T extends { id: string }>(
  list: T[],
  fromId: string,
  toId: string,
): T[] {
  const from = list.findIndex((item) => item.id === fromId);
  const to = list.findIndex((item) => item.id === toId);
  if (from === -1 || to === -1 || from === to) return list;

  const next = [...list];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}
