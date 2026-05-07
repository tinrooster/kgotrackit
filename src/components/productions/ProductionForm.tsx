import { useState } from 'react';
import { Production, ProductionStatus, PRODUCTION_STATUS_OPTIONS } from '@/types/productions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { normalizeDateInputValue } from '@/lib/dateTimeInputs';

type ProductionDraft = {
  name: string;
  client: string;
  location: string;
  startDate: string;
  endDate: string;
  status: ProductionStatus;
  description: string;
  notes: string;
};

function toDraft(production?: Production): ProductionDraft {
  return {
    name: production?.name ?? '',
    client: production?.client ?? '',
    location: production?.location ?? '',
    startDate: production?.startDate ?? '',
    endDate: production?.endDate ?? '',
    status: production?.status ?? 'planning',
    description: production?.description ?? '',
    notes: production?.notes ?? '',
  };
}

interface ProductionFormProps {
  open: boolean;
  production?: Production;
  onSave: (data: Omit<Production, 'id' | 'createdAt' | 'updatedAt' | 'checklistGroups' | 'vehiclePacklists' | 'crew' | 'crewSchedule'>) => void;
  onClose: () => void;
}

export function ProductionForm({ open, production, onSave, onClose }: ProductionFormProps) {
  const [draft, setDraft] = useState<ProductionDraft>(() => toDraft(production));
  const isEditing = Boolean(production);

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      setDraft(toDraft(production));
      onClose();
    }
  };

  const handleSave = () => {
    if (!draft.name.trim()) return;
    onSave({
      name: draft.name.trim(),
      client: draft.client.trim() || undefined,
      location: draft.location.trim() || undefined,
      startDate: normalizeDateInputValue(draft.startDate) || undefined,
      endDate: normalizeDateInputValue(draft.endDate) || undefined,
      status: draft.status,
      description: draft.description.trim() || undefined,
      notes: draft.notes.trim() || undefined,
    });
    onClose();
  };

  const field = <K extends keyof ProductionDraft>(key: K) => ({
    value: draft[key] as string,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setDraft((prev) => ({ ...prev, [key]: e.target.value })),
  });

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Production' : 'New Production'}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="prod-name">
              Name <span className="text-destructive">*</span>
            </Label>
            <Input id="prod-name" placeholder="Production name" {...field('name')} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="prod-client">Client</Label>
              <Input id="prod-client" placeholder="Client / project" {...field('client')} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="prod-status">Status</Label>
              <Select
                value={draft.status}
                onValueChange={(v) => setDraft((prev) => ({ ...prev, status: v as ProductionStatus }))}
              >
                <SelectTrigger id="prod-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRODUCTION_STATUS_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="prod-location">Location / venue</Label>
            <Input id="prod-location" placeholder="Location or venue" {...field('location')} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="prod-start">Start date</Label>
              <Input id="prod-start" type="date" {...field('startDate')} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="prod-end">End date</Label>
              <Input id="prod-end" type="date" {...field('endDate')} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="prod-desc">Description</Label>
            <Textarea id="prod-desc" rows={2} placeholder="Brief description..." {...field('description')} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="prod-notes">Notes</Label>
            <Textarea id="prod-notes" rows={2} placeholder="Additional notes..." {...field('notes')} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!draft.name.trim()}>
            {isEditing ? 'Save Changes' : 'Create Production'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
