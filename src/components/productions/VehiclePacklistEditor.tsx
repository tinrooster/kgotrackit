import { useState } from 'react';
import { Plus, Trash2, Truck } from 'lucide-react';
import { VehiclePacklist, ChecklistItem } from '@/types/productions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';

interface VehiclePacklistEditorProps {
  packlists: VehiclePacklist[];
  onChange: (packlists: VehiclePacklist[]) => void;
  readOnly?: boolean;
}

function newItem(label: string): ChecklistItem {
  return { id: crypto.randomUUID(), label, completed: false };
}

export function VehiclePacklistEditor({ packlists, onChange, readOnly = false }: VehiclePacklistEditorProps) {
  const [newVehicleName, setNewVehicleName] = useState('');
  const [newItemLabels, setNewItemLabels] = useState<Record<string, string>>({});

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

  if (packlists.length === 0 && readOnly) {
    return <p className="text-sm text-muted-foreground">No vehicle packlists.</p>;
  }

  return (
    <div className="space-y-4">
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
                onClick={() => removePacklist(packlist.id)}
              >
                <Trash2 className="h-3.5 w-3.5 text-destructive" />
              </Button>
            )}
          </div>
          <div className="divide-y">
            {packlist.items.map((item) => (
              <div key={item.id} className="flex items-center gap-2 px-3 py-2">
                <Checkbox
                  checked={item.completed}
                  onCheckedChange={(checked) =>
                    updateItem(packlist.id, item.id, { completed: Boolean(checked) })
                  }
                />
                <span className={cn('flex-1 text-sm', item.completed && 'text-muted-foreground line-through')}>
                  {item.label}
                </span>
                {item.quantity != null && (
                  <span className="text-xs text-muted-foreground">×{item.quantity}</span>
                )}
                {!readOnly && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0"
                    onClick={() => removeItem(packlist.id, item.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
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
    </div>
  );
}
