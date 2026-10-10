"use client";

import { ChevronDown } from "lucide-react";
import {
  useId,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** Animates height open and closed without measuring the content. */
export function Collapse({
  open,
  id,
  children,
}: {
  open: boolean;
  id?: string;
  children: ReactNode;
}) {
  return (
    <div
      id={id}
      className={cn(
        "grid transition-[grid-template-rows,opacity] duration-200 ease-out",
        open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
      )}
    >
      <div className="overflow-hidden" inert={!open}>
        {children}
      </div>
    </div>
  );
}

interface FieldProps {
  label: string;
  hint?: string;
  error?: string;
  className?: string;
  children: ReactNode;
}

/** A labelled control. The whole label is a click target for its input. */
export function Field({ label, hint, error, className, children }: FieldProps) {
  return (
    <label className={cn("block space-y-1.5", className)}>
      <span className="flex items-baseline justify-between gap-2 text-xs font-medium text-zinc-400">
        {label}
        {hint && <span className="font-normal text-zinc-600">{hint}</span>}
      </span>
      {children}
      {error && (
        <span role="alert" className="block text-xs text-red-400">
          {error}
        </span>
      )}
    </label>
  );
}

interface TextFieldProps
  extends Omit<
    InputHTMLAttributes<HTMLInputElement>,
    "value" | "onChange" | "className"
  > {
  label: string;
  hint?: string;
  error?: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export function TextField({
  label,
  hint,
  error,
  value,
  onChange,
  className,
  ...input
}: TextFieldProps) {
  return (
    <Field label={label} hint={hint} error={error} className={className}>
      <Input
        value={value}
        aria-invalid={error ? true : undefined}
        onChange={(event) => onChange(event.target.value)}
        {...input}
      />
    </Field>
  );
}

const parseList = (text: string) =>
  text
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

/**
 * Edits a string list as comma-separated text. The raw text is kept
 * locally so typing a comma or a space never moves the caret.
 */
export function CommaListField({
  label,
  hint,
  error,
  values,
  onChange,
  className,
  placeholder,
}: {
  label: string;
  hint?: string;
  error?: string;
  values: string[];
  onChange: (values: string[]) => void;
  className?: string;
  placeholder?: string;
}) {
  const [text, setText] = useState(() => values.join(", "));

  return (
    <Field label={label} hint={hint} error={error} className={className}>
      <Input
        value={text}
        placeholder={placeholder}
        aria-invalid={error ? true : undefined}
        onChange={(event) => {
          setText(event.target.value);
          onChange(parseList(event.target.value));
        }}
      />
    </Field>
  );
}

/** The permanent id of a resume node. Shown, never editable. */
export function IdChip({ id, className }: { id: string; className?: string }) {
  return (
    <span
      title="Stable id. It never changes, so tailored resumes can refer to this entry."
      className={cn(
        "inline-block max-w-full truncate rounded border border-zinc-800 bg-zinc-950/60 px-1.5 py-0.5 font-mono text-[10px] leading-none text-zinc-500",
        className,
      )}
    >
      {id}
    </span>
  );
}

interface SectionCardProps {
  title: string;
  count?: number;
  /** Validation problems inside this section. */
  issueCount?: number;
  /** A control shown at the right of the header, e.g. an Add button. */
  action?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}

export function SectionCard({
  title,
  count,
  issueCount = 0,
  action,
  defaultOpen = true,
  children,
}: SectionCardProps) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();

  return (
    <section className="rounded-xl border border-zinc-800/80 bg-zinc-900/60 backdrop-blur-md">
      <div className="flex items-center gap-2 p-2">
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          aria-expanded={open}
          aria-controls={panelId}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors duration-150 outline-none hover:bg-zinc-800/40 focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronDown
            className={cn(
              "size-4 shrink-0 text-zinc-500 transition-transform duration-200 ease-out",
              !open && "-rotate-90",
            )}
            aria-hidden
          />
          <h2 className="text-sm font-medium">{title}</h2>
          {count !== undefined && (
            <span className="min-w-5 rounded-full bg-zinc-800/80 px-1.5 py-0.5 text-center text-[11px] font-medium text-zinc-400 tabular-nums">
              {count}
            </span>
          )}
          {issueCount > 0 && (
            <span className="text-xs text-red-400">{issueCount} to fix</span>
          )}
        </button>
        {action}
      </div>
      <Collapse open={open} id={panelId}>
        <div className="border-t border-zinc-800/80 p-4">{children}</div>
      </Collapse>
    </section>
  );
}
