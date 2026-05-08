import * as React from 'react';
import { format } from 'date-fns';
import { InventoryItem, ItemWithSubcategories } from '@/types/inventory';
import { formatCurrency } from '@/lib/utils';
import { getSettings } from '@/lib/storageService';
import { resolveLocationDisplay } from '@/lib/resolveLocationLabel';
import { accentColorForLocation, accentColorForProject } from '@/lib/lookupAccentColors';
import { Badge } from "@/components/ui/badge";
import { BarChart2, Lock, StickyNote } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface FormatCellValueProps {
  item: InventoryItem;
  column: string;
  allocation?: { reserved?: number; checkedOut?: number };
  compact?: boolean;
  checkoutActivity?: {
    type: 'check-in' | 'check-out';
    timestamp: Date;
    performedBy: string;
    cabinetName: string;
    quantity: number;
  };
}

export function FormatCellValue({
  item,
  column,
  allocation,
  compact = false,
  checkoutActivity,
}: FormatCellValueProps): React.ReactNode {
  const settings = getSettings();

  const getResolvedLabel = (value: string | undefined, source: 'categories' | 'locations' | 'projects') => {
    if (!value) return '-';
    const list = settings[source] || [];

    const walk = (nodes: any[], parentPath = ''): { id: string; namePath: string }[] =>
      nodes.flatMap((node) => {
        const namePath = parentPath ? `${parentPath}/${node.name}` : node.name;
        const current = { id: node.id, namePath };
        const children = Array.isArray(node.children) ? walk(node.children, namePath) : [];
        return [current, ...children];
      });

    const flattened = walk(list as any[]);
    const foundById = flattened.find((entry) => entry.id === value);
    if (foundById) return foundById.namePath;

    const foundByName = flattened.find((entry) => entry.namePath === value);
    if (foundByName) return foundByName.namePath;

    return value;
  };

  const getCategoryColor = (value: string | undefined) => {
    if (!value) return undefined;
    const categories = settings.categories || [];
    const directMatch = categories.find((entry: any) => entry.id === value || entry.name === value);
    if (directMatch?.color) return directMatch.color as string;

    const categoryPath = getResolvedLabel(value, 'categories');
    const topLevelCategoryName = categoryPath.split('/')[0];
    const topLevelMatch = categories.find((entry: any) => entry.name === topLevelCategoryName);
    if (topLevelMatch?.color) return topLevelMatch.color as string;

    const fallbackPalette = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#84cc16', '#f97316'];
    const seed = topLevelCategoryName.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
    return fallbackPalette[seed % fallbackPalette.length];
  };

  if (column === 'lastUpdated') {
    const dateValue = item[column] instanceof Date ? item[column] : new Date(item[column]);
    const compactDateText = format(dateValue, 'MMM d, yyyy');
    const compactMetaText = item.lastModifiedBy ? ` (${item.lastModifiedBy})` : '';
    if (compact) {
      return `${compactDateText}${compactMetaText}`;
    }
    return (
      <div className="flex flex-col">
        <span>{format(dateValue, 'MMM d, yyyy · h:mm a')}</span>
        {item.lastModifiedBy && (
          <span className="text-xs text-muted-foreground">
            by {item.lastModifiedBy}
          </span>
        )}
      </div>
    );
  }
  if (column === 'lastModifiedBy') {
    const hasDate = !!item.lastUpdated;
    const dateValue = hasDate
      ? item.lastUpdated instanceof Date
        ? item.lastUpdated
        : new Date(item.lastUpdated)
      : null;
    const validDate = dateValue && !Number.isNaN(dateValue.getTime()) ? dateValue : null;
    if (compact) {
      if (!item.lastModifiedBy) {
        return '-';
      }
      return validDate
        ? `${item.lastModifiedBy} · ${format(validDate, 'MMM d, yyyy')}`
        : item.lastModifiedBy;
    }
    return (
      <div className="flex flex-col">
        <span>{item.lastModifiedBy || '-'}</span>
        {validDate ? (
          <span className="text-xs text-muted-foreground">
            {format(validDate, 'MMM d, yyyy · h:mm a')}
          </span>
        ) : null}
      </div>
    );
  }
  if (column === 'costPerUnit') {
    return formatCurrency(item[column] as number);
  }
  if (column === 'totalValue') {
    return formatCurrency(item.quantity * (item.costPerUnit || 0));
  }
  if (column === 'quantity') {
    const quantity = Number(item[column] ?? 0);
    const reserved = Number(allocation?.reserved ?? 0);
    const checkedOut = Number(allocation?.checkedOut ?? 0);
    const available = Math.max(0, quantity - reserved);
    return (
      <div className="flex flex-col">
        <span>{quantity} {item.unit || ''}</span>
        {(reserved > 0 || checkedOut > 0) ? (
          <span className="text-xs text-muted-foreground">
            reserved {reserved} · available {available} · out {checkedOut}
          </span>
        ) : null}
      </div>
    );
  }
  if (column === 'name') {
    const showCheckInOutFlag = Boolean(item.cabinet || checkoutActivity);
    const checkFlagClassName = checkoutActivity
      ? checkoutActivity.type === 'check-out'
        ? 'border-red-500/40 bg-red-500/10 text-red-300'
        : 'border-green-500/40 bg-green-500/10 text-green-300'
      : 'border-blue-500/40 bg-blue-500/10 text-blue-300';
    const checkFlagLabel = checkoutActivity
      ? checkoutActivity.type === 'check-out'
        ? 'Checked out'
        : 'Checked in'
      : 'Check In/Out';
    return (
      <div className="flex min-w-0 flex-col gap-1">
        <span className="trackit-clamp-2 min-w-0 break-words [overflow-wrap:anywhere]">
          {item[column]?.toString() || '-'}
        </span>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {item.reorderLevel !== undefined && item.quantity <= item.reorderLevel && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="destructive" className="flex items-center gap-1 px-2 py-0">
                    <BarChart2 className="h-3 w-3" />
                    <span className="text-xs">Low</span>
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Quantity below reorder level ({item.reorderLevel})</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          {item.notes && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="secondary" className="flex items-center gap-1 px-2 py-0">
                    <StickyNote className="h-3 w-3" />
                  </Badge>
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-[300px]">
                  <p className="whitespace-pre-wrap break-words text-sm">{item.notes}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          {showCheckInOutFlag && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="outline" className={`flex items-center gap-1 px-2 py-0 ${checkFlagClassName}`}>
                    <Lock className="h-3 w-3" />
                    <span className="text-xs whitespace-nowrap">{checkFlagLabel}</span>
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  <p>
                    {checkoutActivity
                      ? `Last ${checkoutActivity.type === 'check-out' ? 'check-out' : 'check-in'} at ${checkoutActivity.cabinetName} by ${checkoutActivity.performedBy} · ${format(checkoutActivity.timestamp, 'MMM d, h:mm a')}`
                      : 'This item is assigned to a cabinet and participates in check-in/out tracking.'}
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </div>
    );
  }
  if (column === 'category') {
    const resolvedCategory = getResolvedLabel(item.category, 'categories');
    const categoryColor = getCategoryColor(item.category);
    return (
      <div className="flex min-w-0 items-center gap-2">
        <span
          className="inline-block h-4 w-1.5 rounded-sm border border-border/60"
          style={{ backgroundColor: categoryColor || 'hsl(var(--muted-foreground))' }}
          aria-hidden="true"
        />
        <span className="min-w-0 break-words">{resolvedCategory}</span>
      </div>
    );
  }
  if (column === 'location') {
    const locLabel = resolveLocationDisplay(item.location, (settings.locations || []) as ItemWithSubcategories[]);
    const locColor = accentColorForLocation(item.location, (settings.locations || []) as ItemWithSubcategories[]);
    return (
      <div className="flex min-w-0 items-center gap-2">
        <span
          className="inline-block h-4 w-1.5 rounded-sm border border-border/60"
          style={{ backgroundColor: locColor }}
          aria-hidden="true"
        />
        <span className="min-w-0 break-words">{locLabel}</span>
      </div>
    );
  }
  if (column === 'project') {
    const projectLabel = getResolvedLabel(item.project, 'projects');
    const projectColor = accentColorForProject(item.project, (settings.projects || []) as ItemWithSubcategories[]);
    return (
      <div className="flex min-w-0 items-center gap-2">
        <span
          className="inline-block h-4 w-1.5 rounded-sm border border-border/60"
          style={{ backgroundColor: projectColor }}
          aria-hidden="true"
        />
        <span className="min-w-0 break-words">{projectLabel}</span>
      </div>
    );
  }
  if (column === 'recordId') {
    return item.recordId || '—';
  }
  if (column === 'photoUrl') {
    if (!item.photoUrl) {
      return '—';
    }
    return (
      <img
        src={item.photoUrl}
        alt=""
        className="h-9 w-9 rounded border object-cover"
      />
    );
  }
  const value = item[column as keyof typeof item];
  return value?.toString() || '-';
} 