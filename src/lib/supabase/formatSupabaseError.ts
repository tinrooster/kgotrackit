/**
 * Human-readable message for Supabase PostgREST / Auth errors and unknown throws.
 * Avoids `[object Object]` when a toast stringifies a plain object.
 */
export function formatSupabaseOrUnknownError(error: unknown): string {
  if (error == null) {
    return "Unknown error.";
  }
  if (typeof error === "string") {
    return error.trim() || "Unknown error.";
  }
  if (error instanceof Error) {
    const msg = error.message.trim();
    if (msg) return msg;
  }
  if (typeof error === "object") {
    const o = error as Record<string, unknown>;
    const message = typeof o.message === "string" ? o.message.trim() : "";
    const details = typeof o.details === "string" ? o.details.trim() : "";
    const hint = typeof o.hint === "string" ? o.hint.trim() : "";
    const code = typeof o.code === "string" ? o.code.trim() : "";
    const status = typeof o.status === "number" ? String(o.status) : "";
    const joined = [message, details, hint].filter(Boolean).join(" — ");
    if (joined) {
      const suffix = [code && `code ${code}`, status && `HTTP ${status}`].filter(Boolean).join(", ");
      return suffix ? `${joined} (${suffix})` : joined;
    }
    try {
      const s = JSON.stringify(error);
      if (s && s !== "{}") return s;
    } catch {
      /* ignore */
    }
  }
  return "Unknown error.";
}
