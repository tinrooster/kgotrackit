import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { WorkspaceUtilitiesDialog } from '@/components/settings/WorkspaceUtilitiesDialog';
import {
  promoteProductionCrewToDirectory,
  type PromoteProductionCrewResult,
} from '@/lib/crewDirectoryMigration';

export default function UiDiagnosticsPage() {
  const { activeWorkspaceId, workspaces } = useWorkspace();
  const activeWorkspaceName = activeWorkspaceId
    ? workspaces.find((workspace) => workspace.workspaceId === activeWorkspaceId)?.name ?? null
    : null;
  const [migrationBusy, setMigrationBusy] = useState(false);
  const [lastMigrationResult, setLastMigrationResult] =
    useState<PromoteProductionCrewResult | null>(null);
  const [workspaceUtilitiesOpen, setWorkspaceUtilitiesOpen] = useState(false);

  const handlePromoteCrew = (): void => {
    setMigrationBusy(true);
    try {
      const result = promoteProductionCrewToDirectory();
      setLastMigrationResult(result);
      toast.success('Production crew migration completed.', {
        description:
          result.addedContacts > 0
            ? `Added ${result.addedContacts} contact${result.addedContacts === 1 ? '' : 's'} to the Master Crew Directory.`
            : 'No new contacts were added.',
      });
    } catch (error) {
      toast.error('Could not migrate production crew.', {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setMigrationBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <h1 className="text-2xl font-bold">UI Diagnostics</h1>
      <p className="text-sm text-muted-foreground">
        Developer-only workspace for visual checks and interaction diagnostics.
      </p>

      <Card>
        <CardHeader>
          <CardTitle>Status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>Diagnostics page is enabled and routed.</p>
          <p className="text-muted-foreground">
            Add targeted checks here as needed (focus rings, contrast, spacing, mobile touch targets, and modal layering).
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Data Migration Utilities</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            Promote assigned production crew members into the Master Crew Directory.
            Existing contacts are preserved and duplicate names/contact IDs are skipped.
          </p>
          <div>
            <Button onClick={handlePromoteCrew} disabled={migrationBusy} className="mr-2">
              {migrationBusy ? 'Migrating…' : 'Promote Production Crew to Master Directory'}
            </Button>
            <Button
              variant="outline"
              onClick={() => setWorkspaceUtilitiesOpen(true)}
              disabled={!activeWorkspaceId}
            >
              Open Workspace Utilities
            </Button>
          </div>
          {!activeWorkspaceId ? (
            <p className="text-xs text-muted-foreground">
              Select an active team workspace to open Workspace Utilities.
            </p>
          ) : null}
          {lastMigrationResult ? (
            <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              <p>
                Scanned: {lastMigrationResult.scannedCrewMembers} crew member
                {lastMigrationResult.scannedCrewMembers === 1 ? '' : 's'}
              </p>
              <p>
                Added: {lastMigrationResult.addedContacts} contact
                {lastMigrationResult.addedContacts === 1 ? '' : 's'}
              </p>
              <p>
                Skipped existing: {lastMigrationResult.skippedExistingContacts}
              </p>
              <p>
                Skipped invalid: {lastMigrationResult.skippedInvalidCrewMembers}
              </p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {activeWorkspaceId ? (
        <WorkspaceUtilitiesDialog
          open={workspaceUtilitiesOpen}
          workspaceId={activeWorkspaceId}
          workspaceName={activeWorkspaceName ?? 'Active workspace'}
          onClose={() => setWorkspaceUtilitiesOpen(false)}
          onApplied={() => void 0}
        />
      ) : null}
    </div>
  );
}

