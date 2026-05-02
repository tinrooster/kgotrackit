import { getItems, getSettings } from '@/lib/storageService';
import { getFinancialSettings } from '@/lib/financialSettingsService';
import { SettingsService, defaultSettingsSchema } from '@/lib/settingsService';
import { getTemplates } from '@/lib/storageService';

function todayLocalYmd(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Full app payload for daily offline backup (lists + inventory + financial + UI defaults + cabinets + templates). */
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
    },
  };
}

function triggerJsonDownload(filename: string, jsonText: string): void {
  const blob = new Blob([jsonText], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * When daily backups are enabled and today has not been stamped yet, downloads a `.backup` JSON
 * and updates `dailyOfflineBackupLastDate` in saved default settings.
 */
export async function maybeRunDailyOfflineBackup(): Promise<void> {
  const current = SettingsService.loadDefaultSettings();
  if (!current.dailyOfflineBackupEnabled) {
    return;
  }
  const today = todayLocalYmd();
  if (current.dailyOfflineBackupLastDate === today) {
    return;
  }

  const payload = await buildFullOfflineBackupPayload();
  const text = JSON.stringify(payload, null, 2);
  triggerJsonDownload(`trackIT-daily-backup_${today}.backup`, text);

  const next = defaultSettingsSchema.parse({
    ...current,
    dailyOfflineBackupLastDate: today,
  });
  SettingsService.saveDefaultSettings(next);
}
