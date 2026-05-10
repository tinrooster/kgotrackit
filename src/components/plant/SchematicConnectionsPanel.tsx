import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Check, Download, Loader2, Search, Send, X } from 'lucide-react';
import type { EsSchematicJson, EsEdge, EsNode } from '@/types/plant';
import type { PlantCableSummary } from '@/types/plant';
import { checkCableNumbersExist, findOpenCableNumberBlocks, listCables } from '@/lib/plantService';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolvePortLabel(node: EsNode, portId: string): string {
  const port = node.data?.ports?.find((p) => p.id === portId);
  return port?.label ?? portId;
}

function parseHandle(handle: string): string {
  return handle.replace(/-(in|out)$/, '');
}

interface Connection {
  edge: EsEdge;
  srcDevice: string;
  srcPort: string;
  dstDevice: string;
  dstPort: string;
  signal: string;
  existingLabel: string;
}

function buildConnections(json: EsSchematicJson): Connection[] {
  const nodeMap = new Map<string, EsNode>(json.nodes.map((n) => [n.id, n]));
  return json.edges.map((edge) => {
    const srcNode = nodeMap.get(edge.source);
    const dstNode = nodeMap.get(edge.target);
    const srcPortId = parseHandle(edge.sourceHandle);
    const dstPortId = parseHandle(edge.targetHandle);
    return {
      edge,
      srcDevice: srcNode?.data?.label ?? edge.source,
      srcPort:   srcNode ? resolvePortLabel(srcNode, srcPortId) : srcPortId,
      dstDevice: dstNode?.data?.label ?? edge.target,
      dstPort:   dstNode ? resolvePortLabel(dstNode, dstPortId) : dstPortId,
      signal:    edge.data?.signalType ?? '—',
      existingLabel: edge.data?.label ?? '',
    };
  });
}

// ---------------------------------------------------------------------------
// DB search popover
// ---------------------------------------------------------------------------

function CableSearchPopover({
  query,
  onPick,
  onClose,
}: {
  query: string;
  onPick: (cableNumber: string) => void;
  onClose: () => void;
}) {
  const [results, setResults] = useState<PlantCableSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchValue, setSearchValue] = useState(query);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doSearch = (q: string) => {
    if (!q.trim()) { setResults([]); return; }
    setLoading(true);
    listCables({ search: q, pageSize: 8 }).then(({ cables }) => {
      setResults(cables);
      setLoading(false);
    });
  };

  useEffect(() => { doSearch(query); }, []);

  const handleChange = (v: string) => {
    setSearchValue(v);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => doSearch(v), 300);
  };

  return (
    <div className="absolute z-50 right-0 top-full mt-1 w-80 rounded-md border bg-background shadow-lg p-2 flex flex-col gap-1.5">
      <div className="flex items-center gap-1">
        <Input
          autoFocus
          value={searchValue}
          onChange={(e) => handleChange(e.target.value)}
          placeholder="Search cable number, device…"
          className="h-7 text-xs"
        />
        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={onClose}>
          <X className="h-3 w-3" />
        </Button>
      </div>
      {loading && <Loader2 className="h-3 w-3 animate-spin mx-auto text-muted-foreground" />}
      {!loading && results.length === 0 && searchValue && (
        <p className="text-xs text-muted-foreground text-center py-1">No cables found</p>
      )}
      {results.map((c) => (
        <button
          key={c.id}
          onClick={() => { onPick(c.cableNumber ?? c.id); onClose(); }}
          className="text-left text-xs rounded px-2 py-1.5 hover:bg-muted flex flex-col gap-0.5"
        >
          <span className="font-mono font-medium">{c.cableNumber ?? '—'}</span>
          <span className="text-muted-foreground truncate">
            {c.originDevice ?? '?'} → {c.destDevice ?? '?'}
          </span>
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

interface SchematicConnectionsPanelProps {
  json: EsSchematicJson;
  onExport: (annotatedJson: EsSchematicJson) => void;
}

export function SchematicConnectionsPanel({
  json,
  onExport,
}: SchematicConnectionsPanelProps) {
  const connections = useMemo(() => buildConnections(json), [json]);

  const [assignments, setAssignments] = useState<Map<string, string>>(() => {
    const m = new Map<string, string>();
    for (const c of connections) {
      if (c.existingLabel) m.set(c.edge.id, c.existingLabel);
    }
    return m;
  });

  const [openPopover, setOpenPopover] = useState<string | null>(null);
  const [filter, setFilter] = useState('');

  // Block assign
  const [blockStart, setBlockStart] = useState('');
  const [blockStep, setBlockStep] = useState('1');
  const [blockConflicts, setBlockConflicts] = useState<Set<string>>(new Set());
  const [checkingConflicts, setCheckingConflicts] = useState(false);

  // Block finder
  const [finderFrom, setFinderFrom] = useState('');
  const [finderTo, setFinderTo] = useState('');
  const [finderMin, setFinderMin] = useState('50');
  const [finderBlocks, setFinderBlocks] = useState<Array<{ start: number; end: number; size: number }>>([]);
  const [finderLoading, setFinderLoading] = useState(false);
  const [finderRan, setFinderRan] = useState(false);

  const assign = (edgeId: string, value: string) => {
    setAssignments((prev) => {
      const next = new Map(prev);
      if (value) next.set(edgeId, value);
      else next.delete(edgeId);
      return next;
    });
  };

  const assignedCount = assignments.size;
  const totalCount = connections.length;

  const unassigned = connections.filter((c) => !assignments.has(c.edge.id));

  const blockStartNum = parseInt(blockStart, 10);
  const blockStepNum  = Math.max(1, parseInt(blockStep, 10) || 1);
  const blockValid    = !isNaN(blockStartNum) && blockStart.trim() !== '';
  const blockEnd      = blockStartNum + (unassigned.length - 1) * blockStepNum;

  const blockPreview: Map<string, string> = useMemo(() => {
    if (!blockValid) return new Map();
    const m = new Map<string, string>();
    unassigned.forEach((c, i) => m.set(c.edge.id, String(blockStartNum + i * blockStepNum)));
    return m;
  }, [blockValid, blockStartNum, blockStepNum, unassigned]);

  const applyBlock = () => {
    if (!blockValid) return;
    setAssignments((prev) => {
      const next = new Map(prev);
      unassigned.forEach((c, i) => next.set(c.edge.id, String(blockStartNum + i * blockStepNum)));
      return next;
    });
    setBlockStart('');
    setBlockConflicts(new Set());
  };

  const checkConflicts = async () => {
    if (!blockValid || blockPreview.size === 0) return;
    setCheckingConflicts(true);
    const numbers = Array.from(blockPreview.values());
    const conflicts = await checkCableNumbersExist(numbers);
    setBlockConflicts(conflicts);
    setCheckingConflicts(false);
  };

  const runFinder = async () => {
    const from = parseInt(finderFrom, 10);
    const to   = parseInt(finderTo, 10);
    const min  = Math.max(1, parseInt(finderMin, 10) || 50);
    if (isNaN(from) || isNaN(to) || to <= from) return;
    setFinderLoading(true);
    const blocks = await findOpenCableNumberBlocks({ minStart: from, maxEnd: to, minBlockSize: min });
    setFinderBlocks(blocks);
    setFinderRan(true);
    setFinderLoading(false);
  };

  const filtered = filter.trim()
    ? connections.filter(
        (c) =>
          c.srcDevice.toLowerCase().includes(filter.toLowerCase()) ||
          c.dstDevice.toLowerCase().includes(filter.toLowerCase()) ||
          (assignments.get(c.edge.id) ?? '').toLowerCase().includes(filter.toLowerCase()),
      )
    : connections;

  const buildAnnotated = (): EsSchematicJson => ({
    ...json,
    edges: json.edges.map((edge) => {
      const cableNum = assignments.get(edge.id);
      if (!cableNum) return edge;
      return { ...edge, data: { ...edge.data, label: cableNum, cableIdLabelMode: 'midpoint' } };
    }),
  });

  const handleSendToES = () => onExport(buildAnnotated());

  const handleDownload = () => {
    const annotated = buildAnnotated();
    const blob = new Blob([JSON.stringify(annotated, null, 2)], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'annotated_schematic.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col gap-3">

      {/* Top bar: count + actions */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">
          {assignedCount}/{totalCount} connections assigned
        </span>
        <div className="flex gap-1.5 ml-auto">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs text-muted-foreground"
            onClick={() => setAssignments(new Map())}
            disabled={assignedCount === 0}
          >
            Clear all
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0"
            onClick={handleDownload}
            disabled={assignedCount === 0}
            title="Download annotated JSON (fallback)"
          >
            <Download className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="sm"
            className="h-7 text-xs"
            onClick={handleSendToES}
            disabled={assignedCount === 0}
          >
            <Send className="h-3 w-3 mr-1.5" />
            Send to EasySchematic ({assignedCount})
          </Button>
        </div>
      </div>

      {/* Two-column: table area + sidebar */}
      <div className="flex gap-3 items-start">

        {/* ── Table area ─────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-2 flex-1 min-w-0">
          {/* Filter */}
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
            <Input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter devices…"
              className="h-7 pl-6 text-xs"
            />
          </div>

          {/* Table */}
          <div className="rounded-md border overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-muted/50 text-left text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Source device</th>
                  <th className="px-2 py-2 font-medium">Port</th>
                  <th className="px-2 py-2" />
                  <th className="px-3 py-2 font-medium">Dest device</th>
                  <th className="px-2 py-2 font-medium">Port</th>
                  <th className="px-2 py-2 font-medium hidden md:table-cell">Signal</th>
                  <th className="px-2 py-2 font-medium w-36">Cable #</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => {
                  const assigned = assignments.get(c.edge.id) ?? '';
                  return (
                    <tr
                      key={c.edge.id}
                      className={cn(
                        'border-b last:border-0 transition-colors',
                        assigned ? 'bg-green-50/50 dark:bg-green-950/10' : 'hover:bg-muted/30',
                      )}
                    >
                      <td className="px-3 py-1.5 font-medium max-w-[160px]">
                        <span className="block truncate">{c.srcDevice}</span>
                      </td>
                      <td className="px-2 py-1.5 text-muted-foreground max-w-[80px]">
                        <span className="block truncate">{c.srcPort}</span>
                      </td>
                      <td className="px-2 py-1.5 text-muted-foreground">
                        <ArrowRight className="h-3 w-3" />
                      </td>
                      <td className="px-3 py-1.5 font-medium max-w-[160px]">
                        <span className="block truncate">{c.dstDevice}</span>
                      </td>
                      <td className="px-2 py-1.5 text-muted-foreground max-w-[80px]">
                        <span className="block truncate">{c.dstPort}</span>
                      </td>
                      <td className="px-2 py-1.5 text-muted-foreground hidden md:table-cell">
                        {c.signal}
                      </td>
                      <td className="px-2 py-1.5">
                        <div className="relative flex items-center gap-1">
                          <Input
                            value={assigned}
                            onChange={(e) => assign(c.edge.id, e.target.value)}
                            placeholder="e.g. 50006"
                            className={cn(
                              'h-6 text-xs font-mono w-28',
                              assigned && 'border-green-400 dark:border-green-700',
                            )}
                          />
                          {assigned ? (
                            <Check className="h-3 w-3 text-green-600 shrink-0" />
                          ) : (
                            <button
                              className="shrink-0 p-0.5 rounded hover:bg-muted"
                              title="Search cable register"
                              onClick={() => setOpenPopover(openPopover === c.edge.id ? null : c.edge.id)}
                            >
                              <Search className="h-3 w-3 text-muted-foreground" />
                            </button>
                          )}
                          {openPopover === c.edge.id && (
                            <CableSearchPopover
                              query={`${c.srcDevice} ${c.dstDevice}`}
                              onPick={(num) => assign(c.edge.id, num)}
                              onClose={() => setOpenPopover(null)}
                            />
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-6">No connections match filter.</p>
            )}
          </div>
        </div>

        {/* ── Right sidebar ───────────────────────────────────────────────── */}
        <div className="w-52 shrink-0 flex flex-col gap-3">

          {/* Find open block */}
          <div className="rounded-md border bg-muted/20 p-2.5 flex flex-col gap-2">
            <span className="text-xs font-medium">Find open block</span>
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground w-8 shrink-0">From</span>
                <Input
                  value={finderFrom}
                  onChange={(e) => setFinderFrom(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && runFinder()}
                  placeholder="22000"
                  className="h-6 text-xs font-mono flex-1 min-w-0"
                />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground w-8 shrink-0">To</span>
                <Input
                  value={finderTo}
                  onChange={(e) => setFinderTo(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && runFinder()}
                  placeholder="23000"
                  className="h-6 text-xs font-mono flex-1 min-w-0"
                />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground w-8 shrink-0">Min</span>
                <Input
                  value={finderMin}
                  onChange={(e) => setFinderMin(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && runFinder()}
                  placeholder="50"
                  className="h-6 text-xs font-mono flex-1 min-w-0"
                />
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="h-6 text-xs w-full"
              onClick={runFinder}
              disabled={finderLoading}
            >
              {finderLoading
                ? <Loader2 className="h-3 w-3 animate-spin mr-1" />
                : <Search className="h-3 w-3 mr-1" />}
              Search
            </Button>
            {finderRan && !finderLoading && finderBlocks.length === 0 && (
              <p className="text-xs text-muted-foreground text-center">No blocks found</p>
            )}
            {finderBlocks.length > 0 && (
              <div className="flex flex-col gap-0.5 max-h-44 overflow-y-auto">
                {finderBlocks.map((b) => (
                  <button
                    key={b.start}
                    title="Use as block start"
                    onClick={() => { setBlockStart(String(b.start)); setBlockConflicts(new Set()); }}
                    className="text-left text-xs rounded px-1.5 py-1 hover:bg-muted flex items-center justify-between gap-1 group"
                  >
                    <span className="font-mono">{b.start}–{b.end}</span>
                    <span className="text-muted-foreground group-hover:text-foreground">{b.size} free</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Block assign */}
          <div className="rounded-md border bg-muted/20 p-2.5 flex flex-col gap-2">
            <span className="text-xs font-medium">Block assign</span>
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground w-8 shrink-0">Start</span>
                <Input
                  value={blockStart}
                  onChange={(e) => { setBlockStart(e.target.value); setBlockConflicts(new Set()); }}
                  placeholder="22301"
                  className="h-6 text-xs font-mono flex-1 min-w-0"
                />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground w-8 shrink-0">Step</span>
                <Input
                  value={blockStep}
                  onChange={(e) => { setBlockStep(e.target.value); setBlockConflicts(new Set()); }}
                  placeholder="1"
                  title="Increment between numbers (1 = consecutive, 10 = every 10th)"
                  className="h-6 text-xs font-mono flex-1 min-w-0"
                />
              </div>
            </div>
            {blockValid && unassigned.length > 0 && (
              <p className="text-xs text-muted-foreground leading-snug">
                {blockStartNum}…{blockEnd}
                {blockStepNum > 1 && <span className="ml-1 opacity-60">×{blockStepNum}</span>}
                <span className="ml-1">· {unassigned.length} rows</span>
              </p>
            )}
            {blockConflicts.size > 0 && (
              <p className="text-xs text-destructive font-medium">
                {blockConflicts.size} conflict{blockConflicts.size !== 1 ? 's' : ''} in register
              </p>
            )}
            <div className="flex flex-col gap-1">
              <Button
                size="sm"
                variant="outline"
                className="h-6 text-xs w-full"
                disabled={!blockValid || unassigned.length === 0 || checkingConflicts}
                onClick={checkConflicts}
              >
                {checkingConflicts ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Check conflicts'}
              </Button>
              <Button
                size="sm"
                className="h-6 text-xs w-full"
                disabled={!blockValid || unassigned.length === 0 || blockConflicts.size > 0}
                onClick={applyBlock}
              >
                Apply to {unassigned.length} rows
              </Button>
            </div>
          </div>

        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Type cable numbers directly or click <Search className="inline h-3 w-3" /> to fuzzy-search the register.
        Use <strong>Find open block</strong> to locate unused ranges, then <strong>Block assign</strong> to fill rows sequentially.
        <strong> Send to EasySchematic</strong> pushes the annotated schematic directly into the open popup (or opens it) — then Ctrl+S to save.
      </p>
    </div>
  );
}
