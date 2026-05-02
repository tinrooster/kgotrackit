import type { FieldErrors } from "react-hook-form";

export type InventoryFormTabId = "details" | "inventory" | "additional";

/** Maps each inventory form field to the tab that contains it (create item / template dialogs). */
const FIELD_TO_TAB: Record<string, InventoryFormTabId> = {
  name: "details",
  description: "details",
  companyAssetTag: "additional",
  category: "details",
  location: "details",
  locationSubcategory: "details",
  rackLocation: "details",
  cabinet: "details",
  project: "details",
  assetStatus: "details",
  expenseTypeCode: "additional",
  expenseTypeDescription: "additional",
  costCenterCode: "additional",
  costCenterDescription: "additional",
  expenseCode: "details",
  assetTrackingMode: "details",
  assetTagEnd: "details",
  templateName: "details",
  quantity: "inventory",
  unit: "inventory",
  unitSubcategory: "inventory",
  minQuantity: "inventory",
  costPerUnit: "inventory",
  supplier: "inventory",
  supplierWebsite: "inventory",
  barcode: "additional",
  serialNumber: "additional",
  manufacturer: "additional",
  modelNumber: "additional",
  dateInService: "additional",
  manufacturerNotes: "additional",
  maintenanceNotes: "additional",
  additionalNotes: "additional",
  photoUrl: "additional",
  decomEOLDate: "additional",
  decomCutoverDate: "additional",
  decomLastAuditAt: "additional",
  decomNotes: "additional",
};

function collectRootFieldNames(errors: FieldErrors | undefined): string[] {
  if (!errors || typeof errors !== "object") {
    return [];
  }
  const roots = new Set<string>();
  const walk = (obj: object, prefix: string) => {
    for (const key of Object.keys(obj)) {
      const node = (obj as Record<string, unknown>)[key];
      const path = prefix ? `${prefix}.${key}` : key;
      const root = path.split(".")[0] ?? key;
      if (node && typeof node === "object" && "message" in node && typeof (node as { message?: unknown }).message === "string") {
        roots.add(root);
      } else if (node && typeof node === "object" && node !== null && !("message" in node)) {
        walk(node as object, path);
      }
    }
  };
  walk(errors, "");
  return [...roots];
}

/** First tab (in display order) that has a validation error. */
export function getFirstTabWithErrors(
  errors: FieldErrors | undefined,
  tabOrder: InventoryFormTabId[] = ["details", "inventory", "additional"]
): InventoryFormTabId | null {
  const fields = collectRootFieldNames(errors);
  if (fields.length === 0) {
    return null;
  }
  for (const tab of tabOrder) {
    if (fields.some((f) => FIELD_TO_TAB[f] === tab)) {
      return tab;
    }
  }
  return tabOrder[0] ?? null;
}
