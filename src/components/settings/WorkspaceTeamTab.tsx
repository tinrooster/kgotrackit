import * as React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { isSupabaseConfigured } from '@/lib/supabase/client';
import { bootstrapCloudData } from '@/lib/supabase/cloudData';
import {
  inviteWorkspaceMember,
  listWorkspaceMembers,
  removeWorkspaceMember,
  updateWorkspaceMemberRole,
  type WorkspaceMemberView,
} from '@/lib/supabase/workspaceMemberAdmin';
import { collectLocalSnapshot } from '@/lib/supabase/cloudData';
import {
  createWorkspaceWithSnapshot,
  setActiveWorkspaceId,
  type WorkspaceSnapshotPayload,
} from '@/lib/supabase/workspaceData';
import { formatSupabaseOrUnknownError } from '@/lib/supabase/formatSupabaseError';
import { Users } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

/**
 * Settings → Data management: switch between personal cloud row and shared workspace payload.
 */
export function WorkspaceTeamTab() {
  const { currentUser, authBackend } = useAuth();
  const { workspaces, activeWorkspaceId, activeWorkspaceRole, loading, refreshWorkspaces } =
    useWorkspace();
  const [newName, setNewName] = React.useState('Team inventory');
  const [busy, setBusy] = React.useState(false);
  const [targetKind, setTargetKind] = React.useState<'personal' | 'team'>(activeWorkspaceId ? 'team' : 'personal');
  const [targetWorkspaceId, setTargetWorkspaceId] = React.useState<string>(activeWorkspaceId ?? '');
  const [members, setMembers] = React.useState<WorkspaceMemberView[]>([]);
  const [membersLoading, setMembersLoading] = React.useState(false);
  const [inviteEmail, setInviteEmail] = React.useState('');
  const [inviteRole, setInviteRole] = React.useState<'admin' | 'editor' | 'viewer'>('editor');
  const [memberActionBusyUserId, setMemberActionBusyUserId] = React.useState<string | null>(null);

  React.useEffect(() => {
    setTargetKind(activeWorkspaceId ? 'team' : 'personal');
    setTargetWorkspaceId(activeWorkspaceId ?? '');
  }, [activeWorkspaceId]);

  const formatWorkspaceError = (error: unknown): string => {
    const base = formatSupabaseOrUnknownError(error);
    const lower = base.toLowerCase();
    if (lower.includes('42501') && lower.includes('workspace')) {
      return `${base} Usually fixed by migration 20260508120000_workspace_owner_select.sql (owner can read own workspace before membership row). Also ensure 20260506120000 + 20260507120000 are applied, then run your Supabase migration deploy.`;
    }
    if (lower.includes('relation "workspaces"') || lower.includes('relation "workspace_')) {
      return `${base} Run the workspace migration first (20260506120000_workspace_shared_data.sql).`;
    }
    if (base === 'Unknown error.') {
      return `${base} Ensure workspace migrations are applied and your account can insert rows in workspaces, workspace_members, and workspace_app_data.`;
    }
    return base;
  };

  const activeWorkspaceRow = activeWorkspaceId
    ? workspaces.find((w) => w.workspaceId === activeWorkspaceId)
    : undefined;

  if (!isSupabaseConfigured() || authBackend !== 'supabase') {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4" aria-hidden />
            Team workspace
          </CardTitle>
          <CardDescription>
            Shared inventory and roles require Supabase sign-in. With local-only auth, each profile keeps its own data on this device.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const handleCreate = async () => {
    if (!currentUser?.id) return;
    setBusy(true);
    try {
      const snapshot = await collectLocalSnapshot();
      const id = await createWorkspaceWithSnapshot(newName, snapshot as WorkspaceSnapshotPayload);
      toast.success('Workspace created. Switching…');
      setActiveWorkspaceId(id);
      window.location.reload();
    } catch (e) {
      toast.error('Could not create workspace', { description: formatWorkspaceError(e) });
    } finally {
      setBusy(false);
    }
  };

  const applyContextSwitch = () => {
    if (targetKind === 'personal') {
      setActiveWorkspaceId(null);
      window.location.reload();
      return;
    }
    if (!targetWorkspaceId) {
      toast.error('Select a team workspace first.');
      return;
    }
    setActiveWorkspaceId(targetWorkspaceId);
    window.location.reload();
  };

  const isWorkspaceOwner = !!activeWorkspaceId && !!currentUser?.id && activeWorkspaceRow?.ownerUserId === currentUser.id;
  const canManageMembers = !!activeWorkspaceId && (activeWorkspaceRole === 'admin' || isWorkspaceOwner);

  const loadMembers = React.useCallback(async () => {
    if (!activeWorkspaceId || activeWorkspaceRole !== 'admin') {
      setMembers([]);
      return;
    }
    setMembersLoading(true);
    try {
      const rows = await listWorkspaceMembers(activeWorkspaceId);
      setMembers(rows);
    } catch (error) {
      toast.error('Could not load workspace members', { description: formatWorkspaceError(error) });
    } finally {
      setMembersLoading(false);
    }
  }, [activeWorkspaceId, activeWorkspaceRole]);

  React.useEffect(() => {
    void loadMembers();
  }, [loadMembers]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Users className="h-5 w-5" aria-hidden />
          Team workspace
        </CardTitle>
        <CardDescription>
          Create a shared workspace, switch between personal and team context, and refresh the available team list.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-md border border-border/60 bg-muted/20 p-3 text-sm">
          <p className="font-medium text-foreground">Active context</p>
          <p className="mt-1 text-muted-foreground">
            {activeWorkspaceId ? (
              <>
                Team: <span className="font-medium text-foreground">{activeWorkspaceRow?.name ?? 'Workspace'}</span>
                {activeWorkspaceRole ? ` · your role: ${activeWorkspaceRole}` : ''}
                <span className="mt-1 block font-mono text-[11px] text-muted-foreground/90" title="Workspace id">
                  {activeWorkspaceId}
                </span>
              </>
            ) : (
              <>Personal cloud snapshot (per-user row)</>
            )}
          </p>
          {currentUser?.id ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={async () => {
                  setBusy(true);
                  try {
                    await bootstrapCloudData(currentUser.id);
                    toast.success('Pulled latest cloud data');
                    window.location.reload();
                  } catch (error) {
                    toast.error('Could not pull cloud data', { description: formatWorkspaceError(error) });
                  } finally {
                    setBusy(false);
                  }
                }}
                disabled={busy}
              >
                {busy ? 'Syncing…' : 'Pull latest cloud data'}
              </Button>
              <span className="text-xs text-muted-foreground">
                Use after edits on another computer to refresh this device.
              </span>
            </div>
          ) : null}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
          <div className="min-w-0 flex-1 space-y-1.5">
            <Label htmlFor="workspace-name">New workspace name</Label>
            <Input
              id="workspace-name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Engineering shared"
              disabled={busy}
            />
          </div>
          <Button type="button" onClick={() => void handleCreate()} disabled={busy || !newName.trim()}>
            {busy ? 'Creating…' : 'Create from current data'}
          </Button>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">Switch context</p>
          <div className="inline-flex items-center gap-1 rounded-md border border-border/70 p-1">
            <Button
              type="button"
              size="sm"
              variant={targetKind === 'personal' ? 'secondary' : 'ghost'}
              onClick={() => setTargetKind('personal')}
            >
              Personal
            </Button>
            <Button
              type="button"
              size="sm"
              variant={targetKind === 'team' ? 'secondary' : 'ghost'}
              onClick={() => setTargetKind('team')}
            >
              Team
            </Button>
          </div>
          {targetKind === 'team' ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              {loading ? (
                <span className="text-xs text-muted-foreground">Loading workspaces…</span>
              ) : (
                workspaces.map((w) => (
                  <Button
                    key={w.workspaceId}
                    type="button"
                    variant={targetWorkspaceId === w.workspaceId ? 'secondary' : 'outline'}
                    size="sm"
                    onClick={() => setTargetWorkspaceId(w.workspaceId)}
                    title={`Role: ${w.role}`}
                  >
                    {w.name}
                  </Button>
                ))
              )}
              <Button type="button" variant="ghost" size="sm" onClick={() => void refreshWorkspaces()}>
                Refresh list
              </Button>
            </div>
          ) : null}
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              onClick={applyContextSwitch}
              disabled={
                (targetKind === 'personal' && !activeWorkspaceId) ||
                (targetKind === 'team' && (!targetWorkspaceId || targetWorkspaceId === activeWorkspaceId))
              }
            >
              Apply & reload
            </Button>
            <span className="text-xs text-muted-foreground">
              Selected target: {targetKind === 'personal' ? 'Personal data' : `Team ${targetWorkspaceId || '(none)'}`}
            </span>
          </div>
        </div>

        {canManageMembers ? (
          <div className="space-y-3 rounded-md border border-border/60 bg-muted/20 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium text-foreground">Team member management</p>
              <Button type="button" variant="ghost" size="sm" onClick={() => void loadMembers()} disabled={membersLoading}>
                Refresh members
              </Button>
            </div>

            <div className="grid gap-2 md:grid-cols-[minmax(220px,1fr)_160px_auto] md:items-end">
              <div className="space-y-1.5">
                <Label htmlFor="workspace-invite-email">Invite by email</Label>
                <Input
                  id="workspace-invite-email"
                  type="email"
                  placeholder="name@company.com"
                  value={inviteEmail}
                  onChange={(event) => setInviteEmail(event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Role</Label>
                <Select value={inviteRole} onValueChange={(value: 'admin' | 'editor' | 'viewer') => setInviteRole(value)}>
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
                onClick={async () => {
                  const email = inviteEmail.trim().toLowerCase();
                  if (!email) {
                    toast.error('Enter an email address.');
                    return;
                  }
                  setMemberActionBusyUserId('invite');
                  try {
                    await inviteWorkspaceMember(activeWorkspaceId!, email, inviteRole);
                    toast.success('Invite/membership updated');
                    setInviteEmail('');
                    await loadMembers();
                  } catch (error) {
                    toast.error('Could not invite member', { description: formatWorkspaceError(error) });
                  } finally {
                    setMemberActionBusyUserId(null);
                  }
                }}
                disabled={memberActionBusyUserId === 'invite'}
              >
                {memberActionBusyUserId === 'invite' ? 'Inviting…' : 'Invite'}
              </Button>
            </div>

            <div className="space-y-2">
              {membersLoading ? (
                <p className="text-xs text-muted-foreground">Loading members…</p>
              ) : members.length === 0 ? (
                <p className="text-xs text-muted-foreground">No members found.</p>
              ) : (
                members.map((member) => {
                  const roleBusy = memberActionBusyUserId === `role:${member.userId}`;
                  const removeBusy = memberActionBusyUserId === `remove:${member.userId}`;
                  return (
                    <div
                      key={member.userId}
                      className="grid gap-2 rounded-md border border-border/60 bg-background/70 px-3 py-2 md:grid-cols-[minmax(220px,1fr)_160px_auto]"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">
                          {member.displayName || member.email}
                          {member.userId === currentUser?.id ? ' (you)' : ''}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">{member.email}</p>
                      </div>
                      <Select
                        value={member.role}
                        onValueChange={async (value: 'admin' | 'editor' | 'viewer') => {
                          if (!activeWorkspaceId) return;
                          setMemberActionBusyUserId(`role:${member.userId}`);
                          try {
                            await updateWorkspaceMemberRole(activeWorkspaceId, member.userId, value);
                            await loadMembers();
                            await refreshWorkspaces();
                            toast.success('Member role updated');
                          } catch (error) {
                            toast.error('Could not update role', { description: formatWorkspaceError(error) });
                          } finally {
                            setMemberActionBusyUserId(null);
                          }
                        }}
                        disabled={roleBusy}
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
                      <div className="flex items-center justify-end">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={removeBusy || member.userId === currentUser?.id}
                          onClick={async () => {
                            if (!activeWorkspaceId) return;
                            setMemberActionBusyUserId(`remove:${member.userId}`);
                            try {
                              await removeWorkspaceMember(activeWorkspaceId, member.userId);
                              await loadMembers();
                              toast.success('Member removed');
                            } catch (error) {
                              toast.error('Could not remove member', { description: formatWorkspaceError(error) });
                            } finally {
                              setMemberActionBusyUserId(null);
                            }
                          }}
                        >
                          {removeBusy ? 'Removing…' : 'Remove'}
                        </Button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        ) : activeWorkspaceId ? (
          <div className="rounded-md border border-border/60 bg-muted/20 p-3 text-xs text-muted-foreground">
            Member management is available to workspace admins.
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
