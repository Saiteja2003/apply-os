"use server";

import { z } from "zod";

import type { ActionResult } from "@/lib/action-result";
import {
  deleteByokKey,
  getKeyHints,
  KeyStoreError,
  saveByokKey,
  type KeyHints,
} from "@/lib/db/api-keys";
import { PROVIDER_IDS } from "@/lib/llm/models";
import { getSessionUser } from "@/lib/supabase/server";

const SIGNED_OUT = "You are signed out. Sign in and try again.";

const providerSchema = z.enum(PROVIDER_IDS);
const keySchema = z
  .string()
  .trim()
  .min(16, "That does not look like a complete API key.")
  .max(512, "That key is too long.")
  .regex(/^\S+$/, "API keys cannot contain spaces.");

function failure(error: unknown, fallback: string): { ok: false; error: string } {
  console.error(error);
  return {
    ok: false,
    error: error instanceof KeyStoreError ? error.message : fallback,
  };
}

/** Which providers have a stored key (last four characters only). */
export async function getKeyHintsAction(): Promise<ActionResult<KeyHints>> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: SIGNED_OUT };

  try {
    return { ok: true, data: await getKeyHints(user.id) };
  } catch (error) {
    return failure(error, "Could not load your API keys.");
  }
}

export async function saveByokKeyAction(
  providerId: string,
  apiKey: string,
): Promise<ActionResult<KeyHints>> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: SIGNED_OUT };

  const provider = providerSchema.safeParse(providerId);
  if (!provider.success) return { ok: false, error: "Unknown provider." };
  const key = keySchema.safeParse(apiKey);
  if (!key.success) {
    return { ok: false, error: key.error.issues[0]?.message ?? "Invalid key." };
  }

  try {
    await saveByokKey(user.id, provider.data, key.data);
    return { ok: true, data: await getKeyHints(user.id) };
  } catch (error) {
    return failure(error, "Could not save the API key.");
  }
}

export async function deleteByokKeyAction(
  providerId: string,
): Promise<ActionResult<KeyHints>> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: SIGNED_OUT };

  const provider = providerSchema.safeParse(providerId);
  if (!provider.success) return { ok: false, error: "Unknown provider." };

  try {
    await deleteByokKey(user.id, provider.data);
    return { ok: true, data: await getKeyHints(user.id) };
  } catch (error) {
    return failure(error, "Could not remove the API key.");
  }
}
