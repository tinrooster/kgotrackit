/**
 * Per-user UI preferences for the bulk Import dialog.
 *
 * Stored in localStorage (no network round-trip needed for ephemeral UI state).
 * The key includes a stable per-user identifier (Supabase user id, falling back to
 * username/displayName) so multiple sign-ins on the same browser keep separate prefs.
 *
 * This module is intentionally self-contained (no dependency on `ImportDialog`) to
 * avoid an import cycle. The consumer is responsible for re-validating
 * `hiddenColumns` against its current field list, since we only persist strings here.
 */

export type ImportSourceMode = "grid" | "file" | "paste";

export interface ImportDialogPrefs {
  /** The tab the dialog should open on. New users get the input grid. */
  defaultTab: ImportSourceMode;
  /** String keys whose grid columns are hidden (consumer maps these to its own field set). */
  hiddenColumns: string[];
}

const DEFAULTS: Readonly<ImportDialogPrefs> = Object.freeze({
  defaultTab: "grid" as ImportSourceMode,
  hiddenColumns: [],
});

const STORAGE_PREFIX = "trackit:importDialogPrefs:";

const VALID_TABS: ReadonlySet<ImportSourceMode> = new Set<ImportSourceMode>([
  "grid",
  "file",
  "paste",
]);

/**
 * Compute the storage key for a given user. Falls back to a shared "guest" key when
 * no user identifier is provided (e.g. before auth resolves) so prefs are still
 * scoped per-browser instead of leaking into the global namespace.
 */
function storageKey(userKey: string | null | undefined): string {
  const safeKey = (userKey ?? "").trim();
  return `${STORAGE_PREFIX}${safeKey || "guest"}`;
}

/** Returns a defensive copy of the defaults so callers can't accidentally mutate them. */
export function defaultImportDialogPrefs(): ImportDialogPrefs {
  return { defaultTab: DEFAULTS.defaultTab, hiddenColumns: [...DEFAULTS.hiddenColumns] };
}

/** Loads prefs from localStorage, sanitizing any unknown values to defaults. */
export function loadImportDialogPrefs(userKey: string | null | undefined): ImportDialogPrefs {
  if (typeof window === "undefined") return defaultImportDialogPrefs();
  try {
    const raw = window.localStorage.getItem(storageKey(userKey));
    if (!raw) return defaultImportDialogPrefs();
    const parsed = JSON.parse(raw) as Partial<ImportDialogPrefs> | null;
    if (!parsed || typeof parsed !== "object") return defaultImportDialogPrefs();
    const tab: ImportSourceMode =
      typeof parsed.defaultTab === "string" && VALID_TABS.has(parsed.defaultTab as ImportSourceMode)
        ? (parsed.defaultTab as ImportSourceMode)
        : DEFAULTS.defaultTab;
    const hidden: string[] = Array.isArray(parsed.hiddenColumns)
      ? parsed.hiddenColumns.filter((value): value is string => typeof value === "string")
      : [];
    return { defaultTab: tab, hiddenColumns: hidden };
  } catch {
    return defaultImportDialogPrefs();
  }
}

/**
 * Persist prefs. Silently ignores quota errors / private browsing exceptions so the
 * dialog never breaks user input on a storage failure.
 */
export function saveImportDialogPrefs(
  userKey: string | null | undefined,
  prefs: ImportDialogPrefs
): void {
  if (typeof window === "undefined") return;
  try {
    const payload: ImportDialogPrefs = {
      defaultTab: VALID_TABS.has(prefs.defaultTab) ? prefs.defaultTab : DEFAULTS.defaultTab,
      hiddenColumns: prefs.hiddenColumns.filter((value) => typeof value === "string"),
    };
    window.localStorage.setItem(storageKey(userKey), JSON.stringify(payload));
  } catch {
    // Best-effort persistence; no surfacing to the user.
  }
}
