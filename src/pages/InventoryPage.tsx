import { useState, useEffect, useMemo } from 'react';
import type { FC } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { useAuth } from '@/contexts/AuthContext';
import { InventoryItem, CategoryNode, ItemWithSubcategories } from '@/types/inventory';
import BatchOperations from '@/components/BatchOperations';
import { v4 as uuidv4 } from 'uuid';
import { toast } from 'sonner';
import { getSettings, SETTINGS_UPDATED_EVENT } from '@/lib/storageService';
import { SettingsService } from '@/lib/settingsService';
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
  Printer
} from 'lucide-react';
import { AddItemDialog } from '@/components/AddItemDialog';
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
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDuplicateDialogOpen, setIsDuplicateDialogOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [originalEditItem, setOriginalEditItem] = useState<InventoryItem | null>(null);
  const [highlightedItemId, setHighlightedItemId] = useState<string | null>(null);
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
  const [printItem, setPrintItem] = useState<InventoryItem | null>(null);
  const [printLayout, setPrintLayout] = useState<'compact' | 'detailed'>('detailed');
  const [printCodeType, setPrintCodeType] = useState<'qr' | 'barcode' | 'both'>('both');
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

  // Get template from navigation state if available
  const template = location.state?.template as ItemTemplate | undefined;

  // Add sorting state
  const [sortField, setSortField] = useState<keyof InventoryItem>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const [updateTrigger, setUpdateTrigger] = useState(0);
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const resizeStateRef = React.useRef<{ column: string; startX: number; startWidth: number } | null>(null);

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

    const assetIdentifier = escapeHtml(item.assetId || item.id);
    const assetIdentifierRange = item.assetTagEnd
      ? `${assetIdentifier} - ${escapeHtml(item.assetTagEnd)}`
      : assetIdentifier;
    const safeName = escapeHtml(item.name || '');
    const safeCategory = escapeHtml(item.category || '-');
    const safeLocation = escapeHtml(item.location || '-');
    const defaults = SettingsService.loadDefaultSettings();
    const safeCodeMode = escapeHtml((defaults.assetCodeMode || 'both').toUpperCase());
    const encodedValue = item.assetId || item.id;

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
        <div style="font-size: 11px; margin-bottom: 8px;">ID: <strong>${assetIdentifierRange}</strong></div>
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
        <div style="font-size: 14px; margin-top: 8px;">Asset ID: <strong>${assetIdentifierRange}</strong></div>
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
        const assetIdValue = escapeHtml(item.assetId || item.id);
        const itemName = escapeHtml(item.name || '');
        let qrMarkup = '';
        let barcodeMarkup = '';

        if (bulkPrintCodeType === 'qr' || bulkPrintCodeType === 'both') {
          const qrDataUrl = await QRCode.toDataURL(item.assetId || item.id, { margin: 0, width: 72 });
          qrMarkup = `<img src="${qrDataUrl}" alt="QR code" style="width: 0.6in; height: 0.6in;" />`;
        }
        if (bulkPrintCodeType === 'barcode' || bulkPrintCodeType === 'both') {
          const barcodeTarget = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
          JsBarcode(barcodeTarget, item.assetId || item.id, {
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
              border: 1px dashed #d1d5db; border-radius: 4px; padding: 4px;
              display: flex; flex-direction: column; justify-content: center;
              overflow: hidden;
            }
            .label-title {
              font-size: 11px; font-weight: 700; line-height: 1.2;
              white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
            }
            .label-id { margin-top: 6px; font-size: 10px; font-family: "Courier New", monospace; }
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

  const generateAssetIds = (quantity: number, trackingMode: 'line_item' | 'per_unit') => {
    const defaults = SettingsService.loadDefaultSettings();
    const prefix = (defaults.assetIdPrefix || 'AST').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const sequenceStart = (defaults.assetIdSequence || 0) + 1;
    const count = trackingMode === 'per_unit' ? Math.max(quantity, 1) : 1;
    const startId = `${prefix}-${String(sequenceStart).padStart(5, '0')}`;
    const endId = `${prefix}-${String(sequenceStart + count - 1).padStart(5, '0')}`;

    SettingsService.saveDefaultSettings({
      ...defaults,
      assetIdSequence: sequenceStart + count - 1,
    });

    return { startId, endId: count > 1 ? endId : undefined };
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
        item.category,
        item.location,
        item.project,
        item.notes
      ].map(field => field?.toLowerCase() || '');

      const matchesSearch = !searchQuery || 
        searchFields.some(field => field.includes(searchQuery.toLowerCase()));
      
      const matchesCategory = !selectedCategory || item.category === selectedCategory;
      const matchesLocation = !selectedLocation || item.location === selectedLocation;
      const matchesProject = !selectedProject || item.project === selectedProject;

      return matchesSearch && matchesCategory && matchesLocation && matchesProject;
    });

    // Sort the filtered items
    return [...filtered].sort((a, b) => {
      const aValue = a[sortField];
      const bValue = b[sortField];
      
      if (aValue === bValue) return 0;
      if (aValue === null || aValue === undefined) return 1;
      if (bValue === null || bValue === undefined) return -1;
      
      const comparison = String(aValue).localeCompare(String(bValue));
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [items, searchQuery, selectedCategory, selectedLocation, selectedProject, sortField, sortDirection]);

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
      const updatedItems = items.filter(item => item.id !== itemToDelete.id);
      saveItems(updatedItems);
      setItems(updatedItems);
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

  // Handle adding a new item
  const handleAddItem = async (newItemData: Omit<InventoryItem, "id" | "lastUpdated">) => {
    const defaults = SettingsService.loadDefaultSettings();
    const trackingMode = (newItemData.assetTrackingMode || 'line_item') as 'line_item' | 'per_unit';
    const generatedIds = defaults.autoAssignAssetId
      ? generateAssetIds(newItemData.quantity || 1, trackingMode)
      : { startId: undefined, endId: undefined };
    const computedAssetId = defaults.autoAssignAssetId
      ? (newItemData.assetId?.trim() || generatedIds.startId)
      : (newItemData.assetId?.trim() || undefined);
    const selectedExpenseType = expenseTypes.find((entry) => entry.code === newItemData.expenseTypeCode);
    const selectedCostCenter = costCenters.find((entry) => entry.code === newItemData.costCenterCode);
    const newItem: InventoryItem = {
      ...newItemData,
      assetId: computedAssetId,
      assetTagEnd: newItemData.assetTagEnd || generatedIds.endId,
      assetTrackingMode: trackingMode,
      expenseTypeDescription: newItemData.expenseTypeDescription || selectedExpenseType?.description,
      costCenterDescription: newItemData.costCenterDescription || selectedCostCenter?.description,
      id: uuidv4(),
      lastUpdated: new Date(),
      lastModifiedBy: currentUser?.username || currentUser?.displayName || 'Unknown'
    };
    
    setItems([...items, newItem]);
    appendAuditLog('CREATE', newItem);
    setHighlightedItemId(newItem.id);
    toast.success(`Added "${newItem.name}" to inventory`);
    setIsAddDialogOpen(false); // Close the dialog after successful save
    return Promise.resolve();
  };

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
      const previousItem = originalEditItem || items.find((item) => item.id === updatedItem.id) || null;
      const updatedItems = items.map(item => 
        item.id === updatedItem.id ? { 
          ...updatedItem, 
          lastUpdated: new Date(),
          lastModifiedBy: currentUser?.username || currentUser?.displayName || 'Unknown'
        } : item
      );
      setItems(updatedItems);
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
    const newItem: InventoryItem = {
      ...newItemData,
      id: uuidv4(),
      lastUpdated: new Date(),
      lastModifiedBy: currentUser?.username || currentUser?.displayName || 'Unknown'
    } as InventoryItem;
    
    setItems([...items, newItem]);
    setHighlightedItemId(newItem.id);
    setIsDuplicateDialogOpen(false);
    toast.success(`Duplicated "${selectedItem?.name}" successfully`);
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
    // If we have a template from navigation, open the add dialog
    if (template) {
      setIsAddDialogOpen(true);
      // Clear the template from location state to prevent reopening
      navigate(location.pathname, { replace: true });
    }
  }, [template, navigate, location.pathname]);

  const [isDetailedView, setIsDetailedView] = useState(false);

  // Define column sets for different views
  const SIMPLE_COLUMNS = ['name', 'category', 'location', 'project', 'quantity', 'lastUpdated'];
  const DETAILED_COLUMNS = ['assetId', 'name', 'category', 'expenseTypeCode', 'costCenterCode', 'quantity', 'unit', 'costPerUnit', 'totalValue', 'location', 'project', 'lastUpdated'];

  const activeColumns = isDetailedView ? DETAILED_COLUMNS : SIMPLE_COLUMNS;

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
    <div className="mx-auto w-[clamp(75vw,calc(100vw-2rem),2400px)] max-w-none px-4 py-6 space-y-4 min-h-screen">
      <div className="sticky top-16 z-30 space-y-3 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 pb-2">
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center space-x-4">
          <h1 className="text-2xl font-bold">Inventory</h1>
          <div className="flex items-center space-x-2">
            <Input
              type="text"
              placeholder="Search inventory..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="min-w-[240px]"
            />
            <div className="flex items-center space-x-2">
              <Select value={selectedCategory || 'all'} onValueChange={(value) => handleFilterChange('category', value)}>
                <SelectTrigger className="min-w-[200px]">
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
                <SelectTrigger className="min-w-[200px]">
                  <SelectValue placeholder="All Locations" />
                </SelectTrigger>
                <SelectContent className="min-w-[200px]">
                  <SelectItem value="all">All Locations</SelectItem>
                  {locations.map(location => (
                    <React.Fragment key={location.id}>
                      <SelectItem value={location.name}>
                        {location.name}
                      </SelectItem>
                      {location.subcategories?.map(subcategory => (
                        <SelectItem key={`${location.name}/${subcategory}`} value={`${location.name}/${subcategory}`}>
                          {location.name} - {subcategory}
                        </SelectItem>
                      ))}
                    </React.Fragment>
                  ))}
                </SelectContent>
              </Select>
              <Select value={selectedProject || "all"} onValueChange={(value) => handleFilterChange('project', value === "all" ? "" : value)}>
                <SelectTrigger className="min-w-[200px]">
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
        </div>
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2 mr-4">
            <Switch
              id="view-mode"
              checked={isDetailedView}
              onCheckedChange={setIsDetailedView}
            />
            <Label htmlFor="view-mode" className="text-sm">
              {isDetailedView ? 'Detailed View' : 'Simple View'}
            </Label>
          </div>
          <Button onClick={() => setIsAddDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Item
          </Button>
        </div>
      </div>

      <div className="flex justify-between items-center mb-4">
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

      <div className="bg-card text-card-foreground rounded-lg border shadow-sm">
        <Table containerClassName="max-h-[calc(100vh-16rem)]">
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
                  <div className="flex items-center space-x-1 cursor-pointer pr-3" onClick={() => handleSort(column as keyof InventoryItem)}>
                    <span>{column.charAt(0).toUpperCase() + column.slice(1).replace(/([A-Z])/g, ' $1')}</span>
                    <ArrowUpDown className="h-4 w-4" />
                  </div>
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
        onOpenChange={setIsAddDialogOpen}
        onSubmit={handleAddItem}
        categories={categories}
        units={units}
        locations={locations}
        suppliers={suppliers}
        projects={projects}
        expenseTypes={expenseTypes}
        costCenters={costCenters}
        existingItems={items}
        selectedTemplate={template}
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
        <DialogContent className="sm:max-w-md">
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
        <DialogContent className="sm:max-w-md">
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