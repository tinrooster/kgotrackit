import { useEffect, useRef, useState } from 'react';
import { Check, Download, ExternalLink, Loader2, Pencil, PenLine, Trash2, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { EsSchematicJson, PlantDrawing } from '@/types/plant';
import {
  deleteDrawing,
  exportDrawingEasySchematicCSV,
  saveDrawingSchematicJson,
  updateDrawing,
} from '@/lib/plantService';
import { toast } from 'sonner';
import { SchematicConnectionsPanel } from './SchematicConnectionsPanel';

// ---------------------------------------------------------------------------
// EasySchematic base URL — stored in localStorage, configurable per-browser
// ---------------------------------------------------------------------------
const ES_URL_KEY = 'trackit:easyschematic-base-url';
const ES_URL_DEFAULT = 'https://easyschematic.live';
// On localhost, EasySchematic runs on port 5174 (direct, not proxied).
// The Vite proxy at /schematic can't serve the full SPA correctly because
// EasySchematic's JS uses absolute paths that resolve back to trackIT's server.
const ES_URL_LOCAL = 'http://localhost:5174';

function getEsBaseUrl(): string {
  try {
    const stored = localStorage.getItem(ES_URL_KEY);
    if (stored) return stored;
    if (window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost') {
      return ES_URL_LOCAL;
    }
    return ES_URL_DEFAULT;
  } catch {
    return ES_URL_DEFAULT;
  }
}
function setEsBaseUrl(url: string) {
  try {
    if (url && url !== ES_URL_DEFAULT && url !== ES_URL_LOCAL) {
      localStorage.setItem(ES_URL_KEY, url);
    } else {
      localStorage.removeItem(ES_URL_KEY);
    }
  } catch { /* ignore */ }
}

// ---------------------------------------------------------------------------
// Link + URL editor form
// ---------------------------------------------------------------------------
function LinkEditorForm({
  drawing,
  onSave,
  onCancel,
}: {
  drawing: PlantDrawing;
  onSave: (id: string, token: string, baseUrl: string) => void;
  onCancel: () => void;
}) {
  const [esId, setEsId] = useState(drawing.easyschematicId ?? '');
  const [token, setToken] = useState(drawing.easyschematicShareToken ?? '');
  const [baseUrl, setBaseUrl] = useState(getEsBaseUrl());
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    const ok = await updateDrawing(drawing.id, {
      easyschematicId: esId.trim() || undefined,
      easyschematicShareToken: token.trim() || undefined,
    });
    if (ok) {
      setEsBaseUrl(baseUrl.trim());
      toast.success('Drawing link updated');
      onSave(esId.trim(), token.trim(), baseUrl.trim() || ES_URL_DEFAULT);
    } else {
      toast.error('Failed to update drawing link');
    }
    setSaving(false);
  };

  return (
    <div className="flex flex-col gap-3 p-3 rounded-md border bg-muted/20">
      <div className="flex flex-col gap-1">
        <Label className="text-xs">EasySchematic URL</Label>
        <Input
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder={ES_URL_DEFAULT}
          className="h-8 text-sm font-mono"
        />
        <p className="text-[11px] text-muted-foreground">
          On localhost this auto-resolves to <code>/schematic</code> (Vite proxy → port 5174).
          On a deployed host use your LAN address, e.g. <code>http://192.168.1.50:5174</code>
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Schematic ID <span className="text-muted-foreground">(optional)</span></Label>
          <Input
            value={esId}
            onChange={(e) => setEsId(e.target.value)}
            placeholder="e.g. abc123"
            className="h-8 text-sm font-mono"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Share token <span className="text-muted-foreground">(optional — enables embed)</span></Label>
          <Input
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="e.g. xyz789abc"
            className="h-8 text-sm font-mono"
          />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Share token: open the schematic → Share → copy the token from the URL (<code>/s/{'<token>'}</code>).
        Not required for the JSON round-trip workflow.
      </p>
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

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

interface DrawingDetailPanelProps {
  drawing: PlantDrawing;
  onUpdated: (updated: PlantDrawing) => void;
  onDeleted: (id: string) => void;
}

export function DrawingDetailPanel({ drawing: initialDrawing, onUpdated, onDeleted }: DrawingDetailPanelProps) {
  const [drawing, setDrawing] = useState(initialDrawing);
  const [editingLink, setEditingLink] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [uploadingJson, setUploadingJson] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const popupRef = useRef<Window | null>(null);

  const esBase = getEsBaseUrl();
  const shareUrl = drawing.easyschematicShareToken
    ? `${esBase}/s/${drawing.easyschematicShareToken}`
    : null;
  const embedUrl = shareUrl ?? esBase;

  // ---- postMessage bridge ----
  useEffect(() => {
    const handleMessage = async (e: MessageEvent) => {
      if (e.data?.type === 'EASYSCHEMATIC_READY') {
        // EasySchematic popup is ready — push the stored JSON into it
        if (drawing.schematicJson && popupRef.current && !popupRef.current.closed) {
          popupRef.current.postMessage(
            { type: 'TRACKIT_LOAD_SCHEMATIC', payload: drawing.schematicJson },
            '*',
          );
        }
      }
      if (e.data?.type === 'EASYSCHEMATIC_SAVED' && e.data.payload) {
        const json = e.data.payload as EsSchematicJson;
        const updated = { ...drawing, schematicJson: json };
        setDrawing(updated);
        onUpdated(updated);
        await saveDrawingSchematicJson(drawing.id, json);
        toast.success('Schematic saved');
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [drawing, onUpdated]);

  const openEasySchematic = () => {
    if (popupRef.current && !popupRef.current.closed) {
      popupRef.current.focus();
      return;
    }
    popupRef.current = window.open(
      embedUrl,
      'easyschematic',
      'width=1400,height=900,resizable=yes,scrollbars=yes',
    );
  };
  // ---- CSV export ----
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

  // ---- JSON upload ----
  const handleJsonUpload = (file: File) => {
    setUploadingJson(true);
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const json = JSON.parse(e.target?.result as string) as EsSchematicJson;
        if (!Array.isArray(json.nodes) || !Array.isArray(json.edges)) {
          toast.error('Not a valid EasySchematic JSON file');
          setUploadingJson(false);
          return;
        }
        const updated = { ...drawing, schematicJson: json };
        setDrawing(updated);
        onUpdated(updated);
        const ok = await saveDrawingSchematicJson(drawing.id, json);
        if (ok) {
          toast.success(`Loaded ${json.edges.length} connections`);
        } else {
          toast.success(`Loaded ${json.edges.length} connections (not persisted — run DB migration)`);
        }
      } catch {
        toast.error('Could not parse JSON file');
      }
      setUploadingJson(false);
    };
    reader.readAsText(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleJsonUpload(file);
    e.target.value = '';
  };

  // ---- Drop handler ----
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file?.name.endsWith('.json')) handleJsonUpload(file);
  };

  // ---- Clear JSON ----
  const handleClearJson = async () => {
    const ok = await saveDrawingSchematicJson(drawing.id, null);
    if (ok) {
      const updated = { ...drawing, schematicJson: undefined };
      setDrawing(updated);
      onUpdated(updated);
    }
  };

  // ---- Annotated JSON → EasySchematic ----
  const handleAnnotatedExport = (annotatedJson: EsSchematicJson) => {
    // Persist annotated version as the current schematic so READY handler uses it
    const updated = { ...drawing, schematicJson: annotatedJson };
    setDrawing(updated);
    onUpdated(updated);
    saveDrawingSchematicJson(drawing.id, annotatedJson);

    const popupOpen = popupRef.current && !popupRef.current.closed;
    if (popupOpen) {
      popupRef.current!.postMessage(
        { type: 'TRACKIT_LOAD_SCHEMATIC', payload: annotatedJson },
        '*',
      );
      toast.success('Cable numbers sent to EasySchematic');
    } else {
      // Open popup — EASYSCHEMATIC_READY will load the annotated version automatically
      openEasySchematic();
      toast.success('Opening EasySchematic with cable numbers applied');
    }
  };

  // ---- Link save ----
  const handleLinkSave = (id: string, token: string, baseUrl: string) => {
    setEsBaseUrl(baseUrl);
    const updated = {
      ...drawing,
      easyschematicId: id || undefined,
      easyschematicShareToken: token || undefined,
    };
    setDrawing(updated);
    onUpdated(updated);
    setEditingLink(false);
  };

  const handleDelete = async () => {
    setDeleting(true);
    const ok = await deleteDrawing(drawing.id);
    if (ok) {
      onDeleted(drawing.id);
    } else {
      toast.error('Failed to delete drawing');
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  const hasJson = !!drawing.schematicJson;

  return (
    <div className="flex flex-col gap-4 pt-2">

      {/* ── Action bar ─────────────────────────────────────────────────────── */}
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
          Export cables CSV
        </Button>

        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          className="hidden"
          onChange={handleFileChange}
        />
        <Button
          variant="outline"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploadingJson}
        >
          {uploadingJson
            ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
            : <Upload className="h-3.5 w-3.5 mr-1.5" />}
          {hasJson ? 'Replace JSON' : 'Upload schematic JSON'}
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={openEasySchematic}
        >
          <PenLine className="h-3.5 w-3.5 mr-1.5" />
          Open EasySchematic
        </Button>

        {shareUrl && (
          <a
            href={shareUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:underline"
          >
            <ExternalLink className="h-3.5 w-3.5" /> Open in new tab
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
            : <><Pencil className="h-3 w-3 mr-1" />
                {drawing.easyschematicShareToken ? 'Edit link / URL' : 'Configure EasySchematic'}</>}
        </Button>

        {confirmDelete ? (
          <div className="flex items-center gap-1.5 ml-2">
            <span className="text-xs text-destructive">Delete drawing?</span>
            <Button
              size="sm"
              variant="destructive"
              className="h-7 text-xs"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Confirm'}
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setConfirmDelete(false)} disabled={deleting}>
              Cancel
            </Button>
          </div>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            className="text-xs text-muted-foreground hover:text-destructive"
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 className="h-3 w-3 mr-1" /> Delete
          </Button>
        )}
      </div>

      {/* ── Link / URL editor ───────────────────────────────────────────────── */}
      {editingLink && (
        <LinkEditorForm
          drawing={drawing}
          onSave={handleLinkSave}
          onCancel={() => setEditingLink(false)}
        />
      )}

      {/* ── Connection assignment panel (JSON workflow) ──────────────────────── */}
      {hasJson && !editingLink && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Connection assignments
            </span>
            <span className="text-xs text-muted-foreground">
              · {drawing.schematicJson!.edges.length} connections
              · {drawing.schematicJson!.nodes.length} devices
            </span>
            <button
              onClick={handleClearJson}
              className="ml-auto text-xs text-muted-foreground hover:text-destructive flex items-center gap-1"
            >
              <X className="h-3 w-3" /> Clear JSON
            </button>
          </div>
          <SchematicConnectionsPanel
            json={drawing.schematicJson!}
            onExport={handleAnnotatedExport}
          />
        </div>
      )}

      {/* ── No-schematic hint ───────────────────────────────────────────────── */}
      {!hasJson && !editingLink && (
        <div
          className="rounded-md border border-dashed p-4 text-center flex flex-col gap-2 cursor-pointer hover:bg-muted/20 transition-colors"
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="h-5 w-5 mx-auto text-muted-foreground" />
          <p className="text-sm text-muted-foreground font-medium">
            Drop EasySchematic JSON here or click to upload
          </p>
          <p className="text-xs text-muted-foreground">
            Or use <span className="font-medium">Open EasySchematic</span> above to draw directly — Ctrl+S saves back here automatically.
          </p>
        </div>
      )}

      {/* ── File paths ──────────────────────────────────────────────────────── */}
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
