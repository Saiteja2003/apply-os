import type { Metadata } from "next";

import { SettingsView } from "@/components/settings-view";
import { getSessionUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Settings · ApplyOS" };

export default async function SettingsPage() {
  // The layout has already redirected signed-out visitors.
  const user = await getSessionUser();
  return <SettingsView email={user?.email ?? null} />;
}
