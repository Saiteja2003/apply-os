"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";

import { MatchScore } from "@/components/match-score";
import { StatusBadge } from "@/components/status-badge";
import { useWorkspace } from "@/components/workspace-provider";
import { formatDate } from "@/lib/utils";

export default function ApplicationsPage() {
  const { applications, openApplication } = useWorkspace();

  return (
    <div className="px-4 py-5 md:px-6">
      <h1 className="text-lg font-semibold tracking-tight">Applications</h1>
      <p className="mb-4 text-sm text-muted-foreground">
        {applications.length === 0
          ? "Nothing tracked yet"
          : "Every application in one table · select a row for its detail"}
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
        <div className="overflow-x-auto rounded-xl border border-zinc-800/80 bg-zinc-900/60">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-zinc-800/80 text-xs text-zinc-400">
              <tr>
                <th className="px-4 py-2.5 font-medium">Company</th>
                <th className="px-4 py-2.5 font-medium">Role</th>
                <th className="px-4 py-2.5 font-medium">Stage</th>
                <th className="px-4 py-2.5 font-medium">Applied</th>
                <th className="px-4 py-2.5 text-right font-medium">Match</th>
                <th className="w-8" aria-hidden />
              </tr>
            </thead>
            <tbody>
              {applications.map((application) => (
                <tr
                  key={application.id}
                  onClick={() => openApplication(application.id)}
                  className="group cursor-pointer border-b border-zinc-800/60 transition-colors duration-150 last:border-0 hover:bg-zinc-800/40"
                >
                  <td className="px-4 py-2.5 font-medium">
                    {/* The button gives keyboard users the same action as a row click. */}
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        openApplication(application.id);
                      }}
                      className="rounded text-left outline-none group-hover:text-indigo-300 focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {application.companyName}
                    </button>
                  </td>
                  <td className="px-4 py-2.5 text-zinc-300">
                    {application.roleTitle}
                  </td>
                  <td className="px-4 py-2.5">
                    <StatusBadge status={application.status} />
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    {application.appliedAt
                      ? formatDate(application.appliedAt)
                      : "–"}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {application.matchScore === null ? (
                      <span className="text-muted-foreground">–</span>
                    ) : (
                      <MatchScore score={application.matchScore} />
                    )}
                  </td>
                  <td className="pr-3 text-zinc-600 transition-colors group-hover:text-zinc-300">
                    <ChevronRight className="size-4" aria-hidden />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
