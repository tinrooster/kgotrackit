import { useState } from 'react';
import { Download, ExternalLink, Loader2, Pencil, X, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { PlantDrawing } from '@/types/plant';
import { exportDrawingEasySchematicCSV, updateDrawing } from '@/lib/plantService';
import { toast } from 'sonner';

const ES_BASE = 'https://easyschematic.live';

interface DrawingDetailPanelProps {
  drawing: PlantDrawing;
  onUpdated: (updated: PlantDrawing) => void;
}

function LinkEditorForm({
  drawing,
  onSave,
  onCancel,
}: {
  drawing: PlantDrawing;
  onSave: (id: string, token: string) => void;
  onCancel: () => void;
}) {
  const [esId, setEsId] = useState(drawing.easyschematicId ?? '');
  const [token, setToken] = useState(drawing.easyschematicShareToken ?? '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    const ok = await updateDrawing(drawing.id, {
      easyschematicId: esId.trim() || undefined,
      easyschematicShareToken: token.trim() || undefined,
    });
    if (ok) {
      toast.success('Drawing link updated');
      onSave(esId.trim(), token.trim());
    } else {
      toast.error('Failed to update drawing link');
    }
    setSaving(false);
  };

  return (
    <div className="flex flex-col gap-3 p-3 rounded-md border bg-muted/20">
      <p className="text-xs text-muted-foreground">
        Open the schematic in EasySchematic, click Share → copy the token from the URL
        (<code>/s/{'<token>'}</code>) and paste it below.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Schematic ID</Label>
          <Input
            value={esId}
            onChange={(e) => setEsId(e.target.value)}
            placeholder="e.g. abc123"
            className="h-8 text-sm font-mono"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Share token</Label>
          <Input
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="e.g. xyz789abc"
            className="h-8 text-sm font-mono"
          />
        </div>
      </div>
      <div className="flex gap-2">
        <Button size="sm" className="h-7" onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Check className="h-3 w-3 mr-1" />}
          Save
        </Button>
        <Button size="sm" variant="ghost" className="h-7" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

export function DrawingDetailPanel({ drawing: initialDrawing, onUpdated }: DrawingDetailPanelProps) {
  const [drawing, setDrawing] = useState(initialDrawing);
  const [editingLink, setEditingLink] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [embedError, setEmbedError] = useState(false);

  const shareUrl = drawing.easyschematicShareToken
    ? `${ES_BASE}/s/${drawing.easyschematicShareToken}`
    : null;

  const handleExportCSV = async () => {
    setExporting(true);
    const csv = await exportDrawingEasySchematicCSV(drawing.id);
    if (csv) {
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `easyschematic_${drawing.dwgNumber.replace(/[^a-z0-9]/gi, '_')}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } else {
      toast.error('No cables found for this drawing');
    }
    setExporting(false);
  };

  const handleLinkSave = (id: string, token: string) => {
    const updated = {
      ...drawing,
      easyschematicId: id || undefined,
      easyschematicShareToken: token || undefined,
    };
    setDrawing(updated);
    onUpdated(updated);
    setEditingLink(false);
    setEmbedError(false);
  };

  return (
    <div className="flex flex-col gap-4 pt-2">
      {/* Action bar */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={handleExportCSV}
          disabled={exporting}
        >
          {exporting
            ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
            : <Download className="h-3.5 w-3.5 mr-1.5" />}
          Export cables as EasySchematic CSV
        </Button>

        {shareUrl && (
          <a
            href={shareUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:underline"
          >
            <ExternalLink className="h-3.5 w-3.5" /> Open in EasySchematic
          </a>
        )}

        <Button
          variant="ghost"
          size="sm"
          className="ml-auto text-xs text-muted-foreground"
          onClick={() => setEditingLink((v) => !v)}
        >
          {editingLink
            ? <><X className="h-3 w-3 mr-1" /> Cancel</>
            : <><Pencil className="h-3 w-3 mr-1" /> {drawing.easyschematicShareToken ? 'Edit link' : 'Link schematic'}</>}
        </Button>
      </div>

      {/* Link editor */}
      {editingLink && (
        <LinkEditorForm
          drawing={drawing}
          onSave={handleLinkSave}
          onCancel={() => setEditingLink(false)}
        />
      )}

      {/* Workflow hint when no schematic linked */}
      {!shareUrl && !editingLink && (
        <div className="rounded-md border border-dashed p-4 text-center flex flex-col gap-2">
          <p className="text-sm text-muted-foreground font-medium">No schematic linked</p>
          <ol className="text-xs text-muted-foreground text-left max-w-sm mx-auto list-decimal list-inside space-y-1">
            <li>Export cables above → downloads an EasySchematic-compatible CSV</li>
            <li>Import the CSV at <a href="https://easyschematic.live" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">easyschematic.live</a></li>
            <li>Save and share the schematic → copy the share token</li>
            <li>Click <strong>Link schematic</strong> above and paste the token</li>
          </ol>
        </div>
      )}

      {/* Embedded schematic */}
      {shareUrl && !editingLink && (
        <div className="rounded-md border overflow-hidden">
          {embedError ? (
            <div className="flex flex-col items-center justify-center py-10 gap-2 bg-muted/20">
              <p className="text-sm text-muted-foreground">Schematic could not be embedded.</p>
              <a
                href={shareUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline"
              >
                <ExternalLink className="h-3.5 w-3.5" /> Open in new tab
              </a>
            </div>
          ) : (
            <iframe
              src={shareUrl}
              title={`EasySchematic — ${drawing.dwgNumber}`}
              className="w-full"
              style={{ height: '520px', border: 'none' }}
              onError={() => setEmbedError(true)}
              allow="clipboard-read; clipboard-write"
              sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
            />
          )}
        </div>
      )}

      {/* File paths */}
      {(drawing.dwgFilePath || drawing.visioFilePath) && (
        <div className="flex flex-col gap-1 text-xs text-muted-foreground">
          {drawing.dwgFilePath && (
            <div><span className="font-medium">DWG:</span> <span className="font-mono">{drawing.dwgFilePath}</span></div>
          )}
          {drawing.visioFilePath && (
            <div><span className="font-medium">Visio:</span> <span className="font-mono">{drawing.visioFilePath}</span></div>
          )}
        </div>
      )}
    </div>
  );
}
