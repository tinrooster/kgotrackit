import type { ItemWithSubcategories } from '@/types/inventory';

/** Resolve the location row (parent or child) for a flattened location form value. */
export function findLocationByFlatId(
  locations: ItemWithSubcategories[],
  flatId: string | undefined,
): ItemWithSubcategories | undefined {
  if (!flatId?.trim()) {
    return undefined;
  }
  for (const loc of locations) {
    if (loc.id === flatId) {
      return loc;
    }
    for (const sub of loc.children || []) {
      if (`${loc.id}/${sub.id}` === flatId) {
        return sub;
      }
    }
  }
  return undefined;
}
