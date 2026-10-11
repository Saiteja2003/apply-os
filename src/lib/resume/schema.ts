import { z } from "zod";

import type { MasterResume } from "@/lib/types/resume";

/**
 * Validation for a master resume before it is saved as a new version. Used
 * by the editor (to show what needs fixing) and by the save action (which
 * never trusts the browser).
 */

/** `YYYY`, `YYYY-MM` or `YYYY-MM-DD`. */
export const RESUME_DATE_PATTERN =
  /^\d{4}(-(0[1-9]|1[0-2])(-(0[1-9]|[12]\d|3[01]))?)?$/;

const id = z.string().trim().min(1, "Missing id.").max(64);

const required = (label: string, max: number) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required.`)
    .max(max, `${label} is too long.`);

const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max, "Too long.")
    .nullable()
    .transform((value) => value || null);

const date = z
  .string()
  .trim()
  .regex(RESUME_DATE_PATTERN, "Use YYYY-MM, or just YYYY.");

const url = z
  .string()
  .trim()
  .url("Enter a full URL, starting with https://.");

const bullets = z
  .array(z.object({ id, text: required("Bullet text", 800) }))
  .max(30, "Too many bullets.");

export const masterResumeSchema: z.ZodType<MasterResume> = z
  .object({
    schemaVersion: z.literal(1),
    basics: z.object({
      name: required("Name", 120),
      headline: optional(160),
      email: z.string().trim().email("Enter a valid email address."),
      phone: optional(40),
      location: optional(120),
      links: z
        .array(z.object({ id, label: required("Link label", 60), url }))
        .max(10, "Too many links."),
    }),
    summary: z.string().trim().max(2000, "Summary is too long."),
    experience: z
      .array(
        z.object({
          id,
          company: required("Company", 160),
          title: required("Title", 160),
          location: optional(120),
          startDate: date,
          endDate: date.nullable(),
          bullets,
        }),
      )
      .max(40, "Too many roles."),
    education: z
      .array(
        z.object({
          id,
          institution: required("Institution", 160),
          degree: required("Degree", 160),
          field: optional(160),
          startDate: date.nullable(),
          endDate: date.nullable(),
          bullets,
        }),
      )
      .max(20, "Too many education entries."),
    projects: z
      .array(
        z.object({
          id,
          name: required("Project name", 160),
          url: url.nullable(),
          technologies: z.array(required("Technology", 80)).max(40),
          bullets,
        }),
      )
      .max(30, "Too many projects."),
    skills: z
      .array(
        z.object({
          id,
          category: required("Category", 80),
          skills: z.array(required("Skill", 80)).max(80, "Too many skills."),
        }),
      )
      .max(30, "Too many skill groups."),
    customSections: z
      .array(
        z.object({
          id,
          title: required("Section title", 80),
          entries: z
            .array(
              z.object({
                id,
                title: required("Title", 200),
                subtitle: optional(200),
                date: optional(60),
                bullets,
              }),
            )
            .max(40, "Too many entries."),
        }),
      )
      .max(12, "Too many custom sections.")
      .default([]),
  })
  .superRefine((resume, context) => {
    // Ids must be unique across the whole document: patches use them alone.
    const seen = new Set<string>();
    const check = (value: string, path: (string | number)[]) => {
      if (seen.has(value)) {
        context.addIssue({
          code: "custom",
          message: `Id "${value}" is used more than once.`,
          path,
        });
      }
      seen.add(value);
    };

    for (const section of ["experience", "education", "projects"] as const) {
      resume[section].forEach((entry, index) => {
        check(entry.id, [section, index, "id"]);
        entry.bullets.forEach((bullet, bulletIndex) =>
          check(bullet.id, [section, index, "bullets", bulletIndex, "id"]),
        );
      });
    }
    resume.customSections.forEach((section, index) => {
      check(section.id, ["customSections", index, "id"]);
      section.entries.forEach((entry, entryIndex) => {
        const path = ["customSections", index, "entries", entryIndex];
        check(entry.id, [...path, "id"]);
        entry.bullets.forEach((bullet, bulletIndex) =>
          check(bullet.id, [...path, "bullets", bulletIndex, "id"]),
        );
      });
    });
    resume.skills.forEach((group, index) => check(group.id, ["skills", index, "id"]));
    resume.basics.links.forEach((link, index) =>
      check(link.id, ["basics", "links", index, "id"]),
    );
  });

export interface ResumeIssue {
  /** Dotted path into the resume, e.g. `experience.0.startDate`. */
  path: string;
  message: string;
}

export type ResumeValidation =
  | { valid: true; resume: MasterResume; issues: [] }
  | { valid: false; resume: null; issues: ResumeIssue[] };

export function validateResume(draft: MasterResume): ResumeValidation {
  const result = masterResumeSchema.safeParse(draft);
  if (result.success) return { valid: true, resume: result.data, issues: [] };
  return {
    valid: false,
    resume: null,
    issues: result.error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    })),
  };
}

export const parsedResumeSchema = masterResumeSchema;

