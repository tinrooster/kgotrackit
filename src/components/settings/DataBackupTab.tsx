import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Download, Save, RefreshCw, FileJson, Database, GitMerge } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import type { GroupReconcileResult } from '@/lib/groupInventoryReconciliation';

interface DataBackupTabProps {
  onExportData: () => void;
  onExportExcel: () => void;
  onImportData: (file: File) => Promise<void>;
  onImportExcel: (file: File) => Promise<void>;
  onBackupData: () => void;
  onRestoreData: (file: File) => Promise<void>;
  onExportSettingsSnapshot: () => void;
  onRunGroupInventoryReconcile: () => GroupReconcileResult;
}

function formatReconcileReport(result: GroupReconcileResult): string {
  const lines: string[] = [];
  lines.push(`Group inventory reconciliation — ${new Date().toLocaleString()}`);
  lines.push('');
  if (result.itemsTouched === 0) {
    lines.push('No inventory rows required changes.');
    lines.push(
      'All category, unit, location, supplier, project, expense code label, expense type code, and cost center code references match the current settings (or are blank / N/A).'
    );
    return lines.join('\n');
  }
  lines.push(`Inventory rows updated: ${result.itemsTouched}`);
  lines.push('');
  lines.push('Summary by field (items touched):');
  result.issues.forEach((entry) => {
    lines.push(`  • ${entry.field}: ${entry.count}`);
  });
  if (result.details.length > 0) {
    lines.push('');
    lines.push('Per-row actions:');
    result.details.forEach((line) => lines.push(`  • ${line}`));
  }
  if (result.detailsTruncated) {
    lines.push('');
    lines.push(`  … Additional per-row lines were omitted after ${result.details.length} entries.`);
  }
  lines.push('');
  lines.push('Changes have been saved to inventory storage.');
  return lines.join('\n');
}

export function DataBackupTab({
  onExportData,
  onExportExcel,
  onImportData,
  onImportExcel,
  onBackupData,
  onRestoreData,
  onExportSettingsSnapshot,
  onRunGroupInventoryReconcile,
}: DataBackupTabProps) {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('import-export');
  const [isImporting, setIsImporting] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [reconcileReport, setReconcileReport] = useState<string | null>(null);
  const jsonImportRef = React.useRef<HTMLInputElement>(null);
  const excelImportRef = React.useRef<HTMLInputElement>(null);
  const restoreRef = React.useRef<HTMLInputElement>(null);

  const handleJsonFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsImporting(true);
      await onImportData(file);
      toast({
        title: 'Import successful',
        description: 'Your data has been imported successfully.',
      });
    } catch (error) {
      toast({
        title: 'Import failed',
        description: error instanceof Error ? error.message : 'An unknown error occurred',
        variant: 'destructive',
      });
    } finally {
      setIsImporting(false);
      if (jsonImportRef.current) {
        jsonImportRef.current.value = '';
      }
    }
  };

  const handleExcelFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      await onImportExcel(file);
    } catch (error) {
      toast({
        title: 'Import failed',
        description: error instanceof Error ? error.message : 'An unknown error occurred',
        variant: 'destructive',
      });
    } finally {
      if (excelImportRef.current) {
        excelImportRef.current.value = '';
      }
    }
  };

  const handleRestore = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsRestoring(true);
      await onRestoreData(file);
      toast({
        title: 'Restore successful',
        description: 'Your backup has been restored successfully.',
      });
    } catch (error) {
      toast({
        title: 'Restore failed',
        description: error instanceof Error ? error.message : 'An unknown error occurred',
        variant: 'destructive',
      });
    } finally {
      setIsRestoring(false);
      if (restoreRef.current) {
        restoreRef.current.value = '';
      }
    }
  };

  const handleRunGroupReconcile = () => {
    const result = onRunGroupInventoryReconcile();
    setReconcileReport(formatReconcileReport(result));
    if (result.itemsTouched === 0) {
      toast({
        title: 'Group reconciliation',
        description: 'No mismatched references found.',
      });
    } else {
      const summary = result.issues.map((entry) => `${entry.field}: ${entry.count}`).join(' · ');
      toast({
        title: `Group reconciliation: ${result.itemsTouched} item(s) updated`,
        description: summary,
      });
    }
  };

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="import-export">Import & Export</TabsTrigger>
          <TabsTrigger value="backup-restore">Backup & Restore</TabsTrigger>
          <TabsTrigger value="reconciliation">Reconciliation</TabsTrigger>
        </TabsList>

        <TabsContent value="import-export" className="space-y-4 pt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileJson className="h-5 w-5" />
                Import & Export Data
              </CardTitle>
              <CardDescription>
                Import data from another system or export your current data in JSON format.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <h3 className="text-sm font-medium">Export Data</h3>
                  <p className="text-sm text-muted-foreground">
                    Export your current data to a JSON file that can be used for imports.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={onExportData} variant="outline">
                      Export as JSON
                    </Button>
                    <Button onClick={onExportExcel} variant="outline">
                      Export as Excel
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <h3 className="text-sm font-medium">Import Data</h3>
                  <p className="text-sm text-muted-foreground">
                    Import data from a JSON file. This will merge with your current data.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" onClick={() => jsonImportRef.current?.click()}>
                      Import JSON
                    </Button>
                    <input
                      type="file"
                      ref={jsonImportRef}
                      onChange={handleJsonFileChange}
                      accept=".json"
                      className="hidden"
                    />

                    <Button variant="outline" onClick={() => excelImportRef.current?.click()}>
                      Import Excel
                    </Button>
                    <input
                      type="file"
                      ref={excelImportRef}
                      onChange={handleExcelFileChange}
                      accept=".xlsx,.xls"
                      className="hidden"
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="backup-restore" className="space-y-4 pt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5" />
                Backup & Restore
              </CardTitle>
              <CardDescription>
                Create a complete backup of your system or restore from a previous backup.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <h3 className="text-sm font-medium">Create Backup</h3>
                  <p className="text-sm text-muted-foreground">
                    Create a complete backup of your data, settings, and configurations.
                  </p>
                  <Button onClick={onBackupData} className="w-full">
                    <Save className="mr-2 h-4 w-4" />
                    Create Backup
                  </Button>
                </div>

                <div className="space-y-2">
                  <h3 className="text-sm font-medium">Restore Backup</h3>
                  <p className="text-sm text-muted-foreground">
                    Restore from a <strong>.backup</strong> or <strong>.json</strong> file (both are shown in the file
                    picker). App-generated backups use the <code className="rounded bg-muted px-1">.backup</code>{' '}
                    extension.
                  </p>
                  <Button variant="outline" onClick={() => restoreRef.current?.click()}>
                    Restore from Backup
                  </Button>
                  <input
                    type="file"
                    ref={restoreRef}
                    onChange={handleRestore}
                    accept=".backup,.BACKUP,.json,.JSON,application/json"
                    className="hidden"
                  />
                </div>
              </div>

              <div className="border-t pt-4">
                <h3 className="mb-2 text-sm font-medium">Settings snapshot (JSON)</h3>
                <p className="mb-3 text-sm text-muted-foreground">
                  Download general preferences, user-defined lists, financial codes, and cabinets in one portable file.
                  For full inventory rows, use Import &amp; Export.
                </p>
                <Button type="button" variant="outline" onClick={onExportSettingsSnapshot}>
                  <Download className="mr-2 h-4 w-4" />
                  Download settings snapshot
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reconciliation" className="space-y-4 pt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <GitMerge className="h-5 w-5" />
                Group inventory reconciliation
              </CardTitle>
              <CardDescription>
                Scan all inventory rows against the current user-defined lists and financial code tables, then fix
                mismatched references in one pass (same rules as the per-list &quot;Fix unreconciled&quot; tools).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Invalid categories are cleared (previous value is preserved in custom fields). Invalid locations,
                suppliers, projects, and legacy expense-code labels are cleared. Invalid units fall back to your first
                configured unit (or &quot;each&quot;). Unknown expense type / cost center codes are cleared when they are
                not blank and not N/A.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="default" onClick={handleRunGroupReconcile}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Run group reconciliation
                </Button>
                {reconcileReport !== null && (
                  <Button type="button" variant="outline" onClick={() => setReconcileReport(null)}>
                    Clear report
                  </Button>
                )}
              </div>
              {reconcileReport !== null && (
                <div>
                  <h4 className="mb-2 text-sm font-medium text-foreground">Last run report</h4>
                  <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-muted/40 p-3 font-mono text-xs text-foreground">
                    {reconcileReport}
                  </pre>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
