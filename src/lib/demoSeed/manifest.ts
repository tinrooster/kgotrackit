/**
 * Workspace-scoped manifest for demo lookup-list seeding.
 *
 * Lookup lists (`categories`, `units`, `locations`, `suppliers`, `projects`)
 * and the maintenance ON-AIR template are not entities and cannot carry an
 * `__demoSeed` stamp, so we record what was seeded in a side manifest. This
 * lets `stripDemoData` revert just the seeded entries (and only those still
 * untouched, in `unmodified` mode).
 *
 * One manifest entry per workspace context (`workspace:{id}` or `personal`).
 */

import { getActiveWorkspaceId } from '@/lib/supabase/workspaceData';
import type { MaintenanceOnAirSchedule } from '@/lib/settingsService';

export const DEMO_SEED_MANIFEST_STORAGE_KEY = 'trackit:demo-seed-manifest:v1';

export interface DemoSeedLookupSnapshot {
  /** Seeded names — strings for unit/category/etc., used for matching. */
  categories: string[];
  units: string[];
  locations: string[];
  suppliers: string[];
  projects: string[];
}

export interface DemoSeedManifest {
  /** Seed schema version that produced these values. */
  version: string;
  /** ISO timestamp when populate ran. */
  seededAt: string;
  /** Lookup-list values originally seeded into Settings. */
  lookups: DemoSeedLookupSnapshot;
  /**
   * Original on-air schedule deep-clone we wrote, so we know whether to revert
   * it on strip. `null` when populate skipped this scope.
   */
  onAirSchedule: MaintenanceOnAirSchedule | null;
}

type ManifestMap = Record<string, DemoSeedManifest>;

const manifestContextKey = (): string => {
  const id = getActiveWorkspaceId();
  return id ? `workspace:${id}` : 'personal';
};

const readManifestMap = (): ManifestMap => {
  try {
    const raw = localStorage.getItem(DEMO_SEED_MANIFEST_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as ManifestMap;
    }
    return {};
  } catch {
    return {};
  }
};

const writeManifestMap = (map: ManifestMap): void => {
  try {
    localStorage.setItem(DEMO_SEED_MANIFEST_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // ignore quota / private mode
  }
};

export const getDemoSeedManifest = (): DemoSeedManifest | null => {
  const map = readManifestMap();
  const entry = map[manifestContextKey()];
  return entry ?? null;
};

export const saveDemoSeedManifest = (manifest: DemoSeedManifest): void => {
  const map = readManifestMap();
  map[manifestContextKey()] = manifest;
  writeManifestMap(map);
};

export const clearDemoSeedManifest = (): void => {
  const map = readManifestMap();
  delete map[manifestContextKey()];
  writeManifestMap(map);
};

/**
 * Pre-record a manifest for a not-yet-active workspace ID. Mirrors
 * `recordSetupChoiceForWorkspace` in `dummyData.ts` for the same use case
 * (just-created workspaces that haven't been switched into yet).
 */
export const recordManifestForWorkspace = (workspaceId: string, manifest: DemoSeedManifest): void => {
  const map = readManifestMap();
  map[`workspace:${workspaceId}`] = manifest;
  writeManifestMap(map);
};
