import React, { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Download, Save, RefreshCw, FileJson, Database, GitMerge, Upload, Loader2, History } from 'lucide-react';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { validateFullBackupJsonText, validateSettingsSnapshotJsonText } from '@/lib/backupValidation';
import { buildFullOfflineBackupPayload } from '@/lib/trackItDailyBackup';
import {
  addRestorePoint,
  deleteRestorePoint,
  getRestorePointPayloadJson,
  listRestorePoints,
  MAX_RESTORE_POINTS,
  type RestorePointListEntry,
} from '@/lib/localRestorePoints';
import { logger } from '@/lib/logging';

interface DataBackupTabProps {
  onExportData: () => void;
  onExportExcel: () => void;
  onImportData: (file: File) => Promise<void>;
  onImportExcel: (file: File) => Promise<void>;
  onBackupData: () => void | Promise<void>;
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
  const [isImportingExcel, setIsImportingExcel] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [isRestoringSettingsSnapshot, setIsRestoringSettingsSnapshot] = useState(false);
  const [reconcileReport, setReconcileReport] = useState<string | null>(null);
  const [fullRestoreDialogOpen, setFullRestoreDialogOpen] = useState(false);
  const [pendingFullRestoreFile, setPendingFullRestoreFile] = useState<File | null>(null);
  const [settingsRestoreDialogOpen, setSettingsRestoreDialogOpen] = useState(false);
  const [pendingSettingsRestoreFile, setPendingSettingsRestoreFile] = useState<File | null>(null);
  const [jsonImportConfirmOpen, setJsonImportConfirmOpen] = useState(false);
  const [pendingJsonImportFile, setPendingJsonImportFile] = useState<File | null>(null);
  const [excelImportConfirmOpen, setExcelImportConfirmOpen] = useState(false);
  const [pendingExcelImportFile, setPendingExcelImportFile] = useState<File | null>(null);
  const [fullRestoreSummary, setFullRestoreSummary] = useState<{ lines: string[]; warnings: string[] } | null>(null);
  const [settingsRestoreSummary, setSettingsRestoreSummary] = useState<{ lines: string[]; warnings: string[] } | null>(
    null
  );
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isValidatingFullRestore, setIsValidatingFullRestore] = useState(false);
  const [isValidatingSettingsRestore, setIsValidatingSettingsRestore] = useState(false);
  const [restorePointEntries, setRestorePointEntries] = useState<RestorePointListEntry[]>([]);
  const [createRestorePointOpen, setCreateRestorePointOpen] = useState(false);
  const [newRestorePointName, setNewRestorePointName] = useState('Before risky change');
  const [isSavingRestorePoint, setIsSavingRestorePoint] = useState(false);
  const [restorePointLoadingId, setRestorePointLoadingId] = useState<string | null>(null);
  const [rpRestoreDialogOpen, setRpRestoreDialogOpen] = useState(false);
  const [rpRestoreJson, setRpRestoreJson] = useState<string | null>(null);
  const [rpRestoreSummary, setRpRestoreSummary] = useState<{ lines: string[]; warnings: string[] } | null>(null);
  const [rpRestoreLabel, setRpRestoreLabel] = useState('');
  const [isRestoringFromPoint, setIsRestoringFromPoint] = useState(false);
  const [deleteRestorePointTarget, setDeleteRestorePointTarget] = useState<{ id: string; name: string } | null>(null);
  const [isDeletingRestorePoint, setIsDeletingRestorePoint] = useState(false);
  const jsonImportRef = React.useRef<HTMLInputElement>(null);
  const excelImportRef = React.useRef<HTMLInputElement>(null);
  const restoreRef = React.useRef<HTMLInputElement>(null);
  const settingsSnapshotRestoreRef = React.useRef<HTMLInputElement>(null);

  const handleJsonFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (jsonImportRef.current) {
      jsonImportRef.current.value = '';
    }
    if (!file) return;
    setPendingJsonImportFile(file);
    setJsonImportConfirmOpen(true);
  };

  const executeJsonImport = async () => {
    const file = pendingJsonImportFile;
    if (!file) return;
    try {
      setIsImporting(true);
      await onImportData(file);
    } catch (error) {
      toast({
        title: 'Import failed',
        description: error instanceof Error ? error.message : 'An unknown error occurred',
        variant: 'destructive',
      });
    } finally {
      setIsImporting(false);
      setPendingJsonImportFile(null);
      setJsonImportConfirmOpen(false);
    }
  };

  const handleExcelFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (excelImportRef.current) {
      excelImportRef.current.value = '';
    }
    if (!file) return;
    setPendingExcelImportFile(file);
    setExcelImportConfirmOpen(true);
  };

  const executeExcelImport = async () => {
    const file = pendingExcelImportFile;
    if (!file) return;
    try {
      setIsImportingExcel(true);
      await onImportExcel(file);
    } catch (error) {
      toast({
        title: 'Import failed',
        description: error instanceof Error ? error.message : 'An unknown error occurred',
        variant: 'destructive',
      });
    } finally {
      setIsImportingExcel(false);
      setPendingExcelImportFile(null);
      setExcelImportConfirmOpen(false);
    }
  };

  const handleRestoreFileChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (restoreRef.current) {
      restoreRef.current.value = '';
    }
    if (!file) return;
    setIsValidatingFullRestore(true);
    try {
      const text = await file.text();
      const v = validateFullBackupJsonText(text);
      if (!v.ok) {
        toast({
          title: 'Invalid backup file',
          description: v.error,
          variant: 'destructive',
        });
        return;
      }
      setPendingFullRestoreFile(file);
      setFullRestoreSummary({ lines: v.summaryLines, warnings: v.warnings });
      setFullRestoreDialogOpen(true);
    } catch (error) {
      toast({
        title: 'Could not read file',
        description: error instanceof Error ? error.message : 'An unknown error occurred',
        variant: 'destructive',
      });
    } finally {
      setIsValidatingFullRestore(false);
    }
  };

  const executeFullRestore = async () => {
    const file = pendingFullRestoreFile;
    const summary = fullRestoreSummary;
    if (!file) return;
    try {
      setIsRestoring(true);
      await onRestoreData(file);
      toast({
        title: 'Restore successful',
        description: summary
          ? summary.lines.slice(0, 4).join(' · ')
          : 'Your backup has been applied to local storage.',
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
      setFullRestoreSummary(null);
      setFullRestoreDialogOpen(false);
    }
  };

  const handleSettingsSnapshotFileChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (settingsSnapshotRestoreRef.current) {
      settingsSnapshotRestoreRef.current.value = '';
    }
    if (!file) return;
    setIsValidatingSettingsRestore(true);
    try {
      const text = await file.text();
      const v = validateSettingsSnapshotJsonText(text);
      if (!v.ok) {
        toast({
          title: 'Invalid settings snapshot',
          description: v.error,
          variant: 'destructive',
        });
        return;
      }
      setPendingSettingsRestoreFile(file);
      setSettingsRestoreSummary({ lines: v.summaryLines, warnings: v.warnings });
      setSettingsRestoreDialogOpen(true);
    } catch (error) {
      toast({
        title: 'Could not read file',
        description: error instanceof Error ? error.message : 'An unknown error occurred',
        variant: 'destructive',
      });
    } finally {
      setIsValidatingSettingsRestore(false);
    }
  };

  const executeSettingsSnapshotRestore = async () => {
    const file = pendingSettingsRestoreFile;
    const summary = settingsRestoreSummary;
    if (!file) return;
    try {
      setIsRestoringSettingsSnapshot(true);
      await onRestoreSettingsSnapshot(file);
      toast({
        title: 'Settings snapshot restored',
        description: summary
          ? summary.lines.slice(0, 3).join(' · ')
          : 'Lists, financial codes, cabinets, and general preferences were replaced from the file.',
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
      setSettingsRestoreSummary(null);
      setSettingsRestoreDialogOpen(false);
    }
  };

  const handleCreateBackupClick = async () => {
    try {
      setIsBackingUp(true);
      await Promise.resolve(onBackupData());
    } catch (error) {
      toast({
        title: 'Backup failed',
        description: error instanceof Error ? error.message : 'An unknown error occurred',
        variant: 'destructive',
      });
    } finally {
      setIsBackingUp(false);
    }
  };

  const refreshRestorePointsList = useCallback(async () => {
    try {
      const list = await listRestorePoints();
      setRestorePointEntries(list);
    } catch (e) {
      console.error('listRestorePoints failed', e);
      setRestorePointEntries([]);
    }
  }, []);

  useEffect(() => {
    if (activeTab !== 'backup-restore') return;
    void refreshRestorePointsList();
  }, [activeTab, refreshRestorePointsList]);

  const handleSaveNewRestorePoint = async () => {
    setIsSavingRestorePoint(true);
    try {
      const payload = await buildFullOfflineBackupPayload();
      const text = JSON.stringify(payload, null, 2);
      const { id } = await addRestorePoint(newRestorePointName, text);
      const sizeBytes = new Blob([text]).size;
      logger.info(
        'system',
        'Restore point created',
        { restorePointId: id, name: newRestorePointName.trim() || 'Restore point', sizeBytes },
        'DataBackupTab'
      );
      toast({
        title: 'Restore point saved',
        description: `Stored locally (up to ${MAX_RESTORE_POINTS}). Oldest entries roll off automatically.`,
      });
      setCreateRestorePointOpen(false);
      setNewRestorePointName('Before risky change');
      await refreshRestorePointsList();
    } catch (error) {
      toast({
        title: 'Could not save restore point',
        description: error instanceof Error ? error.message : 'IndexedDB may be full or unavailable.',
        variant: 'destructive',
      });
    } finally {
      setIsSavingRestorePoint(false);
    }
  };

  const beginRestoreFromPoint = async (id: string, name: string) => {
    setRestorePointLoadingId(id);
    try {
      const json = await getRestorePointPayloadJson(id);
      if (!json) {
        toast({ title: 'Restore point missing', description: 'Payload was not found in IndexedDB.', variant: 'destructive' });
        return;
      }
      const v = validateFullBackupJsonText(json);
      if (!v.ok) {
        toast({ title: 'Invalid restore point payload', description: v.error, variant: 'destructive' });
        return;
      }
      setRpRestoreJson(json);
      setRpRestoreSummary({ lines: v.summaryLines, warnings: v.warnings });
      setRpRestoreLabel(name);
      setRpRestoreDialogOpen(true);
    } catch (error) {
      toast({
        title: 'Could not read restore point',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setRestorePointLoadingId(null);
    }
  };

  const executeRestoreFromPoint = async () => {
    const json = rpRestoreJson;
    const summary = rpRestoreSummary;
    const label = rpRestoreLabel;
    if (!json) return;
    try {
      setIsRestoringFromPoint(true);
      logger.info('system', 'Restore point restore started', { name: label }, 'DataBackupTab');
      const file = new File([json], 'restore-point.json', { type: 'application/json' });
      await onRestoreData(file);
      logger.info(
        'system',
        'Restore point restore completed',
        { name: label },
        'DataBackupTab'
      );
      toast({
        title: 'Restore point applied',
        description: summary ? summary.lines.slice(0, 4).join(' · ') : 'Local data was replaced from the snapshot.',
      });
    } catch (error) {
      logger.warn(
        'system',
        'Restore point restore failed',
        { name: label, error: error instanceof Error ? error.message : String(error) },
        'DataBackupTab'
      );
      toast({
        title: 'Restore failed',
        description: error instanceof Error ? error.message : 'An unknown error occurred',
        variant: 'destructive',
      });
    } finally {
      setIsRestoringFromPoint(false);
      setRpRestoreDialogOpen(false);
      setRpRestoreJson(null);
      setRpRestoreSummary(null);
      setRpRestoreLabel('');
    }
  };

  const executeDeleteRestorePoint = async () => {
    const target = deleteRestorePointTarget;
    if (!target) return;
    try {
      setIsDeletingRestorePoint(true);
      await deleteRestorePoint(target.id);
      logger.info(
        'system',
        'Restore point deleted',
        { restorePointId: target.id, name: target.name },
        'DataBackupTab'
      );
      toast({ title: 'Restore point removed', description: `"${target.name}" was deleted from this browser.` });
      setDeleteRestorePointTarget(null);
      await refreshRestorePointsList();
    } catch (error) {
      toast({
        title: 'Delete failed',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setIsDeletingRestorePoint(false);
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
                    onClick={() => void handleCreateBackupClick()}
                    disabled={isBackingUp}
                    className="mt-auto inline-flex w-fit items-center justify-center gap-2 active:bg-accent"
                  >
                    {isBackingUp ? (
                      <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
                    ) : (
                      <Save className="h-4 w-4 shrink-0" aria-hidden />
                    )}
                    {isBackingUp ? 'Preparing backup…' : 'Create Backup'}
                  </Button>
                  {isBackingUp ? (
                    <p className="text-xs text-muted-foreground">Gathering inventory, lists, and related data for download…</p>
                  ) : null}
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
                    disabled={isRestoring || isValidatingFullRestore}
                    className="mt-auto inline-flex w-fit items-center justify-center gap-2 active:bg-accent"
                  >
                    {isValidatingFullRestore ? (
                      <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
                    ) : (
                      <Upload className="h-4 w-4 shrink-0" aria-hidden />
                    )}
                    {isValidatingFullRestore ? 'Reading file…' : 'Restore from Backup'}
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

              <div className="border-t pt-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <History className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                    <h3 className="text-sm font-medium">Local restore points</h3>
                    <Badge variant="outline">This browser · IndexedDB</Badge>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void refreshRestorePointsList()}
                    className="active:bg-accent"
                  >
                    <RefreshCw className="mr-2 h-4 w-4" aria-hidden />
                    Refresh list
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground">
                  Named snapshots of the full in-app payload (same shape as <strong>Create Backup</strong>). Up to{' '}
                  {MAX_RESTORE_POINTS} are kept; the oldest is removed when you save a new one. This does not replace file
                  export or cloud sync.
                </p>
                <Button type="button" size="sm" variant="secondary" onClick={() => setCreateRestorePointOpen(true)}>
                  Create restore point…
                </Button>
                {restorePointEntries.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No restore points yet.</p>
                ) : (
                  <ul className="space-y-2 rounded-md border border-border/60 bg-muted/15 p-2 text-sm">
                    {restorePointEntries.map((entry) => (
                      <li
                        key={entry.id}
                        className="flex flex-col gap-2 rounded-md border border-transparent px-2 py-2 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div>
                          <p className="font-medium text-foreground">{entry.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(entry.createdAt).toLocaleString()} · {(entry.sizeBytes / 1024).toFixed(0)} KB
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={
                              isRestoring || isRestoringFromPoint || restorePointLoadingId !== null
                            }
                            onClick={() => void beginRestoreFromPoint(entry.id, entry.name)}
                          >
                            {restorePointLoadingId === entry.id ? (
                              <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                                Loading…
                              </>
                            ) : (
                              'Restore'
                            )}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="text-destructive hover:text-destructive"
                            onClick={() => setDeleteRestorePointTarget({ id: entry.id, name: entry.name })}
                          >
                            Delete
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
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
                    disabled={isRestoringSettingsSnapshot || isValidatingSettingsRestore}
                    onClick={() => settingsSnapshotRestoreRef.current?.click()}
                  >
                    {isValidatingSettingsRestore ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                    ) : (
                      <Upload className="mr-2 h-4 w-4" aria-hidden />
                    )}
                    {isValidatingSettingsRestore ? 'Reading file…' : 'Restore settings snapshot'}
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
          if (!open) {
            setPendingFullRestoreFile(null);
            setFullRestoreSummary(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace all local data?</AlertDialogTitle>
            <AlertDialogDescription>
              Restoring from{' '}
              <span className="font-mono text-foreground">{pendingFullRestoreFile?.name ?? 'this file'}</span> overwrites
              inventory, settings, lists, templates, and related data in this browser profile with the backup contents.
              This cannot be undone from the app.
            </AlertDialogDescription>
            {fullRestoreSummary ? (
              <div className="max-h-40 overflow-y-auto rounded-md border border-border/60 bg-muted/30 p-3 text-xs text-foreground">
                <p className="mb-1.5 font-medium text-foreground">File contents (read-only check)</p>
                <ul className="list-inside list-disc space-y-1 text-muted-foreground">
                  {fullRestoreSummary.lines.map((line, i) => (
                    <li key={i} className="text-foreground">
                      {line}
                    </li>
                  ))}
                </ul>
                {fullRestoreSummary.warnings.length > 0 ? (
                  <p className="mt-2 text-amber-800 dark:text-amber-200/90">{fullRestoreSummary.warnings.join(' ')}</p>
                ) : null}
              </div>
            ) : null}
          </AlertDialogHeader>
          {isRestoring ? (
            <div className="flex items-center gap-2 px-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
              <span>Applying backup to local storage…</span>
            </div>
          ) : null}
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
          if (!open) {
            setPendingSettingsRestoreFile(null);
            setSettingsRestoreSummary(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace settings from snapshot?</AlertDialogTitle>
            <AlertDialogDescription>
              Restoring{' '}
              <span className="font-mono text-foreground">{pendingSettingsRestoreFile?.name ?? 'this file'}</span>{' '}
              replaces lookup lists, financial codes, cabinets, and general preferences. Inventory rows are not changed
              by this action.
            </AlertDialogDescription>
            {settingsRestoreSummary ? (
              <div className="max-h-40 overflow-y-auto rounded-md border border-border/60 bg-muted/30 p-3 text-xs text-foreground">
                <p className="mb-1.5 font-medium text-foreground">Snapshot summary</p>
                <ul className="list-inside list-disc space-y-1 text-muted-foreground">
                  {settingsRestoreSummary.lines.map((line, i) => (
                    <li key={i} className="text-foreground">
                      {line}
                    </li>
                  ))}
                </ul>
                {settingsRestoreSummary.warnings.length > 0 ? (
                  <p className="mt-2 text-amber-800 dark:text-amber-200/90">
                    {settingsRestoreSummary.warnings.join(' ')}
                  </p>
                ) : null}
              </div>
            ) : null}
          </AlertDialogHeader>
          {isRestoringSettingsSnapshot ? (
            <div className="flex items-center gap-2 px-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
              <span>Applying settings snapshot…</span>
            </div>
          ) : null}
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

      <AlertDialog
        open={jsonImportConfirmOpen}
        onOpenChange={(open) => {
          if (!open && isImporting) return;
          setJsonImportConfirmOpen(open);
          if (!open) setPendingJsonImportFile(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Import JSON data?</AlertDialogTitle>
            <AlertDialogDescription>
              File{' '}
              <span className="font-mono text-foreground">{pendingJsonImportFile?.name ?? 'selected'}</span> will be
              merged with your current inventory and lists. Overlapping rows may open a resolution step
              (replace, merge, or skip). Create a backup first if you might need to undo this.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel type="button">Cancel</AlertDialogCancel>
            <Button type="button" disabled={isImporting} onClick={() => void executeJsonImport()}>
              {isImporting ? 'Importing…' : 'Import JSON'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={excelImportConfirmOpen}
        onOpenChange={(open) => {
          if (!open && isImportingExcel) return;
          setExcelImportConfirmOpen(open);
          if (!open) setPendingExcelImportFile(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Import Excel workbook?</AlertDialogTitle>
            <AlertDialogDescription>
              File{' '}
              <span className="font-mono text-foreground">{pendingExcelImportFile?.name ?? 'selected'}</span> will be
              merged in the same way as a JSON import. Conflicts may require your choice before data is written. Export a
              backup if you are unsure.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel type="button">Cancel</AlertDialogCancel>
            <Button type="button" disabled={isImportingExcel} onClick={() => void executeExcelImport()}>
              {isImportingExcel ? 'Importing…' : 'Import Excel'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={createRestorePointOpen} onOpenChange={setCreateRestorePointOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create restore point</DialogTitle>
            <DialogDescription>
              Saves the same payload as <strong>Create Backup</strong> into private browser storage (up to{' '}
              {MAX_RESTORE_POINTS} named points; oldest rolls off).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="restore-point-name">Name</Label>
            <Input
              id="restore-point-name"
              value={newRestorePointName}
              onChange={(e) => setNewRestorePointName(e.target.value)}
              placeholder="e.g. Before bulk delete"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCreateRestorePointOpen(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={isSavingRestorePoint} onClick={() => void handleSaveNewRestorePoint()}>
              {isSavingRestorePoint ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                  Saving…
                </>
              ) : (
                'Save restore point'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deleteRestorePointTarget !== null}
        onOpenChange={(open) => {
          if (!open && isDeletingRestorePoint) return;
          if (!open) setDeleteRestorePointTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this restore point?</AlertDialogTitle>
            <AlertDialogDescription>
              Remove{' '}
              <span className="font-medium text-foreground">{deleteRestorePointTarget?.name ?? 'this snapshot'}</span>{' '}
              from IndexedDB on this device. Current inventory data is not changed until you restore from another
              snapshot.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel type="button">Cancel</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={isDeletingRestorePoint}
              onClick={() => void executeDeleteRestorePoint()}
            >
              {isDeletingRestorePoint ? 'Deleting…' : 'Delete'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={rpRestoreDialogOpen}
        onOpenChange={(open) => {
          if (!open && isRestoringFromPoint) return;
          setRpRestoreDialogOpen(open);
          if (!open) {
            setRpRestoreJson(null);
            setRpRestoreSummary(null);
            setRpRestoreLabel('');
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace all local data from restore point?</AlertDialogTitle>
            <AlertDialogDescription>
              Applying restore point{' '}
              <span className="font-medium text-foreground">{rpRestoreLabel || 'selected'}</span> overwrites inventory,
              settings, lists, templates, and related data in this browser profile, same as restoring from a backup
              file.
            </AlertDialogDescription>
            {rpRestoreSummary ? (
              <div className="max-h-40 overflow-y-auto rounded-md border border-border/60 bg-muted/30 p-3 text-xs text-foreground">
                <p className="mb-1.5 font-medium text-foreground">Snapshot summary</p>
                <ul className="list-inside list-disc space-y-1 text-muted-foreground">
                  {rpRestoreSummary.lines.map((line, i) => (
                    <li key={i} className="text-foreground">
                      {line}
                    </li>
                  ))}
                </ul>
                {rpRestoreSummary.warnings.length > 0 ? (
                  <p className="mt-2 text-amber-800 dark:text-amber-200/90">{rpRestoreSummary.warnings.join(' ')}</p>
                ) : null}
              </div>
            ) : null}
          </AlertDialogHeader>
          {isRestoringFromPoint ? (
            <div className="flex items-center gap-2 px-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
              <span>Applying restore point…</span>
            </div>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel type="button">Cancel</AlertDialogCancel>
            <Button type="button" disabled={isRestoringFromPoint} onClick={() => void executeRestoreFromPoint()}>
              {isRestoringFromPoint ? 'Restoring…' : 'Restore from point'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
