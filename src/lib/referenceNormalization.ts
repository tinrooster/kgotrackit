import type { ItemWithSubcategories } from "@/types/inventory";
import { resolveProjectValue } from "@/lib/projectOptions";

/**
 * Normalize location to canonical id/path id used by forms.
 * Returns empty string when value does not map to a known location option.
 */
export function normalizeLocationValue(
  rawValue: string | undefined,
  locations: ItemWithSubcategories[],
): string {
  const value = (rawValue ?? "").trim();
  if (!value) return "";

  const options: string[] = [];
  const labels = new Map<string, string>();
  for (const loc of locations) {
    options.push(loc.id);
    labels.set(loc.name, loc.id);
    for (const child of loc.children || []) {
      const id = `${loc.id}/${child.id}`;
      options.push(id);
      labels.set(`${loc.name}/${child.name}`, id);
      labels.set(child.name, id);
    }
  }

  if (options.includes(value)) return value;
  const byLabel = labels.get(value);
  if (byLabel) return byLabel;
  return "";
}

/**
 * Normalize project value to canonical id/path id; empty when invalid.
 */
export function normalizeProjectValue(
  rawValue: string | undefined,
  projects: ItemWithSubcategories[],
): string {
  const value = (rawValue ?? "").trim();
  if (!value) return "";
  const resolved = resolveProjectValue(value, projects);
  return resolved === value ? "" : resolved;
}
