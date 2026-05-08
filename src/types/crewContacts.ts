import type { DemoSeedMeta } from '@/types/inventory';

export type CrewContactType = 'crew' | 'vendor';

export interface CrewContact {
  id: string;
  /** Set by `src/lib/demoSeed/`. Presence flags this contact as demo data. */
  __demoSeed?: DemoSeedMeta;
  fullName: string;
  contactType: CrewContactType;
  roleTags: string[];
  defaultEquipmentItemIds: string[];
  organizationName?: string;
  functionalArea?: string;
  preferredVehicle?: string;
  vehicleNotes?: string;
  phone?: string;
  email?: string;
  notes?: string;
  baseLocation?: string;
  unionStatus?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CrewContactDraft {
  fullName: string;
  contactType: CrewContactType;
  roleTags: string;
  defaultEquipmentItemIds: string[];
  organizationName: string;
  functionalArea: string;
  preferredVehicle: string;
  vehicleNotes: string;
  phone: string;
  email: string;
  notes: string;
  baseLocation: string;
  unionStatus: string;
  isActive: boolean;
}
