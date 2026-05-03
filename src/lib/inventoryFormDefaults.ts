import type { ItemWithSubcategories } from "@/types/inventory";

/** `YYYY-MM-DD` for `<input type="date" />` in local time. */
export function getTodayDateInputValue(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Prefer a unit named "Single" (case-insensitive), else first configured unit. */
export function resolveDefaultUnitName(units: ItemWithSubcategories[]): string {
  if (!units.length) {
    return "";
  }
  const single = units.find((u) => u.name.toLowerCase() === "single");
  return single?.name ?? units[0].name;
}
