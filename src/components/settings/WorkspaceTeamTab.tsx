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
import { createWorkspaceWithSnapshot, type WorkspaceSnapshotPayload } from '@/lib/supabase/workspaceData';
import { Users } from 'lucide-react';

/**
 * Settings → Data management: switch between personal cloud row and shared workspace payload.
 */
export function WorkspaceTeamTab() {
  const { currentUser, authBackend } = useAuth();
  const { workspaces, activeWorkspaceId, activeWorkspaceRole, loading, refreshWorkspaces, selectPersonalData, selectWorkspace } =
    useWorkspace();
  const [newName, setNewName] = React.useState('Team inventory');
  const [busy, setBusy] = React.useState(false);

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
      const id = await createWorkspaceWithSnapshot(newName, currentUser.id, snapshot as WorkspaceSnapshotPayload);
      toast.success('Workspace created. Switching…');
      selectWorkspace(id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error('Could not create workspace', { description: msg });
    } finally {
      setBusy(false);
    }
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
                Team workspace <span className="font-mono text-xs">{activeWorkspaceId}</span>
                {activeWorkspaceRole ? ` · your role: ${activeWorkspaceRole}` : ''}
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
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Button type="button" variant={!activeWorkspaceId ? 'secondary' : 'outline'} size="sm" onClick={selectPersonalData}>
              Personal data
            </Button>
            {loading ? (
              <span className="text-xs text-muted-foreground">Loading workspaces…</span>
            ) : (
              workspaces.map((w) => (
                <Button
                  key={w.workspaceId}
                  type="button"
                  variant={activeWorkspaceId === w.workspaceId ? 'secondary' : 'outline'}
                  size="sm"
                  onClick={() => selectWorkspace(w.workspaceId)}
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
        </div>
      </CardContent>
    </Card>
  );
}
