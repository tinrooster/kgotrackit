import type { User as SupabaseAuthUser } from '@supabase/supabase-js';
import type { Cabinet } from '@/types/cabinets';
import type { InventoryItem } from '@/types/inventory';
import type { ItemTemplate } from '@/types/templates';
import type { DefaultSettings } from '@/lib/settingsService';
import type { FinancialSettings } from '@/lib/financialSettingsService';
import type { Settings } from '@/lib/storageService';
import { getSupabase } from '@/lib/supabase/client';
import { formatSupabaseOrUnknownError } from '@/lib/supabase/formatSupabaseError';
import { parseMaintenanceOnAirScheduleFromUnknown, SettingsService } from '@/lib/settingsService';
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
  fetchWorkspaceOrganizationId,
  getActiveWorkspaceId,
  pullWorkspaceAppData,
  pushWorkspaceSnapshot,
  type WorkspaceSnapshotPayload,
} from '@/lib/supabase/workspaceData';
import {
  pullOrganizationAppData,
  pushOrganizationSnapshot,
  setActiveOrganizationId,
  type OrganizationSnapshotPayload,
} from '@/lib/supabase/organizationData';
import { getProductions, PRODUCTIONS_UPDATED_EVENT } from '@/lib/productionService';
import {
  clearPendingCloudPush,
  dispatchCloudHydrated,
  hasPendingCloudPush,
} from '@/lib/cloudSyncEvents';
import { toast } from 'sonner';
import { getCrewContacts } from '@/lib/crewContactsService';
import { getPositionTemplates, savePositionTemplates } from '@/lib/positionTemplatesService';
import type { PositionTemplate } from '@/types/productions';

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
  /** JSON array of production records (optional on legacy DB rows before migration). */
  productions?: unknown;
  /** JSON array of crew contacts (optional on legacy DB rows before migration). */
  crew_contacts?: unknown;
  updated_at?: string;
}

function isMissingColumnError(
  error: { message?: string; code?: string } | null | undefined,
  columnName: string,
): boolean {
  if (!error) return false;
  const message = typeof error.message === 'string' ? error.message.toLowerCase() : '';
  const code = typeof error.code === 'string' ? error.code : '';
  const target = columnName.toLowerCase();
  return (
    code === '42703' ||
    (message.includes(target) && message.includes('does not exist')) ||
    (message.includes('column') && message.includes(target)) ||
    (message.includes(target) && message.includes('schema cache'))
  );
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
  role: 'admin' | 'editor' | 'user' | 'viewer';
  securityQuestion: string;
  securityAnswer: string;
  phoneExtension?: string;
}

export function mapSupabaseUserToAppUser(user: SupabaseAuthUser): MappedAppUser {
  const meta = (user.user_metadata || {}) as Record<string, unknown>;
  const appMeta = (user.app_metadata || {}) as Record<string, unknown>;
  // Trust app_metadata role first (server-controlled), then fall back to user_metadata.
  const roleRaw = (appMeta.role ?? appMeta.user_role ?? meta.role ?? meta.user_role);
  const normalizedRole = typeof roleRaw === 'string' ? roleRaw.trim().toLowerCase() : '';
  const role =
    normalizedRole === 'admin' || normalizedRole === 'editor' || normalizedRole === 'user' || normalizedRole === 'viewer'
      ? normalizedRole
      : 'user';
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
  | 'productions'
  | 'crew_contacts'
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
  const crewContacts = row.crew_contacts;
  if (Array.isArray(crewContacts) && crewContacts.length > 0) {
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

  let productions: unknown[] = [];
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.PRODUCTIONS);
    const parsed = raw ? JSON.parse(raw) : [];
    productions = Array.isArray(parsed) ? parsed : [];
  } catch {
    productions = [];
  }

  const crewContacts: unknown[] = getCrewContacts();

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
    productions,
    crew_contacts: crewContacts,
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

  if ('productions' in row && row.productions !== undefined) {
    const prods = Array.isArray(row.productions) ? row.productions : [];
    try {
      localStorage.setItem(STORAGE_KEYS.PRODUCTIONS, JSON.stringify(prods));
    } catch {
      // quota or private mode
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(PRODUCTIONS_UPDATED_EVENT, { detail: getProductions() }));
    }
  }

  if ('crew_contacts' in row && row.crew_contacts !== undefined) {
    const contacts = Array.isArray(row.crew_contacts) ? row.crew_contacts : [];
    try {
      localStorage.setItem(STORAGE_KEYS.CREW_CONTACTS, JSON.stringify(contacts));
    } catch {
      // quota or private mode
    }
  }
}

export async function pushFullSnapshotToSupabase(userId: string): Promise<void> {
  const client = getSupabase();
  if (!client) {
    clearPendingCloudPush();
    return;
  }
  const snapshot = await collectLocalSnapshot();
  const wsId = getActiveWorkspaceId();
  if (wsId) {
    const role = await fetchWorkspaceMemberRole(wsId, userId);
    if (!role) {
      console.warn(
        '[cloud sync] Skipping workspace push: no workspace membership resolved.',
        'workspace:',
        wsId,
      );
      clearPendingCloudPush();
      return;
    }
    // Viewers may sync workspace snapshots so checklist / production progress updates reach Productions + Dashboard
    // for the rest of the team. Destructive inventory/production UI remains gated by role in the app.
    const organizationId = await fetchWorkspaceOrganizationId(wsId);
    if (organizationId) {
      setActiveOrganizationId(organizationId);
    } else {
      setActiveOrganizationId(null);
    }
    // Workspace payload (inventory, productions, settings, …) must upload even when organization_app_data fails
    // (RLS, missing migration, network). Previously org upsert ran first and aborted the whole push on error.
    await pushWorkspaceSnapshot(wsId, snapshot as WorkspaceSnapshotPayload);
    if (organizationId) {
      try {
        const existingOrganizationRow = await pullOrganizationAppData(organizationId);
        await pushOrganizationSnapshot(organizationId, {
          contacts: snapshot.crew_contacts ?? [],
          position_templates: getPositionTemplates(),
          inventory_baseline: Array.isArray(existingOrganizationRow?.inventory_baseline)
            ? existingOrganizationRow.inventory_baseline
            : [],
          role_tags: Array.isArray(existingOrganizationRow?.role_tags) ? existingOrganizationRow.role_tags : [],
          branding:
            existingOrganizationRow?.branding && typeof existingOrganizationRow.branding === 'object'
              ? existingOrganizationRow.branding
              : {},
          maintenance_on_air_template: parseMaintenanceOnAirScheduleFromUnknown(
            existingOrganizationRow?.maintenance_on_air_template,
          ),
        } satisfies OrganizationSnapshotPayload);
      } catch (orgError) {
        const detail = formatSupabaseOrUnknownError(orgError);
        console.error('[cloud sync] Workspace snapshot saved; organization snapshot failed:', detail, orgError);
      }
    }
    clearPendingCloudPush();
    return;
  }
  const payloadWithContacts = {
    user_id: userId,
    ...snapshot,
    updated_at: new Date().toISOString(),
  };
  const { error: firstError } = await client
    .from('user_app_data')
    .upsert(payloadWithContacts, { onConflict: 'user_id' });
  if (
    firstError &&
    isMissingColumnError(firstError as { message?: string; code?: string } | null | undefined, 'crew_contacts')
  ) {
    const payloadWithoutContacts = { ...payloadWithContacts } as Record<string, unknown>;
    delete payloadWithoutContacts.crew_contacts;
    const { error: retryError } = await client
      .from('user_app_data')
      .upsert(payloadWithoutContacts, { onConflict: 'user_id' });
    if (retryError) {
      throw retryError;
    }
    clearPendingCloudPush();
    return;
  }
  if (firstError) {
    throw firstError;
  }
  clearPendingCloudPush();
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
  productions: [],
  crew_contacts: [],
};

export async function bootstrapCloudData(userId: string): Promise<void> {
  try {
    const client = getSupabase();
    if (!client) {
      return;
    }
    if (hasPendingCloudPush()) {
      try {
        await pushFullSnapshotToSupabase(userId);
      } catch (pushErr) {
        const msg = formatSupabaseOrUnknownError(pushErr);
        console.error('[cloud sync] Push before hydrate failed (keeping local data; skipping cloud pull):', msg, pushErr);
        toast.error('Could not upload your latest edits before loading cloud data. Your changes stay on this device until upload succeeds.', {
          description: msg,
        });
        return;
      }
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
        const organizationId = await fetchWorkspaceOrganizationId(wsId);
        if (organizationId) {
          setActiveOrganizationId(organizationId);
          const organizationRow = await pullOrganizationAppData(organizationId);
          if (organizationRow) {
            remoteRow.crew_contacts = Array.isArray(organizationRow.contacts) ? organizationRow.contacts : [];
            const positionTemplates = Array.isArray(organizationRow.position_templates)
              ? organizationRow.position_templates
              : [];
            savePositionTemplates(positionTemplates as PositionTemplate[]);
          }
        }
        await applySnapshotToLocal(remoteRow as CloudSnapshotPayload);
        return;
      }
      setActiveOrganizationId(null);
      await pushWorkspaceSnapshot(wsId, EMPTY_WORKSPACE_SNAPSHOT);
      await applySnapshotToLocal(EMPTY_WORKSPACE_SNAPSHOT);
      return;
    }
    setActiveOrganizationId(null);
    await bootstrapPersonalUserRow(userId);
  } finally {
    dispatchCloudHydrated();
  }
}

let pushDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let pushInFlight = false;

const PUSH_RETRY_WHEN_BUSY_MS = 400;

/** PostgREST / Postgres codes commonly returned when RLS or grants block workspace writes. */
function isLikelyPermissionOrRlsDenied(error: unknown): boolean {
  const msg = formatSupabaseOrUnknownError(error).toLowerCase();
  const o = typeof error === 'object' && error != null ? (error as Record<string, unknown>) : null;
  const code = typeof o?.code === 'string' ? o.code : '';
  const statusRaw = o?.status;
  const status =
    typeof statusRaw === 'number'
      ? statusRaw
      : typeof statusRaw === 'string'
        ? Number.parseInt(statusRaw, 10)
        : NaN;
  if (code === '42501' || code === 'PGRST301') return true;
  if (status === 403 || status === 401) return true;
  if (
    msg.includes('permission denied') ||
    msg.includes('row-level security') ||
    msg.includes('new row violates row-level security') ||
    (msg.includes('violates') && msg.includes('policy'))
  ) {
    return true;
  }
  return false;
}

async function runDebouncedPush(userId: string): Promise<void> {
  if (pushInFlight) {
    scheduleDebouncedPushToSupabase(userId, PUSH_RETRY_WHEN_BUSY_MS);
    return;
  }
  pushInFlight = true;
  try {
    await pushFullSnapshotToSupabase(userId);
  } catch (error) {
    console.error('Supabase sync push failed:', error);
    const detail = formatSupabaseOrUnknownError(error);
    if (isLikelyPermissionOrRlsDenied(error)) {
      toast.warning('Workspace cloud sync blocked', {
        id: 'workspace-cloud-sync-permission',
        description:
          'Your changes stay on this device. Ask an admin to allow your workspace role to update shared data (RLS policies), or wait for someone with editor access to sync.',
      });
    } else {
      toast.error('Could not save changes to the cloud.', {
        id: 'workspace-cloud-sync-error',
        description: `${detail} Check your connection and try again.`,
      });
    }
  } finally {
    pushInFlight = false;
  }
}

export function scheduleDebouncedPushToSupabase(userId: string, delayMs = 1200): void {
  if (pushDebounceTimer) {
    clearTimeout(pushDebounceTimer);
  }
  pushDebounceTimer = setTimeout(() => {
    pushDebounceTimer = null;
    void runDebouncedPush(userId);
  }, delayMs);
}

/** Cancel debounce and upload now (e.g. tab hide / unload) so a quick refresh does not lose edits. */
export async function flushCloudPushNow(userId: string): Promise<void> {
  if (pushDebounceTimer) {
    clearTimeout(pushDebounceTimer);
    pushDebounceTimer = null;
  }
  if (pushInFlight) {
    return;
  }
  pushInFlight = true;
  try {
    await pushFullSnapshotToSupabase(userId);
  } catch (error) {
    console.error('[cloud sync] Immediate push failed:', error);
  } finally {
    pushInFlight = false;
  }
}
