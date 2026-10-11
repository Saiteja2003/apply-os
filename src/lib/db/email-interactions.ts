import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { EmailIntent, EmailInteraction } from "@/lib/types/email";

/**
 * Recruiter emails saved by the inbound webhook. Reads and the draft edit go
 * through the signed-in user's session, so RLS applies; the filters on
 * `user_id` are for clarity and an extra guard.
 */

export class EmailStoreError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "EmailStoreError";
  }
}

interface InteractionRow {
  id: string;
  application_id: string;
  sender: string;
  sender_name: string | null;
  subject: string;
  body_text: string;
  intent: string;
  draft_response: string | null;
  received_at: string;
  created_at: string;
}

const COLUMNS =
  "id, application_id, sender, sender_name, subject, body_text, intent, draft_response, received_at, created_at";

/** Table missing: migration 005 has not been run. */
const NOT_PROVISIONED = new Set(["PGRST205", "42P01"]);

const INTENTS: readonly string[] = ["SCREENING", "INTERVIEW", "REJECTION", "OTHER"];

export function toEmailInteraction(row: InteractionRow): EmailInteraction {
  return {
    id: row.id,
    applicationId: row.application_id,
    sender: row.sender,
    senderName: row.sender_name,
    subject: row.subject,
    bodyText: row.body_text,
    intent: (INTENTS.includes(row.intent) ? row.intent : "OTHER") as EmailIntent,
    draftResponse: row.draft_response,
    receivedAt: row.received_at,
    createdAt: row.created_at,
  };
}

/** Newest first. Empty when migration 005 has not been run. */
export async function listEmailInteractions(
  userId: string,
  applicationId: string,
): Promise<EmailInteraction[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("email_interactions")
    .select(COLUMNS)
    .eq("user_id", userId)
    .eq("application_id", applicationId)
    .order("received_at", { ascending: false })
    .limit(100)
    .returns<InteractionRow[]>();

  if (error) {
    if (NOT_PROVISIONED.has(error.code ?? "")) return [];
    throw new EmailStoreError("Could not load the emails.", { cause: error });
  }
  return data.map(toEmailInteraction);
}

export async function getEmailInteraction(
  userId: string,
  interactionId: string,
): Promise<EmailInteraction | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("email_interactions")
    .select(COLUMNS)
    .eq("user_id", userId)
    .eq("id", interactionId)
    .maybeSingle<InteractionRow>();

  if (error) {
    throw new EmailStoreError("Could not load the email.", { cause: error });
  }
  return data ? toEmailInteraction(data) : null;
}

/**
 * Saves the user's version of the draft. With `onlyIfEmpty`, a draft that
 * appeared in the meantime (the webhook's, or an earlier click) is kept and
 * returned instead of being overwritten.
 */
export async function saveDraftResponse(
  userId: string,
  interactionId: string,
  draft: string,
  options: { onlyIfEmpty?: boolean } = {},
): Promise<EmailInteraction | null> {
  const supabase = await createClient();
  let query = supabase
    .from("email_interactions")
    .update({ draft_response: draft })
    .eq("user_id", userId)
    .eq("id", interactionId);
  if (options.onlyIfEmpty) query = query.is("draft_response", null);

  const { data, error } = await query
    .select(COLUMNS)
    .maybeSingle<InteractionRow>();

  if (error) {
    throw new EmailStoreError("Could not save the draft.", { cause: error });
  }
  if (data) return toEmailInteraction(data);
  return options.onlyIfEmpty ? getEmailInteraction(userId, interactionId) : null;
}
