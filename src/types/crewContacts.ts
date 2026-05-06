export interface CrewContact {
  id: string;
  fullName: string;
  roleTags: string[];
  defaultEquipmentItemIds: string[];
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
  roleTags: string;
  defaultEquipmentItemIds: string[];
  preferredVehicle: string;
  vehicleNotes: string;
  phone: string;
  email: string;
  notes: string;
  baseLocation: string;
  unionStatus: string;
  isActive: boolean;
}
