/**
 * Apply demo seed content to the active workspace (or personal storage).
 *
 * `populateDemoData` is the single canonical entry point. Callers (workspace
 * dialogs, dummyData starter flow, settings utilities) must go through here so
 * every demo entity gets:
 *  1. A stable `__demoSeed` stamp (version + content fingerprint), so a later
 *     `stripDemoData` call can identify it.
 *  2. A persisted manifest snapshot of seeded lookup-list values + on-air
 *     template, so strip can revert just those entries.
 *
 * The function merges into existing data — it never deletes user content. If
 * a row with the same demo ID already exists, it is replaced with the fresh
 * seed (so re-applying the seed after a partial strip is idempotent).
 */

import type { CategoryNode, InventoryItem, ItemWithSubcategories } from '@/types/inventory';
import type {
  PositionTemplate,
  Production,
} from '@/types/productions';
import type { CrewContact } from '@/types/crewContacts';

import { getItems, getSettings, saveItems, saveSettings, type Settings } from '@/lib/storageService';
import { getProductions, saveProductions } from '@/lib/productionService';
import { getCrewContacts, saveCrewContacts } from '@/lib/crewContactsService';
import { getPositionTemplates, savePositionTemplates } from '@/lib/positionTemplatesService';
import { SettingsService, DEMO_BROADCAST_ON_AIR_TEMPLATE } from '@/lib/settingsService';

import {
  DEMO_SEED_FIELD,
  DEMO_SEED_VERSION,
  fingerprintEntity,
  type DemoEntityKind,
} from './fingerprint';
import { saveDemoSeedManifest, type DemoSeedManifest } from './manifest';
import { DEMO_SEED_SOURCE } from './seedData';
import { DEMO_SEED_SOURCE_INTERNAL } from './seedData.internal';

/** Toggleable populate scopes. All default to true in `populateDemoData`. */
export interface PopulateDemoDataOptions {
  /** Lookup lists (categories, units, locations, suppliers, projects). */
  lookupLists?: boolean;
  /** Sample inventory rows. */
  inventory?: boolean;
  /** Productions, master crew, position templates (3 productions + 2 parade demos). */
  productions?: boolean;
  /** Maintenance ON-AIR schedule template. */
  onAirTemplate?: boolean;
}

export interface PopulateDemoDataResult {
  inventoryAdded: number;
  productionsAdded: number;
  crewContactsAdded: number;
  positionTemplatesAdded: number;
  lookupListsApplied: boolean;
  onAirTemplateApplied: boolean;
}

const cloneJson = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** Stamp the entity with version + freshly computed fingerprint. */
function stampDemoEntity<T extends Record<string, unknown>>(entity: T, kind: DemoEntityKind): T {
  const fingerprint = fingerprintEntity(entity, kind);
  return {
    ...entity,
    [DEMO_SEED_FIELD]: { version: DEMO_SEED_VERSION, fingerprint },
  };
}

function mergeById<T extends { id: string }>(existing: T[], incoming: T[]): T[] {
  const seen = new Set(incoming.map((row) => row.id));
  const kept = existing.filter((row) => !seen.has(row.id));
  return [...kept, ...incoming];
}

function mergeUniqueByName<T extends { id: string; name: string }>(
  existing: T[],
  incoming: T[],
): T[] {
  const existingNames = new Set(existing.map((row) => row.name.trim().toLowerCase()));
  const additions = incoming.filter(
    (row) => !existingNames.has(row.name.trim().toLowerCase()),
  );
  return [...existing, ...additions];
}

function mergeCategoryNodes(existing: CategoryNode[], incoming: CategoryNode[]): CategoryNode[] {
  return mergeUniqueByName(existing, incoming);
}

function mergeListSettings(
  existingList: ItemWithSubcategories[] | undefined,
  incomingList: ItemWithSubcategories[],
): ItemWithSubcategories[] {
  const existing = Array.isArray(existingList) ? existingList : [];
  return mergeUniqueByName(existing, incomingList);
}

function applyLookupLists(): {
  applied: boolean;
  snapshotNames: DemoSeedManifest['lookups'];
} {
  const currentSettings = getSettings();
  const incoming = DEMO_SEED_SOURCE.lookups;

  const nextSettings: Settings = {
    ...currentSettings,
    categories: mergeCategoryNodes(currentSettings.categories, cloneJson(incoming.categories)),
    units: mergeListSettings(currentSettings.units, cloneJson(incoming.units)),
    locations: mergeListSettings(currentSettings.locations, cloneJson(incoming.locations)),
    suppliers: mergeListSettings(currentSettings.suppliers, cloneJson(incoming.suppliers)),
    projects: mergeListSettings(currentSettings.projects, cloneJson(incoming.projects)),
  };
  saveSettings(nextSettings);

  return {
    applied: true,
    snapshotNames: {
      categories: incoming.categories.map((row) => row.name),
      units: incoming.units.map((row) => row.name),
      locations: incoming.locations.map((row) => row.name),
      suppliers: incoming.suppliers.map((row) => row.name),
      projects: incoming.projects.map((row) => row.name),
    },
  };
}

function applyInventory(): number {
  const stamped: InventoryItem[] = DEMO_SEED_SOURCE.inventory.map((source) => {
    const cloned = cloneJson(source);
    return stampDemoEntity(cloned as unknown as Record<string, unknown>, 'inventory') as unknown as InventoryItem;
  });
  const existing = getItems();
  saveItems(mergeById(existing, stamped));
  return stamped.length;
}

function applyPositionTemplates(): number {
  const stamped: PositionTemplate[] = DEMO_SEED_SOURCE.positionTemplates.map((source) => {
    const cloned = cloneJson(source);
    return stampDemoEntity(cloned as unknown as Record<string, unknown>, 'positionTemplate') as unknown as PositionTemplate;
  });
  const existing = getPositionTemplates();
  const merged = mergeById(existing, stamped).map((template, index) => ({
    ...template,
    sortOrder: typeof template.sortOrder === 'number' ? template.sortOrder : index,
  }));
  savePositionTemplates(merged);
  return stamped.length;
}

function applyCrewContacts(): number {
  const stamped: CrewContact[] = DEMO_SEED_SOURCE.crewContacts.map((source) => {
    const cloned = cloneJson(source);
    return stampDemoEntity(cloned as unknown as Record<string, unknown>, 'crewContact') as unknown as CrewContact;
  });
  const existing = getCrewContacts();
  saveCrewContacts(mergeById(existing, stamped));
  return stamped.length;
}

function applyProductions(): number {
  const stamped: Production[] = DEMO_SEED_SOURCE.productions.map((source) => {
    const cloned = cloneJson(source);
    return stampDemoEntity(cloned as unknown as Record<string, unknown>, 'production') as unknown as Production;
  });
  const existing = getProductions();
  saveProductions(mergeById(existing, stamped));
  return stamped.length;
}

/**
 * Replace **all** persisted productions with the INTERNAL demo seed bundle only.
 * Ignores `VITE_DEMO_SEED_PROFILE` — always uses `seedData.internal.ts`.
 * Destructive: any production not defined in that bundle is removed from local storage.
 */
export function replaceProductionsWithInternalDemoSeed(): number {
  const stamped: Production[] = DEMO_SEED_SOURCE_INTERNAL.productions.map((source) => {
    const cloned = cloneJson(source);
    return stampDemoEntity(cloned as unknown as Record<string, unknown>, 'production') as unknown as Production;
  });
  saveProductions(stamped);
  return stamped.length;
}

function applyOnAirTemplate(): boolean {
  const ui = SettingsService.loadDefaultSettings();
  const next = {
    ...ui,
    maintenanceOnAirSchedule: { ...DEMO_BROADCAST_ON_AIR_TEMPLATE },
  };
  SettingsService.saveDefaultSettings(next);
  return true;
}

/**
 * Apply demo content to the current workspace context. Each scope is
 * idempotent: re-running the function replaces previously seeded rows by ID
 * and preserves any other user data. Updates the demo-seed manifest so that
 * a future `stripDemoData` call can revert lookup-list entries / ON-AIR
 * template even though those don't carry per-row `__demoSeed` markers.
 */
export function populateDemoData(
  options: PopulateDemoDataOptions = {},
): PopulateDemoDataResult {
  const lookupLists = options.lookupLists ?? true;
  const inventory = options.inventory ?? true;
  const productions = options.productions ?? true;
  const onAirTemplate = options.onAirTemplate ?? true;

  let lookupSnapshotNames: DemoSeedManifest['lookups'] = {
    categories: [],
    units: [],
    locations: [],
    suppliers: [],
    projects: [],
  };
  let lookupApplied = false;

  if (lookupLists) {
    const result = applyLookupLists();
    lookupApplied = result.applied;
    lookupSnapshotNames = result.snapshotNames;
  }

  const inventoryAdded = inventory ? applyInventory() : 0;

  let productionsAdded = 0;
  let crewContactsAdded = 0;
  let positionTemplatesAdded = 0;
  if (productions) {
    positionTemplatesAdded = applyPositionTemplates();
    crewContactsAdded = applyCrewContacts();
    productionsAdded = applyProductions();
  }

  const onAirApplied = onAirTemplate ? applyOnAirTemplate() : false;

  saveDemoSeedManifest({
    version: DEMO_SEED_VERSION,
    seededAt: new Date().toISOString(),
    lookups: lookupSnapshotNames,
    onAirSchedule: onAirApplied ? cloneJson(DEMO_BROADCAST_ON_AIR_TEMPLATE) : null,
  });

  return {
    inventoryAdded,
    productionsAdded,
    crewContactsAdded,
    positionTemplatesAdded,
    lookupListsApplied: lookupApplied,
    onAirTemplateApplied: onAirApplied,
  };
}
