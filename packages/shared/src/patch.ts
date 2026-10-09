/**
 * Delta patch produced by the tailoring pipeline.
 *
 * A patch can only re-order and re-word nodes that already exist in the
 * master resume version it references. It has no way to express a new
 * experience, date or bullet, which is what keeps tailoring non-destructive.
 */

export interface AdaptedBullet {
  /** Id of an existing bullet in the referenced master version. */
  id: string;
  text: string;
}

export interface ExperienceOverride {
  /** Id of an existing experience entry in the referenced master version. */
  experienceId: string;
  /** Bullets to surface first, in display order. The rest keep master order. */
  promotedBulletIds: string[];
  adaptedBullets: AdaptedBullet[];
}

export interface PatchModifications {
  summary: string | null;
  highlightedSkills: string[];
  experienceOverrides: ExperienceOverride[];
}

export interface PatchDocument {
  applicationId: string;
  /** MasterResumeVersion.id this patch was computed against. */
  masterVersionId: string;
  modifications: PatchModifications;
}
