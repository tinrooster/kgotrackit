import type { ItemWithSubcategories } from "@/types/inventory";

export interface SupplierProfile {
  name: string;
  website?: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  supportEmail?: string;
  supportPhone?: string;
  accountReference?: string;
  supplierNotes?: string;
}

const clean = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

export function toSupplierProfile(row: ItemWithSubcategories | undefined): SupplierProfile | null {
  if (!row?.name) return null;
  return {
    name: row.name,
    website: clean(row.website),
    contactName: clean(row.contactName),
    contactEmail: clean(row.contactEmail),
    contactPhone: clean(row.contactPhone),
    supportEmail: clean(row.supportEmail),
    supportPhone: clean(row.supportPhone),
    accountReference: clean(row.accountReference),
    supplierNotes: clean(row.supplierNotes),
  };
}

export function findSupplierProfile(
  suppliers: ItemWithSubcategories[],
  supplierName?: string,
): SupplierProfile | null {
  const normalizedName = clean(supplierName);
  if (!normalizedName) return null;
  return toSupplierProfile(suppliers.find((row) => row.name === normalizedName));
}

