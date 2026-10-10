"use client";

import { Eye, EyeOff } from "lucide-react";
import { useState, type InputHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

import { Input } from "./input";

/** Credential field with a show/hide toggle. */
export function PasswordInput({
  className,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  const [visible, setVisible] = useState(false);
  const Icon = visible ? EyeOff : Eye;

  return (
    <div className="relative">
      <Input
        type={visible ? "text" : "password"}
        className={cn("pr-9", className)}
        {...props}
      />
      <button
        type="button"
        onClick={() => setVisible((current) => !current)}
        aria-label={visible ? "Hide" : "Show"}
        aria-pressed={visible}
        className="absolute inset-y-0 right-0 flex w-9 items-center justify-center rounded-r-md text-zinc-500 transition-colors duration-150 outline-none hover:text-zinc-200 focus-visible:text-zinc-200 focus-visible:ring-2 focus-visible:ring-indigo-500/40"
      >
        <Icon className="size-4" aria-hidden />
      </button>
    </div>
  );
}
