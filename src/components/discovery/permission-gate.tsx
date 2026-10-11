"use client";

import {
  AlertCircle,
  Bell,
  CheckCircle2,
  FileCheck,
  Lock,
  RotateCcw,
  Shield,
  ShieldAlert,
  Sparkles,
  Zap,
} from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { recordAutoApplyConsentAction } from "@/app/actions/discovery";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AutoApplyConsent, PermissionTier } from "@/lib/types/discovery";
import { cn } from "@/lib/utils";

interface PermissionGateProps {
  currentConsent?: AutoApplyConsent | null;
  onConsentUpdated?: (consent: AutoApplyConsent) => void;
}

const TIERS: {
  id: PermissionTier;
  title: string;
  tagline: string;
  description: string;
  icon: typeof Bell;
  badge: { text: string; variant: "neutral" | "accent" | "warning" };
}[] = [
  {
    id: "NOTIFY",
    title: "Tier 1: Alert & Radar",
    tagline: "Passive matching. Zero automated applications.",
    description:
      "Jobs are evaluated against your calibrated profile. Matched listings appear in your feed with fit scores, but no documents or submissions are triggered without manual action.",
    icon: Bell,
    badge: { text: "Manual Only", variant: "neutral" },
  },
  {
    id: "STAGE_AND_CONFIRM",
    title: "Tier 2: Tailor & Stage",
    tagline: "Semi-autonomous. Review and approve before dispatch.",
    description:
      "High-match jobs trigger ATS keyword tailoring and cover letter generation. Applications are staged in your workspace for a single-click review and submission confirmation.",
    icon: FileCheck,
    badge: { text: "Review Gate", variant: "accent" },
  },
  {
    id: "AUTONOMOUS",
    title: "Tier 3: Autonomous Dispatch",
    tagline: "Direct agentic submission with strict safety halts.",
    description:
      "Honing submits applications on your behalf via ATS API or browser automation. Execution strictly enforces a 5/day quota and halts on any question outside your profile.",
    icon: Zap,
    badge: { text: "Fully Agentic", variant: "warning" },
  },
];

const AUTONOMOUS_CONSENT_DECLARATION = `I hereby grant Honing explicit legal authorization to act as my designated agent to compile and submit job applications on my behalf. I acknowledge and agree to the following terms:
1. Daily Rate Cap: A strict circuit breaker limit of 5 submissions per day is enforced.
2. Compliance Circuit Breaker: Submissions will HALT IMMEDIATELY if an application presents questions outside my calibrated intake profile.
3. Master AST Ground Truth: Submissions rely strictly on genuine achievements from my Master Resume AST with zero fabrication.
4. Cryptographic Audit: Every submission is recorded in an immutable, timestamped execution log.`;

export function PermissionGate({
  currentConsent,
  onConsentUpdated,
}: PermissionGateProps) {
  const activeTier = currentConsent?.permissionTier ?? "NOTIFY";
  const [selectedTier, setSelectedTier] = useState<PermissionTier>(activeTier);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [signature, setSignature] = useState(
    currentConsent?.consentText ?? "",
  );
  const [isPending, startTransition] = useTransition();

  const isChangingToTier3 = selectedTier === "AUTONOMOUS";
  const canSaveTier3 = agreedToTerms && signature.trim().length >= 3;
  const isDirty = selectedTier !== activeTier;

  function handleSaveTier() {
    if (selectedTier === "AUTONOMOUS" && !canSaveTier3) {
      toast.error(
        "Please accept the legal terms and provide your electronic signature.",
      );
      return;
    }

    startTransition(async () => {
      const consentText =
        selectedTier === "AUTONOMOUS"
          ? signature.trim()
          : `Selected ${selectedTier} on ${new Date().toISOString()}`;

      const res = await recordAutoApplyConsentAction({
        permissionTier: selectedTier,
        consentText,
      });

      if (!res.ok) {
        toast.error(res.error);
        return;
      }

      toast.success(
        selectedTier === "AUTONOMOUS"
          ? "Tier 3 Autonomous Dispatch activated with legal consent."
          : `Permission set to ${selectedTier}.`,
      );
      onConsentUpdated?.(res.data);
    });
  }

  function handleRevokeToTier1() {
    startTransition(async () => {
      const res = await recordAutoApplyConsentAction({
        permissionTier: "NOTIFY",
        consentText: "Revoked to Tier 1: NOTIFY",
      });

      if (!res.ok) {
        toast.error(res.error);
        return;
      }

      setSelectedTier("NOTIFY");
      setAgreedToTerms(false);
      setSignature("");
      toast.success("Autonomous dispatch revoked. Reverted to Tier 1 (Alert Only).");
      onConsentUpdated?.(res.data);
    });
  }

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-5 text-zinc-100 shadow-lg">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-zinc-800/80 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Shield className="size-4 text-indigo-400" />
            <h3 className="text-sm font-semibold tracking-tight text-zinc-100">
              Strict Permission Protocol
            </h3>
            <Badge
              variant={activeTier === "AUTONOMOUS" ? "warning" : "accent"}
              className="text-[11px]"
            >
              Current: {activeTier}
            </Badge>
          </div>
          <p className="mt-1 text-xs text-zinc-400">
            Define the exact level of autonomy Honing is granted when discovering and
            dispatching job applications.
          </p>
        </div>

        {activeTier === "AUTONOMOUS" && (
          <Button
            size="sm"
            variant="outline"
            onClick={handleRevokeToTier1}
            disabled={isPending}
            className="text-xs border-red-900/50 text-red-300 hover:bg-red-950/40"
          >
            <RotateCcw className="size-3.5" /> Revoke Autonomy
          </Button>
        )}
      </div>

      {/* 3-Tier Grid Selector */}
      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
        {TIERS.map((tier) => {
          const Icon = tier.icon;
          const isSelected = selectedTier === tier.id;
          const isCurrentlyActive = activeTier === tier.id;

          return (
            <div
              key={tier.id}
              role="button"
              tabIndex={0}
              onClick={() => setSelectedTier(tier.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setSelectedTier(tier.id);
                }
              }}
              className={cn(
                "relative flex flex-col justify-between rounded-xl border p-4 text-left transition-all duration-150 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500",
                isSelected
                  ? "border-indigo-500/60 bg-zinc-900/90 shadow-md shadow-indigo-500/5"
                  : "border-zinc-800/80 bg-zinc-900/30 hover:border-zinc-700 hover:bg-zinc-900/60",
              )}
            >
              <div>
                <div className="flex items-center justify-between">
                  <span
                    className={cn(
                      "flex size-8 items-center justify-center rounded-lg transition-colors",
                      isSelected
                        ? "bg-indigo-500 text-white"
                        : "bg-zinc-800 text-zinc-400",
                    )}
                  >
                    <Icon className="size-4" />
                  </span>
                  <div className="flex items-center gap-1.5">
                    {isCurrentlyActive && (
                      <span className="flex items-center gap-1 text-[10px] font-medium text-emerald-400">
                        <CheckCircle2 className="size-3" /> Active
                      </span>
                    )}
                    <Badge variant={tier.badge.variant} className="text-[10px]">
                      {tier.badge.text}
                    </Badge>
                  </div>
                </div>

                <h4 className="mt-3 text-xs font-semibold text-zinc-100">
                  {tier.title}
                </h4>
                <p className="mt-0.5 text-[11px] font-medium text-indigo-300">
                  {tier.tagline}
                </p>
                <p className="mt-2 text-xs text-zinc-400 leading-relaxed">
                  {tier.description}
                </p>
              </div>

              <div className="mt-4 pt-3 border-t border-zinc-800/60 flex items-center justify-between">
                <span className="text-[11px] text-zinc-500">
                  {tier.id === "AUTONOMOUS" ? "Max 5 / day" : "Unlimited"}
                </span>
                <span
                  className={cn(
                    "size-4 rounded-full border flex items-center justify-center text-[9px]",
                    isSelected
                      ? "border-indigo-500 bg-indigo-500 text-white"
                      : "border-zinc-700 bg-zinc-900",
                  )}
                >
                  {isSelected && "✓"}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Tier 3 Electronic Signature & Consent Gate */}
      {isChangingToTier3 && (
        <div className="mt-5 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-xs text-zinc-300 animate-fade-in">
          <div className="flex items-start gap-2.5">
            <ShieldAlert className="size-5 shrink-0 text-amber-400 mt-0.5" />
            <div className="space-y-2 flex-1">
              <div>
                <h4 className="font-semibold text-amber-200">
                  Electronic Agency Authorization (Legal Requirement)
                </h4>
                <p className="text-zinc-400 text-[11px] mt-0.5">
                  Federal electronic signature and anti-spam compliance requires your explicit
                  acknowledgment before autonomous job submissions can take place.
                </p>
              </div>

              {/* Legal Text Scrollbox */}
              <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3 font-mono text-[11px] text-zinc-400 whitespace-pre-line leading-relaxed max-h-36 overflow-y-auto">
                {AUTONOMOUS_CONSENT_DECLARATION}
              </div>

              <div className="space-y-3 pt-2">
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={agreedToTerms}
                    onChange={(e) => setAgreedToTerms(e.target.checked)}
                    className="mt-0.5 size-4 rounded border-zinc-700 bg-zinc-900 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="text-xs text-zinc-200">
                    I have read, understood, and accept the agency authorization, daily 5-run
                    rate limit, and strict unknown-question circuit breaker.
                  </span>
                </label>

                <div>
                  <label className="block text-[11px] font-semibold text-zinc-300 uppercase tracking-wide">
                    Electronic Signature (Type Full Legal Name)
                  </label>
                  <Input
                    placeholder="e.g. Alex J. Morgan"
                    value={signature}
                    onChange={(e) => setSignature(e.target.value)}
                    className="mt-1 h-8 max-w-sm font-serif text-sm tracking-wide bg-zinc-900/90 text-zinc-100"
                  />
                  <span className="mt-1 block text-[10px] text-zinc-500">
                    Your digital signature is cryptographically bound to your account and
                    timestamped in the consent ledger.
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Save Action Bar */}
      <div className="mt-5 flex items-center justify-between border-t border-zinc-800/80 pt-4">
        <div className="text-xs text-zinc-400">
          {activeTier === "AUTONOMOUS" && currentConsent?.signedAt && (
            <span>
              Authorized by <strong className="text-zinc-200">{currentConsent.consentText}</strong>{" "}
              on {new Date(currentConsent.signedAt).toLocaleDateString()}
            </span>
          )}
        </div>

        <Button
          onClick={handleSaveTier}
          disabled={isPending || (!isDirty && !isChangingToTier3) || (isChangingToTier3 && !canSaveTier3)}
          className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs"
        >
          {isPending
            ? "Saving Consent..."
            : isChangingToTier3
              ? "Sign & Activate Autonomous Mode"
              : `Switch to ${selectedTier}`}
        </Button>
      </div>
    </div>
  );
}
