import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, ChevronUp, ChevronDown as ChevronDownSort, Download, Loader2, MapPin, Search, X } from 'lucide-react';
import {
  listCables,
  exportCablesCSV,
  SIGNAL_TYPE_LABELS,
  STATUS_LABELS,
  STATUS_COLOURS,
  PAGE_SIZE,
  PLANT_CABLES_UPDATED_EVENT,
} from '@/lib/plantService';
import type { PlantCableSummary, PlantCableStatus, PlantSignalType, PlantCableSortColumn } from '@/types/plant';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { CableDetailSheet } from './CableDetailSheet';

const STATUS_FILTER_OPTIONS: PlantCableStatus[] = ['unknown', 'active', 'review', 'decommissioning', 'decommissioned'];
const SIGNAL_FILTER_OPTIONS: PlantSignalType[] = [
  'hd_sdi', 'sdi', 'analog_video', 'audio_analog', 'audio_aes', 'audio_dante',
  'data_ethernet', 'rf', 'control_serial', 'display', 'fiber', 'power', 'other',
];

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

function SortTh({
  col, current, dir, onSort, children, className,
}: {
  col: PlantCableSortColumn;
  current: PlantCableSortColumn;
  dir: 'asc' | 'desc';
  onSort: (col: PlantCableSortColumn) => void;
  children: React.ReactNode;
  className?: string;
}) {
  const active = current === col;
  return (
    <th
      className={cn('px-3 py-2 font-medium cursor-pointer select-none hover:text-foreground group', className)}
      onClick={() => onSort(col)}
    >
      <span className="inline-flex items-center gap-1">
        {children}
        {active
          ? (dir === 'asc'
            ? <ChevronUp className="h-3 w-3 text-primary" />
            : <ChevronDownSort className="h-3 w-3 text-primary" />)
          : <ChevronUp className="h-3 w-3 opacity-0 group-hover:opacity-30" />}
      </span>
    </th>
  );
}

export function CableRegisterTab() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialLoc = searchParams.get('loc') ?? undefined;
  const initialDwg = searchParams.get('dwg') ?? undefined;

  const [cables, setCables] = useState<PlantCableSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);

  const [statusFilters, setStatusFilters] = useState<PlantCableStatus[]>([]);
  const [signalFilters, setSignalFilters] = useState<PlantSignalType[]>([]);
  const [locationCode, setLocationCode] = useState<string | undefined>(initialLoc);
  const [drawingId, setDrawingId] = useState<string | undefined>(initialDwg);
  const [projectFilter, setProjectFilter] = useState('');
  const debouncedProject = useDebounce(projectFilter, 300);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [sortBy, setSortBy] = useState<PlantCableSortColumn>('cable_number');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const loadRef = useRef(0);

  const clearLocationFilter = () => {
    setLocationCode(undefined);
    setSearchParams((prev) => { const n = new URLSearchParams(prev); n.delete('loc'); return n; });
  };

  const clearDrawingFilter = () => {
    setDrawingId(undefined);
    setSearchParams((prev) => { const n = new URLSearchParams(prev); n.delete('dwg'); return n; });
  };

  const load = useCallback(async (p: number) => {
    setLoading(true);
    const token = ++loadRef.current;
    const result = await listCables({
      page: p,
      search: debouncedSearch,
      status: statusFilters,
      signalType: signalFilters,
      locationCode,
      drawingId,
      project: debouncedProject || undefined,
      sortBy,
      sortDir,
    });
    if (token !== loadRef.current) return;
    setCables(result.cables);
    setTotal(result.total);
    setLoading(false);
  }, [debouncedSearch, statusFilters, signalFilters, locationCode, drawingId, debouncedProject, sortBy, sortDir]);

  const handleSort = (col: PlantCableSortColumn) => {
    if (sortBy === col) {
      setSortDir((d) => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(col);
      setSortDir('asc');
    }
    setPage(0);
  };

  useEffect(() => {
    setPage(0);
  }, [debouncedSearch, statusFilters, signalFilters, locationCode, drawingId, debouncedProject]);

  useEffect(() => {
    void load(page);
  }, [load, page]);

  useEffect(() => {
    const handler = () => void load(page);
    window.addEventListener(PLANT_CABLES_UPDATED_EVENT, handler);
    return () => window.removeEventListener(PLANT_CABLES_UPDATED_EVENT, handler);
  }, [load, page]);

  const handleExport = async () => {
    setExporting(true);
    const csv = await exportCablesCSV({
      search: debouncedSearch,
      status: statusFilters,
      signalType: signalFilters,
      locationCode,
      drawingId,
    });
    if (csv) {
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cables_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    }
    setExporting(false);
  };

  const toggleStatus = (s: PlantCableStatus) => {
    setStatusFilters((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]
    );
  };

  const toggleSignal = (s: PlantSignalType) => {
    setSignalFilters((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]
    );
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Search + filter bar */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search cable #, origin, dest, notes…"
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
        <Button
          variant="outline"
          size="sm"
          className="h-10 shrink-0"
          onClick={handleExport}
          disabled={exporting || total === 0}
          title={`Export ${total.toLocaleString()} cables to CSV`}
        >
          {exporting
            ? <Loader2 className="h-4 w-4 animate-spin" />
            : <Download className="h-4 w-4" />}
          <span className="ml-1.5 hidden sm:inline">Export</span>
        </Button>
        </div>

        {locationCode && (
          <div className="flex items-center gap-1.5">
            <span className="flex items-center gap-1 text-xs bg-primary/10 text-primary border border-primary/20 rounded-full px-2.5 py-0.5 font-medium">
              <MapPin className="h-3 w-3" /> {locationCode}
            </span>
            <button onClick={clearLocationFilter} className="text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        {drawingId && (
          <div className="flex items-center gap-1.5">
            <span className="text-xs bg-primary/10 text-primary border border-primary/20 rounded-full px-2.5 py-0.5 font-medium">
              Drawing filter active
            </span>
            <button onClick={clearDrawingFilter} className="text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        <div className="flex flex-wrap gap-1.5">
          {STATUS_FILTER_OPTIONS.map((s) => (
            <button
              key={s}
              onClick={() => toggleStatus(s)}
              className={cn(
                'rounded-full px-2.5 py-0.5 text-xs font-medium border transition-colors',
                statusFilters.includes(s)
                  ? 'border-transparent ' + STATUS_COLOURS[s]
                  : 'border-border text-muted-foreground hover:border-foreground/40'
              )}
            >
              {STATUS_LABELS[s]}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-1.5 items-center">
          {SIGNAL_FILTER_OPTIONS.map((s) => (
            <button
              key={s}
              onClick={() => toggleSignal(s)}
              className={cn(
                'rounded-full px-2.5 py-0.5 text-xs font-medium border transition-colors',
                signalFilters.includes(s)
                  ? 'border-transparent bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
                  : 'border-border text-muted-foreground hover:border-foreground/40'
              )}
            >
              {SIGNAL_TYPE_LABELS[s]}
            </button>
          ))}
          <div className="relative ml-auto">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
            <Input
              value={projectFilter}
              onChange={(e) => setProjectFilter(e.target.value)}
              placeholder="Project ID…"
              className="h-7 pl-6 pr-6 text-xs w-32 font-mono"
            />
            {projectFilter && (
              <button
                onClick={() => setProjectFilter('')}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-md border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
              <SortTh col="cable_number" current={sortBy} dir={sortDir} onSort={handleSort}>Cable #</SortTh>
              <SortTh col="origin_location_code" current={sortBy} dir={sortDir} onSort={handleSort}>Origin</SortTh>
              <SortTh col="dest_location_code" current={sortBy} dir={sortDir} onSort={handleSort}>Destination</SortTh>
              <SortTh col="signal_type" current={sortBy} dir={sortDir} onSort={handleSort} className="hidden md:table-cell">Signal</SortTh>
              <th className="px-3 py-2 font-medium hidden lg:table-cell">Type</th>
              <SortTh col="length_ft" current={sortBy} dir={sortDir} onSort={handleSort} className="hidden lg:table-cell">Length</SortTh>
              <SortTh col="legacy_project_id" current={sortBy} dir={sortDir} onSort={handleSort} className="hidden xl:table-cell">Project</SortTh>
              <SortTh col="status" current={sortBy} dir={sortDir} onSort={handleSort}>Status</SortTh>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={8} className="py-12 text-center">
                  <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
                </td>
              </tr>
            )}
            {!loading && cables.length === 0 && (
              <tr>
                <td colSpan={8} className="py-12 text-center text-muted-foreground text-sm">
                  No cables found.
                </td>
              </tr>
            )}
            {!loading && cables.map((c) => (
              <tr
                key={c.id}
                onClick={() => setSelectedId(c.id)}
                className="border-b last:border-0 hover:bg-muted/40 cursor-pointer transition-colors"
              >
                <td className="px-3 py-2 font-mono text-xs">
                  {c.cableNumber ?? <span className="text-muted-foreground">—</span>}
                </td>
                <td className="px-3 py-2 max-w-[180px]">
                  <span className="block truncate">
                    {c.originLocationCode && (
                      <span className="text-muted-foreground mr-1">{c.originLocationCode}</span>
                    )}
                    {c.originDevice && <span className="truncate">{c.originDevice}</span>}
                    {c.originPort && <span className="text-muted-foreground ml-1">:{c.originPort}</span>}
                  </span>
                </td>
                <td className="px-3 py-2 max-w-[180px]">
                  <span className="block truncate">
                    {c.destLocationCode && (
                      <span className="text-muted-foreground mr-1">{c.destLocationCode}</span>
                    )}
                    {c.destDevice && <span className="truncate">{c.destDevice}</span>}
                    {c.destPort && <span className="text-muted-foreground ml-1">:{c.destPort}</span>}
                  </span>
                </td>
                <td className="px-3 py-2 hidden md:table-cell text-xs text-muted-foreground">
                  {c.signalType ? SIGNAL_TYPE_LABELS[c.signalType] : '—'}
                </td>
                <td className="px-3 py-2 hidden lg:table-cell text-xs text-muted-foreground font-mono">
                  {c.cableFamily ?? '—'}
                </td>
                <td className="px-3 py-2 hidden lg:table-cell text-xs text-muted-foreground">
                  {c.lengthFt != null ? `${c.lengthFt} ft` : '—'}
                </td>
                <td className="px-3 py-2 hidden xl:table-cell text-xs font-mono text-muted-foreground">
                  {c.legacyProjectId ?? '—'}
                </td>
                <td className="px-3 py-2">
                  <Badge className={cn('text-xs', STATUS_COLOURS[c.status])}>
                    {STATUS_LABELS[c.status]}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {total === 0 ? 'No results' : `${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, total)} of ${total.toLocaleString()}`}
        </span>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            disabled={page === 0}
            onClick={() => setPage((p) => p - 1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="px-2 text-xs">
            {page + 1} / {totalPages}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            disabled={page >= totalPages - 1}
            onClick={() => setPage((p) => p + 1)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <CableDetailSheet
        cableId={selectedId}
        onClose={() => setSelectedId(null)}
        onUpdated={() => void load(page)}
      />
    </div>
  );
}
