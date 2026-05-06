import { Production } from '@/types/productions';
import { STORAGE_KEYS } from '@/lib/storageService';
import { requestCloudSync } from '@/lib/cloudSyncEvents';

export const PRODUCTIONS_UPDATED_EVENT = 'trackit:productions-updated';

function dispatchProductionsUpdated(productions: Production[]): void {
  window.dispatchEvent(new CustomEvent(PRODUCTIONS_UPDATED_EVENT, { detail: productions }));
}

export function getProductions(): Production[] {
  try {
    const electronValue = window.electronStore?.getData?.(STORAGE_KEYS.PRODUCTIONS) as Production[] | undefined;
    if (electronValue && Array.isArray(electronValue) && electronValue.length > 0) {
      localStorage.setItem(STORAGE_KEYS.PRODUCTIONS, JSON.stringify(electronValue));
      return electronValue;
    }
  } catch {
    // ignore
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.PRODUCTIONS);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Production[]) : [];
  } catch {
    return [];
  }
}

export function saveProductions(productions: Production[]): void {
  try {
    window.electronStore?.setData?.(STORAGE_KEYS.PRODUCTIONS, productions);
  } catch {
    // ignore — electron may not be present
  }
  try {
    localStorage.setItem(STORAGE_KEYS.PRODUCTIONS, JSON.stringify(productions));
  } catch {
    // quota or private mode
  }
  dispatchProductionsUpdated(productions);
  requestCloudSync();
}

export function createProduction(
  data: Omit<Production, 'id' | 'createdAt' | 'updatedAt'>,
  createdBy?: string
): Production {
  const now = new Date().toISOString();
  const production: Production = {
    ...data,
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
    createdBy: createdBy ?? data.createdBy,
  };
  const productions = getProductions();
  saveProductions([...productions, production]);
  return production;
}

export function updateProduction(id: string, updates: Partial<Omit<Production, 'id' | 'createdAt'>>): Production | null {
  const productions = getProductions();
  const index = productions.findIndex((p) => p.id === id);
  if (index === -1) return null;
  const updated: Production = {
    ...productions[index],
    ...updates,
    id,
    createdAt: productions[index].createdAt,
    updatedAt: new Date().toISOString(),
  };
  productions[index] = updated;
  saveProductions(productions);
  return updated;
}

export function deleteProduction(id: string): void {
  const productions = getProductions().filter((p) => p.id !== id);
  saveProductions(productions);
}
