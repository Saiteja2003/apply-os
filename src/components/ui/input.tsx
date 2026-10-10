import type { InputHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

export function Input({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-9 w-full rounded-md border bg-zinc-900 border-zinc-800 text-zinc-100 placeholder:text-zinc-500 focus:border-indigo-500 px-3 text-sm transition-[border-color,box-shadow] duration-150 outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-60 aria-[invalid=true]:border-red-500/60 aria-[invalid=true]:focus:ring-red-500/20",
        className,
      )}
      {...props}
    />
  );
}
