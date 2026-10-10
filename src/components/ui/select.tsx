import type { SelectHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

export function Select({
  className,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "h-9 w-full rounded-md border border-zinc-800 bg-zinc-900 px-2.5 text-sm text-zinc-100 transition-[border-color,box-shadow] duration-150 outline-none hover:border-zinc-700 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-60 aria-[invalid=true]:border-red-500/60",
        className,
      )}
      {...props}
    />
  );
}
