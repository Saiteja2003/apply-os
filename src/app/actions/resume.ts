"use server";

import { z } from "zod";

import type { ActionResult } from "@/lib/action-result";
import {
  getMasterResumeHistory,
  getMasterResumeVersion,
  listMasterResumeVersions,
  restoreMasterResumeVersion,
  saveMasterResumeVersion,
} from "@/lib/db/resume";
import { describeGatewayError } from "@/lib/llm/describe-error";
import { GatewayError } from "@/lib/llm/errors";
import { getModel } from "@/lib/llm/models";
import { masterResumeSchema, parsedResumeSchema } from "@/lib/resume/schema";
import { importResumeFromText } from "@/lib/resume/text-import";
import type { VerbatimGuardResult } from "@/lib/resume/verbatim-guard";
import { getSessionUser } from "@/lib/supabase/server";
import type {
  MasterResume,
  MasterResumeVersion,
  MasterResumeVersionSummary,
  ParsedResumeData,
} from "@/lib/types/resume";

const SIGNED_OUT = "You are signed out. Sign in and try again.";

const MIN_IMPORT_CHARS = 200;
const MAX_IMPORT_CHARS = 40_000;

const modelConfigSchema = z.object({
  modelId: z.string().min(1),
  fallbackModelIds: z.array(z.string()).max(5).optional(),
});

/**
 * Saves the resume as a new version. Strictly append-only:
 * Never executes an SQL UPDATE against master_resumes.
 */
export async function saveMasterResumeVersionAction(
  updatedAST: ParsedResumeData,
): Promise<ActionResult<MasterResumeVersion>> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: SIGNED_OUT };

  const parsed = parsedResumeSchema.safeParse(updatedAST);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      error: issue
        ? `${issue.path.join(" › ")}: ${issue.message}`
        : "The resume AST is not valid.",
    };
  }

  try {
    const saved = await saveMasterResumeVersion(user.id, parsed.data);
    return { ok: true, data: saved };
  } catch (error) {
    console.error(error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not save the new version.",
    };
  }
}

/** Backwards-compatible alias for existing callers */
export const saveMasterResumeAction = saveMasterResumeVersionAction;

/**
 * Fetches all version snapshots (id, version, created_at, summary)
 * for the authenticated user ordered by version desc.
 */
export async function getMasterResumeHistoryAction(): Promise<
  ActionResult<MasterResumeVersionSummary[]>
> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: SIGNED_OUT };

  try {
    const history = await getMasterResumeHistory(user.id);
    return { ok: true, data: history };
  } catch (error) {
    console.error(error);
    return { ok: false, error: "Could not load master resume version history." };
  }
}

export const listResumeVersionsAction = getMasterResumeHistoryAction;

/** Restores a historical version by creating a new tip version matching it. */
export async function restoreMasterResumeVersionAction(
  versionNumber: number,
): Promise<ActionResult<MasterResumeVersion>> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: SIGNED_OUT };

  if (typeof versionNumber !== "number" || versionNumber <= 0) {
    return { ok: false, error: "Invalid version number." };
  }

  try {
    const restored = await restoreMasterResumeVersion(user.id, versionNumber);
    return { ok: true, data: restored };
  } catch (error) {
    console.error(error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not restore version.",
    };
  }
}

/** One saved version, read-only, for inspecting an earlier snapshot. */
export async function getResumeVersionAction(
  versionId: string,
): Promise<ActionResult<MasterResumeVersion>> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: SIGNED_OUT };

  const id = z.string().uuid().safeParse(versionId);
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

  const trimmed = text.trim();
  if (trimmed.length < MIN_IMPORT_CHARS) {
    return {
      ok: false,
      error: `Paste the full resume text (at least ${MIN_IMPORT_CHARS} characters).`,
    };
  }
  if (trimmed.length > MAX_IMPORT_CHARS) {
    return {
      ok: false,
      error: `Resume text is too long (${MAX_IMPORT_CHARS.toLocaleString()} characters max).`,
    };
  }

  const config = modelConfigSchema.safeParse(modelConfig);
  if (!config.success || !getModel(config.data.modelId)) {
    return { ok: false, error: "Unknown model selected." };
  }

  try {
    const imported = await importResumeFromText({
      text: trimmed,
      modelConfig: config.data,
    });
    return { ok: true, data: imported };
  } catch (error) {
    if (error instanceof GatewayError) {
      return { ok: false, error: describeGatewayError(error, "Resume import") };
    }
    console.error(error);
    return { ok: false, error: "Could not parse the resume. Try again." };
  }
}
