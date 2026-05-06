import { useMemo, useState } from 'react';
import { Link2 } from 'lucide-react';
import { InventoryItem } from '@/types/inventory';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from '@/components/ui/command';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface InventoryItemPickerProps {
  inventoryItems: InventoryItem[];
  onSelect: (item: InventoryItem) => void;
  title?: string;
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

export function InventoryItemPicker({ inventoryItems, onSelect, title = 'Link inventory item' }: InventoryItemPickerProps) {
  const [open, setOpen] = useState(false);
  const [locationFilter, setLocationFilter] = useState<string>('all');
  const [remoteFilter, setRemoteFilter] = useState<'all' | 'remote'>('all');
  const [flagQuery, setFlagQuery] = useState('');

  const uniqueLocations = useMemo(
    () =>
      Array.from(
        new Set(
          inventoryItems
            .map((item) => (item.location || '').trim())
            .filter(Boolean)
        )
      ).sort((a, b) => a.localeCompare(b)),
    [inventoryItems]
  );

  const filteredInventoryItems = useMemo(() => {
    const normalizedFlagQuery = flagQuery.trim().toLowerCase();
    return inventoryItems.filter((item) => {
      const matchesLocation = locationFilter === 'all' || (item.location || '').trim() === locationFilter;
      const matchesRemote = remoteFilter === 'all' || isRemoteProductionItem(item);
      const matchesFlagQuery =
        !normalizedFlagQuery ||
        Object.entries(item.customFields || {}).some(([key, value]) =>
          key.toLowerCase().includes(normalizedFlagQuery) ||
          (value || '').toLowerCase().includes(normalizedFlagQuery)
        );
      return matchesLocation && matchesRemote && matchesFlagQuery;
    });
  }, [inventoryItems, locationFilter, remoteFilter, flagQuery]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" title={title}>
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
        </div>
        <Command>
          <CommandInput placeholder="Search inventory..." />
          <CommandEmpty>No items found.</CommandEmpty>
          <CommandGroup className="max-h-56 overflow-y-auto">
            {filteredInventoryItems.map((inv) => (
              <CommandItem
                key={inv.id}
                value={`${inv.name} ${inv.location || ''} ${inv.category || ''}`}
                onSelect={() => {
                  onSelect(inv);
                  setOpen(false);
                }}
              >
                <span className="truncate">{inv.name}</span>
                <span className="ml-auto pl-2 text-xs text-muted-foreground">
                  {[inv.location, inv.category].filter(Boolean).join(' · ') || '-'}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
