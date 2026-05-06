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
  deleteWorkspace,
  inviteWorkspaceMember,
  listWorkspaceMembers,
  removeWorkspaceMember,
  resetWorkspaceMemberPassword,
  updateWorkspaceMemberRole,
  type WorkspaceMemberView,
} from '@/lib/supabase/workspaceMemberAdmin';
import { setActiveWorkspaceId } from '@/lib/supabase/workspaceData';
import { formatSupabaseOrUnknownError } from '@/lib/supabase/formatSupabaseError';
import { Key, Users } from 'lucide-react';
import { logger as durableLogger } from '@/lib/logging';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CreateWorkspaceDialog } from '@/components/settings/CreateWorkspaceDialog';
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { DraggableDialogContent } from '@/components/ui/draggable-dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

/**
 * Settings → Data management: switch between personal cloud row and shared workspace payload.
 */
export function WorkspaceTeamTab() {
  const { currentUser, authBackend } = useAuth();
  const { workspaces, activeWorkspaceId, activeWorkspaceRole, loading, refreshWorkspaces } =
    useWorkspace();
  const [busy, setBusy] = React.useState(false);
  const [targetWorkspaceId, setTargetWorkspaceId] = React.useState<string>(activeWorkspaceId ?? '');
  const [members, setMembers] = React.useState<WorkspaceMemberView[]>([]);
  const [membersLoading, setMembersLoading] = React.useState(false);
  const [inviteEmail, setInviteEmail] = React.useState('');
  const [inviteRole, setInviteRole] = React.useState<'admin' | 'editor' | 'viewer'>('editor');
  const [memberActionBusyUserId, setMemberActionBusyUserId] = React.useState<string | null>(null);
  const [deleteWorkspaceDialogOpen, setDeleteWorkspaceDialogOpen] = React.useState(false);
  const [confirmWorkspaceName, setConfirmWorkspaceName] = React.useState('');
  const [deletingWorkspace, setDeletingWorkspace] = React.useState(false);
  const [manageDialogOpen, setManageDialogOpen] = React.useState(false);
  const [manageWorkspaceId, setManageWorkspaceId] = React.useState<string>('');
  const [createDialogOpen, setCreateDialogOpen] = React.useState(false);
  const [resetPasswordDialogOpenForUserId, setResetPasswordDialogOpenForUserId] = React.useState<string | null>(null);
  const [resetPasswordValue, setResetPasswordValue] = React.useState('');
  const [resettingPassword, setResettingPassword] = React.useState(false);

  React.useEffect(() => {
    setTargetWorkspaceId(activeWorkspaceId ?? '');
    setManageWorkspaceId(activeWorkspaceId ?? '');
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
            Workspace
          </CardTitle>
          <CardDescription>
            Shared inventory and roles require Supabase sign-in. With local-only auth, each profile keeps its own data on this device.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  // Workspace creation is handled by `CreateWorkspaceDialog`.

  const applyWorkspaceSwitch = () => {
    if (!targetWorkspaceId) {
      toast.error('Select a workspace first.');
      return;
    }
    const targetWs = workspaces.find((workspace) => workspace.workspaceId === targetWorkspaceId);
    if (!targetWs) {
      toast.error('You can only switch to workspaces where you are already invited.');
      return;
    }
    durableLogger.info('audit', 'WORKSPACE_SWITCHED', {
      workspaceName: targetWs.name,
      workspaceId: targetWorkspaceId,
      performedBy: currentUser?.username || 'Unknown',
    }, 'WorkspaceTeamTab');
    setActiveWorkspaceId(targetWorkspaceId);
    window.location.reload();
  };

  const isWorkspaceOwner = !!activeWorkspaceId && !!currentUser?.id && activeWorkspaceRow?.ownerUserId === currentUser.id;
  const canManageMembers = !!activeWorkspaceId && (activeWorkspaceRole === 'admin' || isWorkspaceOwner);
  const canDeleteWorkspace = !!activeWorkspaceId && (activeWorkspaceRole === 'admin' || isWorkspaceOwner);
  const manageableWorkspaces = React.useMemo(
    () => workspaces.filter((w) => w.role === 'admin' || w.ownerUserId === currentUser?.id),
    [currentUser?.id, workspaces],
  );
  const manageableWorkspaceIdSet = React.useMemo(
    () => new Set(manageableWorkspaces.map((w) => w.workspaceId)),
    [manageableWorkspaces],
  );

  const loadMembers = React.useCallback(async () => {
    const workspaceId = manageDialogOpen ? manageWorkspaceId : activeWorkspaceId;
    const canLoad = manageDialogOpen ? manageableWorkspaceIdSet.has(manageWorkspaceId) : canManageMembers;
    if (!workspaceId || !canLoad) {
      setMembers([]);
      return;
    }
    setMembersLoading(true);
    try {
      const rows = await listWorkspaceMembers(workspaceId);
      setMembers(rows);
    } catch (error) {
      toast.error('Could not load workspace members', { description: formatWorkspaceError(error) });
    } finally {
      setMembersLoading(false);
    }
  }, [activeWorkspaceId, canManageMembers, manageDialogOpen, manageWorkspaceId, manageableWorkspaceIdSet]);

  React.useEffect(() => {
    if (!manageDialogOpen) return;
    void loadMembers();
  }, [loadMembers, manageDialogOpen]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Users className="h-5 w-5" aria-hidden />
          Workspace
        </CardTitle>
        <CardDescription>
          Create and switch between workspaces. All workspaces are cloud-enabled.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-md border border-border/60 bg-muted/20 p-3 text-sm">
          <p className="text-sm font-medium text-foreground">Active workspace</p>
          <p className="mt-1 text-muted-foreground">
            {activeWorkspaceId ? (
              <>
                <span className="font-medium text-foreground">{activeWorkspaceRow?.name ?? 'Workspace'}</span>
                {activeWorkspaceRole ? ` · your role: ${activeWorkspaceRole}` : ''}
                <span className="mt-1 block font-mono text-[11px] text-muted-foreground/90" title="Workspace id">
                  {activeWorkspaceId}
                </span>
              </>
            ) : (
              <>No workspace selected</>
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

        <div className="rounded-md border border-border/60 bg-muted/20 p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium text-foreground">Change workspace</p>
            <Button type="button" variant="ghost" size="sm" onClick={() => void refreshWorkspaces()}>
              Refresh list
            </Button>
          </div>
          <div className="mt-2 space-y-2">
            {loading ? (
              <span className="text-xs text-muted-foreground">Loading workspaces…</span>
            ) : workspaces.length === 0 ? (
              <span className="text-xs text-muted-foreground">No workspaces yet.</span>
            ) : (
              workspaces.map((w) => {
                const isSelected = targetWorkspaceId === w.workspaceId;
                const isActive = w.workspaceId === activeWorkspaceId;
                const createdLabel = w.createdAt ? new Date(w.createdAt).toLocaleDateString() : '—';
                const recordCount = typeof w.recordCount === 'number' ? w.recordCount : 0;
                const createdBy = w.ownerUserId === currentUser?.id ? 'you' : w.ownerUserId.slice(0, 8);
                return (
                  <button
                    key={w.workspaceId}
                    type="button"
                    onClick={() => setTargetWorkspaceId(w.workspaceId)}
                    className={`w-full rounded-md border px-3 py-2 text-left transition-colors ${
                      isSelected ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/30'
                    } ${isActive ? 'ring-2 ring-primary/20' : ''}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-foreground">{w.name}</div>
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          Created {createdLabel} · Owner {createdBy} · Records {recordCount}
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground">{w.role}</div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              onClick={applyWorkspaceSwitch}
              disabled={!targetWorkspaceId || targetWorkspaceId === activeWorkspaceId}
            >
              Apply & reload
            </Button>
            <span className="text-xs text-muted-foreground">
              Selected: {targetWorkspaceId ? workspaces.find((w) => w.workspaceId === targetWorkspaceId)?.name ?? targetWorkspaceId : '(none)'}
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">Create a new workspace with empty or starter defaults.</p>
          <Button type="button" onClick={() => setCreateDialogOpen(true)} disabled={busy}>
            Create workspace
          </Button>
        </div>

        <div className="rounded-md border border-border/60 bg-muted/20 p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium text-foreground">Workspace administration</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setManageDialogOpen(true)}
              disabled={manageableWorkspaces.length === 0}
            >
              Manage workspaces
            </Button>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Administer network workspaces: members, roles, and deletion.
          </p>
        </div>
      </CardContent>

      <CreateWorkspaceDialog
        open={createDialogOpen}
        existingWorkspaceNames={workspaces.map((w) => w.name)}
        onClose={() => setCreateDialogOpen(false)}
        onCreated={async (workspaceId) => {
          setActiveWorkspaceId(workspaceId);
          await refreshWorkspaces();
          window.location.reload();
        }}
      />

      <Dialog open={manageDialogOpen} onOpenChange={setManageDialogOpen}>
        <DraggableDialogContent className="w-[min(calc(100vw-1rem),760px)]">
          <DialogHeader>
            <DialogTitle>Manage workspaces</DialogTitle>
            <DialogDescription>
              Select a workspace to view members, update roles, invite users, or delete it.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3">
            <div className="space-y-1.5">
              <Label>Workspace</Label>
              <Select
                value={manageWorkspaceId}
                onValueChange={(value) => {
                  setManageWorkspaceId(value);
                  setMemberActionBusyUserId(null);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a workspace" />
                </SelectTrigger>
                <SelectContent>
                  {manageableWorkspaces.map((w) => (
                    <SelectItem key={w.workspaceId} value={w.workspaceId}>
                      {w.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="rounded-md border border-border/60 bg-background/60 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-foreground">Members</p>
                <Button type="button" variant="ghost" size="sm" onClick={() => void loadMembers()} disabled={membersLoading}>
                  Refresh members
                </Button>
              </div>

              <div className="mt-3 grid gap-2 md:grid-cols-[minmax(220px,1fr)_160px_auto] md:items-end">
                <div className="space-y-1.5">
                  <Label htmlFor="workspace-admin-invite-email">Invite by email</Label>
                  <Input
                    id="workspace-admin-invite-email"
                    type="email"
                    autoComplete="off"
                    placeholder="name@company.com"
                    value={inviteEmail}
                    onChange={(event) => setInviteEmail(event.target.value)}
                    className="placeholder:text-muted-foreground/40"
                    disabled={!manageWorkspaceId}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Role</Label>
                  <Select value={inviteRole} onValueChange={(value: 'admin' | 'editor' | 'viewer') => setInviteRole(value)}>
                    <SelectTrigger disabled={!manageWorkspaceId}>
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
                    if (!manageWorkspaceId) return;
                    setMemberActionBusyUserId('invite');
                    try {
                      await inviteWorkspaceMember(manageWorkspaceId, email, inviteRole);
                      toast.success('Invite/membership updated');
                      setInviteEmail('');
                      await loadMembers();
                    } catch (error) {
                      toast.error('Could not invite member', { description: formatWorkspaceError(error) });
                    } finally {
                      setMemberActionBusyUserId(null);
                    }
                  }}
                  disabled={!manageWorkspaceId || memberActionBusyUserId === 'invite'}
                >
                  {memberActionBusyUserId === 'invite' ? 'Inviting…' : 'Invite'}
                </Button>
              </div>

              <div className="mt-3 space-y-2">
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
                            if (!manageWorkspaceId) return;
                            setMemberActionBusyUserId(`role:${member.userId}`);
                            try {
                              await updateWorkspaceMemberRole(manageWorkspaceId, member.userId, value);
                              await loadMembers();
                              await refreshWorkspaces();
                              toast.success('Member role updated');
                            } catch (error) {
                              toast.error('Could not update role', { description: formatWorkspaceError(error) });
                            } finally {
                              setMemberActionBusyUserId(null);
                            }
                          }}
                          disabled={roleBusy || !manageWorkspaceId}
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
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            disabled={!manageWorkspaceId || resettingPassword}
                            title="Reset password"
                            onClick={() => {
                              setResetPasswordValue('');
                              setResetPasswordDialogOpenForUserId(member.userId);
                            }}
                          >
                            <Key className="h-4 w-4" aria-hidden />
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={removeBusy || member.userId === currentUser?.id || !manageWorkspaceId}
                            onClick={async () => {
                              if (!manageWorkspaceId) return;
                              setMemberActionBusyUserId(`remove:${member.userId}`);
                              try {
                                await removeWorkspaceMember(manageWorkspaceId, member.userId);
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

            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3">
              <p className="text-sm font-medium text-foreground">Danger zone</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Delete the selected workspace and all associated data. Type the workspace name to confirm.
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
                <div className="space-y-1.5">
                  <Label htmlFor="confirm-workspace-delete-admin">Workspace name</Label>
                  <Input
                    id="confirm-workspace-delete-admin"
                    value={confirmWorkspaceName}
                    onChange={(event) => setConfirmWorkspaceName(event.target.value)}
                    placeholder={manageableWorkspaces.find((w) => w.workspaceId === manageWorkspaceId)?.name || 'Workspace name'}
                    autoComplete="off"
                    disabled={!manageWorkspaceId || deletingWorkspace}
                  />
                </div>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={
                    deletingWorkspace ||
                    !manageWorkspaceId ||
                    confirmWorkspaceName.trim() !== (manageableWorkspaces.find((w) => w.workspaceId === manageWorkspaceId)?.name || '')
                  }
                  onClick={() => {
                    setDeleteWorkspaceDialogOpen(true);
                  }}
                >
                  {deletingWorkspace ? 'Deleting…' : 'Delete workspace'}
                </Button>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setManageDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DraggableDialogContent>
      </Dialog>

      <Dialog
        open={resetPasswordDialogOpenForUserId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setResetPasswordDialogOpenForUserId(null);
            setResetPasswordValue('');
          }
        }}
      >
        <DraggableDialogContent className="w-[min(calc(100vw-1rem),460px)]">
          <DialogHeader>
            <DialogTitle>Reset password</DialogTitle>
            <DialogDescription>Set a new password for this member.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="workspace-reset-password">New password</Label>
            <Input
              id="workspace-reset-password"
              type="password"
              value={resetPasswordValue}
              onChange={(event) => setResetPasswordValue(event.target.value)}
              autoComplete="new-password"
            />
            <p className="text-xs text-muted-foreground">Minimum 8 characters.</p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setResetPasswordDialogOpenForUserId(null)}
              disabled={resettingPassword}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                const userId = resetPasswordDialogOpenForUserId;
                const password = resetPasswordValue.trim();
                if (!manageWorkspaceId || !userId) return;
                if (password.length < 8) {
                  toast.error('Password must be at least 8 characters.');
                  return;
                }
                setResettingPassword(true);
                void (async () => {
                  try {
                    await resetWorkspaceMemberPassword(manageWorkspaceId, userId, password);
                    toast.success('Password reset');
                    setResetPasswordDialogOpenForUserId(null);
                    setResetPasswordValue('');
                  } catch (error) {
                    toast.error('Could not reset password', { description: formatWorkspaceError(error) });
                  } finally {
                    setResettingPassword(false);
                  }
                })();
              }}
              disabled={resettingPassword || resetPasswordValue.trim().length < 8}
            >
              {resettingPassword ? 'Saving…' : 'Reset'}
            </Button>
          </DialogFooter>
        </DraggableDialogContent>
      </Dialog>

      <AlertDialog open={deleteWorkspaceDialogOpen} onOpenChange={setDeleteWorkspaceDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete workspace?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes workspace{' '}
              <strong>{manageableWorkspaces.find((w) => w.workspaceId === manageWorkspaceId)?.name ?? activeWorkspaceRow?.name ?? 'Unknown'}</strong>, all member links,
              and shared workspace data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingWorkspace}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={
                deletingWorkspace ||
                !(manageWorkspaceId || activeWorkspaceId) ||
                confirmWorkspaceName.trim() !==
                  (manageableWorkspaces.find((w) => w.workspaceId === manageWorkspaceId)?.name ||
                    activeWorkspaceRow?.name ||
                    '')
              }
              onClick={async (event) => {
                event.preventDefault();
                const targetDeleteId = manageWorkspaceId || activeWorkspaceId;
                if (!targetDeleteId) {
                  return;
                }
                setDeletingWorkspace(true);
                try {
                  const deletedWs = workspaces.find((w) => w.workspaceId === targetDeleteId);
                  await deleteWorkspace(targetDeleteId);
                  durableLogger.info('audit', 'WORKSPACE_DELETED', {
                    workspaceName: deletedWs?.name ?? targetDeleteId,
                    workspaceId: targetDeleteId,
                    performedBy: currentUser?.username || 'Unknown',
                  }, 'WorkspaceTeamTab');
                  if (activeWorkspaceId === targetDeleteId) {
                    setActiveWorkspaceId(null);
                  }
                  await refreshWorkspaces();
                  toast.success('Workspace deleted');
                  setDeleteWorkspaceDialogOpen(false);
                  window.location.reload();
                } catch (error) {
                  toast.error('Could not delete workspace', { description: formatWorkspaceError(error) });
                } finally {
                  setDeletingWorkspace(false);
                }
              }}
            >
              {deletingWorkspace ? 'Deleting…' : 'Delete workspace'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

