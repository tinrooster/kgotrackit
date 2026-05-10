import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Loader2, ExternalLink } from 'lucide-react';
import { listDrawings, getDrawingCableCounts } from '@/lib/plantService';
import type { PlantDrawing } from '@/types/plant';
import { Badge } from '@/components/ui/badge';
import { getActiveOrganizationId } from '@/lib/supabase/organizationData';
import { cn } from '@/lib/utils';

const STATUS_COLOURS: Record<string, string> = {
  active:         'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  decommissioned: 'bg-muted text-muted-foreground',
  draft:          'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
};

export function DrawingsTab() {
  const [, setSearchParams] = useSearchParams();
  const [drawings, setDrawings] = useState<PlantDrawing[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  const goToRegister = (drawingId: string) => {
    setSearchParams({ pt: 'register', dwg: drawingId });
  };

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
            <th className="px-3 py-2 font-medium">DWG #</th>
            <th className="px-3 py-2 font-medium">Title</th>
            <th className="px-3 py-2 font-medium hidden md:table-cell">Signal category</th>
            <th className="px-3 py-2 font-medium">Cables</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2 font-medium hidden lg:table-cell">Files</th>
          </tr>
        </thead>
        <tbody>
          {drawings.map((d) => (
            <tr
              key={d.id}
              onClick={() => counts[d.id] > 0 && goToRegister(d.id)}
              className={cn(
                'border-b last:border-0 transition-colors',
                counts[d.id] > 0 ? 'hover:bg-muted/40 cursor-pointer' : 'opacity-60'
              )}
            >
              <td className="px-3 py-2 font-mono text-xs font-medium">{d.dwgNumber}</td>
              <td className="px-3 py-2 max-w-[240px]">
                <span className="block truncate">{d.title ?? <span className="text-muted-foreground">—</span>}</span>
              </td>
              <td className="px-3 py-2 hidden md:table-cell text-xs text-muted-foreground">
                {d.signalCategory ?? '—'}
              </td>
              <td className="px-3 py-2 tabular-nums text-xs">
                {counts[d.id] ?? 0}
              </td>
              <td className="px-3 py-2">
                <Badge className={cn('text-xs', STATUS_COLOURS[d.status] ?? 'bg-muted text-muted-foreground')}>
                  {d.status}
                </Badge>
              </td>
              <td className="px-3 py-2 hidden lg:table-cell">
                <div className="flex items-center gap-2 text-xs">
                  {d.dwgFilePath && (
                    <span className="text-muted-foreground font-mono truncate max-w-[160px]" title={d.dwgFilePath}>
                      .dwg
                    </span>
                  )}
                  {d.easyschematicId && (
                    <a
                      href={`https://easyschematic.app/d/${d.easyschematicId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center gap-1 text-blue-600 hover:underline"
                    >
                      EasySchematic <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                  {!d.dwgFilePath && !d.easyschematicId && (
                    <span className="text-muted-foreground">—</span>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
