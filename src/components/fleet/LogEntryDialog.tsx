import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
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
import { toast } from 'sonner';
import type { FleetVehicle, LogCategory } from '@/types/fleet';
import { LOG_CATEGORY_OPTIONS } from '@/types/fleet';
import { appendLogEntry } from '@/lib/fleetLogService';

interface LogEntryDialogProps {
  open: boolean;
  vehicles: FleetVehicle[];
  defaultVehicleIds?: string[];
  onClose: () => void;
  onSaved: () => void;
}

export function LogEntryDialog({
  open,
  vehicles,
  defaultVehicleIds = [],
  onClose,
  onSaved,
}: LogEntryDialogProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>(defaultVehicleIds);
  const [category, setCategory] = useState<LogCategory>('info');
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);

  const toggleVehicle = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id],
    );
  };

  const reset = () => {
    setSelectedIds(defaultVehicleIds);
    setCategory('info');
    setBody('');
  };

  const handleSave = async () => {
    const trimmed = body.trim();
    if (!trimmed) return;
    setSaving(true);
    const result = await appendLogEntry({
      vehicleIds: selectedIds,
      category,
      body: trimmed,
    });
    setSaving(false);
    if (result) {
      toast.success('Log entry added');
      reset();
      onSaved();
      onClose();
    } else {
      toast.error('Could not save log entry — check Supabase connection');
    }
  };

  const handleOpenChange = (o: boolean) => {
    if (!o) { reset(); onClose(); }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add log entry</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Vehicle multi-select */}
          {vehicles.length > 0 && (
            <div className="space-y-2">
              <Label>Vehicles</Label>
              <div className="grid grid-cols-3 gap-x-4 gap-y-1.5 max-h-36 overflow-y-auto rounded-md border p-2 sm:grid-cols-4">
                {vehicles.map((v) => (
                  <label key={v.id} className="flex items-center gap-1.5 text-xs cursor-pointer">
                    <Checkbox
                      checked={selectedIds.includes(v.id)}
                      onCheckedChange={() => toggleVehicle(v.id)}
                    />
                    <span className="font-medium">{v.code}</span>
                  </label>
                ))}
              </div>
              {selectedIds.length === 0 && (
                <p className="text-[10px] text-muted-foreground">No vehicle selected — entry will appear in fleet-wide log only.</p>
              )}
            </div>
          )}

          {/* Category */}
          <div className="space-y-1.5">
            <Label>Category</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as LogCategory)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LOG_CATEGORY_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Body */}
          <div className="space-y-1.5">
            <Label htmlFor="log-body">Update *</Label>
            <Textarea
              id="log-body"
              rows={4}
              placeholder="M18 Tahoe — at Smog Shop. Expect it out all week…"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              autoFocus
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onClose(); }}>Cancel</Button>
          <Button onClick={handleSave} disabled={!body.trim() || saving}>
            {saving ? 'Saving…' : 'Add entry'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
