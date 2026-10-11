"use client";

import { Check, ChevronDown, KeyRound, Loader2, Lock, Sparkles, Zap } from "lucide-react";
import { useState } from "react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { KeyHints } from "@/lib/db/api-keys";
import type { ModelDescriptor, ModelRegistry } from "@/lib/llm/models";
import { useGatewayStore } from "@/lib/store";
import {
  CREDIT_BUNDLES,
  type CreditBundleId,
  type UserCredits,
} from "@/lib/types/billing";
import { cn } from "@/lib/utils";

interface ModelSelectorProps {
  registry: ModelRegistry;
  activeModel: ModelDescriptor;
  keyHints?: KeyHints;
  credits?: UserCredits | null;
  dailyUsage?: Record<string, number>;
  onOpenByok?: () => void;
}

export function ModelSelector({
  registry,
  activeModel,
  keyHints = {},
  credits = null,
  dailyUsage = {},
  onOpenByok,
}: ModelSelectorProps) {
  const setActiveModel = useGatewayStore((state) => state.setActiveModel);
  const [menuOpen, setMenuOpen] = useState(false);
  const [unlockModalOpen, setUnlockModalOpen] = useState(false);
  const [selectedLockedModel, setSelectedLockedModel] =
    useState<ModelDescriptor | null>(null);
  const [buyingBundleId, setBuyingBundleId] = useState<CreditBundleId | null>(null);

  const balance = credits?.balance ?? 0;

  // Split into Free Daily Quota vs. Institutional Tier
  const freeModels = registry.models.filter(
    (m) => m.tier === "FREE_FAST" || m.tier === "FREE_STANDARD",
  );
  const institutionalModels = registry.models.filter(
    (m) => m.tier === "PREMIUM_INSTITUTIONAL",
  );

  function handleModelSelect(model: ModelDescriptor) {
    const hasByok = model.providerId in keyHints;

    if (model.tier === "PREMIUM_INSTITUTIONAL") {
      if (!hasByok && balance <= 0) {
        // Locked: prompt unlock modal
        setSelectedLockedModel(model);
        setMenuOpen(false);
        setUnlockModalOpen(true);
        return;
      }
    }

    setActiveModel(model.id);
    setMenuOpen(false);
  }

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
    <>
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            aria-label="Active model"
            className="h-8 gap-1.5 px-2.5 text-xs font-medium"
          >
            <Sparkles className="size-3.5 text-indigo-400" aria-hidden />
            <span className="max-w-28 truncate sm:max-w-none text-zinc-100">
              {activeModel.label}
            </span>
            <ChevronDown className="size-3 text-zinc-400" aria-hidden />
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent
          align="end"
          className="w-72 p-1.5 bg-zinc-950 border-zinc-800 shadow-2xl"
        >
          {/* Group 1: Daily Free Quota */}
          <div className="px-2 py-1 text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
            Daily Free Quota
          </div>
          <div className="space-y-0.5">
            {freeModels.map((model) => {
              const isSelected = activeModel.id === model.id;
              const hasByok = model.providerId in keyHints;
              const usageCount = dailyUsage[model.id] ?? 0;
              const remaining = Math.max(0, model.dailyFreeQuota - usageCount);

              return (
                <button
                  key={model.id}
                  type="button"
                  onClick={() => handleModelSelect(model)}
                  className={cn(
                    "flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-xs text-left transition-colors outline-none",
                    isSelected
                      ? "bg-zinc-800/80 text-zinc-100 font-medium"
                      : "text-zinc-300 hover:bg-zinc-900 hover:text-zinc-100",
                  )}
                >
                  <div className="flex items-center gap-1.5">
                    {isSelected ? (
                      <Check className="size-3.5 text-indigo-400 shrink-0" />
                    ) : (
                      <span className="size-3.5" />
                    )}
                    <span>{model.label}</span>
                  </div>

                  <div>
                    {hasByok ? (
                      <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300">
                        BYOK
                      </span>
                    ) : (
                      <span className="rounded bg-zinc-900 border border-zinc-800 px-1.5 py-0.5 text-[10px] font-medium text-zinc-400 tabular-nums">
                        {remaining}/{model.dailyFreeQuota} daily left
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Group 2: Institutional Tier */}
          <div className="mt-2 border-t border-zinc-800/80 pt-1.5">
            <div className="px-2 py-1 text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
              Institutional Tier (Claude / GPT-4o)
            </div>
            <div className="space-y-0.5">
              {institutionalModels.map((model) => {
                const isSelected = activeModel.id === model.id;
                const hasByok = model.providerId in keyHints;
                const isLocked = !hasByok && balance <= 0;

                return (
                  <button
                    key={model.id}
                    type="button"
                    onClick={() => handleModelSelect(model)}
                    className={cn(
                      "flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-xs text-left transition-colors outline-none",
                      isSelected
                        ? "bg-zinc-800/80 text-zinc-100 font-medium"
                        : "text-zinc-300 hover:bg-zinc-900 hover:text-zinc-100",
                    )}
                  >
                    <div className="flex items-center gap-1.5">
                      {isSelected ? (
                        <Check className="size-3.5 text-indigo-400 shrink-0" />
                      ) : (
                        <span className="size-3.5" />
                      )}
                      <span>{model.label}</span>
                    </div>

                    <div>
                      {hasByok ? (
                        <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300">
                          Unlocked via BYOK
                        </span>
                      ) : balance > 0 ? (
                        <span className="rounded bg-indigo-500/15 px-1.5 py-0.5 text-[10px] font-medium text-indigo-300">
                          1 Credit / run
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded bg-amber-500/10 border border-amber-500/30 px-1.5 py-0.5 text-[10px] font-medium text-amber-300">
                          <Lock className="size-2.5" />
                          <span>Credit Pack Required</span>
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Unlock Institutional AI Modal */}
      <Dialog open={unlockModalOpen} onOpenChange={setUnlockModalOpen}>
        <DialogContent className="sm:max-w-md bg-zinc-950 border-zinc-800">
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-400">
              <Sparkles className="size-4" />
            </div>
            <div>
              <DialogTitle className="text-base font-semibold text-zinc-100">
                Unlock Institutional AI
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                {selectedLockedModel ? selectedLockedModel.label : "Claude 3.7 Sonnet & GPT-4o"}{" "}
                requires an institutional credit bundle or your own API key.
              </DialogDescription>
            </div>
          </div>

          <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3 text-xs leading-relaxed text-zinc-300">
            <strong className="text-zinc-100">Why Institutional AI?</strong> High-density
            reasoning, zero conversational fluff, and executive-level tone
            calibration verified against your master resume AST.
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium text-zinc-300">
              One-Time Credit Bundles (Zero Subscriptions)
            </p>
            <ul className="space-y-2">
              {bundles.map((bundle) => (
                <li
                  key={bundle.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800/90 bg-zinc-900/80 p-3"
                >
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-semibold text-zinc-100">
                        {bundle.name}
                      </span>
                      {bundle.popular && (
                        <span className="rounded bg-indigo-500/20 px-1.5 py-0.2 text-[9px] font-semibold text-indigo-300">
                          Popular
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-zinc-400">
                      {bundle.credits} credits · {bundle.pricePerApp}
                    </div>
                  </div>

                  <Button
                    size="sm"
                    disabled={buyingBundleId === bundle.id}
                    onClick={() => handleBuy(bundle.id)}
                    className="h-7 text-xs bg-indigo-600 hover:bg-indigo-500"
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
          </div>

          <div className="flex items-center justify-between border-t border-zinc-800/80 pt-3 text-xs text-zinc-400">
            <span>Have your own keys?</span>
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1 text-xs"
              onClick={() => {
                setUnlockModalOpen(false);
                onOpenByok?.();
              }}
            >
              <KeyRound className="size-3 text-emerald-400" />
              <span>Use BYOK (Free)</span>
            </Button>
          </div>

          <div className="flex justify-end pt-1">
            <DialogClose asChild>
              <Button variant="ghost" size="sm" className="h-7 text-xs">
                Cancel
              </Button>
            </DialogClose>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
