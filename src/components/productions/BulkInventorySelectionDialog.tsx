import { useMemo, useState } from 'react';
import { InventoryItem } from '@/types/inventory';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogTrigger, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { DraggableDialogContent } from '@/components/ui/draggable-dialog';
import { ListChecks } from 'lucide-react';
import { getSettings } from '@/lib/storageService';
import { isRemoteProductionItem } from './InventoryItemPicker';

export type BulkSelectionStatus = 'needed' | 'available' | 'order' | 'schedule';

export interface BulkSelectionResult {
  item: InventoryItem;
  status: BulkSelectionStatus;
}

interface BulkInventorySelectionDialogProps {
  inventoryItems: InventoryItem[];
  onApply: (items: BulkSelectionResult[]) => void;
  buttonLabel: string;
}

function buildLocationNameMap(): Record<string, string> {
  const map: Record<string, string> = {};
  const settings = getSettings();
  const traverse = (nodes: any[], parentPath = '') => {
    for (const node of nodes || []) {
      const nodeName = String(node.name || '');
      const nodeId = String(node.id || '');
      const fullPath = parentPath ? `${parentPath}/${nodeName}` : nodeName;
      if (nodeId) map[nodeId] = fullPath;
      if (nodeName) map[nodeName] = fullPath;
      traverse(node.children || [], fullPath);
    }
  };
  traverse(settings.locations as any[]);
  return map;
}

export function BulkInventorySelectionDialog({
  inventoryItems,
  onApply,
  buttonLabel
}: BulkInventorySelectionDialogProps) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [locationFilter, setLocationFilter] = useState<string>('all');
  const [remoteFilter, setRemoteFilter] = useState<'all' | 'remote'>('all');
  const [statusById, setStatusById] = useState<Record<string, BulkSelectionStatus>>({});
  const [selectedIds, setSelectedIds] = useState<Record<string, boolean>>({});

  const locationNameMap = useMemo(() => buildLocationNameMap(), [open]);
  const resolveLocation = (item: InventoryItem) => {
    const raw = (item.location || '').trim();
    return locationNameMap[raw] || raw || '';
  };

  const uniqueLocations = useMemo(
    () =>
      Array.from(new Set(inventoryItems.map((item) => resolveLocation(item)).filter(Boolean))).sort((a, b) =>
        a.localeCompare(b)
      ),
    [inventoryItems, locationNameMap]
  );

  const filteredItems = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLowerCase();
    return inventoryItems.filter((item) => {
      const locationLabel = resolveLocation(item);
      const matchesLocation = locationFilter === 'all' || locationLabel === locationFilter;
      const matchesRemote = remoteFilter === 'all' || isRemoteProductionItem(item);
      const matchesSearch =
        !normalizedSearch ||
        item.name.toLowerCase().includes(normalizedSearch) ||
        locationLabel.toLowerCase().includes(normalizedSearch) ||
        (item.category || '').toLowerCase().includes(normalizedSearch) ||
        (item.project || '').toLowerCase().includes(normalizedSearch);
      return matchesLocation && matchesRemote && matchesSearch;
    });
  }, [inventoryItems, searchQuery, locationFilter, remoteFilter, locationNameMap]);

  const selectedCount = Object.values(selectedIds).filter(Boolean).length;

  const applySelection = () => {
    const items = filteredItems
      .filter((item) => selectedIds[item.id])
      .map((item) => ({
        item,
        status: statusById[item.id] || 'needed',
      }));
    onApply(items);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-7 gap-1">
          <ListChecks className="h-3.5 w-3.5" />
          {buttonLabel}
        </Button>
      </DialogTrigger>
      <DraggableDialogContent
        dismissOnOutsidePointer
        className="h-[min(88vh,900px)] w-[min(94vw,1200px)] overflow-hidden p-0"
      >
        <DialogHeader className="border-b px-4 py-3">
          <DialogTitle>Bulk Inventory Picker</DialogTitle>
        </DialogHeader>

        <div className="grid h-full grid-rows-[auto_1fr_auto]">
          <div className="grid gap-2 border-b px-4 py-3 sm:grid-cols-4">
            <Input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search name, location, project, category..."
              className="h-9 sm:col-span-2"
            />
            <Select value={locationFilter} onValueChange={setLocationFilter}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="All locations" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All locations</SelectItem>
                {uniqueLocations.map((location) => (
                  <SelectItem key={location} value={location}>
                    {location}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={remoteFilter} onValueChange={(value) => setRemoteFilter(value as 'all' | 'remote')}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="All items" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All items</SelectItem>
                <SelectItem value="remote">Remote production only</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="overflow-auto px-4 py-3">
            <div className="mb-2 grid grid-cols-[36px_1.4fr_1fr_1fr_160px] gap-2 border-b pb-2 text-xs font-medium text-muted-foreground">
              <span />
              <span>Item</span>
              <span>Location</span>
              <span>Category / Project</span>
              <span>Status</span>
            </div>
            <div className="space-y-1">
              {filteredItems.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">No matching inventory items.</p>
              ) : (
                filteredItems.map((item) => {
                  const isChecked = Boolean(selectedIds[item.id]);
                  return (
                    <div key={item.id} className="grid grid-cols-[36px_1.4fr_1fr_1fr_160px] items-center gap-2 rounded border px-2 py-2">
                      <Checkbox
                        checked={isChecked}
                        onCheckedChange={(checked) =>
                          setSelectedIds((previous) => ({ ...previous, [item.id]: Boolean(checked) }))
                        }
                      />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{item.name}</p>
                        <p className="truncate text-xs text-muted-foreground">Qty: {item.quantity}</p>
                      </div>
                      <p className="truncate text-xs">{resolveLocation(item) || '-'}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {[item.category, item.project].filter(Boolean).join(' · ') || '-'}
                      </p>
                      <Select
                        value={statusById[item.id] || 'needed'}
                        onValueChange={(value) =>
                          setStatusById((previous) => ({ ...previous, [item.id]: value as BulkSelectionStatus }))
                        }
                        disabled={!isChecked}
                      >
                        <SelectTrigger className="h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="needed">Needed</SelectItem>
                          <SelectItem value="available">Available</SelectItem>
                          <SelectItem value="order">Needs order</SelectItem>
                          <SelectItem value="schedule">Needs scheduling</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <DialogFooter className="border-t px-4 py-3">
            <div className="mr-auto text-sm text-muted-foreground">{selectedCount} selected</div>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={applySelection} disabled={selectedCount === 0}>
              Add Selected
            </Button>
          </DialogFooter>
        </div>
      </DraggableDialogContent>
    </Dialog>
  );
}
