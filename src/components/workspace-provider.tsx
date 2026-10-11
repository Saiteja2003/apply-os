"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";

import {
  generateInterviewPrepAction,
  tailorApplicationAction,
  updateApplicationStatusAction,
} from "@/app/actions/applications";
import {
  ApplicationDrawer,
  type DrawerTab,
} from "@/components/application-drawer";
import type { ActionResult } from "@/lib/action-result";
import { fetchApplications, fetchMasterResume, queryKeys } from "@/lib/api";
import { useModelConfig } from "@/lib/store";
import {
  DAILY_QUOTA_EXCEEDED,
  INSUFFICIENT_CREDITS,
  MODEL_NOT_ALLOWED,
} from "@/lib/types/billing";
import type {
  ApplicationStatus,
  JobApplication,
  MasterResumeVersion,
} from "@/lib/types/resume";

/**
 * Shared state for every page inside the app shell: the user's applications
 * and master resume, the actions on them, and the one Application Detail
 * Drawer that any page can open.
 */
interface WorkspaceValue {
  userId: string;
  applications: JobApplication[];
  master: MasterResumeVersion | null;
  /** Applications with a tailoring run in flight. */
  tailoringIds: ReadonlySet<string>;
  /** Applications with an interview briefing being generated. */
  preparingIds: ReadonlySet<string>;
  upsertApplication: (application: JobApplication) => void;
  /** Call after saving a new master resume version. */
  setMaster: (version: MasterResumeVersion) => void;
  tailor: (applicationId: string) => Promise<ActionResult<JobApplication>>;
  prepare: (applicationId: string, options?: { quiet?: boolean }) => Promise<void>;
  moveApplication: (applicationId: string, status: ApplicationStatus) => Promise<void>;
  openApplication: (applicationId: string, tab?: DrawerTab) => void;
}

const WorkspaceContext = createContext<WorkspaceValue | null>(null);

export function useWorkspace(): WorkspaceValue {
  const value = useContext(WorkspaceContext);
  if (!value) {
    throw new Error("useWorkspace must be used inside WorkspaceProvider.");
  }
  return value;
}

interface Selection {
  applicationId: string;
  tab: DrawerTab;
  /** Bumped on every open so the drawer resets to the requested tab. */
  nonce: number;
}

const withId = (ids: ReadonlySet<string>, id: string) => new Set(ids).add(id);
const withoutId = (ids: ReadonlySet<string>, id: string) => {
  const next = new Set(ids);
  next.delete(id);
  return next;
};

interface WorkspaceProviderProps {
  userId: string;
  initialApplications: JobApplication[];
  initialMaster: MasterResumeVersion;
  children: ReactNode;
}

export function WorkspaceProvider({
  userId,
  initialApplications,
  initialMaster,
  children,
}: WorkspaceProviderProps) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const modelConfig = useModelConfig();

  const [selection, setSelection] = useState<Selection | null>(null);
  const [tailoringIds, setTailoringIds] = useState<ReadonlySet<string>>(new Set());
  const [preparingIds, setPreparingIds] = useState<ReadonlySet<string>>(new Set());

  const applicationsKey = queryKeys.applications(userId);
  const masterKey = queryKeys.masterResume(userId);

  const { data: applications } = useQuery({
    queryKey: applicationsKey,
    queryFn: fetchApplications,
    initialData: initialApplications,
  });
  const { data: master } = useQuery({
    queryKey: masterKey,
    queryFn: fetchMasterResume,
    initialData: initialMaster,
  });

  const upsertApplication = useCallback(
    (application: JobApplication) => {
      queryClient.setQueryData<JobApplication[]>(
        queryKeys.applications(userId),
        (current = []) =>
          current.some((entry) => entry.id === application.id)
            ? current.map((entry) =>
                entry.id === application.id ? application : entry,
              )
            : [application, ...current],
      );
    },
    [queryClient, userId],
  );

  const setMaster = useCallback(
    (version: MasterResumeVersion) => {
      queryClient.setQueryData(queryKeys.masterResume(userId), version);
    },
    [queryClient, userId],
  );

  const prepare = useCallback(
    async (applicationId: string, options?: { quiet?: boolean }) => {
      setPreparingIds((current) => withId(current, applicationId));
      try {
        const result = await generateInterviewPrepAction(
          applicationId,
          modelConfig,
        );
        if (result.ok) {
          upsertApplication(result.data);
          if (!options?.quiet) toast.success("Interview briefing ready");
        } else {
          toast.error("Interview briefing failed", { description: result.error });
        }
      } catch {
        toast.error("Interview briefing failed", {
          description: "Could not reach the server. Try again.",
        });
      } finally {
        setPreparingIds((current) => withoutId(current, applicationId));
      }
    },
    [modelConfig, upsertApplication],
  );

  const tailor = useCallback(
    async (applicationId: string): Promise<ActionResult<JobApplication>> => {
      setTailoringIds((current) => withId(current, applicationId));
      try {
        const result = await tailorApplicationAction(applicationId, modelConfig);
        if (!result.ok) return result;

        upsertApplication(result.data.application);
        const rejected = result.data.rejectedChanges;
        toast.success("Resume tailored", {
          description:
            rejected > 0
              ? `The verification guard discarded ${rejected} generated ${
                  rejected === 1 ? "change" : "changes"
                } that could not be traced to your master resume.`
              : "Every change traces back to your master resume.",
        });
        // Second stage of the pipeline: runs in the background so the diff
        // is usable straight away.
        void prepare(applicationId, { quiet: true });
        return { ok: true, data: result.data.application };
      } catch {
        return { ok: false, error: "Tailoring failed. Try again." };
      } finally {
        setTailoringIds((current) => withoutId(current, applicationId));
        // A run may have spent (or been refunded) a credit.
        void queryClient.invalidateQueries({
          queryKey: queryKeys.billing(userId),
        });
      }
    },
    [modelConfig, prepare, queryClient, upsertApplication, userId],
  );

  const moveApplication = useCallback(
    async (applicationId: string, status: ApplicationStatus) => {
      const key = queryKeys.applications(userId);
      const previous = queryClient.getQueryData<JobApplication[]>(key);
      const current = previous?.find((entry) => entry.id === applicationId);
      if (!current || current.status === status) return;

      // Optimistic: move the card now, reconcile with the saved row after.
      upsertApplication({ ...current, status });
      const result = await updateApplicationStatusAction(
        applicationId,
        status,
      ).catch(
        (): ActionResult<JobApplication> => ({
          ok: false,
          error: "Could not reach the server. Try again.",
        }),
      );
      if (result.ok) {
        upsertApplication(result.data);
      } else {
        queryClient.setQueryData(key, previous);
        toast.error("Could not move the application", {
          description: result.error,
        });
      }
    },
    [queryClient, upsertApplication, userId],
  );

  const openApplication = useCallback(
    (applicationId: string, tab: DrawerTab = "diff") => {
      setSelection((previous) => ({
        applicationId,
        tab,
        nonce: (previous?.nonce ?? 0) + 1,
      }));
    },
    [],
  );

  const value = useMemo<WorkspaceValue>(
    () => ({
      userId,
      applications,
      master,
      tailoringIds,
      preparingIds,
      upsertApplication,
      setMaster,
      tailor,
      prepare,
      moveApplication,
      openApplication,
    }),
    [
      userId,
      applications,
      master,
      tailoringIds,
      preparingIds,
      upsertApplication,
      setMaster,
      tailor,
      prepare,
      moveApplication,
      openApplication,
    ],
  );

  const selected =
    applications.find(
      (application) => application.id === selection?.applicationId,
    ) ?? null;

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
      <ApplicationDrawer
        application={selected}
        openKey={selection?.nonce ?? 0}
        initialTab={selection?.tab ?? "diff"}
        master={master}
        isTailoring={selected !== null && tailoringIds.has(selected.id)}
        isPreparing={selected !== null && preparingIds.has(selected.id)}
        onClose={() => setSelection(null)}
        onMove={moveApplication}
        onPrepare={prepare}
        onUpdated={upsertApplication}
        onTailor={async (applicationId) => {
          const result = await tailor(applicationId);
          if (!result.ok) {
            const upgrade =
              result.code === INSUFFICIENT_CREDITS ||
              result.code === MODEL_NOT_ALLOWED ||
              result.code === DAILY_QUOTA_EXCEEDED;
            toast.error(
              result.code === INSUFFICIENT_CREDITS
                ? "No applications left"
                : result.code === DAILY_QUOTA_EXCEEDED
                  ? "Daily free quota reached"
                  : result.code === MODEL_NOT_ALLOWED
                    ? "Model not included in your plan"
                    : "Tailoring failed",
              {
                description: result.error,
                action: upgrade
                  ? {
                      label: "View plans",
                      onClick: () => router.push("/settings#plans"),
                    }
                  : undefined,
              },
            );
          }
        }}
      />
    </WorkspaceContext.Provider>
  );
}
