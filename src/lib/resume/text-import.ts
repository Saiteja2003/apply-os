import "server-only";

import { z } from "zod";

import { hasOwnKeyFor } from "@/lib/billing/model-access";
import { getByokKeys } from "@/lib/db/api-keys";
import { generateStructured } from "@/lib/llm/gateway";
import { MODEL_REGISTRY } from "@/lib/llm/models";
import { getSessionUser } from "@/lib/supabase/server";
import type { TailorModelConfig } from "@/lib/tailoring/engine";

import type { ImportedResume } from "./ids";
import { applyVerbatimGuard, type VerbatimGuardResult } from "./verbatim-guard";

/**
 * Quick Import from pasted text: a model structures the text, then the
 * verbatim guard removes anything that is not in the text.
 */

const nullable = z.string().nullable();
const dateField = z
  .string()
  .describe(
    "YYYY-MM, or YYYY if the resume gives no month. Never guess a month or year.",
  );

// Required-only fields: strict structured output needs every property.
const extractionSchema = z.object({
  name: z.string().describe("The candidate's name, or an empty string."),
  headline: nullable.describe("The title line under the name, if there is one."),
  email: nullable,
  phone: nullable,
  location: nullable,
  links: z.array(
    z.object({
      label: z.string().describe('What the link is, e.g. "LinkedIn", "GitHub".'),
      url: z.string().describe("The URL exactly as written."),
    }),
  ),
  summary: z
    .string()
    .describe("The summary or profile paragraph, or an empty string if none."),
  experience: z.array(
    z.object({
      company: z.string(),
      title: z.string(),
      location: nullable,
      startDate: dateField,
      endDate: dateField
        .nullable()
        .describe("null only when the resume says the role is current."),
      bullets: z.array(z.string()),
    }),
  ),
  education: z.array(
    z.object({
      institution: z.string(),
      degree: z.string().describe('The qualification, e.g. "B.S.", "MBA".'),
      field: nullable.describe("The subject studied."),
      startDate: dateField.nullable(),
      endDate: dateField.nullable(),
      bullets: z.array(z.string()),
    }),
  ),
  projects: z.array(
    z.object({
      name: z.string(),
      url: nullable,
      technologies: z.array(z.string()),
      bullets: z.array(z.string()),
    }),
  ),
  skills: z.array(
    z.object({
      category: z
        .string()
        .describe('The heading the resume groups them under, or "Skills".'),
      skills: z.array(z.string()),
    }),
  ),
  otherSections: z
    .array(
      z.object({
        title: z.string().describe("The section heading as the resume writes it."),
        entries: z.array(
          z.object({
            title: z.string().describe("The item: certificate name, publication title, language..."),
            subtitle: nullable.describe("Issuer, venue, proficiency level and the like."),
            date: nullable.describe("The date exactly as written, if any."),
            bullets: z.array(z.string()),
          }),
        ),
      }),
    )
    .describe(
      "Every other section: certifications, publications, open source, awards, languages, volunteering.",
    ),
});

const SYSTEM_PROMPT = `You convert a resume from plain text into structured data.

You are a transcriber, not an editor. Copy every name, title, bullet and skill exactly as it is written in the text: same words, same numbers, same spelling, mistakes included. Do not fix, shorten, merge, expand or rephrase anything, and do not add anything that is not in the text.

How to structure it:
- One entry per job, in the order the resume lists them.
- One bullet per achievement line. If a job is described in a paragraph, split it into its sentences and copy each sentence as its own bullet.
- Text that was wrapped across lines is one piece of text: join the lines with a single space.
- Dates: convert to YYYY-MM. If only a year is given, use YYYY. If a job has no end date and the resume says "Present", "Current" or similar, use null.
- Skills: keep the resume's own groupings and headings. If it lists skills without headings, use one group called "Skills".
- Anything that is not the summary, a job, education, a project or a skill goes in otherSections under the resume's own heading: certifications, publications, open source, awards, languages, volunteering. One entry per item.
- If something is not in the text, leave it out: null for single values, an empty list for lists.

Your output is checked against the text automatically. Anything that is not found in it is discarded.`;

function toImported(data: z.infer<typeof extractionSchema>): ImportedResume {
  const toBullets = (bullets: string[]) =>
    bullets.map((bullet) => ({ text: bullet.trim() })).filter((bullet) => bullet.text);

  return {
    basics: {
      name: data.name.trim(),
      headline: data.headline,
      email: data.email,
      phone: data.phone,
      location: data.location,
      links: data.links.map((link) => ({
        label: link.label.trim(),
        url: link.url.trim(),
      })),
    },
    summary: data.summary.trim(),
    experience: data.experience.map((entry) => ({
      company: entry.company.trim(),
      title: entry.title.trim(),
      location: entry.location,
      startDate: entry.startDate.trim(),
      endDate: entry.endDate?.trim() ?? null,
      bullets: toBullets(entry.bullets),
    })),
    education: data.education.map((entry) => ({
      institution: entry.institution.trim(),
      degree: entry.degree.trim(),
      field: entry.field,
      startDate: entry.startDate?.trim() || null,
      endDate: entry.endDate?.trim() || null,
      bullets: toBullets(entry.bullets),
    })),
    projects: data.projects.map((project) => ({
      name: project.name.trim(),
      url: project.url?.trim() || null,
      technologies: project.technologies.map((value) => value.trim()).filter(Boolean),
      bullets: toBullets(project.bullets),
    })),
    skills: data.skills.map((group) => ({
      category: group.category.trim() || "Skills",
      skills: group.skills.map((value) => value.trim()).filter(Boolean),
    })),
    customSections: data.otherSections
      .filter((section) => section.title.trim() !== "")
      .map((section) => ({
        title: section.title.trim(),
        entries: section.entries.map((entry) => ({
          title: entry.title.trim(),
          subtitle: entry.subtitle?.trim() || null,
          date: entry.date?.trim() || null,
          bullets: toBullets(entry.bullets),
        })),
      })),
  };
}

export interface ImportResumeTextInput {
  text: string;
  modelConfig: TailorModelConfig;
}

/**
 * Structures pasted resume text. Nothing is saved: the result is a draft
 * for the editor. Throws GatewayError if no model could parse it.
 */
export async function importResumeFromText({
  text,
  modelConfig,
}: ImportResumeTextInput): Promise<VerbatimGuardResult> {
  const user = await getSessionUser();
  if (!user) throw new Error("You are signed out. Sign in and try again.");

  // Extraction is a plain structuring job, so on platform keys it always
  // runs on the default fast model, whatever model the client picked. A
  // model on the user's own key runs as chosen, and never falls back to a
  // platform key.
  const byokKeys = await getByokKeys(user.id);
  const modelId = hasOwnKeyFor(modelConfig.modelId, byokKeys)
    ? modelConfig.modelId
    : MODEL_REGISTRY.defaultModelId;
  const fallbackModelIds = modelConfig.fallbackModelIds?.filter((id) =>
    hasOwnKeyFor(id, byokKeys),
  );

  const result = await generateStructured({
    modelId,
    fallbackModelIds,
    schema: extractionSchema,
    schemaName: "resume_extraction",
    system: SYSTEM_PROMPT,
    prompt: `<resume_text>\n${text}\n</resume_text>\n\nConvert this resume into structured data.`,
    byokKeys,
  });

  return applyVerbatimGuard(text, toImported(result.data));
}
