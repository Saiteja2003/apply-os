import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { SUPABASE_URL } from "./env";

/**
 * True only for a credential that bypasses RLS: a legacy JWT whose role
 * claim is `service_role`, or a new-style `sb_secret_` key. The anon key
 * pasted into SUPABASE_SERVICE_ROLE_KEY fails this check.
 */
function isServiceRoleKey(key: string): boolean {
  if (key.startsWith("sb_secret_")) return true;

  const payload = key.split(".")[1];
  if (!payload) return false;
  try {
    const claims: unknown = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    );
    return (
      typeof claims === "object" &&
      claims !== null &&
      "role" in claims &&
      claims.role === "service_role"
    );
  } catch {
    return false;
  }
}

let warned = false;

/**
 * Service-role client, or `null` when SUPABASE_SERVICE_ROLE_KEY is missing
 * or is not actually a service-role credential.
 *
 * It bypasses RLS, so it is used only for `user_api_keys`
 * (src/lib/db/api-keys.ts) and credits (src/lib/db/credits.ts). Every query
 * through it must filter by an already-verified user id.
 */
export function getAdminClient(): SupabaseClient | null {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!key || !isServiceRoleKey(key)) {
    if (!warned) {
      warned = true;
      console.warn(
        key
          ? "SUPABASE_SERVICE_ROLE_KEY is not a service-role key (it looks like the anon key). Falling back to the signed-in session for API key storage. Copy the service_role secret from Supabase > Project Settings > API."
          : "SUPABASE_SERVICE_ROLE_KEY is not set. Falling back to the signed-in session for API key storage.",
      );
    }
    return null;
  }

  return createClient(SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
