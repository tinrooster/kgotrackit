import type { ItemWithSubcategories } from "@/types/inventory";

/**
 * Resolves stored location value (parent id, `parent/child` composite, or legacy child-only id)
 * to a display label like `Studios/Deck`.
 */
export function resolveLocationDisplay(
  value: string | undefined,
  locations: ItemWithSubcategories[]
): string {
  if (!value) {
    return "-";
  }

  const flattened: { id: string; label: string }[] = [];
  for (const loc of locations) {
    flattened.push({ id: loc.id, label: loc.name });
    if (loc.children?.length) {
      for (const sub of loc.children) {
        flattened.push({
          id: `${loc.id}/${sub.id}`,
          label: `${loc.name}/${sub.name}`,
        });
      }
    }
  }

  const exact = flattened.find((e) => e.id === value);
  if (exact) {
    return exact.label;
  }

  const topOnly = flattened.find((e) => e.id === value && !e.id.includes("/"));
  if (topOnly) {
    return topOnly.label;
  }

  if (!value.includes("/")) {
    const compositeMatch = flattened.find(
      (e) => e.id.includes("/") && (e.id === value || e.id.endsWith(`/${value}`))
    );
    if (compositeMatch) {
      return compositeMatch.label;
    }
  }

  return value;
}
