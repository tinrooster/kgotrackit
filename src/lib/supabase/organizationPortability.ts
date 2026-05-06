import { getCrewContacts, saveCrewContacts } from '@/lib/crewContactsService';
import { getPositionTemplates, savePositionTemplates } from '@/lib/positionTemplatesService';
import {
  pullOrganizationAppData,
  pushOrganizationSnapshot,
  type OrganizationAppDataRow,
  type OrganizationSnapshotPayload,
} from '@/lib/supabase/organizationData';
import type { CrewContact } from '@/types/crewContacts';
import type { PositionTemplate } from '@/types/productions';

export type OrganizationImportStrategy = 'replace' | 'merge' | 'skip';
export type OrganizationImportSection =
  | 'contacts'
  | 'position_templates'
  | 'role_tags'
  | 'branding'
  | 'inventory_baseline';

export type OrganizationImportSections = Record<OrganizationImportSection, boolean>;

export interface OrganizationImportPreview {
  bundleOrganizationId: string;
  exportedAt: string;
  incomingCounts: Record<OrganizationImportSection, number>;
  existingCounts: Record<OrganizationImportSection, number>;
  overlapCounts: Record<OrganizationImportSection, number>;
}

export interface OrganizationExportBundle {
  version: 'trackit-organization-export-v1';
  exportedAt: string;
  organizationId: string;
  data: OrganizationSnapshotPayload;
}

function normalizeCrewContact(raw: unknown): CrewContact | null {
  if (!raw || typeof raw !== 'object') return null;
  const source = raw as Partial<CrewContact>;
  if (typeof source.fullName !== 'string' || source.fullName.trim().length === 0) return null;
  return {
    id: typeof source.id === 'string' && source.id ? source.id : crypto.randomUUID(),
    fullName: source.fullName.trim(),
    contactType: source.contactType === 'vendor' ? 'vendor' : 'crew',
    roleTags: Array.isArray(source.roleTags) ? source.roleTags.filter((tag): tag is string => typeof tag === 'string') : [],
    defaultEquipmentItemIds: Array.isArray(source.defaultEquipmentItemIds)
      ? source.defaultEquipmentItemIds.filter((id): id is string => typeof id === 'string')
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
    createdAt: typeof source.createdAt === 'string' ? source.createdAt : new Date().toISOString(),
    updatedAt: typeof source.updatedAt === 'string' ? source.updatedAt : new Date().toISOString(),
  };
}

function normalizePositionTemplate(raw: unknown, index: number): PositionTemplate | null {
  if (!raw || typeof raw !== 'object') return null;
  const source = raw as Partial<PositionTemplate>;
  if (typeof source.label !== 'string' || source.label.trim().length === 0) return null;
  return {
    id: typeof source.id === 'string' && source.id ? source.id : crypto.randomUUID(),
    label: source.label.trim(),
    defaultRoleTag: typeof source.defaultRoleTag === 'string' ? source.defaultRoleTag : undefined,
    defaultLocation: typeof source.defaultLocation === 'string' ? source.defaultLocation : undefined,
    sortOrder: typeof source.sortOrder === 'number' && Number.isFinite(source.sortOrder) ? source.sortOrder : index,
  };
}

function normalizeArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function normalizeObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function normalizeSnapshot(raw: Partial<OrganizationSnapshotPayload> | null | undefined): OrganizationSnapshotPayload {
  const contacts = normalizeArray(raw?.contacts).map((entry) => normalizeCrewContact(entry)).filter(Boolean) as CrewContact[];
  const positionTemplates = normalizeArray(raw?.position_templates)
    .map((entry, index) => normalizePositionTemplate(entry, index))
    .filter(Boolean) as PositionTemplate[];
  return {
    contacts,
    position_templates: positionTemplates,
    inventory_baseline: normalizeArray(raw?.inventory_baseline),
    role_tags: normalizeArray(raw?.role_tags),
    branding: normalizeObject(raw?.branding),
  };
}

function mergeByKey<T>(existing: T[], incoming: T[], getKey: (item: T) => string): T[] {
  const map = new Map<string, T>();
  for (const item of existing) {
    map.set(getKey(item), item);
  }
  for (const item of incoming) {
    map.set(getKey(item), item);
  }
  return Array.from(map.values());
}

function stableJsonKey(value: unknown): string {
  return JSON.stringify(value);
}

function mergeUnknownArrays(existing: unknown[], incoming: unknown[]): unknown[] {
  const map = new Map<string, unknown>();
  for (const item of existing) map.set(stableJsonKey(item), item);
  for (const item of incoming) map.set(stableJsonKey(item), item);
  return Array.from(map.values());
}

function applyStrategy(
  strategy: OrganizationImportStrategy,
  current: OrganizationSnapshotPayload,
  incoming: OrganizationSnapshotPayload,
): OrganizationSnapshotPayload {
  if (strategy === 'replace') {
    return incoming;
  }
  if (strategy === 'skip') {
    return {
      contacts: current.contacts.length > 0 ? current.contacts : incoming.contacts,
      position_templates:
        current.position_templates.length > 0 ? current.position_templates : incoming.position_templates,
      inventory_baseline:
        current.inventory_baseline.length > 0 ? current.inventory_baseline : incoming.inventory_baseline,
      role_tags: current.role_tags.length > 0 ? current.role_tags : incoming.role_tags,
      branding: Object.keys(current.branding).length > 0 ? current.branding : incoming.branding,
    };
  }
  const mergedContacts = mergeByKey(
    current.contacts as CrewContact[],
    incoming.contacts as CrewContact[],
    (contact) => (contact.id || `${contact.contactType}:${contact.fullName}`).toLowerCase(),
  );
  const mergedTemplates = mergeByKey(
    current.position_templates as PositionTemplate[],
    incoming.position_templates as PositionTemplate[],
    (template) => (template.id || template.label).toLowerCase(),
  ).map((template, index) => ({ ...template, sortOrder: index }));
  return {
    contacts: mergedContacts,
    position_templates: mergedTemplates,
    inventory_baseline: mergeUnknownArrays(current.inventory_baseline, incoming.inventory_baseline),
    role_tags: mergeUnknownArrays(current.role_tags, incoming.role_tags),
    branding: { ...current.branding, ...incoming.branding },
  };
}

function applySectionSelection(
  current: OrganizationSnapshotPayload,
  incoming: OrganizationSnapshotPayload,
  sections: OrganizationImportSections,
): OrganizationSnapshotPayload {
  return {
    contacts: sections.contacts ? incoming.contacts : current.contacts,
    position_templates: sections.position_templates ? incoming.position_templates : current.position_templates,
    role_tags: sections.role_tags ? incoming.role_tags : current.role_tags,
    branding: sections.branding ? incoming.branding : current.branding,
    inventory_baseline: sections.inventory_baseline ? incoming.inventory_baseline : current.inventory_baseline,
  };
}

function defaultSections(): OrganizationImportSections {
  return {
    contacts: true,
    position_templates: true,
    role_tags: true,
    branding: true,
    inventory_baseline: true,
  };
}

function overlapCounts(
  current: OrganizationSnapshotPayload,
  incoming: OrganizationSnapshotPayload,
): Record<OrganizationImportSection, number> {
  const currentContactKeys = new Set(
    (current.contacts as CrewContact[]).map((contact) =>
      (contact.id || `${contact.contactType}:${contact.fullName}`).toLowerCase(),
    ),
  );
  const currentTemplateKeys = new Set(
    (current.position_templates as PositionTemplate[]).map((template) =>
      (template.id || template.label).toLowerCase(),
    ),
  );
  const incomingContactOverlaps = (incoming.contacts as CrewContact[]).filter((contact) =>
    currentContactKeys.has((contact.id || `${contact.contactType}:${contact.fullName}`).toLowerCase()),
  ).length;
  const incomingTemplateOverlaps = (incoming.position_templates as PositionTemplate[]).filter((template) =>
    currentTemplateKeys.has((template.id || template.label).toLowerCase()),
  ).length;
  const roleTagOverlaps = normalizeArray(incoming.role_tags).filter((entry) =>
    normalizeArray(current.role_tags).some((value) => stableJsonKey(value) === stableJsonKey(entry)),
  ).length;
  const baselineOverlaps = normalizeArray(incoming.inventory_baseline).filter((entry) =>
    normalizeArray(current.inventory_baseline).some((value) => stableJsonKey(value) === stableJsonKey(entry)),
  ).length;
  const brandingOverlap = Object.keys(incoming.branding).filter((key) =>
    Object.prototype.hasOwnProperty.call(current.branding, key),
  ).length;
  return {
    contacts: incomingContactOverlaps,
    position_templates: incomingTemplateOverlaps,
    role_tags: roleTagOverlaps,
    inventory_baseline: baselineOverlaps,
    branding: brandingOverlap,
  };
}

function parseExportBundle(text: string): OrganizationExportBundle {
  const parsed = JSON.parse(text) as Partial<OrganizationExportBundle>;
  if (parsed.version !== 'trackit-organization-export-v1') {
    throw new Error('Invalid export format: expected trackit-organization-export-v1');
  }
  if (typeof parsed.organizationId !== 'string' || !parsed.organizationId) {
    throw new Error('Invalid export format: missing organizationId');
  }
  if (!parsed.data || typeof parsed.data !== 'object') {
    throw new Error('Invalid export format: missing data');
  }
  return {
    version: 'trackit-organization-export-v1',
    exportedAt: typeof parsed.exportedAt === 'string' ? parsed.exportedAt : new Date().toISOString(),
    organizationId: parsed.organizationId,
    data: normalizeSnapshot(parsed.data),
  };
}

async function readAndParseBundle(file: File): Promise<OrganizationExportBundle> {
  const text = await file.text();
  return parseExportBundle(text);
}

export async function exportOrganizationBundle(organizationId: string): Promise<OrganizationExportBundle> {
  const remote = await pullOrganizationAppData(organizationId);
  const normalizedRemote = normalizeSnapshot(remote ?? undefined);
  const currentLocal = normalizeSnapshot({
    contacts: getCrewContacts(),
    position_templates: getPositionTemplates(),
    inventory_baseline: normalizedRemote.inventory_baseline,
    role_tags: normalizedRemote.role_tags,
    branding: normalizedRemote.branding,
  });
  return {
    version: 'trackit-organization-export-v1',
    exportedAt: new Date().toISOString(),
    organizationId,
    data: currentLocal,
  };
}

export async function importOrganizationBundleFromFile(params: {
  organizationId: string;
  file: File;
  strategy: OrganizationImportStrategy;
  sections?: Partial<OrganizationImportSections>;
}): Promise<OrganizationAppDataRow | null> {
  const parsed = await readAndParseBundle(params.file);
  const incomingRaw = normalizeSnapshot(parsed.data);
  const existingRow = await pullOrganizationAppData(params.organizationId);
  const current = normalizeSnapshot(existingRow ?? undefined);
  const selectedSections = { ...defaultSections(), ...(params.sections ?? {}) };
  const incoming = applySectionSelection(current, incomingRaw, selectedSections);
  const next = applyStrategy(params.strategy, current, incoming);
  await pushOrganizationSnapshot(params.organizationId, next);
  if (selectedSections.contacts) {
    saveCrewContacts(next.contacts as CrewContact[]);
  }
  if (selectedSections.position_templates) {
    savePositionTemplates(next.position_templates as PositionTemplate[]);
  }
  return pullOrganizationAppData(params.organizationId);
}

export async function previewOrganizationImportFromFile(params: {
  organizationId: string;
  file: File;
}): Promise<OrganizationImportPreview> {
  const parsed = await readAndParseBundle(params.file);
  const incoming = normalizeSnapshot(parsed.data);
  const existingRow = await pullOrganizationAppData(params.organizationId);
  const current = normalizeSnapshot(existingRow ?? undefined);
  return {
    bundleOrganizationId: parsed.organizationId,
    exportedAt: parsed.exportedAt,
    incomingCounts: {
      contacts: incoming.contacts.length,
      position_templates: incoming.position_templates.length,
      role_tags: normalizeArray(incoming.role_tags).length,
      branding: Object.keys(incoming.branding).length,
      inventory_baseline: normalizeArray(incoming.inventory_baseline).length,
    },
    existingCounts: {
      contacts: current.contacts.length,
      position_templates: current.position_templates.length,
      role_tags: normalizeArray(current.role_tags).length,
      branding: Object.keys(current.branding).length,
      inventory_baseline: normalizeArray(current.inventory_baseline).length,
    },
    overlapCounts: overlapCounts(current, incoming),
  };
}

export async function resetOrganizationLibraryMetadata(organizationId: string): Promise<void> {
  await pushOrganizationSnapshot(organizationId, {
    contacts: [],
    position_templates: [],
    role_tags: [],
    branding: {},
    inventory_baseline: [],
  });
  saveCrewContacts([]);
  savePositionTemplates([]);
}
