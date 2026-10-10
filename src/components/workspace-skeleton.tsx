/** Shown in the content area while the workspace data loads. */
export function WorkspaceSkeleton() {
  return (
    <div
      className="flex h-full flex-col"
      aria-busy="true"
      aria-label="Loading workspace"
    >
      <div className="px-4 pt-5 pb-3 md:px-6">
        <div className="h-6 w-28 animate-pulse rounded bg-zinc-800/70" />
        <div className="mt-2 h-4 w-56 animate-pulse rounded bg-zinc-800/50" />
      </div>
      <div className="flex min-h-0 flex-1 gap-3 overflow-hidden px-4 pb-4 md:px-6">
        {[3, 2, 2, 1, 1].map((cards, column) => (
          <div
            key={column}
            className="flex w-64 shrink-0 flex-col gap-2 rounded-xl border border-zinc-800/60 bg-zinc-900/40 p-2 xl:w-auto xl:flex-1"
          >
            <div className="mx-1 my-1.5 h-4 w-20 animate-pulse rounded bg-zinc-800/70" />
            {Array.from({ length: cards }, (_, card) => (
              <div
                key={card}
                className="h-[86px] animate-pulse rounded-lg bg-zinc-800/40"
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
