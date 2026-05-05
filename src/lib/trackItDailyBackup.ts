import { getItems, getSettings, getTemplates } from '@/lib/storageService';
import { getFinancialSettings } from '@/lib/financialSettingsService';
import { SettingsService } from '@/lib/settingsService';
import { getDeviceLibrary } from '@/lib/deviceLibraryStorage';

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

  return {
    version: '1.1',
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
    },
  };
}
