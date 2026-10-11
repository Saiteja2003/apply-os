"use client";

import {
  Ban,
  Briefcase,
  Compass,
  DollarSign,
  Globe2,
  Lock,
  Plus,
  RotateCcw,
  Shield,
  ShieldAlert,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import { useState } from "react";

import { AuditLogTable } from "@/components/discovery/audit-log-table";
import { CalibrationModal } from "@/components/discovery/calibration-modal";
import { DiscoveredJobsFeed } from "@/components/discovery/discovered-jobs-feed";
import { PermissionGate } from "@/components/discovery/permission-gate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useWorkspace } from "@/components/workspace-provider";
import type {
  AutoApplyAuditLog,
  AutoApplyConsent,
  CandidatePreferences,
} from "@/lib/types/discovery";

interface DiscoveryViewProps {
  initialPreferences: CandidatePreferences | null;
  initialConsent: AutoApplyConsent | null;
  initialLogs: AutoApplyAuditLog[];
}

export function DiscoveryView({
  initialPreferences,
  initialConsent,
  initialLogs,
}: DiscoveryViewProps) {
  const { upsertApplication } = useWorkspace();
  const [preferences, setPreferences] = useState<CandidatePreferences | null>(
    initialPreferences,
  );
  const [consent, setConsent] = useState<AutoApplyConsent | null>(initialConsent);
  const [logs, setLogs] = useState<AutoApplyAuditLog[]>(initialLogs);

  // If no preferences have been calibrated, open calibration modal automatically
  const [calibrationModalOpen, setCalibrationModalOpen] = useState(
    !initialPreferences,
  );

  function handlePreferencesSaved(updated: CandidatePreferences) {
    setPreferences(updated);
  }

  function handleAuditLogged(newLog: AutoApplyAuditLog) {
    setLogs((prev) => [newLog, ...prev]);
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 md:px-6">
      {/* Page Title & Status */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Compass className="size-5 text-indigo-400" />
            <h1 className="text-xl font-bold tracking-tight text-zinc-100">
              Job Radar & Autonomous Dispatch
            </h1>
          </div>
          <p className="mt-1 text-xs text-zinc-400">
            Intake calibration boundaries, 3-tier permission gate, and preference-filtered
            opportunity radar.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setCalibrationModalOpen(true)}
            className="gap-1.5 border-zinc-800 bg-zinc-900/60 text-xs text-zinc-200 hover:bg-zinc-800 hover:text-white"
          >
            <SlidersHorizontal className="size-3.5 text-indigo-400" />
            {preferences ? "Edit Calibration" : "Calibrate Profile"}
          </Button>
        </div>
      </div>

      {/* Top Banner: Uncalibrated vs Calibrated State */}
      {!preferences ? (
        <div className="rounded-xl border border-indigo-500/30 bg-gradient-to-r from-indigo-950/40 via-zinc-900/60 to-zinc-950 p-5 shadow-lg">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Sparkles className="size-4 text-indigo-400" />
                <h3 className="text-sm font-semibold text-indigo-200">
                  Candidate Calibration Questionnaire Required
                </h3>
              </div>
              <p className="text-xs text-zinc-400 max-w-2xl leading-relaxed">
                Configure your target roles, remote modality, minimum salary floor,
                legal work authorization, and employer blocklists before activating
                autonomous dispatch.
              </p>
            </div>
            <Button
              size="sm"
              onClick={() => setCalibrationModalOpen(true)}
              className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs shrink-0"
            >
              Start Calibration Intake
            </Button>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-zinc-800 bg-zinc-950/90 p-4 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Shield className="size-4 text-emerald-400" />
                <span className="text-xs font-semibold text-zinc-200 uppercase tracking-wide">
                  Calibrated Intake Profile
                </span>
                <Badge
                  variant="success"
                  className="text-[10px] bg-emerald-950/70 text-emerald-300 border border-emerald-800/60"
                >
                  Active & Enforced
                </Badge>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-zinc-400">
                <span className="flex items-center gap-1 font-medium text-zinc-300">
                  <Briefcase className="size-3 text-zinc-500" />
                  {preferences.targetRoles.length > 0
                    ? preferences.targetRoles.slice(0, 3).join(", ") +
                      (preferences.targetRoles.length > 3 ? "..." : "")
                    : "Any Role"}
                </span>
                <span className="text-zinc-600">•</span>
                <span className="flex items-center gap-1">
                  <Globe2 className="size-3 text-zinc-500" />
                  {preferences.remoteOnly
                    ? "Remote Only"
                    : preferences.locations.join(", ") || "Any Location"}
                </span>
                <span className="text-zinc-600">•</span>
                <span className="flex items-center gap-1 font-mono text-zinc-300">
                  <DollarSign className="size-3 text-zinc-500" />
                  Floor: ${(preferences.minSalaryFloor / 1000).toFixed(0)}k/yr
                </span>
                <span className="text-zinc-600">•</span>
                <span>Auth: {preferences.workAuthorization}</span>
                {preferences.companyBlocklist.length > 0 && (
                  <>
                    <span className="text-zinc-600">•</span>
                    <span className="flex items-center gap-1 text-red-400">
                      <Ban className="size-3" />
                      {preferences.companyBlocklist.length} Blocked
                    </span>
                  </>
                )}
              </div>
            </div>

            <Button
              size="sm"
              variant="outline"
              onClick={() => setCalibrationModalOpen(true)}
              className="text-xs border-zinc-800 hover:bg-zinc-800/60 text-zinc-300 shrink-0"
            >
              Modify Constraints
            </Button>
          </div>
        </div>
      )}

      {/* Strict Permission Protocol Section */}
      <PermissionGate
        currentConsent={consent}
        onConsentUpdated={(updated) => setConsent(updated)}
      />

      {/* Preference-Gated Evaluator & Feed */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-5 shadow-lg">
        <DiscoveredJobsFeed
          preferences={preferences}
          onAuditLogged={handleAuditLogged}
          onApplicationStaged={upsertApplication}
        />
      </div>

      {/* Audit Log Table Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-zinc-200">
              Autonomous Dispatch Audit Trail
            </h3>
            <p className="text-xs text-zinc-500">
              Immutable execution telemetry and compliance halt logs.
            </p>
          </div>
          <span className="text-xs font-mono text-zinc-500">
            {logs.length} logged events
          </span>
        </div>
        <AuditLogTable logs={logs} />
      </div>

      {/* Calibration Modal */}
      <CalibrationModal
        open={calibrationModalOpen}
        onOpenChange={setCalibrationModalOpen}
        initialPreferences={preferences}
        onSaved={handlePreferencesSaved}
      />
    </div>
  );
}
