"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useState, useTransition, type FormEvent } from "react";
import { toast } from "sonner";

import { deleteByokKeyAction, saveByokKeyAction } from "@/app/actions/api-keys";
import { Button } from "@/components/ui/button";
import { InlineAlert } from "@/components/ui/inline-alert";
import { PasswordInput } from "@/components/ui/password-input";
import type { ActionResult } from "@/lib/action-result";
import { queryKeys } from "@/lib/api";
import type { KeyHints } from "@/lib/db/api-keys";
import type { ProviderDescriptor } from "@/lib/llm/models";

interface ByokKeyFormProps {
  userId: string;
  provider: ProviderDescriptor;
  /** Last four characters of the stored key, if there is one. */
  hint: string | undefined;
  autoFocus?: boolean;
}

/**
 * Saves or removes one provider's key. The key itself only travels to the
 * server action; the browser only ever gets the last four characters back.
 */
export function ByokKeyForm({ userId, provider, hint, autoFocus }: ByokKeyFormProps) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<ActionResult<KeyHints>>) {
    setError(null);
    startTransition(async () => {
      // A server action rejects (rather than returning) when the request
      // itself fails, e.g. the network drops.
      const result = await action().catch(
        (): ActionResult<KeyHints> => ({
          ok: false,
          error: "Could not reach the server. Check your connection and try again.",
        }),
      );
      if (result.ok) {
        queryClient.setQueryData(queryKeys.keyHints(userId), result.data);
        toast.success(
          provider.id in result.data
            ? `${provider.label} API key saved`
            : `${provider.label} API key removed`,
        );
        setDraft("");
      } else {
        setError(result.error);
      }
    });
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!draft.trim()) return;
    run(() => saveByokKeyAction(provider.id, draft));
  }

  return (
    <>
      {hint ? (
        <div className="flex items-center justify-between gap-3 rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2.5">
          <div className="min-w-0">
            <p className="text-sm font-medium">Key saved</p>
            <p className="truncate font-mono text-xs text-muted-foreground">
              ••••••••{hint}
            </p>
          </div>
          <Button
            variant="destructive"
            size="sm"
            disabled={pending}
            onClick={() => run(() => deleteByokKeyAction(provider.id))}
          >
            {pending && <Loader2 className="animate-spin" aria-hidden />}
            Remove
          </Button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex gap-2 [&>div]:flex-1">
          <PasswordInput
            autoFocus={autoFocus}
            autoComplete="off"
            spellCheck={false}
            placeholder="Paste API key"
            aria-label={`${provider.label} API key`}
            aria-invalid={error ? true : undefined}
            value={draft}
            disabled={pending}
            onChange={(event) => setDraft(event.target.value)}
          />
          <Button type="submit" disabled={pending || !draft.trim()}>
            {pending && <Loader2 className="animate-spin" aria-hidden />}
            Save
          </Button>
        </form>
      )}

      {error && (
        <InlineAlert tone="error" className="mt-3">
          {error}
        </InlineAlert>
      )}
    </>
  );
}
