import { getCrewContacts, saveCrewContacts } from '@/lib/crewContactsService';
import { getProductions } from '@/lib/productionService';
import type { CrewContact } from '@/types/crewContacts';

export interface PromoteProductionCrewResult {
  scannedCrewMembers: number;
  addedContacts: number;
  skippedExistingContacts: number;
  skippedInvalidCrewMembers: number;
}

function normalizeLookupName(value: string): string {
  return value.trim().toLowerCase();
}

function buildRoleTags(role: string | undefined, department: string | undefined): string[] {
  const tags = new Set<string>();
  const roleValue = role?.trim();
  const departmentValue = department?.trim();
  if (roleValue) {
    tags.add(roleValue.toLowerCase());
  }
  if (departmentValue) {
    tags.add(departmentValue.toLowerCase());
  }
  return Array.from(tags);
}

function resolveBaseLocation(
  shifts: Array<{ location?: string }> | undefined,
): string | undefined {
  if (!Array.isArray(shifts) || shifts.length === 0) {
    return undefined;
  }
  for (const shift of shifts) {
    const locationValue = shift.location?.trim();
    if (locationValue) {
      return locationValue;
    }
  }
  return undefined;
}

export function promoteProductionCrewToDirectory(): PromoteProductionCrewResult {
  const existingContacts = getCrewContacts();
  const productions = getProductions();
  const nowIso = new Date().toISOString();

  const existingContactIds = new Set(existingContacts.map((contact) => contact.id));
  const existingContactNames = new Set(
    existingContacts.map((contact) => normalizeLookupName(contact.fullName)),
  );

  const queuedContacts: CrewContact[] = [];
  const queuedNames = new Set<string>();
  const queuedSourceIds = new Set<string>();

  let scannedCrewMembers = 0;
  let skippedExistingContacts = 0;
  let skippedInvalidCrewMembers = 0;

  for (const production of productions) {
    const productionCrew = Array.isArray(production.crew) ? production.crew : [];
    for (const crewMember of productionCrew) {
      scannedCrewMembers += 1;
      const fullName = crewMember.name?.trim() ?? '';
      if (!fullName) {
        skippedInvalidCrewMembers += 1;
        continue;
      }

      const normalizedName = normalizeLookupName(fullName);
      const sourceContactId = crewMember.contactId?.trim() || '';
      const hasExistingById =
        sourceContactId.length > 0 && existingContactIds.has(sourceContactId);
      const hasQueuedById =
        sourceContactId.length > 0 && queuedSourceIds.has(sourceContactId);
      const hasExistingByName = existingContactNames.has(normalizedName);
      const hasQueuedByName = queuedNames.has(normalizedName);

      if (hasExistingById || hasQueuedById || hasExistingByName || hasQueuedByName) {
        skippedExistingContacts += 1;
        continue;
      }

      const nextContactId =
        sourceContactId.length > 0 && !existingContactIds.has(sourceContactId)
          ? sourceContactId
          : crypto.randomUUID();

      const nextContact: CrewContact = {
        id: nextContactId,
        fullName,
        contactType: 'crew',
        roleTags: buildRoleTags(crewMember.role, crewMember.department),
        defaultEquipmentItemIds: [],
        organizationName: undefined,
        functionalArea: crewMember.department?.trim() || undefined,
        preferredVehicle: undefined,
        vehicleNotes: undefined,
        phone: crewMember.phone?.trim() || undefined,
        email: crewMember.email?.trim() || undefined,
        notes: crewMember.notes?.trim() || undefined,
        baseLocation: resolveBaseLocation(crewMember.shifts),
        unionStatus: undefined,
        isActive: true,
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      queuedContacts.push(nextContact);
      queuedNames.add(normalizedName);
      if (sourceContactId.length > 0) {
        queuedSourceIds.add(sourceContactId);
      }
    }
  }

  if (queuedContacts.length > 0) {
    saveCrewContacts([...existingContacts, ...queuedContacts]);
  }

  return {
    scannedCrewMembers,
    addedContacts: queuedContacts.length,
    skippedExistingContacts,
    skippedInvalidCrewMembers,
  };
}
