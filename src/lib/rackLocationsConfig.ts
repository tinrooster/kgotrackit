import { z } from "zod";
import embedded from "@/config/rack-locations.default.json";

export const RACK_LOCATIONS_UPDATED_EVENT = "trackit:rack-locations-updated";

const ruleSchema = z.object({
  subLocation: z.string(),
  options: z.array(z.string()),
});

const fileSchema = z.object({
  version: z.number().optional(),
  rules: z.array(ruleSchema),
});

export type RackLocationsFile = z.infer<typeof fileSchema>;

function parseFile(raw: unknown): RackLocationsFile {
  return fileSchema.parse(raw);
}

let active: RackLocationsFile = parseFile(embedded as unknown);

function lastSegmentLower(flatLocationLabel: string): string {
  const parts = flatLocationLabel.split(/[/\\]/).map((p) => p.trim()).filter(Boolean);
  return (parts[parts.length - 1] ?? "").toLowerCase();
}

/** Rack preset options for a flattened location label (e.g. `Server Rooms / TE`). */
export function getRackOptionsForFlatLocationLabel(flatLocationLabel: string): string[] {
  const sub = lastSegmentLower(flatLocationLabel);
  const rule = active.rules.find((r) => r.subLocation.toLowerCase() === sub);
  return rule?.options ?? [];
}

/**
 * Match rack presets by sub-location key only (e.g. child `id` in `parentId/childId` when it equals a rule like `te`).
 */
export function getRackOptionsForSubLocationKey(subKey: string): string[] {
  const k = subKey.trim().toLowerCase();
  if (!k) {
    return [];
  }
  const rule = active.rules.find((r) => r.subLocation.toLowerCase() === k);
  return rule?.options ?? [];
}

/** Whether any rack rules are loaded (bundled or from `rack-locations.json`). */
export function hasRackLocationRules(): boolean {
  return active.rules.length > 0;
}

/** Fetch `public/config/rack-locations.json` (or base URL) and replace rules; falls back silently. */
export async function refreshRackLocationsFromServer(): Promise<void> {
  const base = import.meta.env.BASE_URL || "/";
  const url = `${base}config/rack-locations.json`;
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return;
    const next = parseFile(await res.json());
    active = next;
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(RACK_LOCATIONS_UPDATED_EVENT));
    }
  } catch {
    /* keep bundled default */
  }
}
