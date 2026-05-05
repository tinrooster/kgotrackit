import { useState, useEffect, useMemo } from 'react';
import type { FC } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { useAuth } from '@/contexts/AuthContext';
import { InventoryItem, CategoryNode, ItemWithSubcategories } from '@/types/inventory';
import BatchOperations from '@/components/BatchOperations';
import { v4 as uuidv4 } from 'uuid';
import { toast } from 'sonner';
import { getSettings, saveItems, SETTINGS_UPDATED_EVENT } from '@/lib/storageService';
import {
  applyInventoryState,
  canRedoInventory,
  canUndoInventory,
  recordInventorySnapshotBeforeChange,
  redoInventoryMutation,
  undoInventoryMutation,
} from '@/lib/inventoryUndo';
import { SettingsService, DEFAULT_SETTINGS_CHANGED_EVENT } from '@/lib/settingsService';
import { allocateRecordId, allocateAssetTags, coerceDateInServiceForTag } from '@/lib/inventoryIdGeneration';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { 
  Plus, 
  Search, 
  Filter, 
  Copy,
  X,
  Download,
  Pencil,
  Trash,
  ArrowUpDown,
  FileText,
  LayoutList,
  LayoutGrid,
  Printer,
  Undo2,
  Redo2,
  Zap,
} from 'lucide-react';
import { AddItemDialog } from '@/components/AddItemDialog';
import { MobileQuickAddDialog } from '@/components/MobileQuickAddDialog';
import { EditItemDialog } from '@/components/EditItemDialog';
import { DuplicateItemDialog } from '@/components/DuplicateItemDialog';
import { ExportDialog } from '@/components/ExportDialog';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ItemTemplate } from '@/types/templates';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { format } from 'date-fns';
import { formatCurrency, cn } from '@/lib/utils';
import { FormatCellValue } from '@/components/formatting/CellValue';
import * as React from 'react';
import QRCode from 'qrcode';
import JsBarcode from 'jsbarcode';
import { FinancialCodeEntry, getFinancialSettings } from '@/lib/financialSettingsService';
import { logger } from '@/lib/logging';
import { resolveLocationDisplay } from '@/lib/resolveLocationLabel';
import { normalizeLocationValue, normalizeProjectValue } from '@/lib/referenceNormalization';

function normalizeLocationPath(value: string): string {
  return value.replace(/\s*\/\s*/g, '/').trim();
}

/** Items store `location` as list ids (`parent` or `parent/child`); the filter uses parent/sub names like the table. */
function itemMatchesLocationFilter(
  itemLocation: string | undefined,
  selectedFilter: string,
  locTree: ItemWithSubcategories[]
): boolean {
  if (!selectedFilter) {
    return true;
  }
  if (!itemLocation) {
    return false;
  }
  const label = resolveLocationDisplay(itemLocation, locTree);
  if (label === '-' || label === '') {
    return false;
  }
  const filterNorm = normalizeLocationPath(selectedFilter);
  const labelNorm = normalizeLocationPath(label);
  if (labelNorm === filterNorm) {
    return true;
  }
  if (!filterNorm.includes('/')) {
    return labelNorm === filterNorm || labelNorm.startsWith(`${filterNorm}/`);
  }
  return false;
}

// Helper function to flatten categories
function flattenCategories(categories: CategoryNode[]): string[] {
  if (!categories || !Array.isArray(categories)) {
    return [];
  }
  
  const flattened: string[] = [];
  
  const traverse = (node: CategoryNode, parentPath: string = '') => {
    const currentPath = parentPath ? `${parentPath}/${node.name}` : node.name;
    flattened.push(currentPath);
    
    if (node.children) {
      node.children.forEach(child => traverse(child, currentPath));
    }
  };

  categories.forEach(category => traverse(category));
  return flattened.sort();
}

// Get unique values from an array of items for a specific field
const getUniqueValues = (items: InventoryItem[], field: keyof InventoryItem): string[] => {
  const values = items
    .map(item => item[field])
    .filter((value): value is string => !!value); // Filter out undefined/null values
  return [...new Set(values)].sort();
};

const SIMPLE_COLUMNS_DEFAULT = ['name', 'category', 'location', 'project', 'quantity', 'photoUrl', 'lastUpdated'];
const DETAILED_COLUMNS_DEFAULT = [
  'name',
  'category',
  'location',
  'project',
  'quantity',
  'unit',
  'photoUrl',
  'recordId',
  'assetId',
  'rackLocation',
  'lastUpdated',
  'expenseTypeCode',
  'costCenterCode',
  'costPerUnit',
  'totalValue',
];
const DETAILED_FINANCIAL_COLUMNS = ['expenseTypeCode', 'costCenterCode', 'costPerUnit', 'totalValue'];
const PINNED_PRIMARY_COLUMNS = ['name', 'category', 'location'];

interface InventoryTablePreferencePayload {
  isDetailedView: boolean;
  columnWidths: Record<string, number>;
  simpleColumns?: string[];
  detailedColumns?: string[];
}

function getInventoryPreferenceKey(userKey: string): string {
  return `inventory-table-preferences:${userKey}`;
}

function normalizeColumnOrder(input: string[] | undefined, defaults: string[], enforceFinancialLast: boolean): string[] {
  const source = Array.isArray(input) ? input : defaults;
  const unique = Array.from(new Set(source)).filter((column) => defaults.includes(column));
  const missing = defaults.filter((column) => !unique.includes(column));
  const merged = [...unique, ...missing];

  const primaryColumns = PINNED_PRIMARY_COLUMNS.filter((column) => merged.includes(column));
  const withoutPrimaryColumns = merged.filter((column) => !primaryColumns.includes(column));
  if (!enforceFinancialLast) {
    return [...primaryColumns, ...withoutPrimaryColumns];
  }

  const financialColumns = DETAILED_FINANCIAL_COLUMNS.filter((column) => withoutPrimaryColumns.includes(column));
  const withoutFinancialColumns = withoutPrimaryColumns.filter((column) => !financialColumns.includes(column));
  return [...primaryColumns, ...withoutFinancialColumns, ...financialColumns];
}

// Helper function to convert ItemWithSubcategories to CategoryNode
const convertToCategories = (items: ItemWithSubcategories[]): CategoryNode[] => {
  return items.map(item => ({
    id: item.id,
    name: item.name,
    children: item.subcategories ? item.subcategories.map(sub => ({
      id: crypto.randomUUID(),
      name: sub,
      parentId: item.id
    })) : undefined
  }));
};

export default function InventoryPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { currentUser } = useAuth();
  const inventoryPreferenceUserKey = useMemo(
    () => currentUser?.username || currentUser?.displayName || 'admin',
    [currentUser?.username, currentUser?.displayName]
  );
  
  // Get any filter params from URL
  const categoryFilter = searchParams.get('category') || '';
  const locationFilter = searchParams.get('location') || '';
  const supplierFilter = searchParams.get('supplier') || '';
  const projectFilter = searchParams.get('project') || '';

  // State for inventory items
  const [items, setItems] = useLocalStorage<InventoryItem[]>('inventoryItems', []);
  
  // State for search and filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState(categoryFilter);
  const [selectedLocation, setSelectedLocation] = useState(locationFilter);
  const [selectedSupplier, setSelectedSupplier] = useState(supplierFilter);
  const [selectedProject, setSelectedProject] = useState(projectFilter);
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [isAllSelected, setIsAllSelected] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<InventoryItem | null>(null);

  // State for dialogs
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const [mobileTabletUi, setMobileTabletUi] = useState(
    () => SettingsService.loadDefaultSettings().mobileTabletUi
  );
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDuplicateDialogOpen, setIsDuplicateDialogOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [originalEditItem, setOriginalEditItem] = useState<InventoryItem | null>(null);
  const [highlightedItemId, setHighlightedItemId] = useState<string | null>(null);
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
  const [printItem, setPrintItem] = useState<InventoryItem | null>(null);
  const [printLayout, setPrintLayout] = useState<'compact' | 'detailed'>('detailed');
  const [printCodeType, setPrintCodeType] = useState<'qr' | 'barcode' | 'both'>(() => {
    const mode = SettingsService.loadDefaultSettings().assetCodeMode;
    if (mode === 'qr' || mode === 'barcode' || mode === 'both') {
      return mode;
    }
    return 'qr';
  });
  const [isBulkPrintDialogOpen, setIsBulkPrintDialogOpen] = useState(false);
  const [bulkPrintSku, setBulkPrintSku] = useState<'5160' | '5161' | '5162'>('5160');
  const [bulkPrintCodeType, setBulkPrintCodeType] = useState<'none' | 'qr' | 'barcode' | 'both'>('none');
  const [bulkPrintIncludeName, setBulkPrintIncludeName] = useState(true);
  
  // Load settings
  const [categories, setCategories] = useState<CategoryNode[]>([]);
  const [units, setUnits] = useState<ItemWithSubcategories[]>([]);
  const [locations, setLocations] = useState<ItemWithSubcategories[]>([]);
  const [suppliers, setSuppliers] = useState<ItemWithSubcategories[]>([]);
  const [projects, setProjects] = useState<ItemWithSubcategories[]>([]);
  const [expenseCodes, setExpenseCodes] = useState<ItemWithSubcategories[]>([]);
  const [expenseTypes, setExpenseTypes] = useState<FinancialCodeEntry[]>([]);
  const [costCenters, setCostCenters] = useState<FinancialCodeEntry[]>([]);

  // Load settings and keep in sync with Settings page updates.
  useEffect(() => {
    const loadSettings = () => {
      const settings = getSettings();
      setCategories(convertToCategories(settings.categories));
      setUnits(settings.units);
      setLocations(settings.locations);
      setSuppliers(settings.suppliers);
      setProjects(settings.projects);
      setExpenseCodes(settings.expenseCodes || []);
      const financialSettings = getFinancialSettings();
      setExpenseTypes(financialSettings.expenseTypes);
      setCostCenters(financialSettings.costCenters);
    };

    const handleSettingsUpdated = () => {
      loadSettings();
    };

    loadSettings();
    window.addEventListener(SETTINGS_UPDATED_EVENT, handleSettingsUpdated);
    window.addEventListener('focus', handleSettingsUpdated);
    document.addEventListener('visibilitychange', handleSettingsUpdated);

    return () => {
      window.removeEventListener(SETTINGS_UPDATED_EVENT, handleSettingsUpdated);
      window.removeEventListener('focus', handleSettingsUpdated);
      document.removeEventListener('visibilitychange', handleSettingsUpdated);
    };
  }, []);

  /** Holds "Use template" navigation payload until the add dialog closes (survives `navigate` replacing location state). */
  const [addDialogTemplate, setAddDialogTemplate] = useState<ItemTemplate | undefined>(undefined);

  // Add sorting state
  const [sortField, setSortField] = useState<keyof InventoryItem>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const [updateTrigger, setUpdateTrigger] = useState(0);
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const [columnOrderByView, setColumnOrderByView] = useState<{ simple: string[]; detailed: string[] }>({
    simple: SIMPLE_COLUMNS_DEFAULT,
    detailed: DETAILED_COLUMNS_DEFAULT,
  });
  const resizeStateRef = React.useRef<{ column: string; startX: number; startWidth: number } | null>(null);
  const [invUndoAvail, setInvUndoAvail] = useState(false);
  const [invRedoAvail, setInvRedoAvail] = useState(false);

  const [inventoryUndoEnabled, setInventoryUndoEnabled] = useState(() => {
    const s = SettingsService.loadDefaultSettings();
    const key = currentUser?.username || currentUser?.displayName || 'admin';
    return s.undoByUser?.[key] ?? true;
  });

  useEffect(() => {
    const syncUndoSetting = () => {
      const s = SettingsService.loadDefaultSettings();
      const key = currentUser?.username || currentUser?.displayName || 'admin';
      setInventoryUndoEnabled(s.undoByUser?.[key] ?? true);
    };
    syncUndoSetting();
    window.addEventListener(DEFAULT_SETTINGS_CHANGED_EVENT, syncUndoSetting);
    return () => window.removeEventListener(DEFAULT_SETTINGS_CHANGED_EVENT, syncUndoSetting);
  }, [currentUser?.username, currentUser?.displayName]);

  useEffect(() => {
    const syncMobileUi = () => {
      setMobileTabletUi(SettingsService.loadDefaultSettings().mobileTabletUi);
    };
    syncMobileUi();
    window.addEventListener(DEFAULT_SETTINGS_CHANGED_EVENT, syncMobileUi);
    return () => window.removeEventListener(DEFAULT_SETTINGS_CHANGED_EVENT, syncMobileUi);
  }, []);

  const printAssetSticker = async (item: InventoryItem, layout: 'compact' | 'detailed', codeType: 'qr' | 'barcode' | 'both') => {
    const escapeHtml = (value: string) =>
      value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');

    const popup = window.open('', '_blank', 'width=460,height=340');
    if (!popup) return;

    const tagForDisplay = item.assetId || item.recordId || item.id;
    const assetIdentifier = escapeHtml(tagForDisplay);
    const assetIdentifierRange = item.assetTagEnd
      ? `${assetIdentifier} – ${escapeHtml(item.assetTagEnd)}`
      : assetIdentifier;
    const recordForDisplay = item.recordId ? escapeHtml(item.recordId) : '';
    const safeName = escapeHtml(item.name || '');
    const safeCategory = escapeHtml(item.category || '-');
    const safeLocation = escapeHtml(item.location || '-');
    const defaults = SettingsService.loadDefaultSettings();
    const safeCodeMode = escapeHtml((defaults.assetCodeMode || 'qr').toUpperCase());
    const encodedValue = item.assetId || item.recordId || item.id;

    const shouldShowQr = codeType === 'qr' || codeType === 'both';
    const shouldShowBarcode = codeType === 'barcode' || codeType === 'both';

    const qrDataUrl = shouldShowQr
      ? await QRCode.toDataURL(encodedValue, { margin: 1, width: layout === 'compact' ? 120 : 140 })
      : '';

    let barcodeSvg = '';
    if (shouldShowBarcode) {
      const barcodeTarget = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      JsBarcode(barcodeTarget, encodedValue, {
        format: 'CODE128',
        width: 1.8,
        height: layout === 'compact' ? 36 : 44,
        displayValue: true,
        margin: 0,
      });
      barcodeSvg = barcodeTarget.outerHTML;
    }

    const compactBody = `
      <div style="border: 2px solid #111; border-radius: 8px; padding: 10px; width: 260px;">
        <div style="font-size: 12px; font-weight: 600; margin-bottom: 6px;">${safeName}</div>
        ${recordForDisplay ? `<div style="font-size: 10px; margin-bottom: 4px;">Inventory record: <strong>${recordForDisplay}</strong></div>` : ''}
        <div style="font-size: 11px; margin-bottom: 8px;">Asset tag: <strong>${assetIdentifierRange}</strong></div>
        <div style="display: flex; gap: 8px; align-items: center; justify-content: center;">
          ${shouldShowQr ? `<img src="${qrDataUrl}" alt="QR Code" style="width: 120px; height: 120px;" />` : ''}
          ${shouldShowBarcode ? `<div style="max-width: 220px;">${barcodeSvg}</div>` : ''}
        </div>
      </div>
    `;

    const detailedBody = `
      <div style="border: 2px solid #111; border-radius: 8px; padding: 14px;">
        <div style="font-size: 12px; color: #555;">TEd_trackIT Asset</div>
        <div style="font-size: 20px; font-weight: 700; margin-top: 4px;">${safeName}</div>
        ${recordForDisplay ? `<div style="font-size: 12px; margin-top: 6px;">Inventory record: <strong>${recordForDisplay}</strong></div>` : ''}
        <div style="font-size: 14px; margin-top: 8px;">Asset tag: <strong>${assetIdentifierRange}</strong></div>
        <div style="font-size: 12px; margin-top: 4px;">Code Mode: ${safeCodeMode}</div>
        <div style="font-size: 12px; margin-top: 6px;">Category: ${safeCategory}</div>
        <div style="font-size: 12px;">Location: ${safeLocation}</div>
        <div style="display: flex; gap: 12px; align-items: center; margin-top: 12px;">
          ${shouldShowQr ? `<img src="${qrDataUrl}" alt="QR Code" style="width: 140px; height: 140px;" />` : ''}
          ${shouldShowBarcode ? `<div style="flex: 1; min-width: 220px;">${barcodeSvg}</div>` : ''}
        </div>
      </div>
    `;

    popup.document.write(`
      <html>
        <head><title>Asset Sticker</title></head>
        <body style="font-family: Arial, sans-serif; margin: 20px;">
          ${layout === 'compact' ? compactBody : detailedBody}
          <script>window.onload = () => window.print();</script>
        </body>
      </html>
    `);
    popup.document.close();
  };

  const openPrintDialog = (item: InventoryItem) => {
    const defaults = SettingsService.loadDefaultSettings();
    const mode = defaults.assetCodeMode;
    setPrintLayout('detailed');
    setPrintCodeType(mode === 'none' ? 'qr' : mode);
    setPrintItem(item);
  };

  const getAverySheetSpec = (sku: '5160' | '5161' | '5162') => {
    const specMap = {
      '5160': { columns: 3, labelWidth: 2.625, labelHeight: 1.0, marginLeft: 0.1875, marginTop: 0.5, gapX: 0.125, gapY: 0.0 },
      '5161': { columns: 2, labelWidth: 4.0, labelHeight: 1.0, marginLeft: 0.156, marginTop: 0.5, gapX: 0.125, gapY: 0.0 },
      '5162': { columns: 2, labelWidth: 4.0, labelHeight: 1.333, marginLeft: 0.156, marginTop: 0.833, gapX: 0.125, gapY: 0.0 },
    } as const;
    return specMap[sku];
  };

  const getLabelsPerSheet = (sku: '5160' | '5161' | '5162') => {
    const perSheetMap = {
      '5160': 30,
      '5161': 20,
      '5162': 14,
    } as const;
    return perSheetMap[sku];
  };

  const handleBulkPrint = async () => {
    const selectedRecords = items.filter((item) => selectedItems.includes(item.id));
    if (selectedRecords.length === 0) {
      toast.info('Select at least one row to bulk print.');
      return;
    }

    const escapeHtml = (value: string) =>
      value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');

    const labelsMarkupList = await Promise.all(selectedRecords.map(async (item) => {
        const assetIdValue = escapeHtml(item.assetId || item.recordId || item.id);
        const itemName = escapeHtml(item.name || '');
        let qrMarkup = '';
        let barcodeMarkup = '';

        if (bulkPrintCodeType === 'qr' || bulkPrintCodeType === 'both') {
          const qrDataUrl = await QRCode.toDataURL(item.assetId || item.recordId || item.id, { margin: 0, width: 72 });
          qrMarkup = `<img src="${qrDataUrl}" alt="QR code" style="width: 0.6in; height: 0.6in;" />`;
        }
        if (bulkPrintCodeType === 'barcode' || bulkPrintCodeType === 'both') {
          const barcodeTarget = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
          JsBarcode(barcodeTarget, item.assetId || item.recordId || item.id, {
            format: 'CODE128',
            width: 1.2,
            height: 26,
            displayValue: false,
            margin: 0,
          });
          barcodeMarkup = `<div style="max-width: 100%;">${barcodeTarget.outerHTML}</div>`;
        }

        return `
          <div class="label">
            ${bulkPrintIncludeName ? `<div class="label-title">${itemName}</div>` : ''}
            <div class="label-id">${assetIdValue}</div>
            ${bulkPrintCodeType !== 'none' ? `<div class="label-codes">${qrMarkup}${barcodeMarkup}</div>` : ''}
          </div>
        `;
      }));
    const labelsMarkup = labelsMarkupList.join('');

    const previewWindow = window.open('', '_blank', 'width=1100,height=850');
    if (!previewWindow) {
      toast.error('Popup blocked. Enable popups to preview bulk label print.');
      return;
    }

    const sheetSpec = getAverySheetSpec(bulkPrintSku);
    previewWindow.document.write(`
      <html>
        <head>
          <title>Bulk Label Preview</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 0; background: #f5f7fb; }
            .toolbar {
              position: sticky; top: 0; z-index: 2;
              display: flex; justify-content: space-between; align-items: center;
              padding: 12px 16px; background: #111827; color: #fff;
            }
            .toolbar button {
              padding: 8px 12px; border-radius: 6px; border: 0; cursor: pointer;
              background: #2563eb; color: #fff; font-weight: 600;
            }
            .sheet {
              width: 8.5in; min-height: 11in; margin: 16px auto;
              padding-top: ${sheetSpec.marginTop}in;
              padding-left: ${sheetSpec.marginLeft}in;
              box-sizing: border-box;
              background: #fff; box-shadow: 0 10px 30px rgba(0,0,0,0.15);
              display: grid;
              grid-template-columns: repeat(${sheetSpec.columns}, ${sheetSpec.labelWidth}in);
              grid-auto-rows: ${sheetSpec.labelHeight}in;
              column-gap: ${sheetSpec.gapX}in;
              row-gap: ${sheetSpec.gapY}in;
            }
            .label {
              border: 1px dashed #d1d5db; border-radius: 4px; padding: 3px 4px 4px;
              display: flex; flex-direction: column; justify-content: flex-start;
              align-items: stretch;
              overflow: hidden;
            }
            .label-title {
              font-size: 10px; font-weight: 700; line-height: 1.25;
              max-height: 2.5em;
              display: -webkit-box;
              -webkit-line-clamp: 2;
              -webkit-box-orient: vertical;
              overflow: hidden;
              word-break: break-word;
            }
            .label-id { margin-top: 2px; font-size: 9px; font-family: "Courier New", monospace; line-height: 1.2; }
            .label-codes { display: flex; align-items: center; gap: 6px; margin-top: 4px; }
            .label-codes svg { max-width: 100%; height: 0.36in; }
            @media print {
              .toolbar { display: none; }
              body { background: #fff; }
              .sheet { margin: 0; box-shadow: none; }
            }
          </style>
        </head>
        <body>
          <div class="toolbar">
            <div>Preview ${selectedRecords.length} labels (Avery ${bulkPrintSku})</div>
            <button onclick="window.print()">Print Labels</button>
          </div>
          <div class="sheet">${labelsMarkup}</div>
        </body>
      </html>
    `);
    previewWindow.document.close();
    toast.success(`Prepared ${selectedRecords.length} labels for Avery ${bulkPrintSku}.`);
  };

  const appendAuditLog = (
    action: 'CREATE' | 'UPDATE',
    item: InventoryItem,
    changes?: Array<{ field: string; from: string; to: string }>
  ) => {
    const auditKey = 'inventory-audit-log';
    const existingRaw = localStorage.getItem(auditKey);
    const existingLogs = existingRaw ? JSON.parse(existingRaw) : [];
    const nextLogs = [
      ...existingLogs,
      {
        id: crypto.randomUUID(),
        action,
        itemId: item.id,
        recordId: item.recordId || null,
        assetId: item.assetId || null,
        name: item.name,
        timestamp: new Date().toISOString(),
        user: currentUser?.username || currentUser?.displayName || 'Unknown',
      },
    ];
    localStorage.setItem(auditKey, JSON.stringify(nextLogs));
    logger.info(
      'audit',
      action === 'CREATE' ? 'INVENTORY_ITEM_CREATED' : 'INVENTORY_ITEM_UPDATED',
      {
        itemId: item.id,
        recordId: item.recordId || null,
        assetId: item.assetId || null,
        name: item.name,
        user: currentUser?.username || currentUser?.displayName || 'Unknown',
        changes: changes || [],
      },
      'InventoryPage'
    );
  };

  const stringifyFieldValue = (fieldValue: unknown): string => {
    if (fieldValue === null || fieldValue === undefined || fieldValue === '') return '(empty)';
    if (typeof fieldValue === 'string' || typeof fieldValue === 'number' || typeof fieldValue === 'boolean') {
      return String(fieldValue);
    }
    if (fieldValue instanceof Date) {
      return fieldValue.toISOString();
    }
    try {
      return JSON.stringify(fieldValue);
    } catch {
      return String(fieldValue);
    }
  };

  const getUpdatedFieldChanges = (previousItem: InventoryItem, nextItem: InventoryItem) => {
    const excludedFields = new Set(['lastUpdated', 'lastModifiedBy']);
    const allFields = Array.from(new Set([...Object.keys(previousItem), ...Object.keys(nextItem)]));
    return allFields
      .filter((fieldName) => !excludedFields.has(fieldName))
      .map((fieldName) => {
        const previousValue = stringifyFieldValue((previousItem as unknown as Record<string, unknown>)[fieldName]);
        const nextValue = stringifyFieldValue((nextItem as unknown as Record<string, unknown>)[fieldName]);
        return { field: fieldName, from: previousValue, to: nextValue };
      })
      .filter((change) => change.from !== change.to);
  };

  // Get flattened categories for filtering
  const flattenedCategories = useMemo(() => flattenCategories(categories), [categories]);

  // Get unique values for filters
  const uniqueLocations = useMemo(() => locations.map(loc => loc.name), [locations]);
  const uniqueProjects = useMemo(() => projects.map(proj => proj.name), [projects]);
  const uniqueSuppliers = useMemo(() => suppliers.map(sup => sup.name), [suppliers]);

  // Update the filtered items to include sorting
  const filteredItems = useMemo(() => {
    const filtered = items.filter(item => {
      const searchFields = [
        item.name,
        item.recordId,
        item.assetId,
        item.category,
        item.location,
        item.project,
        item.notes,
        item.rackLocation,
        item.decomNotes,
        item.cableColor,
        item.connectorType,
        item.cableLotNumber,
      ].map(field => field?.toLowerCase() || '');

      const matchesSearch = !searchQuery || 
        searchFields.some(field => field.includes(searchQuery.toLowerCase()));
      
      const matchesCategory = !selectedCategory || item.category === selectedCategory;
      const matchesLocation = itemMatchesLocationFilter(item.location, selectedLocation, locations);
      const matchesProject = !selectedProject || item.project === selectedProject;

      return matchesSearch && matchesCategory && matchesLocation && matchesProject;
    });

    // Sort the filtered items
    return [...filtered].sort((a, b) => {
      if (sortField === 'photoUrl') {
        const aHas = a.photoUrl ? 1 : 0;
        const bHas = b.photoUrl ? 1 : 0;
        if (aHas !== bHas) {
          const cmp = aHas - bHas;
          return sortDirection === 'asc' ? cmp : -cmp;
        }
        const nameCmp = String(a.name || '').localeCompare(String(b.name || ''));
        return sortDirection === 'asc' ? nameCmp : -nameCmp;
      }

      const aValue = a[sortField];
      const bValue = b[sortField];

      if (aValue === bValue) return 0;
      if (aValue === null || aValue === undefined) return 1;
      if (bValue === null || bValue === undefined) return -1;

      const comparison = String(aValue).localeCompare(String(bValue));
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [items, searchQuery, selectedCategory, selectedLocation, selectedProject, sortField, sortDirection, locations]);

  const inventoryTotals = useMemo(() => {
    let totalQuantity = 0;
    let totalInventoryValue = 0;
    for (const item of filteredItems) {
      const qty = Number(item.quantity) || 0;
      totalQuantity += qty;
      totalInventoryValue += qty * (item.costPerUnit || 0);
    }
    return { totalQuantity, totalInventoryValue };
  }, [filteredItems]);

  // Handle column sort
  const handleSort = (field: keyof InventoryItem) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // Selection handlers
  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedItems([]);
    } else {
      setSelectedItems(filteredItems.map(item => item.id));
    }
    setIsAllSelected(!isAllSelected);
  };

  const toggleItemSelection = (itemId: string) => {
    setSelectedItems(prev => {
      const newSelection = prev.includes(itemId)
        ? prev.filter(id => id !== itemId)
        : [...prev, itemId];
      setIsAllSelected(newSelection.length === filteredItems.length);
      return newSelection;
    });
  };

  const clearSelection = () => {
    setSelectedItems([]);
    setIsAllSelected(false);
  };

  // Single item operations
  const handleDelete = (item: InventoryItem) => {
    setItemToDelete(item);
    setIsDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (!itemToDelete) return;
    try {
      recordInventorySnapshotBeforeChange(items);
      const updatedItems = items.filter(item => item.id !== itemToDelete.id);
      if (!saveItems(updatedItems)) {
        toast.error('Could not save after delete.', {
          description: 'Browser storage may be full. Export a backup or free space, then try again.',
        });
        return;
      }
      setItems(updatedItems);
      setInvUndoAvail(canUndoInventory());
      setInvRedoAvail(canRedoInventory());
      logger.info(
        'audit',
        'INVENTORY_ITEM_DELETED',
        {
          itemId: itemToDelete.id,
          assetId: itemToDelete.assetId || null,
          name: itemToDelete.name,
          user: currentUser?.username || currentUser?.displayName || 'Unknown',
        },
        'InventoryPage'
      );
      toast.success(`Deleted "${itemToDelete.name}"`);
    } catch (error) {
      logger.error(
        'audit',
        'INVENTORY_ITEM_DELETE_FAILED',
        {
          itemId: itemToDelete.id,
          name: itemToDelete.name,
          user: currentUser?.username || currentUser?.displayName || 'Unknown',
          error: String(error),
        },
        'InventoryPage'
      );
      toast.error('Failed to delete item');
    } finally {
      setIsDeleteDialogOpen(false);
      setItemToDelete(null);
    }
  };

  // Update URL when filters change
  const filters = useMemo(() => ({
    category: selectedCategory,
    location: selectedLocation,
    project: selectedProject
  }), [selectedCategory, selectedLocation, selectedProject]);

  useEffect(() => {
    const newParams = new URLSearchParams();
    
    Object.entries(filters).forEach(([key, value]) => {
      if (value) newParams.set(key, value);
    });
    
    // Only update if the params have changed to avoid unnecessary history entries
    if (newParams.toString() !== searchParams.toString()) {
      setSearchParams(newParams);
    }
  }, [filters, setSearchParams, searchParams]);

  // Highlight newly added items
  useEffect(() => {
    if (highlightedItemId) {
      const timer = setTimeout(() => {
        setHighlightedItemId(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [highlightedItemId]);

  const addInventoryItemFromFormData = React.useCallback(
    async (
      newItemData: Omit<InventoryItem, "id" | "lastUpdated">,
      options?: { toastMessage?: string }
    ) => {
      recordInventorySnapshotBeforeChange(items);
      const defaults = SettingsService.loadDefaultSettings();
      const trackingMode = (newItemData.assetTrackingMode || "line_item") as "line_item" | "per_unit";
      const recordId = allocateRecordId();
      let computedAssetId: string | undefined;
      let computedAssetTagEnd: string | undefined;
      if (defaults.autoAssignAssetId) {
        const gen = allocateAssetTags(
          coerceDateInServiceForTag(newItemData.dateInService),
          newItemData.quantity || 1,
          trackingMode
        );
        computedAssetId = gen.startId;
        computedAssetTagEnd = gen.endId;
      }
      const selectedExpenseType = expenseTypes.find((entry) => entry.code === newItemData.expenseTypeCode);
      const selectedCostCenter = costCenters.find((entry) => entry.code === newItemData.costCenterCode);
      const normalizedLocation = normalizeLocationValue(newItemData.location, locations);
      const normalizedProject = normalizeProjectValue(newItemData.project, projects);
      const newItem: InventoryItem = {
        ...newItemData,
        location: normalizedLocation || undefined,
        project: normalizedProject || undefined,
        recordId,
        assetId: computedAssetId,
        assetTagEnd: newItemData.assetTagEnd || computedAssetTagEnd,
        assetTrackingMode: trackingMode,
        expenseTypeDescription: newItemData.expenseTypeDescription || selectedExpenseType?.description,
        costCenterDescription: newItemData.costCenterDescription || selectedCostCenter?.description,
        id: uuidv4(),
        lastUpdated: new Date(),
        lastModifiedBy: currentUser?.username || currentUser?.displayName || "Unknown",
      };

      const addSaveResult = { ok: true };
      setItems((prev) => {
        const next = [...prev, newItem];
        addSaveResult.ok = saveItems(next);
        return addSaveResult.ok ? next : prev;
      });
      if (!addSaveResult.ok) {
        toast.error('Could not save new item.', {
          description: 'Browser storage may be full. Export a backup or free space, then try again.',
        });
        return;
      }
      setInvUndoAvail(canUndoInventory());
      setInvRedoAvail(canRedoInventory());
      appendAuditLog("CREATE", newItem);
      setHighlightedItemId(newItem.id);
      toast.success(options?.toastMessage ?? `Added "${newItem.name}" to inventory`);
    },
    [items, expenseTypes, costCenters, currentUser]
  );

  const handleAddItem = async (newItemData: Omit<InventoryItem, "id" | "lastUpdated">) => {
    await addInventoryItemFromFormData(newItemData);
    setIsAddDialogOpen(false);
    return Promise.resolve();
  };

  const handleQuickAddSubmit = React.useCallback(
    async (payload: Omit<InventoryItem, "id" | "lastUpdated">, mode: "once" | "next") => {
      const toastMessage =
        mode === "next" ? `Added "${payload.name.trim()}" — add next` : undefined;
      await addInventoryItemFromFormData(payload, { toastMessage });
      if (mode === "once") {
        setIsQuickAddOpen(false);
      }
    },
    [addInventoryItemFromFormData]
  );

  // Handle editing an item
  const handleEditItem = (item: InventoryItem) => {
    // Preserve an immutable snapshot for accurate field-level change logs.
    const snapshot = JSON.parse(JSON.stringify(item)) as InventoryItem;
    setOriginalEditItem(snapshot);
    setSelectedItem(item);
    setIsEditDialogOpen(true);
  };

  const handleSaveEdit = async (updatedItem: InventoryItem) => {
    try {
      recordInventorySnapshotBeforeChange(items);
      const previousItem = originalEditItem || items.find((item) => item.id === updatedItem.id) || null;
      const updatedItems = items.map((item) =>
        item.id === updatedItem.id
          ? {
              ...updatedItem,
              location: normalizeLocationValue(updatedItem.location, locations) || undefined,
              project: normalizeProjectValue(updatedItem.project, projects) || undefined,
              lastUpdated: new Date(),
              lastModifiedBy: currentUser?.username || currentUser?.displayName || 'Unknown',
            }
          : item,
      );
      if (!saveItems(updatedItems)) {
        toast.error('Could not save changes.', {
          description: 'Browser storage may be full. Export a backup or free space, then try again.',
        });
        return;
      }
      setItems(updatedItems);
      setInvUndoAvail(canUndoInventory());
      setInvRedoAvail(canRedoInventory());
      appendAuditLog('UPDATE', updatedItem, previousItem ? getUpdatedFieldChanges(previousItem, updatedItem) : []);
      toast.success(`Updated "${updatedItem.name}"`);
      setIsEditDialogOpen(false);
      setSelectedItem(null);
      setOriginalEditItem(null);
      setHighlightedItemId(updatedItem.id);
    } catch (error) {
      console.error('Error updating item:', error);
      toast.error('Failed to update item');
    }
  };

  // Handle duplicating an item
  const handleDuplicateItem = async (newItemData: Partial<InventoryItem>) => {
    recordInventorySnapshotBeforeChange(items);
    const defaults = SettingsService.loadDefaultSettings();
    const trackingMode = (newItemData.assetTrackingMode || 'line_item') as 'line_item' | 'per_unit';
    const quantity = Number(newItemData.quantity ?? 0);
    const recordId = allocateRecordId();
    let nextAssetId: string | undefined;
    let nextTagEnd: string | undefined;
    if (defaults.autoAssignAssetId) {
      const gen = allocateAssetTags(
        coerceDateInServiceForTag(newItemData.dateInService),
        Math.max(quantity, 1),
        trackingMode
      );
      nextAssetId = gen.startId;
      nextTagEnd = gen.endId;
    }
    const normalizedLocation = normalizeLocationValue(newItemData.location, locations);
    const normalizedProject = normalizeProjectValue(newItemData.project, projects);
    const newItem: InventoryItem = {
      ...newItemData,
      location: normalizedLocation || undefined,
      project: normalizedProject || undefined,
      recordId,
      assetId: nextAssetId,
      assetTagEnd: newItemData.assetTagEnd || nextTagEnd,
      id: uuidv4(),
      lastUpdated: new Date(),
      lastModifiedBy: currentUser?.username || currentUser?.displayName || 'Unknown'
    } as InventoryItem;
    
    const nextItems = [...items, newItem];
    if (!saveItems(nextItems)) {
      toast.error('Could not save duplicated item.', {
        description: 'Browser storage may be full. Export a backup or free space, then try again.',
      });
      return;
    }
    setItems(nextItems);
    setInvUndoAvail(canUndoInventory());
    setInvRedoAvail(canRedoInventory());
    setHighlightedItemId(newItem.id);
    setIsDuplicateDialogOpen(false);
    toast.success(`Duplicated "${selectedItem?.name}" successfully`);
  };

  const handleInventoryUndo = () => {
    const restored = undoInventoryMutation(items);
    if (!restored) {
      toast.info('Nothing to undo');
      return;
    }
    if (!applyInventoryState(restored, setItems)) {
      toast.error('Could not save undo.', {
        description: 'Browser storage may be full. Export a backup or free space, then try again.',
      });
      return;
    }
    toast.success('Undone');
    setInvUndoAvail(canUndoInventory());
    setInvRedoAvail(canRedoInventory());
  };

  const handleInventoryRedo = () => {
    const restored = redoInventoryMutation(items);
    if (!restored) {
      toast.info('Nothing to redo');
      return;
    }
    if (!applyInventoryState(restored, setItems)) {
      toast.error('Could not save redo.', {
        description: 'Browser storage may be full. Export a backup or free space, then try again.',
      });
      return;
    }
    toast.success('Redone');
    setInvUndoAvail(canUndoInventory());
    setInvRedoAvail(canRedoInventory());
  };

  // Handle filter changes
  const handleFilterChange = (field: string, value: string) => {
    switch (field) {
      case 'category':
        setSelectedCategory(value === 'all' ? '' : value);
        break;
      case 'location':
        setSelectedLocation(value === 'all' ? '' : value);
        break;
      case 'project':
        setSelectedProject(value === 'all' ? '' : value);
        break;
    }
  };

  useEffect(() => {
    const navTemplate = location.state?.template as ItemTemplate | undefined;
    if (!navTemplate) {
      return;
    }
    setAddDialogTemplate(navTemplate);
    setIsAddDialogOpen(true);
    navigate(location.pathname, { replace: true });
  }, [location.state, navigate, location.pathname]);

  const [isDetailedView, setIsDetailedView] = useState(false);

  useEffect(() => {
    try {
      const rawPreference = localStorage.getItem(getInventoryPreferenceKey(inventoryPreferenceUserKey));
      if (!rawPreference) {
        setIsDetailedView(false);
        setColumnWidths({});
        setColumnOrderByView({
          simple: normalizeColumnOrder(undefined, SIMPLE_COLUMNS_DEFAULT, false),
          detailed: normalizeColumnOrder(undefined, DETAILED_COLUMNS_DEFAULT, true),
        });
        return;
      }

      const parsedPreference = JSON.parse(rawPreference) as InventoryTablePreferencePayload;
      setIsDetailedView(Boolean(parsedPreference.isDetailedView));
      setColumnWidths(
        parsedPreference.columnWidths && typeof parsedPreference.columnWidths === 'object'
          ? parsedPreference.columnWidths
          : {}
      );
      setColumnOrderByView({
        simple: normalizeColumnOrder(parsedPreference.simpleColumns, SIMPLE_COLUMNS_DEFAULT, false),
        detailed: normalizeColumnOrder(parsedPreference.detailedColumns, DETAILED_COLUMNS_DEFAULT, true),
      });
    } catch {
      setIsDetailedView(false);
      setColumnWidths({});
      setColumnOrderByView({
        simple: normalizeColumnOrder(undefined, SIMPLE_COLUMNS_DEFAULT, false),
        detailed: normalizeColumnOrder(undefined, DETAILED_COLUMNS_DEFAULT, true),
      });
    }
  }, [inventoryPreferenceUserKey]);

  useEffect(() => {
    const preferencePayload: InventoryTablePreferencePayload = {
      isDetailedView,
      columnWidths,
      simpleColumns: normalizeColumnOrder(columnOrderByView.simple, SIMPLE_COLUMNS_DEFAULT, false),
      detailedColumns: normalizeColumnOrder(columnOrderByView.detailed, DETAILED_COLUMNS_DEFAULT, true),
    };
    localStorage.setItem(getInventoryPreferenceKey(inventoryPreferenceUserKey), JSON.stringify(preferencePayload));
  }, [inventoryPreferenceUserKey, isDetailedView, columnWidths, columnOrderByView]);

  const activeColumns = isDetailedView
    ? normalizeColumnOrder(columnOrderByView.detailed, DETAILED_COLUMNS_DEFAULT, true)
    : normalizeColumnOrder(columnOrderByView.simple, SIMPLE_COLUMNS_DEFAULT, false);

  const handleColumnResizeStart = (event: React.MouseEvent, column: string) => {
    event.preventDefault();
    const startWidth = columnWidths[column] || 180;
    resizeStateRef.current = {
      column,
      startX: event.clientX,
      startWidth,
    };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const resizeState = resizeStateRef.current;
      if (!resizeState) return;
      const widthDelta = moveEvent.clientX - resizeState.startX;
      const nextWidth = Math.max(100, resizeState.startWidth + widthDelta);
      setColumnWidths((previous) => ({ ...previous, [resizeState.column]: nextWidth }));
    };

    const handleMouseUp = () => {
      resizeStateRef.current = null;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const onItemsUpdated = () => {
    // Force a refresh of the items from localStorage
    const updatedItems = JSON.parse(localStorage.getItem('inventoryItems') || '[]');
    setItems(updatedItems);
    setUpdateTrigger(prev => prev + 1);
  };

  // Convert string arrays to ItemWithSubcategories arrays for AddItemDialog
  const suppliersWithSubcategories = useMemo(() => 
    suppliers.map(name => ({ id: name, name, subcategories: [] })), 
    [suppliers]
  );

  const projectsWithSubcategories = useMemo(() => 
    projects.map(name => ({ id: name, name, subcategories: [] })), 
    [projects]
  );

  // Handle redirect if coming from batch operation
  useEffect(() => {
    const shouldRedirect = sessionStorage.getItem('redirectToInventory');
    if (shouldRedirect) {
      sessionStorage.removeItem('redirectToInventory');
      navigate('/inventory', { replace: true });
    }
  }, [navigate]);

  // Force refresh when navigating from batch operations
  useEffect(() => {
    if (location.state?.forceRefresh) {
      // Clear the state to prevent infinite refreshes
      navigate('/inventory', { replace: true, state: {} });
      // Force a re-render of the filtered items
      setUpdateTrigger(prev => prev + 1);
    }
  }, [location.state?.forceRefresh, navigate]);

  return (
    <div className="inventory-page w-full min-w-0 max-w-full space-y-4">
      <div className="inventory-toolbar sticky top-16 z-30 space-y-4 bg-background/95 pb-2 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 flex-col gap-3 xl:flex-row xl:items-center xl:gap-4">
            <h1 className="shrink-0 text-2xl font-bold">Inventory</h1>
            <div className="flex min-w-0 flex-1 flex-nowrap items-center gap-2 overflow-x-auto pb-0.5 [scrollbar-width:thin]">
              <Input
                type="text"
                placeholder="Search inventory..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-9 min-w-[10rem] max-w-md shrink-0 flex-1 basis-[min(100%,18rem)]"
              />
              <Select value={selectedCategory || 'all'} onValueChange={(value) => handleFilterChange('category', value)}>
                <SelectTrigger className="h-9 w-[11.5rem] shrink-0">
                  <SelectValue placeholder="Filter by category" />
                </SelectTrigger>
                <SelectContent className="min-w-[200px]">
                  <SelectItem value="all">All Categories</SelectItem>
                  {flattenedCategories.map(category => (
                    <SelectItem key={category} value={category}>
                      {category}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={selectedLocation || "all"} onValueChange={(value) => handleFilterChange('location', value === "all" ? "" : value)}>
                <SelectTrigger className="h-9 w-[11.5rem] shrink-0">
                  <SelectValue placeholder="All Locations" />
                </SelectTrigger>
                <SelectContent className="min-w-[200px]">
                  <SelectItem value="all">All Locations</SelectItem>
                  {locations.map((locRow) => (
                    <React.Fragment key={locRow.id}>
                      <SelectItem value={locRow.name}>
                        {locRow.name}
                      </SelectItem>
                      {locRow.children?.map((sub) => (
                        <SelectItem
                          key={`${locRow.id}/${sub.id}`}
                          value={`${locRow.name}/${sub.name}`}
                        >
                          {locRow.name} - {sub.name}
                        </SelectItem>
                      ))}
                    </React.Fragment>
                  ))}
                </SelectContent>
              </Select>
              <Select value={selectedProject || "all"} onValueChange={(value) => handleFilterChange('project', value === "all" ? "" : value)}>
                <SelectTrigger className="h-9 w-[11.5rem] shrink-0">
                  <SelectValue placeholder="All Projects" />
                </SelectTrigger>
                <SelectContent className="min-w-[200px]">
                  <SelectItem value="all">All Projects</SelectItem>
                  {projects.map(project => (
                    <SelectItem key={project.id} value={project.name}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        handleFilterChange('category', 'all');
                        handleFilterChange('location', 'all');
                        handleFilterChange('project', 'all');
                      }}
                      className="ml-1"
                      disabled={!selectedCategory && !selectedLocation && !selectedProject}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {selectedCategory || selectedLocation || selectedProject 
                      ? "Clear all filters" 
                      : "No active filters"}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
          <div className="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
          <div className="flex items-center gap-2 sm:mr-2">
            <Switch
              id="view-mode"
              checked={isDetailedView}
              onCheckedChange={setIsDetailedView}
            />
            <Label htmlFor="view-mode" className="text-sm whitespace-nowrap">
              {isDetailedView ? 'Detailed View' : 'Simple View'}
            </Label>
          </div>
          {inventoryUndoEnabled && (
            <>
              <Button
                type="button"
                variant="outline"
                className="w-full sm:w-auto"
                disabled={!invUndoAvail}
                onClick={handleInventoryUndo}
              >
                <Undo2 className="mr-2 h-4 w-4" />
                Undo
              </Button>
              <Button
                type="button"
                variant="outline"
                className="w-full sm:w-auto"
                disabled={!invRedoAvail}
                onClick={handleInventoryRedo}
              >
                <Redo2 className="mr-2 h-4 w-4" />
                Redo
              </Button>
            </>
          )}
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
            <Button className="w-full sm:w-auto" onClick={() => setIsAddDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Add Item
            </Button>
            {mobileTabletUi && (
              <Button
                type="button"
                variant="secondary"
                className="h-11 w-full touch-manipulation sm:w-auto"
                onClick={() => setIsQuickAddOpen(true)}
              >
                <Zap className="mr-2 h-4 w-4" />
                Quick add
              </Button>
            )}
          </div>
        </div>
        </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-muted-foreground">
          {filteredItems.length} {filteredItems.length === 1 ? 'item' : 'items'} found
        </div>
        <Button variant="outline" onClick={() => setIsExportDialogOpen(true)}>
          <Download className="mr-2 h-4 w-4" />
          Export Current View
        </Button>
      </div>
      </div>

      {selectedItems.length > 0 && (
        <div className="flex items-center gap-2">
          <BatchOperations
            allItems={items}
            selectedItems={items.filter(item => selectedItems.includes(item.id))}
            onReplaceItems={setItems}
            onClearSelection={clearSelection}
            onItemsUpdated={() => {
              // Clear selection and refresh directly from durable storage.
              const reloadedItems = getItems();
              setItems(reloadedItems);
              setIsAllSelected(false);
              setSelectedItems([]);
            }}
            onDelete={(itemsToDelete) => {
              const reloadedItems = getItems();
              setItems(reloadedItems);
              clearSelection();
            }}
          />
          <Button variant="outline" size="sm" onClick={() => setIsBulkPrintDialogOpen(true)}>
            <Printer className="mr-2 h-4 w-4" />
            Bulk Print Labels ({selectedItems.length})
          </Button>
        </div>
      )}

      <div className="min-w-0 w-full max-w-full bg-card text-card-foreground rounded-lg border shadow-sm">
        <Table
          containerClassName="max-h-[calc(100vh-16rem)] w-full min-w-0 overflow-x-auto overscroll-x-contain touch-pan-x"
          className={cn(
            'w-full table-fixed border-collapse align-top text-sm',
            isDetailedView ? 'min-w-[1180px]' : 'min-w-[780px]'
          )}
        >
          <TableHeader>
            <TableRow>
              <TableHead className="w-[30px]">
                <Checkbox
                  checked={isAllSelected}
                  onCheckedChange={toggleSelectAll}
                />
              </TableHead>
              {activeColumns.map((column) => (
                <TableHead
                  key={column}
                  style={{ width: columnWidths[column] ? `${columnWidths[column]}px` : undefined }}
                  className="relative"
                >
                  {column === 'photoUrl' ? (
                    <div
                      className="flex cursor-pointer items-center space-x-1 pr-3"
                      onClick={() => handleSort('photoUrl')}
                    >
                      <span>Photo</span>
                      <ArrowUpDown className="h-4 w-4" />
                    </div>
                  ) : (
                    <div
                      className="flex cursor-pointer items-center space-x-1 pr-3"
                      onClick={() => handleSort(column as keyof InventoryItem)}
                    >
                      <span>
                        {column === 'recordId'
                          ? 'Record ID'
                          : column === 'assetId'
                            ? 'Asset tag'
                            : column.charAt(0).toUpperCase() + column.slice(1).replace(/([A-Z])/g, ' $1')}
                      </span>
                      <ArrowUpDown className="h-4 w-4" />
                    </div>
                  )}
                  <span
                    role="separator"
                    aria-label={`Resize ${column} column`}
                    className="absolute right-0 top-0 h-full w-1 cursor-col-resize select-none bg-transparent hover:bg-border"
                    onMouseDown={(event) => handleColumnResizeStart(event, column)}
                  />
                </TableHead>
              ))}
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredItems.map((item) => (
              <TableRow
                key={item.id}
                className={highlightedItemId === item.id ? 'bg-blue-50 dark:bg-blue-950/35 cursor-pointer' : 'cursor-pointer odd:bg-muted/[0.14] even:bg-transparent'}
                onDoubleClick={() => handleEditItem(item)}
              >
                <TableCell>
                  <Checkbox
                    checked={selectedItems.includes(item.id)}
                    onCheckedChange={() => toggleItemSelection(item.id)}
                  />
                </TableCell>
                {activeColumns.map((column) => (
                  <TableCell key={column} style={{ width: columnWidths[column] ? `${columnWidths[column]}px` : undefined }}>
                    <FormatCellValue item={item} column={column} />
                  </TableCell>
                ))}
                <TableCell>
                  <div className="flex items-center space-x-2">
                    <Button variant="ghost" size="icon" onClick={() => handleEditItem(item)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(item)}>
                      <Trash className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => {
                      setSelectedItem(item);
                      setIsDuplicateDialogOpen(true);
                    }}>
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => openPrintDialog(item)} title="Print asset sticker">
                      <Printer className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow className="hover:bg-card">
              <TableCell />
              {activeColumns.map((column) => {
                if (column === 'name') {
                  return (
                    <TableCell key={column} className="font-semibold">
                      Totals ({filteredItems.length} {filteredItems.length === 1 ? 'row' : 'rows'})
                    </TableCell>
                  );
                }
                if (column === 'quantity') {
                  return (
                    <TableCell key={column} className="font-semibold">
                      {inventoryTotals.totalQuantity}
                    </TableCell>
                  );
                }
                if (column === 'totalValue') {
                  return (
                    <TableCell key={column} className="font-semibold">
                      {formatCurrency(inventoryTotals.totalInventoryValue)}
                    </TableCell>
                  );
                }
                if (column === 'costPerUnit') {
                  return (
                    <TableCell key={column} className="text-muted-foreground">
                      —
                    </TableCell>
                  );
                }
                return (
                  <TableCell key={column} className="text-muted-foreground">
                    —
                  </TableCell>
                );
              })}
              <TableCell />
            </TableRow>
          </TableFooter>
        </Table>
      </div>

      {/* Dialogs */}
      <AddItemDialog
        open={isAddDialogOpen}
        onOpenChange={(nextOpen) => {
          setIsAddDialogOpen(nextOpen);
          if (!nextOpen) {
            setAddDialogTemplate(undefined);
          }
        }}
        onSubmit={handleAddItem}
        categories={categories}
        units={units}
        locations={locations}
        suppliers={suppliers}
        projects={projects}
        expenseTypes={expenseTypes}
        costCenters={costCenters}
        existingItems={items}
        selectedTemplate={addDialogTemplate}
      />

      <MobileQuickAddDialog
        open={isQuickAddOpen}
        onOpenChange={setIsQuickAddOpen}
        categories={categories}
        locations={locations}
        units={units}
        suppliers={suppliers}
        projects={projects}
        onSubmit={handleQuickAddSubmit}
      />

      {selectedItem && (
        <>
          <EditItemDialog
            item={selectedItem!}
            isOpen={isEditDialogOpen}
            onClose={() => setIsEditDialogOpen(false)}
            onSave={handleSaveEdit}
            categories={categories}
            units={units}
            locations={locations}
            suppliers={suppliers}
            projects={projects}
            expenseTypes={expenseTypes}
            costCenters={costCenters}
            cabinets={[]}
            existingItems={items}
          />

          <DuplicateItemDialog
            isOpen={isDuplicateDialogOpen}
            onClose={() => setIsDuplicateDialogOpen(false)}
            item={selectedItem as InventoryItem}
            onDuplicate={handleDuplicateItem}
          />
        </>
      )}

      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete "{itemToDelete?.name}" from your inventory.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ExportDialog
        isOpen={isExportDialogOpen}
        onClose={() => setIsExportDialogOpen(false)}
        items={filteredItems}
        defaultFilename={`inventory_export_${new Date().toISOString().split('T')[0]}_${filteredItems.length}_items`}
      />

      <Dialog open={!!printItem} onOpenChange={(open) => !open && setPrintItem(null)}>
        <DialogContent dismissOnOutsidePointer className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Print Label</DialogTitle>
            <DialogDescription>Choose compact code label or detailed sticker.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Label Type</Label>
              <Select value={printLayout} onValueChange={(value: 'compact' | 'detailed') => setPrintLayout(value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="compact">Compact QR/Barcode Label</SelectItem>
                  <SelectItem value="detailed">Detailed Sticker</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Code Format</Label>
              <Select value={printCodeType} onValueChange={(value: 'qr' | 'barcode' | 'both') => setPrintCodeType(value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="qr">QR Only</SelectItem>
                  <SelectItem value="barcode">Barcode Only</SelectItem>
                  <SelectItem value="both">QR + Barcode</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setPrintItem(null)}>
              Cancel
            </Button>
            <Button
              onClick={async () => {
                if (!printItem) return;
                await printAssetSticker(printItem, printLayout, printCodeType);
                setPrintItem(null);
              }}
            >
              Print
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isBulkPrintDialogOpen} onOpenChange={setIsBulkPrintDialogOpen}>
        <DialogContent dismissOnOutsidePointer className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Bulk Label Print</DialogTitle>
            <DialogDescription>Select Avery sheet format and content options.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Avery SKU</Label>
              <Select value={bulkPrintSku} onValueChange={(value: '5160' | '5161' | '5162') => setBulkPrintSku(value)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="5160">5160 - 30 labels (3 x 10)</SelectItem>
                  <SelectItem value="5161">5161 - 20 labels (2 x 10)</SelectItem>
                  <SelectItem value="5162">5162 - 14 labels (2 x 7)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Code Content</Label>
              <Select value={bulkPrintCodeType} onValueChange={(value: 'none' | 'qr' | 'barcode' | 'both') => setBulkPrintCodeType(value)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">ID text only</SelectItem>
                  <SelectItem value="qr">QR only</SelectItem>
                  <SelectItem value="barcode">Barcode only</SelectItem>
                  <SelectItem value="both">QR + Barcode</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between rounded-md border p-2">
              <Label htmlFor="bulk-include-name">Include item name</Label>
              <Switch id="bulk-include-name" checked={bulkPrintIncludeName} onCheckedChange={setBulkPrintIncludeName} />
            </div>
            <div className="rounded-md border bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
              {(() => {
                const selectedCount = selectedItems.length;
                const labelsPerSheet = getLabelsPerSheet(bulkPrintSku);
                const pages = Math.max(1, Math.ceil(selectedCount / labelsPerSheet));
                return `${selectedCount} labels selected • ${labelsPerSheet} per sheet (${bulkPrintSku}) • ${pages} page${pages === 1 ? '' : 's'}`;
              })()}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsBulkPrintDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={async () => {
                await handleBulkPrint();
                setIsBulkPrintDialogOpen(false);
              }}
            >
              Open Preview
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}