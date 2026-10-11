"use client";

import { useQuery } from "@tanstack/react-query";
import { Check, KeyRound, Loader2, Plus, Sparkles, Zap } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { createCheckoutSessionAction } from "@/app/actions/checkout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { InlineAlert } from "@/components/ui/inline-alert";
import { useWorkspace } from "@/components/workspace-provider";
import { fetchBilling, queryKeys } from "@/lib/api";
import { getModel } from "@/lib/llm/models";
import {
  CREDIT_BUNDLES,
  type BillingSummary,
  type CreditBundle,
  type CreditBundleId,
  type CreditLedgerEntry,
  type PlanTier,
} from "@/lib/types/billing";
import { cn } from "@/lib/utils";

const PLAN_NAMES: Record<PlanTier, string> = {
  free: "Daily Free Tier",
  byok: "BYOK (Your Own Key)",
  pro_credits: "Credit Bundle",
  sprint_pass: "Credit Bundle",
};

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });

function BundleCard({
  bundle,
  isLoading,
  onBuy,
}: {
  bundle: CreditBundle;
  isLoading: boolean;
  onBuy: () => void;
}) {
  return (
    <li
      className={cn(
        "relative flex flex-col rounded-xl border bg-zinc-950/60 p-5 transition-all duration-150",
        bundle.popular
          ? "border-indigo-500/60 shadow-xl shadow-indigo-500/10 ring-1 ring-indigo-500/30"
          : "border-zinc-800/80 hover:border-zinc-700/90",
      )}
    >
      {bundle.popular && (
        <span className="absolute -top-2.5 right-4 rounded-full bg-indigo-500 px-2.5 py-0.5 text-[10px] font-semibold text-white shadow-sm">
          Most Popular
        </span>
      )}

      <div className="flex items-start justify-between gap-2">
        <h3 className="text-base font-semibold text-zinc-100">{bundle.name}</h3>
        <Badge variant="neutral" className="text-[11px] tabular-nums">
          {bundle.credits} credits
        </Badge>
      </div>

      <div className="mt-3 flex items-baseline gap-2">
        <span className="text-2xl font-bold tracking-tight text-zinc-100">
          {bundle.priceFormatted}
        </span>
        <span className="text-xs text-muted-foreground">one-time</span>
        <span className="text-xs font-medium text-emerald-400">
          ({bundle.pricePerApp})
        </span>
      </div>

      <p className="mt-1 text-xs text-muted-foreground">{bundle.description}</p>

      <ul className="mt-4 flex-1 space-y-2 border-t border-zinc-800/60 pt-4">
        {bundle.points.map((point) => (
          <li key={point} className="flex gap-2 text-xs text-zinc-300">
            <Check className="mt-0.5 size-3.5 shrink-0 text-indigo-400" aria-hidden />
            <span>{point}</span>
          </li>
        ))}
      </ul>

      <Button
        variant={bundle.popular ? "default" : "outline"}
        size="sm"
        disabled={isLoading}
        className={cn(
          "mt-5 w-full",
          bundle.popular ? "bg-indigo-600 hover:bg-indigo-500" : "",
        )}
        onClick={onBuy}
      >
        {isLoading ? (
          <>
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
            <span>Connecting Stripe…</span>
          </>
        ) : (
          <span>Get {bundle.name}</span>
        )}
      </Button>
    </li>
  );
}

function Telemetry({
  billing,
  ownKeyProvider,
  onAdd,
}: {
  billing: BillingSummary & { credits: NonNullable<BillingSummary["credits"]> };
  ownKeyProvider: string | null;
  onAdd: () => void;
}) {
  const { credits, ledger } = billing;
  const balance = credits.balance;

  const lastPurchase = ledger.find(
    (entry) => entry.referenceType === "PURCHASE" && entry.amount > 0,
  );
  const capacity = Math.max(balance, lastPurchase?.balanceAfter ?? balance, 1);
  const percent = Math.min(100, Math.round((balance / capacity) * 100));

  return (
    <div className="px-5 py-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-zinc-400">
            Institutional Credit Balance · {PLAN_NAMES[credits.tier]}
          </p>
          <p className="mt-1 flex items-baseline gap-1.5">
            <span className="text-3xl font-semibold tracking-tight text-zinc-100 tabular-nums">
              {balance}
            </span>
            <span className="text-sm text-muted-foreground">Credits available</span>
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={onAdd}
          className="gap-1.5 text-xs"
        >
          <Plus className="size-3.5" aria-hidden />
          <span>Buy Credit Bundle</span>
        </Button>
      </div>

      <div
        role="progressbar"
        aria-label="Applications left"
        aria-valuemin={0}
        aria-valuemax={capacity}
        aria-valuenow={balance}
        className="mt-3.5 h-1.5 overflow-hidden rounded-full bg-zinc-800"
      >
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-200 ease-out",
            balance === 0
              ? "bg-zinc-700"
              : balance <= 5
                ? "bg-amber-400"
                : "bg-indigo-500",
          )}
          style={{ width: `${percent}%` }}
        />
      </div>

      <p className="mt-2.5 text-xs leading-relaxed text-muted-foreground">
        {ownKeyProvider ? (
          <span>
            Your <strong className="text-zinc-200">{ownKeyProvider}</strong> key is
            active. Runs on your key bypass all credit requirements and leave this
            balance untouched.
          </span>
        ) : (
          <span>
            1 credit = 1 full institutional tailored job application (Claude 3.7
            Sonnet or GPT-4o, cover letter, and interview prep). Credits never
            expire.
          </span>
        )}
      </p>
    </div>
  );
}

function Ledger({ entries }: { entries: CreditLedgerEntry[] }) {
  const { applications } = useWorkspace();

  if (entries.length === 0) {
    return (
      <p className="border-t border-zinc-800/80 px-5 py-6 text-center text-xs text-muted-foreground">
        No credit activity yet. Tailor a job with an institutional model to see
        ledger events here.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto border-t border-zinc-800/80">
      <table className="w-full text-left text-[13px]">
        <caption className="sr-only">Recent credit activity</caption>
        <thead>
          <tr className="text-xs text-zinc-500">
            <th scope="col" className="px-5 py-2.5 font-medium">Date</th>
            <th scope="col" className="px-2 py-2.5 font-medium">Activity</th>
            <th scope="col" className="hidden px-2 py-2.5 font-medium sm:table-cell">Model</th>
            <th scope="col" className="px-5 py-2.5 text-right font-medium">Credits</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-800/60">
          {entries.map((entry) => {
            const usage = entry.referenceType === "TAILOR_APPLICATION";
            const application = usage
              ? applications.find((item) => item.id === entry.referenceId)
              : undefined;
            const model = application?.tailoredByModel
              ? (getModel(application.tailoredByModel)?.label ??
                application.tailoredByModel)
              : null;
            return (
              <tr key={entry.id} className="transition-colors hover:bg-zinc-800/30">
                <td className="px-5 py-2 whitespace-nowrap text-zinc-400">
                  {formatDate(entry.createdAt)}
                </td>
                <td className="max-w-0 truncate px-2 py-2 sm:max-w-xs text-zinc-200">
                  {application
                    ? `${application.companyName} · ${application.roleTitle}`
                    : entry.description}
                </td>
                <td className="hidden px-2 py-2 text-zinc-400 sm:table-cell">
                  {model ?? "—"}
                </td>
                <td
                  className={cn(
                    "px-5 py-2 text-right tabular-nums font-medium",
                    entry.amount > 0 ? "text-emerald-400" : "text-zinc-300",
                  )}
                >
                  {entry.amount > 0 ? `+${entry.amount}` : `−${-entry.amount}`}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Overhauled BillingSection: one-time credit bundles, zero subscriptions,
 * test-mode checkout wiring, and clear executive-tier AI value messaging.
 */
export function BillingSection({
  ownKeyProvider,
  hasOwnKey,
}: {
  ownKeyProvider: string | null;
  hasOwnKey: boolean;
}) {
  const { userId } = useWorkspace();
  const searchParams = useSearchParams();
  const [buyingBundleId, setBuyingBundleId] = useState<CreditBundleId | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const { data, isError, refetch } = useQuery({
    queryKey: queryKeys.billing(userId),
    queryFn: fetchBilling,
  });

  const credits = data?.credits ?? null;

  useEffect(() => {
    if (searchParams.get("billing") === "success") {
      toast.success("Payment successful", {
        description: "Your credits have been added to your balance.",
      });
      void refetch();
    } else if (searchParams.get("billing") === "cancelled") {
      toast.info("Checkout cancelled", {
        description: "No payment was processed.",
      });
    }
  }, [searchParams, refetch]);

  async function handleBuy(bundleId: CreditBundleId) {
    setBuyingBundleId(bundleId);
    try {
      const result = await createCheckoutSessionAction(bundleId);
      if (!result.ok) {
        toast.error("Checkout unavailable", { description: result.error });
        return;
      }
      window.location.href = result.data.url;
    } catch {
      toast.error("Checkout failed. Try again.");
    } finally {
      setBuyingBundleId(null);
    }
  }

  const bundles = Object.values(CREDIT_BUNDLES);

  return (
    <section
      id="plans"
      aria-labelledby="plans-heading"
      className="scroll-mt-4 rounded-xl border border-zinc-800/80 bg-zinc-900/60 shadow-lg shadow-black/10 backdrop-blur-md"
    >
      {/* Header with zero-subscription assurance */}
      <div className="border-b border-zinc-800/80 px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="plans-heading" className="text-sm font-semibold text-zinc-100">
            One-Time Credit Bundles
          </h2>
          <Badge variant="outline" className="text-xs text-indigo-400">
            Zero Monthly Subscriptions
          </Badge>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          No monthly commitments or auto-renewing subscriptions. Purchase credits
          as needed for institutional Claude &amp; GPT-4o models, or use your own
          API keys for unlimited free runs.
        </p>
      </div>

      {/* Telemetry and Ledger */}
      {data === undefined ? (
        isError ? (
          <div className="flex flex-wrap items-center gap-3 px-5 py-4 [&>div]:flex-1">
            <InlineAlert tone="error">Could not load your plan and credits.</InlineAlert>
            <Button variant="outline" size="sm" onClick={() => void refetch()}>
              Retry
            </Button>
          </div>
        ) : (
          <div className="space-y-3 px-5 py-4" aria-busy="true">
            <div className="h-9 w-32 animate-pulse rounded-md bg-zinc-800/50" />
            <div className="h-1.5 animate-pulse rounded-full bg-zinc-800/50" />
          </div>
        )
      ) : credits && data ? (
        <>
          <Telemetry
            billing={{ ...data, credits }}
            ownKeyProvider={ownKeyProvider}
            onAdd={() => setModalOpen(true)}
          />
          <Ledger entries={data.ledger} />
        </>
      ) : (
        <p className="m-5 rounded-md border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          Credits ledger is not switched on for this workspace yet. Run{" "}
          <code className="font-mono text-xs">
            supabase/migrations/004_billing_and_credit_ledger.sql
          </code>{" "}
          in your Supabase SQL editor.
        </p>
      )}

      {/* Value messaging callout */}
      <div className="border-t border-zinc-800/80 bg-zinc-950/40 px-5 py-4">
        <div className="flex items-start gap-3">
          <Sparkles className="mt-0.5 size-4 shrink-0 text-indigo-400" aria-hidden />
          <div className="text-xs leading-relaxed text-zinc-300">
            <strong className="font-medium text-zinc-100">
              Why Claude 3.5 Sonnet &amp; GPT-4o?
            </strong>{" "}
            Institutional reasoning, zero conversational fluff, and
            executive-level tone calibration for competitive tech roles. Verified
            against your master resume AST with zero hallucination.
          </div>
        </div>
      </div>

      {/* Bundles Grid */}
      <ul className="grid gap-3.5 border-t border-zinc-800/80 p-5 md:grid-cols-3">
        {bundles.map((bundle) => (
          <BundleCard
            key={bundle.id}
            bundle={bundle}
            isLoading={buyingBundleId === bundle.id}
            onBuy={() => handleBuy(bundle.id)}
          />
        ))}
      </ul>

      {/* Free & BYOK baseline info footer */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-800/80 bg-zinc-950/20 px-5 py-3.5 text-xs text-zinc-400">
        <div className="flex items-center gap-1.5">
          <Zap className="size-3.5 text-indigo-400" />
          <span>
            Daily Free Quota: <strong>5 runs/day</strong> Gemini Flash Lite ·{" "}
            <strong>3 runs/day</strong> Gemini Flash (resets 00:00 UTC)
          </span>
        </div>
        <a
          href="#provider-keys"
          className="flex items-center gap-1 font-medium text-indigo-400 hover:text-indigo-300"
        >
          <KeyRound className="size-3" />
          <span>{hasOwnKey ? "Manage BYOK Keys (Unlimited)" : "Add BYOK Key (Free)"}</span>
        </a>
      </div>

      {/* Quick Add Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogTitle className="text-base font-semibold">
            Add Credit Bundle
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Choose a bundle to unlock Claude 3.7 Sonnet &amp; GPT-4o instantly.
            One-time purchase, test-mode payment enabled.
          </DialogDescription>

          <ul className="mt-4 space-y-2.5">
            {bundles.map((bundle) => (
              <li
                key={bundle.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-900/80 p-3"
              >
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-semibold text-zinc-100">
                      {bundle.name}
                    </span>
                    {bundle.popular && (
                      <span className="rounded bg-indigo-500/20 px-1.5 py-0.2 text-[10px] font-medium text-indigo-300">
                        Popular
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-zinc-400">
                    {bundle.credits} credits · {bundle.pricePerApp}
                  </div>
                </div>

                <Button
                  size="sm"
                  disabled={buyingBundleId === bundle.id}
                  onClick={() => handleBuy(bundle.id)}
                  className="h-8 gap-1 text-xs"
                >
                  {buyingBundleId === bundle.id ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <span>Buy {bundle.priceFormatted}</span>
                  )}
                </Button>
              </li>
            ))}
          </ul>

          <div className="mt-4 flex justify-end">
            <DialogClose asChild>
              <Button variant="ghost" size="sm">
                Close
              </Button>
            </DialogClose>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
