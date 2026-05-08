import type { VehiclePacklist, ChecklistItem } from '@/types/productions';

function normalizeQtyItem(item: ChecklistItem): ChecklistItem {
  const parsed = Number(item.quantity ?? 1);
  const quantity = Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 1;
  return {
    ...item,
    quantity,
    reservedQuantity: Number(item.reservedQuantity ?? 0) || 0,
    checkedOutQuantity: Number(item.checkedOutQuantity ?? 0) || 0,
  };
}

/** Migrate legacy packs that only stored a flat `items` array */
export function ensureVehiclePacklistShape(packlist: VehiclePacklist): VehiclePacklist {
  return {
    ...packlist,
    items: [...(packlist.items ?? [])],
    sections: [...(packlist.sections ?? [])],
  };
}

export function normalizeVehiclePacklist(packlist: VehiclePacklist): VehiclePacklist {
  const shaped = ensureVehiclePacklistShape(packlist);
  return {
    ...shaped,
    items: shaped.items.map(normalizeQtyItem),
    sections: shaped.sections.map((section) => ({
      ...section,
      items: section.items.map(normalizeQtyItem),
    })),
  };
}

/** All packlist inventory lines in display order (sections top to bottom, then loose items). */
export function flattenVehiclePacklistItems(packlist: VehiclePacklist): ChecklistItem[] {
  const shaped = ensureVehiclePacklistShape(packlist);
  const fromSections = shaped.sections.flatMap((s) => s.items);
  return [...fromSections, ...shaped.items];
}

export type PacklistLineLocation =
  | { kind: 'loose' }
  | { kind: 'section'; sectionId: string };

export function iteratePacklistItemLocations(
  packlist: VehiclePacklist,
  visit: (item: ChecklistItem, location: PacklistLineLocation) => void,
): void {
  const shaped = ensureVehiclePacklistShape(packlist);
  for (const section of shaped.sections) {
    for (const item of section.items) {
      visit(item, { kind: 'section', sectionId: section.id });
    }
  }
  for (const item of shaped.items) {
    visit(item, { kind: 'loose' });
  }
}

export function upsertVehiclePacklistItemById(
  packlist: VehiclePacklist,
  itemId: string,
  updater: (item: ChecklistItem) => ChecklistItem,
): VehiclePacklist {
  const shaped = ensureVehiclePacklistShape(packlist);
  let changed = false;
  const sections = shaped.sections.map((section) => ({
    ...section,
    items: section.items.map((item) => {
      if (item.id !== itemId) return item;
      changed = true;
      return updater(item);
    }),
  }));
  const items = shaped.items.map((item) => {
    if (item.id !== itemId) return item;
    changed = true;
    return updater(item);
  });
  if (!changed) return shaped;
  return { ...shaped, sections, items };
}

export function removeVehiclePacklistItemById(packlist: VehiclePacklist, itemId: string): VehiclePacklist | null {
  const shaped = ensureVehiclePacklistShape(packlist);
  let removed = false;
  const sections = shaped.sections.map((section) => {
    const next = section.items.filter((item) => {
      if (item.id === itemId) {
        removed = true;
        return false;
      }
      return true;
    });
    return { ...section, items: next };
  });
  const items = shaped.items.filter((item) => {
    if (item.id === itemId) {
      removed = true;
      return false;
    }
    return true;
  });
  if (!removed) return null;
  return { ...shaped, sections, items };
}
