import "server-only";

import { z } from "zod";

import {
  hasOwnKeyFor,
  platformAllows,
  runnableModelIds,
} from "@/lib/billing/model-access";
import { getByokKeys } from "@/lib/db/api-keys";
import { getApplication, saveInterviewPrep } from "@/lib/db/applications";
import { getUserCredits } from "@/lib/db/credits";
import { ensureMasterResume } from "@/lib/db/seed";
import { generateStructured } from "@/lib/llm/gateway";
import { getModel, MODEL_REGISTRY } from "@/lib/llm/models";
import { getSessionUser } from "@/lib/supabase/server";
import type {
  InterviewQuestion,
  JobApplication,
  MasterResume,
} from "@/lib/types/resume";

import type { TailorModelConfig } from "./engine";

/**
 * Second stage of the tailoring pipeline: the interview briefing.
 *
 * Tailoring has already classified the job's keywords (direct matches,
 * adjacent gaps, missing skills) and saved them on the application. This
 * stage turns that analysis into questions to rehearse and topics to review.
 */

const QUESTIONS_PER_KIND = 3;
const MAX_REVIEW_TOPICS = 6;

const questionSchema = z.object({
  question: z.string().describe("The interview question, as an interviewer would ask it."),
  rationale: z
    .string()
    .describe("One or two sentences on what the interviewer is probing and why this role asks it."),
  talkingPoints: z
    .array(z.string())
    .describe(
      "2 to 4 points the candidate can make in the answer, each grounded in a specific bullet or skill from their resume. If the question targets a gap, say how to bridge from the closest real experience.",
    ),
});

const briefingSchema = z.object({
  technicalQuestions: z
    .array(questionSchema)
    .describe("Exactly 3 architectural or technical questions based on the stack this job requires."),
  behavioralQuestions: z
    .array(questionSchema)
    .describe("Exactly 3 behavioral questions pitched at the seniority this job targets."),
  reviewTopics: z
    .array(
      z.object({
        topic: z.string().describe("A concrete topic, concept or tool to review."),
        reason: z.string().describe("One sentence on why it matters for this interview."),
      }),
    )
    .describe("4 to 6 topics to review before the first round, most important first."),
});

const SYSTEM_PROMPT = `You prepare a candidate for a specific job interview.

You are given the job description, an analysis of how the candidate's resume matches the job's keywords, and the candidate's resume. Produce a briefing with three parts.

1. Three technical questions. Base them on the stack and systems the job description actually names: architecture and design trade-offs, scaling, failure modes, how the pieces fit together. Make them specific to this company's stated stack and domain rather than generic. At least one should probe a gap from the analysis, because interviewers go there.

2. Three behavioral questions. Pitch them at the seniority the job targets: ownership and delivery for mid-level roles, technical leadership and influence for senior roles, organisation-wide impact and ambiguity for staff and above.

3. Four to six topics to review before the first round. Prioritise the gaps from the analysis, then the core of the job's stack. Name concrete topics, not broad fields.

Rules:
- Use only what the job description says about the company. Do not invent facts about its products, scale, culture or interview process.
- Talking points must come from the candidate's resume. Never suggest claiming experience, metrics or tools the resume does not show. For a gap, the honest framing is the closest real experience plus what the candidate would need to learn.
- Write questions the way an interviewer would say them, in one or two sentences.`;

function resumeForPrompt(resume: MasterResume) {
  return {
    summary: resume.summary,
    experience: resume.experience.map((entry) => ({
      title: entry.title,
      company: entry.company,
      bullets: entry.bullets.map((bullet) => bullet.text),
    })),
    projects: resume.projects.map((project) => ({
      name: project.name,
      technologies: project.technologies,
      bullets: project.bullets.map((bullet) => bullet.text),
    })),
    skills: resume.skills.flatMap((group) => group.skills),
    otherSections: resume.customSections.map((section) => ({
      title: section.title,
      entries: section.entries.map((entry) => ({
        title: entry.title,
        subtitle: entry.subtitle,
        date: entry.date,
        bullets: entry.bullets.map((bullet) => bullet.text),
      })),
    })),
  };
}

function buildPrompt(application: JobApplication, resume: MasterResume): string {
  const prep = application.interviewPrep;
  const gaps = prep?.skillGaps ?? [];
  const analysis = {
    targetSeniority: prep?.targetSeniority ?? "not determined",
    directMatches: prep?.matchedSkills ?? [],
    adjacentGaps: gaps
      .filter((gap) => gap.severity === "ADJACENT")
      .map((gap) => ({ skill: gap.skill, note: gap.note })),
    criticalMissing: gaps
      .filter((gap) => gap.severity === "CRITICAL")
      .map((gap) => ({ skill: gap.skill, note: gap.note })),
  };

  return `<role>
${application.roleTitle} at ${application.companyName}
</role>

<job_description>
${application.jobDescription}
</job_description>

<match_analysis>
${JSON.stringify(analysis, null, 2)}
</match_analysis>

<candidate_resume>
${JSON.stringify(resumeForPrompt(resume), null, 2)}
</candidate_resume>

Write the interview briefing.`;
}

function toQuestions(
  prefix: string,
  questions: z.infer<typeof questionSchema>[],
): InterviewQuestion[] {
  return questions
    .filter((entry) => entry.question.trim() !== "")
    .slice(0, QUESTIONS_PER_KIND)
    .map((entry, index) => ({
      id: `${prefix}_${index + 1}`,
      question: entry.question.trim(),
      rationale: entry.rationale.trim(),
      talkingPoints: entry.talkingPoints
        .map((point) => point.trim())
        .filter(Boolean),
    }));
}

export interface GenerateInterviewPrepInput {
  /** `applications.id`. The application must already be tailored. */
  jobId: string;
  modelConfig: TailorModelConfig;
}

/**
 * Generates the interview briefing for a tailored application and saves it
 * alongside the existing match analysis in `applications.interview_prep`.
 *
 * Throws GatewayError if no model could produce a valid briefing.
 */
export async function generateInterviewPrep({
  jobId,
  modelConfig,
}: GenerateInterviewPrepInput): Promise<JobApplication> {
  const user = await getSessionUser();
  if (!user) throw new Error("You are signed out. Sign in and try again.");

  const application = await getApplication(user.id, jobId);
  if (!application) throw new Error("Application not found.");
  if (!application.interviewPrep) {
    throw new Error("Tailor the resume for this job first.");
  }

  const [master, byokKeys] = await Promise.all([
    ensureMasterResume(user.id),
    getByokKeys(user.id),
  ]);

  const hasAnyOwnKey = Object.values(byokKeys).some((key) => key?.trim());
  if (!application.tailoredByModel && !hasAnyOwnKey) {
    throw new Error(
      "Interview prep is generated for applications that have been tailored. Tailor this job first, or add your own API key.",
    );
  }

  // On the user's own key the chosen model runs as picked. Otherwise the
  // briefing is part of the application's one credit: it runs on the model
  // that tailored it (or the default model if the plan no longer covers
  // that one) and takes no second credit.
  let modelId = modelConfig.modelId;
  let fallbackModelIds: string[] | undefined;
  if (hasOwnKeyFor(modelId, byokKeys)) {
    fallbackModelIds = modelConfig.fallbackModelIds?.filter((id) =>
      hasOwnKeyFor(id, byokKeys),
    );
  } else {
    const credits = await getUserCredits(user.id);
    const tier = credits?.tier ?? null;
    const assigned = application.tailoredByModel;
    modelId =
      assigned &&
      getModel(assigned) &&
      (hasOwnKeyFor(assigned, byokKeys) || platformAllows(tier, assigned))
        ? assigned
        : MODEL_REGISTRY.defaultModelId;
    fallbackModelIds = runnableModelIds(modelConfig.fallbackModelIds, tier, byokKeys);
  }

  const result = await generateStructured({
    modelId,
    fallbackModelIds,
    schema: briefingSchema,
    schemaName: "interview_briefing",
    system: SYSTEM_PROMPT,
    prompt: buildPrompt(application, master.resume),
    byokKeys,
  });

  return saveInterviewPrep(user.id, jobId, {
    ...application.interviewPrep,
    generatedByModel: result.modelId,
    generatedAt: new Date().toISOString(),
    technicalQuestions: toQuestions("tq", result.data.technicalQuestions),
    behavioralQuestions: toQuestions("bq", result.data.behavioralQuestions),
    reviewTopics: result.data.reviewTopics
      .filter((entry) => entry.topic.trim() !== "")
      .slice(0, MAX_REVIEW_TOPICS)
      .map((entry) => ({
        topic: entry.topic.trim(),
        reason: entry.reason.trim(),
      })),
  });
}
