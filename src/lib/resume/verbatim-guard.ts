import type { ImportedResume } from "./ids";

/**
 * Verification guard for resumes parsed from pasted text by a model.
 *
 * The model is asked to copy, not write. This checks that it did: every
 * name, title, bullet and skill it returned must appear in the text the
 * user pasted. Anything that does not is left out and reported, so nothing
 * the user did not write can reach their master resume.
 */

/** Letters and digits only, so line wraps, bullets and punctuation don't matter. */
const squash = (value: string) =>
  value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

export interface VerbatimGuardResult {
  resume: ImportedResume;
  /** Human-readable labels of everything that was left out. */
  dropped: string[];
}

const preview = (value: string) =>
  value.length > 60 ? `${value.slice(0, 57)}…` : value;

export function applyVerbatimGuard(
  sourceText: string,
  parsed: ImportedResume,
): VerbatimGuardResult {
  const source = squash(sourceText);
  const dropped: string[] = [];

  const found = (value: string | null | undefined): value is string => {
    const needle = squash(value ?? "");
    return needle !== "" && source.includes(needle);
  };
  /** A date is trusted only if its year is somewhere in the text. */
  const dateFound = (value: string | null): boolean =>
    value !== null && source.includes(value.slice(0, 4));

  const keep = (value: string | null, label: string): string | null => {
    if (value === null || value.trim() === "") return null;
    if (found(value)) return value;
    dropped.push(`${label}: ${preview(value)}`);
    return null;
  };

  const keepBullets = (bullets: ImportedResume["experience"][number]["bullets"]) =>
    bullets.filter((bullet) => {
      if (found(bullet.text)) return true;
      dropped.push(`Bullet: ${preview(bullet.text)}`);
      return false;
    });

  /**
   * Unverifiable start dates become "" (the editor asks for them).
   * Unverifiable end dates do too, never `null`: null would claim the
   * role is current.
   */
  const keepDate = (value: string | null, label: string): string | null => {
    if (value === null) return null;
    if (dateFound(value)) return value;
    dropped.push(`${label}: ${value}`);
    return "";
  };

  const basics = parsed.basics;

  return {
    dropped,
    resume: {
      basics: {
        name: keep(basics.name, "Name") ?? "",
        headline: keep(basics.headline, "Headline"),
        email: keep(basics.email, "Email"),
        phone: keep(basics.phone, "Phone"),
        location: keep(basics.location, "Location"),
        links: basics.links.filter((link) => {
          if (found(link.url.replace(/^https?:\/\/(www\.)?/i, ""))) return true;
          dropped.push(`Link: ${preview(link.url)}`);
          return false;
        }),
      },
      summary: keep(parsed.summary, "Summary") ?? "",
      experience: parsed.experience.flatMap((entry) => {
        if (!found(entry.company) || !found(entry.title)) {
          dropped.push(`Role: ${preview(`${entry.title} at ${entry.company}`)}`);
          return [];
        }
        return [
          {
            ...entry,
            location: keep(entry.location, "Location"),
            startDate: keepDate(entry.startDate, "Start date") ?? "",
            endDate: keepDate(entry.endDate, "End date"),
            bullets: keepBullets(entry.bullets),
          },
        ];
      }),
      education: parsed.education.flatMap((entry) => {
        if (!found(entry.institution)) {
          dropped.push(`Education: ${preview(entry.institution)}`);
          return [];
        }
        return [
          {
            ...entry,
            degree: keep(entry.degree, "Degree") ?? "",
            field: keep(entry.field, "Field of study"),
            startDate: dateFound(entry.startDate) ? entry.startDate : null,
            endDate: dateFound(entry.endDate) ? entry.endDate : null,
            bullets: keepBullets(entry.bullets),
          },
        ];
      }),
      projects: parsed.projects.flatMap((project) => {
        if (!found(project.name)) {
          dropped.push(`Project: ${preview(project.name)}`);
          return [];
        }
        return [
          {
            ...project,
            url:
              project.url &&
              found(project.url.replace(/^https?:\/\/(www\.)?/i, ""))
                ? project.url
                : null,
            technologies: project.technologies.filter(found),
            bullets: keepBullets(project.bullets),
          },
        ];
      }),
      // Category names are labels, not claims, so only the skills are checked.
      skills: parsed.skills.flatMap((group) => {
        const skills = group.skills.filter((skill) => {
          if (found(skill)) return true;
          dropped.push(`Skill: ${preview(skill)}`);
          return false;
        });
        return skills.length > 0 ? [{ ...group, skills }] : [];
      }),
      // Section headings are labels too; every entry under them is checked.
      customSections: parsed.customSections.flatMap((section) => {
        const entries = section.entries.flatMap((entry) => {
          if (!found(entry.title)) {
            dropped.push(`${section.title}: ${preview(entry.title)}`);
            return [];
          }
          return [
            {
              ...entry,
              subtitle: keep(entry.subtitle, section.title),
              date: found(entry.date) ? entry.date : null,
              bullets: keepBullets(entry.bullets),
            },
          ];
        });
        return entries.length > 0 ? [{ ...section, entries }] : [];
      }),
    },
  };
}
