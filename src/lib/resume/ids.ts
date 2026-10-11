import type { MasterResume } from "@/lib/types/resume";

/**
 * Stable id handling for the master resume.
 *
 * An id is permanent: once a job or bullet has one it keeps it across every
 * later version, and an id that has been used is never handed to a different
 * node. Patches address nodes by id alone, so this is what keeps them valid.
 */

export const ID_PREFIX = {
  experience: "exp",
  education: "edu",
  project: "proj",
  skillGroup: "skill",
  link: "link",
  bullet: "b",
  customSection: "sec",
  customEntry: "item",
} as const;

/** Every id in the resume. */
export function collectIds(resume: MasterResume): Set<string> {
  const ids = new Set<string>();
  for (const entry of [
    ...resume.experience,
    ...resume.education,
    ...resume.projects,
  ]) {
    ids.add(entry.id);
    for (const bullet of entry.bullets) ids.add(bullet.id);
  }
  for (const section of resume.customSections) {
    ids.add(section.id);
    for (const entry of section.entries) {
      ids.add(entry.id);
      for (const bullet of entry.bullets) ids.add(bullet.id);
    }
  }
  for (const group of resume.skills) ids.add(group.id);
  for (const link of resume.basics.links) ids.add(link.id);
  return ids;
}

/** A new id that is not in `taken`. The id is added to `taken`. */
export function newId(prefix: string, taken: Set<string> = new Set()): string {
  for (;;) {
    const id = `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`;
    if (!taken.has(id)) {
      taken.add(id);
      return id;
    }
  }
}

// ---------------------------------------------------------------------------
// Imported resumes: the same shape as the master, but ids are optional
// because the source (pasted text, someone else's JSON) may not have any.
// ---------------------------------------------------------------------------

export interface ImportedBullet {
  id?: string;
  text: string;
}

export interface ImportedResume {
  basics: {
    name: string;
    headline: string | null;
    email: string | null;
    phone: string | null;
    location: string | null;
    links: { id?: string; label: string; url: string }[];
  };
  summary: string;
  experience: {
    id?: string;
    company: string;
    title: string;
    location: string | null;
    startDate: string;
    /** `null` means current role. */
    endDate: string | null;
    bullets: ImportedBullet[];
  }[];
  education: {
    id?: string;
    institution: string;
    degree: string;
    field: string | null;
    startDate: string | null;
    endDate: string | null;
    bullets: ImportedBullet[];
  }[];
  projects: {
    id?: string;
    name: string;
    url: string | null;
    technologies: string[];
    bullets: ImportedBullet[];
  }[];
  skills: { id?: string; category: string; skills: string[] }[];
  customSections: {
    id?: string;
    title: string;
    entries: {
      id?: string;
      title: string;
      subtitle: string | null;
      date: string | null;
      bullets: ImportedBullet[];
    }[];
  }[];
}

const normalize = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");

/**
 * Turns an imported resume into a master resume, giving every node an id.
 *
 * Preference order for each node: the id it arrived with, then the id of
 * the matching node in `current` (same company and title, same bullet
 * text), then a new id. New ids never collide with one `current` uses.
 */
export function toMasterResume(
  imported: ImportedResume,
  current: MasterResume | null,
): MasterResume {
  const used = new Set<string>();
  const reserved = current ? collectIds(current) : new Set<string>();

  const claim = (prefix: string, ...candidates: (string | undefined)[]) => {
    for (const candidate of candidates) {
      const id = candidate?.trim();
      if (id && !used.has(id)) {
        used.add(id);
        reserved.add(id);
        return id;
      }
    }
    const id = newId(prefix, reserved);
    used.add(id);
    return id;
  };

  const claimBullets = (
    bullets: ImportedBullet[],
    existing: { id: string; text: string }[] = [],
  ) =>
    bullets.map((bullet) => ({
      id: claim(
        ID_PREFIX.bullet,
        bullet.id,
        existing.find((entry) => normalize(entry.text) === normalize(bullet.text))?.id,
      ),
      text: bullet.text,
    }));

  return {
    schemaVersion: 1,
    basics: {
      name: imported.basics.name,
      headline: imported.basics.headline,
      email: imported.basics.email ?? "",
      phone: imported.basics.phone,
      location: imported.basics.location,
      links: imported.basics.links.map((link) => ({
        id: claim(
          ID_PREFIX.link,
          link.id,
          current?.basics.links.find((entry) => entry.url === link.url)?.id,
        ),
        label: link.label,
        url: link.url,
      })),
    },
    summary: imported.summary,
    experience: imported.experience.map((entry) => {
      const match = current?.experience.find(
        (candidate) =>
          normalize(candidate.company) === normalize(entry.company) &&
          normalize(candidate.title) === normalize(entry.title),
      );
      return {
        id: claim(ID_PREFIX.experience, entry.id, match?.id),
        company: entry.company,
        title: entry.title,
        location: entry.location,
        startDate: entry.startDate,
        endDate: entry.endDate,
        bullets: claimBullets(entry.bullets, match?.bullets),
      };
    }),
    education: imported.education.map((entry) => {
      const match = current?.education.find(
        (candidate) =>
          normalize(candidate.institution) === normalize(entry.institution) &&
          normalize(candidate.degree) === normalize(entry.degree),
      );
      return {
        id: claim(ID_PREFIX.education, entry.id, match?.id),
        institution: entry.institution,
        degree: entry.degree,
        field: entry.field,
        startDate: entry.startDate,
        endDate: entry.endDate,
        bullets: claimBullets(entry.bullets, match?.bullets),
      };
    }),
    projects: imported.projects.map((entry) => {
      const match = current?.projects.find(
        (candidate) => normalize(candidate.name) === normalize(entry.name),
      );
      return {
        id: claim(ID_PREFIX.project, entry.id, match?.id),
        name: entry.name,
        url: entry.url,
        technologies: entry.technologies,
        bullets: claimBullets(entry.bullets, match?.bullets),
      };
    }),
    skills: imported.skills.map((group) => ({
      id: claim(
        ID_PREFIX.skillGroup,
        group.id,
        current?.skills.find(
          (candidate) => normalize(candidate.category) === normalize(group.category),
        )?.id,
      ),
      category: group.category,
      skills: group.skills,
    })),
    customSections: imported.customSections.map((section) => {
      const match = current?.customSections.find(
        (candidate) => normalize(candidate.title) === normalize(section.title),
      );
      return {
        id: claim(ID_PREFIX.customSection, section.id, match?.id),
        title: section.title,
        entries: section.entries.map((entry) => {
          const entryMatch = match?.entries.find(
            (candidate) => normalize(candidate.title) === normalize(entry.title),
          );
          return {
            id: claim(ID_PREFIX.customEntry, entry.id, entryMatch?.id),
            title: entry.title,
            subtitle: entry.subtitle,
            date: entry.date,
            bullets: claimBullets(entry.bullets, entryMatch?.bullets),
          };
        }),
      };
    }),
  };
}
