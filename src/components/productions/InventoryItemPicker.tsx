import { useMemo, useState } from 'react';
import { Link2 } from 'lucide-react';
import { InventoryItem } from '@/types/inventory';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getSettings } from '@/lib/storageService';

interface InventoryItemPickerProps {
  inventoryItems: InventoryItem[];
  onSelect: (item: InventoryItem) => void;
  title?: string;
  triggerClassName?: string;
}

function toNormalized(value: string | undefined): string {
  return (value || '').trim().toLowerCase();
}

function isTruthyFlag(value: string): boolean {
  return ['true', 'yes', '1', 'y', 'on'].includes(value);
}

export function isRemoteProductionItem(item: InventoryItem): boolean {
  const projectValue = toNormalized(item.project);
  const locationValue = toNormalized(item.location);
  const notesValue = toNormalized(item.notes);
  if (projectValue.includes('remote') || locationValue.includes('remote') || notesValue.includes('remote')) {
    return true;
  }
  const customFields = item.customFields || {};
  return Object.entries(customFields).some(([key, value]) => {
    const normalizedKey = toNormalized(key);
    const normalizedValue = toNormalized(value);
    if (normalizedKey.includes('remote') && (isTruthyFlag(normalizedValue) || normalizedValue.includes('remote'))) {
      return true;
    }
    if ((normalizedKey.includes('production') || normalizedKey.includes('event')) && normalizedValue.includes('remote')) {
      return true;
    }
    return false;
  });
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

export function InventoryItemPicker({
  inventoryItems,
  onSelect,
  title = 'Link inventory item',
  triggerClassName
}: InventoryItemPickerProps) {
  const [open, setOpen] = useState(false);
  const [locationFilter, setLocationFilter] = useState<string>('all');
  const [remoteFilter, setRemoteFilter] = useState<'all' | 'remote'>('all');
  const [flagQuery, setFlagQuery] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const locationNameMap = useMemo(() => buildLocationNameMap(), [open]);
  const getLocationLabel = (item: InventoryItem): string => {
    const raw = (item.location || '').trim();
    return locationNameMap[raw] || raw || '';
  };

  const uniqueLocations = useMemo(
    () =>
      Array.from(
        new Set(
          inventoryItems
            .map((item) => getLocationLabel(item))
            .filter(Boolean)
        )
      ).sort((a, b) => a.localeCompare(b)),
    [inventoryItems, locationNameMap]
  );

  const filteredInventoryItems = useMemo(() => {
    const normalizedFlagQuery = flagQuery.trim().toLowerCase();
    const normalizedSearchQuery = searchQuery.trim().toLowerCase();
    return inventoryItems.filter((item) => {
      const locationLabel = getLocationLabel(item);
      const matchesLocation = locationFilter === 'all' || locationLabel === locationFilter;
      const matchesRemote = remoteFilter === 'all' || isRemoteProductionItem(item);
      const matchesFlagQuery =
        !normalizedFlagQuery ||
        Object.entries(item.customFields || {}).some(([key, value]) =>
          key.toLowerCase().includes(normalizedFlagQuery) ||
          (value || '').toLowerCase().includes(normalizedFlagQuery)
        );
      const matchesSearch =
        !normalizedSearchQuery ||
        item.name.toLowerCase().includes(normalizedSearchQuery) ||
        locationLabel.toLowerCase().includes(normalizedSearchQuery) ||
        (item.category || '').toLowerCase().includes(normalizedSearchQuery) ||
        (item.project || '').toLowerCase().includes(normalizedSearchQuery);
      return matchesLocation && matchesRemote && matchesFlagQuery && matchesSearch;
    });
  }, [inventoryItems, locationFilter, remoteFilter, flagQuery, searchQuery, locationNameMap]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className={triggerClassName || 'h-7 w-7 shrink-0'} title={title}>
          <Link2 className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="border-b p-2">
          <div className="grid grid-cols-2 gap-2">
            <Select value={locationFilter} onValueChange={setLocationFilter}>
              <SelectTrigger className="h-8">
                <SelectValue placeholder="Location" />
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
              <SelectTrigger className="h-8">
                <SelectValue placeholder="Remote filter" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All items</SelectItem>
                <SelectItem value="remote">Remote production only</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Input
            className="mt-2 h-8 text-xs"
            placeholder="Custom field filter (e.g. lighting, remote)"
            value={flagQuery}
            onChange={(event) => setFlagQuery(event.target.value)}
          />
          <Input
            className="mt-2 h-8 text-xs"
            placeholder="Search inventory items..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
        </div>
        <div className="max-h-72 overflow-y-auto p-1">
          {filteredInventoryItems.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">No items found.</p>
          ) : (
            filteredInventoryItems.map((inv) => (
              <button
                key={inv.id}
                type="button"
                className="flex w-full items-center rounded-sm px-2 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                onClick={() => {
                  onSelect(inv);
                  setOpen(false);
                }}
              >
                <span className="truncate">{inv.name}</span>
                <span className="ml-auto pl-2 text-xs text-muted-foreground">
                  {[getLocationLabel(inv), inv.category].filter(Boolean).join(' · ') || '-'}
                </span>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
