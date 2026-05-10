import { getSupabase } from '@/lib/supabase/client';
import type { MaintenanceOnAirSchedule } from '@/lib/settingsService';

export const ACTIVE_ORGANIZATION_STORAGE_KEY = 'trackit:active-organization-id';

export type OrganizationMemberRole = 'admin' | 'editor' | 'viewer';

export interface OrganizationSummary {
  organizationId: string;
  name: string;
  ownerUserId: string;
  role: OrganizationMemberRole;
  createdAt?: string;
  updatedAt?: string;
}

export type OrganizationAppDataRow = {
  organization_id: string;
  contacts: unknown;
  position_templates: unknown;
  inventory_baseline: unknown;
  role_tags: unknown;
  branding: unknown;
  maintenance_on_air_template?: MaintenanceOnAirSchedule | null;
  fleet?: unknown;
  updated_at?: string;
};

export type OrganizationSnapshotPayload = Omit<OrganizationAppDataRow, 'organization_id' | 'updated_at'>;

export function getActiveOrganizationId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_ORGANIZATION_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setActiveOrganizationId(organizationId: string | null): void {
  try {
    if (!organizationId) {
      localStorage.removeItem(ACTIVE_ORGANIZATION_STORAGE_KEY);
      return;
    }
    localStorage.setItem(ACTIVE_ORGANIZATION_STORAGE_KEY, organizationId);
  } catch {
    // ignore
  }
}

export async function listOrganizationSummariesForUser(userId: string): Promise<OrganizationSummary[]> {
  const client = getSupabase();
  if (!client) return [];
  const { data: members, error: memberError } = await client
    .from('organization_members')
    .select('organization_id, role')
    .eq('user_id', userId);
  if (memberError || !Array.isArray(members) || members.length === 0) {
    return [];
  }
  const organizationIds = [
    ...new Set(members.map((member: { organization_id: string }) => member.organization_id).filter(Boolean)),
  ];
  if (organizationIds.length === 0) {
    return [];
  }
  const { data: organizations, error: organizationsError } = await client
    .from('organizations')
    .select('id, name, owner_user_id, created_at, updated_at')
    .in('id', organizationIds);
  if (organizationsError || !Array.isArray(organizations)) {
    return [];
  }
  const byOrganizationId = new Map(
    organizations.map((organization) => [
      String((organization as { id: string }).id),
      organization as {
        id: string;
        name: string;
        owner_user_id: string;
        created_at?: string;
        updated_at?: string;
      },
    ]),
  );
  const summaries: OrganizationSummary[] = [];
  for (const member of members as { organization_id: string; role: string }[]) {
    const organization = byOrganizationId.get(member.organization_id);
    if (!organization) continue;
    const role: OrganizationMemberRole =
      member.role === 'admin' || member.role === 'editor' || member.role === 'viewer' ? member.role : 'viewer';
    summaries.push({
      organizationId: organization.id,
      name: organization.name,
      ownerUserId: organization.owner_user_id,
      role,
      createdAt: organization.created_at,
      updatedAt: organization.updated_at,
    });
  }
  return summaries;
}

export async function pullOrganizationAppData(organizationId: string): Promise<OrganizationAppDataRow | null> {
  const client = getSupabase();
  if (!client) return null;
  const { data, error } = await client
    .from('organization_app_data')
    .select('*')
    .eq('organization_id', organizationId)
    .maybeSingle();
  if (error || !data) {
    return null;
  }
  return data as OrganizationAppDataRow;
}

export async function pushOrganizationSnapshot(
  organizationId: string,
  snapshot: OrganizationSnapshotPayload,
): Promise<void> {
  const client = getSupabase();
  if (!client) return;
  const { error } = await client.from('organization_app_data').upsert(
    {
      organization_id: organizationId,
      ...snapshot,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'organization_id' },
  );
  if (error) throw error;
}

export type OrganizationBrandingProfile = {
  address?: string;
  adminInfo?: string;
};

export type OrganizationRow = {
  id: string;
  name: string;
  branding: Record<string, unknown>;
};

export async function fetchOrganizationRow(organizationId: string): Promise<OrganizationRow | null> {
  const client = getSupabase();
  if (!client) return null;
  const { data, error } = await client
    .from('organizations')
    .select('id, name, branding')
    .eq('id', organizationId)
    .maybeSingle();
  if (error || !data) {
    return null;
  }
  const row = data as { id: string; name: string; branding: unknown };
  return {
    id: row.id,
    name: row.name,
    branding:
      typeof row.branding === 'object' && row.branding !== null && !Array.isArray(row.branding)
        ? (row.branding as Record<string, unknown>)
        : {},
  };
}

/**
 * Updates `organizations.name` and/or merges `branding.profile` (address, adminInfo) for the active org record.
 * Requires org owner or org admin per RLS.
 */
/**
 * Creates an organization owned by the signed-in user, adds them as admin,
 * and inserts a row in organization_app_data with JSON defaults.
 * Returns the new organization id.
 */
export async function createOrganizationWithDefaults(displayName: string): Promise<string> {
  const client = getSupabase();
  if (!client) {
    throw new Error('Supabase client unavailable');
  }
  const {
    data: { user: authUser },
    error: authErr,
  } = await client.auth.getUser();
  if (authErr || !authUser?.id) {
    throw authErr ?? new Error('No authenticated Supabase user found');
  }
  const ownerUserId = authUser.id;
  const trimmedName = displayName.trim();
  if (!trimmedName) {
    throw new Error('Organization name is required');
  }

  const { data: org, error: orgErr } = await client
    .from('organizations')
    .insert({ name: trimmedName, owner_user_id: ownerUserId, branding: {} })
    .select('id')
    .single();
  if (orgErr || !org?.id) {
    throw orgErr ?? new Error('Failed to create organization');
  }
  const organizationId = org.id as string;

  const { error: memberError } = await client.from('organization_members').insert({
    organization_id: organizationId,
    user_id: ownerUserId,
    role: 'admin',
  });
  if (memberError) {
    await client.from('organizations').delete().eq('id', organizationId);
    throw memberError;
  }

  const { error: appDataError } = await client.from('organization_app_data').insert({
    organization_id: organizationId,
  });
  if (appDataError) {
    await client.from('organizations').delete().eq('id', organizationId);
    throw appDataError;
  }

  return organizationId;
}

export async function updateOrganizationRecord(
  organizationId: string,
  patch: { name?: string; brandingProfile?: OrganizationBrandingProfile },
): Promise<void> {
  const client = getSupabase();
  if (!client) {
    throw new Error('Supabase client unavailable');
  }
  const existing = await fetchOrganizationRow(organizationId);
  if (!existing) {
    throw new Error('Organization not found or access denied');
  }
  const nextBranding: Record<string, unknown> = { ...existing.branding };
  if (patch.brandingProfile) {
    const prevProfile =
      typeof nextBranding.profile === 'object' && nextBranding.profile !== null && !Array.isArray(nextBranding.profile)
        ? (nextBranding.profile as Record<string, unknown>)
        : {};
    nextBranding.profile = {
      ...prevProfile,
      ...(patch.brandingProfile.address !== undefined ? { address: patch.brandingProfile.address } : {}),
      ...(patch.brandingProfile.adminInfo !== undefined ? { adminInfo: patch.brandingProfile.adminInfo } : {}),
    };
  }
  const updates: Record<string, unknown> = {
    branding: nextBranding,
    updated_at: new Date().toISOString(),
  };
  if (patch.name !== undefined) {
    const trimmed = patch.name.trim();
    if (!trimmed) {
      throw new Error('Organization name cannot be empty');
    }
    updates.name = trimmed;
  }
  const { error } = await client.from('organizations').update(updates).eq('id', organizationId);
  if (error) {
    throw error;
  }
}
