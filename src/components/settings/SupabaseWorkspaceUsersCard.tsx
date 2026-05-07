import * as React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import type { WorkspaceMemberRole } from '@/lib/supabase/workspaceData';
import {
  inviteWorkspaceMember,
  listWorkspaceMembers,
  removeWorkspaceMember,
  resetWorkspaceMemberPassword,
  setWorkspaceMemberDisabled,
  updateWorkspaceMemberRole,
  type WorkspaceMemberView,
} from '@/lib/supabase/workspaceMemberAdmin';

interface SupabaseWorkspaceUsersCardProps {
  workspaceId: string;
  workspaceName?: string | null;
  currentUserId: string;
  canManageUsers: boolean;
}

export function SupabaseWorkspaceUsersCard({
  workspaceId,
  workspaceName,
  currentUserId,
  canManageUsers,
}: SupabaseWorkspaceUsersCardProps) {
  const [members, setMembers] = React.useState<WorkspaceMemberView[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [inviteEmail, setInviteEmail] = React.useState('');
  const [inviteRole, setInviteRole] = React.useState<WorkspaceMemberRole>('editor');
  const [busyAction, setBusyAction] = React.useState<string | null>(null);
  const [resetUserId, setResetUserId] = React.useState('');
  const [resetPassword, setResetPassword] = React.useState('');

  const loadMembers = React.useCallback(async () => {
    setLoading(true);
    try {
      const nextMembers = await listWorkspaceMembers(workspaceId);
      setMembers(nextMembers);
      if (nextMembers.length > 0 && !resetUserId) {
        setResetUserId(nextMembers[0].userId);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not load users.');
    } finally {
      setLoading(false);
    }
  }, [workspaceId, resetUserId]);

  React.useEffect(() => {
    void loadMembers();
  }, [loadMembers]);

  return (
    <Card>
      <CardHeader className="space-y-1">
        <CardTitle>Workspace User Management</CardTitle>
        <CardDescription>
          Admins can invite members, set role/status, reset passwords, and remove access for the selected workspace.
        </CardDescription>
        <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
          Target workspace: <span className="font-medium text-foreground">{workspaceName || workspaceId}</span>
          <span className="ml-2 font-mono text-[10px] text-muted-foreground/80">{workspaceId}</span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!canManageUsers ? (
          <div className="rounded-md border border-border/60 bg-muted/20 p-3 text-sm text-muted-foreground">
            Only workspace admins can manage users.
          </div>
        ) : (
          <>
            <div className="grid gap-2 md:grid-cols-[minmax(220px,1fr)_140px_auto] md:items-end">
              <div className="space-y-1.5">
                <Label htmlFor="supabase-invite-email">Invite by email</Label>
                <Input
                  id="supabase-invite-email"
                  type="email"
                  autoComplete="off"
                  className="placeholder:text-muted-foreground/40"
                  placeholder="name@company.com"
                  value={inviteEmail}
                  onChange={(event) => setInviteEmail(event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Role</Label>
                <Select value={inviteRole} onValueChange={(value: WorkspaceMemberRole) => setInviteRole(value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="editor">Editor</SelectItem>
                    <SelectItem value="viewer">Viewer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                type="button"
                disabled={busyAction === 'invite'}
                onClick={async () => {
                  const email = inviteEmail.trim().toLowerCase();
                  if (!email) {
                    toast.error('Email is required.');
                    return;
                  }
                  setBusyAction('invite');
                  try {
                    await inviteWorkspaceMember(workspaceId, email, inviteRole);
                    toast.success('Invite sent / membership updated.');
                    setInviteEmail('');
                    await loadMembers();
                  } catch (error) {
                    toast.error(error instanceof Error ? error.message : 'Invite failed.');
                  } finally {
                    setBusyAction(null);
                  }
                }}
              >
                {busyAction === 'invite' ? 'Inviting…' : 'Invite'}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Invitation emails are sent only when the address is a new auth user and project email delivery is configured.
              Existing users are added to this workspace immediately without email.
            </p>

            <div className="grid gap-2 rounded-md border border-border/60 bg-muted/20 p-3 md:grid-cols-[minmax(180px,1fr)_minmax(200px,1fr)_auto] md:items-end">
              <div className="space-y-1.5">
                <Label>Reset user password</Label>
                <Select value={resetUserId} onValueChange={setResetUserId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select user" />
                  </SelectTrigger>
                  <SelectContent>
                    {members.map((member) => (
                      <SelectItem key={member.userId} value={member.userId}>
                        {member.displayName || member.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="supabase-reset-password">Temporary password</Label>
                <Input
                  id="supabase-reset-password"
                  type="password"
                  autoComplete="new-password"
                  placeholder="At least 8 characters"
                  className="placeholder:text-muted-foreground/40"
                  value={resetPassword}
                  onChange={(event) => setResetPassword(event.target.value)}
                />
              </div>
              <Button
                type="button"
                variant="outline"
                disabled={busyAction === 'reset' || !resetUserId || resetPassword.trim().length < 8}
                onClick={async () => {
                  setBusyAction('reset');
                  try {
                    await resetWorkspaceMemberPassword(workspaceId, resetUserId, resetPassword.trim());
                    toast.success('Password updated.');
                    setResetPassword('');
                  } catch (error) {
                    toast.error(error instanceof Error ? error.message : 'Password reset failed.');
                  } finally {
                    setBusyAction(null);
                  }
                }}
              >
                {busyAction === 'reset' ? 'Resetting…' : 'Reset password'}
              </Button>
            </div>
          </>
        )}

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Members</p>
            <Button type="button" variant="ghost" size="sm" onClick={() => void loadMembers()} disabled={loading}>
              Refresh
            </Button>
          </div>

          {loading ? (
            <p className="text-xs text-muted-foreground">Loading users…</p>
          ) : members.length === 0 ? (
            <p className="text-xs text-muted-foreground">No users found for this workspace.</p>
          ) : (
            members.map((member) => {
              const rowBusy = busyAction?.endsWith(member.userId) ?? false;
              return (
                <div
                  key={member.userId}
                  className="grid gap-2 rounded-md border border-border/60 bg-background/70 p-2 md:grid-cols-[minmax(180px,1fr)_120px_120px_auto]"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {member.displayName || member.email}
                      {member.userId === currentUserId ? ' (you)' : ''}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{member.email}</p>
                  </div>

                  <Select
                    value={member.role}
                    disabled={!canManageUsers || rowBusy}
                    onValueChange={async (value: WorkspaceMemberRole) => {
                      setBusyAction(`role:${member.userId}`);
                      try {
                        await updateWorkspaceMemberRole(workspaceId, member.userId, value);
                        await loadMembers();
                        toast.success('Role updated.');
                      } catch (error) {
                        toast.error(error instanceof Error ? error.message : 'Role update failed.');
                      } finally {
                        setBusyAction(null);
                      }
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="editor">Editor</SelectItem>
                      <SelectItem value="viewer">Viewer</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select
                    value={member.disabled ? 'disabled' : 'active'}
                    disabled={!canManageUsers || rowBusy || member.userId === currentUserId}
                    onValueChange={async (value: 'active' | 'disabled') => {
                      setBusyAction(`status:${member.userId}`);
                      try {
                        await setWorkspaceMemberDisabled(workspaceId, member.userId, value === 'disabled');
                        await loadMembers();
                        toast.success('Status updated.');
                      } catch (error) {
                        toast.error(error instanceof Error ? error.message : 'Status update failed.');
                      } finally {
                        setBusyAction(null);
                      }
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="disabled">Disabled</SelectItem>
                    </SelectContent>
                  </Select>

                  <div className="flex justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={!canManageUsers || rowBusy || member.userId === currentUserId}
                      onClick={async () => {
                        setBusyAction(`remove:${member.userId}`);
                        try {
                          await removeWorkspaceMember(workspaceId, member.userId);
                          await loadMembers();
                          toast.success('User removed from workspace.');
                        } catch (error) {
                          toast.error(error instanceof Error ? error.message : 'Remove failed.');
                        } finally {
                          setBusyAction(null);
                        }
                      }}
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </CardContent>
    </Card>
  );
}
