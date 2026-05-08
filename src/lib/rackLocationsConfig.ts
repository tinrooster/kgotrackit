import { z } from "zod";
import embedded from "@/config/rack-locations.default.json";
import type { ItemWithSubcategories } from "@/types/inventory";
import { findLocationByFlatId, getFlatLocationDisplayName } from "@/lib/locationOptions";

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

/** First rack slot for a location: custom `rackSlots` when enabled, else preset from rack rules. */
export function getDefaultRackSlotForLocationFlatId(
  locations: ItemWithSubcategories[],
  flatId: string,
): string {
  const row = findLocationByFlatId(locations, flatId);
  if (row?.rackLocationEnabled === true && Array.isArray(row.rackSlots) && row.rackSlots.length > 0) {
    return String(row.rackSlots[0]).trim();
  }
  const label = getFlatLocationDisplayName(locations, flatId);
  let presets = getRackOptionsForFlatLocationLabel(label);
  if (presets.length === 0 && flatId.includes("/")) {
    presets = getRackOptionsForSubLocationKey(flatId.split("/").pop() ?? "");
  }
  return presets[0] ?? "";
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
