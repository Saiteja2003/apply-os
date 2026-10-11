import { NextResponse, type NextRequest } from "next/server";

import { getCandidatePreferences } from "@/lib/db/discovery";
import { getMasterResume } from "@/lib/db/master-resume";
import { getSessionUser } from "@/lib/supabase/server";

const EXTENSION_ORIGIN = /^(chrome|moz|safari-web)-extension:\/\/[^/\s]+$/;

function extensionOriginAllowed(origin: string): boolean {
  if (!EXTENSION_ORIGIN.test(origin)) return false;
  const pinned = (process.env.CLIPPER_EXTENSION_ORIGINS ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  return pinned.length === 0 || pinned.includes(origin);
}

function corsHeaders(request: NextRequest): Record<string, string> {
  const origin = request.headers.get("origin");
  if (!origin || origin === request.nextUrl.origin) return {};
  if (!extensionOriginAllowed(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
}

export function OPTIONS(request: NextRequest) {
  const origin = request.headers.get("origin");
  const allowed =
    origin === null ||
    origin === request.nextUrl.origin ||
    extensionOriginAllowed(origin);

  if (!allowed) {
    return new NextResponse(null, { status: 403 });
  }
  return new NextResponse(null, { status: 204, headers: corsHeaders(request) });
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get("origin");
  const allowed =
    origin === null ||
    origin === request.nextUrl.origin ||
    extensionOriginAllowed(origin);

  if (!allowed) {
    return NextResponse.json(
      { error: "Origin not allowed." },
      { status: 403, headers: corsHeaders(request) },
    );
  }

  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json(
      { error: "Not authenticated. Sign in to Honing." },
      { status: 401, headers: corsHeaders(request) },
    );
  }

  try {
    const [resumeVersion, prefs] = await Promise.all([
      getMasterResume(user.id).catch(() => null),
      getCandidatePreferences(user.id).catch(() => null),
    ]);

    const basics = resumeVersion?.resume?.basics;
    const fullName = basics?.name || user.email?.split("@")[0] || "";
    const nameParts = fullName.trim().split(/\s+/);
    const firstName = nameParts[0] || "";
    const lastName = nameParts.length > 1 ? nameParts.slice(1).join(" ") : "";

    const links = basics?.links || [];
    const findLink = (term: string) => {
      const found = links.find(
        (l) =>
          l.label.toLowerCase().includes(term) ||
          l.url.toLowerCase().includes(term),
      );
      return found ? found.url : "";
    };

    const linkedInUrl = findLink("linkedin");
    const gitHubUrl = findLink("github");
    const portfolioUrl =
      findLink("portfolio") || findLink("website") || (links[0] ? links[0].url : "");

    const workAuth = prefs?.workAuthorization || "CITIZEN";
    const requiresSponsorship = workAuth === "REQUIRES_SPONSORSHIP";
    const legallyAuthorized = workAuth !== "OTHER";

    const standardAnswers = (prefs?.standardAnswers || {}) as Record<string, string>;

    const profile = {
      fullName,
      firstName,
      lastName,
      email: basics?.email || user.email || "",
      phone: basics?.phone || "",
      location: basics?.location || (prefs?.locations && prefs.locations[0]) || "",
      linkedInUrl,
      gitHubUrl,
      portfolioUrl,
      workAuthorization: workAuth,
      requiresSponsorship,
      legallyAuthorized,
      eeo: {
        gender: standardAnswers.gender || "Decline to Self-Identify",
        race: standardAnswers.race || "Decline to Self-Identify",
        veteran: standardAnswers.veteran || "Decline to Self-Identify",
        disability: standardAnswers.disability || "Decline to Self-Identify",
      },
      standardAnswers,
    };

    return NextResponse.json({ profile }, { headers: corsHeaders(request) });
  } catch (error) {
    console.error("Failed to load autofill data", error);
    return NextResponse.json(
      { error: "Failed to load candidate profile." },
      { status: 500, headers: corsHeaders(request) },
    );
  }
}
