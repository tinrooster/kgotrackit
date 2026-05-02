import type { InventoryItem } from '@/types/inventory';
import type { Settings } from '@/lib/storageService';
import type { FinancialSettings } from '@/lib/financialSettingsService';

export interface GroupReconcileIssue {
  field: string;
  count: number;
}

export interface GroupReconcileResult {
  itemsTouched: number;
  issues: GroupReconcileIssue[];
  details: string[];
  detailsTruncated: boolean;
}

const MAX_DETAIL_LINES = 120;

const isBlankFinancialCode = (value: string | undefined) => {
  const trimmed = (value ?? '').trim();
  return trimmed.length === 0 || trimmed.toUpperCase() === 'N/A';
};

const itemLabel = (item: InventoryItem) => `"${item.name}" (${item.id})`;

/**
 * Aligns inventory reference fields with current user-defined lists and financial code tables.
 * Mirrors the per-tab "Fix unreconciled" behavior in one pass.
 */
export function reconcileInventoryGroup(
  items: InventoryItem[],
  settings: Settings,
  financial: FinancialSettings
): { nextItems: InventoryItem[]; result: GroupReconcileResult } {
  const validCategories = new Set(settings.categories.map((entry) => entry.name));
  const validUnits = new Set(settings.units.map((entry) => entry.name));
  const validLocations = new Set(settings.locations.map((entry) => entry.name));
  const validSuppliers = new Set(settings.suppliers.map((entry) => entry.name));
  const validProjects = new Set(settings.projects.map((entry) => entry.name));
  const validExpenseCodes = new Set(settings.expenseCodes.map((entry) => entry.name));

  const validExpenseTypeCodes = new Set(financial.expenseTypes.map((entry) => entry.code));
  const validCostCenterCodes = new Set(financial.costCenters.map((entry) => entry.code));

  const defaultUnitName = settings.units[0]?.name ?? 'each';

  const issues: GroupReconcileIssue[] = [];
  const details: string[] = [];

  const bump = (field: string) => {
    const existing = issues.find((entry) => entry.field === field);
    if (existing) existing.count += 1;
    else issues.push({ field, count: 1 });
  };

  let suppressedDetailLines = 0;
  const pushDetail = (line: string) => {
    if (details.length < MAX_DETAIL_LINES) {
      details.push(line);
    } else {
      suppressedDetailLines += 1;
    }
  };

  let itemsTouched = 0;

  const nextItems = items.map((item) => {
    let next: InventoryItem = item;
    let changed = false;

    const apply = (updated: InventoryItem) => {
      next = updated;
      changed = true;
    };

    if (item.category && !validCategories.has(item.category)) {
      const { category, ...rest } = next;
      apply({
        ...rest,
        customFields: {
          ...next.customFields,
          previousCategory: category,
        },
      });
      bump('category');
      pushDetail(`${itemLabel(item)}: cleared invalid category "${category}"`);
    }

    if (item.unit && !validUnits.has(item.unit)) {
      apply({
        ...next,
        unit: defaultUnitName,
        customFields: {
          ...next.customFields,
          previousUnit: item.unit,
        },
      });
      bump('unit');
      pushDetail(`${itemLabel(item)}: unit "${item.unit}" → "${defaultUnitName}"`);
    }

    if (item.location && !validLocations.has(item.location)) {
      const { location, ...rest } = next;
      apply({
        ...rest,
        customFields: {
          ...next.customFields,
          previousLocation: location,
        },
      });
      bump('location');
      pushDetail(`${itemLabel(item)}: cleared invalid location "${location}"`);
    }

    if (item.supplier && !validSuppliers.has(item.supplier)) {
      const { supplier, ...rest } = next;
      apply({
        ...rest,
        customFields: {
          ...next.customFields,
          previousSupplier: supplier,
        },
      });
      bump('supplier');
      pushDetail(`${itemLabel(item)}: cleared invalid supplier "${supplier}"`);
    }

    if (item.project && !validProjects.has(item.project)) {
      const { project, ...rest } = next;
      apply({
        ...rest,
        customFields: {
          ...next.customFields,
          previousProject: project,
        },
      });
      bump('project');
      pushDetail(`${itemLabel(item)}: cleared invalid project "${project}"`);
    }

    if (item.expenseCode && !validExpenseCodes.has(item.expenseCode)) {
      const { expenseCode, ...rest } = next;
      apply({
        ...rest,
        customFields: {
          ...next.customFields,
          previousExpenseCode: expenseCode,
        },
      });
      bump('expenseCode');
      pushDetail(`${itemLabel(item)}: cleared invalid expense code label "${expenseCode}"`);
    }

    if (!isBlankFinancialCode(item.expenseTypeCode) && !validExpenseTypeCodes.has(item.expenseTypeCode!.trim())) {
      const { expenseTypeCode, expenseTypeDescription, ...rest } = next;
      apply({
        ...rest,
        customFields: {
          ...next.customFields,
          previousExpenseTypeCode: expenseTypeCode,
          previousExpenseTypeDescription: expenseTypeDescription,
        },
      });
      bump('expenseTypeCode');
      pushDetail(`${itemLabel(item)}: cleared invalid expense type code "${expenseTypeCode}"`);
    }

    if (!isBlankFinancialCode(item.costCenterCode) && !validCostCenterCodes.has(item.costCenterCode!.trim())) {
      const { costCenterCode, costCenterDescription, ...rest } = next;
      apply({
        ...rest,
        customFields: {
          ...next.customFields,
          previousCostCenterCode: costCenterCode,
          previousCostCenterDescription: costCenterDescription,
        },
      });
      bump('costCenterCode');
      pushDetail(`${itemLabel(item)}: cleared invalid cost center code "${costCenterCode}"`);
    }

    if (changed) itemsTouched += 1;
    return next;
  });

  return {
    nextItems,
    result: {
      itemsTouched,
      issues,
      details,
      detailsTruncated: suppressedDetailLines > 0,
    },
  };
}

