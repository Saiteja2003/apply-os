import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { ProviderKeys } from "@/lib/llm/gateway";
import { decryptApiKey, encryptApiKey, keyHint } from "@/lib/llm/key-vault";
import { PROVIDER_IDS, type ProviderId } from "@/lib/llm/models";
import { getAdminClient } from "@/lib/supabase/admin";
import { createClient, getSessionUser } from "@/lib/supabase/server";

/**
 * BYOK key storage. Keys are AES-256-GCM encrypted with BYOK_ENCRYPTION_KEY
 * before they leave this module; the database only ever holds ciphertext.
 *
 * Every function re-checks that `userId` is the signed-in user, then talks
 * to `user_api_keys` through the service-role client. If no service-role
 * key is configured it falls back to the user's own session, which the
 * owner-only RLS policies on the table allow.
 */

/** An error whose message is safe to show to the user. */
export class KeyStoreError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "KeyStoreError";
  }
}

const RLS_VIOLATION = "42501";

interface ApiKeyRow {
  provider: string;
  encrypted_key: string;
  key_hint: string;
}

/** Last four characters of each stored key, by provider. Safe for the browser. */
export type KeyHints = Partial<Record<ProviderId, string>>;

function isProviderId(value: string): value is ProviderId {
  return (PROVIDER_IDS as readonly string[]).includes(value);
}

async function keyStore(userId: string): Promise<SupabaseClient> {
  const sessionUser = await getSessionUser();
  if (!sessionUser || sessionUser.id !== userId) {
    throw new KeyStoreError("API keys can only be accessed by their owner.");
  }
  return getAdminClient() ?? (await createClient());
}

function storageError(
  action: string,
  error: { code?: string; message: string },
): KeyStoreError {
  if (error.code === RLS_VIOLATION) {
    return new KeyStoreError(
      "API key storage is not set up yet. Run supabase/migrations/002_api_key_policies_and_calendar_events.sql in the Supabase SQL editor, or set SUPABASE_SERVICE_ROLE_KEY to the service_role secret.",
      { cause: error },
    );
  }
  return new KeyStoreError(`Could not ${action} the API key.`, { cause: error });
}

async function loadRows(userId: string): Promise<ApiKeyRow[]> {
  const store = await keyStore(userId);
  const { data, error } = await store
    .from("user_api_keys")
    .select("provider, encrypted_key, key_hint")
    .eq("user_id", userId)
    .returns<ApiKeyRow[]>();

  if (error) throw storageError("load", error);
  return data;
}

export async function getKeyHints(userId: string): Promise<KeyHints> {
  const hints: KeyHints = {};
  for (const row of await loadRows(userId)) {
    if (isProviderId(row.provider)) hints[row.provider] = row.key_hint;
  }
  return hints;
}

/** Decrypted keys for the gateway. Never return these to the browser. */
export async function getByokKeys(userId: string): Promise<ProviderKeys> {
  const keys: ProviderKeys = {};
  for (const row of await loadRows(userId)) {
    if (!isProviderId(row.provider)) continue;
    try {
      keys[row.provider] = decryptApiKey(row.encrypted_key, {
        userId,
        providerId: row.provider,
      });
    } catch {
      // Unreadable (e.g. the encryption key was rotated): treat as absent so
      // the gateway reports a missing key instead of failing obscurely.
    }
  }
  return keys;
}

export async function saveByokKey(
  userId: string,
  providerId: ProviderId,
  apiKey: string,
): Promise<void> {
  const store = await keyStore(userId);
  const { error } = await store.from("user_api_keys").upsert(
    {
      user_id: userId,
      provider: providerId,
      encrypted_key: encryptApiKey(apiKey, { userId, providerId }),
      key_hint: keyHint(apiKey),
    },
    { onConflict: "user_id,provider" },
  );

  if (error) throw storageError("save", error);
}

export async function deleteByokKey(
  userId: string,
  providerId: ProviderId,
): Promise<void> {
  const store = await keyStore(userId);
  const { error } = await store
    .from("user_api_keys")
    .delete()
    .eq("user_id", userId)
    .eq("provider", providerId);

  if (error) throw storageError("remove", error);
}
