/**
 * Quick, deterministic signals about a resume bullet. They are hints for
 * the writer, not rules: nothing here blocks saving.
 */

/** A bullet shorter than this rarely says what was done and what came of it. */
export const BULLET_MIN_CHARS = 40;
/** Roughly two lines on a one-page resume. Longer bullets tend to wrap to three. */
export const BULLET_MAX_CHARS = 220;

export type BulletLength = "empty" | "short" | "good" | "long";

export interface BulletQuality {
  chars: number;
  length: BulletLength;
  /** Carries a number: a metric, a count, a percentage, an amount. */
  quantified: boolean;
  /** The passive phrase it opens with, e.g. "Responsible for", if any. */
  weakOpener: string | null;
}

const WEAK_OPENER =
  /^(responsible for|worked on|helped( to| with)?|assisted( with| in)?|participated in|involved in|tasked with|duties included|in charge of)\b/i;

export function assessBullet(text: string): BulletQuality {
  const trimmed = text.trim();
  const chars = trimmed.length;

  return {
    chars,
    length:
      chars === 0
        ? "empty"
        : chars < BULLET_MIN_CHARS
          ? "short"
          : chars > BULLET_MAX_CHARS
            ? "long"
            : "good",
    quantified: /\d/.test(trimmed),
    weakOpener: WEAK_OPENER.exec(trimmed)?.[0] ?? null,
  };
}
