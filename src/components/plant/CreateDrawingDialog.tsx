import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { createDrawing } from '@/lib/plantService';
import { toast } from 'sonner';
import type { PlantDrawing, PlantDrawingSignalCategory } from '@/types/plant';

const SIGNAL_CATEGORIES: { value: PlantDrawingSignalCategory; label: string }[] = [
  { value: 'video',   label: 'Video' },
  { value: 'audio',   label: 'Audio' },
  { value: 'data',    label: 'Data' },
  { value: 'control', label: 'Control' },
  { value: 'rf',      label: 'RF' },
  { value: 'mixed',   label: 'Mixed' },
  { value: 'other',   label: 'Other' },
];

/** Compute next sequential DWG number from the loaded drawings list.
 *  Ignores dotted numbers (7.x.x family) — only considers plain integers. */
export function nextDwgNumber(drawings: PlantDrawing[]): string {
  let max = 0;
  for (const d of drawings) {
    const n = parseInt(d.dwgNumber, 10);
    if (!isNaN(n) && String(n) === d.dwgNumber.trim()) {
      max = Math.max(max, n);
    }
  }
  return max > 0 ? String(max + 1) : '';
}

interface CreateDrawingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  drawings: PlantDrawing[];           // existing list, used to suggest next number
  onCreated: (drawing: PlantDrawing) => void;
}

export function CreateDrawingDialog({
  open,
  onOpenChange,
  drawings,
  onCreated,
}: CreateDrawingDialogProps) {
  const [dwgNumber, setDwgNumber] = useState('');
  const [title, setTitle] = useState('');
  const [signalCategory, setSignalCategory] = useState<PlantDrawingSignalCategory | ''>('');
  const [saving, setSaving] = useState(false);

  // Pre-fill DWG number when dialog opens
  useEffect(() => {
    if (open) {
      setDwgNumber(nextDwgNumber(drawings));
      setTitle('');
      setSignalCategory('');
    }
  }, [open, drawings]);

  const handleCreate = async () => {
    if (!dwgNumber.trim()) return;
    setSaving(true);
    const result = await createDrawing({
      dwgNumber: dwgNumber.trim(),
      title: title.trim() || undefined,
      signalCategory: signalCategory || undefined,
    });
    if (result) {
      toast.success(`Drawing ${result.dwgNumber} created`);
      onCreated(result);
      onOpenChange(false);
    } else {
      toast.error('Failed to create drawing — number may already exist');
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New drawing</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="dwg-number">DWG number</Label>
            <Input
              id="dwg-number"
              value={dwgNumber}
              onChange={(e) => setDwgNumber(e.target.value)}
              placeholder="e.g. 22100 or 7.2.1"
              className="font-mono"
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              Sequential integers auto-suggested · Use dotted notation for 7.x.x Master Control drawings
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="dwg-title">Title <span className="text-muted-foreground">(optional)</span></Label>
            <Input
              id="dwg-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. PCR2 SDI Router Outputs"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Signal category <span className="text-muted-foreground">(optional)</span></Label>
            <Select
              value={signalCategory}
              onValueChange={(v) => setSignalCategory(v as PlantDrawingSignalCategory)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select…" />
              </SelectTrigger>
              <SelectContent>
                {SIGNAL_CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={!dwgNumber.trim() || saving}>
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
            Create drawing
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
