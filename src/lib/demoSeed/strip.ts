/**
 * Remove demo-seeded content from the active workspace (or personal storage).
 *
 * Two modes:
 *  - `'all'`         : drop every entity that carries `__demoSeed`,
 *                      regardless of edits, and revert manifested lookup-list
 *                      values + ON-AIR template if they still match.
 *  - `'unmodified'`  : drop only when the entity's current stable fingerprint
 *                      still matches its stamp (no user edits) AND, for
 *                      productions, no checkout/reserve activity has touched
 *                      its checklist items. Lookup-list entries are removed
 *                      only if their value is unchanged from the manifest.
 *
 * Strip is non-destructive to user data: rows without `__demoSeed` are never
 * touched, and modified demo rows are kept untouched in `unmodified` mode.
 */

import type { InventoryItem, ItemWithSubcategories } from '@/types/inventory';
import type { Production } from '@/types/productions';
import type { CrewContact } from '@/types/crewContacts';

import { getItems, getSettings, saveItems, saveSettings } from '@/lib/storageService';
import { getProductions, saveProductions } from '@/lib/productionService';
import { getCrewContacts, saveCrewContacts } from '@/lib/crewContactsService';
import { getPositionTemplates, savePositionTemplates } from '@/lib/positionTemplatesService';
import {
  SettingsService,
  type MaintenanceOnAirSchedule,
  EMPTY_MAINTENANCE_ON_AIR_SCHEDULE,
} from '@/lib/settingsService';

import { isDemoEntity, isDemoEntityUnmodified } from './fingerprint';
import { clearDemoSeedManifest, getDemoSeedManifest } from './manifest';

export type StripDemoMode = 'all' | 'unmodified';

export interface StripDemoDataResult {
  mode: StripDemoMode;
  inventoryRemoved: number;
  inventoryKeptModified: number;
  productionsRemoved: number;
  productionsKeptModified: number;
  productionsKeptDueToActivity: number;
  crewContactsRemoved: number;
  crewContactsKeptModified: number;
  positionTemplatesRemoved: number;
  positionTemplatesKeptModified: number;
  lookupListsRemoved: {
    categories: number;
    units: number;
    locations: number;
    suppliers: number;
    projects: number;
  };
  onAirTemplateReverted: boolean;
  manifestCleared: boolean;
}

const isProductionWithCheckoutActivity = (production: Production): boolean => {
  for (const group of production.checklistGroups) {
    for (const item of group.items) {
      if ((item.reservedQuantity ?? 0) > 0) return true;
      if ((item.checkedOutQuantity ?? 0) > 0) return true;
    }
  }
  for (const packlist of production.vehiclePacklists) {
    for (const item of packlist.items) {
      if ((item.reservedQuantity ?? 0) > 0) return true;
      if ((item.checkedOutQuantity ?? 0) > 0) return true;
    }
    for (const section of packlist.sections ?? []) {
      for (const item of section.items) {
        if ((item.reservedQuantity ?? 0) > 0) return true;
        if ((item.checkedOutQuantity ?? 0) > 0) return true;
      }
    }
  }
  return false;
};

function nameKey(value: string | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

function stripLookupList(
  current: ItemWithSubcategories[] | undefined,
  manifestNames: string[] | undefined,
  mode: StripDemoMode,
): { next: ItemWithSubcategories[]; removed: number } {
  if (!Array.isArray(current) || !Array.isArray(manifestNames) || manifestNames.length === 0) {
    return { next: Array.isArray(current) ? current : [], removed: 0 };
  }
  const seedKeys = new Set(manifestNames.map(nameKey));
  // For lookup lists, "modified" means a row in the seeded set whose simple
  // string name changed. Since the merged-by-name approach in populate keeps
  // the user's existing name as-is when there's a conflict, anything still
  // matching by name is considered seed-derived. We always drop matching rows;
  // there is no per-row fingerprint to differentiate `all` vs `unmodified`.
  // For `unmodified`, we still drop matching rows because lookup-list rows are
  // value-only and an unchanged value is, by definition, unmodified.
  void mode; // both modes behave identically for plain lookup-list values
  let removed = 0;
  const next = current.filter((row) => {
    const isSeed = seedKeys.has(nameKey(row.name));
    if (isSeed) removed += 1;
    return !isSeed;
  });
  return { next, removed };
}

function stripCategoryList(
  current: ReadonlyArray<{ id: string; name: string }> | undefined,
  manifestNames: string[] | undefined,
): { next: Array<{ id: string; name: string }>; removed: number } {
  if (!Array.isArray(current) || !Array.isArray(manifestNames) || manifestNames.length === 0) {
    return { next: Array.isArray(current) ? [...current] : [], removed: 0 };
  }
  const seedKeys = new Set(manifestNames.map(nameKey));
  let removed = 0;
  const next = current.filter((row) => {
    const isSeed = seedKeys.has(nameKey(row.name));
    if (isSeed) removed += 1;
    return !isSeed;
  });
  return { next, removed };
}

function arraysEqual(left: string[] | undefined, right: string[] | undefined): boolean {
  if (!left || !right) return false;
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function onAirTemplateMatches(
  current: MaintenanceOnAirSchedule | null | undefined,
  manifestSchedule: MaintenanceOnAirSchedule | null,
): boolean {
  if (!manifestSchedule || !current) return false;
  const days: Array<keyof MaintenanceOnAirSchedule> = [
    'sunday',
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
  ];
  return days.every((day) => arraysEqual(current[day], manifestSchedule[day]));
}

/**
 * Remove demo content. Returns counts so callers can render a meaningful
 * confirmation toast.
 */
export function stripDemoData(mode: StripDemoMode): StripDemoDataResult {
  const result: StripDemoDataResult = {
    mode,
    inventoryRemoved: 0,
    inventoryKeptModified: 0,
    productionsRemoved: 0,
    productionsKeptModified: 0,
    productionsKeptDueToActivity: 0,
    crewContactsRemoved: 0,
    crewContactsKeptModified: 0,
    positionTemplatesRemoved: 0,
    positionTemplatesKeptModified: 0,
    lookupListsRemoved: {
      categories: 0,
      units: 0,
      locations: 0,
      suppliers: 0,
      projects: 0,
    },
    onAirTemplateReverted: false,
    manifestCleared: false,
  };

  // ---- Inventory ----
  const items = getItems();
  const nextItems: InventoryItem[] = [];
  for (const item of items) {
    if (!isDemoEntity(item)) {
      nextItems.push(item);
      continue;
    }
    if (mode === 'all' || isDemoEntityUnmodified(item, 'inventory')) {
      result.inventoryRemoved += 1;
      continue;
    }
    result.inventoryKeptModified += 1;
    nextItems.push(item);
  }
  if (nextItems.length !== items.length) {
    saveItems(nextItems);
  }

  // ---- Productions ----
  const productions = getProductions();
  const nextProductions: Production[] = [];
  for (const production of productions) {
    if (!isDemoEntity(production)) {
      nextProductions.push(production);
      continue;
    }
    const hasActivity = isProductionWithCheckoutActivity(production);
    if (mode === 'unmodified') {
      if (hasActivity) {
        result.productionsKeptDueToActivity += 1;
        nextProductions.push(production);
        continue;
      }
      if (!isDemoEntityUnmodified(production, 'production')) {
        result.productionsKeptModified += 1;
        nextProductions.push(production);
        continue;
      }
    }
    result.productionsRemoved += 1;
  }
  if (nextProductions.length !== productions.length) {
    saveProductions(nextProductions);
  }

  // ---- Crew contacts ----
  const crew = getCrewContacts();
  const nextCrew: CrewContact[] = [];
  for (const contact of crew) {
    if (!isDemoEntity(contact)) {
      nextCrew.push(contact);
      continue;
    }
    if (mode === 'all' || isDemoEntityUnmodified(contact, 'crewContact')) {
      result.crewContactsRemoved += 1;
      continue;
    }
    result.crewContactsKeptModified += 1;
    nextCrew.push(contact);
  }
  if (nextCrew.length !== crew.length) {
    saveCrewContacts(nextCrew);
  }

  // ---- Position templates ----
  const templates = getPositionTemplates();
  const nextTemplates = templates.filter((template) => {
    if (!isDemoEntity(template)) return true;
    if (mode === 'all' || isDemoEntityUnmodified(template, 'positionTemplate')) {
      result.positionTemplatesRemoved += 1;
      return false;
    }
    result.positionTemplatesKeptModified += 1;
    return true;
  });
  if (nextTemplates.length !== templates.length) {
    savePositionTemplates(
      nextTemplates.map((template, index) => ({ ...template, sortOrder: index })),
    );
  }

  // ---- Lookup lists (manifest-driven) ----
  const manifest = getDemoSeedManifest();
  if (manifest) {
    const settings = getSettings();
    const categoryStrip = stripCategoryList(settings.categories, manifest.lookups.categories);
    const unitsStrip = stripLookupList(settings.units, manifest.lookups.units, mode);
    const locationsStrip = stripLookupList(settings.locations, manifest.lookups.locations, mode);
    const suppliersStrip = stripLookupList(settings.suppliers, manifest.lookups.suppliers, mode);
    const projectsStrip = stripLookupList(settings.projects, manifest.lookups.projects, mode);

    result.lookupListsRemoved = {
      categories: categoryStrip.removed,
      units: unitsStrip.removed,
      locations: locationsStrip.removed,
      suppliers: suppliersStrip.removed,
      projects: projectsStrip.removed,
    };

    const totalLookupRemoved =
      categoryStrip.removed +
      unitsStrip.removed +
      locationsStrip.removed +
      suppliersStrip.removed +
      projectsStrip.removed;

    if (totalLookupRemoved > 0) {
      saveSettings({
        ...settings,
        categories: categoryStrip.next as typeof settings.categories,
        units: unitsStrip.next,
        locations: locationsStrip.next,
        suppliers: suppliersStrip.next,
        projects: projectsStrip.next,
      });
    }

    // ---- Maintenance ON-AIR template ----
    if (manifest.onAirSchedule) {
      const ui = SettingsService.loadDefaultSettings();
      const current = ui.maintenanceOnAirSchedule ?? null;
      const matches = onAirTemplateMatches(current, manifest.onAirSchedule);
      if (mode === 'all' || matches) {
        SettingsService.saveDefaultSettings({
          ...ui,
          maintenanceOnAirSchedule: { ...EMPTY_MAINTENANCE_ON_AIR_SCHEDULE },
        });
        result.onAirTemplateReverted = true;
      }
    }

    clearDemoSeedManifest();
    result.manifestCleared = true;
  }

  return result;
}

/**
 * Lightweight summary of demo content currently present in the active context.
 * Used by the UI to render counts before/after strip operations.
 */
export interface DemoPresenceSummary {
  inventory: number;
  productions: number;
  crewContacts: number;
  positionTemplates: number;
  hasManifest: boolean;
}

export function summarizeDemoPresence(): DemoPresenceSummary {
  return {
    inventory: getItems().filter((row) => isDemoEntity(row)).length,
    productions: getProductions().filter((row) => isDemoEntity(row)).length,
    crewContacts: getCrewContacts().filter((row) => isDemoEntity(row)).length,
    positionTemplates: getPositionTemplates().filter((row) => isDemoEntity(row)).length,
    hasManifest: Boolean(getDemoSeedManifest()),
  };
}
