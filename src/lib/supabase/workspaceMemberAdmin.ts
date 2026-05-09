import { getSupabase, isSupabaseConfigured } from '@/lib/supabase/client';
import type { WorkspaceMemberRole } from '@/lib/supabase/workspaceData';

export interface WorkspaceMemberView {
  userId: string;
  email: string;
  role: WorkspaceMemberRole;
  displayName?: string;
  disabled?: boolean;
  invitedAt?: string | null;
}

interface WorkspaceMemberAdminResponse {
  members?: WorkspaceMemberView[];
}

function getFunctionsHttpResponse(error: unknown): Response | null {
  if (!error || typeof error !== 'object') {
    return null;
  }
  const ctx = (error as { context?: unknown }).context;
  if (ctx instanceof Response) {
    return ctx;
  }
  if (
    ctx &&
    typeof ctx === 'object' &&
    'response' in ctx &&
    (ctx as { response: unknown }).response instanceof Response
  ) {
    return (ctx as { response: Response }).response;
  }
  return null;
}

async function readEdgeFunctionFailureMessage(error: unknown, data: unknown): Promise<string> {
  if (data && typeof data === 'object' && data !== null && 'error' in data) {
    const raw = (data as { error?: unknown }).error;
    if (typeof raw === 'string' && raw.trim()) {
      return raw.trim();
    }
  }

  const response = getFunctionsHttpResponse(error);
  if (response) {
    try {
      const text = (await response.clone().text()).trim();
      if (text) {
        try {
          const parsed = JSON.parse(text) as { error?: unknown };
          if (typeof parsed.error === 'string' && parsed.error.trim()) {
            return parsed.error.trim();
          }
        } catch {
          return text.length > 500 ? `${text.slice(0, 500)}…` : text;
        }
      }
    } catch {
      /* ignore */
    }
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  return 'Edge function request failed.';
}

async function invokeWorkspaceMemberAdmin(
  body: Record<string, unknown>
): Promise<WorkspaceMemberAdminResponse> {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase is not configured.');
  }
  const client = getSupabase();
  if (!client) {
    throw new Error('Supabase client unavailable.');
  }
  const { data, error } = await client.functions.invoke('workspace-member-admin', { body });
  if (error) {
    throw new Error(await readEdgeFunctionFailureMessage(error, data));
  }
  return (data || {}) as WorkspaceMemberAdminResponse;
}

export async function listWorkspaceMembers(workspaceId: string): Promise<WorkspaceMemberView[]> {
  const response = await invokeWorkspaceMemberAdmin({
    action: 'list_members',
    workspaceId,
  });
  return response.members || [];
}

export async function inviteWorkspaceMember(
  workspaceId: string,
  email: string,
  role: WorkspaceMemberRole
): Promise<void> {
  await invokeWorkspaceMemberAdmin({
    action: 'invite_member',
    workspaceId,
    email,
    role,
  });
}

export async function updateWorkspaceMemberRole(
  workspaceId: string,
  userId: string,
  role: WorkspaceMemberRole
): Promise<void> {
  await invokeWorkspaceMemberAdmin({
    action: 'update_member_role',
    workspaceId,
    userId,
    role,
  });
}

export async function removeWorkspaceMember(workspaceId: string, userId: string): Promise<void> {
  await invokeWorkspaceMemberAdmin({
    action: 'remove_member',
    workspaceId,
    userId,
  });
}

export async function deleteWorkspace(workspaceId: string): Promise<void> {
  await invokeWorkspaceMemberAdmin({
    action: 'delete_workspace',
    workspaceId,
  });
}

export async function setWorkspaceMemberDisabled(
  workspaceId: string,
  userId: string,
  disabled: boolean
): Promise<void> {
  await invokeWorkspaceMemberAdmin({
    action: 'set_member_status',
    workspaceId,
    userId,
    disabled,
  });
}

export async function resetWorkspaceMemberPassword(
  workspaceId: string,
  userId: string,
  newPassword: string
): Promise<void> {
  await invokeWorkspaceMemberAdmin({
    action: 'reset_member_password',
    workspaceId,
    userId,
    newPassword,
  });
}
