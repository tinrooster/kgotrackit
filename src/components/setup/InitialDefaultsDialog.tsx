import { useMemo, useState } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import {
  Dialog,
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
import { DraggableDialogContent } from '@/components/ui/draggable-dialog';
import { SetupDefaultsChoice } from '@/lib/dummyData';

interface InitialDefaultsDialogProps {
  open: boolean;
  onApply: (choice: SetupDefaultsChoice, includeSampleInventory: boolean) => void;
  onDismiss?: () => void;
}

export function InitialDefaultsDialog({ open, onApply, onDismiss }: InitialDefaultsDialogProps) {
  const [choice, setChoice] = useState<SetupDefaultsChoice>('blank');
  const [includeSampleInventory, setIncludeSampleInventory] = useState(false);
  const [confirmStarterOpen, setConfirmStarterOpen] = useState(false);

  const starterSummary = useMemo(
    () =>
      includeSampleInventory
        ? 'Starter lists and sample inventory rows will be created.'
        : 'Starter lookup lists will be created. Inventory remains empty.',
    [includeSampleInventory],
  );

  const requestApply = () => {
    if (choice === 'blank') {
      onApply('blank', false);
      return;
    }
    setConfirmStarterOpen(true);
  };

  const confirmStarterApply = () => {
    setConfirmStarterOpen(false);
    onApply('starter', includeSampleInventory);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onDismiss?.(); }}>
        <DraggableDialogContent className="w-[min(calc(100vw-1rem),560px)]">
          <DialogHeader>
            <DialogTitle>Choose setup defaults</DialogTitle>
            <DialogDescription>
              Pick how a new inventory workspace starts. This is now explicit, so new setups are never auto-populated.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3">
            <button
              type="button"
              className={`rounded-md border p-3 text-left transition-colors ${
                choice === 'blank' ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/40'
              }`}
              onClick={() => setChoice('blank')}
            >
              <div className="font-medium">Blank setup</div>
              <div className="text-sm text-muted-foreground">No starter categories, lookup lists, or sample items.</div>
            </button>

            <button
              type="button"
              className={`rounded-md border p-3 text-left transition-colors ${
                choice === 'starter' ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/40'
              }`}
              onClick={() => setChoice('starter')}
            >
              <div className="font-medium">Starter template</div>
              <div className="text-sm text-muted-foreground">Preload commonly used category and lookup list values.</div>
            </button>
          </div>

          {choice === 'starter' && (
            <div className="rounded-md border p-3">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={includeSampleInventory}
                  onCheckedChange={(checked) => setIncludeSampleInventory(Boolean(checked))}
                />
                Include sample inventory items (test data)
              </label>
              <p className="mt-2 text-xs text-muted-foreground">{starterSummary}</p>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            {onDismiss && (
              <Button variant="outline" onClick={onDismiss}>
                Use blank setup
              </Button>
            )}
            <Button type="button" onClick={requestApply}>
              {choice === 'blank' ? 'Apply blank setup' : 'Continue…'}
            </Button>
          </DialogFooter>
        </DraggableDialogContent>
      </Dialog>

      <AlertDialog open={confirmStarterOpen} onOpenChange={setConfirmStarterOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apply starter template?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>
                  Starter content is merged into your workspace with demo markers so it can be removed later (Settings →
                  Workspaces → workspace utilities → Strip demo data).
                </p>
                {includeSampleInventory ? (
                  <p className="font-medium text-foreground">
                    Sample inventory rows will be added—only continue if you intend to load test items into this
                    workspace.
                  </p>
                ) : (
                  <p>Lookup lists and ON-AIR maintenance defaults apply; inventory stays empty unless you opted in above.</p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel type="button">Back</AlertDialogCancel>
            <AlertDialogAction type="button" onClick={confirmStarterApply}>
              Apply starter template
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
