import { getActiveOrganizationId } from '@/lib/supabase/organizationData';
import { requestCloudSync } from '@/lib/cloudSyncEvents';
import type { FleetState, FleetVehicle, SubsystemLoan } from '@/types/fleet';

export const FLEET_UPDATED_EVENT = 'trackit:fleet-updated';

const FLEET_STORAGE_KEY_BASE = 'trackit:fleet';

function getFleetStorageKey(): string {
  const orgId = getActiveOrganizationId();
  if (!orgId) return FLEET_STORAGE_KEY_BASE;
  return `${FLEET_STORAGE_KEY_BASE}:org:${orgId}`;
}

const EMPTY_FLEET: FleetState = { vehicles: [], loans: [] };

function normalizeFleetState(raw: unknown): FleetState {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return EMPTY_FLEET;
  const source = raw as Record<string, unknown>;
  return {
    vehicles: Array.isArray(source.vehicles) ? (source.vehicles as FleetVehicle[]) : [],
    loans: Array.isArray(source.loans) ? (source.loans as SubsystemLoan[]) : [],
  };
}

export function getFleet(): FleetState {
  const key = getFleetStorageKey();
  try {
    const electronValue = window.electronStore?.getData?.(key) as unknown;
    if (electronValue && typeof electronValue === 'object' && !Array.isArray(electronValue)) {
      return normalizeFleetState(electronValue);
    }
  } catch {
    // ignore
  }
  try {
    const raw = localStorage.getItem(key);
    return raw ? normalizeFleetState(JSON.parse(raw)) : EMPTY_FLEET;
  } catch {
    return EMPTY_FLEET;
  }
}

export function saveFleet(state: FleetState): void {
  const key = getFleetStorageKey();
  try {
    window.electronStore?.setData?.(key, state);
  } catch {
    // ignore
  }
  try {
    localStorage.setItem(key, JSON.stringify(state));
  } catch {
    // ignore
  }
  window.dispatchEvent(new CustomEvent(FLEET_UPDATED_EVENT, { detail: state }));
  requestCloudSync();
}

export function upsertVehicle(vehicle: FleetVehicle): void {
  const state = getFleet();
  const idx = state.vehicles.findIndex((v) => v.id === vehicle.id);
  const updated = { ...vehicle, updatedAt: new Date().toISOString() };
  if (idx >= 0) {
    state.vehicles[idx] = updated;
  } else {
    state.vehicles = [...state.vehicles, updated].sort((a, b) => a.displayOrder - b.displayOrder);
  }
  saveFleet(state);
}

export function removeVehicle(vehicleId: string): void {
  const state = getFleet();
  saveFleet({ ...state, vehicles: state.vehicles.filter((v) => v.id !== vehicleId) });
}

export function setVehicleStatus(vehicleId: string, status: FleetVehicle['status']): void {
  const state = getFleet();
  const vehicle = state.vehicles.find((v) => v.id === vehicleId);
  if (!vehicle) return;
  upsertVehicle({ ...vehicle, status });
}

// ---------------------------------------------------------------------------
// Seed
// ---------------------------------------------------------------------------

type SeedSpec = { code: string; kind: FleetVehicle['kind']; order: number; caps: FleetVehicle['capabilities'] };

const DEFAULT_TRUCK_CAPS: FleetVehicle['capabilities'] = ['liveshot', 'dejero', 'edit'];

const SEED_SPECS: SeedSpec[] = [
  ...Array.from({ length: 25 }, (_, i) => ({
    code: `M${i + 1}`,
    kind: 'truck' as const,
    order: i + 1,
    caps: DEFAULT_TRUCK_CAPS,
  })),
  { code: 'M-26',      kind: 'truck',     order: 26, caps: ['liveshot', 'dejero'] },
  { code: 'M-33',      kind: 'maint_eng', order: 33, caps: [] },
  { code: 'Sat Truck', kind: 'sat_truck', order: 50, caps: ['liveshot', 'satellite'] },
  { code: 'Expedition',kind: 'expedition',order: 51, caps: ['liveshot'] },
];

export function seedDefaultFleet(): void {
  const now = new Date().toISOString();
  const vehicles: FleetVehicle[] = SEED_SPECS.map((s) => ({
    id: crypto.randomUUID(),
    code: s.code,
    kind: s.kind,
    displayOrder: s.order,
    status: 'in_service',
    capabilities: s.caps,
    subsystems: [],
    assignments: [],
    scheduledWork: [],
    createdAt: now,
    updatedAt: now,
  }));
  saveFleet({ vehicles, loans: [] });
}
