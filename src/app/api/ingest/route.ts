import { after, NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { createApplication } from "@/lib/db/applications";
import { getModel, MODEL_REGISTRY } from "@/lib/llm/models";
import { getSessionUser } from "@/lib/supabase/server";
import { tailorApplication } from "@/lib/tailoring/engine";

/**
 * Universal job ingest: saves a job to the pipeline and, unless told not
 * to, tailors the resume for it after the response has been sent.
 *
 * Auth is the signed-in session cookie. The clipper extension sends it
 * because it holds host permission for this origin; the `/clip` page sends
 * it because it is same-origin.
 */

// Tailoring continues after the response and waits on an LLM.
export const maxDuration = 300;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((value) => value || null);

const ingestSchema = z.object({
  company: z.string().trim().min(1, "company is required").max(200),
  role: z.string().trim().min(1, "role is required").max(200),
  location: optionalText(200),
  url: optionalText(2000).refine(
    (value) => value === null || /^https?:\/\//i.test(value),
    "url must start with http:// or https://",
  ),
  jobDescription: z
    .string()
    .trim()
    .min(80, "jobDescription is too short to be a job posting")
    .max(30_000, "jobDescription is too long (30,000 characters max)"),
  autoTailor: z.boolean().default(true),
  /** True when the application has already been submitted. */
  applied: z.boolean().default(false),
  /** Registry id of the model to tailor with. Defaults to the app default. */
  modelId: z.string().nullish(),
});

const EXTENSION_ORIGIN = /^(chrome|moz|safari-web)-extension:\/\/[^/\s]+$/;

/**
 * Extension origins accepted besides this site. Any extension is accepted
 * unless CLIPPER_EXTENSION_ORIGINS (comma-separated, e.g.
 * `chrome-extension://<id>`) pins the clipper. Either way the session cookie
 * is what authenticates, and the browser only sends it to an extension that
 * holds host permission for this site.
 */
function extensionOriginAllowed(origin: string): boolean {
  if (!EXTENSION_ORIGIN.test(origin)) return false;
  const pinned = (process.env.CLIPPER_EXTENSION_ORIGINS ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  return pinned.length === 0 || pinned.includes(origin);
}

/** Same-origin pages and browser extensions only: no third-party sites. */
function originAllowed(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  return (
    origin === null ||
    origin === request.nextUrl.origin ||
    extensionOriginAllowed(origin)
  );
}

/** CORS for an extension caller; same-origin callers need none. */
function corsHeaders(request: NextRequest): Record<string, string> {
  const origin = request.headers.get("origin");
  if (!origin || origin === request.nextUrl.origin) return {};
  if (!extensionOriginAllowed(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
}

function respond(request: NextRequest, body: unknown, status: number) {
  return NextResponse.json(body, { status, headers: corsHeaders(request) });
}

/** Preflight for the extension's JSON POST. */
export function OPTIONS(request: NextRequest) {
  if (!originAllowed(request)) {
    return new NextResponse(null, { status: 403 });
  }
  return new NextResponse(null, { status: 204, headers: corsHeaders(request) });
}

export async function POST(request: NextRequest) {
  if (!originAllowed(request)) {
    return respond(request, { error: "Origin not allowed." }, 403);
  }

  const user = await getSessionUser();
  if (!user) {
    return respond(request, { error: "Sign in to ApplyOS first." }, 401);
  }

  const body: unknown = await request.json().catch(() => null);
  const parsed = ingestSchema.safeParse(body);
  if (!parsed.success) {
    return respond(
      request,
      { error: parsed.error.issues[0]?.message ?? "Invalid request body." },
      400,
    );
  }
  const input = parsed.data;

  const modelId =
    input.modelId && getModel(input.modelId)
      ? input.modelId
      : MODEL_REGISTRY.defaultModelId;

  let application;
  try {
    application = await createApplication(user.id, {
      companyName: input.company,
      roleTitle: input.role,
      location: input.location,
      jobUrl: input.url,
      jobDescription: input.jobDescription,
      applied: input.applied,
    });
  } catch (error) {
    console.error(error);
    return respond(request, { error: "Could not save the job." }, 500);
  }

  // From here the job is saved, and nothing below may turn that into an
  // error response: tailoring is best effort.
  let tailoring = false;
  if (input.autoTailor) {
    const jobId = application.id;
    const jobDescription = application.jobDescription;
    try {
      // Runs once the response is out. A failure or a timeout leaves the
      // job saved and untailored; it can be retried from its detail drawer.
      after(async () => {
        try {
          await tailorApplication({
            jobId,
            jobDescription,
            modelConfig: {
              modelId,
              fallbackModelIds: MODEL_REGISTRY.models
                .map((model) => model.id)
                .filter((id) => id !== modelId),
            },
          });
        } catch (error) {
          console.error("Background tailoring failed", jobId, error);
        }
      });
      tailoring = true;
    } catch (error) {
      console.error("Could not schedule background tailoring", jobId, error);
    }
  }

  return respond(
    request,
    { application, id: application.id, status: application.status, tailoring },
    201,
  );
}
