import { getSupabase } from '@/lib/supabase/client';

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
  updated_at?: string;
};

export type WorkspaceSnapshotPayload = Omit<WorkspaceAppDataRow, 'workspace_id' | 'updated_at'>;

export type WorkspaceMemberRole = 'admin' | 'editor' | 'viewer';

export interface WorkspaceSummary {
  workspaceId: string;
  name: string;
  ownerUserId: string;
  role: WorkspaceMemberRole;
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
  if (mErr || !Array.isArray(members) || members.length === 0) {
    if (mErr) console.warn('[workspaceData] listWorkspaceSummariesForUser', mErr.message);
    return [];
  }
  const ids = [...new Set(members.map((m: { workspace_id: string }) => m.workspace_id).filter(Boolean))];
  const { data: wsRows, error: wErr } = await client.from('workspaces').select('id, name, owner_user_id').in('id', ids);
  if (wErr || !Array.isArray(wsRows)) {
    if (wErr) console.warn('[workspaceData] workspaces fetch', wErr.message);
    return [];
  }
  const byId = new Map(wsRows.map((w: { id: string; name: string; owner_user_id: string }) => [w.id, w]));
  const out: WorkspaceSummary[] = [];
  for (const m of members as { workspace_id: string; role: string }[]) {
    const w = byId.get(m.workspace_id);
    if (!w) continue;
    const role = m.role === 'admin' || m.role === 'editor' || m.role === 'viewer' ? m.role : 'viewer';
    out.push({
      workspaceId: w.id,
      name: w.name,
      ownerUserId: w.owner_user_id,
      role,
    });
  }
  return out;
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
  if (error || !data?.role) return null;
  const r = String(data.role);
  if (r === 'admin' || r === 'editor' || r === 'viewer') return r;
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
  const { error } = await client.from('workspace_app_data').upsert(
    {
      workspace_id: workspaceId,
      ...snapshot,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'workspace_id' },
  );
  if (error) {
    throw error;
  }
}

/**
 * Creates a workspace, adds caller as admin member, seeds payload from `snapshot`.
 * Returns new workspace id.
 */
export async function createWorkspaceWithSnapshot(
  name: string,
  snapshot: WorkspaceSnapshotPayload,
): Promise<string> {
  const client = getSupabase();
  if (!client) throw new Error('Supabase client unavailable');
  const {
    data: { session },
    error: sessionErr,
  } = await client.auth.getSession();
  if (sessionErr || !session?.access_token) {
    throw sessionErr ?? new Error('No active Supabase session. Sign in again and retry.');
  }
  const {
    data: { user: authUser },
    error: authErr,
  } = await client.auth.getUser();
  if (authErr || !authUser?.id) {
    throw authErr ?? new Error('No authenticated Supabase user found');
  }
  const ownerUserId = authUser.id;

  const { data: ws, error: wErr } = await client
    .from('workspaces')
    .insert({ name: name.trim() || 'Team workspace', owner_user_id: ownerUserId })
    .select('id')
    .single();
  if (wErr || !ws?.id) {
    throw wErr ?? new Error('Failed to create workspace');
  }
  const workspaceId = ws.id as string;

  const { error: mErr } = await client.from('workspace_members').insert({
    workspace_id: workspaceId,
    user_id: ownerUserId,
    role: 'admin',
  });
  if (mErr) {
    throw mErr;
  }

  const { error: dErr } = await client.from('workspace_app_data').insert({
    workspace_id: workspaceId,
    ...snapshot,
    updated_at: new Date().toISOString(),
  });
  if (dErr) {
    throw dErr;
  }

  return workspaceId;
}
