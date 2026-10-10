"use client";

import { Plus } from "lucide-react";
import { useEffect, useState } from "react";

import { AddJobDialog } from "@/components/add-job-dialog";
import { KanbanBoard } from "@/components/kanban/kanban-board";
import { isTypingTarget } from "@/components/layout/sidebar";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { useWorkspace } from "@/components/workspace-provider";

export function DashboardView() {
  const {
    applications,
    tailoringIds,
    upsertApplication,
    tailor,
    moveApplication,
    openApplication,
  } = useWorkspace();
  const [addOpen, setAddOpen] = useState(false);

  // `N` opens the Add job drawer, unless the user is typing or one is open.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypingTarget(event.target) || event.key.toLowerCase() !== "n") return;
      if (document.querySelector('[role="dialog"]')) return;
      event.preventDefault();
      setAddOpen(true);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-end justify-between gap-4 px-4 pt-5 pb-3 md:px-6">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Pipeline</h1>
          <p className="text-sm text-muted-foreground">
            {applications.length === 0
              ? "No applications yet"
              : `${applications.length} ${
                  applications.length === 1 ? "application" : "applications"
                } · drag a card to change its stage`}
          </p>
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <Plus aria-hidden />
          Add job
          <Kbd className="ml-0.5 border-white/20 bg-white/10 text-white/80">N</Kbd>
        </Button>
      </header>

      <KanbanBoard
        applications={applications}
        tailoringIds={tailoringIds}
        onSelect={openApplication}
        onMove={moveApplication}
        onAdd={() => setAddOpen(true)}
      />

      <AddJobDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onCreated={upsertApplication}
        tailor={tailor}
        onTailored={openApplication}
      />
    </div>
  );
}
