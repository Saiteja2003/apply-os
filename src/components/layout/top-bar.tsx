"use client";

import { useQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

import { ByokKeyDialog } from "@/components/byok-key-dialog";
import { ModelSelector } from "@/components/model-selector";
import { Kbd } from "@/components/ui/kbd";
import { fetchKeyHints, queryKeys } from "@/lib/api";
import { MODEL_REGISTRY } from "@/lib/llm/models";
import { useGatewayStore } from "@/lib/store";

import { NAV_ITEMS, WORKSPACE_HREF } from "./sidebar";

export function TopBar({ userId }: { userId: string }) {
  const pathname = usePathname();
  const activeModelId = useGatewayStore((state) => state.activeModelId);
  const { data: keyHints } = useQuery({
    queryKey: queryKeys.keyHints(userId),
    queryFn: fetchKeyHints,
  });

  // Restore the model saved in this browser (see `useGatewayStore`).
  useEffect(() => {
    void useGatewayStore.persist.rehydrate();
  }, []);

  // The workspace overview is the root of the breadcrumb trail.
  const onWorkspace = pathname === WORKSPACE_HREF;
  const section =
    NAV_ITEMS.find(
      (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
    )?.label ?? (pathname.startsWith("/clip") ? "Import job" : "ApplyOS");
  const activeModel =
    MODEL_REGISTRY.models.find(
      (model) => model.id === (activeModelId ?? MODEL_REGISTRY.defaultModelId),
    ) ?? MODEL_REGISTRY.models[0];
  const activeProvider =
    MODEL_REGISTRY.providers.find(
      (provider) => provider.id === activeModel.providerId,
    ) ?? MODEL_REGISTRY.providers[0];

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b bg-zinc-950/60 px-3 backdrop-blur-md md:px-6">
      <nav
        aria-label="Breadcrumb"
        className="flex min-w-0 items-center gap-1 text-[13px]"
      >
        {onWorkspace ? (
          <span
            aria-current="page"
            className="truncate px-1 font-medium text-zinc-100"
          >
            Workspace
          </span>
        ) : (
          <>
            <Link
              href={WORKSPACE_HREF}
              className="hidden rounded px-1 py-0.5 text-zinc-500 transition-colors duration-150 outline-none hover:bg-zinc-800/40 hover:text-zinc-100 focus-visible:text-zinc-100 focus-visible:ring-2 focus-visible:ring-ring sm:inline"
            >
              Workspace
            </Link>
            <ChevronRight
              className="hidden size-3.5 text-zinc-600 sm:inline"
              aria-hidden
            />
            <span
              aria-current="page"
              className="truncate px-1 font-medium text-zinc-100"
            >
              {section}
            </span>
          </>
        )}
      </nav>

      <p className="ml-auto hidden items-center gap-1.5 text-xs text-zinc-500 lg:flex">
        <Kbd>G</Kbd>
        <span>then a letter to navigate</span>
      </p>

      <div className="ml-auto flex items-center gap-2 lg:ml-0">
        <ModelSelector registry={MODEL_REGISTRY} activeModel={activeModel} />
        <ByokKeyDialog
          userId={userId}
          registry={MODEL_REGISTRY}
          activeProvider={activeProvider}
          keyHints={keyHints ?? {}}
        />
      </div>
    </header>
  );
}
