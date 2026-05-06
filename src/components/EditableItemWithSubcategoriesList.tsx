import React, { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
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
import {
  Pencil,
  Trash2,
  GripVertical,
  Plus,
  Settings2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Warehouse,
} from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ItemWithSubcategories } from '@/types/inventory';
import { cn } from '@/lib/utils';
import { Switch } from '@/components/ui/switch';
import { getRackOptionsForFlatLocationLabel, getRackOptionsForSubLocationKey } from '@/lib/rackLocationsConfig';

function supplierProfileHasContent(row: ItemWithSubcategories): boolean {
  const t = (v: string | undefined) => (v ?? '').trim();
  return Boolean(
    t(row.website) ||
      t(row.contactName) ||
      t(row.contactEmail) ||
      t(row.contactPhone) ||
      t(row.supportEmail) ||
      t(row.supportPhone) ||
      t(row.accountReference) ||
      t(row.supplierNotes),
  );
}

function singularFormForListTitle(title: string): string {
  const lower = title.trim().toLowerCase();
  const irregular: Record<string, string> = {
    categories: 'category',
    suppliers: 'supplier',
    units: 'unit',
    locations: 'location',
    projects: 'project',
  };
  if (irregular[lower]) {
    return irregular[lower];
  }
  if (lower.endsWith('ies')) {
    return `${lower.slice(0, -3)}y`;
  }
  if (lower.endsWith('s') && lower.length > 1) {
    return lower.slice(0, -1);
  }
  return lower;
}

function RackSlotsEditor({
  rackSlots,
  onSlotsChange,
}: {
  rackSlots?: string[];
  onSlotsChange: (slots: string[]) => void;
}) {
  const slots = rackSlots ?? [];
  const addSlot = () => onSlotsChange([...slots, '']);
  const updateSlot = (index: number, value: string) => {
    const next = [...slots];
    next[index] = value;
    onSlotsChange(next);
  };
  const removeSlot = (index: number) => {
    onSlotsChange(slots.filter((_, i) => i !== index));
  };
  const move = (from: number, to: number) => {
    if (to < 0 || to >= slots.length) {
      return;
    }
    onSlotsChange(arrayMove(slots, from, to));
  };

  return (
    <div className="space-y-1 rounded-md border border-border/40 bg-muted/10 p-2">
      <p className="text-[11px] text-muted-foreground">
        Name each rack cell (inventory rack picker). Reorder with arrows.
      </p>
      {slots.map((slot, i) => (
        <div key={`rack-slot-${i}`} className="flex flex-wrap items-center gap-1">
          <Input
            className="h-8 min-w-0 flex-1 text-xs"
            value={slot}
            onChange={(e) => updateSlot(i, e.target.value)}
            placeholder="e.g. TD-05"
            aria-label={`Rack position ${i + 1}`}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            disabled={i === 0}
            title="Move up"
            onClick={() => move(i, i - 1)}
          >
            <ChevronUp className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            disabled={i === slots.length - 1}
            title="Move down"
            onClick={() => move(i, i + 1)}
          >
            <ChevronDown className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="delete-action-btn h-8 w-8 shrink-0"
            title="Remove position"
            onClick={() => removeSlot(i)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={addSlot}>
        Add position
      </Button>
    </div>
  );
}

function RackConfigPopover({
  rackLocationEnabled,
  rackSlots,
  onEnabledChange,
  onSlotsChange,
  presetOptions,
  locationLabel,
}: {
  rackLocationEnabled?: boolean;
  rackSlots?: string[];
  onEnabledChange: (value: boolean) => void;
  onSlotsChange: (slots: string[]) => void;
  presetOptions: string[];
  locationLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const hasPresets = presetOptions.length > 0;
  const enabled = rackLocationEnabled === true;
  const iconClass = enabled
    ? 'text-primary'
    : hasPresets
      ? 'text-muted-foreground'
      : 'text-muted-foreground/55';

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 w-8 shrink-0 px-0 text-muted-foreground hover:text-foreground"
          title={enabled ? 'Rack positions: custom list' : 'Rack positions'}
          aria-label={`Rack positions for ${locationLabel}`}
        >
          <Warehouse className={cn('h-4 w-4', iconClass)} aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(100vw-2rem,22rem)] p-3" align="end">
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-medium leading-none">Rack positions</span>
            <Switch
              checked={enabled}
              onCheckedChange={(v) => onEnabledChange(Boolean(v))}
              aria-label="Use custom named rack positions for this row"
            />
          </div>
          <p className="text-[11px] leading-snug text-muted-foreground">
            When on, inventory uses only the list you define below. When off, catalog presets apply for this room name
            (if any), and rack IDs stay editable on each inventory item.
          </p>
          {!enabled && hasPresets ? (
            <div className="rounded-md border border-border/50 bg-muted/20 p-2">
              <p className="mb-1 text-[11px] font-medium text-foreground">
                Catalog presets ({presetOptions.length})
              </p>
              <p className="max-h-28 overflow-y-auto font-mono text-[10px] leading-snug text-muted-foreground">
                {presetOptions.slice(0, 48).join(', ')}
                {presetOptions.length > 48 ? ` … +${presetOptions.length - 48} more` : ''}
              </p>
            </div>
          ) : null}
          {!enabled && !hasPresets ? (
            <p className="text-[11px] text-muted-foreground">
              No catalog presets match this name. Turn on to add your own rack IDs.
            </p>
          ) : null}
          {enabled ? <RackSlotsEditor rackSlots={rackSlots} onSlotsChange={onSlotsChange} /> : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}

interface SortableItemProps {
  item: ItemWithSubcategories;
  onEdit: (id: string, newValue: string) => void;
  onEditColor?: (id: string, newColor: string) => void;
  onRequestDeleteParent: (id: string) => void;
  onAddSubcategory: (id: string, subcategory: string) => void;
  onEditSubcategory: (id: string, oldValue: string, newValue: string) => void;
  onMoveSubcategory: (id: string, subcategory: string, direction: "up" | "down") => void;
  onRequestDeleteSubcategory: (id: string, subcategory: string) => void;
  onPatchItem?: (id: string, patch: Partial<ItemWithSubcategories>) => void;
  onPatchChild?: (parentId: string, childKey: string, patch: Partial<ItemWithSubcategories>) => void;
  perItemWebsiteField?: boolean;
  perItemSupplierProfileFields?: boolean;
  locationRackExtension?: boolean;
  canDeleteItems?: boolean;
}

const DEFAULT_CATEGORY_COLORS = [
  '#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6',
  '#06b6d4', '#84cc16', '#f97316', '#ec4899', '#14b8a6',
];

const getFallbackColor = (item: ItemWithSubcategories) => {
  if (item.color) return item.color;
  const hashBase = (item.name || item.id || '').split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return DEFAULT_CATEGORY_COLORS[hashBase % DEFAULT_CATEGORY_COLORS.length];
};

function SortableItem({
  item,
  onEdit,
  onEditColor,
  onRequestDeleteParent,
  onAddSubcategory,
  onEditSubcategory,
  onMoveSubcategory,
  onRequestDeleteSubcategory,
  onPatchItem,
  onPatchChild,
  perItemWebsiteField = false,
  perItemSupplierProfileFields = false,
  locationRackExtension = false,
  canDeleteItems = true,
  showColorPicker = false,
  enableSubcategories = true,
  colorPickerLabel = 'Category color',
}: SortableItemProps & {
  enableSubcategories?: boolean;
  showColorPicker?: boolean;
  colorPickerLabel?: string;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(item.name);
  const [newSubcategory, setNewSubcategory] = useState('');
  const [subAddOpen, setSubAddOpen] = useState(false);
  const [supplierDetailsOpen, setSupplierDetailsOpen] = useState(false);
  const [editingSubcategory, setEditingSubcategory] = useState<string | null>(null);
  const [subsExpanded, setSubsExpanded] = useState(false);
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const handleSave = () => {
    if (editValue.trim() !== item.name) {
      onEdit(item.id, editValue.trim());
    }
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditValue(item.name);
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      handleCancel();
    }
  };

  const parentLeafPresetRacks = React.useMemo(
    () =>
      item.children && item.children.length > 0 ? [] : getRackOptionsForFlatLocationLabel(item.name),
    [item.children, item.name],
  );

  const handleAddSubcategory = () => {
    if (newSubcategory.trim()) {
      onAddSubcategory(item.id, newSubcategory.trim());
      setNewSubcategory('');
      setSubAddOpen(false);
      setSubsExpanded(true);
    }
  };

  return (
    <div ref={setNodeRef} style={style} className="space-y-2">
      <div className="flex justify-between items-center gap-2 rounded-md border border-border/80 bg-muted/30 p-2 font-medium text-foreground shadow-sm">
        <div className="flex min-w-0 flex-1 items-center">
          <button
            {...attributes}
            {...listeners}
            className="mr-2 shrink-0 cursor-grab p-1 active:cursor-grabbing"
            title={`Reorder ${item.name}`}
            aria-label={`Reorder ${item.name}`}
          >
            <GripVertical className="h-4 w-4 text-muted-foreground" />
          </button>
          {enableSubcategories && (item.children?.length ?? 0) > 0 ? (
            <button
              type="button"
              className="mr-1 shrink-0 rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              onClick={() => setSubsExpanded((v) => !v)}
              aria-expanded={subsExpanded}
              aria-label={subsExpanded ? 'Collapse subcategories' : 'Expand subcategories'}
            >
              {subsExpanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </button>
          ) : (
            <span className="mr-1 w-7 shrink-0" aria-hidden />
          )}
          {isEditing ? (
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
              <Input
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={handleSave}
                onKeyDown={handleKeyDown}
                className="h-8 min-w-0 flex-1 basis-[8rem] placeholder:text-muted-foreground/40"
                autoFocus
              />
              {showColorPicker && onEditColor && (
                <Input
                  type="color"
                  value={getFallbackColor(item)}
                  onChange={(e) => onEditColor(item.id, e.target.value)}
                  className="h-8 w-12 shrink-0 p-1"
                  title={colorPickerLabel}
                  aria-label={`${colorPickerLabel} for ${item.name}`}
                />
              )}
            </div>
          ) : (
            <div className="flex min-w-0 flex-1 items-center gap-2">
              {showColorPicker && (
                <span
                  className="h-3 w-3 shrink-0 rounded-full border border-border"
                  style={{ backgroundColor: getFallbackColor(item) }}
                  aria-hidden="true"
                />
              )}
              <span className="truncate">{item.name}</span>
            </div>
          )}
        </div>
        <div className="flex shrink-0 gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsEditing(true)}
            title={`Edit ${item.name}`}
            aria-label={`Edit ${item.name}`}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          {locationRackExtension && onPatchItem && !(item.children && item.children.length > 0) ? (
            <RackConfigPopover
              rackLocationEnabled={item.rackLocationEnabled}
              rackSlots={item.rackSlots}
              onEnabledChange={(v) => onPatchItem(item.id, { rackLocationEnabled: v })}
              onSlotsChange={(sl) => onPatchItem(item.id, { rackSlots: sl })}
              presetOptions={parentLeafPresetRacks}
              locationLabel={item.name}
            />
          ) : null}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => canDeleteItems && onRequestDeleteParent(item.id)}
            className="delete-action-btn"
            disabled={!canDeleteItems}
            title={canDeleteItems ? 'Delete item' : 'Only admins can delete list entries'}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
          {enableSubcategories && (
            <Popover
              open={subAddOpen}
              onOpenChange={(open) => {
                setSubAddOpen(open);
                if (!open) setNewSubcategory('');
              }}
            >
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
                  title="Add subcategory"
                  aria-label={`Add subcategory under ${item.name}`}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[min(100vw-2rem,20rem)] p-3" align="end">
                <div className="space-y-2">
                  <Input
                    type="text"
                    placeholder="Subcategory name"
                    value={newSubcategory}
                    onChange={(e) => setNewSubcategory(e.target.value)}
                    className="placeholder:text-muted-foreground/40"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddSubcategory();
                      }
                    }}
                    autoFocus
                  />
                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="ghost" size="sm" onClick={() => { setSubAddOpen(false); setNewSubcategory(''); }}>
                      Cancel
                    </Button>
                    <Button type="button" size="sm" onClick={handleAddSubcategory}>
                      Add
                    </Button>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          )}
          {perItemSupplierProfileFields && onPatchItem && (
            <Popover open={supplierDetailsOpen} onOpenChange={setSupplierDetailsOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
                  title="Vendor details"
                  aria-label={`Vendor details for ${item.name}`}
                >
                  <Settings2 className="h-4 w-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[min(100vw-2rem,34rem)] p-3" align="end">
                <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                  <div className="space-y-1">
                    <span className="text-xs font-medium text-muted-foreground">Website</span>
                    <Input
                      type="url"
                      className="h-8 text-sm placeholder:text-muted-foreground/40"
                      placeholder="https://..."
                      value={item.website ?? ''}
                      onChange={(e) =>
                        onPatchItem(item.id, {
                          website: e.target.value.trim() || undefined,
                        })
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs font-medium text-muted-foreground">Contact name</span>
                    <Input
                      className="h-8 text-sm placeholder:text-muted-foreground/40"
                      placeholder="Primary contact"
                      value={item.contactName ?? ''}
                      onChange={(e) =>
                        onPatchItem(item.id, {
                          contactName: e.target.value.trim() || undefined,
                        })
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs font-medium text-muted-foreground">Contact email</span>
                    <Input
                      type="email"
                      className="h-8 text-sm placeholder:text-muted-foreground/40"
                      placeholder="name@company.com"
                      value={item.contactEmail ?? ''}
                      onChange={(e) =>
                        onPatchItem(item.id, {
                          contactEmail: e.target.value.trim() || undefined,
                        })
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs font-medium text-muted-foreground">Contact phone</span>
                    <Input
                      className="h-8 text-sm placeholder:text-muted-foreground/40"
                      placeholder="+1 ..."
                      value={item.contactPhone ?? ''}
                      onChange={(e) =>
                        onPatchItem(item.id, {
                          contactPhone: e.target.value.trim() || undefined,
                        })
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs font-medium text-muted-foreground">Support email</span>
                    <Input
                      type="email"
                      className="h-8 text-sm placeholder:text-muted-foreground/40"
                      placeholder="support@company.com"
                      value={item.supportEmail ?? ''}
                      onChange={(e) =>
                        onPatchItem(item.id, {
                          supportEmail: e.target.value.trim() || undefined,
                        })
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs font-medium text-muted-foreground">Support phone</span>
                    <Input
                      className="h-8 text-sm placeholder:text-muted-foreground/40"
                      placeholder="+1 ..."
                      value={item.supportPhone ?? ''}
                      onChange={(e) =>
                        onPatchItem(item.id, {
                          supportPhone: e.target.value.trim() || undefined,
                        })
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs font-medium text-muted-foreground">Account reference</span>
                    <Input
                      className="h-8 text-sm placeholder:text-muted-foreground/40"
                      placeholder="Customer/account number"
                      value={item.accountReference ?? ''}
                      onChange={(e) =>
                        onPatchItem(item.id, {
                          accountReference: e.target.value.trim() || undefined,
                        })
                      }
                    />
                  </div>
                  <div className="space-y-1 md:col-span-2">
                    <span className="text-xs font-medium text-muted-foreground">Notes</span>
                    <Textarea
                      className="min-h-[72px] text-sm placeholder:text-muted-foreground/40"
                      placeholder="SLA, procurement notes, escalation details..."
                      value={item.supplierNotes ?? ''}
                      onChange={(e) =>
                        onPatchItem(item.id, {
                          supplierNotes: e.target.value.trim() || undefined,
                        })
                      }
                    />
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          )}
        </div>
      </div>

      {perItemWebsiteField && onPatchItem && !perItemSupplierProfileFields && (
        <div className="ml-9 flex max-w-md flex-col gap-1 sm:ml-10">
          <span className="text-xs font-medium text-muted-foreground">Supplier website</span>
          <Input
            type="url"
            className="h-8 text-sm placeholder:text-muted-foreground/40"
            placeholder="https://…"
            value={item.website ?? ''}
            onChange={(e) =>
              onPatchItem(item.id, {
                website: e.target.value.trim() || undefined,
              })
            }
          />
        </div>
      )}

      {enableSubcategories && subsExpanded && (item.children?.length ?? 0) > 0 && (
        <div className="ml-1 space-y-1 border-l-2 border-primary/30 pl-3 sm:ml-2 sm:pl-4">
          {item.children?.map((child, childIndex) => {
            const childKey = child.id ?? child.name;
            const childPresetRacks = getRackOptionsForSubLocationKey(child.name);
            const childCount = item.children?.length ?? 0;
            return (
              <div key={childKey} className="space-y-1">
            <div
              className="flex min-w-0 items-center justify-between gap-2 rounded-r-md border border-border/60 border-l-transparent bg-muted/15 py-1.5 pl-2 pr-2 text-sm text-muted-foreground"
            >
              {editingSubcategory === child.name ? (
                <Input
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onBlur={() => {
                    if (editValue.trim() !== child.name) {
                      onEditSubcategory(item.id, child.name, editValue.trim());
                    }
                    setEditingSubcategory(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      if (editValue.trim() !== child.name) {
                        onEditSubcategory(item.id, child.name, editValue.trim());
                      }
                      setEditingSubcategory(null);
                    } else if (e.key === 'Escape') {
                      setEditingSubcategory(null);
                    }
                  }}
                  className="h-8 min-w-0 flex-1"
                  autoFocus
                />
              ) : (
                <>
                  <span className="min-w-0 flex-1 truncate italic">{child.name}</span>
                  <div className="flex shrink-0 gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onMoveSubcategory(item.id, child.name, "up")}
                      disabled={childIndex === 0}
                      className="text-muted-foreground hover:text-foreground"
                      title="Move up"
                    >
                      <ChevronUp className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onMoveSubcategory(item.id, child.name, "down")}
                      disabled={childIndex >= childCount - 1}
                      className="text-muted-foreground hover:text-foreground"
                      title="Move down"
                    >
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setEditValue(child.name);
                        setEditingSubcategory(child.name);
                      }}
                      className="text-muted-foreground hover:text-foreground"
                      title={`Edit subcategory ${child.name}`}
                      aria-label={`Edit subcategory ${child.name}`}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    {locationRackExtension && onPatchChild ? (
                      <RackConfigPopover
                        rackLocationEnabled={child.rackLocationEnabled}
                        rackSlots={child.rackSlots}
                        onEnabledChange={(v) => onPatchChild(item.id, childKey, { rackLocationEnabled: v })}
                        onSlotsChange={(sl) => onPatchChild(item.id, childKey, { rackSlots: sl })}
                        presetOptions={childPresetRacks}
                        locationLabel={`${item.name} / ${child.name}`}
                      />
                    ) : null}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => canDeleteItems && onRequestDeleteSubcategory(item.id, child.name)}
                      className="delete-action-btn"
                      disabled={!canDeleteItems}
                      title={canDeleteItems ? 'Delete subcategory' : 'Only admins can delete list entries'}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </>
              )}
            </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface EditableItemWithSubcategoriesListProps {
  items: ItemWithSubcategories[];
  setItems: (items: ItemWithSubcategories[]) => void;
  title: string;
  description?: string;
  /** Hide the built-in H3 title when the parent card already shows the same heading. */
  hideListTitle?: boolean;
  enableSubcategories?: boolean;
  showColorPicker?: boolean;
  /** Accessible label for the color input when `showColorPicker` is on. */
  colorPickerLabel?: string;
  onCheckBeforeDelete?: (value: string, onSafeToDelete: () => void) => void;
  /** Per-row website URL (e.g. supplier portal under Settings → Libraries → Suppliers). */
  perItemWebsiteField?: boolean;
  /** Supplier mode: structured contact/support/account metadata fields per row. */
  perItemSupplierProfileFields?: boolean;
  /** Location list: rack checkbox and named rack positions per parent or sub-location row. */
  locationRackExtension?: boolean;
  /** When false, hide/disable delete actions but keep create/edit available. */
  canDeleteItems?: boolean;
}

type DeleteTarget =
  | null
  | { kind: 'parent'; id: string }
  | { kind: 'sub'; parentId: string; subName: string };

export function EditableItemWithSubcategoriesList({
  items,
  setItems,
  title,
  description,
  hideListTitle = false,
  enableSubcategories = true,
  showColorPicker = false,
  colorPickerLabel = 'Category color',
  onCheckBeforeDelete,
  perItemWebsiteField = false,
  perItemSupplierProfileFields = false,
  locationRackExtension = false,
  canDeleteItems = true,
}: EditableItemWithSubcategoriesListProps) {
  const addInputRef = useRef<HTMLInputElement>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null);
  const addPlaceholder = `Add new ${singularFormForListTitle(title)}`;

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = items.findIndex((item) => item.id === active.id);
      const newIndex = items.findIndex((item) => item.id === over.id);
      setItems(arrayMove(items, oldIndex, newIndex));
    }
  };

  const handleAddItem = () => {
    const value = addInputRef.current?.value?.trim();
    if (!value) {
      return;
    }
    const newItem: ItemWithSubcategories = {
      id: Date.now().toString(),
      name: value,
      ...(showColorPicker ? { color: DEFAULT_CATEGORY_COLORS[items.length % DEFAULT_CATEGORY_COLORS.length] } : {}),
      children: [],
    };
    setItems([...items, newItem]);
    if (addInputRef.current) {
      addInputRef.current.value = '';
    }
  };

  const handleEditItem = (id: string, newValue: string) => {
    const newItems = items.map((item) =>
      item.id === id ? { ...item, name: newValue } : item
    );
    setItems(newItems);
  };

  const handlePatchItem = (id: string, patch: Partial<ItemWithSubcategories>) => {
    setItems(items.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  };

  const handlePatchChild = (parentId: string, childKey: string, patch: Partial<ItemWithSubcategories>) => {
    setItems(
      items.map((parent) => {
        if (parent.id !== parentId) {
          return parent;
        }
        return {
          ...parent,
          children: (parent.children ?? []).map((child) => {
            const key = child.id ?? child.name;
            return key === childKey ? { ...child, ...patch } : child;
          }),
        };
      }),
    );
  };

  const runParentDelete = (id: string) => {
    const itemToDelete = items.find((item) => item.id === id);
    if (!itemToDelete) {
      return;
    }
    if (onCheckBeforeDelete) {
      onCheckBeforeDelete(itemToDelete.name, () => {
        setItems(items.filter((item) => item.id !== id));
      });
    } else {
      setItems(items.filter((item) => item.id !== id));
    }
  };

  const handleEditColor = (id: string, newColor: string) => {
    const newItems = items.map((item) =>
      item.id === id ? { ...item, color: newColor } : item
    );
    setItems(newItems);
  };

  const handleAddSubcategory = (id: string, subcategoryName: string) => {
    const newItems = items.map((item) => {
      if (item.id === id) {
        return {
          ...item,
          children: [...(item.children || []), {
            id: Date.now().toString(),
            name: subcategoryName
          }],
        };
      }
      return item;
    });
    setItems(newItems);
  };

  const handleEditSubcategory = (id: string, oldValue: string, newValue: string) => {
    const newItems = items.map((item) => {
      if (item.id === id) {
        return {
          ...item,
          children: item.children?.map((child) =>
            child.name === oldValue ? { ...child, name: newValue } : child
          ),
        };
      }
      return item;
    });
    setItems(newItems);
  };

  const handleMoveSubcategory = (id: string, subcategoryName: string, direction: "up" | "down") => {
    const newItems = items.map((item) => {
      if (item.id !== id || !item.children?.length) {
        return item;
      }
      const idx = item.children.findIndex((child) => child.name === subcategoryName);
      if (idx === -1) {
        return item;
      }
      const to = direction === "up" ? idx - 1 : idx + 1;
      if (to < 0 || to >= item.children.length) {
        return item;
      }
      return {
        ...item,
        children: arrayMove(item.children, idx, to),
      };
    });
    setItems(newItems);
  };

  const handleDeleteSubcategory = (id: string, subcategoryName: string) => {
    const newItems = items.map((item) => {
      if (item.id === id) {
        return {
          ...item,
          children: item.children?.filter((child) => child.name !== subcategoryName),
        };
      }
      return item;
    });
    setItems(newItems);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleAddItem();
    }
  };

  const confirmDelete = () => {
    if (!deleteTarget) {
      return;
    }
    if (deleteTarget.kind === 'parent') {
      runParentDelete(deleteTarget.id);
    } else {
      handleDeleteSubcategory(deleteTarget.parentId, deleteTarget.subName);
    }
    setDeleteTarget(null);
  };

  const parentLabel =
    deleteTarget?.kind === 'parent'
      ? items.find((i) => i.id === deleteTarget.id)?.name
      : deleteTarget?.kind === 'sub'
        ? deleteTarget.subName
        : '';

  return (
    <div className="space-y-4">
      {!hideListTitle && (
        <div className="flex justify-between items-center">
          <div>
            <h3 className="text-lg font-medium text-foreground">{title}</h3>
            {description && <p className="text-sm text-muted-foreground">{description}</p>}
          </div>
        </div>
      )}

      <div className="flex min-w-0 gap-2">
        <Input
          ref={addInputRef}
          type="text"
          className="min-w-0 flex-1 placeholder:text-muted-foreground/40"
          placeholder={addPlaceholder}
          onKeyDown={handleKeyDown}
          aria-label={addPlaceholder}
        />
        <Button
          type="button"
          onClick={handleAddItem}
          className="shrink-0 border-border"
          variant="outline"
        >
          <Plus className="mr-2 h-4 w-4" />
          Add
        </Button>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={items.map(item => item.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {items.map((item) => (
              <SortableItem
                key={item.id}
                item={item}
                onEdit={handleEditItem}
                onEditColor={handleEditColor}
                onRequestDeleteParent={(id) => setDeleteTarget({ kind: 'parent', id })}
                onAddSubcategory={handleAddSubcategory}
                onEditSubcategory={handleEditSubcategory}
                onMoveSubcategory={handleMoveSubcategory}
                onRequestDeleteSubcategory={(parentId, subName) =>
                  setDeleteTarget({ kind: 'sub', parentId, subName })
                }
                onPatchItem={
                  perItemWebsiteField || perItemSupplierProfileFields || locationRackExtension ? handlePatchItem : undefined
                }
                onPatchChild={locationRackExtension ? handlePatchChild : undefined}
                perItemWebsiteField={perItemWebsiteField}
                perItemSupplierProfileFields={perItemSupplierProfileFields}
                locationRackExtension={locationRackExtension}
                enableSubcategories={enableSubcategories}
                showColorPicker={showColorPicker}
                colorPickerLabel={colorPickerLabel}
                canDeleteItems={canDeleteItems}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.kind === 'sub' ? 'subcategory' : 'entry'}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes &quot;{parentLabel}&quot; from the list. This cannot be undone from here (use app Undo where available).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel type="button">Cancel</AlertDialogCancel>
            <AlertDialogAction type="button" onClick={confirmDelete} disabled={!canDeleteItems}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
