"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div
        className={cn(
          "flex size-8 items-center justify-center rounded-md border border-border bg-card/60 text-muted-foreground",
          className,
        )}
        aria-hidden="true"
      >
        <span className="size-4 rounded-full bg-muted animate-pulse" />
      </div>
    );
  }

  const isDark = (theme ?? resolvedTheme ?? "dark") === "dark";

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={`Switch to ${isDark ? "light" : "dark"} mode`}
      title={`Switch to ${isDark ? "light" : "dark"} mode`}
      className={cn(
        "flex size-8 items-center justify-center rounded-md border border-border bg-card/60 text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      {isDark ? (
        <Moon className="size-4 shrink-0 text-indigo-400" />
      ) : (
        <Sun className="size-4 shrink-0 text-amber-500" />
      )}
    </button>
  );
}
