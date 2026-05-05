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
    const errorLike = error as { context?: Response; message?: string };
    if (errorLike.context instanceof Response) {
      try {
        const responseBody = await errorLike.context.json();
        const message =
          typeof responseBody?.error === 'string'
            ? responseBody.error
            : typeof errorLike.message === 'string'
              ? errorLike.message
              : 'Edge function request failed.';
        throw new Error(message);
      } catch {
        throw new Error(errorLike.message || 'Edge function request failed.');
      }
    }
    throw error;
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
