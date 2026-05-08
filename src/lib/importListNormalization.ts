import { v4 as uuidv4 } from 'uuid';
import type { ItemWithSubcategories } from '@/types/inventory';

export type SettingsListKey = 'categories' | 'units' | 'locations' | 'suppliers' | 'projects' | 'expenseCodes';

export interface NormalizedImportPayload {
  inventory: Record<string, unknown>[];
  categories: ItemWithSubcategories[];
  units: ItemWithSubcategories[];
  locations: ItemWithSubcategories[];
  suppliers: ItemWithSubcategories[];
  projects: ItemWithSubcategories[];
  expenseCodes: ItemWithSubcategories[];
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((x): x is string => typeof x === 'string').map((x) => x.trim()).filter(Boolean);
}

/** Normalize one lookup row: keep rack/color/supplier fields; map legacy string[] `subcategories` into `children` when `children` is empty. */
export function normalizeLookupListEntry(entry: unknown): ItemWithSubcategories {
  const row = entry && typeof entry === 'object' ? (entry as Record<string, unknown>) : {};
  let children = Array.isArray(row.children)
    ? (row.children as unknown[]).map((child) => normalizeLookupListEntry(child))
    : [];
  const legacySubs = asStringArray(row.subcategories);
  if (children.length === 0 && legacySubs.length > 0) {
    children = legacySubs.map((name) => ({
      id: uuidv4(),
      name: name || 'Unnamed',
    }));
  }

  const base: ItemWithSubcategories = {
    id: row.id != null && String(row.id).trim() ? String(row.id) : uuidv4(),
    name: row.name != null && String(row.name).trim() ? String(row.name).trim() : 'Unnamed',
  };

  const optional: Partial<ItemWithSubcategories> = {};
  if (row.description != null && String(row.description).trim()) {
    optional.description = String(row.description);
  }
  if (row.color != null && String(row.color).trim()) {
    optional.color = String(row.color);
  }
  if (row.website != null && String(row.website).trim()) {
    optional.website = String(row.website);
  }
  if (row.contactName != null && String(row.contactName).trim()) {
    optional.contactName = String(row.contactName);
  }
  if (row.contactEmail != null && String(row.contactEmail).trim()) {
    optional.contactEmail = String(row.contactEmail);
  }
  if (row.contactPhone != null && String(row.contactPhone).trim()) {
    optional.contactPhone = String(row.contactPhone);
  }
  if (row.supportEmail != null && String(row.supportEmail).trim()) {
    optional.supportEmail = String(row.supportEmail);
  }
  if (row.supportPhone != null && String(row.supportPhone).trim()) {
    optional.supportPhone = String(row.supportPhone);
  }
  if (row.accountReference != null && String(row.accountReference).trim()) {
    optional.accountReference = String(row.accountReference);
  }
  if (row.supplierNotes != null && String(row.supplierNotes).trim()) {
    optional.supplierNotes = String(row.supplierNotes);
  }
  if (row.rackLocationEnabled === true) {
    optional.rackLocationEnabled = true;
  }
  if (Array.isArray(row.rackSlots) && row.rackSlots.length > 0) {
    optional.rackSlots = row.rackSlots.map((s) => String(s).trim()).filter(Boolean);
  }

  return {
    ...optional,
    ...base,
    ...(children.length > 0 ? { children } : {}),
  };
}

export function normalizeLookupListPayload(input: unknown): ItemWithSubcategories[] {
  return Array.isArray(input) ? input.map((entry) => normalizeLookupListEntry(entry)) : [];
}

function normalizedNameKey(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Merge lookup trees. Top-level rows match by trimmed case-insensitive name so imported
 * sub-locations merge into an existing parent with the same display name even when IDs differ.
 * Nested rows prefer `id`, then name (sibling keys).
 */
export function mergeLookupListEntries(
  existingItems: ItemWithSubcategories[],
  importedItems: ItemWithSubcategories[],
  depth = 0,
): ItemWithSubcategories[] {
  const nextByKey = new Map<string, ItemWithSubcategories>();

  const keyFor = (entry: ItemWithSubcategories): string => {
    const id = String(entry.id || '').trim().toLowerCase();
    if (depth > 0 && id) {
      return `id:${id}`;
    }
    const nk = normalizedNameKey(String(entry.name || ''));
    if (depth === 0 && nk) {
      return `name:${nk}`;
    }
    if (id) {
      return `id:${id}`;
    }
    if (nk) {
      return `name:${nk}`;
    }
    return `gen:${uuidv4()}`;
  };

  existingItems.forEach((entry) => nextByKey.set(keyFor(entry), entry));

  importedItems.forEach((entry) => {
    const key = keyFor(entry);
    const existing = nextByKey.get(key);
    if (!existing) {
      nextByKey.set(key, entry);
      return;
    }

    const mergedChildren = mergeLookupListEntries(existing.children || [], entry.children || [], depth + 1);

    nextByKey.set(key, {
      ...existing,
      ...entry,
      id: existing.id,
      name: existing.name,
      children: mergedChildren,
      rackLocationEnabled: entry.rackLocationEnabled ?? existing.rackLocationEnabled,
      rackSlots:
        Array.isArray(entry.rackSlots) && entry.rackSlots.length > 0
          ? entry.rackSlots.map((s) => String(s).trim()).filter(Boolean)
          : existing.rackSlots,
      color: entry.color ?? existing.color,
      description: entry.description ?? existing.description,
      website: entry.website ?? existing.website,
      contactName: entry.contactName ?? existing.contactName,
      contactEmail: entry.contactEmail ?? existing.contactEmail,
      contactPhone: entry.contactPhone ?? existing.contactPhone,
      supportEmail: entry.supportEmail ?? existing.supportEmail,
      supportPhone: entry.supportPhone ?? existing.supportPhone,
      accountReference: entry.accountReference ?? existing.accountReference,
      supplierNotes: entry.supplierNotes ?? existing.supplierNotes,
    });
  });

  return Array.from(nextByKey.values());
}

const LIST_KEYS: SettingsListKey[] = ['categories', 'units', 'locations', 'suppliers', 'projects', 'expenseCodes'];

export function summarizeImportPayloadLists(
  data: NormalizedImportPayload,
  maxOutlineLines = 60,
): {
  key: SettingsListKey;
  label: string;
  topCount: number;
  subCount: number;
  lines: string[];
}[] {
  const labels: Record<SettingsListKey, string> = {
    categories: 'Categories',
    units: 'Units',
    locations: 'Locations',
    suppliers: 'Suppliers',
    projects: 'Projects',
    expenseCodes: 'Expense codes',
  };

  const countSubs = (rows: ItemWithSubcategories[]): number => {
    let n = 0;
    const walkRow = (x: ItemWithSubcategories) => {
      for (const c of x.children || []) {
        n += 1;
        walkRow(c);
      }
    };
    for (const x of rows) {
      walkRow(x);
    }
    return n;
  };

  const flatten = (rows: ItemWithSubcategories[], prefix = '', maxLines: number): string[] => {
    const out: string[] = [];
    const cap = 80;
    const walk = (r: ItemWithSubcategories[], p: string) => {
      for (const x of r) {
        if (out.length >= maxLines) {
          return;
        }
        const label = p ? `${p} / ${x.name}` : x.name;
        out.push(label.length > cap ? `${label.slice(0, cap)}…` : label);
        if (x.children?.length) {
          walk(x.children, label);
        }
      }
    };
    walk(rows, prefix);
    return out;
  };

  return LIST_KEYS.map((key) => {
    const list = data[key];
    const topCount = list.length;
    const subCount = countSubs(list);
    const lines = flatten(list, '', maxOutlineLines);
    return { key, label: labels[key], topCount, subCount, lines };
  }).filter((s) => s.topCount > 0 || s.subCount > 0);
}
