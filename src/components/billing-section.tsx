"use client";

import { useQuery } from "@tanstack/react-query";
import { Check, KeyRound, Plus } from "lucide-react";
import { useState } from "react";

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
import type {
  BillingSummary,
  CreditLedgerEntry,
  PlanTier,
} from "@/lib/types/billing";
import { cn } from "@/lib/utils";

interface Plan {
  tier: PlanTier;
  name: string;
  price: string;
  cadence: string;
  blurb: string;
  points: string[];
  /** Applications in a paid pack. */
  pack?: number;
}

const PLANS: Plan[] = [
  {
    tier: "free",
    name: "Free Starter",
    price: "$0",
    cadence: "",
    blurb: "Explore ApplyOS with fast AI.",
    points: [
      "3 tailored applications a day",
      "Resume, cover letter and recruiter message each time",
      "Fast default model; Claude and GPT-4o need Pro or your own key",
      "Pipeline, calendar and interview prep",
    ],
  },
  {
    tier: "byok",
    name: "Your own keys",
    price: "No markup",
    cadence: "",
    blurb: "Connect your Anthropic, OpenAI or Google key.",
    points: [
      "Unlimited applications",
      "Never uses your ApplyOS applications",
      "Keys are encrypted and stay on the server",
    ],
  },
  {
    tier: "pro_credits",
    name: "Pro Credit Pack",
    price: "$19",
    cadence: "one-time",
    blurb: "For an active search, with no keys to manage.",
    pack: 100,
    points: [
      "100 tailored applications",
      "No API keys needed",
      "Includes Claude and GPT-4o",
      "Applications never expire",
    ],
  },
  {
    tier: "sprint_pass",
    name: "Sprint Pass",
    price: "$39",
    cadence: "60 days",
    blurb: "For a focused, time-boxed job hunt.",
    pack: 250,
    points: [
      "250 tailored applications",
      "Everything in Pro",
      "Recruiter email detection (in development)",
    ],
  },
];

const PLAN_NAMES: Record<PlanTier, string> = {
  free: "Free Starter",
  byok: "Your own keys",
  pro_credits: "Pro Credit Pack",
  sprint_pass: "Sprint Pass",
};

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });

const plural = (count: number) =>
  `${count} ${count === 1 ? "application" : "applications"}`;

function PlanCard({
  plan,
  current,
  hasOwnKey,
  onBuy,
}: {
  plan: Plan;
  current: boolean;
  hasOwnKey: boolean;
  onBuy: () => void;
}) {
  const connected = plan.tier === "byok" && hasOwnKey;

  return (
    <li
      className={cn(
        "flex flex-col rounded-lg border bg-zinc-950/40 p-4 transition-colors duration-150",
        current
          ? "border-indigo-500/50 shadow-lg shadow-indigo-500/10"
          : "border-zinc-800/80 hover:border-zinc-700",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-medium">{plan.name}</h3>
        {current && <Badge variant="accent">Current plan</Badge>}
        {connected && <Badge variant="success">Connected</Badge>}
      </div>
      <p className="mt-2 flex items-baseline gap-1.5">
        <span className="text-xl font-semibold tracking-tight">{plan.price}</span>
        {plan.cadence && (
          <span className="text-xs text-muted-foreground">{plan.cadence}</span>
        )}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{plan.blurb}</p>

      <ul className="mt-3 flex-1 space-y-1.5">
        {plan.points.map((point) => (
          <li key={point} className="flex gap-2 text-[13px] text-zinc-300">
            <Check className="mt-0.5 size-3.5 shrink-0 text-indigo-400" aria-hidden />
            {point}
          </li>
        ))}
      </ul>

      {plan.tier === "byok" && (
        <Button variant="outline" size="sm" className="mt-4" asChild>
          <a href="#provider-keys">
            <KeyRound aria-hidden />
            {connected ? "Manage keys" : "Add a key"}
          </a>
        </Button>
      )}
      {plan.pack && (
        <Button
          variant={current ? "outline" : "default"}
          size="sm"
          className="mt-4"
          onClick={onBuy}
        >
          Get {plan.pack} applications
        </Button>
      )}
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
  const { credits, ledger, freeDailyCredits } = billing;
  const free = credits.tier === "free";
  // A pack's size is the balance right after the last top-up.
  const lastTopUp = ledger.find(
    (entry) => entry.amount > 0 && entry.referenceType !== "REFUND",
  );
  const capacity = Math.max(
    credits.balance,
    free ? freeDailyCredits : (lastTopUp?.balanceAfter ?? credits.balance),
    1,
  );
  const percent = Math.round((credits.balance / capacity) * 100);
  const expires = credits.tierExpiresAt
    ? new Date(credits.tierExpiresAt).toLocaleDateString(undefined, {
        month: "long",
        day: "numeric",
      })
    : null;

  return (
    <div className="px-5 py-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-zinc-400">
            Applications left · {PLAN_NAMES[credits.tier]}
          </p>
          <p className="mt-1 flex items-baseline gap-1.5">
            <span className="text-3xl font-semibold tracking-tight tabular-nums">
              {credits.balance}
            </span>
            <span className="text-sm text-muted-foreground">of {capacity}</span>
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={onAdd}>
          <Plus aria-hidden />
          Add more credits
        </Button>
      </div>

      <div
        role="progressbar"
        aria-label="Applications left"
        aria-valuemin={0}
        aria-valuemax={capacity}
        aria-valuenow={credits.balance}
        className="mt-3 h-1.5 overflow-hidden rounded-full bg-zinc-800"
      >
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-200 ease-out",
            credits.balance === 0
              ? "bg-zinc-700"
              : percent <= 34
                ? "bg-amber-400"
                : "bg-indigo-400",
          )}
          style={{ width: `${percent}%` }}
        />
      </div>

      <p className="mt-2 text-xs text-muted-foreground">
        {ownKeyProvider
          ? `Your ${ownKeyProvider} key is active, so runs with the selected model are free and leave this balance alone.`
          : free
            ? `Tops back up to ${freeDailyCredits} each day at midnight UTC. One application covers the resume, cover letter and recruiter message.`
            : expires
              ? `Your pass runs until ${expires}. One application covers the resume, cover letter and recruiter message.`
              : "One application covers the resume, cover letter and recruiter message."}
      </p>
    </div>
  );
}

function Ledger({ entries }: { entries: CreditLedgerEntry[] }) {
  const { applications } = useWorkspace();

  if (entries.length === 0) {
    return (
      <p className="border-t border-zinc-800/80 px-5 py-6 text-center text-sm text-muted-foreground">
        No activity yet. Tailor a job and it shows up here.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto border-t border-zinc-800/80">
      <table className="w-full text-left text-[13px]">
        <caption className="sr-only">Recent credit activity</caption>
        <thead>
          <tr className="text-xs text-zinc-500">
            <th scope="col" className="px-5 py-2 font-medium">Date</th>
            <th scope="col" className="px-2 py-2 font-medium">Activity</th>
            <th scope="col" className="hidden px-2 py-2 font-medium sm:table-cell">Model</th>
            <th scope="col" className="px-5 py-2 text-right font-medium">Applications</th>
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
              <tr key={entry.id} className="transition-colors duration-150 hover:bg-zinc-800/30">
                <td className="px-5 py-2 whitespace-nowrap text-zinc-400">
                  {formatDate(entry.createdAt)}
                </td>
                <td className="max-w-0 truncate px-2 py-2 sm:max-w-xs">
                  {application
                    ? `${application.companyName} · ${application.roleTitle}`
                    : entry.description}
                </td>
                <td className="hidden px-2 py-2 text-zinc-400 sm:table-cell">
                  {model ?? "—"}
                </td>
                <td
                  className={cn(
                    "px-5 py-2 text-right tabular-nums",
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

/** Plans, the credit balance and its history. Rendered inside Settings. */
export function BillingSection({
  ownKeyProvider,
  hasOwnKey,
}: {
  /** Label of the active model's provider when it runs on the user's key. */
  ownKeyProvider: string | null;
  hasOwnKey: boolean;
}) {
  const { userId } = useWorkspace();
  const [buying, setBuying] = useState(false);
  const { data, isError, refetch } = useQuery({
    queryKey: queryKeys.billing(userId),
    queryFn: fetchBilling,
  });

  const credits = data?.credits ?? null;

  return (
    <section
      id="plans"
      aria-labelledby="plans-heading"
      className="scroll-mt-4 rounded-xl border border-zinc-800/80 bg-zinc-900/60 shadow-lg shadow-black/10 backdrop-blur-md"
    >
      <div className="border-b border-zinc-800/80 px-5 py-4">
        <h2 id="plans-heading" className="text-sm font-medium">
          Plans &amp; credits
        </h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          One application is one tailored job: resume, cover letter and
          recruiter message. Runs on your own API key are always free.
        </p>
      </div>

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
            onAdd={() => setBuying(true)}
          />
          <Ledger entries={data.ledger} />
        </>
      ) : (
        <p className="m-5 rounded-md border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
          Credits are not switched on for this workspace yet, so runs are not
          being counted. Run{" "}
          <code className="font-mono text-xs">
            supabase/migrations/004_billing_and_credit_ledger.sql
          </code>{" "}
          in the Supabase SQL editor to turn them on.
        </p>
      )}

      <ul className="grid gap-3 border-t border-zinc-800/80 p-5 sm:grid-cols-2">
        {PLANS.map((plan) => (
          <PlanCard
            key={plan.tier}
            plan={plan}
            current={credits?.tier === plan.tier}
            hasOwnKey={hasOwnKey}
            onBuy={() => setBuying(true)}
          />
        ))}
      </ul>

      <Dialog open={buying} onOpenChange={setBuying}>
        <DialogContent>
          <DialogTitle className="text-base font-semibold">
            Add more credits
          </DialogTitle>
          <DialogDescription className="mt-1 text-sm text-muted-foreground">
            Checkout is not connected yet, so packs cannot be bought from here
            today. Nothing will be charged.
          </DialogDescription>

          <ul className="mt-4 space-y-2">
            {PLANS.filter((plan) => plan.pack).map((plan) => (
              <li
                key={plan.tier}
                className="flex items-center justify-between gap-3 rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">{plan.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {plural(plan.pack ?? 0)} · {plan.cadence}
                  </p>
                </div>
                <span className="text-sm font-medium tabular-nums">{plan.price}</span>
              </li>
            ))}
          </ul>

          <p className="mt-4 text-sm text-muted-foreground">
            Until then, add your own API key under Provider keys for unlimited
            runs, or come back tomorrow for your free applications.
          </p>

          <div className="mt-4 flex justify-end">
            <DialogClose asChild>
              <Button variant="outline" autoFocus>
                Close
              </Button>
            </DialogClose>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
