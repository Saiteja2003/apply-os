"use client";

import {
  Briefcase,
  CalendarDays,
  Compass,
  FileText,
  LayoutDashboard,
  LogOut,
  Settings,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

import { signOutAction } from "@/app/actions/auth";
import { Kbd } from "@/components/ui/kbd";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Pressed after `G` to jump to this page. */
  shortcut: string;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, shortcut: "D" },
  { href: "/discover", label: "Discover", icon: Compass, shortcut: "J" },
  { href: "/applications", label: "Applications", icon: Briefcase, shortcut: "A" },
  { href: "/calendar", label: "Calendar", icon: CalendarDays, shortcut: "C" },
  { href: "/resume", label: "Master Resume", icon: FileText, shortcut: "R" },
  { href: "/settings", label: "Settings", icon: Settings, shortcut: "S" },
];

/** The overview that every section sits under. Reached with `G` then `W`. */
export const WORKSPACE_HREF = "/workspace";

const SEQUENCE_WINDOW_MS = 1000;

export function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
  );
}

/** `G` then a letter navigates, as in Linear. */
function useNavigationShortcuts() {
  const router = useRouter();

  useEffect(() => {
    let armedAt = 0;

    function onKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;

      const key = event.key.toUpperCase();
      if (key === "G") {
        armedAt = Date.now();
        return;
      }
      if (Date.now() - armedAt > SEQUENCE_WINDOW_MS) return;
      armedAt = 0;

      const href =
        key === "W"
          ? WORKSPACE_HREF
          : NAV_ITEMS.find((entry) => entry.shortcut === key)?.href;
      if (href) {
        event.preventDefault();
        router.push(href);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [router]);
}

export function Sidebar({ userEmail }: { userEmail: string | null }) {
  const pathname = usePathname();
  useNavigationShortcuts();

  return (
    <aside className="flex w-14 shrink-0 flex-col border-r bg-zinc-950/60 backdrop-blur-md md:w-60">
      <div className="flex h-14 items-center px-2">
        <Link
          href="/dashboard"
          aria-label="ApplyOS, go to dashboard"
          className="group/logo flex h-9 items-center gap-2.5 rounded-md px-1.5 transition-colors duration-150 outline-none hover:bg-zinc-800/40 focus-visible:ring-2 focus-visible:ring-ring md:px-2"
        >
          <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary text-xs font-bold text-primary-foreground shadow-md shadow-indigo-500/30 transition-transform duration-150 group-hover/logo:scale-105">
            A
          </span>
          <span className="hidden text-[15px] font-semibold tracking-tight md:inline">
            ApplyOS
          </span>
        </Link>
      </div>

      <nav className="flex flex-col gap-0.5 p-2" aria-label="Main">
        <Link
          href={WORKSPACE_HREF}
          title="Workspace overview (G then W)"
          aria-current={pathname === WORKSPACE_HREF ? "page" : undefined}
          className={cn(
            "mb-0.5 hidden rounded px-2.5 pt-1 pb-1.5 text-[11px] font-medium tracking-wider uppercase transition-colors duration-150 outline-none hover:text-zinc-200 focus-visible:ring-2 focus-visible:ring-ring md:block",
            pathname === WORKSPACE_HREF ? "text-indigo-300" : "text-zinc-500",
          )}
        >
          Workspace
        </Link>
        {NAV_ITEMS.map(({ href, label, icon: Icon, shortcut }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              title={`${label} (G then ${shortcut})`}
              aria-current={active ? "page" : undefined}
              className={cn(
                "group relative flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13px] transition-colors duration-150 ease-out outline-none focus-visible:ring-2 focus-visible:ring-ring",
                active
                  ? "bg-zinc-800/70 font-medium text-zinc-100 shadow-sm shadow-black/20"
                  : "text-zinc-400 hover:bg-zinc-800/40 hover:text-zinc-100",
              )}
            >
              {active && (
                <span
                  className="absolute top-1.5 bottom-1.5 left-0 w-0.5 rounded-full bg-indigo-400"
                  aria-hidden
                />
              )}
              <Icon
                className={cn("size-4 shrink-0", active && "text-indigo-400")}
                aria-hidden
              />
              <span className="hidden flex-1 md:inline">{label}</span>
              <span
                className="hidden items-center gap-0.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100 md:flex"
                aria-hidden
              >
                <Kbd>G</Kbd>
                <Kbd>{shortcut}</Kbd>
              </span>
            </Link>
          );
        })}
      </nav>

      <form action={signOutAction} className="mt-auto border-t p-2">
        {userEmail && (
          <p className="hidden truncate px-2.5 pb-1.5 text-xs text-zinc-500 md:block">
            {userEmail}
          </p>
        )}
        <button
          type="submit"
          title="Sign out"
          className="flex h-8 w-full items-center gap-2.5 rounded-md px-2.5 text-[13px] text-zinc-400 transition-colors duration-150 outline-none hover:bg-zinc-800/40 hover:text-zinc-100 focus-visible:ring-2 focus-visible:ring-ring"
        >
          <LogOut className="size-4 shrink-0" aria-hidden />
          <span className="hidden md:inline">Sign out</span>
        </button>
      </form>
    </aside>
  );
}
