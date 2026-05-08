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

/** Display label for a flattened location id (`parentId` or `parentId/childId`). */
export function getFlatLocationDisplayName(locations: ItemWithSubcategories[], flatId: string): string {
  for (const loc of locations) {
    if (loc.id === flatId) {
      return loc.name;
    }
    for (const sub of loc.children || []) {
      if (`${loc.id}/${sub.id}` === flatId) {
        return `${loc.name} / ${sub.name}`;
      }
    }
  }
  return '';
}
