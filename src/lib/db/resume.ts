import "server-only";

import { createClient } from "@/lib/supabase/server";
import {
  assertStableIds,
  getMasterResume,
  getMasterResumeVersion,
  listMasterResumeVersions,
  saveMasterResume,
} from "@/lib/db/master-resume";
import { toMasterResumeVersion, type MasterResumeRow } from "@/lib/db/mappers";
import type {
  MasterResume,
  MasterResumeVersion,
  MasterResumeVersionSummary,
  ParsedResumeData,
} from "@/lib/types/resume";

export {
  assertStableIds,
  getMasterResume,
  getMasterResumeVersion,
  listMasterResumeVersions,
  saveMasterResume,
};

/**
 * Fetches all version snapshots for the authenticated user ordered by version descending,
 * including a headline or career summary preview.
 */
export async function getMasterResumeHistory(
  userId: string,
): Promise<MasterResumeVersionSummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("master_resumes")
    .select("id, version, created_at, resume")
    .eq("user_id", userId)
    .order("version", { ascending: false })
    .returns<MasterResumeRow[]>();

  if (error) {
    throw new Error(`Could not load master resume history: ${error.message}`);
  }

  return (data ?? []).map((row) => {
    const resumeObj = row.resume as MasterResume | undefined;
    const summaryText =
      resumeObj?.summary ||
      resumeObj?.basics?.headline ||
      (resumeObj?.experience?.[0]
        ? `${resumeObj.experience[0].title} at ${resumeObj.experience[0].company}`
        : "Initial snapshot");

    return {
      id: row.id,
      version: row.version,
      versionNumber: row.version,
      createdAt: row.created_at,
      summary: summaryText,
    };
  });
}

/**
 * Strictly append-only save: Inserts a new tip version row (version_number = latest + 1).
 * Never issues an SQL UPDATE statement against master_resumes.
 */
export async function saveMasterResumeVersion(
  userId: string,
  updatedAST: ParsedResumeData,
): Promise<MasterResumeVersion> {
  return saveMasterResume(userId, updatedAST);
}

/**
 * Restores a historical resume version by reading its AST and creating a brand-new
 * tip version (latest + 1) matching that historical state.
 */
export async function restoreMasterResumeVersion(
  userId: string,
  versionNumber: number,
): Promise<MasterResumeVersion> {
  const supabase = await createClient();

  const { data: targetRow, error: fetchError } = await supabase
    .from("master_resumes")
    .select("*")
    .eq("user_id", userId)
    .eq("version", versionNumber)
    .maybeSingle<MasterResumeRow>();

  if (fetchError || !targetRow) {
    throw new Error(
      `Could not find version ${versionNumber} to restore: ${fetchError?.message ?? "Not found"}`,
    );
  }

  const restoredAST = targetRow.resume as ParsedResumeData;
  return saveMasterResume(userId, restoredAST);
}
