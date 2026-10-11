import type { Metadata } from "next";

import { DiscoveryView } from "@/components/discovery/discovery-view";
import {
  getAutoApplyAuditLogs,
  getCandidatePreferences,
  getLatestAutoApplyConsent,
} from "@/lib/db/discovery";
import { getSessionUser } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Job Radar & Autonomous Dispatch · Honing",
  description:
    "Candidate calibration profile, strict permission protocol, and preference-filtered job opportunities.",
};

export default async function DiscoverPage() {
  const user = await getSessionUser();
  if (!user) return null;

  const [preferences, consent, logs] = await Promise.all([
    getCandidatePreferences(user.id),
    getLatestAutoApplyConsent(user.id),
    getAutoApplyAuditLogs(user.id, 25),
  ]);

  return (
    <DiscoveryView
      initialPreferences={preferences}
      initialConsent={consent}
      initialLogs={logs}
    />
  );
}
