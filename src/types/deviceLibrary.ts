/** Reusable device / part catalog row (local + full backup); future: link from templates and items. */
export interface DeviceLibraryEntry {
  id: string;
  manufacturer: string;
  modelNumber: string;
  defaultSupplier?: string;
  defaultSupplierWebsite?: string;
  notes?: string;
  createdAt: string;
}
