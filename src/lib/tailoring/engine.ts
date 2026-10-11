import "server-only";

import { z } from "zod";

import { getByokKeys } from "@/lib/db/api-keys";
import { getApplication, saveTailoringResult } from "@/lib/db/applications";
import {
  getDailyQuotaUsage,
  getUserCredits,
  refundTailoringCredit,
  spendCreditForTailoring,
} from "@/lib/db/credits";
import {
  evaluateModelAccess,
  hasOwnKeyFor,
  ModelNotAllowedError,
  platformAllows,
  runnableModelIds,
} from "@/lib/billing/model-access";
import { getModel } from "@/lib/llm/models";
import { ensureMasterResume } from "@/lib/db/seed";
import { generateStructured, type ProviderKeys } from "@/lib/llm/gateway";
import { getSessionUser } from "@/lib/supabase/server";
import type {
  JobApplication,
  MasterResume,
  SkillGap,
} from "@/lib/types/resume";

import { applyGuard, guardProse, type GuardRejection } from "./guard";

export interface TailorModelConfig {
  /** Registry id of the model to use. */
  modelId: string;
  /** Registry ids to fall back to, in order. */
  fallbackModelIds?: string[];
}

export interface TailorApplicationInput {
  /** `applications.id` of the job to tailor for. */
  jobId: string;
  jobDescription: string;
  modelConfig: TailorModelConfig;
}

export interface TailorApplicationResult {
  application: JobApplication;
  /** Model-proposed changes the verification guard threw out. */
  rejections: GuardRejection[];
}

// Every field is required and unconstrained on purpose: strict structured
// output needs all properties present, and numeric/length constraints are
// not supported by every provider.
const tailoringSchema = z.object({
  seniority: z
    .string()
    .describe('Seniority the job targets, e.g. "Mid-level", "Senior", "Staff".'),
  keywords: z
    .array(
      z.object({
        keyword: z
          .string()
          .describe("One ATS keyword: a skill, tool or competency, as the job description writes it."),
        status: z
          .enum(["MATCHED", "ADJACENT", "MISSING"])
          .describe(
            "MATCHED: the resume demonstrates it. ADJACENT: the resume shows closely related experience but not this. MISSING: nothing comparable.",
          ),
        note: z
          .string()
          .describe("One sentence of evidence: where the resume shows it, or what the closest experience is."),
      }),
    )
    .describe("The 8 to 15 keywords an ATS would most likely screen this job on."),
  summary: z
    .string()
    .nullable()
    .describe("Professional summary rewritten for this job, or null to keep the original."),
  highlightedSkills: z
    .array(z.string())
    .describe("Up to 8 skills from the resume's skills inventory, most relevant first."),
  experienceOverrides: z.array(
    z.object({
      experienceId: z.string().describe("Id of an experience entry in the resume."),
      promotedBulletIds: z
        .array(z.string())
        .describe("Bullet ids of this experience to show first, most relevant first."),
      adaptedBullets: z
        .array(
          z.object({
            id: z.string().describe("Id of the bullet being rephrased."),
            text: z.string().describe("The rephrased bullet."),
          }),
        )
        .describe("Only the bullets worth rephrasing for this job."),
    }),
  ),
  coverLetter: z.object({
    tailoredHook: z
      .string()
      .describe("The opening sentence, specific to this company and role."),
    content: z
      .string()
      .describe(
        "The letter body: three or four short paragraphs separated by blank lines, starting with the hook and ending with the call to action. No greeting line and no signature.",
      ),
    callToAction: z.string().describe("The closing sentence that asks for the next step."),
  }),
  recruiterOutreach: z.object({
    subject: z.string().describe("Subject line, under 70 characters."),
    inmailBody: z
      .string()
      .describe("The message, under 100 words, first person, no greeting placeholder."),
    shortHook: z
      .string()
      .describe("One line of at most 200 characters, for a connection request."),
  }),
});

const SYSTEM_PROMPT = `You tailor resumes to job descriptions for applicant tracking systems (ATS).

You are given a candidate's master resume as JSON and a job description. The master resume is the complete, verified record of the candidate's career. You never add to it. You produce a patch that re-orders and re-words what is already there.

Work in this order:

1. Read the job description. Identify the seniority it targets and the 8 to 15 keywords an ATS would most likely screen on. Use the job description's own wording for each keyword.

2. Classify every keyword against the resume: MATCHED if the resume demonstrates it (the exact term or a clear equivalent), ADJACENT if the resume shows closely related experience but not this, MISSING if nothing comparable is there. Be strict. A keyword is MATCHED only if you can point to the bullet or skill that proves it.

3. Build the patch:
   - For each experience where order matters, list the bullet ids to show first, most relevant to this job first.
   - Rephrase a bullet only where it lets you use a MATCHED keyword's wording or put the relevant part first. Leave the rest alone.
   - Rewrite the summary to lead with what this job cares about, or return null if the original already does.
   - Pick the highlighted skills from the resume's own skills inventory.

4. Write the cover letter body. Three or four short paragraphs, no greeting and no signature (those are added later). Open with a hook taken from what the job description says about the company's mission, product or problem. Build the middle on two or three achievements from the resume, with their real numbers, each tied to something this job needs. Close with a concrete call to action. No boilerplate: never "I am writing to apply", "I believe I would be a great fit" or the like.

5. Write the recruiter message for LinkedIn InMail or a cold email. Under 100 words, first person. Say which parts of this role's stack the candidate has shipped with, give one concrete result from the resume, and ask for a conversation. Add a subject line and a one-line hook.

The letter and the message follow the same rules as the patch: facts about the candidate come only from the resume, facts about the company only from the job description, and an ADJACENT or MISSING keyword is never presented as something the candidate has. Sentences that break this are removed automatically.

Hard rules. A patch that breaks any of these is rejected automatically:
- Reference only experience ids and bullet ids that exist in the resume, and only pair a bullet id with the experience it belongs to.
- A rephrased bullet describes the same work as the original. Keep every number, metric, date and proper noun from the original exactly as written, and add none that are not in it.
- Never mention an ADJACENT or MISSING keyword in a rephrased bullet, the summary or the highlighted skills. The candidate has not earned it.
- Do not add responsibilities, scope, team sizes, outcomes or technologies the original bullet does not state.
- Keep each rephrased bullet to one sentence of similar length to the original.`;

/** The parts of the master resume the model needs, with their stable ids. */
function resumeForPrompt(resume: MasterResume) {
  return {
    headline: resume.basics.headline,
    summary: resume.summary,
    experience: resume.experience.map((entry) => ({
      id: entry.id,
      title: entry.title,
      company: entry.company,
      startDate: entry.startDate,
      endDate: entry.endDate ?? "present",
      bullets: entry.bullets,
    })),
    projects: resume.projects.map((project) => ({
      name: project.name,
      technologies: project.technologies,
      bullets: project.bullets.map((bullet) => bullet.text),
    })),
    education: resume.education.map((entry) => ({
      degree: entry.degree,
      field: entry.field,
      institution: entry.institution,
    })),
    skills: resume.skills.map((group) => ({
      category: group.category,
      skills: group.skills,
    })),
    // Certifications, languages and the like: evidence for keyword
    // matching. A patch cannot change them.
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

function buildPrompt(
  resume: MasterResume,
  job: Pick<JobApplication, "companyName" | "roleTitle" | "jobDescription">,
): string {
  const jobDescription = job.jobDescription;
  return `<role>
${job.roleTitle} at ${job.companyName}
</role>

<candidate_name>
${resume.basics.name}
</candidate_name>

<master_resume>
${JSON.stringify(resumeForPrompt(resume), null, 2)}
</master_resume>

<job_description>
${jobDescription}
</job_description>

Analyse the job description against the master resume, then produce the tailoring patch, the cover letter and the recruiter message.`;
}

/**
 * Tailors the signed-in user's master resume to one job and saves the
 * result on the application row. The master resume is only read.
 *
 * Throws GatewayError if no model could produce a valid patch; the
 * application row is left as it was. Before any model is called, throws
 * ModelNotAllowedError when the plan does not cover the chosen model on
 * platform keys, and InsufficientCreditsError when no credit is left.
 */
export async function tailorApplication({
  jobId,
  jobDescription,
  modelConfig,
}: TailorApplicationInput): Promise<TailorApplicationResult> {
  const user = await getSessionUser();
  if (!user) throw new Error("You are signed out. Sign in and try again.");

  const [master, byokKeys, job] = await Promise.all([
    ensureMasterResume(user.id),
    getByokKeys(user.id),
    getApplication(user.id, jobId),
  ]);
  if (!job) throw new Error("Application not found.");

  // A run on the user's own key is free and stays on their keys: it never
  // falls back to a platform key. Any other run is limited to the models the
  // plan allows on platform keys, and costs one credit, taken before the
  // model is called and given back if the run fails.
  const onOwnKey = hasOwnKeyFor(modelConfig.modelId, byokKeys);
  let fallbackModelIds: string[] | undefined;
  let charged = false;

  const model = getModel(modelConfig.modelId);
  if (!model) throw new ModelNotAllowedError();

  if (onOwnKey) {
    fallbackModelIds = modelConfig.fallbackModelIds?.filter((id) =>
      hasOwnKeyFor(id, byokKeys),
    );
  } else {
    const credits = await getUserCredits(user.id);
    const balance = credits?.balance ?? 0;
    const dailyUsage = await getDailyQuotaUsage(user.id);

    const access = evaluateModelAccess(
      model,
      byokKeys,
      balance,
      dailyUsage[model.id] ?? 0,
    );

    if (access.chargeCredit) {
      charged = await spendCreditForTailoring(
        user.id,
        jobId,
        `${job.companyName} · ${job.roleTitle} [${model.label}]`,
      );
    }

    fallbackModelIds = runnableModelIds(
      modelConfig.fallbackModelIds,
      balance,
      byokKeys,
      dailyUsage,
    );
  }

  try {
    return await runTailoring({
      userId: user.id,
      master,
      byokKeys,
      job,
      jobId,
      jobDescription,
      modelId: modelConfig.modelId,
      fallbackModelIds,
    });
  } catch (error) {
    if (charged) await refundTailoringCredit(user.id, jobId);
    throw error;
  }
}

interface TailoringRun {
  userId: string;
  master: Awaited<ReturnType<typeof ensureMasterResume>>;
  byokKeys: ProviderKeys;
  job: NonNullable<Awaited<ReturnType<typeof getApplication>>>;
  jobId: string;
  jobDescription: string;
  modelId: string;
  fallbackModelIds: string[] | undefined;
}

async function runTailoring({
  userId,
  master,
  byokKeys,
  job,
  jobId,
  jobDescription,
  modelId,
  fallbackModelIds,
}: TailoringRun): Promise<TailorApplicationResult> {
  const result = await generateStructured({
    modelId,
    fallbackModelIds,
    schema: tailoringSchema,
    schemaName: "resume_tailoring_patch",
    system: SYSTEM_PROMPT,
    prompt: buildPrompt(master.resume, { ...job, jobDescription }),
    byokKeys,
  });

  // De-duplicate keywords case-insensitively, keeping the first verdict.
  const keywords = result.data.keywords.filter(
    (entry, index, all) =>
      entry.keyword.trim() !== "" &&
      all.findIndex(
        (other) =>
          other.keyword.trim().toLowerCase() ===
          entry.keyword.trim().toLowerCase(),
      ) === index,
  );
  const matched = keywords.filter((entry) => entry.status === "MATCHED");
  const adjacent = keywords.filter((entry) => entry.status === "ADJACENT");
  const missing = keywords.filter((entry) => entry.status === "MISSING");

  const gapSkills = [...adjacent, ...missing].map((entry) => entry.keyword);
  const { modifications, rejections } = applyGuard(
    master.resume,
    {
      summary: result.data.summary,
      highlightedSkills: result.data.highlightedSkills.slice(0, 8),
      experienceOverrides: result.data.experienceOverrides,
    },
    gapSkills,
  );

  // The cover letter and recruiter message go through the same check,
  // sentence by sentence.
  const checked = (text: string, ref: string) => {
    const guarded = guardProse(text.trim(), master.resume, jobDescription, gapSkills);
    for (const sentence of guarded.removed) {
      rejections.push({
        kind: "unverified_sentence",
        ref,
        detail: sentence.length > 90 ? `${sentence.slice(0, 87)}...` : sentence,
      });
    }
    return guarded.text;
  };
  const letter = result.data.coverLetter;
  const outreach = result.data.recruiterOutreach;
  const letterBody = checked(letter.content, "cover letter");
  const messageBody = checked(outreach.inmailBody, "recruiter message");

  // Computed here rather than asked of the model: full credit for a matched
  // keyword, half for an adjacent one.
  const matchScore =
    keywords.length === 0
      ? null
      : Math.round(
          ((matched.length + adjacent.length * 0.5) / keywords.length) * 100,
        );

  const skillGaps: SkillGap[] = [
    ...missing.map((entry) => ({
      skill: entry.keyword,
      severity: "CRITICAL" as const,
      note: entry.note,
    })),
    ...adjacent.map((entry) => ({
      skill: entry.keyword,
      severity: "ADJACENT" as const,
      note: entry.note,
    })),
  ];

  const application = await saveTailoringResult(userId, jobId, {
    matchScore,
    atsKeywords: {
      matched: matched.map((entry) => entry.keyword),
      missing: [...adjacent, ...missing].map((entry) => entry.keyword),
    },
    patchDocument: { masterResumeId: master.id, modifications },
    tailoredByModel: result.modelId,
    interviewPrep: {
      generatedByModel: result.modelId,
      generatedAt: new Date().toISOString(),
      targetSeniority: result.data.seniority.trim() || null,
      matchedSkills: matched.map((entry) => entry.keyword),
      skillGaps,
      technicalQuestions: [],
      behavioralQuestions: [],
      reviewTopics: [],
    },
    coverLetter: letterBody
      ? {
          content: letterBody,
          tailoredHook: checked(letter.tailoredHook, "cover letter"),
          callToAction: checked(letter.callToAction, "cover letter"),
        }
      : null,
    recruiterOutreach: messageBody
      ? {
          subject: checked(outreach.subject, "recruiter message"),
          inmailBody: messageBody,
          shortHook: checked(outreach.shortHook, "recruiter message"),
        }
      : null,
  });

  return { application, rejections };
}
