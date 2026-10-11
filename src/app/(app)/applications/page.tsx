"use client";

import Link from "next/link";

import { ApplicationsTable } from "@/components/applications/applications-table";
import { useWorkspace } from "@/components/workspace-provider";

export default function ApplicationsPage() {
  const { applications, openApplication } = useWorkspace();

  return (
    <div className="px-4 py-5 md:px-6">
      <h1 className="text-lg font-semibold tracking-tight">Applications</h1>
      <p className="mb-4 text-sm text-muted-foreground">
        {applications.length === 0
          ? "Nothing tracked yet"
          : "Every application in one table · search, filter, sort, and export"}
      </p>

      {applications.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-800 px-4 py-12 text-center">
          <p className="text-sm font-medium">No applications yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Add your first job from the{" "}
            <Link
              href="/dashboard"
              className="rounded text-indigo-400 transition-colors outline-none hover:text-indigo-300 focus-visible:ring-2 focus-visible:ring-ring"
            >
              dashboard
            </Link>
            .
          </p>
        </div>
      ) : (
        <ApplicationsTable
          applications={applications}
          onRowClick={(id) => openApplication(id)}
        />
      )}
    </div>
  );
}
