export type VehicleStatus = 'in_service' | 'spare' | 'in_shop' | 'out_of_service' | 'limited_use';
export type SubsystemStatus = 'operational' | 'degraded' | 'down' | 'loaned_out' | 'loaned_in' | 'awaiting_repair';
export type LogCategory = 'issue' | 'scheduled' | 'resolved' | 'reassignment' | 'location' | 'info';
export type ScheduledWorkStatus = 'scheduled' | 'in_progress' | 'done' | 'cancelled';
export type VehicleKind = 'truck' | 'suv' | 'sat_truck' | 'expedition' | 'maint_eng';
export type CapabilityFlag = 'edit' | 'liveshot' | 'dejero' | 'satellite' | 'microwave_mast' | 'p2' | 'audio_pkg';

export interface VehicleSubsystem {
  id: string;
  kind:
    | 'dejero'
    | 'modem'
    | 'p2_reader'
    | 'microwave_mast'
    | 'sat_dish'
    | 'air_pressure'
    | 'laptop'
    | 'camera'
    | 'audio'
    | 'vehicle_mech'
    | 'other';
  label: string;
  status: SubsystemStatus;
  notes?: string;
  inventoryItemId?: string;
  lastCheckedAt?: string;
}

export interface VehicleAssignment {
  id: string;
  contactId: string;
  role: 'photographer' | 'reporter' | 'operator';
  isDefault: boolean;
  startDate?: string;
  endDate?: string;
  notes?: string;
}

export interface ScheduledWorkEntry {
  id: string;
  scheduledFor: string;
  vendor?: string;
  task: string;
  status: ScheduledWorkStatus;
  expectedReturn?: string;
  takesOffline: boolean;
  notes?: string;
}

export interface SubsystemLoan {
  id: string;
  donorVehicleId: string;
  recipientVehicleId: string;
  subsystemKind: VehicleSubsystem['kind'];
  startedAt: string;
  expectedReturn?: string;
  resolvedAt?: string;
  notes?: string;
}

export interface FleetVehicle {
  id: string;
  code: string;
  kind: VehicleKind;
  displayOrder: number;
  status: VehicleStatus;
  location?: string;
  capabilities: CapabilityFlag[];
  truckCellPhone?: string;
  plate?: string;
  vin?: string;
  make?: string;
  model?: string;
  year?: number;
  parkingSpot?: string;
  subsystems: VehicleSubsystem[];
  assignments: VehicleAssignment[];
  scheduledWork: ScheduledWorkEntry[];
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface FleetState {
  vehicles: FleetVehicle[];
  loans: SubsystemLoan[];
}

export const VEHICLE_STATUS_LABELS: Record<VehicleStatus, string> = {
  in_service: 'In Service',
  spare: 'Spare',
  in_shop: 'In Shop',
  out_of_service: 'Out of Service',
  limited_use: 'Limited Use',
};

export const VEHICLE_STATUS_OPTIONS: { value: VehicleStatus; label: string }[] = [
  { value: 'in_service', label: 'In Service' },
  { value: 'spare', label: 'Spare' },
  { value: 'in_shop', label: 'In Shop' },
  { value: 'limited_use', label: 'Limited Use' },
  { value: 'out_of_service', label: 'Out of Service' },
];

export const VEHICLE_KIND_LABELS: Record<VehicleKind, string> = {
  truck: 'News Truck',
  suv: 'SUV',
  sat_truck: 'Satellite Truck',
  expedition: 'Expedition',
  maint_eng: 'Maint / Eng',
};

export const VEHICLE_KIND_OPTIONS: { value: VehicleKind; label: string }[] = [
  { value: 'truck', label: 'News Truck' },
  { value: 'suv', label: 'SUV' },
  { value: 'sat_truck', label: 'Satellite Truck' },
  { value: 'expedition', label: 'Expedition' },
  { value: 'maint_eng', label: 'Maint / Eng' },
];

export const CAPABILITY_LABELS: Record<CapabilityFlag, string> = {
  edit: 'Edit',
  liveshot: 'Liveshot',
  dejero: 'Dejero',
  satellite: 'Satellite',
  microwave_mast: 'Microwave / Mast',
  p2: 'P2',
  audio_pkg: 'Audio Pkg',
};

export const VEHICLE_STATUS_BADGE_CLASSES: Record<VehicleStatus, string> = {
  in_service: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  spare: 'border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-300',
  in_shop: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  out_of_service: 'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300',
  limited_use: 'border-orange-500/40 bg-orange-500/10 text-orange-700 dark:text-orange-300',
};
