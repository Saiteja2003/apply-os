import { z } from "zod";

import type { ImportedResume } from "./ids";

/**
 * Reads a resume from JSON. Two formats are understood:
 *
 *  - ApplyOS's own master resume shape (optionally wrapped as a saved
 *    version, `{ "resume": { ... } }`). Ids in the file are kept.
 *  - The JSON Resume standard (jsonresume.org): `basics`, `work`,
 *    `education`, `skills`, `projects`.
 *
 * The result still goes through the editor's validation before it can be
 * saved, so this is deliberately lenient about missing fields.
 */

/** An error whose message is safe to show to the user. */
export class ResumeImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResumeImportError";
  }
}

const text = z.string().trim();
const textOrEmpty = z
  .string()
  .trim()
  .nullish()
  .transform((value) => value ?? "");
const maybe = z
  .string()
  .trim()
  .nullish()
  .transform((value) => value || null);
const optionalId = z
  .string()
  .trim()
  .nullish()
  .transform((value) => value || undefined);
const stringList = z
  .array(text)
  .nullish()
  .transform((list) => (list ?? []).filter(Boolean));

const bulletList = z
  .array(z.union([text, z.object({ id: optionalId, text })]))
  .nullish()
  .transform((list) =>
    (list ?? [])
      .map((bullet) => (typeof bullet === "string" ? { text: bullet } : bullet))
      .filter((bullet) => bullet.text !== ""),
  );

const list = <T extends z.ZodType>(item: T) =>
  z
    .array(item)
    .nullish()
    .transform((entries) => entries ?? []);

const applyOsSchema = z.object({
  basics: z.object({
    name: textOrEmpty,
    headline: maybe,
    email: maybe,
    phone: maybe,
    location: maybe,
    links: list(z.object({ id: optionalId, label: textOrEmpty, url: text })),
  }),
  summary: textOrEmpty,
  experience: list(
    z.object({
      id: optionalId,
      company: textOrEmpty,
      title: textOrEmpty,
      location: maybe,
      startDate: textOrEmpty,
      endDate: maybe,
      bullets: bulletList,
    }),
  ),
  education: list(
    z.object({
      id: optionalId,
      institution: textOrEmpty,
      degree: textOrEmpty,
      field: maybe,
      startDate: maybe,
      endDate: maybe,
      bullets: bulletList,
    }),
  ),
  projects: list(
    z.object({
      id: optionalId,
      name: textOrEmpty,
      url: maybe,
      technologies: stringList,
      bullets: bulletList,
    }),
  ),
  skills: list(
    z.object({ id: optionalId, category: textOrEmpty, skills: stringList }),
  ),
  customSections: list(
    z.object({
      id: optionalId,
      title: textOrEmpty,
      entries: list(
        z.object({
          id: optionalId,
          title: textOrEmpty,
          subtitle: maybe,
          date: maybe,
          bullets: bulletList,
        }),
      ),
    }),
  ),
});

const jsonResumeSchema = z.object({
  basics: z
    .object({
      name: textOrEmpty,
      label: maybe,
      email: maybe,
      phone: maybe,
      url: maybe,
      summary: maybe,
      location: z.object({ city: maybe, region: maybe }).nullish(),
      profiles: list(z.object({ network: maybe, url: maybe })),
    })
    .nullish(),
  work: list(
    z.object({
      name: maybe,
      company: maybe,
      position: maybe,
      location: maybe,
      startDate: maybe,
      endDate: maybe,
      summary: maybe,
      highlights: stringList,
    }),
  ),
  education: list(
    z.object({
      institution: maybe,
      area: maybe,
      studyType: maybe,
      startDate: maybe,
      endDate: maybe,
    }),
  ),
  skills: list(z.object({ name: maybe, keywords: stringList })),
  projects: list(
    z.object({
      name: maybe,
      url: maybe,
      description: maybe,
      keywords: stringList,
      highlights: stringList,
    }),
  ),
  certificates: list(z.object({ name: maybe, issuer: maybe, date: maybe })),
  publications: list(
    z.object({ name: maybe, publisher: maybe, releaseDate: maybe, summary: maybe }),
  ),
  awards: list(
    z.object({ title: maybe, awarder: maybe, date: maybe, summary: maybe }),
  ),
  languages: list(z.object({ language: maybe, fluency: maybe })),
});

type CustomEntries = ImportedResume["customSections"][number]["entries"];

function fromJsonResume(source: z.infer<typeof jsonResumeSchema>): ImportedResume {
  const basics = source.basics;
  const toBullets = (text: string | null) => (text ? [{ text }] : []);
  const customSection = (title: string, entries: CustomEntries) =>
    entries.length > 0 ? [{ title, entries }] : [];
  const withoutKeywords = source.skills
    .filter((skill) => skill.keywords.length === 0 && skill.name)
    .map((skill) => skill.name!);

  return {
    basics: {
      name: basics?.name ?? "",
      headline: basics?.label ?? null,
      email: basics?.email ?? null,
      phone: basics?.phone ?? null,
      location:
        [basics?.location?.city, basics?.location?.region]
          .filter(Boolean)
          .join(", ") || null,
      links: [
        ...(basics?.url ? [{ label: "Website", url: basics.url }] : []),
        ...(basics?.profiles ?? []).flatMap((profile) =>
          profile.url
            ? [{ label: profile.network ?? "Profile", url: profile.url }]
            : [],
        ),
      ],
    },
    summary: basics?.summary ?? "",
    experience: source.work.map((job) => ({
      company: job.name ?? job.company ?? "",
      title: job.position ?? "",
      location: job.location,
      startDate: job.startDate ?? "",
      // JSON Resume leaves endDate out for a current role.
      endDate: job.endDate,
      bullets: (job.highlights.length > 0
        ? job.highlights
        : job.summary
          ? [job.summary]
          : []
      ).map((highlight) => ({ text: highlight })),
    })),
    education: source.education.map((entry) => ({
      institution: entry.institution ?? "",
      degree: entry.studyType ?? "",
      field: entry.area,
      startDate: entry.startDate,
      endDate: entry.endDate,
      bullets: [],
    })),
    projects: source.projects.map((project) => ({
      name: project.name ?? "",
      url: project.url,
      technologies: project.keywords,
      bullets: (project.highlights.length > 0
        ? project.highlights
        : project.description
          ? [project.description]
          : []
      ).map((highlight) => ({ text: highlight })),
    })),
    skills: [
      ...source.skills
        .filter((skill) => skill.keywords.length > 0)
        .map((skill) => ({
          category: skill.name ?? "Skills",
          skills: skill.keywords,
        })),
      ...(withoutKeywords.length > 0
        ? [{ category: "Skills", skills: withoutKeywords }]
        : []),
    ],
    customSections: [
      ...customSection(
        "Certifications",
        source.certificates.flatMap((entry) =>
          entry.name
            ? [{ title: entry.name, subtitle: entry.issuer, date: entry.date, bullets: [] }]
            : [],
        ),
      ),
      ...customSection(
        "Publications",
        source.publications.flatMap((entry) =>
          entry.name
            ? [
                {
                  title: entry.name,
                  subtitle: entry.publisher,
                  date: entry.releaseDate,
                  bullets: toBullets(entry.summary),
                },
              ]
            : [],
        ),
      ),
      ...customSection(
        "Awards",
        source.awards.flatMap((entry) =>
          entry.title
            ? [
                {
                  title: entry.title,
                  subtitle: entry.awarder,
                  date: entry.date,
                  bullets: toBullets(entry.summary),
                },
              ]
            : [],
        ),
      ),
      ...customSection(
        "Languages",
        source.languages.flatMap((entry) =>
          entry.language
            ? [{ title: entry.language, subtitle: entry.fluency, date: null, bullets: [] }]
            : [],
        ),
      ),
    ],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const UNRECOGNISED =
  "This JSON does not look like a resume. Use the Honing format or the JSON Resume standard (jsonresume.org).";

export function parseResumeJson(source: string): ImportedResume {
  let json: unknown;
  try {
    json = JSON.parse(source);
  } catch {
    throw new ResumeImportError("That is not valid JSON.");
  }
  if (!isRecord(json)) throw new ResumeImportError(UNRECOGNISED);

  // A saved version wraps the resume: { id, version, resume: { ... } }.
  const root = isRecord(json.resume) ? json.resume : json;

  const isJsonResume =
    "work" in root ||
    (isRecord(root.basics) &&
      ("profiles" in root.basics || "label" in root.basics));

  let resume: ImportedResume;
  if (isJsonResume) {
    const parsed = jsonResumeSchema.safeParse(root);
    if (!parsed.success) throw new ResumeImportError(UNRECOGNISED);
    resume = fromJsonResume(parsed.data);
  } else {
    const parsed = applyOsSchema.safeParse(root);
    if (!parsed.success) throw new ResumeImportError(UNRECOGNISED);
    resume = parsed.data;
  }

  if (!resume.basics.name && resume.experience.length === 0) {
    throw new ResumeImportError(
      "No name or work history was found in this file.",
    );
  }
  return resume;
}
