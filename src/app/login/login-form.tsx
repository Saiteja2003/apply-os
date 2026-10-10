"use client";

import { Loader2 } from "lucide-react";
import { useActionState, useState } from "react";

import {
  signInAction,
  signUpAction,
  type AuthFormState,
} from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { InlineAlert } from "@/components/ui/inline-alert";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";

const INITIAL_STATE: AuthFormState = { error: null, notice: null };

type Mode = "sign-in" | "sign-up";

function CredentialsForm({ mode }: { mode: Mode }) {
  const [state, formAction, pending] = useActionState(
    mode === "sign-in" ? signInAction : signUpAction,
    INITIAL_STATE,
  );

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-1.5">
        <label htmlFor="email" className="text-sm font-medium text-zinc-300">
          Email
        </label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          autoFocus
          required
        />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="password" className="text-sm font-medium text-zinc-300">
          Password
        </label>
        <PasswordInput
          id="password"
          name="password"
          autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
          placeholder={mode === "sign-in" ? "Your password" : "At least 8 characters"}
          minLength={8}
          required
        />
      </div>

      {state.error && <InlineAlert tone="error">{state.error}</InlineAlert>}
      {state.notice && <InlineAlert tone="success">{state.notice}</InlineAlert>}

      <Button type="submit" className="w-full" disabled={pending}>
        {pending && <Loader2 className="animate-spin" aria-hidden />}
        {pending
          ? mode === "sign-in"
            ? "Signing in…"
            : "Creating account…"
          : mode === "sign-in"
            ? "Sign in"
            : "Create account"}
      </Button>
    </form>
  );
}

export function LoginForm() {
  const [mode, setMode] = useState<Mode>("sign-in");

  return (
    <>
      <h1 className="text-lg font-semibold tracking-tight">
        {mode === "sign-in" ? "Welcome back" : "Create your account"}
      </h1>
      <p className="mt-1 mb-5 text-sm text-muted-foreground">
        {mode === "sign-in"
          ? "Sign in to your application workspace."
          : "Start tracking and tailoring applications."}
      </p>

      {/* Keyed so switching mode resets the form and its action state. */}
      <CredentialsForm key={mode} mode={mode} />

      <p className="mt-5 text-center text-sm text-muted-foreground">
        {mode === "sign-in" ? "New here?" : "Already have an account?"}{" "}
        <button
          type="button"
          onClick={() => setMode(mode === "sign-in" ? "sign-up" : "sign-in")}
          className="rounded font-medium text-indigo-400 transition-colors duration-150 outline-none hover:text-indigo-300 focus-visible:ring-2 focus-visible:ring-ring"
        >
          {mode === "sign-in" ? "Create an account" : "Sign in"}
        </button>
      </p>
    </>
  );
}
