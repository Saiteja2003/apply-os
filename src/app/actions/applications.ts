"use server";

import { z } from "zod";

import type { ActionResult } from "@/lib/action-result";
import {
  AssetsNotProvisionedError,
  createApplication,
  getApplication,
  saveCoverLetter,
  updateApplicationStatus,
} from "@/lib/db/applications";
import { ModelNotAllowedError } from "@/lib/billing/model-access";
import { InsufficientCreditsError } from "@/lib/db/credits";
import { describeGatewayError } from "@/lib/llm/describe-error";
import { GatewayError } from "@/lib/llm/errors";
import { getModel } from "@/lib/llm/models";
import { getSessionUser } from "@/lib/supabase/server";
import { tailorApplication } from "@/lib/tailoring/engine";
import { generateInterviewPrep } from "@/lib/tailoring/prep";
import { INSUFFICIENT_CREDITS, MODEL_NOT_ALLOWED } from "@/lib/types/billing";
import { APPLICATION_STATUSES, type JobApplication } from "@/lib/types/resume";

const SIGNED_OUT = "You are signed out. Sign in and try again.";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => value || null);

const newApplicationSchema = z.object({
  companyName: z.string().trim().min(1, "Company is required.").max(200),
  roleTitle: z.string().trim().min(1, "Role is required.").max(200),
  location: optionalText(200),
  jobUrl: optionalText(2000).refine(
    (value) => value === null || /^https?:\/\//i.test(value),
    "Job link must start with http:// or https://.",
  ),
  jobDescription: z
    .string()
    .trim()
    .min(80, "Paste the full job description (at least a few sentences).")
    .max(30_000, "Job description is too long (30,000 characters max)."),
});

export type NewApplicationInput = z.input<typeof newApplicationSchema>;

const modelConfigSchema = z.object({
  modelId: z.string().min(1),
  fallbackModelIds: z.array(z.string()).max(5).optional(),
});

function failure(error: unknown, fallback: string): { ok: false; error: string } {
  console.error(error);
  return { ok: false, error: error instanceof Error ? error.message : fallback };
}

export async function createApplicationAction(
  input: NewApplicationInput,
): Promise<ActionResult<JobApplication>> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: SIGNED_OUT };

  const parsed = newApplicationSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  try {
    return { ok: true, data: await createApplication(user.id, parsed.data) };
  } catch (error) {
    return failure(error, "Could not save the application.");
  }
}

export interface TailorActionData {
  application: JobApplication;
  /** How many model-proposed changes the verification guard discarded. */
  rejectedChanges: number;
}

export async function tailorApplicationAction(
  applicationId: string,
  modelConfig: { modelId: string; fallbackModelIds?: string[] },
): Promise<ActionResult<TailorActionData>> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: SIGNED_OUT };

  const config = modelConfigSchema.safeParse(modelConfig);
  if (!config.success || !getModel(config.data.modelId)) {
    return { ok: false, error: "Unknown model selected." };
  }

  try {
    const application = await getApplication(user.id, applicationId);
    if (!application) return { ok: false, error: "Application not found." };

    const result = await tailorApplication({
      jobId: application.id,
      jobDescription: application.jobDescription,
      modelConfig: config.data,
    });
    return {
      ok: true,
      data: {
        application: result.application,
        rejectedChanges: result.rejections.length,
      },
    };
  } catch (error) {
    if (error instanceof GatewayError) {
      console.error("Tailoring failed", error.attempts);
      return { ok: false, error: describeGatewayError(error, "Tailoring") };
    }
    if (error instanceof InsufficientCreditsError) {
      return { ok: false, error: error.message, code: INSUFFICIENT_CREDITS };
    }
    if (error instanceof ModelNotAllowedError) {
      return { ok: false, error: error.message, code: MODEL_NOT_ALLOWED };
    }
    return failure(error, "Tailoring failed.");
  }
}

export async function generateInterviewPrepAction(
  applicationId: string,
  modelConfig: { modelId: string; fallbackModelIds?: string[] },
): Promise<ActionResult<JobApplication>> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: SIGNED_OUT };

  const config = modelConfigSchema.safeParse(modelConfig);
  if (!config.success || !getModel(config.data.modelId)) {
    return { ok: false, error: "Unknown model selected." };
  }

  try {
    return {
      ok: true,
      data: await generateInterviewPrep({
        jobId: applicationId,
        modelConfig: config.data,
      }),
    };
  } catch (error) {
    if (error instanceof GatewayError) {
      console.error("Interview prep failed", error.attempts);
      return { ok: false, error: describeGatewayError(error, "Interview prep") };
    }
    return failure(error, "Interview prep failed.");
  }
}

/** Saves the user's edits to the cover letter body. */
export async function updateCoverLetterAction(
  applicationId: string,
  content: string,
): Promise<ActionResult<JobApplication>> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: SIGNED_OUT };

  const body = z
    .string()
    .trim()
    .min(1, "The cover letter cannot be empty.")
    .max(8000, "The cover letter is too long (8,000 characters max).")
    .safeParse(content);
  if (!body.success) {
    return { ok: false, error: body.error.issues[0]?.message ?? "Invalid input." };
  }

  try {
    const application = await getApplication(user.id, applicationId);
    if (!application) return { ok: false, error: "Application not found." };

    return {
      ok: true,
      data: await saveCoverLetter(user.id, applicationId, {
        tailoredHook: application.coverLetter?.tailoredHook ?? "",
        callToAction: application.coverLetter?.callToAction ?? "",
        content: body.data,
      }),
    };
  } catch (error) {
    if (error instanceof AssetsNotProvisionedError) {
      return {
        ok: false,
        error:
          "Cover letters need a one-time database migration. Run supabase/migrations/003_application_assets.sql in the Supabase SQL editor.",
      };
    }
    return failure(error, "Could not save the cover letter.");
  }
}

export async function updateApplicationStatusAction(
  applicationId: string,
  status: string,
): Promise<ActionResult<JobApplication>> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: SIGNED_OUT };

  const parsed = z.enum(APPLICATION_STATUSES).safeParse(status);
  if (!parsed.success) return { ok: false, error: "Unknown status." };

  try {
    return {
      ok: true,
      data: await updateApplicationStatus(user.id, applicationId, parsed.data),
    };
  } catch (error) {
    return failure(error, "Could not update the status.");
  }
}
