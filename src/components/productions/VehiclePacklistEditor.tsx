import { useEffect, useId, useMemo, useState } from 'react';
import {
  Plus,
  Truck,
  Unlink,
  AlertTriangle,
  MoreHorizontal,
  ChevronDown,
  ChevronRight,
  GripVertical,
  Layers,
  Link2,
  Pencil,
} from 'lucide-react';
import { VehiclePacklist, VehiclePacklistSection, ChecklistItem, ChecklistGroup } from '@/types/productions';
import { InventoryItem } from '@/types/inventory';
import { Button } from '@/components/ui/button';
import { ListExpandAllSwitch } from '@/components/ui/list-expand-all-switch';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { LineCompletionBadge } from '@/components/list-rows';
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
import { getStableGroupAccentHex } from '@/lib/groupAccentColor';

const LOOSE_SECTION_KEY = '__loose__';

function sectionExpandKey(packlistId: string, sectionId: string): string {
  return `${packlistId}::${sectionId}`;
}

function looseExpandKey(packlistId: string): string {
  return `${packlistId}::${LOOSE_SECTION_KEY}`;
}

function reorderById<T extends { id: string }>(items: T[], sourceId: string, targetId: string): T[] {
  if (sourceId === targetId) return items;
  const sourceIndex = items.findIndex((item) => item.id === sourceId);
  const targetIndex = items.findIndex((item) => item.id === targetId);
  if (sourceIndex < 0 || targetIndex < 0) return items;
  const next = [...items];
  const [moved] = next.splice(sourceIndex, 1);
  next.splice(targetIndex, 0, moved);
  return next;
}

interface VehiclePacklistEditorProps {
  packlists: VehiclePacklist[];
  onChange: (packlists: VehiclePacklist[]) => void;
  checklistGroups?: ChecklistGroup[];
  /** Mirror packed/checked lines in linked checklist sections back onto production checklist groups. */
  onChecklistGroupsChange?: (groups: ChecklistGroup[]) => void;
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

function getPacklistItemLinkContext(
  packlist: VehiclePacklist,
  itemId: string,
): { item: ChecklistItem; checklistGroupId?: string } | null {
  const shaped = ensureVehiclePacklistShape(packlist);
  for (const section of shaped.sections) {
    const item = section.items.find((line) => line.id === itemId);
    if (item) return { item, checklistGroupId: section.checklistGroupId };
  }
  const loose = shaped.items.find((line) => line.id === itemId);
  if (loose) return { item: loose };
  return null;
}

function mirrorCompletionOntoChecklistGroups(
  groups: ChecklistGroup[],
  checklistGroupId: string,
  packItem: ChecklistItem,
  completed: boolean,
): ChecklistGroup[] | null {
  const gi = groups.findIndex((g) => g.id === checklistGroupId);
  if (gi < 0) return null;
  const group = groups[gi];
  const match = group.items.find((c) =>
    packItem.inventoryItemId
      ? c.inventoryItemId === packItem.inventoryItemId
      : dedupeSignature(c) === dedupeSignature(packItem),
  );
  if (!match || match.completed === completed) return null;
  const nextItems = group.items.map((it) => (it.id === match.id ? { ...it, completed } : it));
  const next = [...groups];
  next[gi] = { ...group, items: nextItems };
  return next;
}

export function VehiclePacklistEditor({
  packlists,
  onChange,
  checklistGroups = [],
  onChecklistGroupsChange,
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
  /** `${packlistId}::${sectionId}` or `${packlistId}::__loose__` */
  const [expandedNestedKeys, setExpandedNestedKeys] = useState<string[]>([]);
  const [inlineAddOpenByPacklist, setInlineAddOpenByPacklist] = useState<Record<string, boolean>>({});
  const [draggingPacklistId, setDraggingPacklistId] = useState<string | null>(null);
  const [draggingSection, setDraggingSection] = useState<{ packlistId: string; sectionId: string } | null>(null);
  const [draggingItem, setDraggingItem] = useState<
    | { packlistId: string; itemId: string; scope: 'loose' }
    | { packlistId: string; itemId: string; scope: 'section'; sectionId: string }
    | null
  >(null);
  const [renamingPacklistId, setRenamingPacklistId] = useState<string | null>(null);
  const [renamingPacklistText, setRenamingPacklistText] = useState('');

  const allPacklistIds = useMemo(() => packlists.map((packlist) => packlist.id), [packlists]);

  const allNestedExpandKeys = useMemo(() => {
    const keys: string[] = [];
    for (const packlistEntry of packlists) {
      const shaped = ensureVehiclePacklistShape(packlistEntry);
      for (const section of shaped.sections) {
        if (section.items.length > 0) keys.push(sectionExpandKey(packlistEntry.id, section.id));
      }
      if (shaped.items.length > 0) keys.push(looseExpandKey(packlistEntry.id));
    }
    return keys;
  }, [packlists]);

  const expandAllSwitchId = useId();
  const allSectionsExpanded = useMemo(() => {
    if (allPacklistIds.length === 0) return false;
    const vehiclesExpanded =
      expandedPacklistIds.length === allPacklistIds.length &&
      allPacklistIds.every((id) => expandedPacklistIds.includes(id));
    const nestedExpanded =
      allNestedExpandKeys.length === 0 ||
      allNestedExpandKeys.every((key) => expandedNestedKeys.includes(key));
    return vehiclesExpanded && nestedExpanded;
  }, [allPacklistIds, expandedPacklistIds, allNestedExpandKeys, expandedNestedKeys]);

  useEffect(() => {
    const validIds = new Set(packlists.map((packlist) => packlist.id));
    setExpandedPacklistIds((previous) => {
      const filtered = previous.filter((id) => validIds.has(id));
      const existing = new Set(filtered);
      const appended = packlists.map((p) => p.id).filter((id) => !existing.has(id));
      return [...filtered, ...appended];
    });
    setInlineAddOpenByPacklist((prev) => {
      const next = { ...prev };
      for (const id of Object.keys(next)) {
        if (!validIds.has(id)) delete next[id];
      }
      return next;
    });
    const validNested = new Set<string>();
    for (const packlistEntry of packlists) {
      const shaped = ensureVehiclePacklistShape(packlistEntry);
      for (const section of shaped.sections) {
        validNested.add(sectionExpandKey(packlistEntry.id, section.id));
      }
      if (shaped.items.length > 0) validNested.add(looseExpandKey(packlistEntry.id));
    }
    setExpandedNestedKeys((previous) => previous.filter((key) => validNested.has(key)));
    setRenamingPacklistId((id) => (id && validIds.has(id) ? id : null));
  }, [packlists]);

  useEffect(() => {
    const expandedVehicles = new Set(expandedPacklistIds);
    setExpandedNestedKeys((previous) =>
      previous.filter((key) => {
        const vehicleId = key.split('::')[0];
        return expandedVehicles.has(vehicleId);
      }),
    );
  }, [expandedPacklistIds]);

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
    const nextPacklist = upsertVehiclePacklistItemById(entry, itemId, (item) => ({ ...item, ...updates }));
    updatePacklist(packlistId, nextPacklist);

    if (
      onChecklistGroupsChange &&
      updates.completed !== undefined &&
      checklistGroups.length > 0
    ) {
      const ctx = getPacklistItemLinkContext(nextPacklist, itemId);
      const gid = ctx?.checklistGroupId;
      if (ctx && gid) {
        const mirrored = mirrorCompletionOntoChecklistGroups(
          checklistGroups,
          gid,
          ctx.item,
          Boolean(updates.completed),
        );
        if (mirrored) onChecklistGroupsChange(mirrored);
      }
    }
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

  const movePacklistOrder = (sourceId: string, targetId: string) => {
    if (sourceId === targetId) return;
    const sourceIndex = packlists.findIndex((p) => p.id === sourceId);
    const targetIndex = packlists.findIndex((p) => p.id === targetId);
    if (sourceIndex < 0 || targetIndex < 0) return;
    const next = [...packlists];
    const [moved] = next.splice(sourceIndex, 1);
    next.splice(targetIndex, 0, moved);
    onChange(next);
  };

  const moveSectionOrder = (packlistId: string, sourceSectionId: string, targetSectionId: string) => {
    if (sourceSectionId === targetSectionId) return;
    const entry = packlists.find((p) => p.id === packlistId);
    if (!entry) return;
    const shaped = ensureVehiclePacklistShape(entry);
    updatePacklist(packlistId, { sections: reorderById(shaped.sections, sourceSectionId, targetSectionId) });
  };

  const moveItemInSection = (packlistId: string, sectionId: string, sourceItemId: string, targetItemId: string) => {
    const entry = packlists.find((p) => p.id === packlistId);
    if (!entry) return;
    const shaped = ensureVehiclePacklistShape(entry);
    const sections = shaped.sections.map((section) =>
      section.id === sectionId
        ? { ...section, items: reorderById(section.items, sourceItemId, targetItemId) }
        : section,
    );
    updatePacklist(packlistId, { sections });
  };

  const moveLooseItem = (packlistId: string, sourceItemId: string, targetItemId: string) => {
    const entry = packlists.find((p) => p.id === packlistId);
    if (!entry) return;
    const shaped = ensureVehiclePacklistShape(entry);
    updatePacklist(packlistId, { items: reorderById(shaped.items, sourceItemId, targetItemId) });
  };

  const toggleNestedExpanded = (key: string) => {
    setExpandedNestedKeys((previous) =>
      previous.includes(key) ? previous.filter((k) => k !== key) : [...previous, key],
    );
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

  const resolveInventoryName = (inventoryId?: string) =>
    inventoryId ? inventoryItems.find((inv) => inv.id === inventoryId)?.name : undefined;

  const renderPacklistLine = (
    packlistId: string,
    item: ChecklistItem,
    ctx: { scope: 'loose' } | { scope: 'section'; sectionId: string },
  ) => {
    const invName = resolveInventoryName(item.inventoryItemId);
    const dragPayload =
      ctx.scope === 'loose'
        ? { packlistId, itemId: item.id, scope: 'loose' as const }
        : { packlistId, itemId: item.id, scope: 'section' as const, sectionId: ctx.sectionId };

    return (
      <div
        key={item.id}
        className="flex items-center gap-2 px-3 py-2"
        draggable={!readOnly}
        onDragStart={() => setDraggingItem(dragPayload)}
        onDragOver={(event) => {
          if (!draggingItem || draggingItem.packlistId !== packlistId) return;
          if (ctx.scope === 'loose') {
            if (draggingItem.scope !== 'loose') return;
          } else if (
            draggingItem.scope !== 'section' ||
            draggingItem.sectionId !== ctx.sectionId
          ) {
            return;
          }
          event.preventDefault();
        }}
        onDrop={() => {
          if (!draggingItem || draggingItem.packlistId !== packlistId) return;
          if (ctx.scope === 'loose') {
            if (draggingItem.scope !== 'loose') return;
            moveLooseItem(packlistId, draggingItem.itemId, item.id);
          } else {
            if (draggingItem.scope !== 'section' || draggingItem.sectionId !== ctx.sectionId) return;
            moveItemInSection(packlistId, ctx.sectionId, draggingItem.itemId, item.id);
          }
          setDraggingItem(null);
        }}
        onDragEnd={() => setDraggingItem(null)}
      >
        {!readOnly && <GripVertical className="h-3.5 w-3.5 shrink-0 cursor-grab text-muted-foreground" />}
        <Checkbox
          className="focus-visible:ring-1 focus-visible:ring-offset-1"
          checked={item.completed}
          onCheckedChange={(checked) => updateItemById(packlistId, item.id, { completed: Boolean(checked) })}
          title={item.completed ? 'Mark as not packed' : 'Mark as packed'}
        />
        <span className={cn('flex-1 text-sm', item.completed && 'text-muted-foreground')}>
          {item.label}
          {invName && item.inventoryItemId && item.label !== invName && (
            <span className="ml-1 text-xs text-muted-foreground">({invName})</span>
          )}
          {item.inventoryItemId && (
            <Link2 className="ml-1 inline h-3 w-3 shrink-0 text-blue-600 dark:text-blue-400" aria-hidden />
          )}
        </span>
        {item.completed && <LineCompletionBadge kind="packed" />}
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
          <span className="text-xs text-muted-foreground">×{item.quantity ?? 1}</span>
        )}
        {!readOnly && inventoryItems.length > 0 && !item.inventoryItemId ? (
          <InventoryItemPicker
            inventoryItems={inventoryItems}
            onSelect={(inv) => linkInventoryItem(packlistId, item.id, inv)}
            title="Link inventory item to packlist"
          />
        ) : null}
        {!readOnly && (
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
        )}
      </div>
    );
  };

  if (packlists.length === 0 && readOnly) {
    return <p className="text-sm text-muted-foreground">No vehicle packlists.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="rounded-md border bg-muted/20 p-2">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            placeholder="Search packlist items..."
            value={listSearchQuery}
            onChange={(event) => setListSearchQuery(event.target.value)}
            className="h-8 min-w-[min(100%,12rem)] flex-1 text-sm"
          />
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
          <ListExpandAllSwitch
            className="sm:ml-auto"
            id={expandAllSwitchId}
            label="Expand all"
            allExpanded={allSectionsExpanded}
            onExpandAll={() => {
              setExpandedPacklistIds([...allPacklistIds]);
              setExpandedNestedKeys([...allNestedExpandKeys]);
            }}
            onCollapseAll={() => {
              setExpandedPacklistIds([]);
              setExpandedNestedKeys([]);
            }}
            disabled={allPacklistIds.length === 0}
          />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Checkboxes mark packed items on the truck. A badge appears when the matching production checklist still has open
        lines.
      </p>
      {packlists.map((packlistRaw) => {
        const packlist = ensureVehiclePacklistShape(packlistRaw);
        const allFlat = flattenVehiclePacklistItems(packlist);
        const doneCount = allFlat.filter((i) => i.completed).length;
        return (
          <div
            key={packlist.id}
            className="rounded-lg border border-border/90 bg-card/95 p-2.5 shadow-sm"
            style={{ borderLeftColor: getStableGroupAccentHex(packlist.vehicleName), borderLeftWidth: '4px' }}
          >
            <div
              className="mb-2 flex items-center gap-2 rounded-md border border-border/80 bg-muted px-2 py-1.5 shadow-md dark:bg-muted/75"
              draggable={!readOnly}
              onDragStart={(event) => {
                if ((event.target as HTMLElement).closest('input,button,a,[role="menuitem"]')) {
                  event.preventDefault();
                  return;
                }
                setDraggingPacklistId(packlist.id);
              }}
              onDragOver={(event) => {
                if (!draggingPacklistId) return;
                event.preventDefault();
              }}
              onDrop={(event) => {
                event.preventDefault();
                if (draggingPacklistId) {
                  movePacklistOrder(draggingPacklistId, packlist.id);
                }
                setDraggingPacklistId(null);
              }}
              onDragEnd={() => setDraggingPacklistId(null)}
              onDoubleClick={(event) => {
                if ((event.target as HTMLElement).closest('button,input,a,[role="menuitem"]')) return;
                setExpandedPacklistIds((previous) =>
                  previous.includes(packlist.id)
                    ? previous.filter((id) => id !== packlist.id)
                    : [...previous, packlist.id],
                );
              }}
            >
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  'h-7 w-7 shrink-0 rounded-md border border-transparent bg-background/90 shadow-sm transition-colors hover:bg-background dark:bg-background/60',
                  !expandedPacklistIds.includes(packlist.id) &&
                    allFlat.length > 0 &&
                    'border-primary/30 text-primary ring-1 ring-primary/20 ring-offset-1 ring-offset-background',
                )}
                onClick={() =>
                  setExpandedPacklistIds((previous) =>
                    previous.includes(packlist.id)
                      ? previous.filter((id) => id !== packlist.id)
                      : [...previous, packlist.id],
                  )
                }
                title={expandedPacklistIds.includes(packlist.id) ? 'Collapse vehicle' : 'Expand vehicle'}
                aria-expanded={expandedPacklistIds.includes(packlist.id)}
              >
                {expandedPacklistIds.includes(packlist.id) ? (
                  <ChevronDown className="h-3.5 w-3.5" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5" />
                )}
              </Button>
              {!readOnly && <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-muted-foreground" />}
              <Truck className="h-4 w-4 shrink-0 text-muted-foreground" />
              {readOnly ? (
                <span className="flex-1 min-w-0 text-sm font-medium">{packlist.vehicleName}</span>
              ) : renamingPacklistId === packlist.id ? (
                <Input
                  className="h-7 min-w-0 flex-1 border-input bg-background px-2 text-sm font-medium shadow-sm focus-visible:ring-2"
                  value={renamingPacklistText}
                  autoFocus
                  onChange={(e) => setRenamingPacklistText(e.target.value)}
                  onBlur={() => {
                    const next = renamingPacklistText.trim();
                    if (next.length > 0) updatePacklist(packlist.id, { vehicleName: next });
                    setRenamingPacklistId(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      (e.target as HTMLInputElement).blur();
                    }
                    if (e.key === 'Escape') {
                      e.preventDefault();
                      setRenamingPacklistText(packlist.vehicleName);
                      setRenamingPacklistId(null);
                    }
                  }}
                />
              ) : (
                <span className="flex-1 min-w-0 truncate px-1.5 py-1 text-left text-sm font-medium leading-snug">
                  {packlist.vehicleName?.trim() ? packlist.vehicleName : 'Untitled vehicle'}
                </span>
              )}
              <Badge
                variant="secondary"
                className={cn(
                  'shrink-0 gap-1 tabular-nums text-xs font-semibold shadow-sm',
                  allFlat.length > 0 && 'border border-primary/20 bg-primary/10 text-foreground dark:bg-primary/15',
                )}
                title={
                  allFlat.length === 1 ? '1 line on this vehicle' : `${allFlat.length} lines on this vehicle`
                }
              >
                <Layers className="h-3 w-3 opacity-80" aria-hidden />
                {doneCount}/{allFlat.length}
              </Badge>
              {!readOnly && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0"
                  title="Add lines to this vehicle"
                  onClick={() => {
                    setExpandedPacklistIds((previous) =>
                      previous.includes(packlist.id) ? previous : [...previous, packlist.id],
                    );
                    setInlineAddOpenByPacklist((prev) => ({ ...prev, [packlist.id]: true }));
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
                        setRenamingPacklistId(packlist.id);
                        setRenamingPacklistText(packlist.vehicleName);
                      }}
                    >
                      <Pencil className="mr-2 h-3.5 w-3.5" />
                      Rename vehicle
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

            {expandedPacklistIds.includes(packlist.id) && (
              <div className="space-y-2">
                {(packlist.sections ?? []).map((section) => {
                  if (section.items.length === 0) return null;
                  const visible = getVisibleItems(section.items);
                  if (visible.length === 0) return null;
                  const completion = checklistGroupCompletion(section.checklistGroupId);
                  const nestKey = sectionExpandKey(packlist.id, section.id);
                  const sectionOpen = expandedNestedKeys.includes(nestKey);
                  return (
                    <div
                      key={section.id}
                      className="rounded-lg border border-border/80 bg-background/80 p-2.5 shadow-sm dark:bg-background/40"
                      style={{
                        borderLeftColor: getStableGroupAccentHex(section.title),
                        borderLeftWidth: '4px',
                      }}
                    >
                      <div
                        className="mb-2 flex items-center gap-2 rounded-md border border-border/60 bg-muted/45 px-2 py-1.5 shadow-sm dark:bg-muted/35"
                        draggable={!readOnly}
                        onDragStart={(event) => {
                          if ((event.target as HTMLElement).closest('button,input,a,[role="menuitem"]')) {
                            event.preventDefault();
                            return;
                          }
                          setDraggingSection({ packlistId: packlist.id, sectionId: section.id });
                        }}
                        onDragOver={(event) => {
                          if (
                            !draggingSection ||
                            draggingSection.packlistId !== packlist.id ||
                            draggingSection.sectionId === section.id
                          ) {
                            return;
                          }
                          event.preventDefault();
                        }}
                        onDrop={() => {
                          if (
                            draggingSection &&
                            draggingSection.packlistId === packlist.id &&
                            draggingSection.sectionId !== section.id
                          ) {
                            moveSectionOrder(packlist.id, draggingSection.sectionId, section.id);
                          }
                          setDraggingSection(null);
                        }}
                        onDragEnd={() => setDraggingSection(null)}
                        onDoubleClick={(event) => {
                          if ((event.target as HTMLElement).closest('button,input,a,[role="menuitem"]')) return;
                          toggleNestedExpanded(nestKey);
                        }}
                      >
                        <Button
                          variant="ghost"
                          size="icon"
                          className={cn(
                            'h-7 w-7 shrink-0 rounded-md border border-transparent bg-background/90 shadow-sm transition-colors hover:bg-background dark:bg-background/60',
                            !sectionOpen &&
                              visible.length > 0 &&
                              'border-primary/30 text-primary ring-1 ring-primary/20 ring-offset-1 ring-offset-background',
                          )}
                          onClick={() => toggleNestedExpanded(nestKey)}
                          title={sectionOpen ? 'Collapse checklist pack' : 'Expand checklist pack'}
                          aria-expanded={sectionOpen}
                        >
                          {sectionOpen ? (
                            <ChevronDown className="h-3.5 w-3.5" />
                          ) : (
                            <ChevronRight className="h-3.5 w-3.5" />
                          )}
                        </Button>
                        {!readOnly && (
                          <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-muted-foreground" />
                        )}
                        <span className="flex min-w-0 flex-1 flex-wrap items-center gap-2 px-1.5 py-1 text-sm font-medium leading-snug">
                          <span className="line-clamp-2 min-w-0 break-words">{section.title}</span>
                          {completion === 'open' ? (
                            <Badge
                              variant="outline"
                              className="shrink-0 gap-1 border-amber-500/50 text-amber-700 dark:text-amber-300"
                            >
                              <AlertTriangle className="h-3 w-3" aria-hidden />
                              Checklist open
                            </Badge>
                          ) : null}
                        </span>
                        <Badge
                          variant="secondary"
                          className={cn(
                            'shrink-0 gap-1 tabular-nums font-semibold shadow-sm',
                            section.items.length > 0 &&
                              'border border-primary/20 bg-primary/10 text-foreground dark:bg-primary/15',
                          )}
                          title={
                            section.items.length === 1
                              ? '1 line in this pack'
                              : `${section.items.length} lines in this pack`
                          }
                        >
                          <Layers className="h-3 w-3 opacity-80" aria-hidden />
                          {section.items.length}
                        </Badge>
                        {!readOnly && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 shrink-0"
                                title="Checklist pack actions"
                                onClick={(event) => event.stopPropagation()}
                                onPointerDown={(event) => event.stopPropagation()}
                              >
                                <MoreHorizontal className="h-3.5 w-3.5" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onSelect={(event) => {
                                  event.preventDefault();
                                  runDeleteAction(`section:${packlist.id}:${section.id}`, () =>
                                    removeSection(packlist.id, section.id),
                                  );
                                }}
                              >
                                Remove pack
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>
                      {sectionOpen && (
                        <div className="ml-3 border-l-2 border-border/55 pl-3 md:ml-4 md:pl-4">
                          <div className="divide-y rounded-md border border-border/70 bg-background">
                            {visible.map((item) =>
                              renderPacklistLine(packlist.id, item, {
                                scope: 'section',
                                sectionId: section.id,
                              }),
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}

                {packlist.items.length > 0 ? (
                  <div
                    className="rounded-lg border border-border/80 bg-background/80 p-2.5 shadow-sm dark:bg-background/40"
                    style={{
                      borderLeftColor: getStableGroupAccentHex(`${packlist.vehicleName}-loose`),
                      borderLeftWidth: '4px',
                    }}
                  >
                    <div
                      className="mb-2 flex items-center gap-2 rounded-md border border-border/60 bg-muted/45 px-2 py-1.5 shadow-sm dark:bg-muted/35"
                      onDoubleClick={(event) => {
                        if ((event.target as HTMLElement).closest('button,input,a,[role="menuitem"]')) return;
                        toggleNestedExpanded(looseExpandKey(packlist.id));
                      }}
                    >
                      <Button
                        variant="ghost"
                        size="icon"
                        className={cn(
                          'h-7 w-7 shrink-0 rounded-md border border-transparent bg-background/90 shadow-sm transition-colors hover:bg-background dark:bg-background/60',
                          !expandedNestedKeys.includes(looseExpandKey(packlist.id)) &&
                            packlist.items.length > 0 &&
                            'border-primary/30 text-primary ring-1 ring-primary/20 ring-offset-1 ring-offset-background',
                        )}
                        onClick={() => toggleNestedExpanded(looseExpandKey(packlist.id))}
                        title={
                          expandedNestedKeys.includes(looseExpandKey(packlist.id))
                            ? 'Collapse loose items'
                            : 'Expand loose items'
                        }
                        aria-expanded={expandedNestedKeys.includes(looseExpandKey(packlist.id))}
                      >
                        {expandedNestedKeys.includes(looseExpandKey(packlist.id)) ? (
                          <ChevronDown className="h-3.5 w-3.5" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5" />
                        )}
                      </Button>
                      <span className="flex-1 px-1.5 py-1 text-sm font-medium">Loose items on this truck</span>
                      <Badge
                        variant="secondary"
                        className={cn(
                          'shrink-0 gap-1 tabular-nums font-semibold shadow-sm',
                          packlist.items.length > 0 &&
                            'border border-primary/20 bg-primary/10 text-foreground dark:bg-primary/15',
                        )}
                      >
                        <Layers className="h-3 w-3 opacity-80" aria-hidden />
                        {packlist.items.length}
                      </Badge>
                    </div>
                    {expandedNestedKeys.includes(looseExpandKey(packlist.id)) && (
                      <div className="ml-3 border-l-2 border-border/55 pl-3 md:ml-4 md:pl-4">
                        <div className="divide-y rounded-md border border-border/70 bg-background">
                          {getVisibleItems(packlist.items).map((item) =>
                            renderPacklistLine(packlist.id, item, { scope: 'loose' }),
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ) : null}

                {packlist.items.length === 0 && (packlist.sections ?? []).length === 0 ? (
                  <p className="px-2 py-3 text-xs text-muted-foreground">No items yet.</p>
                ) : null}
              </div>
            )}

            {!readOnly && expandedPacklistIds.includes(packlist.id) && inlineAddOpenByPacklist[packlist.id] && (
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
