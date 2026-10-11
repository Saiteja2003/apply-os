"use client";

import { useQuery } from "@tanstack/react-query";
import { LogOut } from "lucide-react";
import type { ReactNode } from "react";

import { signOutAction } from "@/app/actions/auth";
import { BillingSection } from "@/components/billing-section";
import { ByokKeyForm } from "@/components/byok-key-form";
import { ModelSelector } from "@/components/model-selector";
import { Button } from "@/components/ui/button";
import { InlineAlert } from "@/components/ui/inline-alert";
import { useWorkspace } from "@/components/workspace-provider";
import { platformAllows } from "@/lib/billing/model-access";
import { fetchBilling, fetchKeyHints, queryKeys } from "@/lib/api";
import { getModel, MODEL_REGISTRY } from "@/lib/llm/models";
import { useModelConfig } from "@/lib/store";
import { cn } from "@/lib/utils";

function Section({
  id,
  title,
  description,
  children,
}: {
  id?: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      className="scroll-mt-4 rounded-xl border border-zinc-800/80 bg-zinc-900/60 shadow-lg shadow-black/10 backdrop-blur-md"
    >
      <div className="border-b border-zinc-800/80 px-5 py-4">
        <h2 className="text-sm font-medium">{title}</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
    </section>
  );
}

function KeySource({ hint }: { hint: string | undefined }) {
  return (
    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <span
        className={cn(
          "size-1.5 rounded-full transition-colors duration-150",
          hint ? "bg-emerald-500" : "bg-zinc-600",
        )}
        aria-hidden
      />
      {hint ? "Your key" : "Platform key"}
    </span>
  );
}

export function SettingsView({ email }: { email: string | null }) {
  const { userId } = useWorkspace();
  const { modelId } = useModelConfig();
  const {
    data: keyHints,
    isError,
    refetch,
  } = useQuery({
    queryKey: queryKeys.keyHints(userId),
    queryFn: fetchKeyHints,
  });

  // Shared with the Plans & credits section, so this costs no extra request.
  const { data: billing, isError: billingFailed } = useQuery({
    queryKey: queryKeys.billing(userId),
    queryFn: fetchBilling,
  });

  const activeModel = getModel(modelId) ?? MODEL_REGISTRY.models[0];
  const activeProvider =
    MODEL_REGISTRY.providers.find(
      (provider) => provider.id === activeModel.providerId,
    ) ?? MODEL_REGISTRY.providers[0];
  const byokProviders = MODEL_REGISTRY.providers.filter(
    (provider) => provider.supportsByok,
  );

  // What the active model will run on, for the status line under its name.
  const status: { text: string; tone: "ok" | "warn" | "muted" } =
    keyHints === undefined
      ? { text: isError ? "key status unavailable" : "checking key…", tone: "muted" }
      : activeProvider.id in keyHints
        ? { text: "runs on your own key", tone: "ok" }
        : billing === undefined
          ? {
              text: billingFailed ? "plan status unavailable" : "checking plan…",
              tone: "muted",
            }
          : platformAllows(billing.credits?.tier ?? null, activeModel.id)
            ? { text: "runs on the platform key, if one is configured", tone: "ok" }
            : { text: "Requires a Pro Credit Pack or own API key", tone: "warn" };

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5 px-4 py-5 md:px-6">
      <header>
        <h1 className="text-lg font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Plan, model, provider keys and account
        </p>
      </header>

      <BillingSection
        ownKeyProvider={
          keyHints && activeProvider.id in keyHints ? activeProvider.label : null
        }
        hasOwnKey={keyHints !== undefined && Object.keys(keyHints).length > 0}
      />

      <Section
        title="Model"
        description="Used for tailoring, interview briefings and resume import. If it fails, the other models are tried in turn."
      >
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <div className="min-w-0">
            <p className="text-sm font-medium">Active model</p>
            <p className="text-xs text-muted-foreground">
              {activeProvider.label} ·{" "}
              <span
                className={cn(
                  "transition-colors duration-150",
                  status.tone === "warn" && "font-medium text-amber-400",
                )}
              >
                {status.text}
              </span>{" "}
              · remembered in this browser
            </p>
          </div>
          <ModelSelector registry={MODEL_REGISTRY} activeModel={activeModel} />
        </div>
      </Section>

      <Section
        id="provider-keys"
        title="Provider keys"
        description="Bring your own API key. Keys are encrypted before they are stored, are only used on the server, and are never shown again: only the last four characters come back."
      >
        {isError && !keyHints ? (
          <div className="flex flex-wrap items-center gap-3 px-5 py-4 [&>div]:flex-1">
            <InlineAlert tone="error">Could not load your API keys.</InlineAlert>
            <Button variant="outline" size="sm" onClick={() => void refetch()}>
              Retry
            </Button>
          </div>
        ) : (
          <ul className="divide-y divide-zinc-800/80">
            {byokProviders.map((provider) => (
              <li
                key={provider.id}
                className="grid gap-x-6 gap-y-2.5 px-5 py-4 sm:grid-cols-[9rem_1fr] sm:items-start"
              >
                <div className="sm:pt-2">
                  <p className="text-sm font-medium">{provider.label}</p>
                  {keyHints && <KeySource hint={keyHints[provider.id]} />}
                </div>
                <div className="min-w-0">
                  {keyHints ? (
                    <ByokKeyForm
                      userId={userId}
                      provider={provider}
                      hint={keyHints[provider.id]}
                    />
                  ) : (
                    <div className="h-9 animate-pulse rounded-md bg-zinc-800/50" />
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Account" description="The account you are signed in with.">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{email ?? "No email"}</p>
            <p className="truncate font-mono text-xs text-muted-foreground">
              {userId}
            </p>
          </div>
          <form action={signOutAction}>
            <Button type="submit" variant="outline">
              <LogOut aria-hidden />
              Sign out
            </Button>
          </form>
        </div>
      </Section>
    </div>
  );
}
