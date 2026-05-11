import { useState } from 'react';
import {
  Download, FileSearch, Info, Loader2, Settings2, Copy,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { exportCablesCSV, exportDrawingsCSV, findDuplicateCableNumbers, type DuplicateCableGroup } from '@/lib/plantService';
import { toast } from 'sonner';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function downloadText(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Duplicates dialog
// ---------------------------------------------------------------------------
function DuplicatesDialog({
  open,
  onClose,
  groups,
}: {
  open: boolean;
  onClose: () => void;
  groups: DuplicateCableGroup[];
}) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Duplicate cable numbers</DialogTitle>
        </DialogHeader>
        {groups.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">No duplicates found.</p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              {groups.length} duplicate cable numbers found (same number assigned to multiple records).
            </p>
            <ScrollArea className="h-72 mt-2 rounded-md border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50 text-left text-xs text-muted-foreground sticky top-0">
                    <th className="px-3 py-2 font-medium">Cable #</th>
                    <th className="px-3 py-2 font-medium">Count</th>
                    <th className="px-3 py-2 font-medium">Record IDs</th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map((g) => (
                    <tr key={g.cableNumber} className="border-b last:border-0">
                      <td className="px-3 py-1.5 font-mono text-xs font-medium">{g.cableNumber}</td>
                      <td className="px-3 py-1.5 text-xs text-orange-700 dark:text-orange-400 font-semibold">{g.count}×</td>
                      <td className="px-3 py-1.5 font-mono text-[10px] text-muted-foreground">
                        {g.ids.map((id) => id.slice(0, 8)).join(', ')}…
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollArea>
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => {
                const csv = ['Cable #,Count,IDs', ...groups.map((g) => `${g.cableNumber},${g.count},"${g.ids.join(';')}"`)].join('\r\n');
                downloadText(csv, `cable_duplicates_${new Date().toISOString().slice(0,10)}.csv`);
              }}
            >
              <Download className="h-3.5 w-3.5 mr-1.5" /> Export duplicates CSV
            </Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Import info dialog
// ---------------------------------------------------------------------------
function ImportInfoDialog({ open, onClose, mode }: { open: boolean; onClose: () => void; mode: 'import' | 'reconcile' | 'drawing-files' }) {
  const content: Record<string, { title: string; text: string; cmd: string }> = {
    import: {
      title: 'Import cables from spreadsheet',
      text: 'The import uses a two-step Python workflow. Run from the scripts/plant_import/ directory:',
      cmd: `# Step 1 — normalize the Excel export to JSON\npython normalize.py \\\n  --excel "H:\\Migration\\Desktop\\Desktop\\AWS webside cableDB\\Cable DB source file version 2.xlsm" \\\n  --org-id <your-org-uuid>\n\n# Step 2 — review out/import_summary.json, then upload\npython upload.py \\\n  --supabase-url https://fjfwxhgmgzxtipcarasl.supabase.co \\\n  --service-key <service-role-key> \\\n  --org-id <your-org-uuid>`,
    },
    reconcile: {
      title: 'Reconcile with source database',
      text: 'Reconcile compares the current Supabase data with a new Excel export, inserting new cables and flagging missing ones. Lifecycle fields (status, verified_at) are preserved.',
      cmd: `# Dry run — no changes written\npython reconcile.py \\\n  --excel "H:\\Path\\To\\afcables.xlsx" \\\n  --supabase-url https://fjfwxhgmgzxtipcarasl.supabase.co \\\n  --service-key <service-role-key> \\\n  --org-id <your-org-uuid>\n\n# Review out/reconcile_summary.json, then apply:\npython reconcile.py ... --apply`,
    },
    'drawing-files': {
      title: 'Import drawing file paths',
      text: 'Links physical AutoCAD files on the server to drawing records. Run the import script:',
      cmd: `python import_drawing_files.py \\\n  --excel "H:\\projects\\cursor_projects\\TEd_trackIT\\test data\\DrawingsDirListExtracted_20260510_211643.xlsx" \\\n  --supabase-url https://fjfwxhgmgzxtipcarasl.supabase.co \\\n  --service-key <service-role-key> \\\n  --org-id <your-org-uuid>`,
    },
  };

  const c = content[mode];
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{c.title}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">{c.text}</p>
        <div className="relative mt-2">
          <pre className="rounded-md bg-muted px-4 py-3 text-xs font-mono overflow-x-auto whitespace-pre">
            {c.cmd}
          </pre>
          <button
            onClick={() => { navigator.clipboard.writeText(c.cmd); toast.success('Copied'); }}
            className="absolute top-2 right-2 p-1 rounded text-muted-foreground hover:text-foreground"
            title="Copy to clipboard"
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Main menu component
// ---------------------------------------------------------------------------
export function PlantAdminMenu() {
  const [busy, setBusy] = useState<string | null>(null);
  const [dupeDialog, setDupeDialog] = useState(false);
  const [dupeGroups, setDupeGroups] = useState<DuplicateCableGroup[]>([]);
  const [infoMode, setInfoMode] = useState<'import' | 'reconcile' | 'drawing-files' | null>(null);

  const handleExportCables = async () => {
    setBusy('export-cables');
    const csv = await exportCablesCSV();
    if (csv) downloadText(csv, `cables_${new Date().toISOString().slice(0,10)}.csv`);
    else toast.error('No cables to export');
    setBusy(null);
  };

  const handleExportDrawings = async () => {
    setBusy('export-drawings');
    const csv = await exportDrawingsCSV();
    if (csv) downloadText(csv, `drawings_${new Date().toISOString().slice(0,10)}.csv`);
    else toast.error('No drawings to export');
    setBusy(null);
  };

  const handleFindDupes = async () => {
    setBusy('find-dupes');
    const groups = await findDuplicateCableNumbers();
    setDupeGroups(groups);
    setDupeDialog(true);
    setBusy(null);
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1.5">
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Settings2 className="h-3.5 w-3.5" />}
            Admin
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuLabel>Export</DropdownMenuLabel>
          <DropdownMenuItem onClick={handleExportCables} disabled={!!busy}>
            <Download className="h-3.5 w-3.5 mr-2" /> Export cables CSV
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleExportDrawings} disabled={!!busy}>
            <Download className="h-3.5 w-3.5 mr-2" /> Export drawings CSV
          </DropdownMenuItem>

          <DropdownMenuSeparator />
          <DropdownMenuLabel>Analysis</DropdownMenuLabel>
          <DropdownMenuItem onClick={handleFindDupes} disabled={!!busy}>
            <FileSearch className="h-3.5 w-3.5 mr-2" /> Find duplicate cable #s
          </DropdownMenuItem>

          <DropdownMenuSeparator />
          <DropdownMenuLabel>Maintenance</DropdownMenuLabel>
          <DropdownMenuItem onClick={() => setInfoMode('import')}>
            <Info className="h-3.5 w-3.5 mr-2" /> Import from spreadsheet…
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setInfoMode('reconcile')}>
            <Info className="h-3.5 w-3.5 mr-2" /> Reconcile with source…
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setInfoMode('drawing-files')}>
            <Info className="h-3.5 w-3.5 mr-2" /> Import drawing files…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <DuplicatesDialog open={dupeDialog} onClose={() => setDupeDialog(false)} groups={dupeGroups} />
      {infoMode && (
        <ImportInfoDialog open={true} onClose={() => setInfoMode(null)} mode={infoMode} />
      )}
    </>
  );
}
