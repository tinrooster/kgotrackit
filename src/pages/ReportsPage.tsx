import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Download, Save, Trash2, FileSpreadsheet } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { InventoryItem } from '@/types/inventory';
import { getSettings, SETTINGS_UPDATED_EVENT } from '@/lib/storageService';
import * as XLSX from 'xlsx';
import { logger } from '@/lib/logging';
import { useAuth } from '@/contexts/AuthContext';

type BuiltInReportId =
  | 'asset-availability'
  | 'lifecycle'
  | 'project-budget'
  | 'expense-allocation'
  | 'expendables-restock';

interface ReportDefinition {
  id: string;
  name: string;
  columns: string[];
  kind: 'built-in' | 'custom';
}

const CUSTOM_REPORTS_KEY = 'inventory-custom-report-definitions';
const USER_REPORT_COLUMN_OPTIONS = [
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
];

const BUILT_IN_REPORTS: ReportDefinition[] = [
  { id: 'asset-availability', name: 'Asset Availability', columns: ['assetId', 'name', 'assetStatus', 'location', 'project', 'quantity', 'expenseTypeCode', 'costCenterCode'], kind: 'built-in' },
  { id: 'lifecycle', name: 'Lifecycle Status Summary', columns: ['assetStatus', 'quantity', 'project', 'location'], kind: 'built-in' },
  { id: 'project-budget', name: 'Project Budget', columns: ['project', 'name', 'quantity', 'costPerUnit', 'totalValue', 'expenseTypeCode', 'costCenterCode'], kind: 'built-in' },
  { id: 'expense-allocation', name: 'Expense Allocation', columns: ['expenseTypeCode', 'costCenterCode', 'name', 'quantity', 'costPerUnit', 'totalValue', 'project'], kind: 'built-in' },
  { id: 'expendables-restock', name: 'Expendables Restock', columns: ['assetId', 'name', 'quantity', 'minQuantity', 'restockRequired', 'recommendedTopUp', 'unit', 'location', 'expenseTypeCode'], kind: 'built-in' },
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
  const [customColumns, setCustomColumns] = useState<string[]>(['assetId', 'name', 'project', 'location', 'expenseTypeCode', 'costCenterCode', 'quantity']);

  const allReports = useMemo(() => [...BUILT_IN_REPORTS, ...customReports], [customReports]);
  const selectedReport = useMemo(
    () => allReports.find((report) => report.id === selectedReportId) || BUILT_IN_REPORTS[0],
    [allReports, selectedReportId]
  );

  useEffect(() => {
    try {
      const raw = localStorage.getItem(CUSTOM_REPORTS_KEY);
      const parsed = raw ? (JSON.parse(raw) as ReportDefinition[]) : [];
      setCustomReports(Array.isArray(parsed) ? parsed : []);
    } catch {
      setCustomReports([]);
    } finally {
      setCustomReportsHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!customReportsHydrated) return;
    localStorage.setItem(CUSTOM_REPORTS_KEY, JSON.stringify(customReports));
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

  const filteredItems = useMemo(
    () =>
      items.filter((item) => {
        const matchesProject = projectFilter === 'all' || (item.project || 'Unassigned') === projectFilter;
        const matchesLocation = locationFilter === 'all' || (item.location || 'Unassigned') === locationFilter;
        const matchesStatus = statusFilter === 'all' || (item.assetStatus || 'other') === statusFilter;
        const matchesExpenseType = expenseTypeFilter === 'all' || (item.expenseTypeCode || 'N/A') === expenseTypeFilter;
        return matchesProject && matchesLocation && matchesStatus && matchesExpenseType;
      }),
    [items, projectFilter, locationFilter, statusFilter, expenseTypeFilter]
  );

  const projects = useMemo(() => Array.from(new Set(items.map((item) => item.project || 'Unassigned'))).sort(), [items]);
  const locations = useMemo(() => Array.from(new Set(items.map((item) => item.location || 'Unassigned'))).sort(), [items]);

  const toReportRows = (columns: string[]) =>
    filteredItems.map((item) =>
      columns.reduce((acc, column) => {
        const totalValue = (item.quantity || 0) * (item.costPerUnit || 0);
        const restockRequired = (item.quantity || 0) <= (item.minQuantity || 0) ? 'Yes' : 'No';
        const recommendedTopUp = restockRequired === 'Yes' ? Math.max((item.minQuantity || 0) * 2 - (item.quantity || 0), 0) : 0;

        const values: Record<string, unknown> = {
          ...item,
          assetId: item.assetId || item.id,
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
        <h1 className="text-2xl font-bold">Production Reports</h1>
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
                {projects.map((project) => <SelectItem key={project} value={project}>{project}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Location</Label>
            <Select value={locationFilter} onValueChange={setLocationFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Locations</SelectItem>
                {locations.map((location) => <SelectItem key={location} value={location}>{location}</SelectItem>)}
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
            <div className="flex gap-2">
              <Button size="sm" onClick={runSelectedReport}>
                <Download className="mr-2 h-4 w-4" />
                Export CSV
              </Button>
              <Button size="sm" variant="outline" onClick={exportSelectedReportExcel}>
                <FileSpreadsheet className="mr-2 h-4 w-4" />
                Export Excel
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
          <CardTitle>Define Custom Report</CardTitle>
          <CardDescription>Create and save reusable custom reports.</CardDescription>
        </CardHeader>
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
      </Card>
    </div>
  );
}
