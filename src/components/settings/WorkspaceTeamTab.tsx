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
import { type Settings } from '@/lib/storageService';
import {
  deleteWorkspace,
  inviteWorkspaceMember,
  listWorkspaceMembers,
  removeWorkspaceMember,
  updateWorkspaceMemberRole,
  type WorkspaceMemberView,
} from '@/lib/supabase/workspaceMemberAdmin';
import {
  createWorkspaceWithSnapshot,
  setActiveWorkspaceId,
  type WorkspaceSnapshotPayload,
} from '@/lib/supabase/workspaceData';
import { formatSupabaseOrUnknownError } from '@/lib/supabase/formatSupabaseError';
import { Users } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { WorkspaceUtilitiesDialog } from '@/components/settings/WorkspaceUtilitiesDialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
  const [newName, setNewName] = React.useState('');
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
  const [utilitiesDialogOpen, setUtilitiesDialogOpen] = React.useState(false);
  const [utilitiesWorkspaceId, setUtilitiesWorkspaceId] = React.useState<string>('');
  const [utilitiesWorkspaceName, setUtilitiesWorkspaceName] = React.useState<string>('');

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

  const handleCreate = async () => {
    if (!currentUser?.id) return;
    const trimmedName = newName.trim();
    if (!trimmedName) {
      toast.error('Workspace name is required.');
      return;
    }
    const hasNameConflict = workspaces.some(
      (workspace) => workspace.name.trim().toLowerCase() === trimmedName.toLowerCase()
    );
    if (hasNameConflict) {
      toast.error('A team with that name already exists. Choose a different name.');
      return;
    }
    setBusy(true);
    try {
      const nextSnapshot: WorkspaceSnapshotPayload = {
        items: [],
        settings: {
          categories: [],
          units: [],
          locations: [],
          suppliers: [],
          projects: [],
          expenseCodes: [],
        } as Settings,
        templates: [],
        history: [],
        cabinets: [],
        financial: { expenseTypes: [], costCenters: [] },
        ui_defaults: null,
        general_settings: null,
        custom_report_definitions: [],
      };
      const id = await createWorkspaceWithSnapshot(trimmedName, nextSnapshot);
      toast.success('Workspace created');
      setActiveWorkspaceId(id);
      setUtilitiesWorkspaceId(id);
      setUtilitiesWorkspaceName(trimmedName);
      setUtilitiesDialogOpen(true);
      await refreshWorkspaces();
    } catch (e) {
      toast.error('Could not create workspace', { description: formatWorkspaceError(e) });
    } finally {
      setBusy(false);
    }
  };

  const applyWorkspaceSwitch = () => {
    if (!targetWorkspaceId) {
      toast.error('Select a workspace first.');
      return;
    }
    if (!workspaces.some((workspace) => workspace.workspaceId === targetWorkspaceId)) {
      toast.error('You can only switch to workspaces where you are already invited.');
      return;
    }
    setActiveWorkspaceId(targetWorkspaceId);
    window.location.reload();
  };

  const isWorkspaceOwner = !!activeWorkspaceId && !!currentUser?.id && activeWorkspaceRow?.ownerUserId === currentUser.id;
  const canManageMembers = !!activeWorkspaceId && (activeWorkspaceRole === 'admin' || isWorkspaceOwner);
  const canDeleteWorkspace = !!activeWorkspaceId && (activeWorkspaceRole === 'admin' || isWorkspaceOwner);
  const manageableWorkspaces = workspaces.filter((w) => w.role === 'admin' || w.ownerUserId === currentUser?.id);

  const loadMembers = React.useCallback(async () => {
    const workspaceId = manageDialogOpen ? manageWorkspaceId : activeWorkspaceId;
    const canLoad = manageDialogOpen ? manageableWorkspaces.some((w) => w.workspaceId === manageWorkspaceId) : canManageMembers;
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
  }, [activeWorkspaceId, canManageMembers, manageDialogOpen, manageWorkspaceId, manageableWorkspaces]);

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
            <p className="text-sm font-medium text-foreground">Switch workspace</p>
            <Button type="button" variant="ghost" size="sm" onClick={() => void refreshWorkspaces()}>
              Refresh list
            </Button>
          </div>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            {loading ? (
              <span className="text-xs text-muted-foreground">Loading workspaces…</span>
            ) : workspaces.length === 0 ? (
              <span className="text-xs text-muted-foreground">No workspaces yet.</span>
            ) : (
              workspaces.map((w) => (
                <Button
                  key={w.workspaceId}
                  type="button"
                  variant={targetWorkspaceId === w.workspaceId ? 'secondary' : 'outline'}
                  size="sm"
                  onClick={() => setTargetWorkspaceId(w.workspaceId)}
                  className={w.workspaceId === activeWorkspaceId ? 'ring-2 ring-primary/30' : undefined}
                  title={`Role: ${w.role}`}
                >
                  {w.name}
                </Button>
              ))
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

        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
          <div className="min-w-0 flex-1 space-y-1.5">
            <Label htmlFor="workspace-name">New workspace name</Label>
            <Input
              id="workspace-name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              autoComplete="off"
              placeholder="Team inventory"
              className="placeholder:text-muted-foreground/40"
              disabled={busy}
            />
          </div>
          <Button type="button" onClick={() => void handleCreate()} disabled={busy || !newName.trim()}>
            {busy ? 'Creating…' : 'Create workspace'}
          </Button>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            New workspaces start empty. After creation, use Workspace utilities to apply starter defaults if needed.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              if (!activeWorkspaceId || !activeWorkspaceRow) {
                toast.error('Select an active workspace first.');
                return;
              }
              setUtilitiesWorkspaceId(activeWorkspaceId);
              setUtilitiesWorkspaceName(activeWorkspaceRow.name);
              setUtilitiesDialogOpen(true);
            }}
            disabled={!activeWorkspaceId}
          >
            Workspace utilities
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

      <WorkspaceUtilitiesDialog
        open={utilitiesDialogOpen}
        workspaceId={utilitiesWorkspaceId}
        workspaceName={utilitiesWorkspaceName || 'Workspace'}
        onClose={() => setUtilitiesDialogOpen(false)}
        onApplied={async () => {
          if (currentUser?.id) {
            await bootstrapCloudData(currentUser.id);
          }
          window.location.reload();
        }}
      />

      <Dialog open={manageDialogOpen} onOpenChange={setManageDialogOpen}>
        <DialogContent className="max-w-3xl">
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
                        <div className="flex items-center justify-end">
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
        </DialogContent>
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
                  await deleteWorkspace(targetDeleteId);
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
