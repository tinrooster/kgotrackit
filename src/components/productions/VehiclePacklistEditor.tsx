import { useEffect, useMemo, useState } from 'react';
import { Plus, Truck, Unlink, AlertTriangle, MoreHorizontal, ChevronDown, ChevronRight } from 'lucide-react';
import { VehiclePacklist, VehiclePacklistSection, ChecklistItem, ChecklistGroup } from '@/types/productions';
import { InventoryItem } from '@/types/inventory';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { InventoryItemPicker } from './InventoryItemPicker';
import { BulkInventorySelectionDialog, BulkSelectionResult } from './BulkInventorySelectionDialog';
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
import { OptionalFormCollapsible } from '@/components/forms/OptionalFormCollapsible';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  ensureVehiclePacklistShape,
  removeVehiclePacklistItemById,
  upsertVehiclePacklistItemById,
  flattenVehiclePacklistItems,
} from '@/lib/vehiclePacklistUtils';

interface VehiclePacklistEditorProps {
  packlists: VehiclePacklist[];
  onChange: (packlists: VehiclePacklist[]) => void;
  checklistGroups?: ChecklistGroup[];
  inventoryItems?: InventoryItem[];
  readOnly?: boolean;
  requireDeleteConfirm?: boolean;
}

function newItem(label: string): ChecklistItem {
  return { id: crypto.randomUUID(), label, completed: false };
}

function dedupeSignature(item: Pick<ChecklistItem, 'label' | 'inventoryItemId'>): string {
  return `${item.label.trim().toLowerCase()}::${item.inventoryItemId || ''}`;
}

function sortItemsCopy(items: ChecklistItem[], sortMode: 'manual' | 'name_asc' | 'name_desc' | 'qty_asc' | 'qty_desc'): ChecklistItem[] {
  if (sortMode === 'manual') return items;
  const sorted = [...items];
  sorted.sort((left, right) => {
    if (sortMode === 'name_asc') return left.label.localeCompare(right.label);
    if (sortMode === 'name_desc') return right.label.localeCompare(left.label);
    if (sortMode === 'qty_asc') return (left.quantity ?? 1) - (right.quantity ?? 1);
    return (right.quantity ?? 1) - (left.quantity ?? 1);
  });
  return sorted;
}

function filterPacked(items: ChecklistItem[], packedFilter: 'all' | 'open' | 'done'): ChecklistItem[] {
  return items.filter((item) => {
    if (packedFilter === 'done') return item.completed;
    if (packedFilter === 'open') return !item.completed;
    return true;
  });
}

export function VehiclePacklistEditor({
  packlists,
  onChange,
  checklistGroups = [],
  inventoryItems = [],
  readOnly = false,
  requireDeleteConfirm = false,
}: VehiclePacklistEditorProps) {
  const [newVehicleName, setNewVehicleName] = useState('');
  const [newItemLabels, setNewItemLabels] = useState<Record<string, string>>({});
  const [selectedChecklistGroupByPacklist, setSelectedChecklistGroupByPacklist] = useState<Record<string, string>>({});
  const [pendingDelete, setPendingDelete] = useState<
    | { kind: 'packlist'; packlistId: string }
    | { kind: 'item'; packlistId: string; itemId: string }
    | { kind: 'section'; packlistId: string; sectionId: string }
    | null
  >(null);
  const [listSearchQuery, setListSearchQuery] = useState('');
  const [packedFilter, setPackedFilter] = useState<'all' | 'open' | 'done'>('all');
  const [sortMode, setSortMode] = useState<'manual' | 'name_asc' | 'name_desc' | 'qty_asc' | 'qty_desc'>('manual');
  const [expandedPacklistIds, setExpandedPacklistIds] = useState<string[]>([]);
  const [addItemRowVisibleByPacklistId, setAddItemRowVisibleByPacklistId] = useState<Record<string, boolean>>({});

  const allPacklistIds = useMemo(() => packlists.map((packlist) => packlist.id), [packlists]);

  useEffect(() => {
    const validIds = new Set(packlists.map((packlist) => packlist.id));
    setExpandedPacklistIds((previous) => previous.filter((id) => validIds.has(id)));
    setAddItemRowVisibleByPacklistId((previous) => {
      const next: Record<string, boolean> = {};
      let changed = false;
      for (const [packlistId, visible] of Object.entries(previous)) {
        if (validIds.has(packlistId)) next[packlistId] = visible;
        else changed = true;
      }
      if (!changed && Object.keys(next).length === Object.keys(previous).length) return previous;
      return next;
    });
  }, [packlists]);

  const togglePacklistExpanded = (packlistId: string) => {
    setExpandedPacklistIds((previous) => {
      if (previous.includes(packlistId)) {
        setAddItemRowVisibleByPacklistId((visible) => ({ ...visible, [packlistId]: false }));
        return previous.filter((id) => id !== packlistId);
      }
      return [...previous, packlistId];
    });
  };

  const toggleAddItemRowForPacklist = (packlistId: string) => {
    setAddItemRowVisibleByPacklistId((previous) => {
      const willShow = !previous[packlistId];
      if (willShow) {
        setExpandedPacklistIds((expanded) => (expanded.includes(packlistId) ? expanded : [...expanded, packlistId]));
      }
      return { ...previous, [packlistId]: willShow };
    });
  };

  const runDeleteAction = (deleteKey: string, deleteAction: () => void) => {
    if (!requireDeleteConfirm) {
      deleteAction();
      return;
    }
    if (deleteKey.startsWith('packlist:')) {
      setPendingDelete({ kind: 'packlist', packlistId: deleteKey.replace('packlist:', '') });
      return;
    }
    if (deleteKey.startsWith('section:')) {
      const [, packlistId, sectionId] = deleteKey.split(':');
      if (packlistId && sectionId) setPendingDelete({ kind: 'section', packlistId, sectionId });
      return;
    }
    if (deleteKey.startsWith('item:')) {
      const [, packlistId, itemId] = deleteKey.split(':');
      if (packlistId && itemId) setPendingDelete({ kind: 'item', packlistId, itemId });
    }
  };

  const updatePacklist = (id: string, updates: Partial<VehiclePacklist>) => {
    onChange(
      packlists.map((packlistEntry) =>
        packlistEntry.id === id ? ensureVehiclePacklistShape({ ...packlistEntry, ...updates }) : packlistEntry,
      ),
    );
  };

  const removePacklist = (id: string) => {
    onChange(packlists.filter((p) => p.id !== id));
  };

  const addPacklist = () => {
    const name = newVehicleName.trim();
    if (!name) return;
    const nextId = crypto.randomUUID();
    onChange([...packlists, { id: nextId, vehicleName: name, items: [], sections: [] }]);
    setExpandedPacklistIds((previous) => (previous.includes(nextId) ? previous : [...previous, nextId]));
    setNewVehicleName('');
  };

  const collectSignatures = (packlist: VehiclePacklist): Set<string> => {
    const shaped = ensureVehiclePacklistShape(packlist);
    const set = new Set<string>();
    for (const section of shaped.sections) {
      for (const item of section.items) set.add(dedupeSignature(item));
    }
    for (const item of shaped.items) set.add(dedupeSignature(item));
    return set;
  };

  const updateItemById = (packlistId: string, itemId: string, updates: Partial<ChecklistItem>) => {
    const entry = packlists.find((p) => p.id === packlistId);
    if (!entry) return;
    const next = upsertVehiclePacklistItemById(entry, itemId, (item) => ({ ...item, ...updates }));
    updatePacklist(packlistId, next);
  };

  const removeItem = (packlistId: string, itemId: string) => {
    const entry = packlists.find((p) => p.id === packlistId);
    if (!entry) return;
    const removed = removeVehiclePacklistItemById(entry, itemId);
    if (!removed) return;
    updatePacklist(packlistId, removed);
  };

  const removeSection = (packlistId: string, sectionId: string) => {
    const entry = packlists.find((p) => p.id === packlistId);
    if (!entry) return;
    const shaped = ensureVehiclePacklistShape(entry);
    updatePacklist(packlistId, {
      sections: shaped.sections.filter((section) => section.id !== sectionId),
    });
  };

  const addItem = (packlistId: string) => {
    const label = (newItemLabels[packlistId] ?? '').trim();
    if (!label) return;
    const packlistEntry = packlists.find((p) => p.id === packlistId)!;
    const shaped = ensureVehiclePacklistShape(packlistEntry);
    updatePacklist(packlistId, { items: [...shaped.items, newItem(label)] });
    setNewItemLabels((prev) => ({ ...prev, [packlistId]: '' }));
  };

  const addChecklistPackToPacklist = (packlistId: string) => {
    const checklistGroupId = selectedChecklistGroupByPacklist[packlistId];
    if (!checklistGroupId) return;
    const checklistGroup = checklistGroups.find((group) => group.id === checklistGroupId);
    const packlistEntry = packlists.find((entry) => entry.id === packlistId);
    if (!checklistGroup || !packlistEntry) return;

    const shaped = ensureVehiclePacklistShape(packlistEntry);
    const existingKeys = collectSignatures(packlistEntry);
    const additions: ChecklistItem[] = checklistGroup.items
      .filter((item) => !existingKeys.has(dedupeSignature(item)))
      .map((item) => ({
        id: crypto.randomUUID(),
        label: item.label,
        completed: false,
        quantity: item.quantity ?? 1,
        inventoryItemId: item.inventoryItemId,
        notes: item.notes,
      }));
    if (additions.length === 0) return;

    const existingSectionIndex = shaped.sections.findIndex((section) => section.checklistGroupId === checklistGroup.id);
    let nextSections: VehiclePacklistSection[];
    if (existingSectionIndex >= 0) {
      nextSections = shaped.sections.map((section, index) =>
        index === existingSectionIndex ? { ...section, items: [...section.items, ...additions] } : section,
      );
    } else {
      nextSections = [
        ...shaped.sections,
        {
          id: crypto.randomUUID(),
          title: checklistGroup.title,
          checklistGroupId: checklistGroup.id,
          items: additions,
        },
      ];
    }

    updatePacklist(packlistId, { sections: nextSections });
  };

  const addLinkedItem = (packlistId: string, inv: InventoryItem) => {
    const packlistEntry = packlists.find((p) => p.id === packlistId)!;
    const shaped = ensureVehiclePacklistShape(packlistEntry);
    updatePacklist(packlistId, {
      items: [
        ...shaped.items,
        {
          id: crypto.randomUUID(),
          label: inv.name,
          completed: false,
          quantity: 1,
          inventoryItemId: inv.id,
        },
      ],
    });
  };

  const addBulkLinkedItems = (packlistId: string, selections: BulkSelectionResult[]) => {
    if (selections.length === 0) return;
    const packlistEntry = packlists.find((p) => p.id === packlistId)!;
    const shaped = ensureVehiclePacklistShape(packlistEntry);
    const additions: ChecklistItem[] = selections.map(({ item, status }) => ({
      id: crypto.randomUUID(),
      label: item.name,
      completed: status === 'available',
      quantity: 1,
      inventoryItemId: item.id,
      notes:
        status === 'available'
          ? 'Available'
          : status === 'order'
            ? 'Needs ordering'
            : status === 'schedule'
              ? 'Needs scheduling'
              : 'Needed',
    }));
    updatePacklist(packlistId, { items: [...shaped.items, ...additions] });
  };

  const linkInventoryItem = (packlistId: string, itemId: string, inv: InventoryItem) => {
    updateItemById(packlistId, itemId, { inventoryItemId: inv.id, label: inv.name });
  };

  const filterByQuery = (items: ChecklistItem[]): ChecklistItem[] => {
    const normalizedQuery = listSearchQuery.trim().toLowerCase();
    if (!normalizedQuery) return items;
    return items.filter(
      (item) =>
        item.label.toLowerCase().includes(normalizedQuery) || (item.notes || '').toLowerCase().includes(normalizedQuery)
    );
  };

  const getVisibleItems = (items: ChecklistItem[]): ChecklistItem[] => {
    const filtered = filterPacked(filterByQuery(items), packedFilter);
    return sortItemsCopy(filtered, sortMode);
  };

  const checklistGroupCompletion = (checklistGroupId?: string): 'ok' | 'open' | 'unknown' => {
    if (!checklistGroupId) return 'unknown';
    const group = checklistGroups.find((g) => g.id === checklistGroupId);
    if (!group || group.items.length === 0) return 'unknown';
    return group.items.every((item) => item.completed) ? 'ok' : 'open';
  };

  const renderPacklistLine = (packlistId: string, item: ChecklistItem) => (
    <div key={item.id} className="flex items-center gap-2 px-3 py-2">
      <Checkbox
        checked={item.completed}
        onCheckedChange={(checked) => updateItemById(packlistId, item.id, { completed: Boolean(checked) })}
        title={item.completed ? 'Mark as not packed' : 'Mark as packed'}
      />
      <span className={cn('flex-1 text-sm', item.completed && 'text-muted-foreground')}>
        {item.label}
        {item.completed && (
          <span className="ml-2 rounded border border-green-500/40 bg-green-500/10 px-1.5 py-0.5 text-[10px] font-medium text-green-300">
            Packed
          </span>
        )}
      </span>
      <div className="ml-auto flex shrink-0 items-center gap-2">
        {!readOnly ? (
          <Input
            type="number"
            min={1}
            className="h-7 w-16 text-xs"
            value={item.quantity ?? 1}
            onChange={(event) =>
              updateItemById(packlistId, item.id, {
                quantity: Math.max(1, Number(event.target.value) || 1),
              })
            }
          />
        ) : (
          <span className="w-16 text-right text-xs text-muted-foreground">×{item.quantity ?? 1}</span>
        )}
        <span className="w-12 text-right text-xs text-blue-700 dark:text-blue-300">
          {item.inventoryItemId ? 'linked' : ''}
        </span>
        {!readOnly ? (
          <div className="w-7">
            {inventoryItems.length > 0 && !item.inventoryItemId ? (
              <InventoryItemPicker
                inventoryItems={inventoryItems}
                onSelect={(inv) => linkInventoryItem(packlistId, item.id, inv)}
                title="Link inventory item to packlist"
              />
            ) : null}
          </div>
        ) : null}
        {!readOnly ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" title="Item actions">
                <MoreHorizontal className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {item.inventoryItemId ? (
                <DropdownMenuItem
                  onSelect={(event) => {
                    event.preventDefault();
                    updateItemById(packlistId, item.id, { inventoryItemId: undefined });
                  }}
                >
                  <Unlink className="mr-2 h-3.5 w-3.5" />
                  Unlink item
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onSelect={(event) => {
                  event.preventDefault();
                  runDeleteAction(`item:${packlistId}:${item.id}`, () => removeItem(packlistId, item.id));
                }}
              >
                Delete item
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
    </div>
  );

  if (packlists.length === 0 && readOnly) {
    return <p className="text-sm text-muted-foreground">No vehicle packlists.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="rounded-md border bg-muted/20 p-2">
        <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
          <Input
            placeholder="Search packlist items..."
            value={listSearchQuery}
            onChange={(event) => setListSearchQuery(event.target.value)}
            className="h-8 text-sm"
          />
          <div className="flex items-center gap-2">
            <Select value={packedFilter} onValueChange={(value) => setPackedFilter(value as 'all' | 'open' | 'done')}>
              <SelectTrigger className="h-8 w-full sm:w-[170px]">
                <SelectValue placeholder="Filter packed state" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All status</SelectItem>
                <SelectItem value="open">Not packed</SelectItem>
                <SelectItem value="done">Packed</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={sortMode}
              onValueChange={(value) => setSortMode(value as 'manual' | 'name_asc' | 'name_desc' | 'qty_asc' | 'qty_desc')}
            >
              <SelectTrigger className="h-8 w-full sm:w-[170px]">
                <SelectValue placeholder="Sort" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="manual">Manual order</SelectItem>
                <SelectItem value="name_asc">Name (A-Z)</SelectItem>
                <SelectItem value="name_desc">Name (Z-A)</SelectItem>
                <SelectItem value="qty_asc">Qty (low-high)</SelectItem>
                <SelectItem value="qty_desc">Qty (high-low)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="mt-2 flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8"
            onClick={() => setExpandedPacklistIds(allPacklistIds)}
            disabled={allPacklistIds.length === 0}
          >
            Expand all
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8"
            onClick={() => {
              setExpandedPacklistIds([]);
              setAddItemRowVisibleByPacklistId({});
            }}
            disabled={expandedPacklistIds.length === 0}
          >
            Collapse all
          </Button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Checklist packs stay grouped below. Checkbox marks packed on the truck. A badge appears when the matching
        production checklist still has unchecked lines.
      </p>
      {packlists.map((packlistRaw) => {
        const packlist = ensureVehiclePacklistShape(packlistRaw);
        const allFlat = flattenVehiclePacklistItems(packlist);
        const doneCount = allFlat.filter((i) => i.completed).length;
        return (
          <div key={packlist.id} className="rounded-lg border border-border/90 bg-card/95 p-2.5 shadow-sm">
            <div className="mb-2 flex items-center gap-2 rounded-md border border-border/80 bg-muted/50 px-2 py-1.5">
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0"
                onClick={() => togglePacklistExpanded(packlist.id)}
                title={expandedPacklistIds.includes(packlist.id) ? 'Collapse packlist' : 'Expand packlist'}
              >
                {expandedPacklistIds.includes(packlist.id) ? (
                  <ChevronDown className="h-3.5 w-3.5" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5" />
                )}
              </Button>
              <Truck className="h-4 w-4 shrink-0 text-muted-foreground" />
              {readOnly ? (
                <span className="flex-1 text-sm font-medium">{packlist.vehicleName}</span>
              ) : (
                <Input
                  className="h-7 flex-1 border-none bg-transparent p-0 text-sm font-medium shadow-none focus-visible:ring-0"
                  value={packlist.vehicleName}
                  onChange={(e) => updatePacklist(packlist.id, { vehicleName: e.target.value })}
                />
              )}
              <span className="rounded bg-background/80 px-1.5 py-0.5 text-xs text-muted-foreground">
                {doneCount}/{allFlat.length} packed
              </span>
              {!readOnly && (
                <Button
                  type="button"
                  variant={addItemRowVisibleByPacklistId[packlist.id] ? 'secondary' : 'ghost'}
                  size="icon"
                  className="h-6 w-6 shrink-0"
                  title={addItemRowVisibleByPacklistId[packlist.id] ? 'Hide add-item row' : 'Add items to this packlist'}
                  aria-pressed={addItemRowVisibleByPacklistId[packlist.id] ? true : false}
                  onClick={(event) => {
                    event.stopPropagation();
                    toggleAddItemRowForPacklist(packlist.id);
                  }}
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              )}
              {!readOnly && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" title="Packlist actions">
                      <MoreHorizontal className="h-3.5 w-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onSelect={(event) => {
                        event.preventDefault();
                        toggleAddItemRowForPacklist(packlist.id);
                      }}
                    >
                      <Plus className="mr-2 h-3.5 w-3.5" />
                      {addItemRowVisibleByPacklistId[packlist.id] ? 'Hide add items row' : 'Add items…'}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onSelect={(event) => {
                        event.preventDefault();
                        runDeleteAction(`packlist:${packlist.id}`, () => removePacklist(packlist.id));
                      }}
                    >
                      Delete packlist
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>

            {expandedPacklistIds.includes(packlist.id) && <div className="space-y-2">
              {(packlist.sections ?? []).map((section) => {
                if (section.items.length === 0) return null;
                const visible = getVisibleItems(section.items);
                if (visible.length === 0) {
                  return null;
                }
                const completion = checklistGroupCompletion(section.checklistGroupId);
                const titleNode = (
                  <span className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                    <span className="truncate font-medium">{section.title}</span>
                    {completion === 'open' ? (
                      <Badge variant="outline" className="shrink-0 gap-1 border-amber-500/50 text-amber-700 dark:text-amber-300">
                        <AlertTriangle className="h-3 w-3" aria-hidden />
                        Checklist open
                      </Badge>
                    ) : null}
                    {!readOnly && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="ml-auto h-7 shrink-0 text-xs text-destructive hover:text-destructive"
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          runDeleteAction(`section:${packlist.id}:${section.id}`, () => removeSection(packlist.id, section.id));
                        }}
                      >
                        Remove pack
                      </Button>
                    )}
                  </span>
                );
                return (
                  <OptionalFormCollapsible key={section.id} title={titleNode} className="text-sm">
                    <div className="divide-y rounded-md border border-border/50">{visible.map((item) => renderPacklistLine(packlist.id, item))}</div>
                  </OptionalFormCollapsible>
                );
              })}
            </div>}

            {expandedPacklistIds.includes(packlist.id) && (packlist.sections ?? []).length > 0 && getVisibleItems(packlist.items).length > 0 ? (
              <div className="px-3 pt-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Loose items on this truck
              </div>
            ) : null}
            {expandedPacklistIds.includes(packlist.id) && <div className="divide-y rounded-md border border-border/70 bg-background">
              {getVisibleItems(packlist.items).map((item) => renderPacklistLine(packlist.id, item))}
              {packlist.items.length === 0 && (packlist.sections ?? []).length === 0 && (
                <p className="px-3 py-2 text-xs text-muted-foreground">No items yet.</p>
              )}
            </div>}

            {!readOnly && expandedPacklistIds.includes(packlist.id) && addItemRowVisibleByPacklistId[packlist.id] && (
              <div className="mt-2 flex flex-wrap gap-2 rounded-md border border-dashed border-border/80 px-3 py-2">
                <Input
                  placeholder="Add item..."
                  className="h-7 min-w-[120px] flex-1 text-sm"
                  value={newItemLabels[packlist.id] ?? ''}
                  onChange={(e) => setNewItemLabels((prev) => ({ ...prev, [packlist.id]: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addItem(packlist.id);
                    }
                  }}
                />
                {checklistGroups.length > 0 && (
                  <>
                    <Select
                      value={selectedChecklistGroupByPacklist[packlist.id] || 'none'}
                      onValueChange={(value) =>
                        setSelectedChecklistGroupByPacklist((previous) => ({
                          ...previous,
                          [packlist.id]: value === 'none' ? '' : value,
                        }))
                      }
                    >
                      <SelectTrigger className="h-7 min-w-[170px] text-xs">
                        <SelectValue placeholder="Checklist pack" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Checklist pack</SelectItem>
                        {checklistGroups.map((group) => (
                          <SelectItem key={group.id} value={group.id}>
                            {group.title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 shrink-0 text-xs"
                      disabled={!selectedChecklistGroupByPacklist[packlist.id]}
                      onClick={() => addChecklistPackToPacklist(packlist.id)}
                    >
                      Add Pack
                    </Button>
                  </>
                )}
                <Button variant="outline" size="sm" className="h-7 shrink-0" onClick={() => addItem(packlist.id)}>
                  <Plus className="h-3.5 w-3.5" />
                </Button>
                {inventoryItems.length > 0 && (
                  <>
                    <InventoryItemPicker
                      inventoryItems={inventoryItems}
                      onSelect={(inv) => addLinkedItem(packlist.id, inv)}
                      title="Add inventory item to packlist"
                      triggerClassName="h-7 w-7 shrink-0"
                    />
                    <BulkInventorySelectionDialog
                      inventoryItems={inventoryItems}
                      onApply={(items) => addBulkLinkedItems(packlist.id, items)}
                      buttonLabel="Bulk Pick"
                    />
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}
      {!readOnly && (
        <div className="flex gap-2">
          <Input
            placeholder="Vehicle / kit name..."
            className="h-8 text-sm"
            value={newVehicleName}
            onChange={(e) => setNewVehicleName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addPacklist();
              }
            }}
          />
          <Button variant="outline" size="sm" className="h-8 shrink-0 gap-1" onClick={addPacklist}>
            <Plus className="h-3.5 w-3.5" />
            Add Vehicle
          </Button>
        </div>
      )}
      <AlertDialog open={Boolean(pendingDelete)} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm delete</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete?.kind === 'packlist'
                ? 'Delete this vehicle packlist and all items in it?'
                : pendingDelete?.kind === 'section'
                  ? 'Remove this checklist pack from the vehicle (lines in the production checklist are not deleted)?'
                  : 'Delete this packlist item?'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel type="button">Cancel</AlertDialogCancel>
            <AlertDialogAction
              type="button"
              onClick={() => {
                if (!pendingDelete) return;
                if (pendingDelete.kind === 'packlist') {
                  removePacklist(pendingDelete.packlistId);
                } else if (pendingDelete.kind === 'section') {
                  removeSection(pendingDelete.packlistId, pendingDelete.sectionId);
                } else if (pendingDelete.kind === 'item') {
                  removeItem(pendingDelete.packlistId, pendingDelete.itemId);
                }
                setPendingDelete(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
