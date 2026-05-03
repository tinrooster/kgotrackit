import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Download, Save, RefreshCw, FileJson, Database, GitMerge, Upload } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import type { GroupReconcileResult } from '@/lib/groupInventoryReconciliation';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface DataBackupTabProps {
  onExportData: () => void;
  onExportExcel: () => void;
  onImportData: (file: File) => Promise<void>;
  onImportExcel: (file: File) => Promise<void>;
  onBackupData: () => void;
  onRestoreData: (file: File) => Promise<void>;
  onExportSettingsSnapshot: () => void;
  onRestoreSettingsSnapshot: (file: File) => Promise<void>;
  dailyOfflineBackupEnabled: boolean;
  onDailyOfflineBackupEnabledChange: (enabled: boolean) => void;
  dailyOfflineBackupLastDate?: string;
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
  onRestoreSettingsSnapshot,
  dailyOfflineBackupEnabled,
  onDailyOfflineBackupEnabledChange,
  dailyOfflineBackupLastDate,
  onRunGroupInventoryReconcile,
}: DataBackupTabProps) {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('import-export');
  const [isImporting, setIsImporting] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [isRestoringSettingsSnapshot, setIsRestoringSettingsSnapshot] = useState(false);
  const [reconcileReport, setReconcileReport] = useState<string | null>(null);
  const [fullRestoreDialogOpen, setFullRestoreDialogOpen] = useState(false);
  const [pendingFullRestoreFile, setPendingFullRestoreFile] = useState<File | null>(null);
  const [settingsRestoreDialogOpen, setSettingsRestoreDialogOpen] = useState(false);
  const [pendingSettingsRestoreFile, setPendingSettingsRestoreFile] = useState<File | null>(null);
  const jsonImportRef = React.useRef<HTMLInputElement>(null);
  const excelImportRef = React.useRef<HTMLInputElement>(null);
  const restoreRef = React.useRef<HTMLInputElement>(null);
  const settingsSnapshotRestoreRef = React.useRef<HTMLInputElement>(null);

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

  const handleRestoreFileChosen = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (restoreRef.current) {
      restoreRef.current.value = '';
    }
    if (!file) return;
    setPendingFullRestoreFile(file);
    setFullRestoreDialogOpen(true);
  };

  const executeFullRestore = async () => {
    const file = pendingFullRestoreFile;
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
      setPendingFullRestoreFile(null);
      setFullRestoreDialogOpen(false);
    }
  };

  const handleSettingsSnapshotFileChosen = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (settingsSnapshotRestoreRef.current) {
      settingsSnapshotRestoreRef.current.value = '';
    }
    if (!file) return;
    setPendingSettingsRestoreFile(file);
    setSettingsRestoreDialogOpen(true);
  };

  const executeSettingsSnapshotRestore = async () => {
    const file = pendingSettingsRestoreFile;
    if (!file) return;
    try {
      setIsRestoringSettingsSnapshot(true);
      await onRestoreSettingsSnapshot(file);
      toast({
        title: 'Settings snapshot restored',
        description: 'Lists, financial codes, cabinets, and general preferences were replaced from the file.',
      });
    } catch (error) {
      toast({
        title: 'Restore failed',
        description: error instanceof Error ? error.message : 'An unknown error occurred',
        variant: 'destructive',
      });
    } finally {
      setIsRestoringSettingsSnapshot(false);
      setPendingSettingsRestoreFile(null);
      setSettingsRestoreDialogOpen(false);
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
                    <Button
                      type="button"
                      onClick={onExportData}
                      variant="outline"
                      size="sm"
                      className="active:bg-accent"
                    >
                      Export as JSON
                    </Button>
                    <Button
                      type="button"
                      onClick={onExportExcel}
                      variant="outline"
                      size="sm"
                      className="active:bg-accent"
                    >
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
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="active:bg-accent"
                      onClick={() => jsonImportRef.current?.click()}
                    >
                      Import JSON
                    </Button>
                    <input
                      type="file"
                      ref={jsonImportRef}
                      onChange={handleJsonFileChange}
                      accept=".json"
                      className="hidden"
                    />

                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="active:bg-accent"
                      onClick={() => excelImportRef.current?.click()}
                    >
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
                Full app file backup/restore vs settings-only JSON — use the scope labels below.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2 md:items-stretch md:gap-6">
                <div className="flex flex-col space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-medium">Create Backup</h3>
                    <Badge variant="secondary">Full app</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    One file: inventory rows, lists, financial codes, preferences, cabinets, templates. For CSV/Excel
                    inventory only, use <strong>Import &amp; Export</strong>.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={onBackupData}
                    className="mt-auto inline-flex w-fit items-center justify-center gap-2 active:bg-accent"
                  >
                    <Save className="h-4 w-4 shrink-0" />
                    Create Backup
                  </Button>
                  <div className="mt-3 flex flex-col gap-2 rounded-md border border-border/60 bg-muted/20 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <Label htmlFor="daily-offline-backup" className="text-sm font-medium leading-snug">
                        Daily offline backup
                      </Label>
                      <Switch
                        id="daily-offline-backup"
                        checked={dailyOfflineBackupEnabled}
                        onCheckedChange={onDailyOfflineBackupEnabledChange}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      While the app is open, downloads one full JSON backup per calendar day (lists, inventory,
                      financial codes, preferences, cabinets, templates). Uses your browser download folder.
                    </p>
                    {dailyOfflineBackupLastDate ? (
                      <p className="text-xs text-muted-foreground">
                        Last daily file: <span className="font-mono text-foreground">{dailyOfflineBackupLastDate}</span>
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="flex flex-col space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-medium">Restore Backup</h3>
                    <Badge variant="secondary">Full app</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Choose a <strong>.backup</strong> (app export) or compatible <strong>.json</strong> full snapshot.
                    This replaces the in-browser dataset for everything in the backup.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => restoreRef.current?.click()}
                    disabled={isRestoring}
                    className="mt-auto inline-flex w-fit items-center justify-center gap-2 active:bg-accent"
                  >
                    <Upload className="h-4 w-4 shrink-0" />
                    Restore from Backup
                  </Button>
                  <input
                    type="file"
                    ref={restoreRef}
                    onChange={handleRestoreFileChosen}
                    accept=".backup,.BACKUP,.json,.JSON,application/json"
                    className="hidden"
                  />
                </div>
              </div>

              <div className="border-t pt-4">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-medium">Settings snapshot (JSON)</h3>
                  <Badge variant="outline">No inventory rows</Badge>
                </div>
                <p className="mb-3 text-sm text-muted-foreground">
                  Portable JSON: general preferences, lookup lists, financial codes, and cabinets only. Inventory lines
                  stay as they are — use <strong>Import &amp; Export</strong> for inventory, or <strong>Create Backup</strong> for a
                  full app file.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="active:bg-accent"
                    onClick={onExportSettingsSnapshot}
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Download settings snapshot
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="active:bg-accent"
                    disabled={isRestoringSettingsSnapshot}
                    onClick={() => settingsSnapshotRestoreRef.current?.click()}
                  >
                    <Upload className="mr-2 h-4 w-4" />
                    Restore settings snapshot
                  </Button>
                  <input
                    type="file"
                    ref={settingsSnapshotRestoreRef}
                    onChange={handleSettingsSnapshotFileChosen}
                    accept=".json,.JSON,application/json"
                    className="hidden"
                  />
                </div>
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
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="active:bg-accent"
                  onClick={handleRunGroupReconcile}
                >
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Run group reconciliation
                </Button>
                {reconcileReport !== null && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="active:bg-accent"
                    onClick={() => setReconcileReport(null)}
                  >
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

      <AlertDialog
        open={fullRestoreDialogOpen}
        onOpenChange={(open) => {
          if (!open && isRestoring) return;
          setFullRestoreDialogOpen(open);
          if (!open) setPendingFullRestoreFile(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace all local data?</AlertDialogTitle>
            <AlertDialogDescription>
              Restoring from{' '}
              <span className="font-mono text-foreground">{pendingFullRestoreFile?.name ?? 'this file'}</span>{' '}
              overwrites inventory, settings, lists, templates, and other data stored in this browser profile with the
              backup contents. This cannot be undone from the app.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel type="button">Cancel</AlertDialogCancel>
            <Button type="button" disabled={isRestoring} onClick={() => void executeFullRestore()}>
              {isRestoring ? 'Restoring…' : 'Restore backup'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={settingsRestoreDialogOpen}
        onOpenChange={(open) => {
          if (!open && isRestoringSettingsSnapshot) return;
          setSettingsRestoreDialogOpen(open);
          if (!open) setPendingSettingsRestoreFile(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace settings from snapshot?</AlertDialogTitle>
            <AlertDialogDescription>
              Restoring{' '}
              <span className="font-mono text-foreground">{pendingSettingsRestoreFile?.name ?? 'this file'}</span>{' '}
              replaces lookup lists, financial codes, cabinets, and general preferences. Inventory rows are not
              changed by this action.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel type="button">Cancel</AlertDialogCancel>
            <Button
              type="button"
              disabled={isRestoringSettingsSnapshot}
              onClick={() => void executeSettingsSnapshotRestore()}
            >
              {isRestoringSettingsSnapshot ? 'Restoring…' : 'Restore settings'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
