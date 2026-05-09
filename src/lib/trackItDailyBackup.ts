import { getItems, getSettings, getTemplates } from '@/lib/storageService';
import { getFinancialSettings } from '@/lib/financialSettingsService';
import { SettingsService } from '@/lib/settingsService';
import { getDeviceLibrary } from '@/lib/deviceLibraryStorage';
import { getProductions } from '@/lib/productionService';
import { getCrewContacts } from '@/lib/crewContactsService';

function readStoredArray(storageKey: string): unknown[] {
  try {
    const raw = localStorage.getItem(storageKey);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Full app payload for explicit backup/export (lists + inventory + financial + UI defaults + cabinets + templates). */
export async function buildFullOfflineBackupPayload(): Promise<{
  version: string;
  timestamp: string;
  data: Record<string, unknown>;
}> {
  const lists = getSettings();
  const items = getItems();
  const financial = getFinancialSettings();
  const defaultSettings = SettingsService.loadDefaultSettings();
  const cabinets = await SettingsService.getCabinets();
  const templates = getTemplates();
  const deviceLibrary = getDeviceLibrary();
  const productions = getProductions();
  const crewContacts = getCrewContacts();
  const customReportDefinitions = readStoredArray('inventory-custom-report-definitions');
  const inventoryHistory = readStoredArray('inventoryHistory');
  const checkoutRecentActivities = readStoredArray('checkout-recent-activities');

  return {
    version: '1.2',
    timestamp: new Date().toISOString(),
    data: {
      locations: lists.locations,
      categories: lists.categories,
      units: lists.units,
      suppliers: lists.suppliers,
      projects: lists.projects,
      expenseCodes: lists.expenseCodes,
      items,
      financial,
      defaultSettings,
      cabinets,
      templates,
      deviceLibrary,
      productions,
      crewContacts,
      customReportDefinitions,
      inventoryHistory,
      checkoutRecentActivities,
    },
  };
}
