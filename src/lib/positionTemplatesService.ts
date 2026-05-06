import { STORAGE_KEYS } from '@/lib/storageService';
import { requestCloudSync } from '@/lib/cloudSyncEvents';
import { PositionTemplate } from '@/types/productions';
import { getActiveOrganizationId } from '@/lib/supabase/organizationData';

export const POSITION_TEMPLATES_UPDATED_EVENT = 'trackit:position-templates-updated';

function getOrganizationScopedPositionTemplatesStorageKey(): string {
  const activeOrganizationId = getActiveOrganizationId();
  if (!activeOrganizationId) {
    return STORAGE_KEYS.POSITION_TEMPLATES;
  }
  return `${STORAGE_KEYS.POSITION_TEMPLATES}:org:${activeOrganizationId}`;
}

function normalizeTemplate(raw: unknown, index: number): PositionTemplate | null {
  if (!raw || typeof raw !== 'object') return null;
  const source = raw as Partial<PositionTemplate> & Record<string, unknown>;
  const label = typeof source.label === 'string' ? source.label.trim() : '';
  if (!label) return null;
  return {
    id: typeof source.id === 'string' && source.id ? source.id : crypto.randomUUID(),
    label,
    defaultRoleTag: typeof source.defaultRoleTag === 'string' ? source.defaultRoleTag.trim() || undefined : undefined,
    defaultLocation: typeof source.defaultLocation === 'string' ? source.defaultLocation.trim() || undefined : undefined,
    sortOrder:
      typeof source.sortOrder === 'number' && Number.isFinite(source.sortOrder) ? source.sortOrder : index,
  };
}

function dispatchPositionTemplatesUpdated(templates: PositionTemplate[]): void {
  window.dispatchEvent(new CustomEvent(POSITION_TEMPLATES_UPDATED_EVENT, { detail: templates }));
}

export function getPositionTemplates(): PositionTemplate[] {
  const key = getOrganizationScopedPositionTemplatesStorageKey();
  try {
    const electronValue = window.electronStore?.getData?.(key) as unknown;
    if (Array.isArray(electronValue)) {
      localStorage.setItem(key, JSON.stringify(electronValue));
      return electronValue
        .map((entry, index) => normalizeTemplate(entry, index))
        .filter((entry): entry is PositionTemplate => Boolean(entry))
        .sort((left, right) => left.sortOrder - right.sortOrder);
    }
  } catch {
    // ignore
  }
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((entry, index) => normalizeTemplate(entry, index))
      .filter((entry): entry is PositionTemplate => Boolean(entry))
      .sort((left, right) => left.sortOrder - right.sortOrder);
  } catch {
    return [];
  }
}

export function savePositionTemplates(templates: PositionTemplate[]): void {
  const key = getOrganizationScopedPositionTemplatesStorageKey();
  try {
    window.electronStore?.setData?.(key, templates);
  } catch {
    // ignore
  }
  try {
    localStorage.setItem(key, JSON.stringify(templates));
  } catch {
    // ignore
  }
  dispatchPositionTemplatesUpdated(templates);
  requestCloudSync();
}

export function createPositionTemplate(input: {
  label: string;
  defaultRoleTag?: string;
  defaultLocation?: string;
}): PositionTemplate | null {
  const label = input.label.trim();
  if (!label) return null;
  const templates = getPositionTemplates();
  const template: PositionTemplate = {
    id: crypto.randomUUID(),
    label,
    defaultRoleTag: input.defaultRoleTag?.trim() || undefined,
    defaultLocation: input.defaultLocation?.trim() || undefined,
    sortOrder: templates.length,
  };
  savePositionTemplates([...templates, template]);
  return template;
}

export function updatePositionTemplate(
  templateId: string,
  updates: Partial<Pick<PositionTemplate, 'label' | 'defaultRoleTag' | 'defaultLocation'>>,
): PositionTemplate | null {
  const templates = getPositionTemplates();
  const index = templates.findIndex((template) => template.id === templateId);
  if (index < 0) return null;
  const existing = templates[index];
  const nextLabel = updates.label !== undefined ? updates.label.trim() : existing.label;
  if (!nextLabel) return null;
  const updated: PositionTemplate = {
    ...existing,
    label: nextLabel,
    defaultRoleTag:
      updates.defaultRoleTag !== undefined ? updates.defaultRoleTag.trim() || undefined : existing.defaultRoleTag,
    defaultLocation:
      updates.defaultLocation !== undefined
        ? updates.defaultLocation.trim() || undefined
        : existing.defaultLocation,
  };
  templates[index] = updated;
  savePositionTemplates(templates);
  return updated;
}

export function deletePositionTemplate(templateId: string): void {
  const templates = getPositionTemplates()
    .filter((template) => template.id !== templateId)
    .map((template, index) => ({
      ...template,
      sortOrder: index,
    }));
  savePositionTemplates(templates);
}

export function reorderPositionTemplates(nextOrderIds: string[]): void {
  const templates = getPositionTemplates();
  const byId = new Map(templates.map((template) => [template.id, template]));
  const orderedTemplates = nextOrderIds
    .map((id) => byId.get(id))
    .filter((template): template is PositionTemplate => Boolean(template))
    .map((template, index) => ({
      ...template,
      sortOrder: index,
    }));
  const remaining = templates
    .filter((template) => !nextOrderIds.includes(template.id))
    .map((template, index) => ({
      ...template,
      sortOrder: orderedTemplates.length + index,
    }));
  savePositionTemplates([...orderedTemplates, ...remaining]);
}
