import * as React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { isSupabaseConfigured } from '@/lib/supabase/client';
import { collectLocalSnapshot } from '@/lib/supabase/cloudData';
import {
  createWorkspaceWithSnapshot,
  setActiveWorkspaceId,
  type WorkspaceSnapshotPayload,
} from '@/lib/supabase/workspaceData';
import { formatSupabaseOrUnknownError } from '@/lib/supabase/formatSupabaseError';
import { Users } from 'lucide-react';

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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="h-4 w-4" aria-hidden />
          Team workspace
        </CardTitle>
        <CardDescription>
          Personal data lives in your <code className="rounded bg-muted px-1 text-xs">user_app_data</code> row. A team workspace uses a
          shared <code className="rounded bg-muted px-1 text-xs">workspace_app_data</code> row; members need rows in{' '}
          <code className="rounded bg-muted px-1 text-xs">workspace_members</code> (admins can add editors/viewers in the Supabase SQL
          editor — see docs).
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
      </CardContent>
    </Card>
  );
}
