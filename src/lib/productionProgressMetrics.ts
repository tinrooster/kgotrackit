import type { Production } from '@/types/productions';
import { flattenVehiclePacklistItems } from '@/lib/vehiclePacklistUtils';

export interface ProductionProgressSnapshot {
  checklist: { done: number; total: number; percent: number };
  packlists: { done: number; total: number; percent: number };
  crew: { scheduled: number; crewCount: number; percent: number };
}

export function getChecklistProgress(production: Production): {
  done: number;
  total: number;
  percent: number;
} {
  let done = 0;
  let total = 0;
  for (const group of production.checklistGroups) {
    for (const item of group.items) {
      total += 1;
      if (item.completed) done += 1;
    }
  }
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;
  return { done, total, percent };
}

export function getPacklistProgress(production: Production): {
  done: number;
  total: number;
  percent: number;
} {
  let done = 0;
  let total = 0;
  for (const packlist of production.vehiclePacklists) {
    for (const item of flattenVehiclePacklistItems(packlist)) {
      total += 1;
      if (item.completed) done += 1;
    }
  }
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;
  return { done, total, percent };
}

export function getCrewCoverage(production: Production): {
  scheduled: number;
  crewCount: number;
  percent: number;
} {
  const crewCount = production.crew.length;
  if (crewCount === 0) return { scheduled: 0, crewCount: 0, percent: 0 };
  const scheduledCrewIds = new Set((production.crewSchedule ?? []).map((entry) => entry.crewMemberId));
  const scheduled = production.crew.filter((member) => scheduledCrewIds.has(member.id)).length;
  const percent = Math.round((scheduled / crewCount) * 100);
  return { scheduled, crewCount, percent };
}

export function getProductionProgressSnapshot(production: Production): ProductionProgressSnapshot {
  return {
    checklist: getChecklistProgress(production),
    packlists: getPacklistProgress(production),
    crew: getCrewCoverage(production),
  };
}
