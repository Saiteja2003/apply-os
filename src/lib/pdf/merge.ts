import type {
  MasterResume,
  PatchDocument,
  ResumeDate,
} from "@/lib/types/resume";

/**
 * Projects a master resume through a patch into the flat shape the PDF
 * template renders. Pure and non-destructive: the master is only read, and
 * a patch can change wording and order but never add or remove an entry.
 */

export interface TailoredEntry {
  id: string;
  heading: string;
  subheading: string | null;
  dateRange: string | null;
  bullets: string[];
}

export interface TailoredSkillGroup {
  category: string;
  skills: string[];
}

export interface TailoredResume {
  name: string;
  headline: string | null;
  /** Email, phone, location and links, in display order. */
  contact: string[];
  summary: string;
  skills: TailoredSkillGroup[];
  experience: TailoredEntry[];
  projects: TailoredEntry[];
  education: TailoredEntry[];
  /** User-defined sections, in the order they appear in the master. */
  custom: { id: string; title: string; entries: TailoredEntry[] }[];
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function formatDate(date: ResumeDate): string {
  const [year, month] = date.split("-");
  const name = MONTHS[Number(month) - 1];
  return name ? `${name} ${year}` : year;
}

function formatRange(
  start: ResumeDate | null,
  end: ResumeDate | null,
  openEnded: boolean,
): string | null {
  const from = start ? formatDate(start) : null;
  const to = end ? formatDate(end) : openEnded ? "Present" : null;
  if (from && to) return `${from} – ${to}`;
  return from ?? to;
}

export function mergeResume(
  master: MasterResume,
  patch: PatchDocument | null,
): TailoredResume {
  const modifications = patch?.modifications ?? null;
  const overrides = new Map(
    (modifications?.experienceOverrides ?? []).map((override) => [
      override.experienceId,
      override,
    ]),
  );
  const highlighted = (modifications?.highlightedSkills ?? []).map((skill) =>
    skill.toLowerCase(),
  );
  // Highlighted skills first (in highlight order), the rest in master order.
  const rank = (skill: string) => {
    const index = highlighted.indexOf(skill.toLowerCase());
    return index === -1 ? highlighted.length : index;
  };

  const { basics } = master;

  return {
    name: basics.name,
    headline: basics.headline,
    contact: [
      basics.email,
      basics.phone,
      basics.location,
      ...basics.links.map((link) => link.url.replace(/^https?:\/\//, "")),
    ].filter((value): value is string => Boolean(value)),
    summary: modifications?.summary ?? master.summary,
    skills: master.skills.map((group) => ({
      category: group.category,
      skills: [...group.skills].sort((a, b) => rank(a) - rank(b)),
    })),
    experience: master.experience.map((entry) => {
      const override = overrides.get(entry.id);
      const adapted = new Map(
        (override?.adaptedBullets ?? []).map((bullet) => [bullet.id, bullet.text]),
      );
      const promoted = (override?.promotedBulletIds ?? []).filter((id) =>
        entry.bullets.some((bullet) => bullet.id === id),
      );
      const ordered = [
        ...promoted.map((id) => entry.bullets.find((bullet) => bullet.id === id)!),
        ...entry.bullets.filter((bullet) => !promoted.includes(bullet.id)),
      ];
      return {
        id: entry.id,
        heading: entry.title,
        subheading: [entry.company, entry.location].filter(Boolean).join(" · "),
        dateRange: formatRange(entry.startDate, entry.endDate, true),
        bullets: ordered.map((bullet) => adapted.get(bullet.id) ?? bullet.text),
      };
    }),
    projects: master.projects.map((project) => ({
      id: project.id,
      heading: project.name,
      subheading: project.technologies.join(", ") || null,
      dateRange: null,
      bullets: project.bullets.map((bullet) => bullet.text),
    })),
    education: master.education.map((entry) => ({
      id: entry.id,
      heading: [entry.degree, entry.field].filter(Boolean).join(", "),
      subheading: entry.institution,
      dateRange: formatRange(entry.startDate, entry.endDate, false),
      bullets: entry.bullets.map((bullet) => bullet.text),
    })),
    custom: master.customSections
      .filter((section) => section.entries.length > 0)
      .map((section) => ({
        id: section.id,
        title: section.title,
        entries: section.entries.map((entry) => ({
          id: entry.id,
          heading: entry.title,
          subheading: entry.subtitle,
          dateRange: entry.date,
          bullets: entry.bullets.map((bullet) => bullet.text),
        })),
      })),
  };
}
