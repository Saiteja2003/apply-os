"use client";

import { KeyRound, Sparkles, Zap } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { ByokKeyForm } from "@/components/byok-key-form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { KeyHints } from "@/lib/db/api-keys";
import type {
  ModelDescriptor,
  ModelRegistry,
  ProviderDescriptor,
  ProviderId,
} from "@/lib/llm/models";
import type { UserCredits } from "@/lib/types/billing";
import { cn } from "@/lib/utils";

interface ByokKeyDialogProps {
  userId: string;
  registry: ModelRegistry;
  activeProvider: ProviderDescriptor;
  activeModel?: ModelDescriptor;
  keyHints: KeyHints;
  credits?: UserCredits | null;
  dailyUsage?: Record<string, number>;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function ByokKeyDialog({
  userId,
  registry,
  activeProvider,
  activeModel,
  keyHints,
  credits = null,
  dailyUsage = {},
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
}: ByokKeyDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = isControlled ? controlledOnOpenChange! : setInternalOpen;

  const [providerId, setProviderId] = useState<ProviderId>(activeProvider.id);

  const usingByok = activeProvider.id in keyHints;
  const balance = credits?.balance ?? 0;
  const hasCredits = balance > 0;

  // Calculate remaining daily free runs for current active model
  const quota = activeModel?.dailyFreeQuota ?? 5;
  const runsUsed = activeModel ? (dailyUsage[activeModel.id] ?? 0) : 0;
  const remainingFreeRuns = Math.max(0, quota - runsUsed);

  const byokProviders = registry.providers.filter(
    (provider) => provider.supportsByok,
  );

  const provider =
    byokProviders.find((entry) => entry.id === providerId) ?? activeProvider;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        setProviderId(activeProvider.id);
      }}
    >
      <DialogTrigger asChild>
        <Button
          variant="outline"
          className="h-8 gap-1.5 px-2.5 text-xs font-medium"
          aria-label={
            usingByok
              ? `API key active. ${activeProvider.label} using BYOK.`
              : hasCredits
                ? `${balance} credits remaining.`
                : `${remainingFreeRuns} daily free runs remaining.`
          }
        >
          {usingByok ? (
            <>
              <KeyRound className="size-3.5 text-emerald-400" aria-hidden />
              <span className="size-1.5 rounded-full bg-emerald-500" aria-hidden />
              <span className="text-zinc-200">
                {activeProvider.label} · BYOK
              </span>
            </>
          ) : hasCredits ? (
            <>
              <Zap className="size-3.5 text-indigo-400" aria-hidden />
              <span className="size-1.5 rounded-full bg-indigo-400" aria-hidden />
              <span className="text-zinc-200">
                {balance} Credits Left
              </span>
            </>
          ) : (
            <>
              <Sparkles className="size-3.5 text-violet-400" aria-hidden />
              <span className="size-1.5 rounded-full bg-violet-400" aria-hidden />
              <span className="text-zinc-200">
                {remainingFreeRuns} Daily Free Runs
              </span>
            </>
          )}
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogTitle className="text-base font-semibold">
          Bring Your Own Key (BYOK)
        </DialogTitle>
        <DialogDescription className="mt-1 text-xs text-muted-foreground">
          Keys are encrypted before they are stored and are only ever used on
          the server. Using your own key unlocks unlimited runs across every model
          with zero credit debits.
        </DialogDescription>

        <div
          className="mt-4 flex gap-1 rounded-md bg-muted p-1"
          role="tablist"
          aria-label="Provider"
        >
          {byokProviders.map((entry) => (
            <button
              key={entry.id}
              type="button"
              role="tab"
              aria-selected={entry.id === providerId}
              onClick={() => setProviderId(entry.id)}
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 rounded px-2 py-1.5 text-xs transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                entry.id === providerId
                  ? "bg-zinc-800 font-medium text-zinc-100 shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {entry.label}
              {entry.id in keyHints && (
                <span
                  className="size-1.5 rounded-full bg-emerald-500"
                  aria-label="key saved"
                />
              )}
            </button>
          ))}
        </div>

        <div className="mt-4">
          <ByokKeyForm
            key={provider.id}
            userId={userId}
            provider={provider}
            hint={keyHints[provider.id]}
            autoFocus
          />
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-zinc-800 pt-3 text-xs text-zinc-400">
          <span>Prefer not to manage API keys?</span>
          <Link
            href="/settings#plans"
            onClick={() => setOpen(false)}
            className="font-medium text-indigo-400 hover:text-indigo-300"
          >
            Explore Credit Bundles →
          </Link>
        </div>
      </DialogContent>
    </Dialog>
  );
}
