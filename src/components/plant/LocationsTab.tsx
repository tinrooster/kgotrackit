import { useEffect, useState } from 'react';
import { Loader2, Search, X } from 'lucide-react';
import { listLocations, getLocationCableCounts } from '@/lib/plantService';
import type { PlantLocation } from '@/types/plant';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { getActiveOrganizationId } from '@/lib/supabase/organizationData';
import { cn } from '@/lib/utils';

const ROOM_TYPE_LABELS: Record<string, string> = {
  rack_room:    'Rack room',
  jackfield:    'Jackfield',
  frame:        'Frame',
  transmission: 'Transmission',
  headend:      'Headend',
  studio:       'Studio',
  mtr:          'MTR',
  other:        'Other',
};

const STATUS_COLOURS: Record<string, string> = {
  active:        'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  empty:         'bg-muted text-muted-foreground',
  repurposed:    'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  decommissioned:'bg-muted text-muted-foreground',
};

interface LocationRow extends PlantLocation {
  originCount: number;
  destCount: number;
}

export function LocationsTab() {
  const [rows, setRows] = useState<LocationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const orgId = getActiveOrganizationId();
    Promise.all([
      listLocations(),
      orgId ? getLocationCableCounts(orgId) : Promise.resolve({} as Record<string, { origin: number; dest: number }>),
    ]).then(([locs, counts]) => {
      setRows(locs.map((l) => ({
        ...l,
        originCount: counts[l.code]?.origin ?? 0,
        destCount:   counts[l.code]?.dest ?? 0,
      })));
      setLoading(false);
    });
  }, []);

  const filtered = search.trim()
    ? rows.filter((r) =>
        r.code.toLowerCase().includes(search.toLowerCase()) ||
        r.name.toLowerCase().includes(search.toLowerCase())
      )
    : rows;

  if (loading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter by code or name…"
          className="pl-8 pr-8"
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="rounded-md border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
              <th className="px-3 py-2 font-medium">Code</th>
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium hidden sm:table-cell">Type</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium text-right">Origin</th>
              <th className="px-3 py-2 font-medium text-right">Dest</th>
              <th className="px-3 py-2 font-medium text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="py-10 text-center text-muted-foreground text-sm">
                  No locations found.
                </td>
              </tr>
            )}
            {filtered.map((loc) => {
              const total = loc.originCount + loc.destCount;
              return (
                <tr
                  key={loc.id}
                  className={cn(
                    'border-b last:border-0 transition-colors',
                    total === 0 ? 'opacity-50' : 'hover:bg-muted/40'
                  )}
                >
                  <td className="px-3 py-2 font-mono text-xs font-medium">{loc.code}</td>
                  <td className="px-3 py-2">
                    {loc.name !== loc.code
                      ? loc.name
                      : <span className="text-muted-foreground italic">—</span>}
                  </td>
                  <td className="px-3 py-2 hidden sm:table-cell text-xs text-muted-foreground">
                    {ROOM_TYPE_LABELS[loc.roomType] ?? loc.roomType}
                  </td>
                  <td className="px-3 py-2">
                    <Badge className={cn('text-xs', STATUS_COLOURS[loc.status] ?? 'bg-muted text-muted-foreground')}>
                      {loc.status}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 tabular-nums text-xs text-right text-muted-foreground">
                    {loc.originCount || '—'}
                  </td>
                  <td className="px-3 py-2 tabular-nums text-xs text-right text-muted-foreground">
                    {loc.destCount || '—'}
                  </td>
                  <td className={cn(
                    'px-3 py-2 tabular-nums text-xs text-right font-medium',
                    total === 0 ? 'text-muted-foreground' : ''
                  )}>
                    {total || '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        {filtered.length} location{filtered.length !== 1 ? 's' : ''}
        {search ? ` matching "${search}"` : ''}
        {' · '}Locations with no cables are dimmed.
      </p>
    </div>
  );
}
