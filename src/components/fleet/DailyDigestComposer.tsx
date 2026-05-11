import { useState, useCallback } from 'react';
import { Copy, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import type { FleetVehicle } from '@/types/fleet';
import { listLogEntries } from '@/lib/fleetLogService';
import { LOG_CATEGORY_LABELS } from '@/types/fleet';

interface DailyDigestComposerProps {
  open: boolean;
  vehicles: FleetVehicle[];
  onClose: () => void;
}

function toDateInputValue(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function DailyDigestComposer({ open, vehicles, onClose }: DailyDigestComposerProps) {
  const today = new Date();
  const [fromDate, setFromDate] = useState(toDateInputValue(today));
  const [toDate, setToDate] = useState(toDateInputValue(today));
  const [digest, setDigest] = useState('');
  const [loading, setLoading] = useState(false);

  const vehicleMap = new Map(vehicles.map((v) => [v.id, v]));

  const handleGenerate = useCallback(async () => {
    setLoading(true);
    const from = new Date(`${fromDate}T00:00:00`);
    const to = new Date(`${toDate}T23:59:59`);

    const entries = await listLogEntries({});
    const inRange = entries.filter((e) => {
      const d = new Date(e.occurredAt);
      return d >= from && d <= to;
    });

    // Group by vehicle, then include fleet-wide entries separately
    const byVehicle = new Map<string, typeof inRange>();
    const fleetWide: typeof inRange = [];

    for (const entry of inRange) {
      if (entry.vehicleIds.length === 0) {
        fleetWide.push(entry);
      } else {
        for (const vid of entry.vehicleIds) {
          if (!byVehicle.has(vid)) byVehicle.set(vid, []);
          byVehicle.get(vid)!.push(entry);
        }
      }
    }

    const dateLabel = fromDate === toDate
      ? new Date(`${fromDate}T12:00:00`).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
      : `${fromDate} – ${toDate}`;

    const lines: string[] = [
      `FLEET REPORT — ${dateLabel}`,
      '─'.repeat(40),
      '',
    ];

    // Sort vehicles by displayOrder, only include those with entries
    const sortedVehicleIds = [...byVehicle.keys()].sort((a, b) => {
      const vA = vehicleMap.get(a);
      const vB = vehicleMap.get(b);
      return (vA?.displayOrder ?? 999) - (vB?.displayOrder ?? 999);
    });

    for (const vid of sortedVehicleIds) {
      const v = vehicleMap.get(vid);
      const vehicleEntries = byVehicle.get(vid)!;
      const code = v?.code ?? vid;
      const status = v ? ` [${v.status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}]` : '';

      lines.push(`${code}${status}`);
      for (const entry of vehicleEntries) {
        const time = new Date(entry.occurredAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const cat = LOG_CATEGORY_LABELS[entry.category].toUpperCase();
        lines.push(`  [${cat}] ${entry.body.trim()} (${time})`);
      }
      lines.push('');
    }

    if (fleetWide.length > 0) {
      lines.push('FLEET-WIDE');
      for (const entry of fleetWide) {
        const time = new Date(entry.occurredAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const cat = LOG_CATEGORY_LABELS[entry.category].toUpperCase();
        lines.push(`  [${cat}] ${entry.body.trim()} (${time})`);
      }
      lines.push('');
    }

    if (inRange.length === 0) {
      lines.push('No log entries for this period.');
    }

    setDigest(lines.join('\n'));
    setLoading(false);
  }, [fromDate, toDate, vehicles]);

  const handleCopy = () => {
    navigator.clipboard.writeText(digest).then(() => {
      toast.success('Copied to clipboard');
    });
  };

  const handleMailto = () => {
    const subject = encodeURIComponent(`Fleet Report — ${fromDate}`);
    const body = encodeURIComponent(digest);
    window.open(`mailto:?subject=${subject}&body=${body}`, '_self');
  };

  const handleClose = () => {
    setDigest('');
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
          <DialogTitle>Daily Digest</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          <div className="flex gap-3 items-end">
            <div className="space-y-1.5 flex-1">
              <Label htmlFor="digest-from">From</Label>
              <Input
                id="digest-from"
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5 flex-1">
              <Label htmlFor="digest-to">To</Label>
              <Input
                id="digest-to"
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
              />
            </div>
            <Button onClick={handleGenerate} disabled={loading}>
              {loading ? 'Building…' : 'Generate'}
            </Button>
          </div>

          {digest && (
            <div className="space-y-1.5">
              <Label>Output</Label>
              <Textarea
                value={digest}
                onChange={(e) => setDigest(e.target.value)}
                rows={16}
                className="font-mono text-xs resize-none"
              />
            </div>
          )}

          {!digest && !loading && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Select a date range and click Generate to build the report.
            </p>
          )}
        </div>

        <DialogFooter className="px-6 py-4 border-t shrink-0">
          <Button variant="outline" onClick={handleClose}>Close</Button>
          {digest && (
            <>
              <Button variant="outline" className="gap-1.5" onClick={handleCopy}>
                <Copy className="h-3.5 w-3.5" />
                Copy
              </Button>
              <Button variant="outline" className="gap-1.5" onClick={handleMailto}>
                <Mail className="h-3.5 w-3.5" />
                Email
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
