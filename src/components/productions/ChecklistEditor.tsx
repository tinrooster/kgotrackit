import { useState } from 'react';
import { Plus, Trash2, GripVertical, Link2, Unlink } from 'lucide-react';
import { ChecklistGroup, ChecklistItem } from '@/types/productions';
import { InventoryItem } from '@/types/inventory';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { InventoryItemPicker } from './InventoryItemPicker';
import { BulkInventorySelectionDialog, BulkSelectionResult } from './BulkInventorySelectionDialog';

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
  const [pendingDeleteKey, setPendingDeleteKey] = useState<string | null>(null);
  const runDeleteAction = (deleteKey: string, deleteAction: () => void) => {
    if (!requireDeleteConfirm) {
      deleteAction();
      return;
    }
    if (pendingDeleteKey === deleteKey) {
      deleteAction();
      setPendingDeleteKey(null);
      return;
    }
    setPendingDeleteKey(deleteKey);
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

  if (groups.length === 0 && readOnly) {
    return <p className="text-sm text-muted-foreground">No checklist items.</p>;
  }

  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <div key={group.id} className="rounded-md border">
          <div className="flex items-center gap-2 border-b bg-muted/40 px-3 py-2">
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
                title={pendingDeleteKey === `group:${group.id}` ? 'Click again to confirm delete' : 'Delete group'}
              >
                <Trash2 className="h-3.5 w-3.5 text-red-400" />
              </Button>
            )}
          </div>
          <div className="divide-y">
            {group.items.map((item) => {
              const invName = resolveInventoryName(item.inventoryItemId);
              return (
                <div key={item.id} className="flex items-center gap-2 px-3 py-2">
                  <Checkbox
                    checked={item.completed}
                    onCheckedChange={(checked) =>
                      updateItem(group.id, item.id, { completed: Boolean(checked) })
                    }
                  />
                  <span className={cn('flex-1 text-sm', item.completed && 'text-muted-foreground line-through')}>
                    {item.label}
                    {invName && item.inventoryItemId && item.label !== invName && (
                      <span className="ml-1 text-xs text-muted-foreground">({invName})</span>
                    )}
                    {item.inventoryItemId && (
                      <Link2 className="ml-1 inline h-3 w-3 text-blue-500" />
                    )}
                  </span>
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
                        className={cn(
                          'h-8 w-8 shrink-0 border',
                          pendingDeleteKey === `item:${item.id}`
                            ? 'border-red-400/70 bg-red-500/20'
                            : 'border-red-500/40 bg-red-500/10 hover:bg-red-500/20'
                        )}
                        onClick={() =>
                          runDeleteAction(`item:${item.id}`, () => removeItem(group.id, item.id))
                        }
                        title={
                          pendingDeleteKey === `item:${item.id}`
                            ? 'Click again to confirm delete'
                            : 'Delete item'
                        }
                      >
                        <Trash2 className="h-3.5 w-3.5 text-red-300" />
                      </Button>
                    </>
                  )}
                </div>
              );
            })}
          </div>
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
    </div>
  );
}
