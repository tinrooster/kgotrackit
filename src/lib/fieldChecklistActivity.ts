/**
 * Recent activity for the Field Checklist / truck-check mobile page (local persistence,
 * similar pattern to checkout-recent-activities).
 */
export type FieldChecklistActivityEntry = {
  at: string;
  by: string;
  productionId: string;
  productionName: string;
  scope: 'checklist' | 'truck';
  vehicleName?: string;
  sectionTitle?: string;
  groupTitle?: string;
  itemLabel: string;
  completed: boolean;
};

const STORAGE_KEY = 'trackit:field-checklist-recent:v1';
const MAX_ENTRIES = 150;

export function appendFieldChecklistActivity(entry: FieldChecklistActivityEntry): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const list: FieldChecklistActivityEntry[] = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(list)) return;
    list.unshift(entry);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, MAX_ENTRIES)));
  } catch {
    /* ignore */
  }
}

export function getFieldChecklistActivities(): FieldChecklistActivityEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as FieldChecklistActivityEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function clearFieldChecklistActivities(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
