import { timingSafeEqual } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { classifyEmail, matchApplication } from "@/lib/inbound/email";
import { getAdminClient } from "@/lib/supabase/admin";

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
 * Not yet handled: provider-specific payload shapes, signature schemes,
 * de-duplicating repeat deliveries, and reading the proposed time out of
 * the email (the staged event lands, all day, on the day the email arrives).
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

  return NextResponse.json({
    matched: true,
    applicationId: match.id,
    intent,
    actions,
  });
}
