import { v4 as uuidv4 } from 'uuid';
import { getActiveOrganizationId } from '@/lib/supabase/workspaceData';
import { requestCloudSync } from '@/lib/cloudSyncEvents';
import type {
  CrewSchedulerState,
  SchedulerDepartment,
  ShiftDefinition,
  ShiftAssignment,
  CrewAvailability,
  DepartmentMember,
  TeamsIntegrationConfig,
} from '@/types/crewScheduler';

export const CREW_SCHEDULER_UPDATED_EVENT = 'trackit:crew-scheduler-updated';

const STORAGE_KEY_BASE = 'trackit:crew-scheduler';

type ElectronStore = { get: (key: string) => unknown; set: (key: string, value: unknown) => void };

function getStorageKey(): string {
  const orgId = getActiveOrganizationId();
  return orgId ? `${STORAGE_KEY_BASE}:org:${orgId}` : STORAGE_KEY_BASE;
}

function normalizeState(raw: Partial<CrewSchedulerState>): CrewSchedulerState {
  return {
    departments: Array.isArray(raw.departments) ? raw.departments : [],
    shiftDefinitions: Array.isArray(raw.shiftDefinitions) ? raw.shiftDefinitions : [],
    assignments: Array.isArray(raw.assignments) ? raw.assignments : [],
    availability: Array.isArray(raw.availability) ? raw.availability : [],
    departmentMembers: Array.isArray(raw.departmentMembers) ? raw.departmentMembers : [],
    teamsConfig: raw.teamsConfig ?? {},
  };
}

function seedDefaultDepartments(): CrewSchedulerState {
  const now = new Date().toISOString();
  const engId = uuidv4();
  const txId = uuidv4();
  const state: CrewSchedulerState = {
    departments: [
      { id: engId, name: 'Engineering', color: '#3b82f6', sortOrder: 0, createdAt: now, updatedAt: now },
      { id: txId, name: 'Transmission', color: '#8b5cf6', sortOrder: 1, createdAt: now, updatedAt: now },
    ],
    shiftDefinitions: [
      { id: uuidv4(), departmentId: engId, name: 'Morning', startTime: '06:00', endTime: '14:00', requiredStaff: 1, color: '#fbbf24', sortOrder: 0, createdAt: now, updatedAt: now },
      { id: uuidv4(), departmentId: engId, name: 'Day', startTime: '09:00', endTime: '17:00', requiredStaff: 1, color: '#34d399', sortOrder: 1, createdAt: now, updatedAt: now },
      { id: uuidv4(), departmentId: engId, name: 'Night', startTime: '22:00', endTime: '06:00', requiredStaff: 1, color: '#6366f1', sortOrder: 2, createdAt: now, updatedAt: now },
      { id: uuidv4(), departmentId: txId, name: 'Day', startTime: '08:00', endTime: '16:00', requiredStaff: 2, color: '#34d399', sortOrder: 0, createdAt: now, updatedAt: now },
      { id: uuidv4(), departmentId: txId, name: 'Evening', startTime: '16:00', endTime: '00:00', requiredStaff: 1, color: '#f97316', sortOrder: 1, createdAt: now, updatedAt: now },
      { id: uuidv4(), departmentId: txId, name: 'Night', startTime: '00:00', endTime: '08:00', requiredStaff: 1, color: '#6366f1', sortOrder: 2, createdAt: now, updatedAt: now },
    ],
    assignments: [],
    availability: [],
    departmentMembers: [],
    teamsConfig: {},
  };
  saveCrewSchedulerState(state);
  return state;
}

export function getCrewSchedulerState(): CrewSchedulerState {
  try {
    const es = (window as unknown as { electronStore?: ElectronStore }).electronStore;
    const raw = es ? es.get(getStorageKey()) : localStorage.getItem(getStorageKey());
    if (!raw) return seedDefaultDepartments();
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const state = normalizeState(parsed as Partial<CrewSchedulerState>);
    if (state.departments.length === 0) return seedDefaultDepartments();
    return state;
  } catch {
    return seedDefaultDepartments();
  }
}

export function saveCrewSchedulerState(state: CrewSchedulerState): void {
  const key = getStorageKey();
  const serialized = JSON.stringify(state);
  try {
    (window as unknown as { electronStore?: ElectronStore }).electronStore?.set(key, serialized);
  } catch { /* ignore */ }
  try {
    localStorage.setItem(key, serialized);
  } catch { /* ignore */ }
  window.dispatchEvent(new CustomEvent(CREW_SCHEDULER_UPDATED_EVENT, { detail: state }));
  void requestCloudSync();
}

// ── Departments ──────────────────────────────────────────────────────────────

export function createDepartment(name: string, color?: string): SchedulerDepartment {
  const state = getCrewSchedulerState();
  const now = new Date().toISOString();
  const dept: SchedulerDepartment = {
    id: uuidv4(), name: name.trim(), color,
    sortOrder: state.departments.length, createdAt: now, updatedAt: now,
  };
  saveCrewSchedulerState({ ...state, departments: [...state.departments, dept] });
  return dept;
}

export function updateDepartment(
  id: string,
  updates: Partial<Pick<SchedulerDepartment, 'name' | 'color' | 'sortOrder'>>,
): void {
  const state = getCrewSchedulerState();
  saveCrewSchedulerState({
    ...state,
    departments: state.departments.map((d) =>
      d.id === id ? { ...d, ...updates, updatedAt: new Date().toISOString() } : d
    ),
  });
}

export function deleteDepartment(id: string): void {
  const state = getCrewSchedulerState();
  const deptShiftIds = new Set(
    state.shiftDefinitions.filter((s) => s.departmentId === id).map((s) => s.id)
  );
  saveCrewSchedulerState({
    ...state,
    departments: state.departments.filter((d) => d.id !== id),
    shiftDefinitions: state.shiftDefinitions.filter((s) => s.departmentId !== id),
    assignments: state.assignments.filter((a) => !deptShiftIds.has(a.shiftDefinitionId)),
    departmentMembers: state.departmentMembers.filter((m) => m.departmentId !== id),
  });
}

// ── Shift Definitions ────────────────────────────────────────────────────────

export function createShiftDefinition(
  input: Pick<ShiftDefinition, 'departmentId' | 'name' | 'startTime' | 'endTime' | 'requiredStaff' | 'color'>,
): ShiftDefinition {
  const state = getCrewSchedulerState();
  const now = new Date().toISOString();
  const existing = state.shiftDefinitions.filter((s) => s.departmentId === input.departmentId);
  const def: ShiftDefinition = {
    id: uuidv4(), ...input, sortOrder: existing.length, createdAt: now, updatedAt: now,
  };
  saveCrewSchedulerState({ ...state, shiftDefinitions: [...state.shiftDefinitions, def] });
  return def;
}

export function updateShiftDefinition(
  id: string,
  updates: Partial<Omit<ShiftDefinition, 'id' | 'departmentId' | 'createdAt'>>,
): void {
  const state = getCrewSchedulerState();
  saveCrewSchedulerState({
    ...state,
    shiftDefinitions: state.shiftDefinitions.map((s) =>
      s.id === id ? { ...s, ...updates, updatedAt: new Date().toISOString() } : s
    ),
  });
}

export function deleteShiftDefinition(id: string): void {
  const state = getCrewSchedulerState();
  saveCrewSchedulerState({
    ...state,
    shiftDefinitions: state.shiftDefinitions.filter((s) => s.id !== id),
    assignments: state.assignments.filter((a) => a.shiftDefinitionId !== id),
  });
}

// ── Assignments ──────────────────────────────────────────────────────────────

export function createAssignment(
  input: Pick<ShiftAssignment, 'shiftDefinitionId' | 'crewContactId' | 'date'> &
    Partial<Pick<ShiftAssignment, 'notes' | 'startTimeOverride' | 'endTimeOverride'>>,
): ShiftAssignment {
  const state = getCrewSchedulerState();
  const now = new Date().toISOString();
  const assignment: ShiftAssignment = { id: uuidv4(), notes: undefined, startTimeOverride: undefined, endTimeOverride: undefined, ...input, createdAt: now, updatedAt: now };
  saveCrewSchedulerState({ ...state, assignments: [...state.assignments, assignment] });
  return assignment;
}

export function deleteAssignment(id: string): void {
  const state = getCrewSchedulerState();
  saveCrewSchedulerState({ ...state, assignments: state.assignments.filter((a) => a.id !== id) });
}

export function getAssignmentsForWeek(
  weekStart: string,
  weekEnd: string,
  departmentId?: string,
): ShiftAssignment[] {
  const state = getCrewSchedulerState();
  const deptShiftIds = departmentId
    ? new Set(state.shiftDefinitions.filter((s) => s.departmentId === departmentId).map((s) => s.id))
    : null;
  return state.assignments.filter(
    (a) =>
      a.date >= weekStart &&
      a.date <= weekEnd &&
      (deptShiftIds === null || deptShiftIds.has(a.shiftDefinitionId)),
  );
}

export function copyWeekAssignments(
  fromWeekStart: string,
  toWeekStart: string,
  departmentId?: string,
): number {
  const state = getCrewSchedulerState();
  const fromStart = new Date(fromWeekStart);
  const toStart = new Date(toWeekStart);
  const dayDiff = Math.round((toStart.getTime() - fromStart.getTime()) / (1000 * 60 * 60 * 24));
  const fromEnd = new Date(fromStart);
  fromEnd.setDate(fromEnd.getDate() + 6);
  const fromEndStr = fromEnd.toISOString().split('T')[0];

  const source = getAssignmentsForWeek(fromWeekStart, fromEndStr, departmentId);
  if (source.length === 0) return 0;

  const now = new Date().toISOString();
  const newAssignments: ShiftAssignment[] = source.map((a) => {
    const srcDate = new Date(a.date + 'T00:00:00');
    srcDate.setDate(srcDate.getDate() + dayDiff);
    return { ...a, id: uuidv4(), date: srcDate.toISOString().split('T')[0], createdAt: now, updatedAt: now };
  });

  saveCrewSchedulerState({ ...state, assignments: [...state.assignments, ...newAssignments] });
  return newAssignments.length;
}

// ── Availability ─────────────────────────────────────────────────────────────

export function setAvailability(
  crewContactId: string,
  date: string,
  isAvailable: boolean,
  notes?: string,
): void {
  const state = getCrewSchedulerState();
  const now = new Date().toISOString();
  const existing = state.availability.find(
    (a) => a.crewContactId === crewContactId && a.date === date
  );
  if (existing) {
    saveCrewSchedulerState({
      ...state,
      availability: state.availability.map((a) =>
        a.id === existing.id ? { ...a, isAvailable, notes, updatedAt: now } : a
      ),
    });
  } else {
    const entry: CrewAvailability = {
      id: uuidv4(), crewContactId, date, isAvailable, notes, createdAt: now, updatedAt: now,
    };
    saveCrewSchedulerState({ ...state, availability: [...state.availability, entry] });
  }
}

// ── Department Members ───────────────────────────────────────────────────────

export function addDepartmentMember(departmentId: string, crewContactId: string): void {
  const state = getCrewSchedulerState();
  if (state.departmentMembers.some((m) => m.departmentId === departmentId && m.crewContactId === crewContactId)) return;
  const now = new Date().toISOString();
  const member: DepartmentMember = {
    id: uuidv4(), departmentId, crewContactId,
    sortOrder: state.departmentMembers.filter((m) => m.departmentId === departmentId).length,
    createdAt: now, updatedAt: now,
  };
  saveCrewSchedulerState({ ...state, departmentMembers: [...state.departmentMembers, member] });
}

export function removeDepartmentMember(departmentId: string, crewContactId: string): void {
  const state = getCrewSchedulerState();
  saveCrewSchedulerState({
    ...state,
    departmentMembers: state.departmentMembers.filter(
      (m) => !(m.departmentId === departmentId && m.crewContactId === crewContactId)
    ),
  });
}

// ── Teams Integration Config ─────────────────────────────────────────────────

export function getTeamsConfig(departmentId: string): TeamsIntegrationConfig | null {
  const state = getCrewSchedulerState();
  return state.teamsConfig?.[departmentId] ?? null;
}

export function saveTeamsConfig(departmentId: string, config: TeamsIntegrationConfig): void {
  const state = getCrewSchedulerState();
  saveCrewSchedulerState({
    ...state,
    teamsConfig: { ...state.teamsConfig, [departmentId]: config },
  });
}

export function clearTeamsConfig(departmentId: string): void {
  const state = getCrewSchedulerState();
  const next = { ...(state.teamsConfig ?? {}) };
  delete next[departmentId];
  saveCrewSchedulerState({ ...state, teamsConfig: next });
}
