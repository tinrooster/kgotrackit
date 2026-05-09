import type { CrewContact } from '@/types/crewContacts';
import { canonicalNameKey, parseContactDisplayName } from '@/lib/contactName';

export interface NameKeyedContact {
  id: string;
  fullName: string;
}

export interface DuplicateGroup<T extends NameKeyedContact> {
  canonicalKey: string;
  contacts: T[];
}

export interface ReconcileResult<T extends NameKeyedContact> {
  contacts: T[];
  groups: DuplicateGroup<T>[];
  mergedDuplicates: number;
}

const firstNonEmpty = (...values: Array<string | undefined>): string | undefined =>
  values.map((value) => value?.trim() || '').find(Boolean) || undefined;

export function findDuplicateNameGroups<T extends NameKeyedContact>(contacts: T[]): DuplicateGroup<T>[] {
  const groupedContacts = new Map<string, T[]>();
  for (const contact of contacts) {
    const key = canonicalNameKey(contact.fullName);
    if (!key) continue;
    const group = groupedContacts.get(key) ?? [];
    group.push(contact);
    groupedContacts.set(key, group);
  }
  return Array.from(groupedContacts.entries())
    .map(([canonicalKey, grouped]) => ({ canonicalKey, contacts: grouped }))
    .filter((group) => group.contacts.length > 1);
}

export function reconcileCrewContactDuplicates(contacts: CrewContact[]): ReconcileResult<CrewContact> {
  const groups = findDuplicateNameGroups(contacts);
  if (groups.length === 0) {
    return { contacts, groups, mergedDuplicates: 0 };
  }

  const idsToRemove = new Set<string>();
  const mergedByCanonical = new Map<string, CrewContact>();

  for (const group of groups) {
    const sortedByCreatedAt = [...group.contacts].sort((left, right) =>
      (left.createdAt ?? '').localeCompare(right.createdAt ?? ''),
    );
    const primary = sortedByCreatedAt[0];
    const mergedRoleTags = Array.from(
      new Set(group.contacts.flatMap((contact) => contact.roleTags ?? []).map((tag) => tag.trim()).filter(Boolean)),
    );
    const mergedEquipmentIds = Array.from(
      new Set(group.contacts.flatMap((contact) => contact.defaultEquipmentItemIds ?? [])),
    );
    const merged: CrewContact = {
      ...primary,
      fullName: parseContactDisplayName(primary.fullName),
      roleTags: mergedRoleTags,
      defaultEquipmentItemIds: mergedEquipmentIds,
      organizationName: firstNonEmpty(...group.contacts.map((contact) => contact.organizationName)),
      functionalArea: firstNonEmpty(...group.contacts.map((contact) => contact.functionalArea)),
      preferredVehicle: firstNonEmpty(...group.contacts.map((contact) => contact.preferredVehicle)),
      vehicleNotes: firstNonEmpty(...group.contacts.map((contact) => contact.vehicleNotes)),
      phone: firstNonEmpty(...group.contacts.map((contact) => contact.phone)),
      email: firstNonEmpty(...group.contacts.map((contact) => contact.email)),
      notes: firstNonEmpty(...group.contacts.map((contact) => contact.notes)),
      baseLocation: firstNonEmpty(...group.contacts.map((contact) => contact.baseLocation)),
      unionStatus: firstNonEmpty(...group.contacts.map((contact) => contact.unionStatus)),
      isActive: group.contacts.some((contact) => contact.isActive),
      updatedAt: new Date().toISOString(),
    };
    mergedByCanonical.set(group.canonicalKey, merged);
    for (const duplicate of sortedByCreatedAt.slice(1)) {
      idsToRemove.add(duplicate.id);
    }
  }

  const reconciled = contacts
    .filter((contact) => !idsToRemove.has(contact.id))
    .map((contact) => mergedByCanonical.get(canonicalNameKey(contact.fullName)) ?? contact);

  return {
    contacts: reconciled,
    groups,
    mergedDuplicates: idsToRemove.size,
  };
}

export interface DirectoryContactLike extends NameKeyedContact {
  phone?: string;
  email?: string;
  extension?: string;
  department?: string;
  jobTitle?: string;
  functionalArea?: string;
  sourceFile?: string;
  sourceSheet?: string;
  notes?: string;
  updatedAt?: string;
}

export function reconcileDirectoryContactDuplicates<T extends DirectoryContactLike>(
  contacts: T[],
): ReconcileResult<T> {
  const groups = findDuplicateNameGroups(contacts);
  if (groups.length === 0) {
    return { contacts, groups, mergedDuplicates: 0 };
  }

  const idsToRemove = new Set<string>();
  const mergedByCanonical = new Map<string, T>();

  for (const group of groups) {
    const sortedByUpdatedAt = [...group.contacts].sort((left, right) =>
      (left.updatedAt ?? '').localeCompare(right.updatedAt ?? ''),
    );
    const primary = sortedByUpdatedAt[0];
    const merged = {
      ...primary,
      fullName: parseContactDisplayName(primary.fullName),
      phone: firstNonEmpty(...group.contacts.map((contact) => contact.phone)),
      email: firstNonEmpty(...group.contacts.map((contact) => contact.email)),
      extension: firstNonEmpty(...group.contacts.map((contact) => contact.extension)),
      department: firstNonEmpty(...group.contacts.map((contact) => contact.department)),
      jobTitle: firstNonEmpty(...group.contacts.map((contact) => contact.jobTitle)),
      functionalArea: firstNonEmpty(...group.contacts.map((contact) => contact.functionalArea)),
      sourceFile: firstNonEmpty(...group.contacts.map((contact) => contact.sourceFile)),
      sourceSheet: firstNonEmpty(...group.contacts.map((contact) => contact.sourceSheet)),
      notes: firstNonEmpty(...group.contacts.map((contact) => contact.notes)),
      updatedAt: new Date().toISOString(),
    } as T;
    mergedByCanonical.set(group.canonicalKey, merged);
    for (const duplicate of sortedByUpdatedAt.slice(1)) {
      idsToRemove.add(duplicate.id);
    }
  }

  const reconciled = contacts
    .filter((contact) => !idsToRemove.has(contact.id))
    .map((contact) => mergedByCanonical.get(canonicalNameKey(contact.fullName)) ?? contact);

  return {
    contacts: reconciled,
    groups,
    mergedDuplicates: idsToRemove.size,
  };
}
