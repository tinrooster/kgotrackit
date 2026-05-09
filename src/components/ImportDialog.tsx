import { useState, ChangeEvent, useMemo, useRef, useEffect, type KeyboardEvent } from "react";
import * as XLSX from 'xlsx';
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { DraggableDialogContent } from "@/components/ui/draggable-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from 'sonner';
import { Upload, Loader2, AlertTriangle, CheckCircle, ArrowRight, ClipboardPaste, Grid3x3, Wand2, SlidersHorizontal, ScanLine } from 'lucide-react';
import { InventoryItem } from '@/types/inventory';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from 'date-fns';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { BarcodeScannerDialog } from "@/components/BarcodeScannerDialog";
import {
  loadImportDialogPrefs,
  saveImportDialogPrefs,
  defaultImportDialogPrefs,
  type ImportSourceMode,
  type ImportDialogPrefs,
} from "@/lib/importDialogPrefs";

interface ImportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (itemsToImport: Partial<InventoryItem>[]) => Promise<{ importedCount: number; skippedCount: number }>;
  onComplete: (importedCount: number, skippedCount: number) => void;
  /**
   * Optional library suggestions for the in-app grid columns. Each entry is rendered as a
   * native <datalist> attached to the matching cell input, providing autocomplete from
   * existing workspace lookups (categories, locations, suppliers, projects, units, …).
   * Missing or empty arrays are ignored — those cells fall back to plain text input.
   */
  gridFieldSuggestions?: Partial<Record<GridFieldKey, readonly string[]>>;
  /**
   * Stable per-user identifier used to scope persisted UI prefs (default tab,
   * hidden columns). Falls back to a shared "guest" bucket when omitted.
   */
  userKey?: string | null;
}

// Define expected headers (case-insensitive check later)
const EXPECTED_HEADERS = [
  'name', 'description', 'quantity', 'unit', 'costPerUnit', 'category', 
  'location', 'reorderLevel', 'barcode', 'notes', 'supplier', 
  'supplierWebsite', 'project', 'orderStatus', 'deliveryPercentage', 
  'expectedDeliveryDate' 
  // 'id' and 'lastUpdated' will be handled by the import logic
];
const UNMAPPED_HEADER_VALUE = "__UNMAPPED_HEADER__";

/** Applied when unit is left blank in bulk import (grid, file, or paste). */
export const DEFAULT_BULK_IMPORT_UNIT = "each";

/** Fixed columns for the in-app bulk entry grid (keys match import field names). */
export const INPUT_GRID_FIELDS = [
  "name",
  "unit",
  "quantity",
  "category",
  "location",
  "project",
  "supplier",
  "costPerUnit",
  "reorderLevel",
  "barcode",
  "notes",
  "description",
] as const;

export type BulkInputGridRow = Record<(typeof INPUT_GRID_FIELDS)[number], string>;
export type GridFieldKey = (typeof INPUT_GRID_FIELDS)[number];
type GridFillMode = 'increment' | 'copy';

const INITIAL_GRID_ROWS = 18;
const GRID_ROWS_ADD_CHUNK = 10;
const MAX_GRID_ROWS = 200;

/** Required cells that must always remain reachable by keyboard. */
const REQUIRED_GRID_FIELDS: ReadonlySet<GridFieldKey> = new Set<GridFieldKey>(["name"]);

/** Grid columns that must contain non-negative numeric values when present. */
const NUMERIC_GRID_FIELDS: ReadonlySet<GridFieldKey> = new Set<GridFieldKey>([
  "quantity",
  "costPerUnit",
  "reorderLevel",
]);

/** True when `raw` parses to a finite, non-negative number (or is empty/whitespace). */
function isValidNumericString(raw: string): boolean {
  const trimmed = raw.trim();
  if (trimmed === "") return true;
  const numeric = Number(trimmed);
  return Number.isFinite(numeric) && numeric >= 0;
}

/** "costPerUnit" -> "cost Per Unit"; matches the existing header rendering style. */
function humanizeFieldLabel(field: string): string {
  return field.replace(/([A-Z])/g, " $1").trim();
}

/**
 * Splits a fill seed into a prefix and a numeric start.
 * "Light 5" -> { prefix: "Light ", start: 5, pad: 1 }
 * "AC#01"   -> { prefix: "AC#", start: 1, pad: 2 } (preserves leading zeros)
 * "lights"  -> { prefix: "lights ", start: 1, pad: 0 } (separator only when missing)
 * ""        -> { prefix: "", start: 1, pad: 0 }
 */
function deriveIncrementParts(value: string): { prefix: string; start: number; pad: number } {
  const trailing = value.match(/^(.*?)(\d+)\s*$/);
  if (trailing) {
    return { prefix: trailing[1], start: parseInt(trailing[2], 10), pad: trailing[2].length };
  }
  if (value.length === 0) return { prefix: "", start: 1, pad: 0 };
  const needsSeparator = !/[\s\-_/.#]$/.test(value);
  return { prefix: needsSeparator ? `${value} ` : value, start: 1, pad: 0 };
}

function buildIncrementValue(prefix: string, n: number, pad: number): string {
  return `${prefix}${pad > 0 ? String(n).padStart(pad, "0") : String(n)}`;
}

function createEmptyGridRow(): BulkInputGridRow {
  const row = {} as BulkInputGridRow;
  INPUT_GRID_FIELDS.forEach((field) => {
    row[field] = field === "unit" ? DEFAULT_BULK_IMPORT_UNIT : "";
  });
  return row;
}

function createInitialGridRows(): BulkInputGridRow[] {
  return Array.from({ length: INITIAL_GRID_ROWS }, () => createEmptyGridRow());
}

function isGridRowBlank(row: BulkInputGridRow): boolean {
  return INPUT_GRID_FIELDS.every((field) => !String(row[field] ?? "").trim());
}

function buildParsedRowsFromGrid(gridRows: BulkInputGridRow[]): Record<string, unknown>[] {
  return gridRows.filter((row) => !isGridRowBlank(row)).map((row) => {
    const parsed: Record<string, unknown> = {};
    INPUT_GRID_FIELDS.forEach((field) => {
      parsed[field] = row[field] ?? "";
    });
    return parsed;
  });
}

function buildIdentityFieldMapping(fields: readonly string[]): Record<string, string> {
  const mapping: Record<string, string> = {};
  fields.forEach((field) => {
    mapping[field] = field;
  });
  return mapping;
}

/** Shared validation for file, paste, and grid sources. */
function computeImportValidation(
  data: Record<string, unknown>[],
  mapping: Record<string, string>,
  rowNumberForDataIndex: (dataIndex: number) => number
): { mappingError: string | null; results: { row: number; errors: string[] }[] } {
  const requiredFields = ["name"];
  const missingRequiredMappings = requiredFields.filter((field) => !mapping[field]);
  if (missingRequiredMappings.length > 0) {
    return {
      mappingError: `Missing required field mappings: ${missingRequiredMappings.join(", ")}. Please map these fields.`,
      results: [],
    };
  }

  const results: { row: number; errors: string[] }[] = [];
  data.forEach((row, index) => {
    const errors: string[] = [];

    if (mapping.name && (!row[mapping.name] || String(row[mapping.name]).trim() === "")) {
      errors.push("Missing 'name'");
    }

    if (mapping.quantity) {
      const quantityValue = row[mapping.quantity];
      if (quantityValue !== undefined && quantityValue !== null && String(quantityValue).trim() !== "") {
        if (isNaN(Number(quantityValue)) || Number(quantityValue) < 0) {
          errors.push("Invalid 'quantity' (must be a non-negative number)");
        }
      }
    }

    if (mapping.costPerUnit) {
      const costValue = row[mapping.costPerUnit];
      if (
        costValue !== undefined &&
        costValue !== null &&
        String(costValue).trim() !== "" &&
        (isNaN(Number(costValue)) || Number(costValue) < 0)
      ) {
        errors.push("Invalid 'costPerUnit'");
      }
    }

    if (mapping.reorderLevel) {
      const reorderValue = row[mapping.reorderLevel];
      if (
        reorderValue !== undefined &&
        reorderValue !== null &&
        String(reorderValue).trim() !== "" &&
        (isNaN(Number(reorderValue)) || Number(reorderValue) < 0)
      ) {
        errors.push("Invalid 'reorderLevel'");
      }
    }

    if (mapping.deliveryPercentage) {
      const percentValue = row[mapping.deliveryPercentage];
      if (
        percentValue !== undefined &&
        percentValue !== null &&
        String(percentValue).trim() !== "" &&
        (isNaN(Number(percentValue)) || Number(percentValue) < 0 || Number(percentValue) > 100)
      ) {
        errors.push("Invalid 'deliveryPercentage' (0-100)");
      }
    }

    if (mapping.expectedDeliveryDate) {
      const dateValue = row[mapping.expectedDeliveryDate];
      if (dateValue && !(dateValue instanceof Date)) {
        if (isNaN(Date.parse(String(dateValue)))) {
          errors.push("Invalid 'expectedDeliveryDate' format");
        }
      }
    }

    if (errors.length > 0) {
      results.push({ row: rowNumberForDataIndex(index), errors });
    }
  });

  return { mappingError: null, results };
}

function mapParsedRowsToPartialItems(
  data: Record<string, unknown>[],
  mapping: Record<string, string>
): Partial<InventoryItem>[] {
  return data.map((row) => {
    const item: Partial<InventoryItem> = {};

    Object.entries(mapping).forEach(([expectedField, fileHeader]) => {
      if (fileHeader) {
        let value = row[fileHeader];

        if (value !== undefined && value !== null && String(value).trim() !== "") {
          if (["quantity", "costPerUnit", "reorderLevel", "deliveryPercentage"].includes(expectedField)) {
            value = Number(value);
          } else if (expectedField === "expectedDeliveryDate") {
            value = value instanceof Date ? value : new Date(String(value));
          } else {
            value = String(value).trim();
          }
          (item as Record<string, unknown>)[expectedField] = value;
        }
      }
    });

    if (item.quantity === undefined || item.quantity === null || Number.isNaN(Number(item.quantity))) {
      item.quantity = 1;
    }

    const unitTrimmed =
      item.unit !== undefined && item.unit !== null ? String(item.unit).trim() : "";
    if (!unitTrimmed) {
      item.unit = DEFAULT_BULK_IMPORT_UNIT;
    }

    return item;
  });
}

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i];
    if (c === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (!inQuotes && c === ",") {
      cells.push(current.trim().replace(/^"|"$/g, ""));
      current = "";
      continue;
    }
    current += c;
  }
  cells.push(current.trim().replace(/^"|"$/g, ""));
  return cells;
}

function uniquifyHeaders(raw: string[]): string[] {
  const seen = new Map<string, number>();
  return raw.map((h, i) => {
    const base = (h && String(h).trim()) || `Column_${i + 1}`;
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    return count === 1 ? base : `${base}_${count}`;
  });
}

/** Parse pasted spreadsheet block (tab-separated from Excel/Sheets, or comma-separated). */
export function parseDelimitedPaste(
  raw: string,
  firstRowIsHeader: boolean
): { headers: string[]; rows: Record<string, unknown>[] } {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.replace(/\r$/, ""))
    .filter((l) => l.trim().length > 0);
  if (lines.length === 0) {
    return { headers: [], rows: [] };
  }
  const useTab = lines.some((l) => l.includes("\t"));
  const splitLine = (line: string) => (useTab ? line.split("\t") : splitCsvLine(line));
  const matrix = lines.map((line) => splitLine(line));
  const width = Math.max(...matrix.map((r) => r.length), 1);
  const pad = (cells: string[]) => {
    const next = [...cells];
    while (next.length < width) next.push("");
    return next;
  };
  let headerCells: string[];
  let dataMatrix: string[][];
  if (firstRowIsHeader) {
    headerCells = pad(matrix[0]);
    dataMatrix = matrix.slice(1).map(pad);
  } else {
    headerCells = Array.from({ length: width }, (_, i) => `Column_${i + 1}`);
    dataMatrix = matrix.map(pad);
  }
  const headers = uniquifyHeaders(headerCells.map((h) => String(h).trim()));
  const rows = dataMatrix.map((cells) => {
    const row: Record<string, unknown> = {};
    headers.forEach((h, i) => {
      row[h] = cells[i] ?? "";
    });
    return row;
  });
  return { headers, rows };
}

export function ImportDialog({ isOpen, onClose, onImport, onComplete, gridFieldSuggestions, userKey }: ImportDialogProps) {
  // Initial prefs are computed lazily so localStorage is only touched once per mount.
  const initialPrefsRef = useRef<ImportDialogPrefs>(loadImportDialogPrefs(userKey));

  const [_uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<any[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationResults, setValidationResults] = useState<{ row: number; errors: string[] }[]>([]);
  const [activeTab, setActiveTab] = useState<string>("preview");
  const [fieldMapping, setFieldMapping] = useState<Record<string, string>>({});
  const [sourceMode, setSourceMode] = useState<ImportSourceMode>(initialPrefsRef.current.defaultTab);
  const [pasteText, setPasteText] = useState("");
  const [pasteFirstRowIsHeader, setPasteFirstRowIsHeader] = useState(true);
  const [gridRows, setGridRows] = useState<BulkInputGridRow[]>(createInitialGridRows);
  const gridNonEmptyCount = useMemo(() => buildParsedRowsFromGrid(gridRows).length, [gridRows]);

  // Cell focus management for the in-app grid
  const gridInputRefs = useRef<Map<string, HTMLInputElement | null>>(new Map());
  const lastFocusedCellRef = useRef<{ rowIndex: number; field: GridFieldKey } | null>(null);
  const [activeGridColumns, setActiveGridColumns] = useState<Set<GridFieldKey>>(() => {
    // Hidden-column prefs are validated against the current field list so a stale persisted
    // entry (renamed/dropped column) cannot accidentally hide a still-supported field.
    const hidden = new Set<string>(initialPrefsRef.current.hiddenColumns);
    const next = new Set<GridFieldKey>();
    INPUT_GRID_FIELDS.forEach((field) => {
      if (REQUIRED_GRID_FIELDS.has(field) || !hidden.has(field)) next.add(field);
    });
    return next;
  });
  const activeGridColumnList = useMemo<GridFieldKey[]>(
    () => INPUT_GRID_FIELDS.filter((field) => activeGridColumns.has(field)),
    [activeGridColumns]
  );

  /**
   * Stable, case-insensitive deduped suggestion lists per column, capped to keep the
   * datalist DOM lean. Empty arrays are dropped so we can use presence as the toggle
   * for binding `list=` on the cell input.
   */
  const gridSuggestionMap = useMemo<Partial<Record<GridFieldKey, string[]>>>(() => {
    const incoming = gridFieldSuggestions ?? {};
    const result: Partial<Record<GridFieldKey, string[]>> = {};
    const SUGGESTION_LIMIT = 500;
    INPUT_GRID_FIELDS.forEach((field) => {
      const values = incoming[field];
      if (!values || values.length === 0) return;
      const seen = new Set<string>();
      const deduped: string[] = [];
      for (const raw of values) {
        const trimmed = String(raw ?? "").trim();
        if (!trimmed) continue;
        const key = trimmed.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        deduped.push(trimmed);
        if (deduped.length >= SUGGESTION_LIMIT) break;
      }
      if (deduped.length > 0) result[field] = deduped;
    });
    return result;
  }, [gridFieldSuggestions]);

  const getDatalistId = (field: GridFieldKey): string => `import-grid-suggest-${field}`;

  // Fill-series controls
  const [fillPopoverOpen, setFillPopoverOpen] = useState(false);
  const [fillColumn, setFillColumn] = useState<GridFieldKey>("name");
  const [fillStartRow, setFillStartRow] = useState<number>(1);
  const [fillCount, setFillCount] = useState<number>(10);
  const [fillMode, setFillMode] = useState<GridFillMode>("increment");
  const [fillValue, setFillValue] = useState<string>("");
  const [fillSkipNonEmpty, setFillSkipNonEmpty] = useState<boolean>(false);

  // Camera barcode scanning
  const [scannerOpen, setScannerOpen] = useState(false);

  /**
   * `prefsReadyRef` gates the save effect so we never overwrite a different user's prefs
   * with stale state. It only flips to `true` after a successful load on a real open;
   * any subsequent close (or `userKey` change while closed) flips it back to `false`.
   */
  const prefsReadyRef = useRef<boolean>(false);
  useEffect(() => {
    if (!isOpen) {
      prefsReadyRef.current = false;
      return;
    }
    const prefs = loadImportDialogPrefs(userKey);
    setSourceMode(prefs.defaultTab);
    const hidden = new Set<string>(prefs.hiddenColumns);
    setActiveGridColumns(() => {
      const next = new Set<GridFieldKey>();
      INPUT_GRID_FIELDS.forEach((field) => {
        if (REQUIRED_GRID_FIELDS.has(field) || !hidden.has(field)) next.add(field);
      });
      return next;
    });
    prefsReadyRef.current = true;
  }, [isOpen, userKey]);

  // Persist prefs whenever the user changes the active tab or column visibility.
  useEffect(() => {
    if (!prefsReadyRef.current) return;
    const hiddenColumns: string[] = INPUT_GRID_FIELDS.filter(
      (field) => !activeGridColumns.has(field)
    );
    saveImportDialogPrefs(userKey, { defaultTab: sourceMode, hiddenColumns });
  }, [sourceMode, activeGridColumns, userKey]);

  const resetState = () => {
    setUploadedFile(null);
    setParsedData([]);
    setHeaders([]);
    setIsLoading(false);
    setError(null);
    setValidationResults([]);
    setFieldMapping({});
    setActiveTab("preview");
    setPasteText("");
    setPasteFirstRowIsHeader(true);
    setGridRows(createInitialGridRows());
    gridInputRefs.current.clear();
    lastFocusedCellRef.current = null;
    // Note: sourceMode + activeGridColumns are intentionally preserved here so the user's
    // persisted tab + visible-columns prefs survive a successful import / cancel.
    setFillPopoverOpen(false);
    setFillColumn("name");
    setFillStartRow(1);
    setFillCount(10);
    setFillMode("increment");
    setFillValue("");
    setFillSkipNonEmpty(false);
    setScannerOpen(false);
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    resetState(); // Reset on new file selection
    const selectedFile = event.target.files?.[0];
    if (selectedFile) {
      if (selectedFile.type === 'text/csv' || selectedFile.name.endsWith('.csv') ||
          selectedFile.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || selectedFile.name.endsWith('.xlsx') ||
          selectedFile.type === 'application/vnd.ms-excel' || selectedFile.name.endsWith('.xls')) 
      {
        setUploadedFile(selectedFile);
        parseFile(selectedFile);
      } else {
        setError("Invalid file type. Please upload a CSV or Excel file (.csv, .xlsx, .xls).");
        toast.error("Invalid file type.");
      }
    }
  };

  const parseFile = (fileToParse: File) => {
    setIsLoading(true);
    setError(null);
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'binary', cellDates: true }); // Read dates as Date objects
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }); // Get header row as well

        if (jsonData.length < 2) { // Need header + at least one data row
          throw new Error("File is empty or contains only headers.");
        }

        const fileHeaders = (jsonData[0] as string[]).map(h => String(h).trim()); // Trim headers
        const fileData = jsonData.slice(1).map((row: any) => {
           const rowData: Record<string, any> = {};
           fileHeaders.forEach((header, index) => {
              rowData[header] = row[index];
           });
           return rowData;
        });

        setSourceMode("file");
        setPasteText("");
        applyHeadersAndRows(fileHeaders, fileData);

      } catch (err: any) {
        console.error("Error parsing file:", err);
        setError(`Error parsing file: ${err.message}`);
        toast.error("Failed to parse file.");
        resetState(); // Clear state on error
      } finally {
        setIsLoading(false);
      }
    };

    reader.onerror = (err) => {
       console.error("File reading error:", err);
       setError("Error reading file.");
       toast.error("Failed to read file.");
       setIsLoading(false);
    };

    reader.readAsBinaryString(fileToParse);
  };

  const applyHeadersAndRows = (fileHeaders: string[], fileData: Record<string, unknown>[]) => {
    setHeaders(fileHeaders);
    setParsedData(fileData);
    const initialMapping: Record<string, string> = {};
    EXPECTED_HEADERS.forEach((expectedHeader) => {
      let match = fileHeaders.find((h) => h.toLowerCase() === expectedHeader.toLowerCase());
      if (!match) {
        match = fileHeaders.find((h) => h.toLowerCase().includes(expectedHeader.toLowerCase()));
      }
      if (match) {
        initialMapping[expectedHeader] = match;
      }
    });
    setFieldMapping(initialMapping);
    validateData(fileHeaders, fileData, initialMapping);
  };

  const handleParsePaste = () => {
    setError(null);
    setIsLoading(true);
    try {
      const { headers: fileHeaders, rows } = parseDelimitedPaste(pasteText, pasteFirstRowIsHeader);
      if (fileHeaders.length === 0 || rows.length === 0) {
        throw new Error("Paste is empty or has no data rows after the header.");
      }
      setUploadedFile(null);
      setSourceMode("paste");
      applyHeadersAndRows(fileHeaders, rows);
      toast.success(`Parsed ${rows.length} row${rows.length === 1 ? "" : "s"}.`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Could not parse pasted data.";
      setError(message);
      toast.error(message);
      setParsedData([]);
      setHeaders([]);
      setFieldMapping({});
    } finally {
      setIsLoading(false);
    }
  };

  const validateData = (_fileHeaders: string[], data: any[], mapping: Record<string, string>) => {
    const { mappingError, results } = computeImportValidation(data, mapping, (i) => i + 2);
    if (mappingError) {
      setError(mappingError);
    } else {
      setError(null);
    }
    setValidationResults(results);
  };

  const handleFieldMappingChange = (expectedField: string, fileHeader: string) => {
    const normalizedFileHeader = fileHeader === UNMAPPED_HEADER_VALUE ? "" : fileHeader;
    const newMapping = { ...fieldMapping, [expectedField]: normalizedFileHeader };
    setFieldMapping(newMapping);
    validateData(headers, parsedData, newMapping);
  };

  const handleGridCellChange = (rowIndex: number, field: keyof BulkInputGridRow, value: string) => {
    setGridRows((prev) => {
      const next = [...prev];
      const row = { ...next[rowIndex], [field]: value };
      next[rowIndex] = row;
      return next;
    });
    if (sourceMode === "grid" && validationResults.length > 0) {
      setValidationResults([]);
    }
  };

  const handleAddGridRows = () => {
    setGridRows((prev) => {
      if (prev.length >= MAX_GRID_ROWS) return prev;
      const add = Math.min(GRID_ROWS_ADD_CHUNK, MAX_GRID_ROWS - prev.length);
      return [...prev, ...Array.from({ length: add }, () => createEmptyGridRow())];
    });
  };

  const getGridCellKey = (rowIndex: number, field: GridFieldKey): string => `${rowIndex}:${field}`;

  const setGridInputRef =
    (rowIndex: number, field: GridFieldKey) => (el: HTMLInputElement | null) => {
      const key = getGridCellKey(rowIndex, field);
      if (el) gridInputRefs.current.set(key, el);
      else gridInputRefs.current.delete(key);
    };

  const focusGridCell = (rowIndex: number, field: GridFieldKey) => {
    const el = gridInputRefs.current.get(getGridCellKey(rowIndex, field));
    if (!el) return;
    el.focus();
    // Place caret at end so subsequent typing appends rather than overwriting selection
    try {
      const len = el.value.length;
      el.setSelectionRange(len, len);
    } catch {
      // Some input subtypes (e.g. number) do not support setSelectionRange — safe to ignore
    }
  };

  const handleGridCellKeyDown = (
    e: KeyboardEvent<HTMLInputElement>,
    rowIndex: number,
    field: GridFieldKey
  ) => {
    if (e.key === "ArrowDown" || e.key === "Enter") {
      if (rowIndex + 1 < gridRows.length) {
        e.preventDefault();
        focusGridCell(rowIndex + 1, field);
      } else if (e.key === "Enter") {
        // Suppress accidental form submission at the last row
        e.preventDefault();
      }
      return;
    }
    if (e.key === "ArrowUp") {
      if (rowIndex > 0) {
        e.preventDefault();
        focusGridCell(rowIndex - 1, field);
      }
    }
  };

  const handleGridCellFocus = (rowIndex: number, field: GridFieldKey) => {
    lastFocusedCellRef.current = { rowIndex, field };
  };

  const toggleGridColumnActive = (field: GridFieldKey, active: boolean) => {
    if (REQUIRED_GRID_FIELDS.has(field) && !active) return;
    setActiveGridColumns((prev) => {
      const next = new Set(prev);
      if (active) next.add(field);
      else next.delete(field);
      return next;
    });
  };

  const openFillPopover = () => {
    const focused = lastFocusedCellRef.current;
    if (focused) {
      setFillColumn(focused.field);
      setFillStartRow(focused.rowIndex + 1);
      const currentValue = gridRows[focused.rowIndex]?.[focused.field] ?? "";
      if (currentValue) setFillValue(currentValue);
    }
    setFillPopoverOpen(true);
  };

  const openBarcodeScanner = () => {
    setScannerOpen(true);
  };

  /**
   * Routes a scanned barcode into the grid. Targets the row of the last-focused cell
   * when the focused column is `barcode`, otherwise picks the first row that already
   * has a name/unit but no barcode (so users can pre-fill rows then sweep barcodes
   * in order). Falls back to the first blank row if there is no clear target. After
   * writing, focus advances to the next row's barcode cell so a subsequent scan
   * (re-opening the scanner) lands somewhere sensible.
   */
  const handleBarcodeScanned = (rawValue: string) => {
    const trimmed = rawValue.trim();
    if (!trimmed) return;

    setGridRows((prev) => {
      const next = [...prev];
      const focused = lastFocusedCellRef.current;
      let targetIdx: number | null =
        focused && focused.field === "barcode" ? focused.rowIndex : null;

      if (targetIdx === null) {
        // Prefer rows that already have content but no barcode yet
        targetIdx = next.findIndex((row) => {
          const hasContent =
            row.name.trim() !== "" || row.unit.trim() !== "" || row.quantity.trim() !== "";
          return hasContent && row.barcode.trim() === "";
        });
      }
      if (targetIdx === null || targetIdx === -1) {
        targetIdx = next.findIndex((row) => isGridRowBlank(row));
      }
      if (targetIdx === -1 || targetIdx === null) {
        // Auto-grow when every visible row is full
        if (next.length < MAX_GRID_ROWS) {
          next.push(createEmptyGridRow());
          targetIdx = next.length - 1;
        } else {
          targetIdx = next.length - 1;
        }
      }

      next[targetIdx] = { ...next[targetIdx], barcode: trimmed };

      // Schedule focus to move to the next barcode cell after React commits
      const nextFocusIdx = targetIdx + 1;
      window.setTimeout(() => {
        if (nextFocusIdx < next.length) {
          focusGridCell(nextFocusIdx, "barcode");
        }
      }, 0);

      return next;
    });

    if (sourceMode === "grid" && validationResults.length > 0) {
      setValidationResults([]);
    }
    toast.success(`Scanned barcode: ${trimmed}`);
  };

  const fillPreviewSamples = useMemo<string[]>(() => {
    if (fillCount <= 0 || !fillValue) return [];
    if (fillMode === "copy") {
      return [fillValue];
    }
    const { prefix, start, pad } = deriveIncrementParts(fillValue);
    const lastIdx = Math.min(fillCount - 1, 2);
    const indices = lastIdx === 0 ? [0] : lastIdx === 1 ? [0, 1] : [0, 1, lastIdx];
    return indices.map((i) => buildIncrementValue(prefix, start + i, pad));
  }, [fillCount, fillMode, fillValue]);

  /**
   * Validates the Fill series controls before they hit the grid. Numeric columns
   * (quantity/costPerUnit/reorderLevel) reject any text — the produced values would
   * otherwise fail the import validator with a confusing per-row error.
   *
   * Returns `null` when valid, or a human-readable string describing the issue.
   */
  const fillValidationError = useMemo<string | null>(() => {
    if (!fillValue.trim() && fillMode === "copy") {
      return null; // Copying an empty value is allowed (clears the column).
    }
    if (NUMERIC_GRID_FIELDS.has(fillColumn)) {
      if (fillMode === "copy") {
        if (!isValidNumericString(fillValue)) {
          return `${humanizeFieldLabel(fillColumn)} must be a non-negative number — text values are not allowed in this column.`;
        }
        return null;
      }
      // Increment mode: every produced value must parse as a number, which only happens
      // when the base value is purely numeric (no prefix). deriveIncrementParts splits
      // any trailing digits off; if a non-empty prefix remains, the series is invalid.
      const { prefix } = deriveIncrementParts(fillValue);
      if (prefix.trim() !== "") {
        return `${humanizeFieldLabel(fillColumn)} only accepts numbers — auto-increment needs a numeric base (e.g. 1).`;
      }
      const numericStart = Number(fillValue.trim());
      if (!Number.isFinite(numericStart) || numericStart < 0) {
        return `${humanizeFieldLabel(fillColumn)} must start from a non-negative number.`;
      }
    }
    return null;
  }, [fillColumn, fillMode, fillValue]);

  const applyFillSeries = () => {
    if (fillValidationError) {
      toast.error(fillValidationError);
      return;
    }
    if (!fillValue && fillMode === "copy") {
      toast.error("Enter a value to copy.");
      return;
    }
    const requestedCount = Math.max(1, Math.floor(fillCount));
    const startIdx = Math.max(0, Math.floor(fillStartRow) - 1);
    if (startIdx >= MAX_GRID_ROWS) {
      toast.error(`Start row exceeds the maximum (${MAX_GRID_ROWS}).`);
      return;
    }
    const targetCount = Math.min(requestedCount, MAX_GRID_ROWS - startIdx);

    setGridRows((prev) => {
      const next = [...prev];
      // Auto-grow rows up to MAX so the user does not need to click "Add rows" first
      const requiredLen = Math.min(MAX_GRID_ROWS, startIdx + targetCount);
      while (next.length < requiredLen) {
        next.push(createEmptyGridRow());
      }
      let prefix = fillValue;
      let startNum = 1;
      let pad = 0;
      if (fillMode === "increment") {
        const parts = deriveIncrementParts(fillValue);
        prefix = parts.prefix;
        startNum = parts.start;
        pad = parts.pad;
      }
      for (let i = 0; i < targetCount; i++) {
        const idx = startIdx + i;
        if (idx >= next.length) break;
        const existing = String(next[idx][fillColumn] ?? "").trim();
        if (fillSkipNonEmpty && existing) continue;
        const value =
          fillMode === "increment"
            ? buildIncrementValue(prefix, startNum + i, pad)
            : fillValue;
        next[idx] = { ...next[idx], [fillColumn]: value };
      }
      return next;
    });

    // Surface validation problems on the next render rather than holding stale errors
    if (sourceMode === "grid" && validationResults.length > 0) {
      setValidationResults([]);
    }
    setFillPopoverOpen(false);
    toast.success(
      `Filled ${humanizeFieldLabel(fillColumn)} for ${targetCount} row${targetCount === 1 ? "" : "s"}.`
    );
  };

  const handleImportClick = async () => {
    const dataToImport =
      sourceMode === "grid" ? buildParsedRowsFromGrid(gridRows) : parsedData;
    const mappingToUse =
      sourceMode === "grid"
        ? buildIdentityFieldMapping([...INPUT_GRID_FIELDS])
        : fieldMapping;

    if (sourceMode === "grid") {
      if (dataToImport.length === 0) {
        toast.error("Enter at least one row with a name (blank rows are skipped; unit defaults to each).");
        return;
      }
      const { mappingError, results } = computeImportValidation(dataToImport, mappingToUse, (i) => i + 1);
      if (mappingError) {
        setError(mappingError);
        toast.error(mappingError);
        return;
      }
      setError(null);
      setValidationResults(results);
      if (results.length > 0) {
        toast.error("Fix the highlighted issues in the grid.");
        return;
      }
    } else {
      if (!dataToImport.length || validationResults.length > 0) {
        toast.error("Please fix validation errors before importing.");
        return;
      }
    }

    setIsLoading(true);
    if (sourceMode !== "grid") {
      setError(null);
    }

    try {
      const itemsToImport = mapParsedRowsToPartialItems(dataToImport, mappingToUse);

      const { importedCount, skippedCount } = await onImport(itemsToImport);
      onComplete(importedCount, skippedCount);
      resetState(); // Reset after successful import

    } catch (err: any) {
      console.error("Import failed:", err);
      setError(`Import failed: ${err.message}`);
      toast.error("Import failed.");
    } finally {
      setIsLoading(false);
    }
  };

  const previewData = parsedData.slice(0, 5); // Show first 5 rows for preview

  return (
    <>
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) { resetState(); onClose(); } }}>
      <DraggableDialogContent className="w-[min(calc(100vw-1rem),960px)]" minWidth={400}>
        <DialogHeader>
          <DialogTitle>Bulk add from spreadsheet</DialogTitle>
          <DialogDescription>
            {`Type into the in-app grid (default), upload a file, or paste from a spreadsheet. Each row needs a name; quantity defaults to 1 and unit defaults to "${DEFAULT_BULK_IMPORT_UNIT}" when left blank.`}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4">
          <Tabs
            value={sourceMode}
            onValueChange={(value) => {
              const next = value as ImportSourceMode;
              setSourceMode(next);
              setError(null);
              if (next !== "grid") {
                setParsedData([]);
                setHeaders([]);
                setFieldMapping({});
                setValidationResults([]);
                setActiveTab("preview");
              }
              if (next === "file") {
                setPasteText("");
              } else if (next === "paste") {
                setUploadedFile(null);
              } else {
                setUploadedFile(null);
                setPasteText("");
              }
            }}
          >
            <TabsList className="grid w-full max-w-2xl grid-cols-3">
              <TabsTrigger value="grid" className="inline-flex items-center justify-center gap-1.5">
                <Grid3x3 className="h-3.5 w-3.5 shrink-0" />
                Input grid
              </TabsTrigger>
              <TabsTrigger value="file">Upload file</TabsTrigger>
              <TabsTrigger value="paste">Paste</TabsTrigger>
            </TabsList>
            <TabsContent value="file" className="mt-4 space-y-2">
              <div className="grid w-full max-w-sm items-center gap-1.5">
                <Label htmlFor="inventory-file">CSV or Excel</Label>
                <Input
                  id="inventory-file"
                  type="file"
                  accept=".csv, .xlsx, .xls, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
                  onChange={handleFileChange}
                  disabled={isLoading}
                />
              </div>
            </TabsContent>
            <TabsContent value="paste" className="mt-4 space-y-3">
              <p className="text-sm text-muted-foreground">
                Copy rows from Excel or Google Sheets (tabs between columns). Use the first row as headers that match your columns, or turn off &quot;First row is headers&quot; for fixed column order.
              </p>
              <Textarea
                className="min-h-[200px] font-mono text-xs"
                placeholder={"name\tunit\tquantity\tlocation\nWidget A\tpcs\t10\tWarehouse"}
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                disabled={isLoading}
                spellCheck={false}
              />
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="paste-first-header"
                    checked={pasteFirstRowIsHeader}
                    onCheckedChange={(v) => setPasteFirstRowIsHeader(v === true)}
                  />
                  <Label htmlFor="paste-first-header" className="text-sm font-normal cursor-pointer">
                    First row is column headers
                  </Label>
                </div>
                <Button type="button" variant="secondary" onClick={handleParsePaste} disabled={isLoading || !pasteText.trim()}>
                  <ClipboardPaste className="mr-2 h-4 w-4" />
                  Parse pasted data
                </Button>
              </div>
            </TabsContent>
            <TabsContent value="grid" className="mt-4 space-y-3">
              <p className="text-sm text-muted-foreground">
                Blank rows are ignored. Quantity defaults to 1 when left empty. Use Tab or arrow keys to move between cells. Up to {MAX_GRID_ROWS} rows.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5">
                      <SlidersHorizontal className="h-3.5 w-3.5" />
                      Columns ({activeGridColumnList.length}/{INPUT_GRID_FIELDS.length})
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-72 space-y-2">
                    <div>
                      <p className="text-sm font-medium">Visible columns</p>
                      <p className="text-xs text-muted-foreground">
                        Hidden columns are removed from the grid and skipped by Tab and arrow keys. Required fields stay on.
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      {INPUT_GRID_FIELDS.map((field) => {
                        const required = REQUIRED_GRID_FIELDS.has(field);
                        const checked = activeGridColumns.has(field);
                        return (
                          <Label
                            key={field}
                            className={cn(
                              "flex items-center gap-2 text-xs font-normal",
                              required ? "cursor-default" : "cursor-pointer"
                            )}
                          >
                            <Checkbox
                              checked={checked}
                              disabled={required}
                              onCheckedChange={(v) => toggleGridColumnActive(field, v === true)}
                            />
                            <span className={required ? "text-destructive" : ""}>
                              {humanizeFieldLabel(field)}
                              {required ? " *" : ""}
                            </span>
                          </Label>
                        );
                      })}
                    </div>
                  </PopoverContent>
                </Popover>

                <Popover open={fillPopoverOpen} onOpenChange={setFillPopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1.5"
                      onClick={openFillPopover}
                    >
                      <Wand2 className="h-3.5 w-3.5" />
                      Fill series
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-80 space-y-3">
                    <div>
                      <p className="text-sm font-medium">Fill column with a series</p>
                      <p className="text-xs text-muted-foreground">
                        Defaults pull from the cell you last focused.
                      </p>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Column</Label>
                      <Select
                        value={fillColumn}
                        onValueChange={(v) => setFillColumn(v as GridFieldKey)}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {INPUT_GRID_FIELDS.map((field) => (
                            <SelectItem key={field} value={field}>
                              {humanizeFieldLabel(field)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs">Start row</Label>
                        <Input
                          type="number"
                          min={1}
                          max={MAX_GRID_ROWS}
                          value={fillStartRow}
                          onChange={(e) =>
                            setFillStartRow(
                              Math.max(
                                1,
                                Math.min(MAX_GRID_ROWS, Number(e.target.value) || 1)
                              )
                            )
                          }
                          className="h-8 text-xs"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Count</Label>
                        <Input
                          type="number"
                          min={1}
                          max={MAX_GRID_ROWS}
                          value={fillCount}
                          onChange={(e) =>
                            setFillCount(
                              Math.max(
                                1,
                                Math.min(MAX_GRID_ROWS, Number(e.target.value) || 1)
                              )
                            )
                          }
                          className="h-8 text-xs"
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Mode</Label>
                      <Select
                        value={fillMode}
                        onValueChange={(v) => setFillMode(v as GridFillMode)}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="increment">
                            Auto-increment (lights 1, lights 2…)
                          </SelectItem>
                          <SelectItem value="copy">Copy (same value in every row)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">
                        {fillMode === "increment" ? "Base value" : "Value"}
                        {NUMERIC_GRID_FIELDS.has(fillColumn) ? (
                          <span className="ml-1 text-[10px] font-normal text-muted-foreground">
                            (numbers only)
                          </span>
                        ) : null}
                      </Label>
                      <Input
                        value={fillValue}
                        onChange={(e) => setFillValue(e.target.value)}
                        placeholder={
                          NUMERIC_GRID_FIELDS.has(fillColumn)
                            ? fillMode === "increment"
                              ? "e.g. 1"
                              : "e.g. 0"
                            : fillMode === "increment"
                              ? "e.g. lights"
                              : "e.g. Studio A"
                        }
                        inputMode={NUMERIC_GRID_FIELDS.has(fillColumn) ? "decimal" : "text"}
                        className={cn(
                          "h-8 text-xs",
                          fillValidationError && "border-destructive focus-visible:ring-destructive"
                        )}
                      />
                      {fillValidationError ? (
                        <p className="flex items-center gap-1 text-[11px] text-destructive">
                          <AlertTriangle className="h-3 w-3" />
                          {fillValidationError}
                        </p>
                      ) : fillMode === "increment" && fillPreviewSamples.length > 0 ? (
                        <p className="text-[11px] text-muted-foreground">
                          Preview: {fillPreviewSamples.join(", ")}
                          {fillCount > fillPreviewSamples.length ? ", …" : ""}
                        </p>
                      ) : null}
                    </div>
                    <Label className="flex items-center gap-2 text-xs font-normal cursor-pointer">
                      <Checkbox
                        checked={fillSkipNonEmpty}
                        onCheckedChange={(v) => setFillSkipNonEmpty(v === true)}
                      />
                      Skip rows that already have a value
                    </Label>
                    <div className="flex justify-end gap-2 pt-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setFillPopoverOpen(false)}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        onClick={applyFillSeries}
                        disabled={fillValidationError !== null}
                      >
                        Fill {fillCount} row{fillCount === 1 ? "" : "s"}
                      </Button>
                    </div>
                  </PopoverContent>
                </Popover>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5"
                  onClick={openBarcodeScanner}
                  disabled={isLoading}
                  title="Scan a barcode with the device camera and write it into the next row's barcode cell"
                >
                  <ScanLine className="h-3.5 w-3.5" />
                  Scan barcode
                </Button>

                <p className="ml-auto hidden text-xs text-muted-foreground sm:block">
                  Tab / Shift+Tab and ↑ ↓ Enter move between cells
                </p>
              </div>
              {/* Native datalists provide library autocomplete on cells whose field has suggestions. */}
              {(Object.keys(gridSuggestionMap) as GridFieldKey[]).map((field) => {
                const values = gridSuggestionMap[field];
                if (!values || values.length === 0) return null;
                return (
                  <datalist key={field} id={getDatalistId(field)}>
                    {values.map((value) => (
                      <option key={value} value={value} />
                    ))}
                  </datalist>
                );
              })}
              <ScrollArea className="h-[min(55vh,440px)] w-full rounded-md border">
                <Table className="relative min-w-[480px] text-xs">
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="sticky top-0 z-[1] w-10 bg-background text-center text-muted-foreground">
                        #
                      </TableHead>
                      {activeGridColumnList.map((field) => {
                        const isRequired = REQUIRED_GRID_FIELDS.has(field);
                        const hasLibrary = !!gridSuggestionMap[field];
                        return (
                          <TableHead
                            key={field}
                            className="sticky top-0 z-[1] min-w-[6.5rem] whitespace-nowrap bg-background px-1 py-2"
                          >
                            <span className={isRequired ? "text-destructive" : ""}>
                              {humanizeFieldLabel(field)}
                              {isRequired ? " *" : ""}
                              {hasLibrary ? (
                                <span
                                  className="ml-1 text-[10px] font-normal text-muted-foreground"
                                  title="Autocomplete from your workspace library"
                                >
                                  ▾
                                </span>
                              ) : null}
                            </span>
                          </TableHead>
                        );
                      })}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {gridRows.map((row, rowIndex) => (
                      <TableRow key={rowIndex} className="hover:bg-muted/40">
                        <TableCell className="bg-muted/30 py-1 text-center text-muted-foreground">{rowIndex + 1}</TableCell>
                        {activeGridColumnList.map((field) => {
                          const datalistId = gridSuggestionMap[field] ? getDatalistId(field) : undefined;
                          const placeholder =
                            field === "quantity"
                              ? "1"
                              : field === "unit"
                                ? DEFAULT_BULK_IMPORT_UNIT
                                : undefined;
                          const inputMode = NUMERIC_GRID_FIELDS.has(field) ? "decimal" : undefined;
                          return (
                            <TableCell key={field} className="p-1">
                              <Input
                                ref={setGridInputRef(rowIndex, field)}
                                className="h-8 min-w-[5.5rem] text-xs"
                                value={row[field]}
                                onChange={(e) => handleGridCellChange(rowIndex, field, e.target.value)}
                                onKeyDown={(e) => handleGridCellKeyDown(e, rowIndex, field)}
                                onFocus={() => handleGridCellFocus(rowIndex, field)}
                                disabled={isLoading}
                                list={datalistId}
                                placeholder={placeholder}
                                inputMode={inputMode}
                                autoComplete="off"
                                aria-label={`${humanizeFieldLabel(field)} row ${rowIndex + 1}`}
                              />
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  {gridRows.length} row slots · {gridNonEmptyCount} non-empty
                </p>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={handleAddGridRows}
                  disabled={isLoading || gridRows.length >= MAX_GRID_ROWS}
                >
                  Add {GRID_ROWS_ADD_CHUNK} rows
                </Button>
              </div>
              {sourceMode === "grid" && validationResults.length > 0 && (
                <div className="space-y-2 rounded-md border border-destructive bg-destructive/5 p-3">
                  <h4 className="flex items-center gap-1 text-sm font-semibold text-destructive">
                    <AlertTriangle className="h-4 w-4" />
                    Validation ({validationResults.length})
                  </h4>
                  <ul className="max-h-32 list-inside list-disc overflow-auto text-xs">
                    {validationResults.slice(0, 12).map((res) => (
                      <li key={res.row}>
                        Row {res.row}: {res.errors.join(", ")}
                      </li>
                    ))}
                    {validationResults.length > 12 && (
                      <li className="list-none text-muted-foreground">…and {validationResults.length - 12} more</li>
                    )}
                  </ul>
                </div>
              )}
            </TabsContent>
          </Tabs>

          {isLoading && (
            <div className="flex items-center justify-center p-4">
              <Loader2 className="h-6 w-6 animate-spin mr-2" /> Working…
            </div>
          )}

          {error && (
            <div className="p-3 bg-destructive/10 text-destructive rounded-md text-sm">
              {error}
            </div>
          )}

          {sourceMode !== "grid" && parsedData.length > 0 && !error && (
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid grid-cols-2 mb-4">
                <TabsTrigger value="preview">Data Preview</TabsTrigger>
                <TabsTrigger value="mapping">Field Mapping</TabsTrigger>
              </TabsList>
              
              <TabsContent value="preview" className="space-y-4">
                <h3 className="font-semibold">Preview Data (First 5 Rows)</h3>
                <div className="max-h-60 overflow-auto border rounded-md">
                  <Table className="text-xs">
                    <TableHeader>
                      <TableRow>
                        {headers.map((header, index) => (
                          <TableHead key={index}>{header}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {previewData.map((row, rowIndex) => (
                        <TableRow key={rowIndex}>
                          {headers.map((header, colIndex) => (
                            <TableCell key={colIndex} className="max-w-[100px] truncate" title={String(row[header] ?? '')}>
                              {row[header] instanceof Date ? format(row[header], 'PP') : String(row[header] ?? '')}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {validationResults.length > 0 && (
                  <div className="space-y-2 p-3 border border-destructive rounded-md bg-destructive/5">
                    <h4 className="font-semibold text-destructive flex items-center gap-1">
                      <AlertTriangle className="h-4 w-4"/> Validation Errors ({validationResults.length})
                    </h4>
                    <ul className="list-disc list-inside text-xs max-h-40 overflow-auto">
                      {validationResults.slice(0, 10).map(res => ( // Show first 10 errors
                        <li key={res.row}>Row {res.row}: {res.errors.join(', ')}</li>
                      ))}
                      {validationResults.length > 10 && <li>... and {validationResults.length - 10} more errors</li>}
                    </ul>
                  </div>
                )}
                
                {validationResults.length === 0 && parsedData.length > 0 && (
                  <div className="p-3 border border-green-500 rounded-md bg-green-50 text-green-700 text-sm flex items-center gap-1">
                    <CheckCircle className="h-4 w-4"/> Ready to import {parsedData.length} row{parsedData.length === 1 ? "" : "s"}.
                  </div>
                )}
              </TabsContent>
              
              <TabsContent value="mapping" className="space-y-4">
                <h3 className="font-semibold">Map columns to inventory fields</h3>
                <p className="text-sm text-muted-foreground">
                  Match your columns to the expected inventory fields. Required fields are marked with *.
                </p>
                
                <div className="space-y-3 max-h-[400px] overflow-y-auto border rounded-md p-4">
                  {EXPECTED_HEADERS.map(expectedField => (
                    <div key={expectedField} className="grid grid-cols-[1fr,auto,1fr] items-center gap-2">
                      <div>
                        <Label className="capitalize">
                          {expectedField.replace(/([A-Z])/g, ' $1').trim()}
                          {expectedField === "name" && <span className="text-destructive">*</span>}
                        </Label>
                      </div>
                      
                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                      
                      <Select
                        value={fieldMapping[expectedField] || UNMAPPED_HEADER_VALUE}
                        onValueChange={(value) => handleFieldMappingChange(expectedField, value)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select column" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={UNMAPPED_HEADER_VALUE}>Not mapped</SelectItem>
                          {headers.map(header => (
                            <SelectItem key={header} value={header}>{header}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
                
                {Object.keys(fieldMapping).length > 0 && (
                  <div className={`p-3 border rounded-md ${
                    validationResults.length > 0 ? 'border-amber-500 bg-amber-50 text-amber-700' : 'border-green-500 bg-green-50 text-green-700'
                  } text-sm flex items-center gap-1`}>
                    {validationResults.length > 0 ? (
                      <>
                        <AlertTriangle className="h-4 w-4"/> 
                        {validationResults.length} validation issues found. Please review the Data Preview tab.
                      </>
                    ) : (
                      <>
                        <CheckCircle className="h-4 w-4"/> 
                        Field mapping looks good! You've mapped {Object.keys(fieldMapping).length} fields.
                      </>
                    )}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { resetState(); onClose(); }}>
            Cancel
          </Button>
          <Button
            onClick={handleImportClick}
            disabled={
              isLoading ||
              (!!error && sourceMode !== "grid") ||
              (sourceMode !== "grid" && (parsedData.length === 0 || validationResults.length > 0))
            }
          >
            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
            Import{" "}
            {sourceMode === "grid"
              ? gridNonEmptyCount > 0
                ? `${gridNonEmptyCount} `
                : ""
              : parsedData.length > 0
                ? `${parsedData.length} `
                : ""}
            rows
          </Button>
        </DialogFooter>
      </DraggableDialogContent>
    </Dialog>
    <BarcodeScannerDialog
      open={scannerOpen}
      onOpenChange={setScannerOpen}
      onScan={handleBarcodeScanned}
    />
    </>
  );
}
