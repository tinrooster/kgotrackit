import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Check, Download, Loader2, Search, X } from 'lucide-react';
import type { EsSchematicJson, EsEdge, EsNode } from '@/types/plant';
import type { PlantCableSummary } from '@/types/plant';
import { listCables } from '@/lib/plantService';
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
  // sourceHandle = "{port_id}-out", targetHandle = "{port_id}-in"
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
// DB search popover (inline, no radix dependency)
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

  useEffect(() => {
    doSearch(query);
  }, []);

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

  // assignments: edgeId → cable number string
  const [assignments, setAssignments] = useState<Map<string, string>>(() => {
    const m = new Map<string, string>();
    for (const c of connections) {
      if (c.existingLabel) m.set(c.edge.id, c.existingLabel);
    }
    return m;
  });

  const [openPopover, setOpenPopover] = useState<string | null>(null); // edgeId
  const [filter, setFilter] = useState('');

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

  const filtered = filter.trim()
    ? connections.filter(
        (c) =>
          c.srcDevice.toLowerCase().includes(filter.toLowerCase()) ||
          c.dstDevice.toLowerCase().includes(filter.toLowerCase()) ||
          (assignments.get(c.edge.id) ?? '').toLowerCase().includes(filter.toLowerCase()),
      )
    : connections;

  const handleExport = () => {
    const annotated: EsSchematicJson = {
      ...json,
      edges: json.edges.map((edge) => {
        const cableNum = assignments.get(edge.id);
        if (!cableNum) return edge;
        return {
          ...edge,
          data: { ...edge.data, label: cableNum, cableIdLabelMode: 'midpoint' },
        };
      }),
    };
    onExport(annotated);
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Stats + actions bar */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs text-muted-foreground">
          {assignedCount}/{totalCount} connections assigned
        </span>
        <div className="relative ml-auto w-52">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter devices…"
            className="h-7 pl-6 text-xs"
          />
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          onClick={handleExport}
          disabled={assignedCount === 0}
        >
          <Download className="h-3 w-3 mr-1" />
          Export annotated JSON ({assignedCount})
        </Button>
      </div>

      {/* Connection table */}
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

      <p className="text-xs text-muted-foreground">
        Type cable numbers directly or click <Search className="inline h-3 w-3" /> to fuzzy-search the cable register.
        Click <strong>Export annotated JSON</strong> to download the schematic with cable labels embedded
        — reimport into EasySchematic to see cable numbers at wire midpoints.
      </p>
    </div>
  );
}
