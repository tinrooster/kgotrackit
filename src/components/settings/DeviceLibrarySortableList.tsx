import * as React from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { DraggableDialogContent } from '@/components/ui/draggable-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Combobox } from '@/components/ui/combobox';
import { toast } from 'sonner';
import { logger } from '@/lib/logging';
import { cn } from '@/lib/utils';
import type { DeviceLibraryEntry } from '@/types/deviceLibrary';
import { getCableColorDropdownValues } from '@/lib/cableFacetPicklists';
import { getDeviceLibrary, newDeviceLibraryDraft, saveDeviceLibrary } from '@/lib/deviceLibraryStorage';
import { entryLabel } from '@/lib/deviceLibraryFormApply';

const KIND_COMBO_OPTIONS: { value: string; label: string }[] = [
  { value: 'generic', label: 'General device' },
  { value: 'cable', label: 'Cable / wire profile' },
  { value: 'media_converter', label: 'Converter profile' },
  { value: 'display', label: 'Display profile' },
];

const KIND_LABELS: Record<string, string> = {
  generic: 'Generic',
  cable: 'Cable',
  media_converter: 'Converter',
  display: 'Display',
};

function SortableDeviceRow({
  entry,
  onEdit,
  onDelete,
}: {
  entry: DeviceLibraryEntry;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: entry.id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const kindLabel = KIND_LABELS[entry.kind] ?? entry.kind;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex items-center gap-2 rounded-md border border-border/80 bg-muted/30 p-2 text-sm shadow-sm',
        isDragging && 'opacity-60',
      )}
    >
      <button
        type="button"
        className="shrink-0 cursor-grab rounded p-1 text-muted-foreground hover:bg-muted active:cursor-grabbing"
        {...attributes}
        {...listeners}
        aria-label="Drag to reorder"
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-foreground">{entryLabel(entry)}</p>
        <p className="truncate text-xs text-muted-foreground">
          {kindLabel}
          {entry.defaultStockUnit ? ` · ${entry.defaultStockUnit}` : ''}
          {entry.restockPackageQuantity ? ` · restock +${entry.restockPackageQuantity}` : ''}
        </p>
      </div>
      <Button type="button" variant="ghost" size="icon" className="shrink-0" title="Edit" onClick={onEdit}>
        <Pencil className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="shrink-0 text-destructive hover:text-destructive"
        title="Remove from library"
        onClick={onDelete}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}

interface DeviceLibrarySortableListProps {
  entries: DeviceLibraryEntry[];
  onEntriesChange: () => void;
}

export function DeviceLibrarySortableList({ entries, onEntriesChange }: DeviceLibrarySortableListProps) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [draft, setDraft] = React.useState<DeviceLibraryEntry>(() => newDeviceLibraryDraft());
  const colorOptions = React.useMemo(
    () => getCableColorDropdownValues(draft.defaultCableColor),
    [draft.defaultCableColor],
  );

  const openCreate = () => {
    setDraft(newDeviceLibraryDraft());
    setDialogOpen(true);
  };

  const openEdit = (entry: DeviceLibraryEntry) => {
    setDraft({ ...entry });
    setDialogOpen(true);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) {
      return;
    }
    const oldIndex = entries.findIndex((e) => e.id === active.id);
    const newIndex = entries.findIndex((e) => e.id === over.id);
    if (oldIndex < 0 || newIndex < 0) {
      return;
    }
    saveDeviceLibrary(arrayMove(entries, oldIndex, newIndex));
    onEntriesChange();
  };

  const persistDraft = () => {
    const manufacturer = draft.manufacturer.trim();
    if (!manufacturer) {
      toast.error('Manufacturer is required.');
      return false;
    }
    const next: DeviceLibraryEntry = {
      ...draft,
      manufacturer,
      modelNumber: draft.modelNumber?.trim() || '',
      defaultStockUnit: draft.defaultStockUnit?.trim() || undefined,
      defaultCableColor: draft.defaultCableColor?.trim() || undefined,
      conversionSpec: draft.conversionSpec?.trim() || undefined,
      restockPackageQuantity:
        typeof draft.restockPackageQuantity === 'number' &&
        Number.isFinite(draft.restockPackageQuantity) &&
        draft.restockPackageQuantity > 0
          ? draft.restockPackageQuantity
          : undefined,
      defaultSupplier: draft.defaultSupplier?.trim() || undefined,
      defaultSupplierWebsite: draft.defaultSupplierWebsite?.trim() || undefined,
      notes: draft.notes?.trim() || undefined,
    };
    const list = getDeviceLibrary();
    const idx = list.findIndex((e) => e.id === next.id);
    const merged = idx >= 0 ? list.map((e) => (e.id === next.id ? next : e)) : [...list, next];
    saveDeviceLibrary(merged);
    onEntriesChange();
    setDialogOpen(false);
    toast.success('Device library saved');
    logger.info('Device library entry saved', { id: next.id, kind: next.kind });
    return true;
  };

  const handleDelete = (id: string) => {
    saveDeviceLibrary(entries.filter((e) => e.id !== id));
    onEntriesChange();
    logger.info('Device library entry removed', { id });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Drag to reorder. Order is saved and used in device pick lists.
        </p>
        <Button type="button" size="sm" className="shrink-0 gap-1" onClick={openCreate}>
          <Plus className="h-4 w-4" />
          Add entry
        </Button>
      </div>

      {entries.length === 0 ? (
        <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
          No catalog rows yet. Use Add entry or restore from a backup that includes deviceLibrary.
        </p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={entries.map((e) => e.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {entries.map((entry) => (
                <SortableDeviceRow
                  key={entry.id}
                  entry={entry}
                  onEdit={() => openEdit(entry)}
                  onDelete={() => handleDelete(entry.id)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DraggableDialogContent className="w-[min(calc(100vw-1rem),520px)] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{entries.some((e) => e.id === draft.id) ? 'Edit catalog entry' : 'Add catalog entry'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="space-y-2">
              <Label>Kind</Label>
              <Combobox
                options={KIND_COMBO_OPTIONS}
                value={draft.kind}
                onChange={(v) => setDraft((d) => ({ ...d, kind: v }))}
                placeholder="Preset or custom kind (type to add)…"
                emptyText="Type a custom kind and pick “Use …” or press Enter in the list."
                allowCustomValue
              />
              <p className="text-xs text-muted-foreground">
                Kind is optional but helps keep profiles organized in picker results.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="dl-manufacturer">Manufacturer</Label>
              <Input
                id="dl-manufacturer"
                value={draft.manufacturer}
                onChange={(e) => setDraft((d) => ({ ...d, manufacturer: e.target.value }))}
                placeholder="e.g. Belden"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dl-model">Model / part #</Label>
              <Input
                id="dl-model"
                value={draft.modelNumber}
                onChange={(e) => setDraft((d) => ({ ...d, modelNumber: e.target.value }))}
                placeholder="Optional"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dl-unit">Default stock unit</Label>
              <Input
                id="dl-unit"
                value={draft.defaultStockUnit ?? ''}
                onChange={(e) => setDraft((d) => ({ ...d, defaultStockUnit: e.target.value }))}
                placeholder="Match Units list name, e.g. Spool, Box"
              />
              <p className="text-xs text-muted-foreground">
                When applied to an item, the unit is set only if this text matches a top-level unit name.
              </p>
            </div>
            {draft.kind === 'cable' ? (
              <div className="space-y-2">
                <Label>Default jacket color</Label>
                <Select
                  value={draft.defaultCableColor?.trim() ? draft.defaultCableColor : '__none__'}
                  onValueChange={(v) =>
                    setDraft((d) => ({
                      ...d,
                      defaultCableColor: v === '__none__' ? undefined : v,
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select color" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Not set</SelectItem>
                    {colorOptions.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            {draft.kind === 'media_converter' ? (
              <div className="space-y-2">
                <Label htmlFor="dl-conv">Signal path (what to what)</Label>
                <Input
                  id="dl-conv"
                  value={draft.conversionSpec ?? ''}
                  onChange={(e) => setDraft((d) => ({ ...d, conversionSpec: e.target.value }))}
                  placeholder="e.g. SDI to HDMI"
                />
              </div>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="dl-restock">Restock package quantity</Label>
              <Input
                id="dl-restock"
                type="number"
                min={0}
                step={1}
                value={draft.restockPackageQuantity ?? ''}
                onChange={(e) => {
                  const raw = e.target.value;
                  setDraft((d) => ({
                    ...d,
                    restockPackageQuantity: raw === '' ? undefined : Number(raw),
                  }));
                }}
                placeholder="e.g. 1000 for a full spool in ft"
              />
              <p className="text-xs text-muted-foreground">
                Used with <code className="rounded bg-muted px-1">quantityDeltaToReachTarget</code> /{' '}
                <code className="rounded bg-muted px-1">singlePackageRestockDelta</code> in{' '}
                <code className="rounded bg-muted px-1">restockIntent.ts</code> when you wire a one-click action.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="dl-supplier">Default supplier</Label>
              <Input
                id="dl-supplier"
                value={draft.defaultSupplier ?? ''}
                onChange={(e) => setDraft((d) => ({ ...d, defaultSupplier: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dl-url">Default supplier website</Label>
              <Input
                id="dl-url"
                type="url"
                value={draft.defaultSupplierWebsite ?? ''}
                onChange={(e) => setDraft((d) => ({ ...d, defaultSupplierWebsite: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dl-notes">Notes</Label>
              <Textarea
                id="dl-notes"
                value={draft.notes ?? ''}
                onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={() => persistDraft()}>
              Save
            </Button>
          </DialogFooter>
        </DraggableDialogContent>
      </Dialog>
    </div>
  );
}

