import { useState } from 'react';
import { Pencil, Trash2, Check, X, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Combobox, ComboboxOption } from '@/components/ui/combobox';
import { cn } from '@/lib/utils';
import type { VehicleAssignment } from '@/types/fleet';
import { addAssignment, updateAssignment, removeAssignment } from '@/lib/fleetService';
import type { CrewContact } from '@/types/crewContacts';

const ROLE_LABELS: Record<VehicleAssignment['role'], string> = {
  photographer: 'Photographer',
  reporter: 'Reporter',
  operator: 'Operator',
};

interface AssignmentRowProps {
  vehicleId: string;
  assignment: VehicleAssignment;
  contacts: CrewContact[];
  canMutate?: boolean;
}

export function AssignmentRow({ vehicleId, assignment, contacts, canMutate }: AssignmentRowProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<VehicleAssignment>(assignment);

  const contactOptions: ComboboxOption[] = contacts.map((c) => ({
    value: c.id,
    label: c.fullName,
  }));

  const contactName = contacts.find((c) => c.id === assignment.contactId)?.fullName ?? assignment.contactId;
  const draftContactName = contacts.find((c) => c.id === draft.contactId)?.fullName ?? draft.contactId;

  const handleSave = () => {
    if (!draft.contactId) return;
    updateAssignment(vehicleId, draft);
    setEditing(false);
  };

  const handleCancel = () => {
    setDraft(assignment);
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="rounded-lg border border-primary/30 bg-muted/30 p-3 space-y-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Contact</Label>
          <Combobox
            options={contactOptions}
            value={draft.contactId}
            onChange={(v) => setDraft((d) => ({ ...d, contactId: v }))}
            placeholder="Search crew…"
          />
          {!draftContactName && (
            <p className="text-[10px] text-muted-foreground">Contact not found — they may need to be added to Crew first.</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Role</Label>
            <Select
              value={draft.role}
              onValueChange={(v) => setDraft((d) => ({ ...d, role: v as VehicleAssignment['role'] }))}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(ROLE_LABELS) as VehicleAssignment['role'][]).map((r) => (
                  <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Notes</Label>
            <Input
              className="h-8 text-xs"
              value={draft.notes ?? ''}
              onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value || undefined }))}
              placeholder="Optional…"
            />
          </div>
        </div>

        <label className="flex items-center gap-2 text-xs cursor-pointer">
          <Checkbox
            checked={draft.isDefault}
            onCheckedChange={(checked) => setDraft((d) => ({ ...d, isDefault: !!checked }))}
          />
          Default assignment for this vehicle
        </label>

        <div className="flex gap-2">
          <Button size="sm" className="h-7 text-xs gap-1" onClick={handleSave} disabled={!draft.contactId}>
            <Check className="h-3 w-3" />
            Save
          </Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={handleCancel}>
            <X className="h-3 w-3" />
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="group flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-sm font-medium truncate">{contactName}</span>
          {assignment.isDefault && (
            <Star className="h-3 w-3 text-amber-500 shrink-0" aria-label="Default" />
          )}
          <span
            className={cn(
              'rounded-full border px-1.5 py-0 text-[10px] font-semibold uppercase tracking-wide',
              assignment.role === 'photographer'
                ? 'border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-300'
                : assignment.role === 'reporter'
                ? 'border-purple-500/40 bg-purple-500/10 text-purple-700 dark:text-purple-300'
                : 'border-muted-foreground/30 bg-muted/30 text-muted-foreground',
            )}
          >
            {ROLE_LABELS[assignment.role]}
          </span>
        </div>
        {assignment.notes && (
          <p className="text-[10px] text-muted-foreground mt-0.5">{assignment.notes}</p>
        )}
      </div>

      {canMutate && (
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6"
            onClick={() => { setDraft(assignment); setEditing(true); }}
          >
            <Pencil className="h-3 w-3" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6 text-destructive hover:text-destructive"
            onClick={() => removeAssignment(vehicleId, assignment.id)}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      )}
    </div>
  );
}

interface AssignmentRowSkeletonProps {
  vehicleId: string;
  contacts: CrewContact[];
  onDone: () => void;
}

export function AssignmentRowSkeleton({ vehicleId, contacts, onDone }: AssignmentRowSkeletonProps) {
  const [draft, setDraft] = useState<Omit<VehicleAssignment, 'id'>>({
    contactId: '',
    role: 'photographer',
    isDefault: false,
  });

  const contactOptions: ComboboxOption[] = contacts.map((c) => ({
    value: c.id,
    label: c.fullName,
  }));

  const handleSave = () => {
    if (!draft.contactId) return;
    addAssignment(vehicleId, { ...draft, id: crypto.randomUUID() });
    onDone();
  };

  return (
    <div className="rounded-lg border border-primary/30 bg-muted/30 p-3 space-y-3">
      <div className="space-y-1.5">
        <Label className="text-xs">Contact</Label>
        <Combobox
          options={contactOptions}
          value={draft.contactId}
          onChange={(v) => setDraft((d) => ({ ...d, contactId: v }))}
          placeholder="Search crew…"
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <Label className="text-xs">Role</Label>
          <Select
            value={draft.role}
            onValueChange={(v) => setDraft((d) => ({ ...d, role: v as VehicleAssignment['role'] }))}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(ROLE_LABELS) as VehicleAssignment['role'][]).map((r) => (
                <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Notes</Label>
          <Input
            className="h-8 text-xs"
            value={draft.notes ?? ''}
            onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value || undefined }))}
            placeholder="Optional…"
          />
        </div>
      </div>

      <label className="flex items-center gap-2 text-xs cursor-pointer">
        <Checkbox
          checked={draft.isDefault}
          onCheckedChange={(checked) => setDraft((d) => ({ ...d, isDefault: !!checked }))}
        />
        Default assignment for this vehicle
      </label>

      <div className="flex gap-2">
        <Button size="sm" className="h-7 text-xs gap-1" onClick={handleSave} disabled={!draft.contactId}>
          <Check className="h-3 w-3" />
          Add
        </Button>
        <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={onDone}>
          <X className="h-3 w-3" />
          Cancel
        </Button>
      </div>
    </div>
  );
}
