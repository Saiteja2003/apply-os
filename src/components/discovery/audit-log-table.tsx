"use client";

import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  History,
  ShieldAlert,
  Terminal,
  XCircle,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { AutoApplyAuditLog } from "@/lib/types/discovery";
import { cn } from "@/lib/utils";

interface AuditLogTableProps {
  logs: AutoApplyAuditLog[];
}

export function AuditLogTable({ logs }: AuditLogTableProps) {
  if (logs.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-zinc-800 bg-zinc-950/40 p-8 text-center text-zinc-400">
        <History className="mx-auto size-6 text-zinc-600 mb-2" />
        <p className="text-xs font-medium text-zinc-300">
          No automated submissions recorded yet
        </p>
        <p className="mt-1 text-[11px] text-zinc-500 max-w-sm mx-auto">
          Every autonomous dispatch event, including circuit-breaker halts on unknown
          questionnaires, will be immutably recorded here with execution telemetry.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950 shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-zinc-800 bg-zinc-900/60 text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
              <th className="py-2.5 px-3.5">Timestamp</th>
              <th className="py-2.5 px-3.5">Employer</th>
              <th className="py-2.5 px-3.5">Match Score</th>
              <th className="py-2.5 px-3.5">Dispatch Method</th>
              <th className="py-2.5 px-3.5">Status</th>
              <th className="py-2.5 px-3.5">Telemetry & Halt Notes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/60">
            {logs.map((log) => {
              const isHalted = log.status === "HALTED_UNKNOWN_QUESTION";
              const isSuccess = log.status === "SUCCESS";

              return (
                <tr
                  key={log.id}
                  className="transition-colors hover:bg-zinc-900/40 text-zinc-300"
                >
                  <td className="py-2.5 px-3.5 font-mono text-[11px] text-zinc-500 whitespace-nowrap">
                    {new Date(log.createdAt).toLocaleString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className="py-2.5 px-3.5 font-medium text-zinc-200">
                    <div className="flex items-center gap-1.5">
                      <span>{log.companyName}</span>
                      {log.jobUrl && (
                        <a
                          href={log.jobUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-zinc-500 hover:text-zinc-300"
                          title="Open job posting"
                        >
                          <ExternalLink className="size-3" />
                        </a>
                      )}
                    </div>
                  </td>
                  <td className="py-2.5 px-3.5 font-mono">
                    <span
                      className={cn(
                        "rounded px-1.5 py-0.5 text-[11px] font-semibold",
                        log.matchScore >= 80
                          ? "bg-emerald-500/10 text-emerald-400"
                          : log.matchScore >= 60
                            ? "bg-indigo-500/10 text-indigo-400"
                            : "bg-zinc-800 text-zinc-400",
                      )}
                    >
                      {log.matchScore}%
                    </span>
                  </td>
                  <td className="py-2.5 px-3.5">
                    <span className="flex items-center gap-1 text-[11px] text-zinc-400">
                      <Terminal className="size-3 text-zinc-500" />
                      {log.dispatchedVia}
                    </span>
                  </td>
                  <td className="py-2.5 px-3.5">
                    {isSuccess && (
                      <Badge
                        variant="success"
                        className="gap-1 text-[10px] bg-emerald-950/60 text-emerald-300 border border-emerald-800/60"
                      >
                        <CheckCircle2 className="size-3" /> Dispatched
                      </Badge>
                    )}
                    {isHalted && (
                      <Badge
                        variant="warning"
                        className="gap-1 text-[10px] bg-amber-950/60 text-amber-300 border border-amber-800/60"
                      >
                        <AlertTriangle className="size-3" /> Halted (Unknown Q)
                      </Badge>
                    )}
                    {log.status === "FAILED" && (
                      <Badge
                        variant="danger"
                        className="gap-1 text-[10px] bg-red-950/60 text-red-300 border border-red-800/60"
                      >
                        <XCircle className="size-3" /> Failed
                      </Badge>
                    )}
                  </td>
                  <td className="py-2.5 px-3.5 text-[11px] text-zinc-400 max-w-xs truncate">
                    {log.haltReason ? (
                      <span
                        className="text-amber-300/90 font-mono text-[10px]"
                        title={log.haltReason}
                      >
                        {log.haltReason}
                      </span>
                    ) : (
                      <span className="text-zinc-600">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
