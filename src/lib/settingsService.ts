import { z } from "zod";
import { Cabinet, CabinetWithItems } from "@/types/cabinets";
import { SETTINGS_UPDATED_EVENT } from "@/lib/storageService";
import { requestCloudSync } from "@/lib/cloudSyncEvents";

/** Dispatched on window after default UI settings are persisted (theme, density, mobile layout). */
export const DEFAULT_SETTINGS_CHANGED_EVENT = "trackit:default-settings-changed";

declare global {
  interface Window {
    electronStore?: {
      getData: (key: string) => any;
      setData: (key: string, value: any) => void;
      deleteData: (key: string) => void;
    };
  }
}

const timeHHmmSchema = z.string().regex(/^\d{2}:\d{2}$/);

export const maintenanceOnAirScheduleSchema = z.object({
  sunday: z.array(timeHHmmSchema).default([]),
  monday: z.array(timeHHmmSchema).default([]),
  tuesday: z.array(timeHHmmSchema).default([]),
  wednesday: z.array(timeHHmmSchema).default([]),
  thursday: z.array(timeHHmmSchema).default([]),
  friday: z.array(timeHHmmSchema).default([]),
  saturday: z.array(timeHHmmSchema).default([]),
});

export type MaintenanceOnAirSchedule = z.infer<typeof maintenanceOnAirScheduleSchema>;

export const EMPTY_MAINTENANCE_ON_AIR_SCHEDULE: MaintenanceOnAirSchedule = {
  sunday: [],
  monday: [],
  tuesday: [],
  wednesday: [],
  thursday: [],
  friday: [],
  saturday: [],
};

/**
 * Anonymous demo / org-apply fallback ON-AIR start times (15-minute grid).
 * Saturday 05:00–08:00: hourly program starts covering a 5–9 AM style block; 23:00: late block.
 * (External labels such as PC2 / PC3 are not persisted—times only.)
 */
export const DEMO_BROADCAST_ON_AIR_TEMPLATE: MaintenanceOnAirSchedule = {
  sunday: ['08:00', '16:00', '17:00', '22:00'],
  monday: ['04:00', '05:00', '10:00', '14:00', '15:00', '16:00', '17:00', '22:00'],
  tuesday: ['04:00', '05:00', '10:00', '14:00', '15:00', '16:00', '17:00', '22:00'],
  wednesday: ['04:00', '05:00', '10:00', '14:00', '15:00', '16:00', '17:00', '22:00'],
  thursday: ['04:00', '05:00', '10:00', '14:00', '15:00', '16:00', '17:00', '22:00'],
  friday: ['04:00', '05:00', '10:00', '14:00', '15:00', '16:00', '17:00', '22:00'],
  saturday: ['05:00', '06:00', '07:00', '08:00', '23:00'],
};

export function normalizeMaintenanceTimeListInput(raw: string): string[] {
  const validQuarterHour = /^([01]\d|2[0-3]):(00|15|30|45)$/;
  return Array.from(
    new Set(
      raw
        .split(',')
        .map((value) => value.trim())
        .filter((value) => validQuarterHour.test(value))
        .sort((left, right) => left.localeCompare(right)),
    ),
  );
}

export function parseMaintenanceOnAirScheduleFromUnknown(raw: unknown): MaintenanceOnAirSchedule | null {
  if (raw == null) {
    return null;
  }
  const parsed = maintenanceOnAirScheduleSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export function hasMaintenanceScheduleAnyTimes(schedule: MaintenanceOnAirSchedule | null | undefined): boolean {
  if (!schedule) {
    return false;
  }
  return (Object.keys(schedule) as Array<keyof MaintenanceOnAirSchedule>).some(
    (day) => (schedule[day]?.length ?? 0) > 0,
  );
}

const MAINTENANCE_SCHEDULE_DAY_KEYS: Array<keyof MaintenanceOnAirSchedule> = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
];

/** Per weekday: org times when non-empty, otherwise demo (fills e.g. Saturday when org row omitted that day). */
export function mergeMaintenanceScheduleForApply(
  org: MaintenanceOnAirSchedule | null,
  demo: MaintenanceOnAirSchedule,
): MaintenanceOnAirSchedule {
  const out: MaintenanceOnAirSchedule = {
    sunday: [],
    monday: [],
    tuesday: [],
    wednesday: [],
    thursday: [],
    friday: [],
    saturday: [],
  };
  for (const day of MAINTENANCE_SCHEDULE_DAY_KEYS) {
    const fromOrg = org?.[day];
    out[day] = fromOrg && fromOrg.length > 0 ? [...fromOrg] : [...(demo[day] ?? [])];
  }
  return out;
}

// Define the settings schema
export const defaultSettingsSchema = z.object({
  defaultLocation: z.string().optional(),
  defaultUnit: z.string().optional(),
  defaultCategory: z.string().optional(),
  defaultSupplier: z.string().optional(),
  defaultProject: z.string().optional(),
  defaultOrderStatus: z.enum(['delivered', 'partially_delivered', 'backordered', 'on_order', 'not_ordered']).default('delivered'),
  enableQRTracking: z.boolean().default(true),
  requireCheckoutForSecureCabinets: z.boolean().default(true),
  autoGenerateQRCodes: z.boolean().default(true),
  defaultMinQuantity: z.number().min(0).default(0),
  defaultReorderLevel: z.number().min(0).default(5),
  theme: z.enum(['light', 'dark', 'system']).default('light'),
  condensedView: z.boolean().default(true),
  /** Narrow / tablet widths: icon-first nav, shorter settings tab labels when space is tight. */
  mobileTabletUi: z.boolean().default(true),
  assetCodeMode: z.enum(['qr', 'barcode', 'both', 'none']).default('qr'),
  /** Auto-generate physical asset tags (label/QR pattern), not the durable record ID. */
  autoAssignAssetId: z.boolean().default(true),
  /** Prefix for durable inventory record IDs (e.g. REC-000001). */
  recordIdPrefix: z.string().default('REC'),
  recordIdSequence: z.number().int().min(0).default(0),
  /** Prefix embedded in asset tags: `{prefix}_{YYMMDD}_{seq}` using in-service date. */
  assetIdPrefix: z.string().default('AST'),
  /** Email target for admin configuration change notifications. */
  adminNotificationEmail: z.string().email().optional().or(z.literal('')),
  /** Monotonic counter for asset tag sequence (shared across dates). */
  assetIdSequence: z.number().int().min(0).default(0),
  maintenanceCautionsEnabled: z.boolean().default(true),
  maintenanceCautionMode: z.enum(['on-air', 'off-air']).default('on-air'),
  maintenanceProgrammingBlockMinutes: z.number().int().min(15).max(240).default(60),
  maintenanceOnAirSchedule: maintenanceOnAirScheduleSchema.default(() => maintenanceOnAirScheduleSchema.parse({})),
  deleteConfirmationByUser: z.record(z.string(), z.boolean()).default({}),
  undoByUser: z.record(z.string(), z.boolean()).default({}),
  /** Confirm checklist / packlist / crew / schedule line deletes in planner & production detail. */
  confirmPlannerListDeletesByUser: z.record(z.string(), z.boolean()).default({}),
});

export type DefaultSettings = z.infer<typeof defaultSettingsSchema>;

export class SettingsService {
  private static SETTINGS_KEY = 'defaultSettings';
  private static CABINETS_KEY = 'cabinets';

  // Load default settings
  static loadDefaultSettings(): DefaultSettings {
    try {
      const settings = (window.electronStore?.getData?.(this.SETTINGS_KEY) as DefaultSettings | undefined)
        ?? (() => {
          const rawValue = localStorage.getItem(this.SETTINGS_KEY);
          return rawValue ? (JSON.parse(rawValue) as DefaultSettings) : undefined;
        })();
      if (!settings) return this.getDefaultSettings();
      
      return defaultSettingsSchema.parse(settings);
    } catch (error) {
      console.error('Error loading settings:', error);
      return this.getDefaultSettings();
    }
  }

  // Save default settings
  static saveDefaultSettings(settings: DefaultSettings): void {
    try {
      const validated = defaultSettingsSchema.parse(settings);
      try {
        window.electronStore?.setData?.(this.SETTINGS_KEY, validated);
      } catch {
        // Fall back to localStorage when Electron bridge is unavailable.
      }
      localStorage.setItem(this.SETTINGS_KEY, JSON.stringify(validated));
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(DEFAULT_SETTINGS_CHANGED_EVENT));
      }
      requestCloudSync();
    } catch (error) {
      console.error('Error saving settings:', error);
      throw error;
    }
  }

  // Get initial default settings
  private static getDefaultSettings(): DefaultSettings {
    return {
      defaultOrderStatus: 'delivered',
      enableQRTracking: true,
      requireCheckoutForSecureCabinets: true,
      autoGenerateQRCodes: true,
      defaultMinQuantity: 0,
      defaultReorderLevel: 5,
      theme: 'light',
      condensedView: true,
      mobileTabletUi: true,
      assetCodeMode: 'qr',
      autoAssignAssetId: true,
      recordIdPrefix: 'REC',
      recordIdSequence: 0,
      assetIdPrefix: 'AST',
      adminNotificationEmail: '',
      assetIdSequence: 0,
      maintenanceCautionsEnabled: true,
      maintenanceCautionMode: 'on-air',
      maintenanceProgrammingBlockMinutes: 60,
      maintenanceOnAirSchedule: { ...EMPTY_MAINTENANCE_ON_AIR_SCHEDULE },
      deleteConfirmationByUser: {},
      undoByUser: {},
      confirmPlannerListDeletesByUser: {},
    };
  }

  /** Replace all cabinets (used by settings snapshot restore). */
  static async replaceAllCabinets(cabinets: Cabinet[]): Promise<void> {
    const list = Array.isArray(cabinets) ? cabinets : [];
    try {
      window.electronStore?.setData?.(this.CABINETS_KEY, list);
    } catch {
      // localStorage fallback below
    }
    localStorage.setItem(this.CABINETS_KEY, JSON.stringify(list));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(SETTINGS_UPDATED_EVENT));
    }
    requestCloudSync();
  }

  // Cabinet Management
  static async getCabinets(): Promise<Cabinet[]> {
    try {
      const electronCabinets = window.electronStore?.getData?.(this.CABINETS_KEY) as Cabinet[] | undefined;
      if (electronCabinets && Array.isArray(electronCabinets)) {
        localStorage.setItem(this.CABINETS_KEY, JSON.stringify(electronCabinets));
        return electronCabinets;
      }
      const localCabinetsRaw = localStorage.getItem(this.CABINETS_KEY);
      return localCabinetsRaw ? (JSON.parse(localCabinetsRaw) as Cabinet[]) : [];
    } catch (error) {
      console.error('Error loading cabinets:', error);
      return [];
    }
  }

  static async saveCabinet(cabinet: Cabinet): Promise<void> {
    try {
      const cabinets = await this.getCabinets();
      const existingIndex = cabinets.findIndex(c => c.id === cabinet.id);
      
      if (existingIndex >= 0) {
        cabinets[existingIndex] = cabinet;
      } else {
        cabinets.push(cabinet);
      }

      try {
        window.electronStore?.setData?.(this.CABINETS_KEY, cabinets);
      } catch {
        // no-op, localStorage fallback below
      }
      localStorage.setItem(this.CABINETS_KEY, JSON.stringify(cabinets));
      window.dispatchEvent(new CustomEvent(SETTINGS_UPDATED_EVENT));
      requestCloudSync();
    } catch (error) {
      console.error('Error saving cabinet:', error);
      throw error;
    }
  }

  static async deleteCabinet(cabinetId: string): Promise<void> {
    try {
      const cabinets = await this.getCabinets();
      const filtered = cabinets.filter(c => c.id !== cabinetId);
      try {
        window.electronStore?.setData?.(this.CABINETS_KEY, filtered);
      } catch {
        // no-op, localStorage fallback below
      }
      localStorage.setItem(this.CABINETS_KEY, JSON.stringify(filtered));
      window.dispatchEvent(new CustomEvent(SETTINGS_UPDATED_EVENT));
      requestCloudSync();
    } catch (error) {
      console.error('Error deleting cabinet:', error);
      throw error;
    }
  }

  static async getCabinetsByLocation(locationId: string): Promise<Cabinet[]> {
    try {
      const cabinets = await this.getCabinets();
      return cabinets.filter(c => c.locationId === locationId);
    } catch (error) {
      console.error('Error getting cabinets by location:', error);
      return [];
    }
  }

  static async getCabinetWithItems(cabinetId: string, items: any[]): Promise<CabinetWithItems | null> {
    try {
      const cabinets = await this.getCabinets();
      const cabinet = cabinets.find(c => c.id === cabinetId);
      if (!cabinet) return null;

      const cabinetItems = items.filter(item => item.cabinet === cabinetId);
      return {
        ...cabinet,
        items: cabinetItems.map(item => ({
          id: item.id,
          name: item.name,
          quantity: item.quantity
        }))
      };
    } catch (error) {
      console.error('Error getting cabinet with items:', error);
      return null;
    }
  }
} 