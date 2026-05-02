import { SettingsService } from "@/lib/settingsService";

/** Parse form / ISO date string or return today if invalid. */
export function parseDateForTag(input: string | Date | undefined): Date {
  if (input === undefined || input === "") {
    return new Date();
  }
  if (input instanceof Date) {
    return Number.isNaN(input.getTime()) ? new Date() : input;
  }
  const d = new Date(input);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

/** Normalize stored / form date to YYYY-MM-DD for tag generation. */
export function coerceDateInServiceForTag(input: unknown): string | undefined {
  if (input === undefined || input === null || input === "") {
    return undefined;
  }
  if (input instanceof Date) {
    return Number.isNaN(input.getTime()) ? undefined : input.toISOString().slice(0, 10);
  }
  if (typeof input === "string") {
    return input.slice(0, 10);
  }
  return undefined;
}

/** YYMMDD segment for asset tag pattern `{prefix}_{YYMMDD}_{seq}`. */
export function formatTagDateYYMMDD(d: Date): string {
  const yy = String(d.getFullYear()).slice(-2);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yy}${mm}${dd}`;
}

function formatTagSeq(seq: number): string {
  if (seq < 100) {
    return String(seq).padStart(2, "0");
  }
  return String(seq);
}

/** Physical asset tag: `PREFIX_YYMMDD_seq` (date = in-service date when assigning). */
export function buildAssetTagString(prefix: string, yymmdd: string, seq: number): string {
  const p = prefix.toUpperCase().replace(/[^A-Z0-9]/g, "") || "TAG";
  return `${p}_${yymmdd}_${formatTagSeq(seq)}`;
}

/** Preview next durable record ID (numeric only, no prefix) without mutating settings. */
export function previewNextRecordId(): string {
  const d = SettingsService.loadDefaultSettings();
  const next = (d.recordIdSequence ?? 0) + 1;
  return String(next);
}

/** Preview next asset tag(s) without mutating settings. */
export function previewNextAssetTags(
  dateInService: string | undefined,
  quantity: number,
  trackingMode: "line_item" | "per_unit"
): { line: string; assignsOnSave: boolean } {
  const d = SettingsService.loadDefaultSettings();
  if (!d.autoAssignAssetId) {
    return { line: "—", assignsOnSave: false };
  }
  const prefix = (d.assetIdPrefix || "AST").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const yymmdd = formatTagDateYYMMDD(parseDateForTag(dateInService));
  const count = trackingMode === "per_unit" ? Math.max(quantity, 1) : 1;
  const seqStart = (d.assetIdSequence || 0) + 1;
  const start = buildAssetTagString(prefix, yymmdd, seqStart);
  const end = buildAssetTagString(prefix, yymmdd, seqStart + count - 1);
  if (count > 1) {
    return { line: `${start} – ${end}`, assignsOnSave: true };
  }
  return { line: start, assignsOnSave: true };
}

/** Allocate next durable record ID (numeric string, one per inventory row). */
export function allocateRecordId(): string {
  const defaults = SettingsService.loadDefaultSettings();
  const next = (defaults.recordIdSequence ?? 0) + 1;
  SettingsService.saveDefaultSettings({
    ...defaults,
    recordIdSequence: next,
  });
  return String(next);
}

/** Allocate asset tag(s) for labels/QR; uses in-service date in the tag. */
export function allocateAssetTags(
  dateInService: string | undefined,
  quantity: number,
  trackingMode: "line_item" | "per_unit"
): { startId: string; endId?: string } {
  const defaults = SettingsService.loadDefaultSettings();
  const prefix = (defaults.assetIdPrefix || "AST").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const yymmdd = formatTagDateYYMMDD(parseDateForTag(dateInService));
  const count = trackingMode === "per_unit" ? Math.max(quantity, 1) : 1;
  const seqStart = (defaults.assetIdSequence || 0) + 1;
  const startId = buildAssetTagString(prefix, yymmdd, seqStart);
  const endId =
    count > 1 ? buildAssetTagString(prefix, yymmdd, seqStart + count - 1) : undefined;
  SettingsService.saveDefaultSettings({
    ...defaults,
    assetIdSequence: seqStart + count - 1,
  });
  return { startId, endId: count > 1 ? endId : undefined };
}
