import type {
  ExperienceOverride,
  MasterResume,
  PatchModifications,
} from "@/lib/types/resume";

/**
 * Verification guard for model-generated patches.
 *
 * The prompt asks the model not to invent anything; this code does not take
 * its word for it. Anything in a patch that cannot be traced back to the
 * master resume is dropped, and the original text is used instead:
 *
 *  - references to experience or bullet ids that do not exist
 *  - rewrites that contain a number (metric, date, count) the original
 *    bullet does not contain
 *  - rewrites that introduce a skill the model itself classified as a gap
 *  - highlighted skills that appear nowhere in the master resume
 */

export type GuardRejectionKind =
  | "unknown_experience"
  | "unknown_bullet"
  | "unearned_number"
  | "unverified_sentence"
  | "unearned_skill";

export interface GuardRejection {
  kind: GuardRejectionKind;
  /** The experience id, bullet id, skill or "summary" that was rejected. */
  ref: string;
  detail: string;
}

export interface GuardResult {
  modifications: PatchModifications;
  rejections: GuardRejection[];
}

/** Numbers with an optional unit suffix: "40k", "86%", "2M", "2019", "1.5x". */
const NUMBER_PATTERN = /\d+(?:[.,]\d+)*\s?(?:%|[kmbx]\b)?/gi;

function numbersIn(text: string): Set<string> {
  const tokens = text.match(NUMBER_PATTERN) ?? [];
  return new Set(
    tokens.map((token) => token.replace(/[\s,]/g, "").toLowerCase()),
  );
}

function containsTerm(haystack: string, term: string): boolean {
  const escaped = term.trim().toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (!escaped) return false;
  return new RegExp(`(?<![a-z0-9])${escaped}(?![a-z0-9])`).test(haystack);
}

/** Everything the candidate has actually claimed, lowercased. */
function masterCorpus(master: MasterResume): string {
  return [
    master.basics.headline ?? "",
    master.summary,
    ...master.experience.flatMap((entry) => [
      entry.title,
      entry.company,
      entry.startDate,
      entry.endDate ?? "",
      ...entry.bullets.map((bullet) => bullet.text),
    ]),
    ...master.education.flatMap((entry) => [
      entry.degree,
      entry.field ?? "",
      entry.institution,
      ...entry.bullets.map((bullet) => bullet.text),
    ]),
    ...master.projects.flatMap((project) => [
      project.name,
      ...project.technologies,
      ...project.bullets.map((bullet) => bullet.text),
    ]),
    ...master.skills.flatMap((group) => group.skills),
    ...master.customSections.flatMap((section) =>
      section.entries.flatMap((entry) => [
        entry.title,
        entry.subtitle ?? "",
        ...entry.bullets.map((bullet) => bullet.text),
      ]),
    ),
  ]
    .join("\n")
    .toLowerCase();
}

/**
 * @param gapSkills Skills the job asks for that the model classified as
 *   adjacent or missing. A rewrite may not claim any of them unless the
 *   master resume already mentions it.
 */
export function applyGuard(
  master: MasterResume,
  proposed: PatchModifications,
  gapSkills: string[],
): GuardResult {
  const rejections: GuardRejection[] = [];
  const corpus = masterCorpus(master);
  const unearnedSkills = gapSkills.filter((skill) => !containsTerm(corpus, skill));

  const unearnedSkillIn = (text: string): string | null =>
    unearnedSkills.find((skill) => containsTerm(text.toLowerCase(), skill)) ??
    null;

  const newNumberIn = (text: string, allowed: Set<string>): string | null =>
    [...numbersIn(text)].find((token) => !allowed.has(token)) ?? null;

  const experienceOverrides: ExperienceOverride[] = [];
  const seenExperiences = new Set<string>();

  for (const override of proposed.experienceOverrides) {
    const experience = master.experience.find(
      (entry) => entry.id === override.experienceId,
    );
    if (!experience || seenExperiences.has(override.experienceId)) {
      rejections.push({
        kind: "unknown_experience",
        ref: override.experienceId,
        detail: experience
          ? "Experience was listed more than once."
          : "No such experience in the master resume.",
      });
      continue;
    }
    seenExperiences.add(experience.id);

    const originals = new Map(
      experience.bullets.map((bullet) => [bullet.id, bullet.text]),
    );

    const promotedBulletIds: string[] = [];
    for (const id of override.promotedBulletIds) {
      if (!originals.has(id)) {
        rejections.push({
          kind: "unknown_bullet",
          ref: id,
          detail: `Not a bullet of ${experience.id}.`,
        });
      } else if (!promotedBulletIds.includes(id)) {
        promotedBulletIds.push(id);
      }
    }

    const adaptedBullets: ExperienceOverride["adaptedBullets"] = [];
    for (const adapted of override.adaptedBullets) {
      const original = originals.get(adapted.id);
      const text = adapted.text.trim();
      if (original === undefined) {
        rejections.push({
          kind: "unknown_bullet",
          ref: adapted.id,
          detail: `Not a bullet of ${experience.id}.`,
        });
        continue;
      }
      if (
        !text ||
        text === original ||
        adaptedBullets.some((bullet) => bullet.id === adapted.id)
      ) {
        continue;
      }

      const number = newNumberIn(text, numbersIn(original));
      if (number) {
        rejections.push({
          kind: "unearned_number",
          ref: adapted.id,
          detail: `"${number}" is not in the original bullet.`,
        });
        continue;
      }
      const skill = unearnedSkillIn(text);
      if (skill) {
        rejections.push({
          kind: "unearned_skill",
          ref: adapted.id,
          detail: `"${skill}" is not in the master resume.`,
        });
        continue;
      }
      adaptedBullets.push({ id: adapted.id, text });
    }

    if (promotedBulletIds.length > 0 || adaptedBullets.length > 0) {
      experienceOverrides.push({
        experienceId: experience.id,
        promotedBulletIds,
        adaptedBullets,
      });
    }
  }

  let summary = proposed.summary?.trim() || null;
  if (summary) {
    const number = newNumberIn(summary, numbersIn(corpus));
    const skill = unearnedSkillIn(summary);
    if (number || skill) {
      rejections.push({
        kind: number ? "unearned_number" : "unearned_skill",
        ref: "summary",
        detail: `"${number ?? skill}" is not in the master resume.`,
      });
      summary = null;
    }
  }

  const highlightedSkills: string[] = [];
  for (const skill of proposed.highlightedSkills) {
    const name = skill.trim();
    if (!name || highlightedSkills.includes(name)) continue;
    if (containsTerm(corpus, name)) {
      highlightedSkills.push(name);
    } else {
      rejections.push({
        kind: "unearned_skill",
        ref: name,
        detail: "Not in the master resume.",
      });
    }
  }

  return {
    modifications: { summary, highlightedSkills, experienceOverrides },
    rejections,
  };
}

export interface ProseGuardResult {
  text: string;
  /** Sentences that were taken out. */
  removed: string[];
}

/**
 * The same check for generated prose (cover letter, recruiter message).
 * A sentence is removed if it states a number found in neither the master
 * resume nor the job description, or claims a skill the model classified
 * as a gap. Paragraph breaks are kept.
 */
export function guardProse(
  text: string,
  master: MasterResume,
  jobDescription: string,
  gapSkills: string[],
): ProseGuardResult {
  const corpus = masterCorpus(master);
  const allowedNumbers = numbersIn(`${corpus}\n${jobDescription}`);
  const unearnedSkills = gapSkills.filter((skill) => !containsTerm(corpus, skill));
  const removed: string[] = [];

  const paragraphs = text
    .split(/\n{2,}/)
    .map((paragraph) =>
      paragraph
        .trim()
        .split(/(?<=[.!?])\s+/)
        .filter((sentence) => {
          const lower = sentence.toLowerCase();
          const invented =
            [...numbersIn(sentence)].some((token) => !allowedNumbers.has(token)) ||
            unearnedSkills.some((skill) => containsTerm(lower, skill));
          if (invented) removed.push(sentence);
          return !invented;
        })
        .join(" "),
    )
    .filter(Boolean);

  return { text: paragraphs.join("\n\n"), removed };
}
