/** Catalog row for parts / devices (local + full backup); used from item & template forms. */
export type DeviceLibraryKind = 'generic' | 'cable' | 'media_converter' | 'display';

export interface DeviceLibraryEntry {
  id: string;
  kind: DeviceLibraryKind;
  manufacturer: string;
  modelNumber: string;
  /** Typical sell / stock unit label (e.g. matches Units list or free text like "1000 ft spool"). */
  defaultStockUnit?: string;
  /** Default jacket color for cable SKUs (e.g. Yellow for video SDI). */
  defaultCableColor?: string;
  /** For media converters: signal path, e.g. "SDI to HDMI". */
  conversionSpec?: string;
  /** Quantity to add when running one-click restock (e.g. 1000 for a full spool in ft). */
  restockPackageQuantity?: number;
  defaultSupplier?: string;
  defaultSupplierWebsite?: string;
  notes?: string;
  createdAt: string;
}
