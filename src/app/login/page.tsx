import type { Metadata } from "next";

import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in · ApplyOS" };

export default function LoginPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm animate-rise-in">
        <div className="mb-6 flex items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground shadow-lg shadow-indigo-500/30">
            A
          </span>
          <span className="text-lg font-semibold tracking-tight">ApplyOS</span>
        </div>
        <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/60 p-6 shadow-2xl shadow-indigo-500/10 backdrop-blur-md">
          <LoginForm />
        </div>
        <p className="mt-4 text-center text-xs text-muted-foreground">
          Your master resume is never modified. Tailoring only produces patches.
        </p>
      </div>
    </main>
  );
}
