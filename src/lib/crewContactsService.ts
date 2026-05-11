import { STORAGE_KEYS } from '@/lib/storageService';
import { requestCloudSync } from '@/lib/cloudSyncEvents';
import { CrewContact, CrewContactDraft } from '@/types/crewContacts';
import { getActiveOrganizationId } from '@/lib/supabase/organizationData';

export const CREW_CONTACTS_UPDATED_EVENT = 'trackit:crew-contacts-updated';

function getOrganizationScopedCrewContactsStorageKey(): string {
  const activeOrganizationId = getActiveOrganizationId();
  if (!activeOrganizationId) {
    return STORAGE_KEYS.CREW_CONTACTS;
  }
  return `${STORAGE_KEYS.CREW_CONTACTS}:org:${activeOrganizationId}`;
}

function readRawStoredContacts(storageKey: string): unknown[] {
  try {
    const electronValue = window.electronStore?.getData?.(storageKey) as unknown;
    if (Array.isArray(electronValue)) {
      localStorage.setItem(storageKey, JSON.stringify(electronValue));
      return electronValue;
    }
  } catch {
    // ignore
  }
  try {
    const raw = localStorage.getItem(storageKey);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

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
  const normalized: CrewContact = {
    id: typeof source.id === 'string' && source.id ? source.id : crypto.randomUUID(),
    fullName,
    contactType: source.contactType === 'vendor' ? 'vendor' : 'crew',
    roleTags: normalizeRoleTags(Array.isArray(source.roleTags) ? source.roleTags : []),
    defaultEquipmentItemIds: Array.isArray(source.defaultEquipmentItemIds)
      ? source.defaultEquipmentItemIds.filter((value): value is string => typeof value === 'string' && value.length > 0)
      : [],
    organizationName: typeof source.organizationName === 'string' ? source.organizationName : undefined,
    functionalArea: typeof source.functionalArea === 'string' ? source.functionalArea : undefined,
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
  const demoSeed = source.__demoSeed as CrewContact['__demoSeed'];
  if (demoSeed && typeof demoSeed.version === 'string' && typeof demoSeed.fingerprint === 'string') {
    normalized.__demoSeed = { version: demoSeed.version, fingerprint: demoSeed.fingerprint };
  }
  return normalized;
}

export function getCrewContacts(): CrewContact[] {
  const activeKey = getOrganizationScopedCrewContactsStorageKey();
  const activeEntries = readRawStoredContacts(activeKey);
  if (activeEntries.length > 0) {
    return activeEntries
      .map((entry) => normalizeCrewContact(entry))
      .filter((entry): entry is CrewContact => Boolean(entry));
  }
  if (activeKey !== STORAGE_KEYS.CREW_CONTACTS) {
    const legacyEntries = readRawStoredContacts(STORAGE_KEYS.CREW_CONTACTS);
    return legacyEntries
      .map((entry) => normalizeCrewContact(entry))
      .filter((entry): entry is CrewContact => Boolean(entry));
  }
  return [];
}

export function saveCrewContacts(contacts: CrewContact[]): void {
  const activeKey = getOrganizationScopedCrewContactsStorageKey();
  try {
    window.electronStore?.setData?.(activeKey, contacts);
  } catch {
    // ignore
  }
  try {
    localStorage.setItem(activeKey, JSON.stringify(contacts));
  } catch {
    // ignore
  }
  if (activeKey !== STORAGE_KEYS.CREW_CONTACTS) {
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
  }
  dispatchCrewContactsUpdated(contacts);
  requestCloudSync();
}

export function createCrewContact(draft: CrewContactDraft): CrewContact {
  const now = new Date().toISOString();
  const contact: CrewContact = {
    id: crypto.randomUUID(),
    fullName: draft.fullName.trim(),
    contactType: draft.contactType,
    roleTags: normalizeRoleTags(draft.roleTags),
    defaultEquipmentItemIds: Array.from(new Set(draft.defaultEquipmentItemIds)),
    organizationName: draft.organizationName.trim() || undefined,
    functionalArea: draft.functionalArea.trim() || undefined,
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
    contactType: updates.contactType !== undefined ? updates.contactType : current.contactType,
    organizationName:
      updates.organizationName !== undefined ? updates.organizationName.trim() || undefined : current.organizationName,
    functionalArea:
      updates.functionalArea !== undefined ? updates.functionalArea.trim() || undefined : current.functionalArea,
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

// ---------------------------------------------------------------------------
// Roster seed — 17 KPIX/KBCW photographers (idempotent by name)
// ---------------------------------------------------------------------------

interface RosterPhotographer {
  fullName: string;
  phone: string;
  preferredVehicle: string;
}

const PHOTOGRAPHER_ROSTER: RosterPhotographer[] = [
  { fullName: 'Scott Arthur',      phone: '415-559-7418', preferredVehicle: 'M18' },
  { fullName: 'Dick Epting',       phone: '415-559-7402', preferredVehicle: 'M2'  },
  { fullName: 'Abe Mendoza',       phone: '415-559-7423', preferredVehicle: 'M23' },
  { fullName: 'Andrew Shepherd',   phone: '415-559-7411', preferredVehicle: 'M11' },
  { fullName: 'Jackie Sissel',     phone: '415-559-7412', preferredVehicle: 'M12' },
  { fullName: 'Dean Smith',        phone: '415-559-7404', preferredVehicle: 'M4'  },
  { fullName: 'Steve Stifter',     phone: '415-559-7406', preferredVehicle: 'M6'  },
  { fullName: 'Ted Case',          phone: '415-559-7420', preferredVehicle: 'M20' },
  { fullName: 'Edward Gonzalez',   phone: '415-559-7417', preferredVehicle: 'M17' },
  { fullName: 'Ric Dupont',        phone: '415-559-7416', preferredVehicle: 'M16' },
  { fullName: 'Alex Gray',         phone: '415-559-7403', preferredVehicle: 'M3'  },
  { fullName: 'Henry Jerkins',     phone: '415-559-7422', preferredVehicle: 'M22' },
  { fullName: 'Chris Kievman',     phone: '415-559-7414', preferredVehicle: 'M14' },
  { fullName: 'Mackenzie Stock',   phone: '415-559-7410', preferredVehicle: 'M10' },
  { fullName: 'Edgar Teran',       phone: '415-559-7419', preferredVehicle: 'M19' },
  { fullName: 'Bill Thompson',     phone: '415-559-7405', preferredVehicle: 'M5'  },
  { fullName: 'Brian Yuen',        phone: '415-559-1864', preferredVehicle: 'M25' },
];

export function seedPhotographerContacts(): CrewContact[] {
  const existing = getCrewContacts();
  const existingNames = new Set(existing.map((c) => c.fullName.toLowerCase()));
  const now = new Date().toISOString();

  const toAdd: CrewContact[] = PHOTOGRAPHER_ROSTER
    .filter((r) => !existingNames.has(r.fullName.toLowerCase()))
    .map((r) => ({
      id: crypto.randomUUID(),
      fullName: r.fullName,
      contactType: 'crew' as const,
      roleTags: ['photographer'],
      defaultEquipmentItemIds: [],
      phone: r.phone,
      preferredVehicle: r.preferredVehicle,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    }));

  if (toAdd.length > 0) {
    saveCrewContacts([...existing, ...toAdd]);
  }

  // Return the full photographer list (existing + newly added)
  return getCrewContacts().filter((c) => c.roleTags.includes('photographer'));
}

export const PHOTOGRAPHER_ROSTER_DATA = PHOTOGRAPHER_ROSTER;
