import * as React from 'react';
import { format } from 'date-fns';
import { InventoryItem, ItemWithSubcategories } from '@/types/inventory';
import { formatCurrency } from '@/lib/utils';
import { getSettings } from '@/lib/storageService';
import { resolveLocationDisplay } from '@/lib/resolveLocationLabel';
import { accentColorForLocation, accentColorForProject } from '@/lib/lookupAccentColors';
import { Badge } from "@/components/ui/badge";
import { BarChart2, StickyNote } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function FormatCellValue({ item, column }: { item: InventoryItem; column: string }): React.ReactNode {
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
    return `${item[column]} ${item.unit || ''}`;
  }
  if (column === 'name') {
    return (
      <div className="flex items-center gap-2">
        <span>{item[column]?.toString() || '-'}</span>
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
      </div>
    );
  }
  if (column === 'category') {
    const resolvedCategory = getResolvedLabel(item.category, 'categories');
    const categoryColor = getCategoryColor(item.category);
    return (
      <div className="flex items-center gap-2">
        <span
          className="inline-block h-4 w-1.5 rounded-sm border border-border/60"
          style={{ backgroundColor: categoryColor || 'hsl(var(--muted-foreground))' }}
          aria-hidden="true"
        />
        <span>{resolvedCategory}</span>
      </div>
    );
  }
  if (column === 'location') {
    const locLabel = resolveLocationDisplay(item.location, (settings.locations || []) as ItemWithSubcategories[]);
    const locColor = accentColorForLocation(item.location, (settings.locations || []) as ItemWithSubcategories[]);
    return (
      <div className="flex items-center gap-2">
        <span
          className="inline-block h-4 w-1.5 rounded-sm border border-border/60"
          style={{ backgroundColor: locColor }}
          aria-hidden="true"
        />
        <span>{locLabel}</span>
      </div>
    );
  }
  if (column === 'project') {
    const projectLabel = getResolvedLabel(item.project, 'projects');
    const projectColor = accentColorForProject(item.project, (settings.projects || []) as ItemWithSubcategories[]);
    return (
      <div className="flex items-center gap-2">
        <span
          className="inline-block h-4 w-1.5 rounded-sm border border-border/60"
          style={{ backgroundColor: projectColor }}
          aria-hidden="true"
        />
        <span>{projectLabel}</span>
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