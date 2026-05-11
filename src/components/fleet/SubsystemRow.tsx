import { useState } from 'react';
import { Pencil, Trash2, ArrowRightLeft, X, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { VehicleSubsystem } from '@/types/fleet';
import {
  SUBSYSTEM_KIND_LABELS,
  SUBSYSTEM_KIND_OPTIONS,
  SUBSYSTEM_STATUS_LABELS,
  SUBSYSTEM_STATUS_OPTIONS,
  SUBSYSTEM_STATUS_BADGE_CLASSES,
} from '@/types/fleet';
import { updateSubsystem, removeSubsystem } from '@/lib/fleetService';

interface SubsystemRowProps {
  vehicleId: string;
  subsystem: VehicleSubsystem;
  canMutate: boolean;
  onLoanOut?: (subsystem: VehicleSubsystem) => void;
  onCloseLoan?: (subsystem: VehicleSubsystem) => void;
}

export function SubsystemRow({ vehicleId, subsystem, canMutate, onLoanOut, onCloseLoan }: SubsystemRowProps) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ ...subsystem });

  const startEdit = () => {
    setForm({ ...subsystem });
    setEditing(true);
  };

  const handleSave = () => {
    updateSubsystem(vehicleId, { ...form, label: form.label.trim() || SUBSYSTEM_KIND_LABELS[form.kind] });
    setEditing(false);
  };

  const handleDelete = () => {
    removeSubsystem(vehicleId, subsystem.id);
  };

  if (editing) {
    return (
      <div className="rounded-lg border border-primary/30 bg-muted/30 p-3 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Kind</Label>
            <Select
              value={form.kind}
              onValueChange={(v) =>
                setForm((f) => ({
                  ...f,
                  kind: v as VehicleSubsystem['kind'],
                  label: SUBSYSTEM_KIND_LABELS[v as VehicleSubsystem['kind']],
                }))
              }
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SUBSYSTEM_KIND_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value} className="text-xs">
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Label</Label>
            <Input
              className="h-8 text-xs"
              value={form.label}
              onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Status</Label>
            <Select
              value={form.status}
              onValueChange={(v) => setForm((f) => ({ ...f, status: v as VehicleSubsystem['status'] }))}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SUBSYSTEM_STATUS_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value} className="text-xs">
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Last checked</Label>
            <Input
              type="date"
              className="h-8 text-xs"
              value={form.lastCheckedAt?.slice(0, 10) ?? ''}
              onChange={(e) =>
                setForm((f) => ({ ...f, lastCheckedAt: e.target.value ? `${e.target.value}T00:00:00.000Z` : undefined }))
              }
            />
          </div>
        </div>

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
          <Button size="sm" className="h-7 text-xs" onClick={handleSave}>
            <Check className="mr-1 h-3 w-3" />
            Save
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2 rounded-md px-2 py-2 hover:bg-muted/40 group">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium">{subsystem.label}</span>
          <span
            className={cn(
              'rounded-full border px-1.5 py-0 text-[10px] font-semibold uppercase tracking-wide',
              SUBSYSTEM_STATUS_BADGE_CLASSES[subsystem.status],
            )}
          >
            {SUBSYSTEM_STATUS_LABELS[subsystem.status]}
          </span>
        </div>
        {subsystem.notes && (
          <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">{subsystem.notes}</p>
        )}
        {subsystem.lastCheckedAt && (
          <p className="mt-0.5 text-[10px] text-muted-foreground/60">
            Checked {new Date(subsystem.lastCheckedAt).toLocaleDateString()}
          </p>
        )}
      </div>

      {canMutate && (
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          {subsystem.status === 'loaned_out' && onCloseLoan && (
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-1.5 text-[10px] text-purple-600 dark:text-purple-400"
              onClick={() => onCloseLoan(subsystem)}
            >
              Close loan
            </Button>
          )}
          {subsystem.status !== 'loaned_out' && subsystem.status !== 'loaned_in' && onLoanOut && (
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6"
              title="Loan out"
              onClick={() => onLoanOut(subsystem)}
            >
              <ArrowRightLeft className="h-3 w-3" />
            </Button>
          )}
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
