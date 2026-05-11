import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import type { FleetLogEntry, FleetVehicle, LogCategory } from '@/types/fleet';
import {
  LOG_CATEGORY_LABELS,
  LOG_CATEGORY_BADGE_CLASSES,
  LOG_CATEGORY_OPTIONS,
} from '@/types/fleet';
import {
  FLEET_LOG_UPDATED_EVENT,
  deleteLogEntry,
  listLogEntries,
} from '@/lib/fleetLogService';
import { LogEntryDialog } from './LogEntryDialog';

interface LogTimelineProps {
  vehicleId?: string;
  vehicles: FleetVehicle[];
  canMutate: boolean;
  defaultVehicleIds?: string[];
}

function formatOccurredAt(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / 86_400_000);
  if (diffDays === 0) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return d.toLocaleDateString([], { weekday: 'short' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function formatFullDate(iso: string): string {
  return new Date(iso).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function LogTimeline({
  vehicleId,
  vehicles,
  canMutate,
  defaultVehicleIds,
}: LogTimelineProps) {
  const [entries, setEntries] = useState<FleetLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState<LogCategory | 'all'>('all');
  const [composing, setComposing] = useState(false);

  const vehicleCodeMap = useMemo(() => {
    const m = new Map<string, string>();
    vehicles.forEach((v) => m.set(v.id, v.code));
    return m;
  }, [vehicles]);

  const load = useCallback(async () => {
    setLoading(true);
    const data = await listLogEntries({
      vehicleId,
      category: categoryFilter === 'all' ? undefined : categoryFilter,
    });
    setEntries(data);
    setLoading(false);
  }, [vehicleId, categoryFilter]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    window.addEventListener(FLEET_LOG_UPDATED_EVENT, load);
    return () => window.removeEventListener(FLEET_LOG_UPDATED_EVENT, load);
  }, [load]);

  const handleDelete = async (entry: FleetLogEntry) => {
    await deleteLogEntry(entry.id);
    toast.success('Entry deleted');
  };

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1">
          {(['all', ...LOG_CATEGORY_OPTIONS.map((o) => o.value)] as (LogCategory | 'all')[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setCategoryFilter(f)}
              className={cn(
                'rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors',
                categoryFilter === f
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-background text-muted-foreground hover:border-foreground/40 hover:text-foreground',
              )}
            >
              {f === 'all' ? 'All' : LOG_CATEGORY_LABELS[f]}
            </button>
          ))}
        </div>
        {canMutate && (
          <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => setComposing(true)}>
            <Plus className="h-3 w-3" />
            Add entry
          </Button>
        )}
      </div>

      {/* Entries */}
      {loading ? (
        <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>
      ) : entries.length === 0 ? (
        <div className="py-8 text-center text-sm text-muted-foreground">
          No log entries yet.
        </div>
      ) : (
        <ol className="relative space-y-0 border-l border-border/50 pl-4">
          {entries.map((entry) => (
            <li key={entry.id} className="group relative pb-4">
              {/* Timeline dot */}
              <span className="absolute -left-[17px] top-1.5 h-2 w-2 rounded-full border border-border bg-background" />

              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  {/* Meta row */}
                  <div className="flex flex-wrap items-center gap-1.5 mb-1">
                    <span
                      className={cn(
                        'rounded-full border px-1.5 py-0 text-[10px] font-semibold uppercase tracking-wide',
                        LOG_CATEGORY_BADGE_CLASSES[entry.category],
                      )}
                    >
                      {LOG_CATEGORY_LABELS[entry.category]}
                    </span>
                    {entry.vehicleIds.map((vid) => {
                      const code = vehicleCodeMap.get(vid);
                      if (!code) return null;
                      return (
                        <span
                          key={vid}
                          className="rounded-full border border-border bg-muted/50 px-1.5 py-0 text-[10px] font-medium"
                        >
                          {code}
                        </span>
                      );
                    })}
                    <span
                      className="text-[10px] text-muted-foreground/60"
                      title={formatFullDate(entry.occurredAt)}
                    >
                      {formatOccurredAt(entry.occurredAt)}
                    </span>
                    {entry.authorDisplayName && (
                      <span className="text-[10px] text-muted-foreground/60">
                        · {entry.authorDisplayName}
                      </span>
                    )}
                  </div>
                  {/* Body */}
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">{entry.body}</p>
                </div>

                {canMutate && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive"
                    onClick={() => handleDelete(entry)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}

      <LogEntryDialog
        open={composing}
        vehicles={vehicles}
        defaultVehicleIds={defaultVehicleIds}
        onClose={() => setComposing(false)}
        onSaved={load}
      />
    </div>
  );
}
