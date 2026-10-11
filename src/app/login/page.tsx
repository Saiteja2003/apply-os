import type { Metadata } from "next";

import { HoningLogo } from "@/components/brand/logo";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in · Honing" };

export default function LoginPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm animate-rise-in">
        <div className="mb-6 flex items-center justify-center">
          <HoningLogo variant="full" size="md" />
        </div>
        <div className="rounded-xl border border-border bg-card/80 p-6 shadow-2xl shadow-indigo-500/10 backdrop-blur-md dark:border-zinc-800/80 dark:bg-zinc-900/60">
          <LoginForm />
        </div>
        <p className="mt-4 text-center text-xs text-muted-foreground">
          Your master record is never modified. Tailoring only produces patches.
        </p>
      </div>
    </main>
  );
}
