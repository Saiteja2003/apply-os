import { redirect } from "next/navigation";
import { Suspense, type ReactNode } from "react";

import { Sidebar } from "@/components/layout/sidebar";
import { TopBar } from "@/components/layout/top-bar";
import { WorkspaceProvider } from "@/components/workspace-provider";
import { WorkspaceSkeleton } from "@/components/workspace-skeleton";
import { listApplications } from "@/lib/db/applications";
import { ensureMasterResume } from "@/lib/db/seed";
import { getSessionUser } from "@/lib/supabase/server";

// Tailoring, interview prep and resume import run as server actions from
// these pages and wait on an LLM.
export const maxDuration = 300;

async function WorkspaceLoader({
  userId,
  children,
}: {
  userId: string;
  children: ReactNode;
}) {
  const [applications, master] = await Promise.all([
    listApplications(userId),
    ensureMasterResume(userId),
  ]);

  return (
    <WorkspaceProvider
      userId={userId}
      initialApplications={applications}
      initialMaster={master}
    >
      {children}
    </WorkspaceProvider>
  );
}

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  return (
    <div className="flex h-dvh overflow-hidden">
      <Sidebar userEmail={user.email} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar userId={user.id} />
        <main className="min-h-0 flex-1 overflow-auto">
          {/* The shell paints first; pages stream in with their data. */}
          <Suspense fallback={<WorkspaceSkeleton />}>
            <WorkspaceLoader userId={user.id}>{children}</WorkspaceLoader>
          </Suspense>
        </main>
      </div>
    </div>
  );
}
