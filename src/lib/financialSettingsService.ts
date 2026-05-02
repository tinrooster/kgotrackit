export interface FinancialCodeEntry {
  id: string;
  code: string;
  description: string;
}

export interface FinancialSettings {
  expenseTypes: FinancialCodeEntry[];
  costCenters: FinancialCodeEntry[];
}

const STORAGE_KEYS = {
  expenseTypes: 'inventory-expense-types',
  costCenters: 'inventory-cost-centers',
} as const;

const DEFAULT_FINANCIAL_SETTINGS: FinancialSettings = {
  expenseTypes: [
    { id: crypto.randomUUID(), code: '685001', description: 'Supplies - General' },
    { id: crypto.randomUUID(), code: '683001', description: 'Repairs & Maintenance - General' },
    { id: crypto.randomUUID(), code: '685060', description: 'Electrical' },
    { id: crypto.randomUUID(), code: '683035', description: 'Machinery & Equipment' },
    { id: crypto.randomUUID(), code: '500980', description: 'Other' },
  ],
  costCenters: [
    { id: crypto.randomUUID(), code: '1274-108-5430105', description: 'NABET Maint. Engr' },
    { id: crypto.randomUUID(), code: '1274-108-5430103', description: 'Technical Admin' },
    { id: crypto.randomUUID(), code: '1274-108-5430120', description: 'NABET ENG Camera' },
  ],
};

const readKey = (key: string) => {
  try {
    const electronValue = (window as any)?.electronStore?.getData?.(key);
    if (Array.isArray(electronValue)) return electronValue;
  } catch {
    // no-op
  }

  try {
    const localValue = localStorage.getItem(key);
    return localValue ? JSON.parse(localValue) : undefined;
  } catch {
    return undefined;
  }
};

const writeKey = (key: string, value: unknown) => {
  try {
    (window as any)?.electronStore?.setData?.(key, value);
  } catch {
    // no-op
  }
  localStorage.setItem(key, JSON.stringify(value));
};

const normalizeEntries = (raw: unknown): FinancialCodeEntry[] => {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry: any) => ({
      id: String(entry?.id || crypto.randomUUID()),
      code: String(entry?.code || '').trim(),
      description: String(entry?.description || '').trim(),
    }))
    .filter((entry) => entry.code.length > 0 && entry.description.length > 0);
};

export const getFinancialSettings = (): FinancialSettings => {
  const expenseTypes = normalizeEntries(readKey(STORAGE_KEYS.expenseTypes));
  const costCenters = normalizeEntries(readKey(STORAGE_KEYS.costCenters));

  const merged: FinancialSettings = {
    expenseTypes: expenseTypes.length > 0 ? expenseTypes : DEFAULT_FINANCIAL_SETTINGS.expenseTypes,
    costCenters: costCenters.length > 0 ? costCenters : DEFAULT_FINANCIAL_SETTINGS.costCenters,
  };

  writeKey(STORAGE_KEYS.expenseTypes, merged.expenseTypes);
  writeKey(STORAGE_KEYS.costCenters, merged.costCenters);
  return merged;
};

export const saveFinancialSettings = (settings: FinancialSettings) => {
  writeKey(STORAGE_KEYS.expenseTypes, normalizeEntries(settings.expenseTypes));
  writeKey(STORAGE_KEYS.costCenters, normalizeEntries(settings.costCenters));
};
