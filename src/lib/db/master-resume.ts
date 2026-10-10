import "server-only";

import { createClient } from "@/lib/supabase/server";
import type {
  MasterResume,
  MasterResumeVersion,
  MasterResumeVersionSummary,
} from "@/lib/types/resume";

import { toMasterResumeVersion, type MasterResumeRow } from "./mappers";

const UNIQUE_VIOLATION = "23505";
const MAX_INSERT_TRIES = 3;

/**
 * Every entry and bullet must carry a non-empty id that is unique across
 * the whole resume, because patches address nodes by id alone.
 */
export function assertStableIds(resume: MasterResume): void {
  const seen = new Set<string>();
  const check = (id: string, where: string) => {
    if (!id.trim()) throw new Error(`Master resume has an empty id in ${where}.`);
    if (seen.has(id)) throw new Error(`Master resume id "${id}" is not unique.`);
    seen.add(id);
  };

  for (const entry of [
    ...resume.experience,
    ...resume.education,
    ...resume.projects,
  ]) {
    check(entry.id, "an entry");
    for (const bullet of entry.bullets) check(bullet.id, `entry "${entry.id}"`);
  }
  for (const section of resume.customSections) {
    check(section.id, "custom sections");
    for (const entry of section.entries) {
      check(entry.id, `section "${section.id}"`);
      for (const bullet of entry.bullets) check(bullet.id, `entry "${entry.id}"`);
    }
  }
  for (const group of resume.skills) check(group.id, "skills");
  for (const link of resume.basics.links) check(link.id, "links");
}

/** The latest master resume version for the user, or `null` if none exists. */
export async function getMasterResume(
  userId: string,
): Promise<MasterResumeVersion | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("master_resumes")
    .select("*")
    .eq("user_id", userId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle<MasterResumeRow>();

  if (error) throw new Error(`Could not load master resume: ${error.message}`);
  return data ? toMasterResumeVersion(data) : null;
}

/** Every saved version, newest first, without the resume content. */
export async function listMasterResumeVersions(
  userId: string,
): Promise<MasterResumeVersionSummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("master_resumes")
    .select("id, version, created_at")
    .eq("user_id", userId)
    .order("version", { ascending: false })
    .returns<Pick<MasterResumeRow, "id" | "version" | "created_at">[]>();

  if (error) throw new Error(`Could not load version history: ${error.message}`);
  return data.map((row) => ({
    id: row.id,
    version: row.version,
    createdAt: row.created_at,
  }));
}

/** One specific version, e.g. to inspect an earlier snapshot. */
export async function getMasterResumeVersion(
  userId: string,
  versionId: string,
): Promise<MasterResumeVersion | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("master_resumes")
    .select("*")
    .eq("user_id", userId)
    .eq("id", versionId)
    .maybeSingle<MasterResumeRow>();

  if (error) throw new Error(`Could not load that version: ${error.message}`);
  return data ? toMasterResumeVersion(data) : null;
}

/**
 * Appends a new master resume version. Existing versions are never touched:
 * the database numbers the row (previous version + 1) and rejects updates.
 */
export async function saveMasterResume(
  userId: string,
  resumeData: MasterResume,
): Promise<MasterResumeVersion> {
  assertStableIds(resumeData);
  const supabase = await createClient();

  for (let attempt = 1; ; attempt++) {
    const { data, error } = await supabase
      .from("master_resumes")
      .insert({ user_id: userId, resume: resumeData })
      .select("*")
      .single<MasterResumeRow>();

    if (data) return toMasterResumeVersion(data);
    // Two concurrent saves computed the same version number: try again.
    if (error.code === UNIQUE_VIOLATION && attempt < MAX_INSERT_TRIES) continue;
    throw new Error(`Could not save master resume: ${error.message}`);
  }
}
