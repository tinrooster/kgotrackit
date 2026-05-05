import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChevronDown, Copy, Download, FileSpreadsheet, Save, Sparkles, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/use-toast';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { InventoryItem } from '@/types/inventory';
import {
  getSettings,
  SETTINGS_UPDATED_EVENT,
  STORAGE_KEYS,
  CUSTOM_REPORT_DEFINITIONS_UPDATED_EVENT,
} from '@/lib/storageService';
import { requestCloudSync } from '@/lib/cloudSyncEvents';
import * as XLSX from 'xlsx';
import { logger } from '@/lib/logging';
import { useAuth } from '@/contexts/AuthContext';
import { resolveLocationDisplay } from '@/lib/resolveLocationLabel';
import { resolveProjectDisplay } from '@/lib/projectOptions';

type BuiltInReportId =
  | 'asset-availability'
  | 'lifecycle'
  | 'decommissioning'
  | 'project-budget'
  | 'expense-allocation'
  | 'expendables-restock';

interface ReportDefinition {
  id: string;
  name: string;
  columns: string[];
  kind: 'built-in' | 'custom';
}

const USER_REPORT_COLUMN_OPTIONS = [
  'recordId',
  'assetId',
  'name',
  'assetStatus',
  'category',
  'location',
  'project',
  'quantity',
  'unit',
  'costPerUnit',
  'totalValue',
  'expenseTypeCode',
  'costCenterCode',
  'supplier',
  'cabinet',
  'assetTrackingMode',
  'rackLocation',
  'cableColor',
  'fiberMode',
  'connectorType',
  'cableLotNumber',
  'decomEOLDate',
  'decomCutoverDate',
  'decomNotes',
];

const BUILT_IN_REPORTS: ReportDefinition[] = [
  { id: 'asset-availability', name: 'Asset Availability', columns: ['recordId', 'assetId', 'name', 'assetStatus', 'location', 'project', 'quantity', 'expenseTypeCode', 'costCenterCode'], kind: 'built-in' },
  { id: 'lifecycle', name: 'Lifecycle Status Summary', columns: ['assetStatus', 'quantity', 'project', 'location'], kind: 'built-in' },
  {
    id: 'decommissioning',
    name: 'Decommissioning & cut-over',
    columns: [
      'recordId',
      'assetId',
      'name',
      'assetStatus',
      'location',
      'rackLocation',
      'decomEOLDate',
      'decomCutoverDate',
      'decomNotes',
      'project',
    ],
    kind: 'built-in',
  },
  { id: 'project-budget', name: 'Project Budget', columns: ['project', 'name', 'quantity', 'costPerUnit', 'totalValue', 'expenseTypeCode', 'costCenterCode'], kind: 'built-in' },
  { id: 'expense-allocation', name: 'Expense Allocation', columns: ['expenseTypeCode', 'costCenterCode', 'name', 'quantity', 'costPerUnit', 'totalValue', 'project'], kind: 'built-in' },
  { id: 'expendables-restock', name: 'Expendables Restock', columns: ['recordId', 'assetId', 'name', 'quantity', 'minQuantity', 'restockRequired', 'recommendedTopUp', 'unit', 'location', 'expenseTypeCode'], kind: 'built-in' },
];

export default function ReportsPage() {
  const [items, setItems] = useLocalStorage<InventoryItem[]>('inventoryItems', []);
  const { currentUser } = useAuth();
  const { toast } = useToast();
  const [projectFilter, setProjectFilter] = useState('all');
  const [locationFilter, setLocationFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [expenseTypeFilter, setExpenseTypeFilter] = useState('all');
  const [expenseTypeCodes, setExpenseTypeCodes] = useState<string[]>([]);
  const [customReports, setCustomReports] = useState<ReportDefinition[]>([]);
  const [customReportsHydrated, setCustomReportsHydrated] = useState(false);
  const [selectedReportId, setSelectedReportId] = useState<string>(BUILT_IN_REPORTS[0].id);
  const [customName, setCustomName] = useState('Custom Production Report');
  const [customColumns, setCustomColumns] = useState<string[]>(['recordId', 'assetId', 'name', 'project', 'location', 'expenseTypeCode', 'costCenterCode', 'quantity']);
  const [defineCustomReportOpen, setDefineCustomReportOpen] = useState(false);
  const [aiSummaryText, setAiSummaryText] = useState('');
  const [aiSummaryMode, setAiSummaryMode] = useState<'executive' | 'operations'>('operations');
  const defineCustomReportCardRef = useRef<HTMLDivElement>(null);

  const allReports = useMemo(() => [...BUILT_IN_REPORTS, ...customReports], [customReports]);
  const selectedReport = useMemo(
    () => allReports.find((report) => report.id === selectedReportId) || BUILT_IN_REPORTS[0],
    [allReports, selectedReportId]
  );

  useEffect(() => {
    const loadCustomReportsFromStorage = () => {
      try {
        const raw = localStorage.getItem(STORAGE_KEYS.CUSTOM_REPORT_DEFINITIONS);
        const parsed = raw ? (JSON.parse(raw) as ReportDefinition[]) : [];
        setCustomReports(Array.isArray(parsed) ? parsed : []);
      } catch {
        setCustomReports([]);
      }
    };

    loadCustomReportsFromStorage();
    setCustomReportsHydrated(true);

    const onCustomDefinitionsUpdated = (event: Event) => {
      const detail = (event as CustomEvent<ReportDefinition[]>).detail;
      if (Array.isArray(detail)) {
        setCustomReports(detail);
      } else {
        loadCustomReportsFromStorage();
      }
    };

    window.addEventListener(CUSTOM_REPORT_DEFINITIONS_UPDATED_EVENT, onCustomDefinitionsUpdated);
    window.addEventListener('focus', loadCustomReportsFromStorage);
    return () => {
      window.removeEventListener(CUSTOM_REPORT_DEFINITIONS_UPDATED_EVENT, onCustomDefinitionsUpdated);
      window.removeEventListener('focus', loadCustomReportsFromStorage);
    };
  }, []);

  useEffect(() => {
    if (!customReportsHydrated) return;
    try {
      localStorage.setItem(STORAGE_KEYS.CUSTOM_REPORT_DEFINITIONS, JSON.stringify(customReports));
    } catch {
      // quota / private mode
    }
    requestCloudSync();
  }, [customReports, customReportsHydrated]);

  useEffect(() => {
    const refreshItems = () => {
      const storedItemsRaw = localStorage.getItem('inventoryItems');
      const storedItems = storedItemsRaw ? JSON.parse(storedItemsRaw) : [];
      setItems(storedItems);
      const settings = getSettings();
      const fromSettings = (settings.expenseCodes || []).map((entry) => entry.name);
      const fromItems = Array.from(new Set(storedItems.map((item: InventoryItem) => item.expenseTypeCode || 'N/A')));
      setExpenseTypeCodes(Array.from(new Set([...fromSettings, ...fromItems])));
    };

    refreshItems();
    window.addEventListener(SETTINGS_UPDATED_EVENT, refreshItems);
    window.addEventListener('focus', refreshItems);
    return () => {
      window.removeEventListener(SETTINGS_UPDATED_EVENT, refreshItems);
      window.removeEventListener('focus', refreshItems);
    };
  }, [setItems]);

  const projectFilterOptions = useMemo(() => {
    const settings = getSettings();
    const projRows = settings.projects || [];
    const labels = items.map((item) => resolveProjectDisplay(item.project, projRows));
    return Array.from(new Set(labels)).sort();
  }, [items]);

  const locationFilterOptions = useMemo(() => {
    const settings = getSettings();
    const locRows = settings.locations || [];
    const labels = items.map((item) => {
      if (!item.location?.trim()) return 'Unassigned';
      const label = resolveLocationDisplay(item.location, locRows);
      return label === '-' ? 'Unassigned' : label;
    });
    return Array.from(new Set(labels)).sort();
  }, [items]);

  useEffect(() => {
    if (projectFilter !== 'all' && !projectFilterOptions.includes(projectFilter)) {
      setProjectFilter('all');
    }
  }, [projectFilter, projectFilterOptions]);

  useEffect(() => {
    if (locationFilter !== 'all' && !locationFilterOptions.includes(locationFilter)) {
      setLocationFilter('all');
    }
  }, [locationFilter, locationFilterOptions]);

  const filteredItems = useMemo(() => {
    const settings = getSettings();
    const locRows = settings.locations || [];
    const projRows = settings.projects || [];
    return items.filter((item) => {
      const projectLabel = resolveProjectDisplay(item.project, projRows);
      const locationLabel = item.location?.trim()
        ? resolveLocationDisplay(item.location, locRows)
        : 'Unassigned';
      const locationNorm = locationLabel === '-' ? 'Unassigned' : locationLabel;
      const matchesProject = projectFilter === 'all' || projectLabel === projectFilter;
      const matchesLocation = locationFilter === 'all' || locationNorm === locationFilter;
      const matchesStatus = statusFilter === 'all' || (item.assetStatus || 'other') === statusFilter;
      const matchesExpenseType = expenseTypeFilter === 'all' || (item.expenseTypeCode || 'N/A') === expenseTypeFilter;
      return matchesProject && matchesLocation && matchesStatus && matchesExpenseType;
    });
  }, [items, projectFilter, locationFilter, statusFilter, expenseTypeFilter]);

  useEffect(() => {
    setAiSummaryText('');
  }, [selectedReportId, projectFilter, locationFilter, statusFilter, expenseTypeFilter]);

  const toReportRows = (columns: string[]) =>
    filteredItems.map((item) =>
      columns.reduce((acc, column) => {
        const totalValue = (item.quantity || 0) * (item.costPerUnit || 0);
        const restockRequired = (item.quantity || 0) <= (item.minQuantity || 0) ? 'Yes' : 'No';
        const recommendedTopUp = restockRequired === 'Yes' ? Math.max((item.minQuantity || 0) * 2 - (item.quantity || 0), 0) : 0;

        const values: Record<string, unknown> = {
          ...item,
          recordId: item.recordId ?? '',
          assetId: item.assetId ?? '',
          totalValue,
          restockRequired,
          recommendedTopUp,
          expenseTypeCode: item.expenseTypeCode || 'N/A',
          costCenterCode: item.costCenterCode || 'N/A',
        };
        acc[column] = values[column] ?? '';
        return acc;
      }, {} as Record<string, unknown>)
    );

  const previewRows = useMemo(() => toReportRows(selectedReport.columns).slice(0, 8), [selectedReport, filteredItems]);

  const generateCSV = (data: Record<string, unknown>[], headers: string[], filename: string) => {
    const csvContent = [
      headers.join(','),
      ...data.map((row) => headers.map((header) => JSON.stringify(row[header] || '')).join(',')),
    ].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
    toast({ title: 'Report Generated', description: `${filename} has been downloaded.` });
  };

  const runSelectedReport = () => {
    const startTime = performance.now();
    const rows = toReportRows(selectedReport.columns);
    const filename = `${selectedReport.name.replace(/\s+/g, '_').toLowerCase()}.csv`;
    generateCSV(rows, selectedReport.columns, filename);
    logger.info(
      'performance',
      'REPORT_EXPORT_CSV_COMPLETED',
      {
        reportId: selectedReport.id,
        reportName: selectedReport.name,
        rowCount: rows.length,
        durationMs: Math.round(performance.now() - startTime),
        user: currentUser?.username || 'Unknown',
      },
      'ReportsPage'
    );
  };

  const exportSelectedReportExcel = () => {
    const startTime = performance.now();
    const rows = toReportRows(selectedReport.columns);
    const workbook = XLSX.utils.book_new();
    const detailRows = rows.map((row) => {
      const normalizedRow = { ...row } as Record<string, unknown>;
      const quantity = Number(normalizedRow.quantity || 0);
      const minQuantity = Number(normalizedRow.minQuantity || 0);
      const totalValue = Number(normalizedRow.totalValue || 0);
      normalizedRow.riskBand = quantity <= minQuantity ? 'Restock Needed' : totalValue > 10000 ? 'High Value' : 'Normal';
      return normalizedRow;
    });
    const detailHeaders = [...selectedReport.columns, 'riskBand'];
    const detailSheet = XLSX.utils.json_to_sheet(detailRows, { header: detailHeaders });

    detailSheet['!cols'] = detailHeaders.map((column) => ({
      wch: Math.max(column.length + 2, 16),
    }));
    detailSheet['!autofilter'] = { ref: `A1:${XLSX.utils.encode_col(detailHeaders.length - 1)}1` };

    const quantityIndex = detailHeaders.indexOf('quantity');
    const costIndex = detailHeaders.indexOf('costPerUnit');
    const totalValueIndex = detailHeaders.indexOf('totalValue');
    if (quantityIndex >= 0 && costIndex >= 0 && totalValueIndex >= 0) {
      for (let rowIndex = 2; rowIndex <= detailRows.length + 1; rowIndex++) {
        const quantityCell = `${XLSX.utils.encode_col(quantityIndex)}${rowIndex}`;
        const costCell = `${XLSX.utils.encode_col(costIndex)}${rowIndex}`;
        const totalCell = `${XLSX.utils.encode_col(totalValueIndex)}${rowIndex}`;
        detailSheet[totalCell] = { t: 'n', f: `${quantityCell}*${costCell}` };
      }
    }

    const totalsRow = detailRows.length + 2;
    detailHeaders.forEach((column, index) => {
      const cell = `${XLSX.utils.encode_col(index)}${totalsRow}`;
      if (index === 0) {
        detailSheet[cell] = { t: 's', v: 'TOTALS' };
        return;
      }
      if (['quantity', 'costPerUnit', 'totalValue', 'recommendedTopUp', 'minQuantity'].includes(column)) {
        const start = `${XLSX.utils.encode_col(index)}2`;
        const end = `${XLSX.utils.encode_col(index)}${detailRows.length + 1}`;
        detailSheet[cell] = { t: 'n', f: `SUM(${start}:${end})` };
      }
    });

    const buildSummarySheet = (groupKey: 'project' | 'location' | 'costCenterCode', sheetName: string) => {
      const grouped = filteredItems.reduce((acc, item) => {
        const key = String(item[groupKey] || 'Unassigned');
        if (!acc[key]) {
          acc[key] = { group: key, lineItems: 0, totalQuantity: 0, totalValue: 0, lowStockItems: 0 };
        }
        const quantity = Number(item.quantity || 0);
        const minQuantity = Number(item.minQuantity || 0);
        const totalValue = quantity * Number(item.costPerUnit || 0);
        acc[key].lineItems += 1;
        acc[key].totalQuantity += quantity;
        acc[key].totalValue += totalValue;
        if (quantity <= minQuantity) acc[key].lowStockItems += 1;
        return acc;
      }, {} as Record<string, { group: string; lineItems: number; totalQuantity: number; totalValue: number; lowStockItems: number }>);

      const summaryRows = Object.values(grouped).sort((a, b) => b.totalValue - a.totalValue);
      const summarySheet = XLSX.utils.json_to_sheet(summaryRows, { header: ['group', 'lineItems', 'totalQuantity', 'totalValue', 'lowStockItems'] });
      summarySheet['!cols'] = [
        { wch: 28 },
        { wch: 12 },
        { wch: 14 },
        { wch: 14 },
        { wch: 14 },
      ];
      summarySheet['!autofilter'] = { ref: 'A1:E1' };
      XLSX.utils.book_append_sheet(workbook, summarySheet, sheetName);
    };

    const conditionalGuideSheet = XLSX.utils.aoa_to_sheet([
      ['Conditional Formatting Guide'],
      ['Use Excel conditional formatting on the Detail sheet:'],
      ['1) Format rows where riskBand = "Restock Needed" with orange fill.'],
      ['2) Format rows where riskBand = "High Value" with blue fill.'],
      ['3) Use data bars on totalValue in summary sheets for quick project/cost center/location comparison.'],
    ]);
    conditionalGuideSheet['!cols'] = [{ wch: 92 }];

    XLSX.utils.book_append_sheet(workbook, detailSheet, 'Detail');
    buildSummarySheet('project', 'Summary_Project');
    buildSummarySheet('costCenterCode', 'Summary_CostCenter');
    buildSummarySheet('location', 'Summary_Location');
    XLSX.utils.book_append_sheet(workbook, conditionalGuideSheet, 'Formatting_Guide');

    const filename = `${selectedReport.name.replace(/\s+/g, '_').toLowerCase()}.xlsx`;
    XLSX.writeFile(workbook, filename);
    logger.info(
      'performance',
      'REPORT_EXPORT_EXCEL_COMPLETED',
      {
        reportId: selectedReport.id,
        reportName: selectedReport.name,
        rowCount: rows.length,
        durationMs: Math.round(performance.now() - startTime),
        user: currentUser?.username || 'Unknown',
      },
      'ReportsPage'
    );
    toast({ title: 'Excel report generated', description: `${filename} has been downloaded.` });
  };

  const toggleCustomColumn = (column: string) => {
    setCustomColumns((prev) => (prev.includes(column) ? prev.filter((entry) => entry !== column) : [...prev, column]));
  };

  const generateInventoryAiSummary = () => {
    if (filteredItems.length === 0) {
      setAiSummaryText('No inventory items match the current filters, so there is nothing to summarize.');
      return;
    }

    const totalItems = filteredItems.length;
    const totalQuantity = filteredItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    const totalValue = filteredItems.reduce(
      (sum, item) => sum + Number(item.quantity || 0) * Number(item.costPerUnit || 0),
      0
    );
    const decommissioning = filteredItems.filter((item) =>
      ['ready_decommission', 'slated_removal', 'cut_over_pending', 'ewaste'].includes(String(item.assetStatus || ''))
    );
    const unassignedProjectCount = filteredItems.filter((item) => !String(item.project || '').trim()).length;
    const unassignedLocationCount = filteredItems.filter((item) => !String(item.location || '').trim()).length;

    const byCategory = filteredItems.reduce((acc, item) => {
      const key = item.category || 'Uncategorized';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    const byLocation = filteredItems.reduce((acc, item) => {
      const key = item.location || 'Unassigned';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    const byProjectValue = filteredItems.reduce((acc, item) => {
      const key = item.project || 'Unassigned';
      const value = Number(item.quantity || 0) * Number(item.costPerUnit || 0);
      acc[key] = (acc[key] || 0) + value;
      return acc;
    }, {} as Record<string, number>);
    const byExpenseTypeValue = filteredItems.reduce((acc, item) => {
      const key = item.expenseTypeCode || 'N/A';
      const value = Number(item.quantity || 0) * Number(item.costPerUnit || 0);
      acc[key] = (acc[key] || 0) + value;
      return acc;
    }, {} as Record<string, number>);
    const byCostCenterValue = filteredItems.reduce((acc, item) => {
      const key = item.costCenterCode || 'N/A';
      const value = Number(item.quantity || 0) * Number(item.costPerUnit || 0);
      acc[key] = (acc[key] || 0) + value;
      return acc;
    }, {} as Record<string, number>);
    const upcomingCutover = filteredItems
      .filter((item) => !!item.decomCutoverDate)
      .sort((a, b) => String(a.decomCutoverDate || '').localeCompare(String(b.decomCutoverDate || '')))
      .slice(0, 3);
    const upcomingEol = filteredItems
      .filter((item) => !!item.decomEOLDate)
      .sort((a, b) => String(a.decomEOLDate || '').localeCompare(String(b.decomEOLDate || '')))
      .slice(0, 3);
    const topCategory = Object.entries(byCategory).sort((a, b) => b[1] - a[1])[0];
    const topLocation = Object.entries(byLocation).sort((a, b) => b[1] - a[1])[0];
    const topProjectValue = Object.entries(byProjectValue).sort((a, b) => b[1] - a[1])[0];
    const topExpenseTypeValue = Object.entries(byExpenseTypeValue).sort((a, b) => b[1] - a[1])[0];
    const topCostCenterValue = Object.entries(byCostCenterValue).sort((a, b) => b[1] - a[1])[0];

    const highestValueItems = [...filteredItems]
      .map((item) => ({
        name: item.name || 'Unnamed item',
        value: Number(item.quantity || 0) * Number(item.costPerUnit || 0),
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 3)
      .filter((entry) => entry.value > 0);

    const filtersApplied = [
      projectFilter !== 'all' ? `Project: ${projectFilter}` : null,
      locationFilter !== 'all' ? `Location: ${locationFilter}` : null,
      statusFilter !== 'all' ? `Status: ${statusFilter}` : null,
      expenseTypeFilter !== 'all' ? `Expense type: ${expenseTypeFilter}` : null,
    ].filter(Boolean) as string[];

    if (aiSummaryMode === 'executive') {
      const executiveBullets = [
        `Scope: ${totalItems} line items, ${totalQuantity.toLocaleString()} units, ${totalValue.toLocaleString(undefined, { style: 'currency', currency: 'USD' })} estimated value${filtersApplied.length > 0 ? ` (${filtersApplied.join(' | ')})` : ''}.`,
        topProjectValue
          ? `Budget focus: highest project concentration is ${topProjectValue[0]} at ${topProjectValue[1].toLocaleString(undefined, { style: 'currency', currency: 'USD' })}; top expense type is ${topExpenseTypeValue?.[0] ?? 'N/A'} and top cost center is ${topCostCenterValue?.[0] ?? 'N/A'}.`
          : 'Budget focus: value concentration by project/expense/cost center is not available.',
        decommissioning.length > 0 || upcomingCutover.length > 0 || upcomingEol.length > 0
          ? `Lifecycle watch: ${decommissioning.length} decommissioning-status items; next cutovers ${upcomingCutover.map((item) => `${item.name} (${item.decomCutoverDate})`).join(' · ') || 'none'}; next EOL ${upcomingEol.map((item) => `${item.name} (${item.decomEOLDate})`).join(' · ') || 'none'}.`
          : 'Lifecycle watch: no decommissioning/cutover/EOL schedule pressure in current scope.',
        unassignedProjectCount > 0 || unassignedLocationCount > 0
          ? `Data quality: ${unassignedProjectCount} items missing project and ${unassignedLocationCount} missing location assignment.`
          : 'Data quality: project and location assignments are complete in this scope.',
        highestValueItems.length > 0
          ? `Top budget drivers: ${highestValueItems
              .map((entry) => `${entry.name} (${entry.value.toLocaleString(undefined, { style: 'currency', currency: 'USD' })})`)
              .join(' · ')}.`
          : 'Top budget drivers: no costed items in this scope.',
        'Location, project, and coding mismatches require manual reconciliation through Data Management and list maintenance workflows.',
      ];
      setAiSummaryText(executiveBullets.map((line) => `• ${line}`).join('\n'));
      return;
    }

    const operationsNarrative = [
      `Inventory summary (${new Date().toLocaleString()}):`,
      filtersApplied.length > 0 ? `Filters applied: ${filtersApplied.join(' | ')}` : 'Filters applied: none (full inventory scope).',
      `This view contains ${totalItems} line items totaling ${totalQuantity.toLocaleString()} units and an estimated value of ${totalValue.toLocaleString(undefined, { style: 'currency', currency: 'USD' })}.`,
      topCategory ? `Largest category concentration: ${topCategory[0]} (${topCategory[1]} items).` : 'Largest category concentration: not available.',
      topLocation ? `Highest location concentration: ${topLocation[0]} (${topLocation[1]} items).` : 'Highest location concentration: not available.',
      topProjectValue
        ? `Highest project value concentration: ${topProjectValue[0]} (${topProjectValue[1].toLocaleString(undefined, { style: 'currency', currency: 'USD' })}).`
        : 'Project value concentration: not available.',
      topExpenseTypeValue
        ? `Top expense type allocation: ${topExpenseTypeValue[0]} (${topExpenseTypeValue[1].toLocaleString(undefined, { style: 'currency', currency: 'USD' })}).`
        : 'Expense type allocation: not available.',
      topCostCenterValue
        ? `Top cost center allocation: ${topCostCenterValue[0]} (${topCostCenterValue[1].toLocaleString(undefined, { style: 'currency', currency: 'USD' })}).`
        : 'Cost center allocation: not available.',
      unassignedProjectCount > 0 || unassignedLocationCount > 0
        ? `Data completeness watch: ${unassignedProjectCount} item(s) without project and ${unassignedLocationCount} item(s) without location assignment.`
        : 'Data completeness watch: all items include project and location assignment.',
      decommissioning.length > 0
        ? `${decommissioning.length} items are in decommissioning-related states and should be reviewed for cut-over/removal planning.`
        : 'No items are currently flagged in decommissioning-related states.',
      upcomingCutover.length > 0
        ? `Upcoming cutover dates: ${upcomingCutover
            .map((item) => `${item.name} (${item.decomCutoverDate})`)
            .join(' · ')}.`
        : 'Upcoming cutover dates: none currently scheduled.',
      upcomingEol.length > 0
        ? `Upcoming EOL dates: ${upcomingEol
            .map((item) => `${item.name} (${item.decomEOLDate})`)
            .join(' · ')}.`
        : 'Upcoming EOL dates: none currently set.',
      highestValueItems.length > 0
        ? `Top budget concentration: ${highestValueItems
            .map((entry) => `${entry.name} (${entry.value.toLocaleString(undefined, { style: 'currency', currency: 'USD' })})`)
            .join(' · ')}.`
        : 'Top budget concentration: no costed items in current view.',
      'Location, project, and coding mismatches require manual reconciliation through Data Management and list maintenance workflows.',
    ].join('\n');

    setAiSummaryText(operationsNarrative);
  };

  const copyAiSummary = async () => {
    if (!aiSummaryText.trim()) return;
    try {
      await navigator.clipboard.writeText(aiSummaryText);
      toast({ title: 'Summary copied', description: 'Inventory summary copied to clipboard.' });
    } catch {
      toast({ title: 'Copy failed', description: 'Could not copy summary to clipboard.', variant: 'destructive' });
    }
  };

  const saveCustomReport = () => {
    const trimmedName = customName.trim();
    if (!trimmedName) {
      toast({ title: 'Missing name', description: 'Enter a report name before saving.' });
      return;
    }
    if (customColumns.length === 0) {
      toast({ title: 'No columns selected', description: 'Select at least one column.' });
      return;
    }

    const next: ReportDefinition = {
      id: `custom-${crypto.randomUUID()}`,
      name: trimmedName,
      columns: customColumns,
      kind: 'custom',
    };
    const updated = [...customReports, next];
    setCustomReports(updated);
    setSelectedReportId(next.id);
    logger.info(
      'security',
      'CUSTOM_REPORT_SAVED',
      {
        reportId: next.id,
        reportName: next.name,
        columnCount: next.columns.length,
        user: currentUser?.username || 'Unknown',
      },
      'ReportsPage'
    );
    toast({ title: 'Custom report saved', description: `"${trimmedName}" is now available in Report Type.` });
  };

  const deleteSelectedCustomReport = () => {
    if (selectedReport.kind !== 'custom') return;
    const next = customReports.filter((report) => report.id !== selectedReport.id);
    setCustomReports(next);
    setSelectedReportId(BUILT_IN_REPORTS[0].id);
    logger.info(
      'security',
      'CUSTOM_REPORT_DELETED',
      {
        reportId: selectedReport.id,
        reportName: selectedReport.name,
        user: currentUser?.username || 'Unknown',
      },
      'ReportsPage'
    );
    toast({ title: 'Custom report deleted', description: `"${selectedReport.name}" has been removed.` });
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Reports</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Report Filters</CardTitle>
          <CardDescription>Apply filters before generating reports.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-4">
          <div className="space-y-2">
            <Label>Project</Label>
            <Select value={projectFilter} onValueChange={setProjectFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Projects</SelectItem>
                {projectFilterOptions.map((project) => (
                  <SelectItem key={project} value={project}>
                    {project}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Location</Label>
            <Select value={locationFilter} onValueChange={setLocationFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Locations</SelectItem>
                {locationFilterOptions.map((location) => (
                  <SelectItem key={location} value={location}>
                    {location}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Asset Status</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="hot_spare">Hot Spare</SelectItem>
                <SelectItem value="cold_spare">Cold Spare</SelectItem>
                <SelectItem value="in_service">In Service</SelectItem>
                <SelectItem value="ready_decommission">Ready to Decommission</SelectItem>
                <SelectItem value="slated_removal">Slated for Removal</SelectItem>
                <SelectItem value="cut_over_pending">Cut-over pending</SelectItem>
                <SelectItem value="ewaste">E-Waste</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Expense Type Code</Label>
            <Select value={expenseTypeFilter} onValueChange={setExpenseTypeFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Expense Types</SelectItem>
                {expenseTypeCodes.map((code) => <SelectItem key={code} value={code}>{code}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Report Runner</CardTitle>
          <CardDescription>Select a report type and preview/export it.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-[2fr_auto] md:items-end">
            <div className="space-y-2">
              <Label>Report Type</Label>
              <Select value={selectedReportId} onValueChange={setSelectedReportId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {allReports.map((report) => (
                    <SelectItem key={report.id} value={report.id}>
                      {report.name} {report.kind === 'custom' ? '(Custom)' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={runSelectedReport}>
                <Download className="mr-2 h-4 w-4" />
                Export CSV
              </Button>
              <Button size="sm" variant="outline" onClick={exportSelectedReportExcel}>
                <FileSpreadsheet className="mr-2 h-4 w-4" />
                Export Excel
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  setDefineCustomReportOpen(true);
                  requestAnimationFrame(() => {
                    defineCustomReportCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                  });
                }}
              >
                <Save className="mr-2 h-4 w-4" />
                Define / save custom…
              </Button>
              {selectedReport.kind === 'custom' && (
                <Button size="sm" variant="outline" onClick={deleteSelectedCustomReport}>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </Button>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Preview</Label>
            <div className="max-h-72 overflow-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr>
                    {selectedReport.columns.map((column) => (
                      <th key={column} className="px-2 py-1 text-left font-medium">{column}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row, index) => (
                    <tr key={index} className="border-t">
                      {selectedReport.columns.map((column) => (
                        <td key={column} className="px-2 py-1">{String(row[column] ?? '')}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            Inventory Summary
          </CardTitle>
          <CardDescription>Generate a narrative summary from the currently filtered inventory set.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Label className="mr-1 text-xs text-muted-foreground">Mode</Label>
            <Button
              type="button"
              size="sm"
              variant={aiSummaryMode === 'executive' ? 'default' : 'outline'}
              onClick={() => setAiSummaryMode('executive')}
            >
              Executive
            </Button>
            <Button
              type="button"
              size="sm"
              variant={aiSummaryMode === 'operations' ? 'default' : 'outline'}
              onClick={() => setAiSummaryMode('operations')}
            >
              Operations
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" onClick={generateInventoryAiSummary}>
              <Sparkles className="mr-2 h-4 w-4" />
              Generate summary
            </Button>
            <Button type="button" size="sm" variant="outline" disabled={!aiSummaryText} onClick={() => void copyAiSummary()}>
              <Copy className="mr-2 h-4 w-4" />
              Copy summary
            </Button>
          </div>
          {aiSummaryText ? (
            <pre className="whitespace-pre-wrap rounded-md border border-border bg-muted/25 p-3 text-sm">{aiSummaryText}</pre>
          ) : (
            <p className="text-sm text-muted-foreground">No summary generated yet.</p>
          )}
        </CardContent>
      </Card>

      <Card ref={defineCustomReportCardRef}>
        <CardHeader
          className="cursor-pointer select-none rounded-t-lg hover:bg-muted/40"
          role="button"
          tabIndex={0}
          aria-expanded={defineCustomReportOpen}
          onClick={() => setDefineCustomReportOpen((open) => !open)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              setDefineCustomReportOpen((open) => !open);
            }
          }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1.5">
              <CardTitle>Define Custom Report</CardTitle>
              <CardDescription>
                Name, pick columns, then save — or use <strong className="text-foreground">Define / save custom…</strong>{' '}
                in Report Runner above. Saved reports sync to the cloud when you are signed in.
              </CardDescription>
            </div>
            <ChevronDown
              className={cn(
                'mt-0.5 h-5 w-5 shrink-0 text-muted-foreground transition-transform',
                defineCustomReportOpen && 'rotate-180'
              )}
              aria-hidden
            />
          </div>
        </CardHeader>
        {defineCustomReportOpen ? (
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Custom Report Name</Label>
              <Input value={customName} onChange={(event) => setCustomName(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Columns</Label>
              <div className="flex flex-wrap gap-2">
                {USER_REPORT_COLUMN_OPTIONS.map((column) => (
                  <Button
                    key={column}
                    type="button"
                    size="sm"
                    variant={customColumns.includes(column) ? 'default' : 'outline'}
                    onClick={() => toggleCustomColumn(column)}
                  >
                    {column}
                  </Button>
                ))}
              </div>
            </div>
            <Button size="sm" onClick={saveCustomReport}>
              <Save className="mr-2 h-4 w-4" />
              Save Custom Report
            </Button>
          </CardContent>
        ) : null}
      </Card>
    </div>
  );
}
