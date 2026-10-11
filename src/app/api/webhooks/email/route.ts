import { timingSafeEqual } from "node:crypto";

import { after, NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { platformAllows } from "@/lib/billing/model-access";
import {
  toJobApplication,
  toMasterResumeVersion,
  type ApplicationRow as FullApplicationRow,
  type MasterResumeRow,
} from "@/lib/db/mappers";
import { draftReply, pickDraftModel } from "@/lib/inbound/draft-reply";
import { classifyEmail, matchApplication } from "@/lib/inbound/email";
import { getAdminClient } from "@/lib/supabase/admin";
import type { PlanTier } from "@/lib/types/billing";

// The reply draft is written after the response has gone out.
export const maxDuration = 60;

/**
 * Inbound recruiter email webhook (scaffold).
 *
 * Point an inbound-mail service (Postmark, Mailgun, SendGrid Inbound
 * Parse, a Gmail forwarding script) at this endpoint with the header
 * `x-webhook-secret: $EMAIL_WEBHOOK_SECRET` and a JSON body of
 * `{ to, from, fromName?, subject, text }`, where `to` is the ApplyOS
 * account's email address.
 *
 * There is no user session here, so it needs the service-role key and
 * every query below filters by the user resolved from `to`.
 *
 * Each matched email is saved to `email_interactions` (migration 005) and a
 * reply is drafted for the user to review in the application drawer. The
 * draft is text only: nothing here, or anywhere in ApplyOS, sends email.
 *
 * Not yet handled: provider-specific payload shapes, signature schemes, and
 * reading the proposed time out of the email (the staged event lands, all
 * day, on the day the email arrives).
 */

const emailSchema = z.object({
  to: z.string().trim().toLowerCase().email(),
  from: z.string().trim().toLowerCase().email(),
  fromName: z
    .string()
    .trim()
    .max(200)
    .nullish()
    .transform((value) => value || null),
  subject: z.string().trim().max(500),
  text: z.string().max(100_000),
});

function secretMatches(request: NextRequest, secret: string): boolean {
  const given = Buffer.from(request.headers.get("x-webhook-secret") ?? "");
  const expected = Buffer.from(secret);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

interface ApplicationRow {
  id: string;
  company_name: string;
  job_url: string | null;
  status: string;
}

export async function POST(request: NextRequest) {
  const secret = process.env.EMAIL_WEBHOOK_SECRET;
  const admin = getAdminClient();
  if (!secret || !admin) {
    return NextResponse.json(
      {
        error:
          "Email webhook is not configured. Set EMAIL_WEBHOOK_SECRET and a real SUPABASE_SERVICE_ROLE_KEY.",
      },
      { status: 503 },
    );
  }
  if (!secretMatches(request, secret)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const parsed = emailSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request body." },
      { status: 400 },
    );
  }
  const email = parsed.data;

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id")
    .eq("email", email.to)
    .maybeSingle<{ id: string }>();
  if (profileError) {
    console.error(profileError);
    return NextResponse.json({ error: "Lookup failed." }, { status: 500 });
  }
  // Same answer whether or not the address has an account.
  if (!profile) return NextResponse.json({ matched: false });

  const { data: rows, error: listError } = await admin
    .from("applications")
    .select("id, company_name, job_url, status")
    .eq("user_id", profile.id)
    .returns<ApplicationRow[]>();
  if (listError) {
    console.error(listError);
    return NextResponse.json({ error: "Lookup failed." }, { status: 500 });
  }

  const match = matchApplication(
    rows.map((row) => ({
      id: row.id,
      companyName: row.company_name,
      jobUrl: row.job_url,
      status: row.status,
    })),
    email,
  );
  const intent = classifyEmail(email);
  if (!match) return NextResponse.json({ matched: false, intent });

  const actions: string[] = [];

  // A provider that redelivers must not stage a second event or spend a
  // second model call.
  const { data: sameThread } = await admin
    .from("email_interactions")
    .select("id, body_text")
    .eq("user_id", profile.id)
    .eq("application_id", match.id)
    .eq("sender", email.from)
    .eq("subject", email.subject)
    .limit(20)
    .returns<{ id: string; body_text: string }[]>();
  if (sameThread?.some((row) => row.body_text === email.text)) {
    return NextResponse.json({
      matched: true,
      applicationId: match.id,
      intent,
      duplicate: true,
      actions,
    });
  }

  // Keep what was received. If migration 005 has not been run this fails and
  // the rest of the webhook carries on as it always did.
  const { data: saved, error: saveError } = await admin
    .from("email_interactions")
    .insert({
      user_id: profile.id,
      application_id: match.id,
      sender: email.from,
      sender_name: email.fromName,
      subject: email.subject,
      body_text: email.text,
      intent,
    })
    .select("id")
    .single<{ id: string }>();
  if (saveError) {
    console.error("Could not store the email", saveError.code, saveError.message);
  } else {
    actions.push("email:stored");
  }

  if (intent === "INTERVIEW" || intent === "SCREENING") {
    // Only ever moves an application forward.
    if (match.status === "SAVED" || match.status === "APPLIED") {
      const { error } = await admin
        .from("applications")
        .update({
          status: "INTERVIEWING",
          ...(match.status === "SAVED"
            ? { applied_at: new Date().toISOString() }
            : {}),
        })
        .eq("user_id", profile.id)
        .eq("id", match.id);
      if (error) console.error(error);
      else actions.push("status:INTERVIEWING");
    }

    // Noon UTC shows as today's date in nearly every time zone.
    const today = new Date();
    today.setUTCHours(12, 0, 0, 0);
    const { error } = await admin.from("calendar_events").insert({
      user_id: profile.id,
      application_id: match.id,
      event_type: intent,
      title:
        intent === "SCREENING"
          ? `Schedule screening call with ${match.companyName}`
          : `Schedule interview with ${match.companyName}`,
      starts_at: today.toISOString(),
      all_day: true,
      notes: `From ${email.fromName ?? email.from}: ${email.subject}\n\n${email.text
        .trim()
        .slice(0, 600)}`,
    });
    if (error) console.error(error);
    else actions.push("calendar_event:staged");
  }

  if (saved) {
    const interactionId = saved.id;
    const userId = profile.id;
    after(() =>
      draftInBackground({
        admin,
        userId,
        applicationId: match.id,
        interactionId,
        email,
        intent,
      }),
    );
    actions.push("reply:drafting");
  }

  return NextResponse.json({
    matched: true,
    applicationId: match.id,
    intent,
    actions,
  });
}

const PLAN_TIERS: readonly string[] = ["free", "byok", "pro_credits", "sprint_pass"];

interface DraftJob {
  admin: NonNullable<ReturnType<typeof getAdminClient>>;
  userId: string;
  applicationId: string;
  interactionId: string;
  email: z.infer<typeof emailSchema>;
  intent: ReturnType<typeof classifyEmail>;
}

/**
 * Writes the reply draft for a stored email. Costs no credit.
 *
 * It runs on platform keys only, with the model the plan allows. A user who
 * has stored their own API key is skipped on purpose: their email and resume
 * should only ever reach their own provider, so their draft is written from
 * the drawer, with their key. Never throws: a failed draft just leaves the
 * email without one.
 */
async function draftInBackground({
  admin,
  userId,
  applicationId,
  interactionId,
  email,
  intent,
}: DraftJob): Promise<void> {
  try {
    const { data: keys, error: keysError } = await admin
      .from("user_api_keys")
      .select("provider")
      .eq("user_id", userId)
      .limit(1);
    if (keysError) throw keysError;
    if (keys.length > 0) return;

    const [resumeResult, creditsResult, applicationResult] = await Promise.all([
      admin
        .from("master_resumes")
        .select("*")
        .eq("user_id", userId)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle<MasterResumeRow>(),
      admin
        .from("user_credits")
        .select("tier, tier_expires_at")
        .eq("user_id", userId)
        .maybeSingle<{ tier: string; tier_expires_at: string | null }>(),
      admin
        .from("applications")
        .select("*")
        .eq("user_id", userId)
        .eq("id", applicationId)
        .maybeSingle<FullApplicationRow>(),
    ]);
    if (resumeResult.error) throw resumeResult.error;
    if (applicationResult.error) throw applicationResult.error;
    if (!resumeResult.data || !applicationResult.data) return;

    const resume = toMasterResumeVersion(resumeResult.data).resume;
    const application = toJobApplication(applicationResult.data);

    // A plan that has run out is the free plan; no credits row counts as free.
    const credits = creditsResult.error ? null : creditsResult.data;
    const expired =
      credits?.tier_expires_at != null &&
      new Date(credits.tier_expires_at).getTime() <= Date.now();
    const tier: PlanTier | null =
      credits && !expired && PLAN_TIERS.includes(credits.tier)
        ? (credits.tier as PlanTier)
        : null;

    const model = pickDraftModel({
      tier,
      byokKeys: {},
      assignedModelId: application.tailoredByModel,
    });
    // Belt and braces: the picker already enforces this.
    if (!platformAllows(tier, model.modelId)) return;

    const drafted = await draftReply({
      resume,
      companyName: application.companyName,
      roleTitle: application.roleTitle,
      email,
      intent,
      gapSkills: (application.interviewPrep?.skillGaps ?? []).map(
        (gap) => gap.skill,
      ),
      model,
      byokKeys: {},
    });

    // Only into an empty draft: never over something the user wrote.
    const { error } = await admin
      .from("email_interactions")
      .update({ draft_response: drafted.text })
      .eq("id", interactionId)
      .eq("user_id", userId)
      .is("draft_response", null);
    if (error) throw error;
  } catch (error) {
    console.error("Reply draft failed", interactionId, error);
  }
}
