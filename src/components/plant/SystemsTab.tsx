import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { listSystems } from '@/lib/plantService';
import type { PlantSystem } from '@/types/plant';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const STATUS_COLOURS: Record<string, string> = {
  active:        'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  decommissioned:'bg-muted text-muted-foreground',
  unknown:       'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
};

export function SystemsTab() {
  const [systems, setSystems] = useState<PlantSystem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listSystems().then((s) => {
      setSystems(s);
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

  if (systems.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center gap-2">
        <p className="text-muted-foreground text-sm">No systems defined yet.</p>
        <p className="text-xs text-muted-foreground max-w-sm">
          Systems are seeded from the import process and used in campaign rules to match
          device names (e.g. all Grass Valley or Miranda equipment).
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        {systems.length} system{systems.length !== 1 ? 's' : ''} · Used in campaign rules to match cables by device name.
      </p>
      <div className="rounded-md border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
              <th className="px-3 py-2 font-medium">System</th>
              <th className="px-3 py-2 font-medium hidden sm:table-cell">Vendor</th>
              <th className="px-3 py-2 font-medium hidden md:table-cell">Product</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Match terms</th>
              <th className="px-3 py-2 font-medium hidden lg:table-cell">Decommissioned</th>
            </tr>
          </thead>
          <tbody>
            {systems.map((sys) => (
              <tr key={sys.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                <td className="px-3 py-2 font-medium">{sys.name}</td>
                <td className="px-3 py-2 hidden sm:table-cell text-xs text-muted-foreground">{sys.vendor ?? '—'}</td>
                <td className="px-3 py-2 hidden md:table-cell text-xs text-muted-foreground">{sys.productFamily ?? '—'}</td>
                <td className="px-3 py-2">
                  <Badge className={cn('text-xs', STATUS_COLOURS[sys.status] ?? 'bg-muted text-muted-foreground')}>
                    {sys.status}
                  </Badge>
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-1">
                    {sys.matchTerms.length === 0
                      ? <span className="text-xs text-muted-foreground">—</span>
                      : sys.matchTerms.map((t) => (
                        <span key={t} className="text-xs bg-muted rounded px-1.5 py-0.5 font-mono">{t}</span>
                      ))}
                  </div>
                </td>
                <td className="px-3 py-2 hidden lg:table-cell text-xs text-muted-foreground">
                  {sys.decommissionedOn
                    ? new Date(sys.decommissionedOn).toLocaleDateString()
                    : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        Use "Device name contains" rules in a campaign to target cables connected to any of these systems.
        Match terms are case-insensitive partial matches against origin and destination device fields.
      </p>
    </div>
  );
}
