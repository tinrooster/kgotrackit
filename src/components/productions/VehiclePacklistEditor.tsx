import { useState } from 'react';
import { Plus, Trash2, Truck, Unlink } from 'lucide-react';
import { VehiclePacklist, ChecklistItem } from '@/types/productions';
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

interface VehiclePacklistEditorProps {
  packlists: VehiclePacklist[];
  onChange: (packlists: VehiclePacklist[]) => void;
  inventoryItems?: InventoryItem[];
  readOnly?: boolean;
  requireDeleteConfirm?: boolean;
}

function newItem(label: string): ChecklistItem {
  return { id: crypto.randomUUID(), label, completed: false };
}

export function VehiclePacklistEditor({
  packlists,
  onChange,
  inventoryItems = [],
  readOnly = false,
  requireDeleteConfirm = false
}: VehiclePacklistEditorProps) {
  const [newVehicleName, setNewVehicleName] = useState('');
  const [newItemLabels, setNewItemLabels] = useState<Record<string, string>>({});
  const [pendingDelete, setPendingDelete] = useState<{ packlistId?: string; itemId?: string } | null>(null);
  const [listSearchQuery, setListSearchQuery] = useState('');
  const [packedFilter, setPackedFilter] = useState<'all' | 'open' | 'done'>('all');
  const [sortMode, setSortMode] = useState<'manual' | 'name_asc' | 'name_desc' | 'qty_asc' | 'qty_desc'>('manual');
  const runDeleteAction = (deleteKey: string, deleteAction: () => void) => {
    if (!requireDeleteConfirm) {
      deleteAction();
      return;
    }
    if (deleteKey.startsWith('packlist:')) {
      setPendingDelete({ packlistId: deleteKey.replace('packlist:', '') });
      return;
    }
    if (deleteKey.startsWith('item:')) {
      setPendingDelete({ itemId: deleteKey.replace('item:', '') });
    }
  };

  const updatePacklist = (id: string, updates: Partial<VehiclePacklist>) => {
    onChange(packlists.map((p) => (p.id === id ? { ...p, ...updates } : p)));
  };

  const removePacklist = (id: string) => {
    onChange(packlists.filter((p) => p.id !== id));
  };

  const addPacklist = () => {
    const name = newVehicleName.trim();
    if (!name) return;
    onChange([...packlists, { id: crypto.randomUUID(), vehicleName: name, items: [] }]);
    setNewVehicleName('');
  };

  const updateItem = (packlistId: string, itemId: string, updates: Partial<ChecklistItem>) => {
    const packlist = packlists.find((p) => p.id === packlistId)!;
    updatePacklist(packlistId, {
      items: packlist.items.map((i) => (i.id === itemId ? { ...i, ...updates } : i)),
    });
  };

  const removeItem = (packlistId: string, itemId: string) => {
    const packlist = packlists.find((p) => p.id === packlistId)!;
    updatePacklist(packlistId, { items: packlist.items.filter((i) => i.id !== itemId) });
  };

  const addItem = (packlistId: string) => {
    const label = (newItemLabels[packlistId] ?? '').trim();
    if (!label) return;
    const packlist = packlists.find((p) => p.id === packlistId)!;
    updatePacklist(packlistId, { items: [...packlist.items, newItem(label)] });
    setNewItemLabels((prev) => ({ ...prev, [packlistId]: '' }));
  };

  const addLinkedItem = (packlistId: string, inv: InventoryItem) => {
    const packlist = packlists.find((p) => p.id === packlistId)!;
    updatePacklist(packlistId, {
      items: [
        ...packlist.items,
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
    const packlist = packlists.find((p) => p.id === packlistId)!;
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
    updatePacklist(packlistId, { items: [...packlist.items, ...additions] });
  };

  const linkInventoryItem = (packlistId: string, itemId: string, inv: InventoryItem) => {
    updateItem(packlistId, itemId, { inventoryItemId: inv.id, label: inv.name });
  };

  const getVisibleItems = (items: ChecklistItem[]): ChecklistItem[] => {
    const normalizedQuery = listSearchQuery.trim().toLowerCase();
    const filteredItems = items.filter((item) => {
      const matchesQuery =
        !normalizedQuery ||
        item.label.toLowerCase().includes(normalizedQuery) ||
        (item.notes || '').toLowerCase().includes(normalizedQuery);
      const matchesPacked =
        packedFilter === 'all' ||
        (packedFilter === 'done' && item.completed) ||
        (packedFilter === 'open' && !item.completed);
      return matchesQuery && matchesPacked;
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

  if (packlists.length === 0 && readOnly) {
    return <p className="text-sm text-muted-foreground">No vehicle packlists.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-2 rounded-md border p-2 sm:grid-cols-3">
        <Input
          placeholder="Search packlist items..."
          value={listSearchQuery}
          onChange={(event) => setListSearchQuery(event.target.value)}
          className="h-8"
        />
        <Select value={packedFilter} onValueChange={(value) => setPackedFilter(value as 'all' | 'open' | 'done')}>
          <SelectTrigger className="h-8">
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
        Item checkbox marks packed status only (not multi-select for list actions).
      </p>
      {packlists.map((packlist) => (
        <div key={packlist.id} className="rounded-md border">
          <div className="flex items-center gap-2 border-b bg-muted/40 px-3 py-2">
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
            <span className="ml-auto text-xs text-muted-foreground">
              {packlist.items.filter((i) => i.completed).length}/{packlist.items.length} packed
            </span>
            {!readOnly && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0"
                onClick={() => runDeleteAction(`packlist:${packlist.id}`, () => removePacklist(packlist.id))}
                title="Delete packlist"
              >
                <Trash2 className="h-3.5 w-3.5 text-red-400" />
              </Button>
            )}
          </div>
          <div className="divide-y">
            {getVisibleItems(packlist.items).map((item) => (
              <div key={item.id} className="flex items-center gap-2 px-3 py-2">
                <Checkbox
                  checked={item.completed}
                  onCheckedChange={(checked) =>
                    updateItem(packlist.id, item.id, { completed: Boolean(checked) })
                  }
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
                {!readOnly ? (
                  <Input
                    type="number"
                    min={1}
                    className="h-7 w-16 text-xs"
                    value={item.quantity ?? 1}
                    onChange={(event) =>
                      updateItem(packlist.id, item.id, {
                        quantity: Math.max(1, Number(event.target.value) || 1),
                      })
                    }
                  />
                ) : (
                  <span className="text-xs text-muted-foreground">×{item.quantity ?? 1}</span>
                )}
                {item.inventoryItemId && (
                  <span className="text-xs text-blue-700 dark:text-blue-300">linked</span>
                )}
                {!readOnly && inventoryItems.length > 0 && !item.inventoryItemId ? (
                  <InventoryItemPicker
                    inventoryItems={inventoryItems}
                    onSelect={(inv) => linkInventoryItem(packlist.id, item.id, inv)}
                    title="Link inventory item to packlist"
                  />
                ) : null}
                {!readOnly && item.inventoryItemId ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0"
                    title="Unlink inventory item"
                    onClick={() => updateItem(packlist.id, item.id, { inventoryItemId: undefined })}
                  >
                    <Unlink className="h-3.5 w-3.5" />
                  </Button>
                ) : null}
                {!readOnly && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn(
                      'h-8 w-8 shrink-0 border',
                      'border-red-500/40 bg-red-500/10 hover:bg-red-500/20'
                    )}
                    onClick={() => runDeleteAction(`item:${item.id}`, () => removeItem(packlist.id, item.id))}
                    title="Delete item"
                  >
                    <Trash2 className="h-3.5 w-3.5 text-red-300" />
                  </Button>
                )}
              </div>
            ))}
            {packlist.items.length === 0 && (
              <p className="px-3 py-2 text-xs text-muted-foreground">No items yet.</p>
            )}
          </div>
          {!readOnly && (
            <div className="flex gap-2 border-t px-3 py-2">
              <Input
                placeholder="Add item..."
                className="h-7 text-sm"
                value={newItemLabels[packlist.id] ?? ''}
                onChange={(e) =>
                  setNewItemLabels((prev) => ({ ...prev, [packlist.id]: e.target.value }))
                }
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addItem(packlist.id);
                  }
                }}
              />
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
      ))}
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
              {pendingDelete?.packlistId
                ? 'Delete this vehicle packlist and all items in it?'
                : 'Delete this packlist item?'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel type="button">Cancel</AlertDialogCancel>
            <AlertDialogAction
              type="button"
              onClick={() => {
                if (!pendingDelete) return;
                if (pendingDelete.packlistId) {
                  removePacklist(pendingDelete.packlistId);
                } else if (pendingDelete.itemId) {
                  for (const packlist of packlists) {
                    if (packlist.items.some((item) => item.id === pendingDelete.itemId)) {
                      removeItem(packlist.id, pendingDelete.itemId);
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
