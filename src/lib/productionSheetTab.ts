export const PRODUCTION_SHEET_TABS = ['overview', 'checklist', 'vehicles', 'crew', 'schedule'] as const;
export type ProductionSheetTab = (typeof PRODUCTION_SHEET_TABS)[number];

export function normalizeProductionSheetTab(value: string | null | undefined): ProductionSheetTab {
  if (value && (PRODUCTION_SHEET_TABS as readonly string[]).includes(value)) {
    return value as ProductionSheetTab;
  }
  return 'overview';
}
