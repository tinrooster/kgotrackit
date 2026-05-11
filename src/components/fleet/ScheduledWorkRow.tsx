import { useState } from 'react';
import { Pencil, Trash2, X, Check, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { ScheduledWorkEntry } from '@/types/fleet';
import {
  SCHEDULED_WORK_STATUS_LABELS,
  SCHEDULED_WORK_STATUS_OPTIONS,
  SCHEDULED_WORK_STATUS_BADGE_CLASSES,
} from '@/types/fleet';
import { addScheduledWork, updateScheduledWork, removeScheduledWork } from '@/lib/fleetService';

const COMMON_VENDORS = [
  'Smog Shop',
  'Serramonte Ford',
  'IT',
  'Joe truck tech',
  'Dejero RMA',
];

interface ScheduledWorkRowProps {
  vehicleId: string;
  entry: ScheduledWorkEntry;
  canMutate: boolean;
}

export function ScheduledWorkRow({ vehicleId, entry, canMutate }: ScheduledWorkRowProps) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ ...entry });

  const startEdit = () => {
    setForm({ ...entry });
    setEditing(true);
  };

  const handleSave = () => {
    const task = form.task.trim();
    if (!task) return;
    updateScheduledWork(vehicleId, { ...form, task });
    setEditing(false);
  };

  const handleDelete = () => {
    removeScheduledWork(vehicleId, entry.id);
  };

  const isActive = entry.status === 'scheduled' || entry.status === 'in_progress';

  if (editing) {
    return (
      <div className="rounded-lg border border-primary/30 bg-muted/30 p-3 space-y-3">
        <div className="space-y-1">
          <Label className="text-xs">Task *</Label>
          <Input
            className="h-8 text-xs"
            placeholder="Oil change, brake inspection…"
            value={form.task}
            onChange={(e) => setForm((f) => ({ ...f, task: e.target.value }))}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Vendor</Label>
            <Input
              className="h-8 text-xs"
              list="vendor-suggestions"
              placeholder="Smog Shop, IT…"
              value={form.vendor ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, vendor: e.target.value || undefined }))}
            />
            <datalist id="vendor-suggestions">
              {COMMON_VENDORS.map((v) => <option key={v} value={v} />)}
            </datalist>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Status</Label>
            <Select
              value={form.status}
              onValueChange={(v) => setForm((f) => ({ ...f, status: v as ScheduledWorkEntry['status'] }))}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SCHEDULED_WORK_STATUS_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value} className="text-xs">
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Scheduled for</Label>
            <Input
              type="date"
              className="h-8 text-xs"
              value={form.scheduledFor.slice(0, 10)}
              onChange={(e) => setForm((f) => ({ ...f, scheduledFor: e.target.value ? `${e.target.value}T00:00:00.000Z` : f.scheduledFor }))}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Expected return</Label>
            <Input
              type="date"
              className="h-8 text-xs"
              value={form.expectedReturn?.slice(0, 10) ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, expectedReturn: e.target.value ? `${e.target.value}T00:00:00.000Z` : undefined }))}
            />
          </div>
        </div>

        <label className="flex items-center gap-2 text-xs cursor-pointer">
          <Checkbox
            checked={form.takesOffline}
            onCheckedChange={(c) => setForm((f) => ({ ...f, takesOffline: !!c }))}
          />
          Takes vehicle offline (auto-sets status to In Shop while active)
        </label>

        <div className="space-y-1">
          <Label className="text-xs">Notes</Label>
          <Textarea
            className="text-xs"
            rows={2}
            value={form.notes ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value || undefined }))}
          />
        </div>

        <div className="flex justify-end gap-2">
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditing(false)}>
            <X className="mr-1 h-3 w-3" />
            Cancel
          </Button>
          <Button size="sm" className="h-7 text-xs" onClick={handleSave} disabled={!form.task.trim()}>
            <Check className="mr-1 h-3 w-3" />
            Save
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('flex items-start gap-2 rounded-md px-2 py-2 hover:bg-muted/40 group', !isActive && 'opacity-60')}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium">{entry.task}</span>
          <span
            className={cn(
              'rounded-full border px-1.5 py-0 text-[10px] font-semibold uppercase tracking-wide',
              SCHEDULED_WORK_STATUS_BADGE_CLASSES[entry.status],
            )}
          >
            {SCHEDULED_WORK_STATUS_LABELS[entry.status]}
          </span>
          {entry.takesOffline && isActive && (
            <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-1.5 py-0 text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
              Offline
            </span>
          )}
        </div>
        <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
          {entry.vendor && <span>{entry.vendor}</span>}
          <span>{new Date(entry.scheduledFor).toLocaleDateString()}</span>
          {entry.expectedReturn && (
            <span>→ {new Date(entry.expectedReturn).toLocaleDateString()}</span>
          )}
        </div>
        {entry.notes && (
          <p className="mt-0.5 text-xs text-muted-foreground/70 line-clamp-1">{entry.notes}</p>
        )}
      </div>

      {canMutate && (
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={startEdit}>
            <Pencil className="h-3 w-3" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6 text-destructive hover:text-destructive"
            onClick={handleDelete}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      )}
    </div>
  );
}

export function ScheduledWorkRowSkeleton({ vehicleId, canMutate, onDone }: {
  vehicleId: string;
  canMutate: boolean;
  onDone: () => void;
}) {
  const now = new Date().toISOString();
  const [form, setForm] = useState<Omit<ScheduledWorkEntry, 'id'>>({
    task: '',
    vendor: undefined,
    scheduledFor: now.slice(0, 10) + 'T00:00:00.000Z',
    expectedReturn: undefined,
    status: 'scheduled',
    takesOffline: false,
    notes: undefined,
  });

  const handleSave = () => {
    const task = form.task.trim();
    if (!task) return;
    addScheduledWork(vehicleId, { ...form, task, id: crypto.randomUUID() });
    onDone();
  };

  if (!canMutate) return null;

  return (
    <div className="rounded-lg border border-primary/30 bg-muted/30 p-3 space-y-3">
      <div className="space-y-1">
        <Label className="text-xs">Task *</Label>
        <Input
          className="h-8 text-xs"
          placeholder="Oil change, brake inspection…"
          autoFocus
          value={form.task}
          onChange={(e) => setForm((f) => ({ ...f, task: e.target.value }))}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Vendor</Label>
          <Input
            className="h-8 text-xs"
            list="vendor-suggestions-new"
            placeholder="Smog Shop, IT…"
            value={form.vendor ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, vendor: e.target.value || undefined }))}
          />
          <datalist id="vendor-suggestions-new">
            {COMMON_VENDORS.map((v) => <option key={v} value={v} />)}
          </datalist>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Scheduled for</Label>
          <Input
            type="date"
            className="h-8 text-xs"
            value={form.scheduledFor.slice(0, 10)}
            onChange={(e) => setForm((f) => ({ ...f, scheduledFor: e.target.value ? `${e.target.value}T00:00:00.000Z` : f.scheduledFor }))}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Expected return</Label>
          <Input
            type="date"
            className="h-8 text-xs"
            value={form.expectedReturn?.slice(0, 10) ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, expectedReturn: e.target.value ? `${e.target.value}T00:00:00.000Z` : undefined }))}
          />
        </div>
        <div className="flex items-end pb-1">
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <Checkbox
              checked={form.takesOffline}
              onCheckedChange={(c) => setForm((f) => ({ ...f, takesOffline: !!c }))}
            />
            Takes offline
          </label>
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onDone}>
          <X className="mr-1 h-3 w-3" />
          Cancel
        </Button>
        <Button size="sm" className="h-7 text-xs" onClick={handleSave} disabled={!form.task.trim()}>
          <Wrench className="mr-1 h-3 w-3" />
          Add
        </Button>
      </div>
    </div>
  );
}
