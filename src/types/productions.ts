import type { DemoSeedMeta } from '@/types/inventory';

export type ProductionStatus = 'planning' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled';

export interface ChecklistItem {
  id: string;
  label: string;
  completed: boolean;
  quantity?: number;
  reservedQuantity?: number;
  checkedOutQuantity?: number;
  notes?: string;
  /** Optional link to an existing InventoryItem by its id. */
  inventoryItemId?: string;
}

export interface ChecklistGroup {
  id: string;
  title: string;
  items: ChecklistItem[];
}

/** A grouped bundle on a vehicle (usually imported from one production checklist section). */
export interface VehiclePacklistSection {
  id: string;
  title: string;
  /** Links to checklist group id for checklist-completion warnings in the Vehicles tab. */
  checklistGroupId?: string;
  items: ChecklistItem[];
}

export interface VehiclePacklist {
  id: string;
  vehicleName: string;
  /** Ungrouped lines (manual or bulk-added). Sections are listed separately. */
  items: ChecklistItem[];
  /** Checklist-derived packs grouped under one collapsible heading. */
  sections?: VehiclePacklistSection[];
}

export interface ProductionCrewMember {
  id: string;
  name: string;
  role: string;
  department?: string;
  contactId?: string;
  positionTemplateId?: string;
  positionLabel?: string;
  phone?: string;
  email?: string;
  contact?: string;
  notes?: string;
  shifts?: CrewAssignmentShift[];
}

export interface PositionTemplate {
  id: string;
  label: string;
  defaultRoleTag?: string;
  defaultLocation?: string;
  sortOrder: number;
  /** Set by `src/lib/demoSeed/`. Presence flags this template as demo data. */
  __demoSeed?: DemoSeedMeta;
}

export interface CrewAssignmentShift {
  id: string;
  date: string;
  callTime?: string;
  startTime?: string;
  endTime?: string;
  location?: string;
  notes?: string;
}

export interface CrewScheduleEntry {
  id: string;
  crewMemberId: string;
  date: string;
  startTime?: string;
  endTime?: string;
  role?: string;
  location?: string;
  notes?: string;
}

export interface Production {
  id: string;
  /** Set by `src/lib/demoSeed/`. Presence flags this production as demo data. */
  __demoSeed?: DemoSeedMeta;
  name: string;
  client?: string;
  location?: string;
  /** ISO date string (YYYY-MM-DD). */
  startDate?: string;
  /** ISO date string (YYYY-MM-DD). */
  endDate?: string;
  /** Preferred schedule start time for planners (HH:mm). */
  scheduleDefaultStartTime?: string;
  /** Preferred schedule end time for planners (HH:mm). */
  scheduleDefaultEndTime?: string;
  status: ProductionStatus;
  description?: string;
  checklistGroups: ChecklistGroup[];
  vehiclePacklists: VehiclePacklist[];
  crew: ProductionCrewMember[];
  crewSchedule?: CrewScheduleEntry[];
  notes?: string;
  /** ISO timestamp. */
  createdAt: string;
  /** ISO timestamp. */
  updatedAt: string;
  createdBy?: string;
}

export const PRODUCTION_STATUS_LABELS: Record<ProductionStatus, string> = {
  planning: 'Planning',
  confirmed: 'Confirmed',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export const PRODUCTION_STATUS_OPTIONS = (
  Object.entries(PRODUCTION_STATUS_LABELS) as [ProductionStatus, string][]
).map(([value, label]) => ({ value, label }));
