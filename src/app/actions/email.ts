"use server";

import { z } from "zod";

import type { ActionResult } from "@/lib/action-result";
import { getByokKeys } from "@/lib/db/api-keys";
import { getApplication } from "@/lib/db/applications";
import { getUserCredits } from "@/lib/db/credits";
import {
  EmailStoreError,
  getEmailInteraction,
  listEmailInteractions,
  saveDraftResponse,
} from "@/lib/db/email-interactions";
import { ensureMasterResume } from "@/lib/db/seed";
import { draftReply, pickDraftModel } from "@/lib/inbound/draft-reply";
import { describeGatewayError } from "@/lib/llm/describe-error";
import { GatewayError } from "@/lib/llm/errors";
import { getSessionUser } from "@/lib/supabase/server";
import type { EmailInteraction } from "@/lib/types/email";

const SIGNED_OUT = "You are signed out. Sign in and try again.";

const idSchema = z.uuid("That is not a valid id.");
const draftSchema = z
  .string()
  .trim()
  .min(1, "The reply cannot be empty.")
  .max(10_000, "The reply is too long (10,000 characters max).");

function failure(error: unknown, fallback: string): { ok: false; error: string } {
  console.error(error);
  return {
    ok: false,
    error: error instanceof EmailStoreError ? error.message : fallback,
  };
}

/** Recruiter emails for one application, newest first. */
export async function listEmailInteractionsAction(
  applicationId: string,
): Promise<ActionResult<EmailInteraction[]>> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: SIGNED_OUT };

  const id = idSchema.safeParse(applicationId);
  if (!id.success) return { ok: false, error: "Application not found." };

  try {
    return { ok: true, data: await listEmailInteractions(user.id, id.data) };
  } catch (error) {
    return failure(error, "Could not load the emails.");
  }
}

/** Saves the user's edits to a draft reply. Never sends anything. */
export async function updateDraftResponseAction(
  interactionId: string,
  draftResponse: string,
): Promise<ActionResult<EmailInteraction>> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: SIGNED_OUT };

  const id = idSchema.safeParse(interactionId);
  if (!id.success) return { ok: false, error: "Email not found." };
  const draft = draftSchema.safeParse(draftResponse);
  if (!draft.success) {
    return { ok: false, error: draft.error.issues[0]?.message ?? "Invalid reply." };
  }

  try {
    const saved = await saveDraftResponse(user.id, id.data, draft.data);
    return saved
      ? { ok: true, data: saved }
      : { ok: false, error: "Email not found." };
  } catch (error) {
    return failure(error, "Could not save the reply.");
  }
}

/**
 * Drafts a reply for an email that has none yet, on the user's own key if
 * they have one for the model. Costs no credit. An existing draft is never
 * replaced.
 */
export async function generateDraftResponseAction(
  interactionId: string,
): Promise<ActionResult<EmailInteraction>> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: SIGNED_OUT };

  const id = idSchema.safeParse(interactionId);
  if (!id.success) return { ok: false, error: "Email not found." };

  try {
    const interaction = await getEmailInteraction(user.id, id.data);
    if (!interaction) return { ok: false, error: "Email not found." };
    if (interaction.draftResponse?.trim()) return { ok: true, data: interaction };

    const application = await getApplication(user.id, interaction.applicationId);
    if (!application) return { ok: false, error: "Application not found." };

    const [master, byokKeys, credits] = await Promise.all([
      ensureMasterResume(user.id),
      getByokKeys(user.id),
      getUserCredits(user.id),
    ]);

    const drafted = await draftReply({
      resume: master.resume,
      companyName: application.companyName,
      roleTitle: application.roleTitle,
      email: {
        from: interaction.sender,
        fromName: interaction.senderName,
        subject: interaction.subject,
        text: interaction.bodyText,
      },
      intent: interaction.intent,
      gapSkills: (application.interviewPrep?.skillGaps ?? []).map(
        (gap) => gap.skill,
      ),
      model: pickDraftModel({
        tier: credits?.tier ?? null,
        byokKeys,
        assignedModelId: application.tailoredByModel,
      }),
      byokKeys,
    });

    const saved = await saveDraftResponse(user.id, interaction.id, drafted.text, {
      onlyIfEmpty: true,
    });
    return saved
      ? { ok: true, data: saved }
      : { ok: false, error: "Email not found." };
  } catch (error) {
    if (error instanceof GatewayError) {
      console.error("Reply drafting failed", error.attempts);
      return { ok: false, error: describeGatewayError(error, "Drafting") };
    }
    return failure(error, "Could not draft a reply. Try again.");
  }
}
