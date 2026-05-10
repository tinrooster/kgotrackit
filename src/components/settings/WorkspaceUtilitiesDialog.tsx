import * as React from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { DraggableDialogContent } from '@/components/ui/draggable-dialog';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
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
import { toast } from 'sonner';
import { DUMMY_INVENTORY_DATA, INITIAL_SETTINGS } from '@/lib/dummyData';
import { STORAGE_KEYS, type Settings } from '@/lib/storageService';
import { pushWorkspaceSnapshot, type WorkspaceSnapshotPayload } from '@/lib/supabase/workspaceData';
import {
  populateDemoData,
  stripDemoData,
  summarizeDemoPresence,
  type DemoPresenceSummary,
  type StripDemoDataResult,
} from '@/lib/demoSeed';

type WorkspaceDefaultsChoice = 'blank' | 'starter';

interface WorkspaceUtilitiesDialogProps {
  open: boolean;
  workspaceId: string;
  workspaceName: string;
  onClose: () => void;
  onApplied?: () => void;
}

const cloneJson = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

interface DemoPopulateScopes {
  lookupLists: boolean;
  inventory: boolean;
  productions: boolean;
  onAirTemplate: boolean;
}

const DEFAULT_POPULATE_SCOPES: DemoPopulateScopes = {
  lookupLists: true,
  inventory: true,
  productions: false,
  onAirTemplate: true,
};

function describeStripResult(result: StripDemoDataResult): string {
  const parts: string[] = [];
  if (result.inventoryRemoved > 0) parts.push(`${result.inventoryRemoved} item${result.inventoryRemoved === 1 ? '' : 's'}`);
  if (result.productionsRemoved > 0) parts.push(`${result.productionsRemoved} production${result.productionsRemoved === 1 ? '' : 's'}`);
  if (result.crewContactsRemoved > 0) parts.push(`${result.crewContactsRemoved} contact${result.crewContactsRemoved === 1 ? '' : 's'}`);
  if (result.positionTemplatesRemoved > 0) parts.push(`${result.positionTemplatesRemoved} position template${result.positionTemplatesRemoved === 1 ? '' : 's'}`);
  const lookupTotal =
    result.lookupListsRemoved.categories +
    result.lookupListsRemoved.units +
    result.lookupListsRemoved.locations +
    result.lookupListsRemoved.suppliers +
    result.lookupListsRemoved.projects;
  if (lookupTotal > 0) parts.push(`${lookupTotal} lookup-list value${lookupTotal === 1 ? '' : 's'}`);
  if (result.onAirTemplateReverted) parts.push('the ON-AIR template');

  let main = parts.length > 0 ? `Removed ${parts.join(', ')}.` : 'No demo content was removed.';
  const kept: string[] = [];
  if (result.inventoryKeptModified > 0) kept.push(`${result.inventoryKeptModified} edited item${result.inventoryKeptModified === 1 ? '' : 's'}`);
  if (result.productionsKeptModified > 0) kept.push(`${result.productionsKeptModified} edited production${result.productionsKeptModified === 1 ? '' : 's'}`);
  if (result.productionsKeptDueToActivity > 0) kept.push(`${result.productionsKeptDueToActivity} production${result.productionsKeptDueToActivity === 1 ? '' : 's'} with checkout activity`);
  if (result.crewContactsKeptModified > 0) kept.push(`${result.crewContactsKeptModified} edited contact${result.crewContactsKeptModified === 1 ? '' : 's'}`);
  if (result.positionTemplatesKeptModified > 0) kept.push(`${result.positionTemplatesKeptModified} edited template${result.positionTemplatesKeptModified === 1 ? '' : 's'}`);
  if (kept.length > 0) {
    main += ` Kept ${kept.join(', ')}.`;
  }
  return main;
}

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

  const [demoSummary, setDemoSummary] = React.useState<DemoPresenceSummary | null>(null);
  const [populateScopes, setPopulateScopes] = React.useState<DemoPopulateScopes>(DEFAULT_POPULATE_SCOPES);
  const [populateBusy, setPopulateBusy] = React.useState(false);
  const [stripBusy, setStripBusy] = React.useState(false);
  const [confirmStripAllOpen, setConfirmStripAllOpen] = React.useState(false);
  const [confirmApplyDefaultsOpen, setConfirmApplyDefaultsOpen] = React.useState(false);
  const [confirmPopulateDemoOpen, setConfirmPopulateDemoOpen] = React.useState(false);
  const [confirmStripUnmodifiedOpen, setConfirmStripUnmodifiedOpen] = React.useState(false);

  const refreshDemoSummary = React.useCallback(() => {
    setDemoSummary(summarizeDemoPresence());
  }, []);

  React.useEffect(() => {
    if (!open) return;
    setChoice('blank');
    setIncludeSampleInventory(false);
    setBusy(false);
    setPopulateScopes(DEFAULT_POPULATE_SCOPES);
    setPopulateBusy(false);
    setStripBusy(false);
    setConfirmStripAllOpen(false);
    setConfirmApplyDefaultsOpen(false);
    setConfirmPopulateDemoOpen(false);
    setConfirmStripUnmodifiedOpen(false);
    refreshDemoSummary();
  }, [open, refreshDemoSummary]);

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

  const handlePopulateDemo = async (): Promise<void> => {
    if (!populateScopes.lookupLists && !populateScopes.inventory && !populateScopes.productions && !populateScopes.onAirTemplate) {
      toast.error('Select at least one demo data scope to populate.');
      return;
    }
    setPopulateBusy(true);
    try {
      const result = populateDemoData(populateScopes);
      const summaryParts: string[] = [];
      if (result.lookupListsApplied) summaryParts.push('lookup lists');
      if (result.inventoryAdded > 0) summaryParts.push(`${result.inventoryAdded} inventory item${result.inventoryAdded === 1 ? '' : 's'}`);
      if (result.productionsAdded > 0) summaryParts.push(`${result.productionsAdded} production${result.productionsAdded === 1 ? '' : 's'}`);
      if (result.crewContactsAdded > 0) summaryParts.push(`${result.crewContactsAdded} crew contact${result.crewContactsAdded === 1 ? '' : 's'}`);
      if (result.positionTemplatesAdded > 0) summaryParts.push(`${result.positionTemplatesAdded} position template${result.positionTemplatesAdded === 1 ? '' : 's'}`);
      if (result.onAirTemplateApplied) summaryParts.push('ON-AIR template');
      toast.success('Demo data populated', {
        description: summaryParts.length > 0 ? `Added ${summaryParts.join(', ')}.` : 'Nothing new to add.',
      });
      refreshDemoSummary();
      onApplied?.();
    } catch (error) {
      toast.error('Could not populate demo data', {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setPopulateBusy(false);
    }
  };

  const handleStripUnmodified = async (): Promise<void> => {
    setStripBusy(true);
    try {
      const result = stripDemoData('unmodified');
      toast.success('Stripped unmodified demo data', {
        description: describeStripResult(result),
      });
      refreshDemoSummary();
      onApplied?.();
    } catch (error) {
      toast.error('Could not strip demo data', {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setStripBusy(false);
    }
  };

  const handleStripAll = async (): Promise<void> => {
    setConfirmStripAllOpen(false);
    setStripBusy(true);
    try {
      const result = stripDemoData('all');
      toast.success('Stripped ALL demo data', {
        description: describeStripResult(result),
      });
      refreshDemoSummary();
      onApplied?.();
    } catch (error) {
      toast.error('Could not strip demo data', {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setStripBusy(false);
    }
  };

  const handleNavigateToDataManagement = (): void => {
    try {
      const currentUrl = new URL(window.location.href);
      currentUrl.searchParams.set('st', 'data');
      window.history.pushState({}, '', currentUrl.toString());
      window.dispatchEvent(new PopStateEvent('popstate'));
      onClose();
    } catch {
      // Fallback for malformed URL environments.
      window.location.assign('/settings?st=data');
    }
  };

  const totalDemoEntities = demoSummary
    ? demoSummary.inventory + demoSummary.productions + demoSummary.crewContacts + demoSummary.positionTemplates
    : 0;
  const hasDemoContent = totalDemoEntities > 0 || (demoSummary?.hasManifest ?? false);

  return (
    <>
      <Dialog open={open} onOpenChange={(nextOpen) => (!nextOpen ? onClose() : undefined)}>
        <DraggableDialogContent className="w-[min(calc(100vw-1rem),640px)] max-h-[calc(100vh-2rem)] overflow-y-auto">
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
            <Button onClick={() => setConfirmApplyDefaultsOpen(true)} disabled={busy}>
              {busy ? 'Applying…' : 'Apply'}
            </Button>
          </DialogFooter>

          <Separator className="my-2" />

          {/* ----- Demo data section ----- */}
          <section aria-labelledby="ws-utils-demo-data" className="space-y-3">
            <div className="flex items-baseline justify-between gap-3">
              <h3 id="ws-utils-demo-data" className="text-sm font-semibold">
                Demo data
              </h3>
              {demoSummary && (
                <span className="text-xs text-muted-foreground">
                  {totalDemoEntities === 0
                    ? 'No demo entities present.'
                    : `${totalDemoEntities} demo entit${totalDemoEntities === 1 ? 'y' : 'ies'} present.`}
                </span>
              )}
            </div>

            {demoSummary && totalDemoEntities > 0 && (
              <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
                  <span>Inventory:</span>
                  <span className="text-right">{demoSummary.inventory}</span>
                  <span>Productions:</span>
                  <span className="text-right">{demoSummary.productions}</span>
                  <span>Crew contacts:</span>
                  <span className="text-right">{demoSummary.crewContacts}</span>
                  <span>Position templates:</span>
                  <span className="text-right">{demoSummary.positionTemplates}</span>
                </div>
              </div>
            )}

            <div className="rounded-md border p-3 space-y-2">
              <Label className="text-sm">Populate demo data</Label>
              <div className="space-y-1 text-sm">
                <label className="flex items-center gap-2">
                  <Checkbox
                    checked={populateScopes.lookupLists}
                    onCheckedChange={(checked) =>
                      setPopulateScopes((prev) => ({ ...prev, lookupLists: Boolean(checked) }))
                    }
                    disabled={populateBusy || stripBusy}
                  />
                  Lookup lists (categories, units, locations, suppliers, projects)
                </label>
                <label className="flex items-center gap-2">
                  <Checkbox
                    checked={populateScopes.inventory}
                    onCheckedChange={(checked) =>
                      setPopulateScopes((prev) => ({ ...prev, inventory: Boolean(checked) }))
                    }
                    disabled={populateBusy || stripBusy}
                  />
                  Sample inventory items
                </label>
                <label className="flex items-center gap-2">
                  <Checkbox
                    checked={populateScopes.productions}
                    onCheckedChange={(checked) =>
                      setPopulateScopes((prev) => ({ ...prev, productions: Boolean(checked) }))
                    }
                    disabled={populateBusy || stripBusy}
                  />
                  Productions, crew contacts, and position templates
                </label>
                <label className="flex items-center gap-2">
                  <Checkbox
                    checked={populateScopes.onAirTemplate}
                    onCheckedChange={(checked) =>
                      setPopulateScopes((prev) => ({ ...prev, onAirTemplate: Boolean(checked) }))
                    }
                    disabled={populateBusy || stripBusy}
                  />
                  Maintenance ON-AIR template
                </label>
              </div>
              <p className="text-xs text-muted-foreground">
                Each row gets a hidden marker so you can later strip demo content without losing your real data. Re-running this is safe — it merges by ID.
              </p>
              <div>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setConfirmPopulateDemoOpen(true)}
                  disabled={populateBusy || stripBusy}
                >
                  {populateBusy ? 'Populating…' : 'Populate demo data'}
                </Button>
              </div>
            </div>

            <div className="rounded-md border p-3 space-y-2">
              <Label className="text-sm">Data files & contact imports</Label>
              <p className="text-xs text-muted-foreground">
                Open Data Management to import organization JSON bundles or review import/export files.
              </p>
              <div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleNavigateToDataManagement}
                >
                  Open Data Management
                </Button>
              </div>
            </div>

            <div className="rounded-md border p-3 space-y-2">
              <Label className="text-sm">Strip demo data</Label>
              <p className="text-xs text-muted-foreground">
                Removes content marked as demo. <strong>Unmodified only</strong> preserves anything edited by users (and any demo production with checkout activity). <strong>All demo</strong> drops every demo-marked entity, even if edited.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setConfirmStripUnmodifiedOpen(true)}
                  disabled={populateBusy || stripBusy || !hasDemoContent}
                >
                  {stripBusy ? 'Working…' : 'Strip unmodified demo data'}
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => setConfirmStripAllOpen(true)}
                  disabled={populateBusy || stripBusy || !hasDemoContent}
                >
                  Strip ALL demo data
                </Button>
              </div>
            </div>
          </section>
        </DraggableDialogContent>
      </Dialog>

      <AlertDialog open={confirmApplyDefaultsOpen} onOpenChange={setConfirmApplyDefaultsOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace workspace data with these defaults?</AlertDialogTitle>
            <AlertDialogDescription>
              This uploads a fresh snapshot for <span className="font-medium text-foreground">{workspaceName}</span>:
              lookup lists and inventory follow your choice (empty or starter). Existing cloud workspace content for items,
              templates, settings in this snapshot path will be overwritten. This cannot be undone from here—use backups if
              you need to recover prior data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void applyDefaults()} disabled={busy}>
              {busy ? 'Applying…' : 'Apply defaults'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmPopulateDemoOpen} onOpenChange={setConfirmPopulateDemoOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Add demo data?</AlertDialogTitle>
            <AlertDialogDescription>
              Demo rows will be merged into this workspace with demo markers so they can be stripped later. If you
              already have demo content, re-running may skip duplicates. Confirm the scopes you selected above before
              continuing.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={populateBusy}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handlePopulateDemo()} disabled={populateBusy}>
              {populateBusy ? 'Populating…' : 'Populate demo data'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmStripUnmodifiedOpen} onOpenChange={setConfirmStripUnmodifiedOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Strip unmodified demo data?</AlertDialogTitle>
            <AlertDialogDescription>
              Removes demo-marked rows that have not been edited. Modified demo rows and productions with checkout
              activity are kept. This is safer than “strip all” but still permanently removes matching demo entities.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={stripBusy}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleStripUnmodified()} disabled={stripBusy}>
              {stripBusy ? 'Working…' : 'Strip unmodified'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmStripAllOpen} onOpenChange={setConfirmStripAllOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove all demo data?</AlertDialogTitle>
            <AlertDialogDescription>
              This drops every entity flagged as demo seed in this workspace, including any rows you have edited. Real data without the demo marker is left untouched. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={stripBusy}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleStripAll()} disabled={stripBusy}>
              {stripBusy ? 'Working…' : 'Remove all demo data'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
