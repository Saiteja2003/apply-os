import { CircleAlert, CircleCheck } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface InlineAlertProps {
  tone: "error" | "success";
  children: ReactNode;
  className?: string;
}

export function InlineAlert({ tone, children, className }: InlineAlertProps) {
  const Icon = tone === "error" ? CircleAlert : CircleCheck;

  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "flex animate-rise-in items-start gap-2.5 rounded-md border px-3 py-2.5 text-sm",
        tone === "error"
          ? "border-red-500/25 bg-red-500/10 text-red-300"
          : "border-emerald-500/25 bg-emerald-500/10 text-emerald-300",
        className,
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <p className="min-w-0">{children}</p>
    </div>
  );
}
