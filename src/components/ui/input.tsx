import type { InputHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

export function Input({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-9 w-full rounded-md border border-border bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground transition-[border-color,box-shadow] duration-150 outline-none focus:border-primary focus:ring-2 focus:ring-ring/20 disabled:opacity-60 aria-[invalid=true]:border-destructive/60 aria-[invalid=true]:focus:ring-destructive/20",
        className,
      )}
      {...props}
    />
  );
}
