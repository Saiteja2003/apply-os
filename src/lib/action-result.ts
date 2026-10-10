/** Return type of every server action: errors are data, never thrown. */
export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; /** Machine-readable reason, when the UI acts on it. */ code?: string };
