import type { Metadata } from "next";

import { ResumeStudio } from "@/components/resume/resume-studio";
import { getMasterResume } from "@/lib/db/resume";
import { getSessionUser } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Master Resume Studio · ApplyOS",
  description:
    "Structured AST visual editor with append-only revisions and live ATS vector preview.",
};

export default async function ResumePage() {
  const user = await getSessionUser();
  if (!user) return null;

  const latestResume = await getMasterResume(user.id);
  return <ResumeStudio initialResume={latestResume} />;
}
