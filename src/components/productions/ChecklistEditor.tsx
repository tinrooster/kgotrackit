import { useEffect, useState } from 'react';
import { Plus, Trash2, GripVertical, Link2, Unlink, ChevronDown, ChevronRight, Pencil } from 'lucide-react';
import { ChecklistGroup, ChecklistItem } from '@/types/productions';
import { InventoryItem } from '@/types/inventory';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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

interface ChecklistEditorProps {
  groups: ChecklistGroup[];
  onChange: (groups: ChecklistGroup[]) => void;
  inventoryItems?: InventoryItem[];
  /** When true, renders compact read-only checkboxes only (no edit controls). */
  readOnly?: boolean;
  requireDeleteConfirm?: boolean;
}

function newItem(label: string): ChecklistItem {
  return { id: crypto.randomUUID(), label, completed: false };
}

function newGroup(title: string): ChecklistGroup {
  return { id: crypto.randomUUID(), title, items: [] };
}

export function ChecklistEditor({
  groups,
  onChange,
  inventoryItems = [],
  readOnly = false,
  requireDeleteConfirm = false,
}: ChecklistEditorProps) {
  const [newGroupTitle, setNewGroupTitle] = useState('');
  const [newItemLabels, setNewItemLabels] = useState<Record<string, string>>({});
  const [pendingDelete, setPendingDelete] = useState<{ groupId?: string; itemId?: string } | null>(null);
  const [expandedGroupIds, setExpandedGroupIds] = useState<string[]>([]);

  useEffect(() => {
    const validIds = new Set(groups.map((group) => group.id));
    setExpandedGroupIds((previous) => previous.filter((id) => validIds.has(id)));
  }, [groups]);
  const [draggingItem, setDraggingItem] = useState<{ groupId: string; itemId: string } | null>(null);
  const [editingItem, setEditingItem] = useState<{ groupId: string; itemId: string } | null>(null);
  const [editingLabel, setEditingLabel] = useState('');
  const [listSearchQuery, setListSearchQuery] = useState('');
  const [completionFilter, setCompletionFilter] = useState<'all' | 'open' | 'done'>('all');
  const [sortMode, setSortMode] = useState<'manual' | 'name_asc' | 'name_desc' | 'qty_asc' | 'qty_desc'>('manual');
  const runDeleteAction = (deleteKey: string, deleteAction: () => void) => {
    if (!requireDeleteConfirm) {
      deleteAction();
      return;
    }
    if (deleteKey.startsWith('group:')) {
      setPendingDelete({ groupId: deleteKey.replace('group:', '') });
      return;
    }
    if (deleteKey.startsWith('item:')) {
      setPendingDelete({ itemId: deleteKey.replace('item:', '') });
    }
  };


  const updateGroup = (groupId: string, updates: Partial<ChecklistGroup>) => {
    onChange(groups.map((g) => (g.id === groupId ? { ...g, ...updates } : g)));
  };

  const removeGroup = (groupId: string) => {
    onChange(groups.filter((g) => g.id !== groupId));
  };

  const addGroup = () => {
    const title = newGroupTitle.trim();
    if (!title) return;
    onChange([...groups, newGroup(title)]);
    setNewGroupTitle('');
  };

  const updateItem = (groupId: string, itemId: string, updates: Partial<ChecklistItem>) => {
    updateGroup(groupId, {
      items: groups.find((g) => g.id === groupId)!.items.map((item) =>
        item.id === itemId ? { ...item, ...updates } : item
      ),
    });
  };

  const removeItem = (groupId: string, itemId: string) => {
    const group = groups.find((g) => g.id === groupId)!;
    updateGroup(groupId, { items: group.items.filter((i) => i.id !== itemId) });
  };

  const addItem = (groupId: string) => {
    const label = (newItemLabels[groupId] ?? '').trim();
    if (!label) return;
    const group = groups.find((g) => g.id === groupId)!;
    updateGroup(groupId, { items: [...group.items, newItem(label)] });
    setNewItemLabels((prev) => ({ ...prev, [groupId]: '' }));
  };

  const toggleGroupExpanded = (groupId: string) => {
    setExpandedGroupIds((previous) =>
      previous.includes(groupId)
        ? previous.filter((id) => id !== groupId)
        : [...previous, groupId]
    );
  };

  const moveItemInGroup = (groupId: string, sourceItemId: string, targetItemId: string) => {
    if (sourceItemId === targetItemId) return;
    const group = groups.find((g) => g.id === groupId);
    if (!group) return;
    const sourceIndex = group.items.findIndex((item) => item.id === sourceItemId);
    const targetIndex = group.items.findIndex((item) => item.id === targetItemId);
    if (sourceIndex < 0 || targetIndex < 0) return;
    const reorderedItems = [...group.items];
    const [moved] = reorderedItems.splice(sourceIndex, 1);
    reorderedItems.splice(targetIndex, 0, moved);
    updateGroup(groupId, { items: reorderedItems });
  };

  const addLinkedItem = (groupId: string, inv: InventoryItem) => {
    const group = groups.find((g) => g.id === groupId)!;
    updateGroup(groupId, {
      items: [
        ...group.items,
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

  const addBulkLinkedItems = (groupId: string, selections: BulkSelectionResult[]) => {
    if (selections.length === 0) return;
    const group = groups.find((g) => g.id === groupId)!;
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
    updateGroup(groupId, { items: [...group.items, ...additions] });
  };

  const linkInventoryItem = (groupId: string, itemId: string, inv: InventoryItem) => {
    updateItem(groupId, itemId, { inventoryItemId: inv.id, label: inv.name });
  };

  const resolveInventoryName = (id?: string) =>
    id ? inventoryItems.find((i) => i.id === id)?.name : undefined;

  const getVisibleItems = (items: ChecklistItem[]): ChecklistItem[] => {
    const normalizedQuery = listSearchQuery.trim().toLowerCase();
    const filteredItems = items.filter((item) => {
      const inventoryName = resolveInventoryName(item.inventoryItemId) || '';
      const matchesQuery =
        !normalizedQuery ||
        item.label.toLowerCase().includes(normalizedQuery) ||
        inventoryName.toLowerCase().includes(normalizedQuery) ||
        (item.notes || '').toLowerCase().includes(normalizedQuery);
      const matchesCompletion =
        completionFilter === 'all' ||
        (completionFilter === 'done' && item.completed) ||
        (completionFilter === 'open' && !item.completed);
      return matchesQuery && matchesCompletion;
    });
    if (sortMode === 'manual') return filteredItems;
    const sortedItems = [...filteredItems];
    sortedItems.sort((left, right) => {
      if (sortMode === 'name_asc') return left.label.localeCompare(right.label);
      if (sortMode === 'name_desc') return right.label.localeCompare(left.label);
      if (sortMode === 'qty_asc') return (left.quantity ?? 1) - (right.quantity ?? 1);
      return (right.quantity ?? 1) - (left.quantity ?? 1);
    });
    return sortedItems;
  };

  if (groups.length === 0 && readOnly) {
    return <p className="text-sm text-muted-foreground">No checklist items.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-2 rounded-md border p-2 sm:grid-cols-3">
        <Input
          placeholder="Search checklist items..."
          value={listSearchQuery}
          onChange={(event) => setListSearchQuery(event.target.value)}
          className="h-8"
        />
        <Select value={completionFilter} onValueChange={(value) => setCompletionFilter(value as 'all' | 'open' | 'done')}>
          <SelectTrigger className="h-8">
            <SelectValue placeholder="Filter status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All status</SelectItem>
            <SelectItem value="open">Open only</SelectItem>
            <SelectItem value="done">Completed only</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={sortMode}
          onValueChange={(value) => setSortMode(value as 'manual' | 'name_asc' | 'name_desc' | 'qty_asc' | 'qty_desc')}
        >
          <SelectTrigger className="h-8">
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
      <p className="text-xs text-muted-foreground">
        Item checkbox marks completion status only (not multi-select for list actions).
      </p>
      {groups.map((group) => (
        <div key={group.id} className="rounded-md border">
          <div className="flex items-center gap-2 border-b bg-muted/40 px-3 py-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0"
              onClick={() => toggleGroupExpanded(group.id)}
              title={expandedGroupIds.includes(group.id) ? 'Collapse section' : 'Expand section'}
            >
              {expandedGroupIds.includes(group.id) ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" />
              )}
            </Button>
            {!readOnly && <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground" />}
            {readOnly ? (
              <span className="flex-1 text-sm font-medium">{group.title}</span>
            ) : (
              <Input
                className="h-7 flex-1 border-none bg-transparent p-0 text-sm font-medium shadow-none focus-visible:ring-0"
                value={group.title}
                onChange={(e) => updateGroup(group.id, { title: e.target.value })}
              />
            )}
            {!readOnly && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0"
                onClick={() => runDeleteAction(`group:${group.id}`, () => removeGroup(group.id))}
                title="Delete group"
              >
                <Trash2 className="h-3.5 w-3.5 text-red-400" />
              </Button>
            )}
          </div>
          {expandedGroupIds.includes(group.id) && <div className="divide-y">
            {getVisibleItems(group.items).map((item) => {
              const invName = resolveInventoryName(item.inventoryItemId);
              const isEditingItemLabel =
                editingItem?.groupId === group.id && editingItem?.itemId === item.id;
              return (
                <div
                  key={item.id}
                  className="flex items-center gap-2 px-3 py-2"
                  draggable={!readOnly}
                  onDragStart={() => setDraggingItem({ groupId: group.id, itemId: item.id })}
                  onDragOver={(event) => {
                    if (!draggingItem || draggingItem.groupId !== group.id) return;
                    event.preventDefault();
                  }}
                  onDrop={() => {
                    if (!draggingItem || draggingItem.groupId !== group.id) return;
                    moveItemInGroup(group.id, draggingItem.itemId, item.id);
                    setDraggingItem(null);
                  }}
                  onDragEnd={() => setDraggingItem(null)}
                >
                  {!readOnly && <GripVertical className="h-3.5 w-3.5 shrink-0 cursor-grab text-muted-foreground" />}
                  <Checkbox
                    checked={item.completed}
                    onCheckedChange={(checked) =>
                      updateItem(group.id, item.id, { completed: Boolean(checked) })
                    }
                    title={item.completed ? 'Mark as not completed' : 'Mark as completed'}
                  />
                  {isEditingItemLabel ? (
                    <Input
                      className="h-7 flex-1 text-sm"
                      value={editingLabel}
                      onChange={(event) => setEditingLabel(event.target.value)}
                      onBlur={() => {
                        const next = editingLabel.trim();
                        if (next.length > 0 && next !== item.label) {
                          updateItem(group.id, item.id, { label: next });
                        }
                        setEditingItem(null);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          const next = editingLabel.trim();
                          if (next.length > 0 && next !== item.label) {
                            updateItem(group.id, item.id, { label: next });
                          }
                          setEditingItem(null);
                        }
                        if (event.key === 'Escape') {
                          event.preventDefault();
                          setEditingItem(null);
                        }
                      }}
                      autoFocus
                    />
                  ) : (
                    <span className={cn('flex-1 text-sm', item.completed && 'text-muted-foreground')}>
                      {item.label}
                      {invName && item.inventoryItemId && item.label !== invName && (
                        <span className="ml-1 text-xs text-muted-foreground">({invName})</span>
                      )}
                      {item.inventoryItemId && (
                        <Link2 className="ml-1 inline h-3 w-3 text-blue-500" />
                      )}
                      {item.completed && (
                        <span className="ml-2 rounded border border-green-500/40 bg-green-500/10 px-1.5 py-0.5 text-[10px] font-medium text-green-300">
                          Completed
                        </span>
                      )}
                    </span>
                  )}
                  {!readOnly ? (
                    <Input
                      type="number"
                      min={1}
                      className="h-7 w-16 text-xs"
                      value={item.quantity ?? 1}
                      onChange={(e) =>
                        updateItem(group.id, item.id, {
                          quantity: Math.max(1, Number(e.target.value) || 1),
                        })
                      }
                    />
                  ) : (
                    <span className="text-xs text-muted-foreground">×{item.quantity ?? 1}</span>
                  )}
                  {item.reservedQuantity ? (
                    <span className="text-xs text-amber-700 dark:text-amber-300">
                      reserved {item.reservedQuantity}
                    </span>
                  ) : null}
                  {item.checkedOutQuantity ? (
                    <span className="text-xs text-blue-700 dark:text-blue-300">
                      out {item.checkedOutQuantity}
                    </span>
                  ) : null}
                  {!readOnly && (
                    <>
                      {inventoryItems.length > 0 && !item.inventoryItemId && (
                        <InventoryItemPicker
                          inventoryItems={inventoryItems}
                          onSelect={(inv) => linkInventoryItem(group.id, item.id, inv)}
                        />
                      )}
                      {item.inventoryItemId && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0"
                          title="Unlink inventory item"
                          onClick={() => updateItem(group.id, item.id, { inventoryItemId: undefined })}
                        >
                          <Unlink className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0"
                        title="Edit item label"
                        onClick={() => {
                          setEditingItem({ groupId: group.id, itemId: item.id });
                          setEditingLabel(item.label);
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className={cn(
                          'h-8 w-8 shrink-0 border',
                          'border-red-500/40 bg-red-500/10 hover:bg-red-500/20'
                        )}
                        onClick={() =>
                          runDeleteAction(`item:${item.id}`, () => removeItem(group.id, item.id))
                        }
                        title="Delete item"
                      >
                        <Trash2 className="h-3.5 w-3.5 text-red-300" />
                      </Button>
                    </>
                  )}
                </div>
              );
            })}
          </div>}
          {!readOnly && (
            <div className="flex gap-2 border-t px-3 py-2">
              <Input
                placeholder="Add item..."
                className="h-7 text-sm"
                value={newItemLabels[group.id] ?? ''}
                onChange={(e) =>
                  setNewItemLabels((prev) => ({ ...prev, [group.id]: e.target.value }))
                }
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addItem(group.id);
                  }
                }}
              />
              <Button variant="outline" size="sm" className="h-7 shrink-0" onClick={() => addItem(group.id)}>
                <Plus className="h-3.5 w-3.5" />
              </Button>
              {inventoryItems.length > 0 && (
                <>
                  <InventoryItemPicker
                    inventoryItems={inventoryItems}
                    onSelect={(inv) => addLinkedItem(group.id, inv)}
                    title="Add inventory item from picker"
                    triggerClassName="h-7 w-7 shrink-0"
                  />
                  <BulkInventorySelectionDialog
                    inventoryItems={inventoryItems}
                    onApply={(items) => addBulkLinkedItems(group.id, items)}
                    buttonLabel="Bulk Pick"
                  />
                </>
              )}
            </div>
          )}
        </div>
      ))}
      {!readOnly && (
        <div className="flex gap-2">
          <Input
            placeholder="New group name..."
            className="h-8 text-sm"
            value={newGroupTitle}
            onChange={(e) => setNewGroupTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addGroup();
              }
            }}
          />
          <Button variant="outline" size="sm" className="h-8 shrink-0 gap-1" onClick={addGroup}>
            <Plus className="h-3.5 w-3.5" />
            Add Group
          </Button>
        </div>
      )}
      <AlertDialog open={Boolean(pendingDelete)} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm delete</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete?.groupId
                ? 'Delete this checklist section and all items in it?'
                : 'Delete this checklist item?'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel type="button">Cancel</AlertDialogCancel>
            <AlertDialogAction
              type="button"
              onClick={() => {
                if (!pendingDelete) return;
                if (pendingDelete.groupId) {
                  removeGroup(pendingDelete.groupId);
                } else if (pendingDelete.itemId) {
                  for (const group of groups) {
                    if (group.items.some((item) => item.id === pendingDelete.itemId)) {
                      removeItem(group.id, pendingDelete.itemId);
                      break;
                    }
                  }
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
