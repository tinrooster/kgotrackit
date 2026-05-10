import type { Settings } from '@/lib/storageService';
import type { WorkspaceAppDataRow, WorkspaceSnapshotPayload } from '@/lib/supabase/workspaceData';

function stableJsonKey(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** Normalize partial rows from Supabase into a complete workspace snapshot shape. */
export function normalizeWorkspaceSnapshotPayload(raw: Partial<WorkspaceSnapshotPayload>): WorkspaceSnapshotPayload {
  const settingsRaw = raw.settings;
  const settings: Settings =
    settingsRaw && typeof settingsRaw === 'object' && !Array.isArray(settingsRaw)
      ? {
          categories: Array.isArray((settingsRaw as Settings).categories)
            ? (settingsRaw as Settings).categories
            : [],
          units: Array.isArray((settingsRaw as Settings).units) ? (settingsRaw as Settings).units : [],
          locations: Array.isArray((settingsRaw as Settings).locations)
            ? (settingsRaw as Settings).locations
            : [],
          suppliers: Array.isArray((settingsRaw as Settings).suppliers)
            ? (settingsRaw as Settings).suppliers
            : [],
          projects: Array.isArray((settingsRaw as Settings).projects)
            ? (settingsRaw as Settings).projects
            : [],
          expenseCodes: Array.isArray((settingsRaw as Settings).expenseCodes)
            ? (settingsRaw as Settings).expenseCodes
            : [],
        }
      : {
          categories: [],
          units: [],
          locations: [],
          suppliers: [],
          projects: [],
          expenseCodes: [],
        };

  return {
    items: Array.isArray(raw.items) ? raw.items : [],
    settings,
    templates: Array.isArray(raw.templates) ? raw.templates : [],
    history: Array.isArray(raw.history) ? raw.history : [],
    cabinets: Array.isArray(raw.cabinets) ? raw.cabinets : [],
    financial: normalizeFinancial(raw.financial),
    ui_defaults: raw.ui_defaults ?? null,
    general_settings: raw.general_settings ?? null,
    custom_report_definitions: Array.isArray(raw.custom_report_definitions)
      ? raw.custom_report_definitions
      : [],
    productions: Array.isArray(raw.productions) ? raw.productions : [],
    crew_contacts: Array.isArray(raw.crew_contacts) ? raw.crew_contacts : [],
  };
}

type NormalizedFinancialShape = { expenseTypes: unknown[]; costCenters: unknown[] };

function normalizeFinancial(raw: unknown): NormalizedFinancialShape {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { expenseTypes: [], costCenters: [] };
  }
  const o = raw as Record<string, unknown>;
  return {
    expenseTypes: Array.isArray(o.expenseTypes) ? o.expenseTypes : [],
    costCenters: Array.isArray(o.costCenters) ? o.costCenters : [],
  };
}

export function appDataRowToSnapshotPayload(row: WorkspaceAppDataRow): WorkspaceSnapshotPayload {
  const { workspace_id: _wid, updated_at: _ua, ...rest } = row as WorkspaceAppDataRow & {
    workspace_id?: string;
    updated_at?: string;
  };
  return normalizeWorkspaceSnapshotPayload(rest as Partial<WorkspaceSnapshotPayload>);
}

function mergeRecordsByIdPreferDestination<T extends Record<string, unknown>>(destination: T[], source: T[]): T[] {
  const map = new Map<string, T>();
  const order: string[] = [];
  const keyOf = (item: T): string => {
    const id = item.id;
    if (typeof id === 'string' && id.trim().length > 0) return id;
    return `__nj:${stableJsonKey(item)}`;
  };

  for (const item of destination) {
    const k = keyOf(item);
    map.set(k, item);
    order.push(k);
  }
  for (const item of source) {
    const k = keyOf(item);
    if (map.has(k)) continue;
    map.set(k, item);
    order.push(k);
  }
  return order.map((k) => map.get(k)!);
}

function mergeSettingsPreferDestination(dest: Settings, src: Settings): Settings {
  return {
    categories: mergeRecordsByIdPreferDestination(
      dest.categories as unknown as Record<string, unknown>[],
      src.categories as unknown as Record<string, unknown>[],
    ) as unknown as Settings['categories'],
    units: mergeRecordsByIdPreferDestination(
      dest.units as unknown as Record<string, unknown>[],
      src.units as unknown as Record<string, unknown>[],
    ) as unknown as Settings['units'],
    locations: mergeRecordsByIdPreferDestination(
      dest.locations as unknown as Record<string, unknown>[],
      src.locations as unknown as Record<string, unknown>[],
    ) as unknown as Settings['locations'],
    suppliers: mergeRecordsByIdPreferDestination(
      dest.suppliers as unknown as Record<string, unknown>[],
      src.suppliers as unknown as Record<string, unknown>[],
    ) as unknown as Settings['suppliers'],
    projects: mergeRecordsByIdPreferDestination(
      dest.projects as unknown as Record<string, unknown>[],
      src.projects as unknown as Record<string, unknown>[],
    ) as unknown as Settings['projects'],
    expenseCodes: mergeRecordsByIdPreferDestination(
      dest.expenseCodes as unknown as Record<string, unknown>[],
      src.expenseCodes as unknown as Record<string, unknown>[],
    ) as unknown as Settings['expenseCodes'],
  };
}

function mergeFinancialPreferDestination(dest: unknown, src: unknown): NormalizedFinancialShape {
  const d = normalizeFinancial(dest);
  const s = normalizeFinancial(src);
  const mergeCodes = (dArr: unknown[], sArr: unknown[]): unknown[] => {
    type Entry = Record<string, unknown>;
    const destRows = dArr.filter(isRecord) as Entry[];
    const srcRows = sArr.filter(isRecord) as Entry[];
    const keyOf = (row: Entry): string => {
      const code = row.code;
      if (typeof code === 'string' && code.trim()) return `c:${code.trim().toLowerCase()}`;
      const id = row.id;
      if (typeof id === 'string' && id.trim()) return `i:${id}`;
      return `__nj:${stableJsonKey(row)}`;
    };
    const map = new Map<string, Entry>();
    const order: string[] = [];
    for (const item of destRows) {
      const k = keyOf(item);
      map.set(k, item);
      order.push(k);
    }
    for (const item of srcRows) {
      const k = keyOf(item);
      if (map.has(k)) continue;
      map.set(k, item);
      order.push(k);
    }
    return order.map((k) => map.get(k)!);
  };

  return {
    expenseTypes: mergeCodes(d.expenseTypes as unknown[], s.expenseTypes as unknown[]),
    costCenters: mergeCodes(d.costCenters as unknown[], s.costCenters as unknown[]),
  };
}

function shallowMergePreferDestination(
  dest: Record<string, unknown> | null,
  src: Record<string, unknown> | null,
): Record<string, unknown> | null {
  if (!dest && !src) return null;
  if (!dest) return { ...src };
  if (!src) return { ...dest };
  return { ...src, ...dest };
}

/**
 * Merges `source` snapshot into `destination`. For entity arrays with stable `id`s, **destination wins**
 * on conflicts; rows only present in `source` are appended. Settings lookup lists follow the same rule.
 * `ui_defaults` / `general_settings` are shallow-merged with destination keys winning.
 */
export function mergeWorkspaceSnapshotsPreferDestination(
  destination: WorkspaceSnapshotPayload,
  source: WorkspaceSnapshotPayload,
): WorkspaceSnapshotPayload {
  const d = normalizeWorkspaceSnapshotPayload(destination);
  const s = normalizeWorkspaceSnapshotPayload(source);

  return {
    items: mergeRecordsByIdPreferDestination(
      d.items as unknown as Record<string, unknown>[],
      s.items as unknown as Record<string, unknown>[],
    ) as WorkspaceSnapshotPayload['items'],
    settings: mergeSettingsPreferDestination(d.settings as Settings, s.settings as Settings),
    templates: mergeRecordsByIdPreferDestination(
      d.templates as unknown as Record<string, unknown>[],
      s.templates as unknown as Record<string, unknown>[],
    ) as WorkspaceSnapshotPayload['templates'],
    history: mergeRecordsByIdPreferDestination(
      d.history as unknown as Record<string, unknown>[],
      s.history as unknown as Record<string, unknown>[],
    ) as WorkspaceSnapshotPayload['history'],
    cabinets: mergeRecordsByIdPreferDestination(
      d.cabinets as unknown as Record<string, unknown>[],
      s.cabinets as unknown as Record<string, unknown>[],
    ) as WorkspaceSnapshotPayload['cabinets'],
    financial: mergeFinancialPreferDestination(d.financial as unknown, s.financial as unknown),
    ui_defaults: shallowMergePreferDestination(
      d.ui_defaults as Record<string, unknown> | null,
      s.ui_defaults as Record<string, unknown> | null,
    ) as WorkspaceSnapshotPayload['ui_defaults'],
    general_settings: shallowMergePreferDestination(
      d.general_settings as Record<string, unknown> | null,
      s.general_settings as Record<string, unknown> | null,
    ) as WorkspaceSnapshotPayload['general_settings'],
    custom_report_definitions: mergeRecordsByIdPreferDestination(
      d.custom_report_definitions as unknown as Record<string, unknown>[],
      s.custom_report_definitions as unknown as Record<string, unknown>[],
    ) as WorkspaceSnapshotPayload['custom_report_definitions'],
    productions: mergeRecordsByIdPreferDestination(
      d.productions as unknown as Record<string, unknown>[],
      s.productions as unknown as Record<string, unknown>[],
    ) as WorkspaceSnapshotPayload['productions'],
    crew_contacts: mergeRecordsByIdPreferDestination(
      d.crew_contacts as unknown as Record<string, unknown>[],
      s.crew_contacts as unknown as Record<string, unknown>[],
    ) as WorkspaceSnapshotPayload['crew_contacts'],
  };
}
