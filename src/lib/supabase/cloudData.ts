import type { User as SupabaseAuthUser } from '@supabase/supabase-js';
import type { Cabinet } from '@/types/cabinets';
import type { InventoryItem } from '@/types/inventory';
import type { ItemTemplate } from '@/types/templates';
import type { DefaultSettings } from '@/lib/settingsService';
import type { FinancialSettings } from '@/lib/financialSettingsService';
import type { Settings } from '@/lib/storageService';
import { getSupabase } from '@/lib/supabase/client';
import { SettingsService } from '@/lib/settingsService';
import {
  getItems,
  getSettings,
  getTemplates,
  saveItems,
  saveSettings,
  saveTemplates,
  STORAGE_KEYS,
  parseItemDates,
  CUSTOM_REPORT_DEFINITIONS_UPDATED_EVENT,
} from '@/lib/storageService';
import { getFinancialSettings, saveFinancialSettings } from '@/lib/financialSettingsService';
import {
  fetchWorkspaceMemberRole,
  getActiveWorkspaceId,
  pullWorkspaceAppData,
  pushWorkspaceSnapshot,
  type WorkspaceSnapshotPayload,
} from '@/lib/supabase/workspaceData';
import { dispatchCloudHydrated } from '@/lib/cloudSyncEvents';

export type AuthBackend = 'local' | 'supabase';

export interface UserAppDataRow {
  user_id: string;
  items: unknown;
  settings: Settings;
  templates: ItemTemplate[];
  history: unknown[];
  cabinets: Cabinet[];
  financial: FinancialSettings;
  ui_defaults: DefaultSettings | null;
  general_settings: unknown | null;
  /** JSON array of saved custom report definitions (optional on legacy DB rows before migration). */
  custom_report_definitions?: unknown;
  updated_at?: string;
}

function readGeneralSettingsRaw(): unknown | null {
  try {
    const electronValue = window.electronStore?.getData?.(STORAGE_KEYS.GENERAL_SETTINGS);
    if (electronValue !== undefined && electronValue !== null) {
      return electronValue;
    }
  } catch {
    // ignore
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.GENERAL_SETTINGS);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeGeneralSettingsRaw(value: unknown | null): void {
  try {
    if (value === null || value === undefined) {
      try {
        window.electronStore?.deleteData?.(STORAGE_KEYS.GENERAL_SETTINGS);
      } catch {
        // ignore
      }
      localStorage.removeItem(STORAGE_KEYS.GENERAL_SETTINGS);
      return;
    }
    try {
      window.electronStore?.setData?.(STORAGE_KEYS.GENERAL_SETTINGS, value);
    } catch {
      // ignore
    }
    localStorage.setItem(STORAGE_KEYS.GENERAL_SETTINGS, JSON.stringify(value));
  } catch {
    try {
      if (value === null || value === undefined) {
        localStorage.removeItem(STORAGE_KEYS.GENERAL_SETTINGS);
      } else {
        localStorage.setItem(STORAGE_KEYS.GENERAL_SETTINGS, JSON.stringify(value));
      }
    } catch {
      // no-op
    }
  }
}

function serializeItemsForStorage(items: InventoryItem[]): unknown[] {
  return items.map((item) => ({
    ...item,
    lastUpdated: item.lastUpdated instanceof Date ? item.lastUpdated.toISOString() : item.lastUpdated,
    expectedDeliveryDate:
      item.expectedDeliveryDate instanceof Date
        ? item.expectedDeliveryDate.toISOString()
        : item.expectedDeliveryDate,
  }));
}

/** Matches `User` in AuthContext (kept here to avoid circular imports). */
export interface MappedAppUser {
  id: string;
  username: string;
  displayName: string;
  password: string;
  role: 'admin' | 'user' | 'viewer';
  securityQuestion: string;
  securityAnswer: string;
  phoneExtension?: string;
}

export function mapSupabaseUserToAppUser(user: SupabaseAuthUser): MappedAppUser {
  const meta = (user.user_metadata || {}) as Record<string, unknown>;
  const roleRaw = meta.role;
  const role =
    roleRaw === 'admin' || roleRaw === 'user' || roleRaw === 'viewer' ? roleRaw : 'user';
  const email = user.email ?? user.id;
  return {
    id: user.id,
    username: email,
    displayName: (typeof meta.display_name === 'string' && meta.display_name) || email.split('@')[0] || 'User',
    password: '',
    role,
    securityQuestion: '',
    securityAnswer: '',
    phoneExtension: typeof meta.phone_extension === 'string' ? meta.phone_extension : undefined,
  };
}

/** Shape required to hydrate local stores (personal or workspace row). */
export type CloudSnapshotPayload = Pick<
  UserAppDataRow,
  | 'items'
  | 'settings'
  | 'templates'
  | 'history'
  | 'cabinets'
  | 'financial'
  | 'ui_defaults'
  | 'general_settings'
  | 'custom_report_definitions'
>;

export function snapshotHasMeaningfulRemoteData(row: CloudSnapshotPayload): boolean {
  const items = row.items;
  if (Array.isArray(items) && items.length > 0) {
    return true;
  }
  const settings = row.settings;
  if (settings && typeof settings === 'object') {
    const s = settings as Settings;
    const lists = [s.categories, s.units, s.locations, s.suppliers, s.projects, s.expenseCodes];
    if (lists.some((list) => Array.isArray(list) && list.length > 0)) {
      return true;
    }
  }
  if (Array.isArray(row.templates) && row.templates.length > 0) {
    return true;
  }
  if (Array.isArray(row.history) && row.history.length > 0) {
    return true;
  }
  if (Array.isArray(row.cabinets) && row.cabinets.length > 0) {
    return true;
  }
  const fin = row.financial as FinancialSettings | undefined;
  if (fin && (fin.expenseTypes?.length || fin.costCenters?.length)) {
    return true;
  }
  if (row.ui_defaults && typeof row.ui_defaults === 'object') {
    return true;
  }
  if (row.general_settings !== null && row.general_settings !== undefined) {
    return true;
  }
  const customDefs = row.custom_report_definitions;
  if (Array.isArray(customDefs) && customDefs.length > 0) {
    return true;
  }
  return false;
}

export async function collectLocalSnapshot(): Promise<Omit<UserAppDataRow, 'user_id' | 'updated_at'>> {
  const items = serializeItemsForStorage(getItems());
  const settings = getSettings();
  const templates = getTemplates();
  let history: unknown[] = [];
  try {
    const raw = localStorage.getItem('inventoryHistory');
    history = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(history)) {
      history = [];
    }
  } catch {
    history = [];
  }
  const cabinets = await SettingsService.getCabinets();
  const financial = getFinancialSettings();
  const uiDefaults = SettingsService.loadDefaultSettings();
  const generalSettings = readGeneralSettingsRaw();

  let customReportDefinitions: unknown[] = [];
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.CUSTOM_REPORT_DEFINITIONS);
    const parsed = raw ? JSON.parse(raw) : [];
    customReportDefinitions = Array.isArray(parsed) ? parsed : [];
  } catch {
    customReportDefinitions = [];
  }

  return {
    items,
    settings,
    templates,
    history,
    cabinets,
    financial,
    ui_defaults: uiDefaults,
    general_settings: generalSettings,
    custom_report_definitions: customReportDefinitions,
  };
}

function normalizeRemoteSettings(raw: unknown): Settings {
  const source = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    categories: Array.isArray(source.categories) ? (source.categories as Settings['categories']) : [],
    units: Array.isArray(source.units) ? (source.units as Settings['units']) : [],
    locations: Array.isArray(source.locations) ? (source.locations as Settings['locations']) : [],
    suppliers: Array.isArray(source.suppliers) ? (source.suppliers as Settings['suppliers']) : [],
    projects: Array.isArray(source.projects) ? (source.projects as Settings['projects']) : [],
    expenseCodes: Array.isArray(source.expenseCodes) ? (source.expenseCodes as Settings['expenseCodes']) : [],
  };
}

export async function applySnapshotToLocal(row: CloudSnapshotPayload): Promise<void> {
  const rawItems = Array.isArray(row.items) ? row.items : [];
  const items = rawItems.map((item) => parseItemDates(item));
  saveItems(items);

  if (row.settings && typeof row.settings === 'object') {
    saveSettings(normalizeRemoteSettings(row.settings));
  }

  const templates = Array.isArray(row.templates) ? row.templates : [];
  saveTemplates(templates as ItemTemplate[]);

  const history = Array.isArray(row.history) ? row.history : [];
  localStorage.setItem('inventoryHistory', JSON.stringify(history));

  const cabinets = Array.isArray(row.cabinets) ? row.cabinets : [];
  await SettingsService.replaceAllCabinets(cabinets as Cabinet[]);

  if (row.financial && typeof row.financial === 'object') {
    saveFinancialSettings(row.financial as FinancialSettings);
  }

  if (row.ui_defaults && typeof row.ui_defaults === 'object') {
    try {
      SettingsService.saveDefaultSettings(row.ui_defaults as DefaultSettings);
    } catch {
      // ignore invalid ui_defaults from server
    }
  }

  if (row.general_settings !== undefined) {
    writeGeneralSettingsRaw(row.general_settings);
  }

  if ('custom_report_definitions' in row && row.custom_report_definitions !== undefined) {
    const defs = Array.isArray(row.custom_report_definitions) ? row.custom_report_definitions : [];
    try {
      localStorage.setItem(STORAGE_KEYS.CUSTOM_REPORT_DEFINITIONS, JSON.stringify(defs));
    } catch {
      // quota or private mode — still notify listeners with in-memory intent
    }
    window.dispatchEvent(new CustomEvent(CUSTOM_REPORT_DEFINITIONS_UPDATED_EVENT, { detail: defs }));
  }
}

export async function pushFullSnapshotToSupabase(userId: string): Promise<void> {
  const client = getSupabase();
  if (!client) {
    return;
  }
  const snapshot = await collectLocalSnapshot();
  const wsId = getActiveWorkspaceId();
  if (wsId) {
    const role = await fetchWorkspaceMemberRole(wsId, userId);
    if (!role || role === 'viewer') {
      return;
    }
    await pushWorkspaceSnapshot(wsId, snapshot as WorkspaceSnapshotPayload);
    return;
  }
  const { error } = await client.from('user_app_data').upsert(
    {
      user_id: userId,
      ...snapshot,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' }
  );
  if (error) {
    throw error;
  }
}

export async function pullUserAppData(userId: string): Promise<UserAppDataRow | null> {
  const client = getSupabase();
  if (!client) {
    return null;
  }
  const { data, error } = await client.from('user_app_data').select('*').eq('user_id', userId).maybeSingle();
  if (error) {
    throw error;
  }
  if (!data) {
    return null;
  }
  return data as UserAppDataRow;
}

async function bootstrapPersonalUserRow(userId: string): Promise<void> {
  const remote = await pullUserAppData(userId);
  if (remote && snapshotHasMeaningfulRemoteData(remote)) {
    await applySnapshotToLocal(remote);
  } else {
    await pushFullSnapshotToSupabase(userId);
  }
}

const EMPTY_WORKSPACE_SNAPSHOT: WorkspaceSnapshotPayload = {
  items: [],
  settings: {
    categories: [],
    units: [],
    locations: [],
    suppliers: [],
    projects: [],
    expenseCodes: [],
  },
  templates: [],
  history: [],
  cabinets: [],
  financial: { expenseTypes: [], costCenters: [] },
  ui_defaults: null,
  general_settings: null,
  custom_report_definitions: [],
};

export async function bootstrapCloudData(userId: string): Promise<void> {
  try {
    const client = getSupabase();
    if (!client) {
      return;
    }
    const wsId = getActiveWorkspaceId();
    if (wsId) {
      const role = await fetchWorkspaceMemberRole(wsId, userId);
      if (!role) {
        // Do NOT call setActiveWorkspaceId(null) here — WorkspaceContext is the single
        // authority on workspace selection. Clearing localStorage here races with the
        // context's own initialisation and causes it to fall back to the wrong workspace.
        // Instead, silently fall back to personal data for this session; the context will
        // clear the stored workspace preference if the workspace is genuinely missing from
        // the membership list after it finishes loading.
        await bootstrapPersonalUserRow(userId);
        return;
      }
      const remoteRow = await pullWorkspaceAppData(wsId);
      if (remoteRow) {
        await applySnapshotToLocal(remoteRow as CloudSnapshotPayload);
        return;
      }
      await pushWorkspaceSnapshot(wsId, EMPTY_WORKSPACE_SNAPSHOT);
      await applySnapshotToLocal(EMPTY_WORKSPACE_SNAPSHOT);
      return;
    }
    await bootstrapPersonalUserRow(userId);
  } finally {
    dispatchCloudHydrated();
  }
}

let pushDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let pushInFlight = false;

export function scheduleDebouncedPushToSupabase(userId: string, delayMs = 1200): void {
  if (pushDebounceTimer) {
    clearTimeout(pushDebounceTimer);
  }
  pushDebounceTimer = setTimeout(() => {
    pushDebounceTimer = null;
    void (async () => {
      if (pushInFlight) {
        return;
      }
      pushInFlight = true;
      try {
        await pushFullSnapshotToSupabase(userId);
      } catch (error) {
        console.error('Supabase sync push failed:', error);
      } finally {
        pushInFlight = false;
      }
    })();
  }, delayMs);
}
