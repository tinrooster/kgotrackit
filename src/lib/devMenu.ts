export const DEV_MENU_STORAGE_KEY = 'trackit:dev-menu-enabled';
export const DEV_MENU_UPDATED_EVENT = 'trackit:dev-menu-updated';

function readRawValue(): string | null {
  try {
    return sessionStorage.getItem(DEV_MENU_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function getDevMenuPreference(): boolean | null {
  const rawValue = readRawValue();
  if (rawValue === null) return null;
  return rawValue === '1';
}

export function isDevMenuEnabled(): boolean {
  return getDevMenuPreference() === true;
}

export function setDevMenuEnabled(enabled: boolean): void {
  try {
    sessionStorage.setItem(DEV_MENU_STORAGE_KEY, enabled ? '1' : '0');
  } catch {
    // no-op in non-browser/blocked storage contexts
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(DEV_MENU_UPDATED_EVENT, { detail: { enabled } }));
  }
}

