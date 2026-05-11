import { useCallback, useMemo, useRef, useState } from 'react';
import { ArrowRight, Check, Download, Loader2, RotateCcw, Search, Send, X } from 'lucide-react';
import type { EsSchematicJson, EsEdge, EsNode } from '@/types/plant';
import { checkCableNumbersExist, findOpenCableNumberBlocks } from '@/lib/plantService';
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

  const [filter, setFilter] = useState('');

  // Block assign
  const [blockStart, setBlockStart] = useState('');
  const [blockStep, setBlockStep] = useState('1');
  const [blockConflicts, setBlockConflicts] = useState<Set<string>>(new Set());
  const [checkingConflicts, setCheckingConflicts] = useState(false);
  const [blockFromFinder, setBlockFromFinder] = useState(false); // skip conflict check when from finder

  // Block finder
  const [finderFrom, setFinderFrom] = useState('22000');
  const [finderTo, setFinderTo] = useState('22999');
  const [finderMin, setFinderMin] = useState('');
  const [finderBlocks, setFinderBlocks] = useState<Array<{ start: number; end: number; size: number }>>([]);
  const [finderLoading, setFinderLoading] = useState(false);
  const [finderRan, setFinderRan] = useState(false);
  const conflictDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const assign = (edgeId: string, value: string) => {
    setAssignments((prev) => {
      const next = new Map(prev);
      if (value) next.set(edgeId, value);
      else next.delete(edgeId);
      return next;
    });
  };

  const clearOne = (edgeId: string) => {
    setAssignments((prev) => {
      const next = new Map(prev);
      next.delete(edgeId);
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
    setBlockFromFinder(false);
  };

  const checkConflicts = useCallback(async () => {
    if (!blockValid || blockPreview.size === 0) return;
    setCheckingConflicts(true);
    const numbers = Array.from(blockPreview.values());
    const conflicts = await checkCableNumbersExist(numbers);
    setBlockConflicts(conflicts);
    setCheckingConflicts(false);
  }, [blockValid, blockPreview]);

  const handleBlockStartChange = (v: string) => {
    setBlockStart(v);
    setBlockConflicts(new Set());
    setBlockFromFinder(false);
    // Auto-check conflicts after typing stops
    if (conflictDebounce.current) clearTimeout(conflictDebounce.current);
    const num = parseInt(v, 10);
    if (!isNaN(num) && v.trim()) {
      conflictDebounce.current = setTimeout(() => checkConflicts(), 700);
    }
  };

  const runFinder = async () => {
    const from = parseInt(finderFrom, 10);
    const to   = parseInt(finderTo, 10);
    const minSize = finderMin.trim() ? Math.max(1, parseInt(finderMin, 10) || 1) : unassigned.length;
    if (isNaN(from) || isNaN(to) || to <= from) return;
    setFinderLoading(true);
    const blocks = await findOpenCableNumberBlocks({ minStart: from, maxEnd: to, minBlockSize: Math.max(1, minSize) });
    setFinderBlocks(blocks);
    setFinderRan(true);
    setFinderLoading(false);
  };

  // Click a finder result → set as block start, mark as conflict-free (finder already verified it)
  const pickFinderBlock = (b: { start: number }) => {
    setBlockStart(String(b.start));
    setBlockConflicts(new Set());
    setBlockFromFinder(true);
  };

  const filtered = filter.trim()
    ? connections.filter(
        (c) =>
          c.srcDevice.toLowerCase().includes(filter.toLowerCase()) ||
          c.dstDevice.toLowerCase().includes(filter.toLowerCase()) ||
          (assignments.get(c.edge.id) ?? '').includes(filter),
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

  const canApply = blockValid && unassigned.length > 0 && (blockFromFinder || blockConflicts.size === 0);

  return (
    <div className="flex flex-col gap-3">

      {/* Top bar: count + actions */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-muted-foreground">
          {assignedCount}/{totalCount} connections assigned
        </span>
        <div className="flex gap-1.5 ml-auto flex-wrap">
          {assignedCount > 0 && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1.5"
              onClick={() => { setAssignments(new Map()); setBlockStart(''); setBlockConflicts(new Set()); setBlockFromFinder(false); }}
            >
              <RotateCcw className="h-3 w-3" /> Reset numbering
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0"
            onClick={handleDownload}
            disabled={assignedCount === 0}
            title="Download annotated JSON"
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
                  <th className="px-2 py-2 font-medium w-32">Cable #</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => {
                  const assigned = assignments.get(c.edge.id) ?? '';
                  const isConflict = blockConflicts.has(blockPreview.get(c.edge.id) ?? '');
                  return (
                    <tr
                      key={c.edge.id}
                      className={cn(
                        'border-b last:border-0 transition-colors',
                        assigned
                          ? 'bg-green-50/50 dark:bg-green-950/10'
                          : isConflict
                            ? 'bg-red-50/50 dark:bg-red-950/10'
                            : 'hover:bg-muted/30',
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
                        <div className="flex items-center gap-1">
                          <Input
                            value={assigned}
                            onChange={(e) => assign(c.edge.id, e.target.value)}
                            placeholder="—"
                            className={cn(
                              'h-6 text-xs font-mono w-24',
                              assigned && 'border-green-400 dark:border-green-700',
                              isConflict && !assigned && 'border-red-400 dark:border-red-700',
                            )}
                          />
                          {assigned ? (
                            <button
                              onClick={() => clearOne(c.edge.id)}
                              className="shrink-0 p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                              title="Clear this number"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          ) : (
                            <Check className="h-3 w-3 text-muted-foreground/30 shrink-0" />
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
                  placeholder="22999"
                  className="h-6 text-xs font-mono flex-1 min-w-0"
                />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground w-8 shrink-0">Min</span>
                <Input
                  value={finderMin}
                  onChange={(e) => setFinderMin(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && runFinder()}
                  placeholder={String(unassigned.length || 1)}
                  title="Minimum free slots (defaults to number of unassigned connections)"
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
              <div className="flex flex-col gap-0.5 max-h-48 overflow-y-auto">
                {finderBlocks.map((b) => {
                  const fits = b.size >= unassigned.length;
                  const isSelected = blockFromFinder && blockStart === String(b.start);
                  return (
                    <button
                      key={b.start}
                      title={fits ? `Use ${b.start}–${b.start + unassigned.length - 1}` : `Only ${b.size} free, need ${unassigned.length}`}
                      onClick={() => fits && pickFinderBlock(b)}
                      disabled={!fits}
                      className={cn(
                        'text-left text-xs rounded px-1.5 py-1 flex items-center justify-between gap-1 group',
                        fits
                          ? isSelected
                            ? 'bg-primary/10 border border-primary/30'
                            : 'hover:bg-muted'
                          : 'opacity-40 cursor-not-allowed',
                      )}
                    >
                      <span className="font-mono">{b.start}–{b.end}</span>
                      <span className={cn('text-xs', fits ? 'text-green-700 dark:text-green-400' : 'text-muted-foreground')}>
                        {b.size}
                      </span>
                    </button>
                  );
                })}
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
                  onChange={(e) => handleBlockStartChange(e.target.value)}
                  placeholder="e.g. 22301"
                  className="h-6 text-xs font-mono flex-1 min-w-0"
                />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground w-8 shrink-0">Step</span>
                <Input
                  value={blockStep}
                  onChange={(e) => { setBlockStep(e.target.value); setBlockConflicts(new Set()); setBlockFromFinder(false); }}
                  placeholder="1"
                  title="Increment between numbers"
                  className="h-6 text-xs font-mono flex-1 min-w-0"
                />
              </div>
            </div>

            {blockValid && unassigned.length > 0 && (
              <p className="text-xs text-muted-foreground leading-snug">
                {blockStartNum}–{blockEnd}
                {blockStepNum > 1 && <span className="ml-1 opacity-60">step {blockStepNum}</span>}
                <span className="ml-1">· {unassigned.length} rows</span>
              </p>
            )}

            {blockConflicts.size > 0 && (
              <p className="text-xs text-destructive font-medium">
                ⚠ {blockConflicts.size} number{blockConflicts.size !== 1 ? 's' : ''} already in register
              </p>
            )}
            {blockFromFinder && blockValid && blockConflicts.size === 0 && (
              <p className="text-xs text-green-700 dark:text-green-400">✓ Block is free</p>
            )}
            {checkingConflicts && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" /> Checking…
              </p>
            )}

            <Button
              size="sm"
              className="h-6 text-xs w-full"
              disabled={!canApply}
              onClick={applyBlock}
            >
              Apply to {unassigned.length} rows
            </Button>
          </div>

        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Use <strong>Find open block</strong> to locate unused ranges in the register — click a result to select it, then
        <strong> Apply</strong>. Or type a start number manually (conflicts auto-checked).
        <strong> Reset numbering</strong> clears all assignments for a fresh start.
        <strong> Send to EasySchematic</strong> pushes cable numbers into the open popup — Ctrl+S to save.
      </p>
    </div>
  );
}
