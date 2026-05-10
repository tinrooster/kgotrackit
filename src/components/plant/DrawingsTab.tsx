import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import { listDrawings, getDrawingCableCounts } from '@/lib/plantService';
import type { PlantDrawing } from '@/types/plant';
import { Badge } from '@/components/ui/badge';
import { getActiveOrganizationId } from '@/lib/supabase/organizationData';
import { cn } from '@/lib/utils';
import { DrawingDetailPanel } from './DrawingDetailPanel';

const STATUS_COLOURS: Record<string, string> = {
  active:         'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  decommissioned: 'bg-muted text-muted-foreground',
  draft:          'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  legacy:         'bg-muted text-muted-foreground',
  superseded:     'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
};

export function DrawingsTab() {
  const [, setSearchParams] = useSearchParams();
  const [drawings, setDrawings] = useState<PlantDrawing[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

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

  const goToRegister = (drawingId: string) => {
    setSearchParams({ pt: 'register', dwg: drawingId });
  };

  const handleUpdated = (updated: PlantDrawing) => {
    setDrawings((prev) => prev.map((d) => d.id === updated.id ? updated : d));
  };

  if (loading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (drawings.length === 0) {
    return (
      <p className="text-center text-sm text-muted-foreground py-12">No drawings found.</p>
    );
  }

  return (
    <div className="rounded-md border overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
            <th className="w-8 px-2 py-2" />
            <th className="px-3 py-2 font-medium">DWG #</th>
            <th className="px-3 py-2 font-medium">Title</th>
            <th className="px-3 py-2 font-medium hidden md:table-cell">Signal category</th>
            <th className="px-3 py-2 font-medium">Cables</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2 font-medium hidden lg:table-cell">Schematic</th>
          </tr>
        </thead>
        <tbody>
          {drawings.map((d) => {
            const isExpanded = expandedId === d.id;
            const cableCount = counts[d.id] ?? 0;
            const hasSchematic = !!d.easyschematicShareToken;

            return (
              <>
                <tr
                  key={d.id}
                  onClick={() => setExpandedId(isExpanded ? null : d.id)}
                  className="border-b hover:bg-muted/40 cursor-pointer transition-colors"
                >
                  <td className="px-2 py-2 text-muted-foreground">
                    {isExpanded
                      ? <ChevronDown className="h-3.5 w-3.5" />
                      : <ChevronRight className="h-3.5 w-3.5" />}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs font-medium">{d.dwgNumber}</td>
                  <td className="px-3 py-2 max-w-[200px]">
                    <span className="block truncate">{d.title ?? <span className="text-muted-foreground italic">—</span>}</span>
                  </td>
                  <td className="px-3 py-2 hidden md:table-cell text-xs text-muted-foreground">
                    {d.signalCategory ?? '—'}
                  </td>
                  <td
                    className={cn('px-3 py-2 tabular-nums text-xs', cableCount > 0 ? 'cursor-pointer hover:text-primary' : 'text-muted-foreground')}
                    onClick={(e) => {
                      if (cableCount > 0) {
                        e.stopPropagation();
                        goToRegister(d.id);
                      }
                    }}
                  >
                    {cableCount || '—'}
                  </td>
                  <td className="px-3 py-2">
                    <Badge className={cn('text-xs', STATUS_COLOURS[d.status] ?? 'bg-muted text-muted-foreground')}>
                      {d.status}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 hidden lg:table-cell">
                    {hasSchematic ? (
                      <span className="text-xs text-green-700 dark:text-green-400 font-medium">Linked</span>
                    ) : d.dwgFilePath || d.visioFilePath ? (
                      <span className="text-xs text-muted-foreground">File only</span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>

                {isExpanded && (
                  <tr key={`${d.id}-detail`} className="border-b bg-muted/10">
                    <td colSpan={7} className="px-4 pb-4">
                      <DrawingDetailPanel drawing={d} onUpdated={handleUpdated} />
                    </td>
                  </tr>
                )}
              </>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
