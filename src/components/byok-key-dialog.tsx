"use client";

import { KeyRound } from "lucide-react";
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
  ModelRegistry,
  ProviderDescriptor,
  ProviderId,
} from "@/lib/llm/models";
import { cn } from "@/lib/utils";

interface ByokKeyDialogProps {
  userId: string;
  registry: ModelRegistry;
  activeProvider: ProviderDescriptor;
  keyHints: KeyHints;
}

export function ByokKeyDialog({
  userId,
  registry,
  activeProvider,
  keyHints,
}: ByokKeyDialogProps) {
  const [open, setOpen] = useState(false);
  const [providerId, setProviderId] = useState<ProviderId>(activeProvider.id);

  const usingByok = activeProvider.id in keyHints;
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
          aria-label={`API keys. ${activeProvider.label} is using ${
            usingByok ? "your own key" : "the platform key"
          }.`}
        >
          <KeyRound aria-hidden />
          <span
            className={cn(
              "size-2 rounded-full transition-colors",
              usingByok ? "bg-emerald-500" : "bg-muted-foreground/50",
            )}
            aria-hidden
          />
          <span className="hidden sm:inline">
            {activeProvider.label} · {usingByok ? "BYOK" : "Platform"}
          </span>
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogTitle className="text-base font-semibold">
          Bring your own key
        </DialogTitle>
        <DialogDescription className="mt-1 text-sm text-muted-foreground">
          Keys are encrypted before they are stored and are only ever used on
          the server. Providers without a key fall back to the platform key, if
          one is configured.
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
                "flex flex-1 items-center justify-center gap-1.5 rounded px-2 py-1.5 text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
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
          {/* Keyed so switching provider clears the typed key and any error. */}
          <ByokKeyForm
            key={provider.id}
            userId={userId}
            provider={provider}
            hint={keyHints[provider.id]}
            autoFocus
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
