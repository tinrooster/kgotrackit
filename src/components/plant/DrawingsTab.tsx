import { Fragment, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  ChevronDown, ChevronRight, ChevronUp, ChevronDown as ChevronDownIcon,
  FolderOpen, Loader2, Pencil, Plus, Search, X, Check,
} from 'lucide-react';
import { listDrawings, getDrawingCableCounts, updateDrawing, batchUpdateDrawingStatus } from '@/lib/plantService';
import type { PlantDrawing, PlantDrawingSignalCategory, PlantDrawingStatus } from '@/types/plant';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getActiveOrganizationId } from '@/lib/supabase/organizationData';
import { cn } from '@/lib/utils';
import { DrawingDetailPanel } from './DrawingDetailPanel';
import { CreateDrawingDialog } from './CreateDrawingDialog';
import { toast } from 'sonner';

const STATUS_COLOURS: Record<string, string> = {
  active:         'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  decommissioned: 'bg-muted text-muted-foreground',
  draft:          'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  legacy:         'bg-muted text-muted-foreground',
  superseded:     'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
};

const STATUS_OPTIONS: PlantDrawingStatus[] = ['active', 'legacy', 'superseded', 'decommissioned'];
const SIGNAL_OPTIONS: PlantDrawingSignalCategory[] = ['video', 'audio', 'data', 'control', 'rf', 'mixed', 'other'];

type SortCol = 'dwgNumber' | 'title' | 'cables' | 'status' | 'signalCategory';

function compareDwgNumbers(a: string, b: string): number {
  const partsA = a.split(/[.\-]/).map((s) => { const n = parseInt(s, 10); return isNaN(n) ? s : n; });
  const partsB = b.split(/[.\-]/).map((s) => { const n = parseInt(s, 10); return isNaN(n) ? s : n; });
  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const va = partsA[i] ?? 0;
    const vb = partsB[i] ?? 0;
    if (typeof va === 'number' && typeof vb === 'number') {
      if (va !== vb) return va - vb;
    } else {
      const cmp = String(va).localeCompare(String(vb));
      if (cmp !== 0) return cmp;
    }
  }
  return 0;
}

function SortTh({
  col, current, dir, onSort, children, className,
}: {
  col: SortCol;
  current: SortCol;
  dir: 'asc' | 'desc';
  onSort: (col: SortCol) => void;
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
            : <ChevronDownIcon className="h-3 w-3 text-primary" />)
          : <ChevronUp className="h-3 w-3 opacity-0 group-hover:opacity-30" />}
      </span>
    </th>
  );
}

// ---------------------------------------------------------------------------
// Inline metadata editor (title, signal category, status, file path)
// ---------------------------------------------------------------------------
function InlineDrawingEditor({
  drawing,
  onSaved,
  onCancel,
}: {
  drawing: PlantDrawing;
  onSaved: (updated: PlantDrawing) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(drawing.title ?? '');
  const [signalCategory, setSignalCategory] = useState<PlantDrawingSignalCategory | ''>(drawing.signalCategory ?? '');
  const [status, setStatus] = useState<PlantDrawingStatus>(drawing.status);
  const [dwgFilePath, setDwgFilePath] = useState(drawing.dwgFilePath ?? '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    const ok = await updateDrawing(drawing.id, {
      title: title.trim() || undefined,
      signalCategory: signalCategory || undefined,
      status,
      dwgFilePath: dwgFilePath.trim() || undefined,
    });
    if (ok) {
      toast.success('Drawing updated');
      onSaved({ ...drawing, title: title.trim() || undefined, signalCategory: signalCategory || undefined, status, dwgFilePath: dwgFilePath.trim() || undefined });
    } else {
      toast.error('Failed to save drawing');
    }
    setSaving(false);
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-md border bg-muted/20">
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted-foreground">Title</label>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} className="h-8 text-sm" placeholder="e.g. PCR2 SDI Router Outputs" />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted-foreground">Signal category</label>
        <Select value={signalCategory} onValueChange={(v) => setSignalCategory(v as PlantDrawingSignalCategory)}>
          <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="—" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="">—</SelectItem>
            {SIGNAL_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted-foreground">Status</label>
        <Select value={status} onValueChange={(v) => setStatus(v as PlantDrawingStatus)}>
          <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted-foreground">AutoCAD file path</label>
        <Input value={dwgFilePath} onChange={(e) => setDwgFilePath(e.target.value)} className="h-8 text-sm font-mono text-xs" placeholder="\\server\share\drawings\22xxx.dwg" />
      </div>
      <div className="flex items-center gap-2 sm:col-span-2">
        <Button size="sm" className="h-7" onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Check className="h-3 w-3 mr-1" />}
          Save
        </Button>
        <Button size="sm" variant="ghost" className="h-7" onClick={onCancel} disabled={saving}>Cancel</Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main tab
// ---------------------------------------------------------------------------
export function DrawingsTab() {
  const [, setSearchParams] = useSearchParams();
  const [drawings, setDrawings] = useState<PlantDrawing[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchBusy, setBatchBusy] = useState(false);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilters, setStatusFilters] = useState<PlantDrawingStatus[]>(['active']);
  const [signalFilters, setSignalFilters] = useState<PlantDrawingSignalCategory[]>([]);
  const [onlyWithFile, setOnlyWithFile] = useState(false);
  const [onlyNew, setOnlyNew] = useState(false); // no cables & no file = "new / unconfigured"

  // Sort
  const [sortCol, setSortCol] = useState<SortCol>('dwgNumber');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const orgId = getActiveOrganizationId();
    Promise.all([
      listDrawings(),
      orgId ? getDrawingCableCounts(orgId) : Promise.resolve({}),
    ]).then(([dwgs, c]) => {
      setDrawings(dwgs);
      setCounts(c);
      setLoading(false);
    });
  }, []);

  const goToRegister = (drawingId: string) => setSearchParams({ pt: 'register', dwg: drawingId });

  const handleUpdated = (updated: PlantDrawing) => {
    setDrawings((prev) => prev.map((d) => d.id === updated.id ? updated : d));
    setEditingId(null);
  };

  const handleDeleted = (id: string) => {
    setDrawings((prev) => prev.filter((d) => d.id !== id));
    setExpandedId(null);
  };

  const handleCreated = (drawing: PlantDrawing) => {
    setDrawings((prev) => [...prev, drawing]);
    setExpandedId(drawing.id);
  };

  const handleSort = (col: SortCol) => {
    if (sortCol === col) setSortDir((d) => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('asc'); }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === sorted.length && sorted.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(sorted.map((d) => d.id)));
    }
  };

  const handleBatchStatus = async (status: PlantDrawingStatus) => {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    if (!confirm(`Set ${ids.length} drawing${ids.length !== 1 ? 's' : ''} to "${status}"?`)) return;
    setBatchBusy(true);
    const { updated } = await batchUpdateDrawingStatus(ids, status);
    setDrawings((prev) => prev.map((d) => selectedIds.has(d.id) ? { ...d, status } : d));
    setSelectedIds(new Set());
    toast.success(`${updated} drawing${updated !== 1 ? 's' : ''} set to ${status}`);
    setBatchBusy(false);
  };

  const toggleStatus = (s: PlantDrawingStatus) =>
    setStatusFilters((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]);
  const toggleSignal = (s: PlantDrawingSignalCategory) =>
    setSignalFilters((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]);

  // Filter
  const sq = search.toLowerCase().trim();
  const filtered = drawings.filter((d) => {
    if (statusFilters.length > 0 && !statusFilters.includes(d.status)) return false;
    if (signalFilters.length > 0 && (!d.signalCategory || !signalFilters.includes(d.signalCategory))) return false;
    if (onlyWithFile && !d.dwgFilePath && !d.visioFilePath) return false;
    if (onlyNew && (counts[d.id] > 0 || d.dwgFilePath || d.easyschematicId)) return false;
    if (sq) {
      const hay = `${d.dwgNumber} ${d.title ?? ''} ${d.signalCategory ?? ''}`.toLowerCase();
      if (!hay.includes(sq)) return false;
    }
    return true;
  });

  // Sort
  const sorted = [...filtered].sort((a, b) => {
    let cmp = 0;
    switch (sortCol) {
      case 'dwgNumber':      cmp = compareDwgNumbers(a.dwgNumber, b.dwgNumber); break;
      case 'title':          cmp = (a.title ?? '').localeCompare(b.title ?? ''); break;
      case 'cables':         cmp = (counts[a.id] ?? 0) - (counts[b.id] ?? 0); break;
      case 'status':         cmp = a.status.localeCompare(b.status); break;
      case 'signalCategory': cmp = (a.signalCategory ?? '').localeCompare(b.signalCategory ?? ''); break;
    }
    return sortDir === 'asc' ? cmp : -cmp;
  });

  if (loading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <>
      {/* Toolbar */}
      <div className="flex flex-col gap-2">
        {/* Search + New */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              ref={searchRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search DWG #, title…"
              className="pl-8 pr-8"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-3.5 w-3.5 mr-1.5" /> New drawing
          </Button>
        </div>

        {/* Status filter chips */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground mr-0.5">Status:</span>
          {STATUS_OPTIONS.map((s) => (
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
              {s}
            </button>
          ))}
          <span className="text-xs text-muted-foreground ml-2 mr-0.5">Signal:</span>
          {SIGNAL_OPTIONS.map((s) => (
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
              {s}
            </button>
          ))}
        </div>

        {/* Special filters */}
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setOnlyWithFile((v) => !v)}
            className={cn(
              'rounded-full px-2.5 py-0.5 text-xs font-medium border transition-colors',
              onlyWithFile
                ? 'border-transparent bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300'
                : 'border-border text-muted-foreground hover:border-foreground/40'
            )}
          >
            <FolderOpen className="h-3 w-3 inline mr-1" />Has file
          </button>
          <button
            onClick={() => setOnlyNew((v) => !v)}
            className={cn(
              'rounded-full px-2.5 py-0.5 text-xs font-medium border transition-colors',
              onlyNew
                ? 'border-transparent bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300'
                : 'border-border text-muted-foreground hover:border-foreground/40'
            )}
          >
            New / unconfigured
          </button>
          <span className="ml-auto text-xs text-muted-foreground self-center">
            {sorted.length.toLocaleString()} of {drawings.length.toLocaleString()} drawings
          </span>
        </div>

        {/* Batch action bar */}
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2">
            <span className="text-xs font-medium text-primary">{selectedIds.size} selected</span>
            <span className="text-xs text-muted-foreground">→ set to:</span>
            {STATUS_OPTIONS.map((s) => (
              <button
                key={s}
                onClick={() => handleBatchStatus(s)}
                disabled={batchBusy}
                className="rounded px-2 py-0.5 text-xs font-medium border transition-colors hover:bg-muted disabled:opacity-50"
              >
                {s}
              </button>
            ))}
            <button
              onClick={() => setSelectedIds(new Set())}
              className="ml-auto text-xs text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      {sorted.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground py-12">No drawings match current filters.</p>
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
                <th className="w-8 px-2 py-2">
                  <input
                    type="checkbox"
                    className="rounded border-border"
                    checked={selectedIds.size > 0 && selectedIds.size === sorted.length}
                    ref={(el) => { if (el) el.indeterminate = selectedIds.size > 0 && selectedIds.size < sorted.length; }}
                    onChange={toggleSelectAll}
                    onClick={(e) => e.stopPropagation()}
                    title="Select all visible"
                  />
                </th>
                <th className="w-8 px-2 py-2" />
                <SortTh col="dwgNumber" current={sortCol} dir={sortDir} onSort={handleSort}>DWG #</SortTh>
                <SortTh col="title" current={sortCol} dir={sortDir} onSort={handleSort}>Title</SortTh>
                <SortTh col="signalCategory" current={sortCol} dir={sortDir} onSort={handleSort} className="hidden md:table-cell">Signal</SortTh>
                <SortTh col="cables" current={sortCol} dir={sortDir} onSort={handleSort}>Cables</SortTh>
                <SortTh col="status" current={sortCol} dir={sortDir} onSort={handleSort}>Status</SortTh>
                <th className="px-3 py-2 font-medium hidden lg:table-cell">File</th>
                <th className="px-3 py-2 font-medium hidden lg:table-cell">Schematic</th>
                <th className="w-8 px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {sorted.map((d) => {
                const isExpanded = expandedId === d.id;
                const isEditing = editingId === d.id;
                const cableCount = counts[d.id] ?? 0;
                const hasSchematic = !!d.easyschematicShareToken;
                const hasFile = !!(d.dwgFilePath || d.visioFilePath);

                return (
                  <Fragment key={d.id}>
                    <tr
                      onClick={() => {
                        if (isEditing) return;
                        setExpandedId(isExpanded ? null : d.id);
                      }}
                      className={cn('border-b hover:bg-muted/40 cursor-pointer transition-colors', selectedIds.has(d.id) && 'bg-primary/5')}
                    >
                      <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          className="rounded border-border"
                          checked={selectedIds.has(d.id)}
                          onChange={() => toggleSelect(d.id)}
                        />
                      </td>
                      <td className="px-2 py-2 text-muted-foreground">
                        {isExpanded
                          ? <ChevronDown className="h-3.5 w-3.5" />
                          : <ChevronRight className="h-3.5 w-3.5" />}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs font-medium">{d.dwgNumber}</td>
                      <td className="px-3 py-2 w-full max-w-0">
                        <span className="block truncate">{d.title ?? <span className="text-muted-foreground italic">—</span>}</span>
                      </td>
                      <td className="px-3 py-2 hidden md:table-cell text-xs text-muted-foreground">
                        {d.signalCategory ?? '—'}
                      </td>
                      <td
                        className={cn('px-3 py-2 tabular-nums text-xs', cableCount > 0 ? 'cursor-pointer hover:text-primary' : 'text-muted-foreground')}
                        onClick={(e) => { if (cableCount > 0) { e.stopPropagation(); goToRegister(d.id); } }}
                      >
                        {cableCount || '—'}
                      </td>
                      <td className="px-3 py-2">
                        <Badge className={cn('text-xs', STATUS_COLOURS[d.status] ?? 'bg-muted text-muted-foreground')}>
                          {d.status}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 hidden lg:table-cell text-xs">
                        {hasFile
                          ? <span className="text-amber-700 dark:text-amber-400 font-medium">DWG</span>
                          : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-3 py-2 hidden lg:table-cell text-xs">
                        {hasSchematic
                          ? <span className="text-green-700 dark:text-green-400 font-medium">Linked</span>
                          : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-2 py-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingId(isEditing ? null : d.id);
                            if (!isExpanded) setExpandedId(d.id);
                          }}
                          className="text-muted-foreground hover:text-foreground p-1 rounded"
                          title="Edit metadata"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>

                    {isExpanded && (
                      <tr className="border-b bg-muted/10">
                        <td colSpan={10} className="px-4 pb-4 sticky left-0">
                          {isEditing && (
                            <div className="pt-3 pb-2">
                              <InlineDrawingEditor
                                drawing={d}
                                onSaved={handleUpdated}
                                onCancel={() => setEditingId(null)}
                              />
                            </div>
                          )}
                          <DrawingDetailPanel
                            drawing={d}
                            onUpdated={handleUpdated}
                            onDeleted={handleDeleted}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <CreateDrawingDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        drawings={drawings}
        onCreated={handleCreated}
      />
    </>
  );
}
