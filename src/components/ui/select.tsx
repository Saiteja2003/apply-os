import type { SelectHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

export function Select({
  className,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "h-9 w-full rounded-md border border-border bg-card px-2.5 text-sm text-foreground transition-[border-color,box-shadow] duration-150 outline-none hover:border-zinc-700 focus:border-primary focus:ring-2 focus:ring-ring/20 disabled:opacity-60 aria-[invalid=true]:border-destructive/60",
        className,
      )}
      {...props}
    />
  );
}
