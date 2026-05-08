import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { DraggableDialogContent } from '@/components/ui/draggable-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { logger as durableLogger } from '@/lib/logging';
import { useAuth } from '@/contexts/AuthContext';
import { DUMMY_INVENTORY_DATA, INITIAL_SETTINGS, recordSetupChoiceForWorkspace } from '@/lib/dummyData';
import { STORAGE_KEYS, type Settings } from '@/lib/storageService';
import { createWorkspaceWithSnapshot, type WorkspaceSnapshotPayload } from '@/lib/supabase/workspaceData';
import { DEMO_SEED_SOURCE, DEMO_SEED_VERSION, recordManifestForWorkspace } from '@/lib/demoSeed';

type WorkspaceDefaultsChoice = 'blank' | 'starter';

interface CreateWorkspaceDialogProps {
  open: boolean;
  existingWorkspaceNames: string[];
  onClose: () => void;
  onCreated: (workspaceId: string) => void | Promise<void>;
}

const cloneJson = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export function CreateWorkspaceDialog({
  open,
  existingWorkspaceNames,
  onClose,
  onCreated,
}: CreateWorkspaceDialogProps) {
  const { currentUser } = useAuth();
  const [name, setName] = React.useState('');
  const [choice, setChoice] = React.useState<WorkspaceDefaultsChoice>('blank');
  const [includeSampleInventory, setIncludeSampleInventory] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setName('');
    setChoice('blank');
    setIncludeSampleInventory(false);
    setBusy(false);
  }, [open]);

  const createWorkspace = async (): Promise<void> => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast.error('Workspace name is required.');
      return;
    }
    const nameConflict = existingWorkspaceNames.some(
      (existing) => existing.trim().toLowerCase() === trimmedName.toLowerCase(),
    );
    if (nameConflict) {
      toast.error('A workspace with that name already exists. Choose a different name.');
      return;
    }

    setBusy(true);
    try {
      const settings: Settings =
        choice === 'starter'
          ? {
              categories: cloneJson(INITIAL_SETTINGS[STORAGE_KEYS.CATEGORIES]),
              units: cloneJson(INITIAL_SETTINGS[STORAGE_KEYS.UNITS]),
              locations: cloneJson(INITIAL_SETTINGS[STORAGE_KEYS.LOCATIONS]),
              suppliers: cloneJson(INITIAL_SETTINGS[STORAGE_KEYS.SUPPLIERS]),
              projects: cloneJson(INITIAL_SETTINGS[STORAGE_KEYS.PROJECTS]),
              expenseCodes: [],
            }
          : {
              categories: [],
              units: [],
              locations: [],
              suppliers: [],
              projects: [],
              expenseCodes: [],
            };

      const items =
        choice === 'starter' && includeSampleInventory
          ? cloneJson(
              DUMMY_INVENTORY_DATA.map((item) => ({
                ...item,
                lastUpdated: item.lastUpdated instanceof Date ? item.lastUpdated.toISOString() : item.lastUpdated,
                expectedDeliveryDate:
                  item.expectedDeliveryDate instanceof Date
                    ? item.expectedDeliveryDate.toISOString()
                    : item.expectedDeliveryDate,
              })),
            )
          : [];

      const snapshot: WorkspaceSnapshotPayload = {
        items,
        settings,
        templates: [],
        history: [],
        cabinets: [],
        financial: { expenseTypes: [], costCenters: [] },
        ui_defaults: null,
        general_settings: null,
        custom_report_definitions: [],
      };

      const workspaceId = await createWorkspaceWithSnapshot(trimmedName, snapshot);
      recordSetupChoiceForWorkspace(workspaceId, choice);

      if (choice === 'starter') {
        recordManifestForWorkspace(workspaceId, {
          version: DEMO_SEED_VERSION,
          seededAt: new Date().toISOString(),
          lookups: {
            categories: DEMO_SEED_SOURCE.lookups.categories.map((row) => row.name),
            units: DEMO_SEED_SOURCE.lookups.units.map((row) => row.name),
            locations: DEMO_SEED_SOURCE.lookups.locations.map((row) => row.name),
            suppliers: DEMO_SEED_SOURCE.lookups.suppliers.map((row) => row.name),
            projects: DEMO_SEED_SOURCE.lookups.projects.map((row) => row.name),
          },
          onAirSchedule: null,
        });
      }
      durableLogger.info('audit', 'WORKSPACE_CREATED', {
        workspaceName: trimmedName,
        workspaceId,
        defaults: choice,
        performedBy: currentUser?.username || 'Unknown',
      }, 'CreateWorkspaceDialog');
      toast.success('Workspace created');
      await onCreated(workspaceId);
      onClose();
    } catch (error) {
      toast.error('Could not create workspace', {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => (!nextOpen ? onClose() : undefined)}>
      <DraggableDialogContent className="w-[min(calc(100vw-1rem),560px)]">
        <DialogHeader>
          <DialogTitle>Create workspace</DialogTitle>
          <DialogDescription>Name the workspace and choose how it starts.</DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label htmlFor="create-workspace-name">Workspace name</Label>
          <Input
            id="create-workspace-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoComplete="off"
            placeholder="Team inventory"
            className="placeholder:text-muted-foreground/40"
            disabled={busy}
          />
        </div>

        <div className="grid gap-3">
          <button
            type="button"
            className={`rounded-md border p-3 text-left transition-colors ${
              choice === 'blank' ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/40'
            }`}
            onClick={() => setChoice('blank')}
            disabled={busy}
          >
            <div className="font-medium">Empty workspace</div>
            <div className="text-sm text-muted-foreground">No lookup lists and no inventory rows.</div>
          </button>

          <button
            type="button"
            className={`rounded-md border p-3 text-left transition-colors ${
              choice === 'starter' ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/40'
            }`}
            onClick={() => setChoice('starter')}
            disabled={busy}
          >
            <div className="font-medium">Starter defaults</div>
            <div className="text-sm text-muted-foreground">Preload common lookup lists. Inventory can stay empty.</div>
          </button>
        </div>

        {choice === 'starter' && (
          <div className="rounded-md border p-3">
            <Label className="text-sm">Optional</Label>
            <label className="mt-2 flex items-center gap-2 text-sm">
              <Checkbox
                checked={includeSampleInventory}
                onCheckedChange={(checked) => setIncludeSampleInventory(Boolean(checked))}
                disabled={busy}
              />
              Include sample inventory items (test data)
            </label>
            <p className="mt-2 text-xs text-muted-foreground">
              {includeSampleInventory
                ? 'Starter lists and sample inventory rows will be created.'
                : 'Starter lists will be created. Inventory stays empty.'}
            </p>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => void createWorkspace()} disabled={busy || !name.trim()}>
            {busy ? 'Creating…' : 'Create'}
          </Button>
        </DialogFooter>
      </DraggableDialogContent>
    </Dialog>
  );
}

