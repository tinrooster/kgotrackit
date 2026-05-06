import { useMemo, useState } from 'react';
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
import { SetupDefaultsChoice } from '@/lib/dummyData';

interface InitialDefaultsDialogProps {
  open: boolean;
  onApply: (choice: SetupDefaultsChoice, includeSampleInventory: boolean) => void;
}

export function InitialDefaultsDialog({ open, onApply }: InitialDefaultsDialogProps) {
  const [choice, setChoice] = useState<SetupDefaultsChoice>('blank');
  const [includeSampleInventory, setIncludeSampleInventory] = useState(false);

  const starterSummary = useMemo(
    () =>
      includeSampleInventory
        ? 'Starter lists and sample inventory rows will be created.'
        : 'Starter lookup lists will be created. Inventory remains empty.',
    [includeSampleInventory],
  );

  return (
    <Dialog open={open}>
      <DialogContent className="sm:max-w-xl">
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

        <DialogFooter>
          <Button onClick={() => onApply(choice, choice === 'starter' ? includeSampleInventory : false)}>
            Apply setup
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
