import { STORAGE_KEYS } from '@/lib/storageService';
import { requestCloudSync } from '@/lib/cloudSyncEvents';
import { CrewContact, CrewContactDraft } from '@/types/crewContacts';

export const CREW_CONTACTS_UPDATED_EVENT = 'trackit:crew-contacts-updated';

function dispatchCrewContactsUpdated(contacts: CrewContact[]): void {
  window.dispatchEvent(new CustomEvent(CREW_CONTACTS_UPDATED_EVENT, { detail: contacts }));
}

function normalizeRoleTags(input: string[] | string): string[] {
  if (Array.isArray(input)) {
    return Array.from(new Set(input.map((tag) => tag.trim()).filter(Boolean)));
  }
  return Array.from(
    new Set(
      input
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean)
    )
  );
}

function normalizeCrewContact(raw: unknown): CrewContact | null {
  if (!raw || typeof raw !== 'object') return null;
  const source = raw as Partial<CrewContact> & Record<string, unknown>;
  const fullName = typeof source.fullName === 'string' ? source.fullName.trim() : '';
  if (!fullName) return null;
  const now = new Date().toISOString();
  return {
    id: typeof source.id === 'string' && source.id ? source.id : crypto.randomUUID(),
    fullName,
    roleTags: normalizeRoleTags(Array.isArray(source.roleTags) ? source.roleTags : []),
    defaultEquipmentItemIds: Array.isArray(source.defaultEquipmentItemIds)
      ? source.defaultEquipmentItemIds.filter((value): value is string => typeof value === 'string' && value.length > 0)
      : [],
    preferredVehicle: typeof source.preferredVehicle === 'string' ? source.preferredVehicle : undefined,
    vehicleNotes: typeof source.vehicleNotes === 'string' ? source.vehicleNotes : undefined,
    phone: typeof source.phone === 'string' ? source.phone : undefined,
    email: typeof source.email === 'string' ? source.email : undefined,
    notes: typeof source.notes === 'string' ? source.notes : undefined,
    baseLocation: typeof source.baseLocation === 'string' ? source.baseLocation : undefined,
    unionStatus: typeof source.unionStatus === 'string' ? source.unionStatus : undefined,
    isActive: source.isActive !== false,
    createdAt: typeof source.createdAt === 'string' ? source.createdAt : now,
    updatedAt: typeof source.updatedAt === 'string' ? source.updatedAt : now,
  };
}

export function getCrewContacts(): CrewContact[] {
  try {
    const electronValue = window.electronStore?.getData?.(STORAGE_KEYS.CREW_CONTACTS) as CrewContact[] | undefined;
    if (Array.isArray(electronValue) && electronValue.length > 0) {
      localStorage.setItem(STORAGE_KEYS.CREW_CONTACTS, JSON.stringify(electronValue));
      return electronValue;
    }
  } catch {
    // ignore
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.CREW_CONTACTS);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((entry) => normalizeCrewContact(entry))
      .filter((entry): entry is CrewContact => Boolean(entry));
  } catch {
    return [];
  }
}

export function saveCrewContacts(contacts: CrewContact[]): void {
  try {
    window.electronStore?.setData?.(STORAGE_KEYS.CREW_CONTACTS, contacts);
  } catch {
    // ignore
  }
  try {
    localStorage.setItem(STORAGE_KEYS.CREW_CONTACTS, JSON.stringify(contacts));
  } catch {
    // ignore
  }
  dispatchCrewContactsUpdated(contacts);
  requestCloudSync();
}

export function createCrewContact(draft: CrewContactDraft): CrewContact {
  const now = new Date().toISOString();
  const contact: CrewContact = {
    id: crypto.randomUUID(),
    fullName: draft.fullName.trim(),
    roleTags: normalizeRoleTags(draft.roleTags),
    defaultEquipmentItemIds: Array.from(new Set(draft.defaultEquipmentItemIds)),
    preferredVehicle: draft.preferredVehicle.trim() || undefined,
    vehicleNotes: draft.vehicleNotes.trim() || undefined,
    phone: draft.phone.trim() || undefined,
    email: draft.email.trim() || undefined,
    notes: draft.notes.trim() || undefined,
    baseLocation: draft.baseLocation.trim() || undefined,
    unionStatus: draft.unionStatus.trim() || undefined,
    isActive: draft.isActive,
    createdAt: now,
    updatedAt: now,
  };
  const contacts = getCrewContacts();
  saveCrewContacts([...contacts, contact]);
  return contact;
}

export function updateCrewContact(contactId: string, updates: Partial<CrewContactDraft>): CrewContact | null {
  const contacts = getCrewContacts();
  const index = contacts.findIndex((contact) => contact.id === contactId);
  if (index < 0) return null;
  const current = contacts[index];
  const updated: CrewContact = {
    ...current,
    fullName: updates.fullName !== undefined ? updates.fullName.trim() : current.fullName,
    roleTags: updates.roleTags !== undefined ? normalizeRoleTags(updates.roleTags) : current.roleTags,
    defaultEquipmentItemIds:
      updates.defaultEquipmentItemIds !== undefined
        ? Array.from(new Set(updates.defaultEquipmentItemIds))
        : current.defaultEquipmentItemIds,
    preferredVehicle:
      updates.preferredVehicle !== undefined ? updates.preferredVehicle.trim() || undefined : current.preferredVehicle,
    vehicleNotes:
      updates.vehicleNotes !== undefined ? updates.vehicleNotes.trim() || undefined : current.vehicleNotes,
    phone: updates.phone !== undefined ? updates.phone.trim() || undefined : current.phone,
    email: updates.email !== undefined ? updates.email.trim() || undefined : current.email,
    notes: updates.notes !== undefined ? updates.notes.trim() || undefined : current.notes,
    baseLocation: updates.baseLocation !== undefined ? updates.baseLocation.trim() || undefined : current.baseLocation,
    unionStatus: updates.unionStatus !== undefined ? updates.unionStatus.trim() || undefined : current.unionStatus,
    isActive: updates.isActive !== undefined ? updates.isActive : current.isActive,
    updatedAt: new Date().toISOString(),
  };
  contacts[index] = updated;
  saveCrewContacts(contacts);
  return updated;
}

export function removeCrewContact(contactId: string): void {
  saveCrewContacts(getCrewContacts().filter((contact) => contact.id !== contactId));
}
