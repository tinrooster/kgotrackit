import { getSupabase, isSupabaseConfigured } from '@/lib/supabase/client';
import type { WorkspaceMemberRole } from '@/lib/supabase/workspaceData';

export interface WorkspaceMemberView {
  userId: string;
  email: string;
  role: WorkspaceMemberRole;
  displayName?: string;
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
