import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

export function Kbd({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded border border-zinc-700/80 bg-zinc-800/80 px-1 font-sans text-[10px] font-medium text-zinc-400",
        className,
      )}
      {...props}
    />
  );
}
