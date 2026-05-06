import React from 'react';
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { format } from "date-fns";
import { Input } from "@/components/ui/input";
import { ArrowDownAZ, ArrowUpZA, Download, RefreshCw, RotateCcw, Search } from "lucide-react";
import { getLogs as getStoredLogs, logger } from "@/lib/logging";
import { useAuth } from "@/contexts/AuthContext";

interface LogEntry {
  timestamp: Date;
  level: 'debug' | 'info' | 'warn' | 'error';
  type: 'system' | 'audit' | 'performance' | 'security';
  message: string;
  details?: any;
  component?: string;
}

export function SystemLogs() {
  const { currentUser } = useAuth();
  const [searchQuery, setSearchQuery] = React.useState("");
  const [selectedLevel, setSelectedLevel] = React.useState<string>("all");
  const [selectedType, setSelectedType] = React.useState<string>("all");
  const [logs, setLogs] = React.useState<LogEntry[]>([]);
  const [isNewestFirst, setIsNewestFirst] = React.useState(true);
  const [showRawDetails, setShowRawDetails] = React.useState(false);
  const [isCompactView, setIsCompactView] = React.useState(true);
  const [isViewCleared, setIsViewCleared] = React.useState(false);

  const loadInventoryAuditLogs = React.useCallback((): LogEntry[] => {
    try {
      const rawAuditLogs = localStorage.getItem('inventory-audit-log');
      if (!rawAuditLogs) return [];
      const parsedAuditLogs = JSON.parse(rawAuditLogs) as Array<{
        action?: string;
        itemId?: string;
        assetId?: string | null;
        name?: string;
        timestamp?: string;
        user?: string;
      }>;
      return parsedAuditLogs.map((entry) => ({
        timestamp: new Date(entry.timestamp || new Date().toISOString()),
        level: 'info' as const,
        type: 'audit' as const,
        message: entry.action ? `INVENTORY_ITEM_${entry.action}` : 'INVENTORY_ITEM_EVENT',
        details: {
          itemId: entry.itemId,
          assetId: entry.assetId ?? null,
          name: entry.name,
          user: entry.user,
        },
        component: 'InventoryPage',
      }));
    } catch {
      return [];
    }
  }, []);

  const loadAndSetLogs = React.useCallback(() => {
    const inMemoryLogs = logger.getLogs() as unknown as LogEntry[];
    const durableLogs = getStoredLogs() as unknown as LogEntry[];
    const legacyInventoryLogs = loadInventoryAuditLogs();

    const seenKeys = new Set<string>();
    const combinedLogs = [...inMemoryLogs, ...durableLogs, ...legacyInventoryLogs]
      .filter((entry) => {
        if (!entry?.timestamp || !entry?.message) return false;
        const key = `${new Date(entry.timestamp).getTime()}:${entry.message}:${entry.component ?? ''}`;
        if (seenKeys.has(key)) return false;
        seenKeys.add(key);
        return true;
      })
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    setLogs(combinedLogs);
  }, [loadInventoryAuditLogs]);

  const refreshLogs = React.useCallback(() => {
    loadAndSetLogs();
    setIsViewCleared(false);
  }, [loadAndSetLogs]);

  React.useEffect(() => {
    loadAndSetLogs();
    window.addEventListener('trackit:logs-updated', loadAndSetLogs);
    return () => {
      window.removeEventListener('trackit:logs-updated', loadAndSetLogs);
    };
  }, [loadAndSetLogs]);

  const filteredLogs = React.useMemo(() => {
    const matchedLogs = logs.filter(log => {
      const matchesSearch = log.message.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (log.details && JSON.stringify(log.details).toLowerCase().includes(searchQuery.toLowerCase()));
      
      const matchesLevel = selectedLevel === "all" || log.level === selectedLevel;
      const matchesType = selectedType === "all" || log.type === selectedType;
      
      return matchesSearch && matchesLevel && matchesType;
    });
    const orderedLogs = isNewestFirst ? matchedLogs : [...matchedLogs].reverse();
    return isViewCleared ? [] : orderedLogs;
  }, [logs, searchQuery, selectedLevel, selectedType, isNewestFirst, isViewCleared]);

  const parseLogSummary = (log: LogEntry) => {
    const details = (log.details || {}) as Record<string, unknown>;
    const actor = String(details.user ?? details.performedBy ?? currentUser?.username ?? currentUser?.displayName ?? 'Unknown user');
    const itemName = String(details.name ?? details.itemName ?? 'Unknown item');
    const quantity = details.quantity != null ? ` x${String(details.quantity)}` : '';
    const cabinetName = details.cabinetName ? ` in ${String(details.cabinetName)}` : '';

    const usernameDetail = String(details.username ?? details.user ?? details.performedBy ?? actor);
    const workspaceName = String(details.workspaceName ?? details.workspace ?? '');

    switch (log.message) {
      case 'INVENTORY_ITEM_CREATED':
        return `${actor} created "${itemName}"`;
      case 'INVENTORY_ITEM_UPDATED':
        return `${actor} updated "${itemName}"`;
      case 'INVENTORY_ITEM_DELETE':
      case 'INVENTORY_ITEM_DELETED':
        return `${actor} deleted "${itemName}"`;
      case 'INVENTORY_ITEM_DELETE_FAILED':
        return `${actor} failed to delete "${itemName}"`;
      case 'INVENTORY_ITEM_DELETED_BATCH':
        return `${actor} deleted ${String(details.count ?? 0)} inventory items`;
      case 'USER_DEFINED_ITEMS_UPDATED':
        return `${actor} updated ${String(details.listKey ?? 'user-defined items')}`;
      case 'FINANCIAL_EXPENSE_TYPES_UPDATED':
        return `${actor} updated expense type codes`;
      case 'FINANCIAL_COST_CENTERS_UPDATED':
        return `${actor} updated cost center codes`;
      case 'ITEM_CHECKIN':
        return `${actor} checked in "${itemName}"${quantity}${cabinetName}`;
      case 'ITEM_CHECKOUT':
        return `${actor} checked out "${itemName}"${quantity}${cabinetName}`;
      case 'SYSTEM_LOG_PANEL_OPENED':
        return `${actor} opened the system logs panel`;
      case 'AUTH_LOGIN_SUCCESS':
        return `${usernameDetail} signed in`;
      case 'AUTH_LOGIN_FAILED':
      case 'AUTH_LOGIN_FAILED_USER_NOT_FOUND':
      case 'AUTH_LOGIN_FAILED_INVALID_PASSWORD':
        return `Sign-in failed${usernameDetail && usernameDetail !== actor ? ` for ${usernameDetail}` : ''}: ${String(details.error ?? details.reason ?? 'invalid credentials')}`;
      case 'AUTH_LOGIN_ERROR':
        return `Sign-in error${usernameDetail && usernameDetail !== actor ? ` for ${usernameDetail}` : ''}: ${String(details.error ?? '')}`;
      case 'AUTH_LOGOUT':
        return `${usernameDetail} signed out`;
      case 'AUTH_PASSWORD_RESET_SUCCESS':
        return `Password reset successful for ${usernameDetail}`;
      case 'AUTH_PASSWORD_RESET_FAILED_USER_NOT_FOUND':
      case 'AUTH_PASSWORD_RESET_FAILED_INCORRECT_SECURITY_ANSWER':
      case 'AUTH_PASSWORD_RESET_ERROR':
        return `Password reset failed for ${usernameDetail}`;
      case 'AUTH_PASSWORD_RESET_EMAIL_REQUESTED':
        return `Password reset email requested for ${String(details.email ?? usernameDetail)}`;
      case 'WORKSPACE_CREATED':
        return `${actor} created workspace "${workspaceName}"`;
      case 'WORKSPACE_DELETED':
        return `${actor} deleted workspace "${workspaceName}"`;
      case 'WORKSPACE_SWITCHED':
        return `${actor} switched to workspace "${workspaceName}"`;
      case 'WORKSPACE_MEMBER_INVITED':
        return `${actor} invited ${String(details.invitedEmail ?? '')} to workspace "${workspaceName}"`;
      case 'WORKSPACE_MEMBER_REMOVED':
        return `${actor} removed ${String(details.removedUser ?? '')} from workspace "${workspaceName}"`;
      default:
        return `${actor}: ${log.message}`;
    }
  };

  const getDetailedChangeText = (log: LogEntry) => {
    const details = (log.details || {}) as Record<string, unknown>;
    if (log.message === 'INVENTORY_ITEM_UPDATED') {
      const rawChanges = details.changes as Array<{ field?: string; from?: string; to?: string }> | undefined;
      if (!rawChanges || rawChanges.length === 0) return 'No field-level changes captured.';
      const formattedChanges = rawChanges
        .filter((change) => change?.field)
        .map((change) => `${String(change.field)}: ${String(change.from ?? '(empty)')} -> ${String(change.to ?? '(empty)')}`);
      return formattedChanges.join(' | ');
    }
    if (log.message === 'USER_DEFINED_ITEMS_UPDATED') {
      const added = Array.isArray(details.added) ? (details.added as string[]) : [];
      const removed = Array.isArray(details.removed) ? (details.removed as string[]) : [];
      const renamed = Array.isArray(details.renamed) ? (details.renamed as string[]) : [];
      return [
        added.length ? `added: ${added.join(', ')}` : '',
        removed.length ? `removed: ${removed.join(', ')}` : '',
        renamed.length ? `renamed: ${renamed.join(', ')}` : '',
      ]
        .filter(Boolean)
        .join(' | ');
    }
    if (log.message === 'FINANCIAL_EXPENSE_TYPES_UPDATED' || log.message === 'FINANCIAL_COST_CENTERS_UPDATED') {
      const addedCodes = Array.isArray(details.addedCodes) ? (details.addedCodes as string[]) : [];
      const removedCodes = Array.isArray(details.removedCodes) ? (details.removedCodes as string[]) : [];
      return [
        addedCodes.length ? `added: ${addedCodes.join(', ')}` : '',
        removedCodes.length ? `removed: ${removedCodes.join(', ')}` : '',
      ]
        .filter(Boolean)
        .join(' | ');
    }
    return '';
  };

  const exportLogs = (formatType: 'json' | 'csv') => {
    const timestampText = new Date().toISOString().replace(/[:.]/g, '-');
    if (formatType === 'json') {
      const jsonBlob = new Blob([JSON.stringify(filteredLogs, null, 2)], { type: 'application/json;charset=utf-8' });
      const jsonLink = document.createElement('a');
      jsonLink.href = URL.createObjectURL(jsonBlob);
      jsonLink.download = `system-logs-${timestampText}.json`;
      jsonLink.click();
      URL.revokeObjectURL(jsonLink.href);
      return;
    }

    const header = ['timestamp', 'level', 'type', 'message', 'summary', 'component', 'details'];
    const csvRows = filteredLogs.map((logEntry) => [
      new Date(logEntry.timestamp).toISOString(),
      logEntry.level,
      logEntry.type,
      logEntry.message,
      parseLogSummary(logEntry),
      logEntry.component || '',
      JSON.stringify(logEntry.details || {}),
    ]);
    const csvContent = [header, ...csvRows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const csvBlob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
    const csvLink = document.createElement('a');
    csvLink.href = URL.createObjectURL(csvBlob);
    csvLink.download = `system-logs-${timestampText}.csv`;
    csvLink.click();
    URL.revokeObjectURL(csvLink.href);
  };

  const getLogLevelColor = (level: LogEntry['level']) => {
    switch (level) {
      case 'error': return 'text-red-500';
      case 'warn': return 'text-yellow-500';
      case 'info': return 'text-blue-500';
      case 'debug': return 'text-gray-500';
      default: return '';
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            title="Refresh logs"
            onClick={refreshLogs}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            title={isNewestFirst ? "Switch to oldest first" : "Switch to newest first"}
            onClick={() => setIsNewestFirst((previousValue) => !previousValue)}
          >
            {isNewestFirst ? <ArrowDownAZ className="h-4 w-4" /> : <ArrowUpZA className="h-4 w-4" />}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsCompactView((previousValue) => !previousValue)}
          >
            {isCompactView ? 'Detailed View' : 'Compact View'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowRawDetails((previousValue) => !previousValue)}
          >
            {showRawDetails ? 'Hide Raw' : 'Show Raw'}
          </Button>
          <Button variant="outline" size="sm" onClick={() => exportLogs('csv')}>
            <Download className="h-4 w-4 mr-1" />
            CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => exportLogs('json')}>
            <Download className="h-4 w-4 mr-1" />
            JSON
          </Button>
          <Button
            variant="outline"
            size="icon"
            title="Clear visible output (durable logs stay saved)"
            onClick={() => setIsViewCleared(true)}
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search logs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8"
            />
          </div>
          <div className="flex gap-2">
            <select
              value={selectedLevel}
              onChange={(e) => setSelectedLevel(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
            >
              <option value="all">All Levels</option>
              <option value="debug">Debug</option>
              <option value="info">Info</option>
              <option value="warn">Warning</option>
              <option value="error">Error</option>
            </select>
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
            >
              <option value="all">All Types</option>
              <option value="system">System</option>
              <option value="audit">Audit</option>
              <option value="performance">Performance</option>
              <option value="security">Security</option>
            </select>
          </div>
        </div>

        {isViewCleared && (
          <div className="rounded-md border border-border/70 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
            Visible output cleared. Durable logs are still stored.
            <Button
              variant="link"
              className="h-auto px-2 py-0 text-xs"
              onClick={refreshLogs}
            >
              Reload
            </Button>
          </div>
        )}

        <ScrollArea className="h-[500px] rounded-md border">
          <div className="space-y-2 p-4">
            {filteredLogs.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No logs found
              </div>
            ) : (
              filteredLogs.map((log, index) => (
                <div
                  key={index}
                  className={`p-4 rounded-lg border ${getLogLevelColor(log.level)}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-medium truncate">
                      {parseLogSummary(log)}
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {format(log.timestamp, 'MMM d, yyyy HH:mm:ss')}
                    </span>
                  </div>
                  {!isCompactView && (
                    <div className="text-xs text-muted-foreground mt-1">
                      {log.message}
                      {getDetailedChangeText(log) ? ` | ${getDetailedChangeText(log)}` : ''}
                    </div>
                  )}
                  {showRawDetails && log.details && (
                    <pre className="mt-2 text-xs bg-muted p-2 rounded overflow-x-auto">
                      {JSON.stringify(log.details, null, 2)}
                    </pre>
                  )}
                  {!isCompactView && log.component && (
                    <div className="mt-1 text-xs text-muted-foreground">
                      Component: {log.component}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
} 