export enum OrderStatus {
  PENDING = "PENDING",
  IN_PROGRESS = "IN_PROGRESS",
  COMPLETED = "COMPLETED",
  CANCELLED = "CANCELLED",
  BACK_ORDERED = "BACK_ORDERED"
}

export interface InventoryItem {
  id: string;
  /** Durable human-readable inventory row identifier (monotonic; never reused). */
  recordId?: string;
  name: string;
  description?: string;
  /** Physical asset tag for labels/QR — pattern `{prefix}_{YYMMDD}_{seq}` when auto-assigned. */
  assetId?: string;
  /** Optional company-issued asset tag (distinct from app record ID in `assetId`). */
  companyAssetTag?: string;
  assetStatus?: 'active' | 'hot_spare' | 'cold_spare' | 'in_service' | 'ready_decommission' | 'slated_removal' | 'cut_over_pending' | 'ewaste' | 'other';
  /** Rack cell for server rooms (e.g. TE `TX-06`, Imagine `CA-3`, ITV `IB-4`). */
  rackLocation?: string;
  /** Planned end-of-life date (YYYY-MM-DD). */
  decomEOLDate?: string;
  /** Scheduled cut-over date (YYYY-MM-DD). */
  decomCutoverDate?: string;
  /** Last lifecycle / decommissioning audit timestamp (ISO). */
  decomLastAuditAt?: string;
  /** Notes for audit, EOL, or cut-over planning. */
  decomNotes?: string;
  expenseCode?: string;
  expenseTypeCode?: string;
  expenseTypeDescription?: string;
  costCenterCode?: string;
  costCenterDescription?: string;
  assetTrackingMode?: 'line_item' | 'per_unit';
  assetTagEnd?: string;
  category?: string;
  subcategory?: string;
  unit: string;
  unitSubcategory?: string;
  location?: string;
  locationSubcategory?: string;
  cabinet?: string;
  quantity: number;
  supplier?: string;
  supplierWebsite?: string;
  project?: string;
  notes?: string;
  manufacturerNotes?: string;
  additionalNotes?: string;
  qrCode?: string;
  orderStatus?: OrderStatus;
  deliveryPercentage?: number;
  expectedDeliveryDate?: string | Date;
  minQuantity?: number;
  costPerUnit?: number;
  price?: number;
  reorderLevel?: number;
  barcode?: string;
  serialNumber?: string;
  manufacturer?: string;
  modelNumber?: string;
  dateInService?: string | Date;
  lastMaintenanceDate?: Date;
  nextMaintenanceDate?: Date;
  maintenanceNotes?: string;
  customFields?: Record<string, string>;
  /** Data URL or external https URL for an item photo (stored with the record). */
  photoUrl?: string;
  lastUpdated: Date;
  lastModifiedBy?: string; // Username of the person who last modified the item
}

export interface InventoryHistoryEntry {
  id: string;
  itemId: string;
  itemName: string;
  previousQuantity: number;
  newQuantity: number;
  reason: string;
  timestamp: Date;
  userId?: string; // User ID who made the change
  userName?: string; // Username who made the change
}

export interface Template extends Omit<InventoryItem, 'id' | 'lastUpdated'> {
  templateName: string;
}

export interface CategoryNode {
  id: string;
  name: string;
  children?: CategoryNode[];
  parentId?: string;
  path?: string; // Stores full path like "Electronics/Computers/Laptops"
}

export interface ItemWithSubcategories {
  id: string;
  name: string;
  description?: string;
  color?: string;
  children?: ItemWithSubcategories[];
}