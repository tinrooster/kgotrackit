/** User-extendable picklists for bulk cable fields (localStorage). */

const STORAGE_CABLE_COLORS = 'inventory-user-cable-colors';
const STORAGE_CONNECTOR_TYPES = 'inventory-user-connector-types';

export const DEFAULT_CABLE_COLORS = [
  'Yellow',
  'Blue',
  'Green',
  'Black',
  'Grey',
  'White',
] as const;

/** Built-in connector presets (user-defined entries are listed below a separator). */
export const DEFAULT_CONNECTOR_PRESETS = [
  'LC duplex',
  'LC simplex',
  'SC',
  'ST',
  'MTP/MPO',
  'RJ45',
] as const;

function readStringArray(key: string): string[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((x): x is string => typeof x === 'string' && x.trim().length > 0).map((s) => s.trim());
  } catch {
    return [];
  }
}

function writeStringArray(key: string, values: string[]): void {
  const unique = [...new Set(values.map((s) => s.trim()).filter(Boolean))];
  localStorage.setItem(key, JSON.stringify(unique));
}

export function getUserCableColors(): string[] {
  return readStringArray(STORAGE_CABLE_COLORS);
}

export function getUserConnectorTypes(): string[] {
  return readStringArray(STORAGE_CONNECTOR_TYPES);
}

/** Merged dropdown values including current item value if not already listed. */
export function getCableColorDropdownValues(currentValue?: string | null): string[] {
  const user = getUserCableColors();
  const set = new Set<string>([...DEFAULT_CABLE_COLORS, ...user]);
  const cur = currentValue?.trim();
  if (cur) {
    set.add(cur);
  }
  return [...set].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}

export function addUserCableColor(name: string): boolean {
  const trimmed = name.trim();
  if (!trimmed) {
    return false;
  }
  if (DEFAULT_CABLE_COLORS.some((c) => c.toLowerCase() === trimmed.toLowerCase())) {
    return false;
  }
  const user = getUserCableColors();
  if (user.some((c) => c.toLowerCase() === trimmed.toLowerCase())) {
    return false;
  }
  writeStringArray(STORAGE_CABLE_COLORS, [...user, trimmed]);
  return true;
}

/** Persist a custom cable color when chosen or saved (skips defaults and duplicates). */
export function rememberCableColorFromSelection(value: string | undefined): void {
  const trimmed = value?.trim();
  if (!trimmed) {
    return;
  }
  if (DEFAULT_CABLE_COLORS.some((c) => c.toLowerCase() === trimmed.toLowerCase())) {
    return;
  }
  const user = getUserCableColors();
  if (user.some((c) => c.toLowerCase() === trimmed.toLowerCase())) {
    return;
  }
  writeStringArray(STORAGE_CABLE_COLORS, [...user, trimmed]);
}

export function isPresetConnector(value: string): boolean {
  return DEFAULT_CONNECTOR_PRESETS.some((p) => p.toLowerCase() === value.trim().toLowerCase());
}

export function addUserConnectorType(name: string): boolean {
  const trimmed = name.trim();
  if (!trimmed) {
    return false;
  }
  if (isPresetConnector(trimmed)) {
    return false;
  }
  const user = getUserConnectorTypes();
  if (user.some((c) => c.toLowerCase() === trimmed.toLowerCase())) {
    return false;
  }
  writeStringArray(STORAGE_CONNECTOR_TYPES, [...user, trimmed]);
  return true;
}

export function getConnectorSelectModel(currentValue?: string | null): {
  presets: readonly string[];
  userDefined: string[];
  orphan?: string;
} {
  const userRaw = getUserConnectorTypes();
  const presetsLower = new Set(DEFAULT_CONNECTOR_PRESETS.map((p) => p.toLowerCase()));
  const userDefined = userRaw
    .filter((u) => !presetsLower.has(u.toLowerCase()))
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

  const cur = currentValue?.trim();
  let orphan: string | undefined;
  if (cur) {
    const inPreset = DEFAULT_CONNECTOR_PRESETS.some((p) => p.toLowerCase() === cur.toLowerCase());
    const inUser = userDefined.some((u) => u.toLowerCase() === cur.toLowerCase());
    if (!inPreset && !inUser) {
      orphan = cur;
    }
  }
  return { presets: DEFAULT_CONNECTOR_PRESETS, userDefined, orphan };
}
