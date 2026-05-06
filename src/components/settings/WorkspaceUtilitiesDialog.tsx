import * as React from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { DUMMY_INVENTORY_DATA, INITIAL_SETTINGS } from '@/lib/dummyData';
import { STORAGE_KEYS, type Settings } from '@/lib/storageService';
import { pushWorkspaceSnapshot, type WorkspaceSnapshotPayload } from '@/lib/supabase/workspaceData';

type WorkspaceDefaultsChoice = 'blank' | 'starter';

interface WorkspaceUtilitiesDialogProps {
  open: boolean;
  workspaceId: string;
  workspaceName: string;
  onClose: () => void;
  onApplied?: () => void;
}

const cloneJson = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export function WorkspaceUtilitiesDialog({
  open,
  workspaceId,
  workspaceName,
  onClose,
  onApplied,
}: WorkspaceUtilitiesDialogProps) {
  const [choice, setChoice] = React.useState<WorkspaceDefaultsChoice>('blank');
  const [includeSampleInventory, setIncludeSampleInventory] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setChoice('blank');
    setIncludeSampleInventory(false);
    setBusy(false);
  }, [open]);

  const applyDefaults = async (): Promise<void> => {
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
                  item.expectedDeliveryDate instanceof Date ? item.expectedDeliveryDate.toISOString() : item.expectedDeliveryDate,
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

      await pushWorkspaceSnapshot(workspaceId, snapshot);
      toast.success('Workspace defaults applied');
      onApplied?.();
      onClose();
    } catch (error) {
      toast.error('Could not apply workspace defaults', {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => (!nextOpen ? onClose() : undefined)}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Workspace utilities</DialogTitle>
          <DialogDescription>
            Configure defaults for <span className="font-medium text-foreground">{workspaceName}</span>.
          </DialogDescription>
        </DialogHeader>

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

        <div className="rounded-md border p-3">
          <Label className="text-sm">Optional</Label>
          <label className="mt-2 flex items-center gap-2 text-sm">
            <Checkbox
              checked={includeSampleInventory}
              onCheckedChange={(checked) => setIncludeSampleInventory(Boolean(checked))}
              disabled={busy || choice !== 'starter'}
            />
            Include sample inventory items (test data)
          </label>
          <p className="mt-2 text-xs text-muted-foreground">
            {choice === 'blank'
              ? 'Empty workspace selected.'
              : includeSampleInventory
                ? 'Starter lists and sample inventory rows will be created.'
                : 'Starter lists will be created. Inventory stays empty.'}
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Close
          </Button>
          <Button onClick={() => void applyDefaults()} disabled={busy}>
            {busy ? 'Applying…' : 'Apply'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

