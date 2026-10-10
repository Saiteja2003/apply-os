"use server";

import { z } from "zod";

import type { ActionResult } from "@/lib/action-result";
import {
  getMasterResumeVersion,
  listMasterResumeVersions,
  saveMasterResume,
} from "@/lib/db/master-resume";
import { describeGatewayError } from "@/lib/llm/describe-error";
import { GatewayError } from "@/lib/llm/errors";
import { getModel } from "@/lib/llm/models";
import { masterResumeSchema } from "@/lib/resume/schema";
import { importResumeFromText } from "@/lib/resume/text-import";
import type { VerbatimGuardResult } from "@/lib/resume/verbatim-guard";
import { getSessionUser } from "@/lib/supabase/server";
import type {
  MasterResume,
  MasterResumeVersion,
  MasterResumeVersionSummary,
} from "@/lib/types/resume";

const SIGNED_OUT = "You are signed out. Sign in and try again.";

const MIN_IMPORT_CHARS = 200;
const MAX_IMPORT_CHARS = 40_000;

const modelConfigSchema = z.object({
  modelId: z.string().min(1),
  fallbackModelIds: z.array(z.string()).max(5).optional(),
});

/**
 * Saves the resume as a new version. Earlier versions are never modified:
 * the table is append-only and the database rejects updates.
 */
export async function saveMasterResumeAction(
  resume: MasterResume,
): Promise<ActionResult<MasterResumeVersion>> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: SIGNED_OUT };

  const parsed = masterResumeSchema.safeParse(resume);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      error: issue
        ? `${issue.path.join(" › ")}: ${issue.message}`
        : "The resume is not valid.",
    };
  }

  try {
    return { ok: true, data: await saveMasterResume(user.id, parsed.data) };
  } catch (error) {
    console.error(error);
    return { ok: false, error: "Could not save the new version." };
  }
}

export async function listResumeVersionsAction(): Promise<
  ActionResult<MasterResumeVersionSummary[]>
> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: SIGNED_OUT };

  try {
    return { ok: true, data: await listMasterResumeVersions(user.id) };
  } catch (error) {
    console.error(error);
    return { ok: false, error: "Could not load version history." };
  }
}

/** One saved version, read-only, for inspecting an earlier snapshot. */
export async function getResumeVersionAction(
  versionId: string,
): Promise<ActionResult<MasterResumeVersion>> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: SIGNED_OUT };

  const id = z.uuid().safeParse(versionId);
  if (!id.success) return { ok: false, error: "Unknown version." };

  try {
    const version = await getMasterResumeVersion(user.id, id.data);
    return version
      ? { ok: true, data: version }
      : { ok: false, error: "That version no longer exists." };
  } catch (error) {
    console.error(error);
    return { ok: false, error: "Could not load that version." };
  }
}

/** Structures pasted resume text into a draft. Nothing is saved. */
export async function importResumeTextAction(
  text: string,
  modelConfig: { modelId: string; fallbackModelIds?: string[] },
): Promise<ActionResult<VerbatimGuardResult>> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: SIGNED_OUT };

  const source = typeof text === "string" ? text.trim() : "";
  if (source.length < MIN_IMPORT_CHARS) {
    return { ok: false, error: "Paste the full text of your resume." };
  }
  if (source.length > MAX_IMPORT_CHARS) {
    return {
      ok: false,
      error: "That text is too long (40,000 characters max).",
    };
  }

  const config = modelConfigSchema.safeParse(modelConfig);
  if (!config.success || !getModel(config.data.modelId)) {
    return { ok: false, error: "Unknown model selected." };
  }

  try {
    return {
      ok: true,
      data: await importResumeFromText({
        text: source,
        modelConfig: config.data,
      }),
    };
  } catch (error) {
    if (error instanceof GatewayError) {
      console.error("Resume import failed", error.attempts);
      return { ok: false, error: describeGatewayError(error, "Import") };
    }
    console.error(error);
    return { ok: false, error: "Import failed. Try again." };
  }
}
