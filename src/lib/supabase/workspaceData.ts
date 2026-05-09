import { getSupabase } from '@/lib/supabase/client';
import { formatSupabaseOrUnknownError } from '@/lib/supabase/formatSupabaseError';
import { createOrganizationWithDefaults } from '@/lib/supabase/organizationData';

function asWorkspaceCreateError(error: unknown): Error {
  if (error instanceof Error) return error;
  return new Error(formatSupabaseOrUnknownError(error));
}

export const ACTIVE_WORKSPACE_STORAGE_KEY = 'trackit:active-workspace-id';

/** Same JSON columns as `user_app_data` / `collectLocalSnapshot`, keyed by `workspace_id`. */
export type WorkspaceAppDataRow = {
  workspace_id: string;
  items: unknown;
  settings: unknown;
  templates: unknown;
  history: unknown;
  cabinets: unknown;
  financial: unknown;
  ui_defaults: unknown;
  general_settings: unknown;
  custom_report_definitions?: unknown;
  productions?: unknown;
  crew_contacts?: unknown;
  updated_at?: string;
};

export type WorkspaceSnapshotPayload = Omit<WorkspaceAppDataRow, 'workspace_id' | 'updated_at'>;

export type WorkspaceMemberRole = 'admin' | 'editor' | 'viewer';

export interface WorkspaceSummary {
  workspaceId: string;
  organizationId?: string | null;
  name: string;
  ownerUserId: string;
  role: WorkspaceMemberRole;
  createdAt?: string;
  updatedAt?: string;
  recordCount?: number;
  productionCount?: number;
}

function countEntries(value: unknown): number {
  if (Array.isArray(value)) return value.length;
  if (typeof value === 'string') {
    try {
      return countEntries(JSON.parse(value));
    } catch {
      return 0;
    }
  }
  if (!value || typeof value !== 'object') return 0;

  const record = value as Record<string, unknown>;
  // Handle historical nested snapshot shapes defensively.
  if ('items' in record) return countEntries(record.items);
  if ('productions' in record) return countEntries(record.productions);

  // Fallback for object maps keyed by id.
  return Object.keys(record).length;
}

function formatWorkspaceQueryError(error: { message?: string; code?: string } | null | undefined): string {
  if (!error) return 'Unknown workspace query error.';
  const rawMessage = typeof error.message === 'string' ? error.message : 'Unknown workspace query error.';
  const code = typeof error.code === 'string' ? error.code : '';
  if (code === '42501') {
    return `${rawMessage} (RLS access blocked. Apply workspace migrations including 20260508120000_workspace_owner_select.sql).`;
  }
  return rawMessage;
}

function isMissingOrganizationIdColumnError(error: { message?: string; code?: string } | null | undefined): boolean {
  if (!error) return false;
  const message = typeof error.message === 'string' ? error.message.toLowerCase() : '';
  const code = typeof error.code === 'string' ? error.code : '';
  return (
    code === '42703' ||
    (message.includes('organization_id') && message.includes('does not exist')) ||
    (message.includes('column') && message.includes('organization_id'))
  );
}

function isMissingColumnError(
  error: { message?: string; code?: string } | null | undefined,
  columnName: string,
): boolean {
  if (!error) return false;
  const message = typeof error.message === 'string' ? error.message.toLowerCase() : '';
  const code = typeof error.code === 'string' ? error.code : '';
  const target = columnName.toLowerCase();
  return (
    code === '42703' ||
    (message.includes(target) && message.includes('does not exist')) ||
    (message.includes('column') && message.includes(target))
  );
}

export function getActiveWorkspaceId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_WORKSPACE_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setActiveWorkspaceId(workspaceId: string | null): void {
  try {
    if (workspaceId) {
      localStorage.setItem(ACTIVE_WORKSPACE_STORAGE_KEY, workspaceId);
    } else {
      localStorage.removeItem(ACTIVE_WORKSPACE_STORAGE_KEY);
    }
  } catch {
    /* ignore */
  }
}

export async function listWorkspaceSummariesForUser(userId: string): Promise<WorkspaceSummary[]> {
  const client = getSupabase();
  if (!client) return [];
  const { data: members, error: mErr } = await client
    .from('workspace_members')
    .select('workspace_id, role')
    .eq('user_id', userId);
  if (mErr) {
    console.warn('[workspaceData] listWorkspaceSummariesForUser', mErr.message);
  }
  const memberRows = Array.isArray(members) ? (members as { workspace_id: string; role: string }[]) : [];
  const ownerSelectWithOrganizationId = await client
    .from('workspaces')
    .select('id, organization_id, name, owner_user_id, created_at')
    .eq('owner_user_id', userId);
  const ownerSelectLegacy = isMissingOrganizationIdColumnError(
    ownerSelectWithOrganizationId.error as { message?: string; code?: string } | null | undefined,
  )
    ? await client
        .from('workspaces')
        .select('id, name, owner_user_id, created_at')
        .eq('owner_user_id', userId)
    : null;
  const ownerRows = ownerSelectLegacy ? ownerSelectLegacy.data : ownerSelectWithOrganizationId.data;
  const ownerErr = ownerSelectLegacy ? ownerSelectLegacy.error : ownerSelectWithOrganizationId.error;
  if (ownerErr) {
    console.warn('[workspaceData] owner workspace fetch', ownerErr.message);
  }
  const ownerWorkspaceRows = Array.isArray(ownerRows)
    ? (ownerRows as { id: string; organization_id?: string | null; name: string; owner_user_id: string; created_at?: string }[])
    : [];
  const ids = [
    ...new Set([
      ...memberRows.map((m) => m.workspace_id).filter(Boolean),
      ...ownerWorkspaceRows.map((w) => w.id).filter(Boolean),
    ]),
  ];
  if (ids.length === 0) {
    if (mErr || ownerErr) {
      throw new Error(
        `Could not load workspace memberships. ${formatWorkspaceQueryError(
          (mErr as { message?: string; code?: string } | null | undefined) ??
            (ownerErr as { message?: string; code?: string } | null | undefined),
        )}`,
      );
    }
    return [];
  }
  const missingOwnerMembershipWorkspaceIds = ownerWorkspaceRows
    .map((workspace) => workspace.id)
    .filter((workspaceId) => !memberRows.some((member) => member.workspace_id === workspaceId));
  for (const workspaceId of missingOwnerMembershipWorkspaceIds) {
    const { error: ensureMembershipError } = await client
      .from('workspace_members')
      .upsert(
        {
          workspace_id: workspaceId,
          user_id: userId,
          role: 'admin',
        },
        { onConflict: 'workspace_id,user_id' },
      );
    if (ensureMembershipError) {
      console.warn('[workspaceData] ensure owner membership', ensureMembershipError.message);
    }
  }
  const workspaceSelectWithOrganizationId = await client
    .from('workspaces')
    .select('id, organization_id, name, owner_user_id, created_at')
    .in('id', ids);
  const workspaceSelectLegacy = isMissingOrganizationIdColumnError(
    workspaceSelectWithOrganizationId.error as { message?: string; code?: string } | null | undefined,
  )
    ? await client
        .from('workspaces')
        .select('id, name, owner_user_id, created_at')
        .in('id', ids)
    : null;
  const wsRows = workspaceSelectLegacy ? workspaceSelectLegacy.data : workspaceSelectWithOrganizationId.data;
  const wErr = workspaceSelectLegacy ? workspaceSelectLegacy.error : workspaceSelectWithOrganizationId.error;
  if (wErr || !Array.isArray(wsRows)) {
    throw new Error(`Could not load workspace rows. ${formatWorkspaceQueryError(wErr as { message?: string; code?: string } | null | undefined)}`);
  }
  const sortedWorkspaces = [...wsRows].sort((left, right) => {
    const leftCreatedAt = String((left as { created_at?: string }).created_at || '');
    const rightCreatedAt = String((right as { created_at?: string }).created_at || '');
    if (leftCreatedAt && rightCreatedAt && leftCreatedAt !== rightCreatedAt) {
      return leftCreatedAt.localeCompare(rightCreatedAt);
    }
    const leftName = String((left as { name?: string }).name || '').toLowerCase();
    const rightName = String((right as { name?: string }).name || '').toLowerCase();
    if (leftName !== rightName) {
      return leftName.localeCompare(rightName);
    }
    return String((left as { id?: string }).id || '').localeCompare(String((right as { id?: string }).id || ''));
  });
  const byId = new Map(
    sortedWorkspaces.map((workspace) => [
      (workspace as { id: string }).id,
      workspace as { id: string; name: string; owner_user_id: string; created_at?: string },
    ])
  );

  const appRowsWithProductions = await client
    .from('workspace_app_data')
    .select('workspace_id, items, productions, updated_at')
    .in('workspace_id', ids);
  const appRowsLegacy = isMissingColumnError(
    appRowsWithProductions.error as { message?: string; code?: string } | null | undefined,
    'productions',
  )
    ? await client
        .from('workspace_app_data')
        .select('workspace_id, items, updated_at')
        .in('workspace_id', ids)
    : null;
  const appRows = appRowsLegacy ? appRowsLegacy.data : appRowsWithProductions.data;
  const appById = new Map(
    Array.isArray(appRows)
      ? appRows.map((row: any) => [
          String(row.workspace_id),
          {
            updatedAt: typeof row.updated_at === 'string' ? row.updated_at : undefined,
            recordCount: countEntries(row.items),
            productionCount: countEntries(row.productions),
          },
        ])
      : [],
  );
  const out: WorkspaceSummary[] = [];
  const roleByWorkspaceId = new Map<string, WorkspaceMemberRole>();
  for (const m of memberRows) {
    const role = m.role === 'admin' || m.role === 'editor' || m.role === 'viewer' ? m.role : 'viewer';
    roleByWorkspaceId.set(m.workspace_id, role);
  }
  for (const ownerWorkspace of ownerWorkspaceRows) {
    if (!roleByWorkspaceId.has(ownerWorkspace.id)) {
      roleByWorkspaceId.set(ownerWorkspace.id, 'admin');
    }
  }
  for (const id of ids) {
    const w = byId.get(id);
    if (!w) continue;
    const role = roleByWorkspaceId.get(id) ?? 'viewer';
    out.push({
      workspaceId: w.id,
      organizationId: (w as { organization_id?: string | null }).organization_id ?? null,
      name: w.name,
      ownerUserId: w.owner_user_id,
      role,
      createdAt: (w as { created_at?: string }).created_at,
      updatedAt: appById.get(w.id)?.updatedAt,
      recordCount: appById.get(w.id)?.recordCount,
      productionCount: appById.get(w.id)?.productionCount,
    });
  }
  return out;
}

export async function fetchWorkspaceOrganizationId(workspaceId: string): Promise<string | null> {
  const client = getSupabase();
  if (!client) return null;
  const { data, error } = await client
    .from('workspaces')
    .select('organization_id')
    .eq('id', workspaceId)
    .maybeSingle();
  if (error || !data) return null;
  const organizationId = (data as { organization_id?: unknown }).organization_id;
  return typeof organizationId === 'string' && organizationId.length > 0 ? organizationId : null;
}

export async function fetchWorkspaceMemberRole(
  workspaceId: string,
  userId: string,
): Promise<WorkspaceMemberRole | null> {
  const client = getSupabase();
  if (!client) return null;
  const { data, error } = await client
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
    .maybeSingle();
  if (!error && data?.role) {
    const r = String(data.role);
    if (r === 'admin' || r === 'editor' || r === 'viewer') return r;
  }
  const { data: workspaceRow, error: ownerErr } = await client
    .from('workspaces')
    .select('owner_user_id')
    .eq('id', workspaceId)
    .maybeSingle();
  if (!ownerErr && workspaceRow && (workspaceRow as { owner_user_id?: string }).owner_user_id === userId) {
    return 'admin';
  }
  return null;
}

export async function pullWorkspaceAppData(workspaceId: string): Promise<WorkspaceAppDataRow | null> {
  const client = getSupabase();
  if (!client) return null;
  const { data, error } = await client.from('workspace_app_data').select('*').eq('workspace_id', workspaceId).maybeSingle();
  if (error) {
    console.warn('[workspaceData] pullWorkspaceAppData', error.message);
    return null;
  }
  if (!data) return null;
  return data as WorkspaceAppDataRow;
}

export async function pushWorkspaceSnapshot(workspaceId: string, snapshot: WorkspaceSnapshotPayload): Promise<void> {
  const client = getSupabase();
  if (!client) return;
  const payloadWithContacts = {
    workspace_id: workspaceId,
    ...snapshot,
    updated_at: new Date().toISOString(),
  };
  const { error: firstError } = await client
    .from('workspace_app_data')
    .upsert(payloadWithContacts, { onConflict: 'workspace_id' });
  if (
    firstError &&
    isMissingColumnError(firstError as { message?: string; code?: string } | null | undefined, 'crew_contacts')
  ) {
    const payloadWithoutContacts = { ...payloadWithContacts } as Record<string, unknown>;
    delete payloadWithoutContacts.crew_contacts;
    const { error: retryError } = await client
      .from('workspace_app_data')
      .upsert(payloadWithoutContacts, { onConflict: 'workspace_id' });
    if (retryError) {
      throw retryError;
    }
    return;
  }
  if (firstError) {
    throw firstError;
  }
}

export interface CreateWorkspaceWithSnapshotOptions {
  /**
   * Link the workspace to an existing organization the caller can access.
   * When set, no new `organizations` row is created.
   */
  existingOrganizationId?: string;
  /**
   * Display name for a newly created organization. Ignored when `existingOrganizationId` is set.
   * When omitted, uses the workspace display name.
   */
  organizationName?: string;
}

/**
 * Creates a workspace, adds caller as admin member, seeds payload from `snapshot`.
 * When organization tables and `workspaces.organization_id` are available, links the workspace
 * to `existingOrganizationId` or creates a master organization (owner + empty org app data).
 * Returns new workspace id.
 */
export async function createWorkspaceWithSnapshot(
  name: string,
  snapshot: WorkspaceSnapshotPayload,
  options?: CreateWorkspaceWithSnapshotOptions,
): Promise<string> {
  const client = getSupabase();
  if (!client) throw new Error('Supabase client unavailable');
  const {
    data: { session },
    error: sessionErr,
  } = await client.auth.getSession();
  if (sessionErr || !session?.access_token) {
    if (sessionErr) throw asWorkspaceCreateError(sessionErr);
    throw new Error('No active Supabase session. Sign in again and retry.');
  }
  const {
    data: { user: authUser },
    error: authErr,
  } = await client.auth.getUser();
  if (authErr || !authUser?.id) {
    if (authErr) throw asWorkspaceCreateError(authErr);
    throw new Error('No authenticated Supabase user found');
  }
  const ownerUserId = authUser.id;
  const workspaceDisplayName = name.trim() || 'Team workspace';
  const existingOrgIdRaw = options?.existingOrganizationId?.trim() || '';
  const organizationDisplayName = options?.organizationName?.trim() || workspaceDisplayName;

  let linkedOrganizationId: string | null = existingOrgIdRaw || null;
  let createdNewOrganization = false;

  if (!linkedOrganizationId) {
    try {
      linkedOrganizationId = await createOrganizationWithDefaults(organizationDisplayName);
      createdNewOrganization = true;
    } catch (organizationError) {
      const code =
        organizationError && typeof organizationError === 'object' && 'code' in organizationError
          ? String((organizationError as { code?: string }).code)
          : '';
      const message = formatSupabaseOrUnknownError(organizationError);
      const lower = message.toLowerCase();
      const looksLikeMissingOrgSchema =
        code === '42P01' || (lower.includes('relation') && lower.includes('does not exist'));
      if (!looksLikeMissingOrgSchema) {
        throw asWorkspaceCreateError(organizationError);
      }
      linkedOrganizationId = null;
    }
  }

  const insertWorkspace = async (payload: Record<string, unknown>) => {
    return client.from('workspaces').insert(payload).select('id').single();
  };

  let workspaceId: string;
  if (linkedOrganizationId) {
    const withOrg = await insertWorkspace({
      name: workspaceDisplayName,
      owner_user_id: ownerUserId,
      organization_id: linkedOrganizationId,
    });
    if (
      withOrg.error &&
      isMissingOrganizationIdColumnError(withOrg.error as { message?: string; code?: string } | null | undefined)
    ) {
      if (createdNewOrganization && linkedOrganizationId) {
        await client.from('organizations').delete().eq('id', linkedOrganizationId);
      }
      linkedOrganizationId = null;
      const legacy = await insertWorkspace({
        name: workspaceDisplayName,
        owner_user_id: ownerUserId,
      });
      if (legacy.error || !legacy.data?.id) {
        throw legacy.error ? asWorkspaceCreateError(legacy.error) : new Error('Failed to create workspace');
      }
      workspaceId = legacy.data.id as string;
    } else if (withOrg.error || !withOrg.data?.id) {
      if (createdNewOrganization && linkedOrganizationId) {
        await client.from('organizations').delete().eq('id', linkedOrganizationId);
      }
      throw withOrg.error ? asWorkspaceCreateError(withOrg.error) : new Error('Failed to create workspace');
    } else {
      workspaceId = withOrg.data.id as string;
    }
  } else {
    const legacy = await insertWorkspace({
      name: workspaceDisplayName,
      owner_user_id: ownerUserId,
    });
    if (legacy.error || !legacy.data?.id) {
      throw legacy.error ? asWorkspaceCreateError(legacy.error) : new Error('Failed to create workspace');
    }
    workspaceId = legacy.data.id as string;
  }

  const rollbackWorkspaceAndOrg = async () => {
    await client.from('workspaces').delete().eq('id', workspaceId);
    if (createdNewOrganization && linkedOrganizationId) {
      await client.from('organizations').delete().eq('id', linkedOrganizationId);
    }
  };

  const { error: mErr } = await client.from('workspace_members').insert({
    workspace_id: workspaceId,
    user_id: ownerUserId,
    role: 'admin',
  });
  if (mErr) {
    await rollbackWorkspaceAndOrg();
    throw asWorkspaceCreateError(mErr);
  }

  const { error: dErr } = await client.from('workspace_app_data').insert({
    workspace_id: workspaceId,
    ...snapshot,
    updated_at: new Date().toISOString(),
  });
  if (dErr) {
    await rollbackWorkspaceAndOrg();
    throw asWorkspaceCreateError(dErr);
  }

  return workspaceId;
}
