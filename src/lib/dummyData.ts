/**
 * Starter templates used only when a user explicitly opts in.
 *
 * The actual writes are delegated to `src/lib/demoSeed/populateDemoData` so
 * every seeded entity carries a `__demoSeed` stamp and is later strippable via
 * `stripDemoData`. The legacy exports below (`DUMMY_INVENTORY_DATA`,
 * `INITIAL_SETTINGS`) remain for backwards-compat with workspace dialogs that
 * build a snapshot payload directly; they now mirror the curated demo seed.
 */

import { type InventoryItem } from '@/types/inventory';
import type { CrewContact } from '@/types/crewContacts';
import type { PositionTemplate, Production } from '@/types/productions';
import { STORAGE_KEYS } from './storageService';
import { getItems, getSettings } from './storageService';
import { getActiveWorkspaceId } from './supabase/workspaceData';
import {
  DEMO_SEED_FIELD,
  DEMO_SEED_SOURCE,
  DEMO_SEED_VERSION,
  fingerprintEntity,
  populateDemoData,
} from '@/lib/demoSeed';

const cloneTemplate = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const setupContextKey = (): string => {
  const activeWorkspaceId = getActiveWorkspaceId();
  return activeWorkspaceId ? `workspace:${activeWorkspaceId}` : 'personal';
};

/**
 * Curated demo inventory rows, pre-stamped with `__demoSeed`. This list is
 * what `CreateWorkspaceDialog` / `WorkspaceUtilitiesDialog` push into the
 * workspace snapshot when the user opts into "Include sample inventory".
 *
 * Each row carries the same `version` + `fingerprint` it would have received
 * from `populateDemoData`, so a later `stripDemoData` against that workspace
 * will identify and remove these rows even though they bypassed the regular
 * populate path. The dialog should also call `recordManifestForWorkspace` to
 * cover lookup-list strip on the new workspace.
 */
export const DUMMY_INVENTORY_DATA: InventoryItem[] = DEMO_SEED_SOURCE.inventory.map((source) => {
  const cloned = cloneTemplate(source);
  const fingerprint = fingerprintEntity(cloned, 'inventory');
  return {
    ...cloned,
    [DEMO_SEED_FIELD]: { version: DEMO_SEED_VERSION, fingerprint },
  } as InventoryItem;
});

/** Pre-stamped demo productions, ready to write into a workspace snapshot. */
export const DUMMY_PRODUCTIONS_DATA: Production[] = DEMO_SEED_SOURCE.productions.map((source) => {
  const cloned = cloneTemplate(source);
  const fingerprint = fingerprintEntity(cloned, 'production');
  return {
    ...cloned,
    [DEMO_SEED_FIELD]: { version: DEMO_SEED_VERSION, fingerprint },
  } as Production;
});

/** Pre-stamped demo crew contacts (mirrored into both workspace + organization snapshots). */
export const DUMMY_CREW_CONTACTS_DATA: CrewContact[] = DEMO_SEED_SOURCE.crewContacts.map((source) => {
  const cloned = cloneTemplate(source);
  const fingerprint = fingerprintEntity(cloned, 'crewContact');
  return {
    ...cloned,
    [DEMO_SEED_FIELD]: { version: DEMO_SEED_VERSION, fingerprint },
  } as CrewContact;
});

/** Pre-stamped demo position templates, written into the new organization's app data row. */
export const DUMMY_POSITION_TEMPLATES_DATA: PositionTemplate[] = DEMO_SEED_SOURCE.positionTemplates.map(
  (source) => {
    const cloned = cloneTemplate(source);
    const fingerprint = fingerprintEntity(cloned, 'positionTemplate');
    return {
      ...cloned,
      [DEMO_SEED_FIELD]: { version: DEMO_SEED_VERSION, fingerprint },
    } as PositionTemplate;
  },
);

/** Initial lookup-list defaults keyed by storage key (legacy shape). */
export const INITIAL_SETTINGS = {
  [STORAGE_KEYS.CATEGORIES]: cloneTemplate(DEMO_SEED_SOURCE.lookups.categories),
  [STORAGE_KEYS.UNITS]: cloneTemplate(DEMO_SEED_SOURCE.lookups.units),
  [STORAGE_KEYS.LOCATIONS]: cloneTemplate(DEMO_SEED_SOURCE.lookups.locations),
  [STORAGE_KEYS.SUPPLIERS]: cloneTemplate(DEMO_SEED_SOURCE.lookups.suppliers),
  [STORAGE_KEYS.PROJECTS]: cloneTemplate(DEMO_SEED_SOURCE.lookups.projects),
};

export type SetupDefaultsChoice = 'blank' | 'starter';

const SETUP_DEFAULTS_CHOICE_KEY = 'trackit:setup-defaults-choice:v1';

const readChoiceMap = (): Record<string, SetupDefaultsChoice> => {
  try {
    const raw = localStorage.getItem(SETUP_DEFAULTS_CHOICE_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as Record<string, SetupDefaultsChoice>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

const writeChoiceMap = (map: Record<string, SetupDefaultsChoice>): void => {
  localStorage.setItem(SETUP_DEFAULTS_CHOICE_KEY, JSON.stringify(map));
};

export const getSetupDefaultsChoice = (): SetupDefaultsChoice | null => {
  const rawChoice = readChoiceMap()[setupContextKey()];
  if (rawChoice === 'blank' || rawChoice === 'starter') {
    return rawChoice;
  }
  return null;
};

export const clearSetupDefaultsChoice = (): void => {
  const map = readChoiceMap();
  delete map[setupContextKey()];
  writeChoiceMap(map);
};

export const isFreshSetupState = (): boolean => {
  const settings = getSettings();
  const hasSettingsData = [
    settings.categories,
    settings.units,
    settings.locations,
    settings.suppliers,
    settings.projects,
    settings.expenseCodes,
  ].some((list) => list.length > 0);
  if (hasSettingsData) {
    return false;
  }

  const existingItems = getItems();
  return existingItems.length === 0;
};

/**
 * Pre-record a setup choice for a specific workspace ID before it becomes the active context.
 * Use this when creating a new workspace so InitialDefaultsDialog never fires for that workspace.
 */
export const recordSetupChoiceForWorkspace = (workspaceId: string, choice: SetupDefaultsChoice): void => {
  const map = readChoiceMap();
  map[`workspace:${workspaceId}`] = choice;
  writeChoiceMap(map);
};

/**
 * Apply the user's first-run setup choice to the active context. Routed
 * through `populateDemoData` so seeded inventory carries `__demoSeed` stamps.
 *
 * `includeSampleInventory` preserves the existing personal/InitialDefaultsDialog
 * UX. Productions / crew / position templates are NOT applied here — those
 * are opt-in via Settings → Workspace Utilities → Demo data.
 */
export const applySetupDefaultsChoice = (
  choice: SetupDefaultsChoice,
  includeSampleInventory: boolean,
): void => {
  if (choice === 'starter') {
    populateDemoData({
      lookupLists: true,
      inventory: includeSampleInventory,
      productions: false,
      onAirTemplate: true,
    });
  }

  const map = readChoiceMap();
  map[setupContextKey()] = choice;
  writeChoiceMap(map);
};
