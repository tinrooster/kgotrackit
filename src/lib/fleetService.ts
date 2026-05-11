import { getActiveOrganizationId } from '@/lib/supabase/organizationData';
import { requestCloudSync } from '@/lib/cloudSyncEvents';
import type { FleetState, FleetVehicle, SubsystemLoan, VehicleSubsystem, ScheduledWorkEntry } from '@/types/fleet';
import { SUBSYSTEM_KIND_LABELS, VEHICLE_STATUS_LABELS } from '@/types/fleet';
import { appendLogEntry } from '@/lib/fleetLogService';

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
  appendLogEntry({
    vehicleIds: [vehicleId],
    category: status === 'in_shop' || status === 'out_of_service' ? 'issue'
      : status === 'in_service' || status === 'spare' ? 'resolved'
      : 'info',
    body: `${vehicle.code} status changed to ${VEHICLE_STATUS_LABELS[status]}`,
  }).catch(() => {});
}

// ---------------------------------------------------------------------------
// Subsystems
// ---------------------------------------------------------------------------

function patchVehicle(state: FleetState, vehicleId: string, patch: Partial<FleetVehicle>): FleetState {
  return {
    ...state,
    vehicles: state.vehicles.map((v) =>
      v.id === vehicleId ? { ...v, ...patch, updatedAt: new Date().toISOString() } : v,
    ),
  };
}

export function addSubsystem(vehicleId: string, subsystem: VehicleSubsystem): void {
  const state = getFleet();
  const vehicle = state.vehicles.find((v) => v.id === vehicleId);
  if (!vehicle) return;
  saveFleet(patchVehicle(state, vehicleId, { subsystems: [...vehicle.subsystems, subsystem] }));
}

export function updateSubsystem(vehicleId: string, subsystem: VehicleSubsystem): void {
  const state = getFleet();
  const vehicle = state.vehicles.find((v) => v.id === vehicleId);
  if (!vehicle) return;
  saveFleet(patchVehicle(state, vehicleId, {
    subsystems: vehicle.subsystems.map((s) => s.id === subsystem.id ? subsystem : s),
  }));
}

export function removeSubsystem(vehicleId: string, subsystemId: string): void {
  const state = getFleet();
  const vehicle = state.vehicles.find((v) => v.id === vehicleId);
  if (!vehicle) return;
  saveFleet(patchVehicle(state, vehicleId, {
    subsystems: vehicle.subsystems.filter((s) => s.id !== subsystemId),
  }));
}

// ---------------------------------------------------------------------------
// Scheduled work (with takesOffline auto-flip)
// ---------------------------------------------------------------------------

function recomputeStatus(vehicle: FleetVehicle): FleetVehicle['status'] {
  const hasActiveOffline = vehicle.scheduledWork.some(
    (w) => w.takesOffline && (w.status === 'scheduled' || w.status === 'in_progress'),
  );
  if (hasActiveOffline) return 'in_shop';
  if (vehicle.status === 'in_shop') return 'in_service';
  return vehicle.status;
}

export function addScheduledWork(vehicleId: string, entry: ScheduledWorkEntry): void {
  const state = getFleet();
  const vehicle = state.vehicles.find((v) => v.id === vehicleId);
  if (!vehicle) return;
  const updated = { ...vehicle, scheduledWork: [...vehicle.scheduledWork, entry] };
  saveFleet(patchVehicle(state, vehicleId, { scheduledWork: updated.scheduledWork, status: recomputeStatus(updated) }));
}

export function updateScheduledWork(vehicleId: string, entry: ScheduledWorkEntry): void {
  const state = getFleet();
  const vehicle = state.vehicles.find((v) => v.id === vehicleId);
  if (!vehicle) return;
  const updated = { ...vehicle, scheduledWork: vehicle.scheduledWork.map((w) => w.id === entry.id ? entry : w) };
  saveFleet(patchVehicle(state, vehicleId, { scheduledWork: updated.scheduledWork, status: recomputeStatus(updated) }));
}

export function removeScheduledWork(vehicleId: string, entryId: string): void {
  const state = getFleet();
  const vehicle = state.vehicles.find((v) => v.id === vehicleId);
  if (!vehicle) return;
  const updated = { ...vehicle, scheduledWork: vehicle.scheduledWork.filter((w) => w.id !== entryId) };
  saveFleet(patchVehicle(state, vehicleId, { scheduledWork: updated.scheduledWork, status: recomputeStatus(updated) }));
}

// ---------------------------------------------------------------------------
// Subsystem loans
// ---------------------------------------------------------------------------

export function openLoan(loan: SubsystemLoan): void {
  let state = getFleet();

  const donorVehicle = state.vehicles.find((v) => v.id === loan.donorVehicleId);
  if (donorVehicle) {
    state = patchVehicle(state, loan.donorVehicleId, {
      subsystems: donorVehicle.subsystems.map((s) =>
        s.kind === loan.subsystemKind ? { ...s, status: 'loaned_out' as const } : s,
      ),
    });
  }

  const recipientVehicle = state.vehicles.find((v) => v.id === loan.recipientVehicleId);
  if (recipientVehicle) {
    const hasKind = recipientVehicle.subsystems.some((s) => s.kind === loan.subsystemKind);
    if (hasKind) {
      state = patchVehicle(state, loan.recipientVehicleId, {
        subsystems: recipientVehicle.subsystems.map((s) =>
          s.kind === loan.subsystemKind ? { ...s, status: 'loaned_in' as const } : s,
        ),
      });
    } else {
      const stub: VehicleSubsystem = {
        id: crypto.randomUUID(),
        kind: loan.subsystemKind,
        label: SUBSYSTEM_KIND_LABELS[loan.subsystemKind],
        status: 'loaned_in',
        notes: `On loan from ${donorVehicle?.code ?? 'another vehicle'}`,
      };
      state = patchVehicle(state, loan.recipientVehicleId, {
        subsystems: [...recipientVehicle.subsystems, stub],
      });
    }
  }

  saveFleet({ ...state, loans: [...state.loans, loan] });

  const donorCode = state.vehicles.find((v) => v.id === loan.donorVehicleId)?.code ?? loan.donorVehicleId;
  const recipientCode = state.vehicles.find((v) => v.id === loan.recipientVehicleId)?.code ?? loan.recipientVehicleId;
  appendLogEntry({
    vehicleIds: [loan.donorVehicleId, loan.recipientVehicleId],
    category: 'info',
    body: `${SUBSYSTEM_KIND_LABELS[loan.subsystemKind]} moved from ${donorCode} to ${recipientCode} (on loan)`,
  }).catch(() => {});
}

export function closeLoan(loanId: string): void {
  let state = getFleet();
  const loan = state.loans.find((l) => l.id === loanId);
  if (!loan) return;

  const donorVehicle = state.vehicles.find((v) => v.id === loan.donorVehicleId);
  if (donorVehicle) {
    state = patchVehicle(state, loan.donorVehicleId, {
      subsystems: donorVehicle.subsystems.map((s) =>
        s.kind === loan.subsystemKind && s.status === 'loaned_out'
          ? { ...s, status: 'operational' as const }
          : s,
      ),
    });
  }

  const recipientVehicle = state.vehicles.find((v) => v.id === loan.recipientVehicleId);
  if (recipientVehicle) {
    state = patchVehicle(state, loan.recipientVehicleId, {
      subsystems: recipientVehicle.subsystems.map((s) =>
        s.kind === loan.subsystemKind && s.status === 'loaned_in'
          ? { ...s, status: 'operational' as const }
          : s,
      ),
    });
  }

  saveFleet({
    ...state,
    loans: state.loans.map((l) => l.id === loanId ? { ...l, resolvedAt: new Date().toISOString() } : l),
  });

  const donorCode = state.vehicles.find((v) => v.id === loan.donorVehicleId)?.code ?? loan.donorVehicleId;
  const recipientCode = state.vehicles.find((v) => v.id === loan.recipientVehicleId)?.code ?? loan.recipientVehicleId;
  appendLogEntry({
    vehicleIds: [loan.donorVehicleId, loan.recipientVehicleId],
    category: 'resolved',
    body: `${SUBSYSTEM_KIND_LABELS[loan.subsystemKind]} returned to ${donorCode} from ${recipientCode}`,
  }).catch(() => {});
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
