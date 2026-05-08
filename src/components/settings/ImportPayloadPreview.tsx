import type { NormalizedImportPayload } from '@/lib/importListNormalization';
import { summarizeImportPayloadLists } from '@/lib/importListNormalization';

interface ImportPayloadPreviewProps {
  data: NormalizedImportPayload;
  fileName?: string;
}

export function ImportPayloadPreview({ data, fileName }: ImportPayloadPreviewProps) {
  const listSummaries = summarizeImportPayloadLists(data);
  const inventoryCount = Array.isArray(data.inventory) ? data.inventory.length : 0;

  return (
    <div className="space-y-3 text-sm">
      {fileName ? (
        <p className="text-muted-foreground">
          File: <span className="font-medium text-foreground">{fileName}</span>
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {inventoryCount > 0 ? (
          <span className="rounded-md border border-border/60 bg-muted/30 px-2 py-0.5 text-xs font-medium">
            Inventory {inventoryCount}
          </span>
        ) : null}
        {listSummaries.map((s) => (
          <span
            key={s.key}
            className="rounded-md border border-border/60 bg-muted/30 px-2 py-0.5 text-xs font-medium"
            title={`${s.subCount} sub-location(s) / sub-rows`}
          >
            {s.label}: {s.topCount} top
            {s.subCount > 0 ? ` · ${s.subCount} nested` : ''}
          </span>
        ))}
      </div>
      {listSummaries.length === 0 && inventoryCount === 0 ? (
        <p className="text-muted-foreground">No list or inventory sections found in this file.</p>
      ) : null}
      <div className="space-y-2">
        {listSummaries.map((s) => (
          <details key={s.key} className="rounded-md border border-border/50 bg-muted/10">
            <summary className="cursor-pointer select-none px-3 py-2 text-xs font-medium text-foreground hover:bg-muted/30">
              {s.label} — preview (first {Math.min(s.lines.length, 60)} paths)
            </summary>
            <pre className="max-h-48 overflow-auto border-t border-border/40 px-3 py-2 font-mono text-[11px] leading-relaxed text-muted-foreground">
              {s.lines.length > 0 ? s.lines.join('\n') : '— (no rows)'}
            </pre>
          </details>
        ))}
      </div>
    </div>
  );
}
