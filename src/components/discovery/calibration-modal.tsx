"use client";

import {
  AlertTriangle,
  Briefcase,
  Building2,
  Check,
  ChevronLeft,
  ChevronRight,
  DollarSign,
  Globe2,
  Lock,
  Plus,
  ShieldAlert,
  Sparkles,
  X,
} from "lucide-react";
import { useState, useTransition, type KeyboardEvent } from "react";
import { toast } from "sonner";

import { saveCandidatePreferencesAction } from "@/app/actions/discovery";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  WORK_AUTHORIZATIONS,
  type CandidatePreferences,
  type WorkAuthorization,
} from "@/lib/types/discovery";
import { cn } from "@/lib/utils";

interface CalibrationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialPreferences?: CandidatePreferences | null;
  onSaved?: (preferences: CandidatePreferences) => void;
}

const COMMON_ROLES = [
  "Full Stack Engineer",
  "Frontend Engineer",
  "Backend Engineer",
  "Software Engineer",
  "DevOps / SRE",
  "Product Manager",
  "Staff Engineer",
  "Engineering Manager",
];

const SENIORITY_OPTIONS = [
  { id: "Entry", label: "Junior / Entry (0-2 yrs)" },
  { id: "Mid", label: "Mid-Level (2-5 yrs)" },
  { id: "Senior", label: "Senior (5-8 yrs)" },
  { id: "Staff", label: "Staff / Principal (8+ yrs)" },
  { id: "Lead", label: "Lead / Manager" },
];

const COMMON_CITIES = [
  "San Francisco, CA",
  "New York, NY",
  "Seattle, WA",
  "Austin, TX",
  "Boston, MA",
  "London, UK",
];

const WORK_AUTH_LABELS: Record<WorkAuthorization, string> = {
  CITIZEN: "U.S. Citizen",
  PERMANENT_RESIDENT: "Permanent Resident / Green Card",
  REQUIRES_SPONSORSHIP: "Requires Visa Sponsorship (H-1B, TN, O-1)",
  OTHER: "Other / Working Holiday / EAD",
};

export function CalibrationModal({
  open,
  onOpenChange,
  initialPreferences,
  onSaved,
}: CalibrationModalProps) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [isPending, startTransition] = useTransition();

  // Step 1: Roles & Seniority
  const [targetRoles, setTargetRoles] = useState<string[]>(
    initialPreferences?.targetRoles ?? ["Software Engineer"],
  );
  const [roleInput, setRoleInput] = useState("");
  const [seniorityLevels, setSeniorityLevels] = useState<string[]>(
    initialPreferences?.seniorityLevels ?? ["Mid", "Senior"],
  );

  // Step 2: Modality & Location
  const [remoteOnly, setRemoteOnly] = useState<boolean>(
    initialPreferences?.remoteOnly ?? false,
  );
  const [locations, setLocations] = useState<string[]>(
    initialPreferences?.locations ?? ["San Francisco, CA", "Remote"],
  );
  const [locationInput, setLocationInput] = useState("");

  // Step 3: Legal & Salary
  const [workAuth, setWorkAuth] = useState<WorkAuthorization>(
    initialPreferences?.workAuthorization ?? "CITIZEN",
  );
  const [salaryFloor, setSalaryFloor] = useState<number>(
    initialPreferences?.minSalaryFloor ?? 120000,
  );
  const [gender, setGender] = useState<string>(
    initialPreferences?.standardAnswers?.gender ?? "",
  );
  const [veteranStatus, setVeteranStatus] = useState<string>(
    initialPreferences?.standardAnswers?.veteranStatus ?? "",
  );

  // Step 4: Blocklist
  const [blocklist, setBlocklist] = useState<string[]>(
    initialPreferences?.companyBlocklist ?? [],
  );
  const [blocklistInput, setBlocklistInput] = useState("");

  // Role tag helpers
  function handleAddRole(role: string) {
    const trimmed = role.trim();
    if (!trimmed || targetRoles.includes(trimmed)) return;
    setTargetRoles((prev) => [...prev, trimmed]);
    setRoleInput("");
  }

  function handleRemoveRole(role: string) {
    setTargetRoles((prev) => prev.filter((r) => r !== role));
  }

  function handleRoleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      handleAddRole(roleInput);
    }
  }

  // Location tag helpers
  function handleAddLocation(loc: string) {
    const trimmed = loc.trim();
    if (!trimmed || locations.includes(trimmed)) return;
    setLocations((prev) => [...prev, trimmed]);
    setLocationInput("");
  }

  function handleRemoveLocation(loc: string) {
    setLocations((prev) => prev.filter((l) => l !== loc));
  }

  function handleLocationKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      handleAddLocation(locationInput);
    }
  }

  // Blocklist tag helpers
  function handleAddBlocklist(company: string) {
    const trimmed = company.trim();
    if (!trimmed || blocklist.includes(trimmed)) return;
    setBlocklist((prev) => [...prev, trimmed]);
    setBlocklistInput("");
  }

  function handleRemoveBlocklist(company: string) {
    setBlocklist((prev) => prev.filter((c) => c !== company));
  }

  function handleBlocklistKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      handleAddBlocklist(blocklistInput);
    }
  }

  function handleToggleSeniority(id: string) {
    setSeniorityLevels((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id],
    );
  }

  function handleSave() {
    startTransition(async () => {
      const res = await saveCandidatePreferencesAction({
        targetRoles,
        seniorityLevels,
        locations,
        remoteOnly,
        minSalaryFloor: salaryFloor,
        workAuthorization: workAuth,
        companyBlocklist: blocklist,
        standardAnswers: {
          ...(gender ? { gender } : {}),
          ...(veteranStatus ? { veteranStatus } : {}),
        },
      });

      if (!res.ok) {
        toast.error(res.error);
        return;
      }

      toast.success("Candidate calibration preferences updated");
      onSaved?.(res.data);
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl border-zinc-800 bg-zinc-950 p-6 text-zinc-100 shadow-2xl">
        <div className="flex items-center justify-between border-b border-zinc-800/80 pb-4">
          <div>
            <DialogTitle className="flex items-center gap-2 text-base font-semibold tracking-tight text-zinc-100">
              <Sparkles className="size-4 text-indigo-400" />
              Candidate Calibration Profile
            </DialogTitle>
            <DialogDescription className="text-xs text-zinc-400">
              Calibrate your career parameters, hard filters, and legal authorizations.
            </DialogDescription>
          </div>
          <span className="text-xs font-mono font-medium text-indigo-400">
            Step {step} of 4
          </span>
        </div>

        {/* Step Progression Bar */}
        <div className="mt-3 flex gap-1.5">
          {[1, 2, 3, 4].map((s) => (
            <div
              key={s}
              className={cn(
                "h-1 flex-1 rounded-full transition-all duration-200",
                s === step
                  ? "bg-indigo-500"
                  : s < step
                    ? "bg-indigo-500/40"
                    : "bg-zinc-800",
              )}
            />
          ))}
        </div>

        {/* Wizard Step 1: Target Roles & Seniority */}
        {step === 1 && (
          <div className="mt-5 space-y-5 animate-fade-in">
            <div>
              <label className="text-xs font-semibold tracking-wide text-zinc-300 uppercase">
                Target Roles & Job Titles
              </label>
              <p className="mt-0.5 text-xs text-zinc-500">
                Jobs with titles unrelated to these keywords will be filtered out.
              </p>
              <div className="mt-2.5 flex flex-wrap gap-1.5 min-h-[38px] rounded-md border border-zinc-800 bg-zinc-900/60 p-2">
                {targetRoles.map((role) => (
                  <Badge
                    key={role}
                    variant="neutral"
                    className="gap-1 border border-zinc-700 bg-zinc-800/80 text-xs text-zinc-200"
                  >
                    {role}
                    <button
                      type="button"
                      onClick={() => handleRemoveRole(role)}
                      className="rounded p-0.5 hover:bg-zinc-700 hover:text-red-400"
                    >
                      <X className="size-3" />
                    </button>
                  </Badge>
                ))}
                <input
                  type="text"
                  value={roleInput}
                  onChange={(e) => setRoleInput(e.target.value)}
                  onKeyDown={handleRoleKeyDown}
                  placeholder={
                    targetRoles.length === 0 ? "Type a role and press Enter..." : "Add role..."
                  }
                  className="flex-1 bg-transparent px-1 text-xs text-zinc-100 placeholder:text-zinc-600 outline-none min-w-[120px]"
                />
              </div>

              {/* Suggestions */}
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] text-zinc-500">Popular:</span>
                {COMMON_ROLES.map((role) => {
                  const active = targetRoles.includes(role);
                  return (
                    <button
                      key={role}
                      type="button"
                      onClick={() =>
                        active ? handleRemoveRole(role) : handleAddRole(role)
                      }
                      className={cn(
                        "rounded px-2 py-0.5 text-[11px] transition-colors duration-150",
                        active
                          ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30"
                          : "bg-zinc-900 text-zinc-400 border border-zinc-800 hover:border-zinc-700 hover:text-zinc-300",
                      )}
                    >
                      {active ? `✓ ${role}` : `+ ${role}`}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold tracking-wide text-zinc-300 uppercase">
                Target Seniority Level
              </label>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {SENIORITY_OPTIONS.map((item) => {
                  const active = seniorityLevels.includes(item.id);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleToggleSeniority(item.id)}
                      className={cn(
                        "flex items-center justify-between rounded-lg border p-2.5 text-left text-xs transition-colors duration-150",
                        active
                          ? "border-indigo-500/40 bg-indigo-500/10 font-medium text-indigo-300"
                          : "border-zinc-800 bg-zinc-900/40 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200",
                      )}
                    >
                      <span>{item.label}</span>
                      {active && <Check className="size-3.5 text-indigo-400 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Wizard Step 2: Modality & Locations */}
        {step === 2 && (
          <div className="mt-5 space-y-5 animate-fade-in">
            <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-3.5">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Globe2 className="size-4 text-indigo-400" />
                    <span className="text-sm font-medium text-zinc-200">
                      Remote Positions Only
                    </span>
                  </div>
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    Automatically reject any position requiring physical on-site or hybrid
                    commutes.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setRemoteOnly(!remoteOnly)}
                  className={cn(
                    "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500",
                    remoteOnly ? "bg-indigo-600" : "bg-zinc-800",
                  )}
                >
                  <span
                    className={cn(
                      "pointer-events-none inline-block size-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                      remoteOnly ? "translate-x-5" : "translate-x-0",
                    )}
                  />
                </button>
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold tracking-wide text-zinc-300 uppercase">
                {remoteOnly ? "Preferred Regions / Timezones" : "Target Metros & Cities"}
              </label>
              <p className="mt-0.5 text-xs text-zinc-500">
                {remoteOnly
                  ? "Jobs restricted outside these jurisdictions will be flagged."
                  : "On-site or hybrid jobs must match at least one of these locations."}
              </p>
              <div className="mt-2.5 flex flex-wrap gap-1.5 min-h-[38px] rounded-md border border-zinc-800 bg-zinc-900/60 p-2">
                {locations.map((loc) => (
                  <Badge
                    key={loc}
                    variant="neutral"
                    className="gap-1 border border-zinc-700 bg-zinc-800/80 text-xs text-zinc-200"
                  >
                    {loc}
                    <button
                      type="button"
                      onClick={() => handleRemoveLocation(loc)}
                      className="rounded p-0.5 hover:bg-zinc-700 hover:text-red-400"
                    >
                      <X className="size-3" />
                    </button>
                  </Badge>
                ))}
                <input
                  type="text"
                  value={locationInput}
                  onChange={(e) => setLocationInput(e.target.value)}
                  onKeyDown={handleLocationKeyDown}
                  placeholder="Type city and press Enter..."
                  className="flex-1 bg-transparent px-1 text-xs text-zinc-100 placeholder:text-zinc-600 outline-none min-w-[120px]"
                />
              </div>

              {/* Common cities */}
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] text-zinc-500">Popular:</span>
                {COMMON_CITIES.map((city) => {
                  const active = locations.includes(city);
                  return (
                    <button
                      key={city}
                      type="button"
                      onClick={() =>
                        active ? handleRemoveLocation(city) : handleAddLocation(city)
                      }
                      className={cn(
                        "rounded px-2 py-0.5 text-[11px] transition-colors duration-150",
                        active
                          ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30"
                          : "bg-zinc-900 text-zinc-400 border border-zinc-800 hover:border-zinc-700 hover:text-zinc-300",
                      )}
                    >
                      {active ? `✓ ${city}` : `+ ${city}`}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Wizard Step 3: Legal & Salary */}
        {step === 3 && (
          <div className="mt-5 space-y-5 animate-fade-in">
            <div>
              <label className="text-xs font-semibold tracking-wide text-zinc-300 uppercase">
                Work Authorization Status
              </label>
              <p className="mt-0.5 text-xs text-zinc-500">
                Governs immigration eligibility filtering and automated disclosures.
              </p>
              <div className="mt-2">
                <Select
                  value={workAuth}
                  onChange={(e) => setWorkAuth(e.target.value as WorkAuthorization)}
                  className="bg-zinc-900/90"
                >
                  {WORK_AUTHORIZATIONS.map((auth) => (
                    <option key={auth} value={auth}>
                      {WORK_AUTH_LABELS[auth]}
                    </option>
                  ))}
                </Select>
              </div>

              {workAuth === "REQUIRES_SPONSORSHIP" && (
                <div className="mt-2.5 flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 p-2.5 text-xs text-amber-300/90">
                  <AlertTriangle className="size-4 shrink-0 text-amber-400 mt-0.5" />
                  <span>
                    <strong>Strict filter enabled:</strong> ApplyOS will reject any job
                    specifying &quot;No visa sponsorship&quot; or requiring existing citizenship/clearance.
                  </span>
                </div>
              )}
            </div>

            <div>
              <label className="text-xs font-semibold tracking-wide text-zinc-300 uppercase">
                Minimum Annual Salary Floor (USD)
              </label>
              <p className="mt-0.5 text-xs text-zinc-500">
                Any posting with an explicit compensation ceiling below this floor will be blocked.
              </p>
              <div className="relative mt-2">
                <DollarSign className="absolute left-3 top-2.5 size-4 text-zinc-500" />
                <Input
                  type="number"
                  min={0}
                  step={5000}
                  value={salaryFloor}
                  onChange={(e) => setSalaryFloor(Number(e.target.value))}
                  className="pl-9 font-mono"
                />
              </div>
              <p className="mt-1 text-[11px] text-zinc-500">
                Current floor: ${salaryFloor.toLocaleString()} / year
              </p>
            </div>

            <div className="pt-2 border-t border-zinc-800/80">
              <span className="text-xs font-semibold tracking-wide text-zinc-400 uppercase">
                Optional ATS Pre-Fill Data
              </span>
              <div className="mt-2 grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] text-zinc-500">Gender Disclosure</label>
                  <Input
                    placeholder="e.g. Male / Female / Prefer not to say"
                    value={gender}
                    onChange={(e) => setGender(e.target.value)}
                    className="mt-1 h-8 text-xs"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-zinc-500">Veteran Status</label>
                  <Input
                    placeholder="e.g. Not a protected veteran"
                    value={veteranStatus}
                    onChange={(e) => setVeteranStatus(e.target.value)}
                    className="mt-1 h-8 text-xs"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Wizard Step 4: Blocklist & Exclusion Zone */}
        {step === 4 && (
          <div className="mt-5 space-y-4 animate-fade-in">
            <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-3.5">
              <div className="flex items-start gap-2.5">
                <ShieldAlert className="size-4 shrink-0 text-red-400 mt-0.5" />
                <div className="space-y-1">
                  <h4 className="text-xs font-semibold text-red-300">
                    Strict Employer & Domain Blocklist
                  </h4>
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    Companies or domains entered here are rejected at the evaluation
                    boundary. They will never appear in matching feeds, and no tailored
                    application or automated dispatch will ever be generated.
                  </p>
                </div>
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold tracking-wide text-zinc-300 uppercase">
                Blocked Companies & Domains
              </label>
              <div className="mt-2 flex flex-wrap gap-1.5 min-h-[42px] rounded-md border border-zinc-800 bg-zinc-900/60 p-2">
                {blocklist.map((item) => (
                  <Badge
                    key={item}
                    variant="danger"
                    className="gap-1 border border-red-900/60 bg-red-950/70 text-xs text-red-200"
                  >
                    {item}
                    <button
                      type="button"
                      onClick={() => handleRemoveBlocklist(item)}
                      className="rounded p-0.5 hover:bg-red-900/80"
                    >
                      <X className="size-3" />
                    </button>
                  </Badge>
                ))}
                <input
                  type="text"
                  value={blocklistInput}
                  onChange={(e) => setBlocklistInput(e.target.value)}
                  onKeyDown={handleBlocklistKeyDown}
                  placeholder={
                    blocklist.length === 0
                      ? "Add company or domain (e.g. meta.com, Revature) and press Enter..."
                      : "Add another..."
                  }
                  className="flex-1 bg-transparent px-1 text-xs text-zinc-100 placeholder:text-zinc-600 outline-none min-w-[140px]"
                />
              </div>

              <div className="mt-2.5 flex items-center justify-between text-xs text-zinc-500">
                <span>{blocklist.length} employer(s) currently blocked</span>
                {blocklistInput && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleAddBlocklist(blocklistInput)}
                    className="h-6 text-[11px]"
                  >
                    <Plus className="size-3" /> Add
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Footer Navigation */}
        <div className="mt-6 flex items-center justify-between border-t border-zinc-800/80 pt-4">
          {step > 1 ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setStep((s) => (s - 1) as 1 | 2 | 3 | 4)}
              disabled={isPending}
            >
              <ChevronLeft className="size-4" /> Back
            </Button>
          ) : (
            <div />
          )}

          {step < 4 ? (
            <Button
              type="button"
              size="sm"
              onClick={() => setStep((s) => (s + 1) as 1 | 2 | 3 | 4)}
            >
              Next <ChevronRight className="size-4" />
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              onClick={handleSave}
              disabled={isPending}
              className="bg-indigo-600 hover:bg-indigo-500 text-white"
            >
              {isPending ? "Saving..." : "Save Calibration Profile"}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
