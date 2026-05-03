import { STORAGE_KEYS } from '@/lib/storageService';
import type { DeviceLibraryEntry } from '@/types/deviceLibrary';
import { requestCloudSync } from '@/lib/cloudSyncEvents';

/** Fired after device library rows are written (same tab + other listeners). */
export const DEVICE_LIBRARY_UPDATED_EVENT = 'trackit:device-library-updated';

function notifyDeviceLibraryUpdated(): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.dispatchEvent(new CustomEvent(DEVICE_LIBRARY_UPDATED_EVENT));
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function normalizeEntry(raw: unknown): DeviceLibraryEntry | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const record = raw as Record<string, unknown>;
  const manufacturer = typeof record.manufacturer === 'string' ? record.manufacturer.trim() : '';
  if (!manufacturer) {
    return null;
  }
  const modelNumber = typeof record.modelNumber === 'string' ? record.modelNumber.trim() : '';
  const id =
    isNonEmptyString(record.id) ? String(record.id).trim() : crypto.randomUUID();
  const createdAt =
    isNonEmptyString(record.createdAt) ? String(record.createdAt).trim() : new Date().toISOString();
  const defaultSupplier =
    isNonEmptyString(record.defaultSupplier) ? String(record.defaultSupplier).trim() : undefined;
  const defaultSupplierWebsite =
    isNonEmptyString(record.defaultSupplierWebsite)
      ? String(record.defaultSupplierWebsite).trim()
      : undefined;
  const notes = isNonEmptyString(record.notes) ? String(record.notes).trim() : undefined;

  return {
    id,
    manufacturer,
    modelNumber,
    defaultSupplier,
    defaultSupplierWebsite,
    notes,
    createdAt,
  };
}

export function parseDeviceLibraryFromBackup(raw: unknown): DeviceLibraryEntry[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const out: DeviceLibraryEntry[] = [];
  for (const row of raw) {
    const entry = normalizeEntry(row);
    if (entry) {
      out.push(entry);
    }
  }
  return out;
}

export function getDeviceLibrary(): DeviceLibraryEntry[] {
  try {
    let fromElectron: DeviceLibraryEntry[] | undefined;
    try {
      fromElectron = window.electronStore?.getData?.(STORAGE_KEYS.DEVICE_LIBRARY) as
        | DeviceLibraryEntry[]
        | undefined;
    } catch {
      fromElectron = undefined;
    }

    if (fromElectron && Array.isArray(fromElectron)) {
      const valid = fromElectron.map(normalizeEntry).filter((e): e is DeviceLibraryEntry => e !== null);
      localStorage.setItem(STORAGE_KEYS.DEVICE_LIBRARY, JSON.stringify(valid));
      return valid;
    }

    const localRaw = localStorage.getItem(STORAGE_KEYS.DEVICE_LIBRARY);
    if (!localRaw) {
      return [];
    }
    const parsed = JSON.parse(localRaw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.map(normalizeEntry).filter((e): e is DeviceLibraryEntry => e !== null);
  } catch (error) {
    console.error('Error reading device library:', error);
    return [];
  }
}

export function saveDeviceLibrary(entries: DeviceLibraryEntry[]): void {
  const valid = entries.map(normalizeEntry).filter((e): e is DeviceLibraryEntry => e !== null);
  try {
    try {
      window.electronStore?.setData?.(STORAGE_KEYS.DEVICE_LIBRARY, valid);
    } catch (e) {
      console.warn('electronStore device library save failed, using localStorage:', e);
    }
    localStorage.setItem(STORAGE_KEYS.DEVICE_LIBRARY, JSON.stringify(valid));
    requestCloudSync();
    notifyDeviceLibraryUpdated();
  } catch (error) {
    console.error('Error saving device library:', error);
    try {
      localStorage.setItem(STORAGE_KEYS.DEVICE_LIBRARY, JSON.stringify(valid));
      requestCloudSync();
      notifyDeviceLibraryUpdated();
    } catch {
      throw error;
    }
  }
}

export function createDeviceLibraryEntry(input: {
  manufacturer: string;
  modelNumber: string;
  defaultSupplier?: string;
  defaultSupplierWebsite?: string;
  notes?: string;
}): DeviceLibraryEntry {
  const manufacturer = input.manufacturer.trim();
  if (!manufacturer) {
    throw new Error('Manufacturer is required.');
  }
  const entry: DeviceLibraryEntry = {
    id: crypto.randomUUID(),
    manufacturer,
    modelNumber: (input.modelNumber ?? '').trim(),
    defaultSupplier: input.defaultSupplier?.trim() || undefined,
    defaultSupplierWebsite: input.defaultSupplierWebsite?.trim() || undefined,
    notes: input.notes?.trim() || undefined,
    createdAt: new Date().toISOString(),
  };
  const next = [...getDeviceLibrary(), entry];
  saveDeviceLibrary(next);
  return entry;
}

export function deleteDeviceLibraryEntry(id: string): void {
  const next = getDeviceLibrary().filter((e) => e.id !== id);
  saveDeviceLibrary(next);
}
