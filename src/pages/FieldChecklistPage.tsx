import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ElementRef,
  type Ref,
} from 'react';
import { useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import {
  ArrowDownUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Clock3,
  Car,
  Lock,
  Trash2,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ActionRail, type ActionRailItem } from '@/components/ui/action-rail';
import { useHorizontalScrollHints } from '@/components/ui/useHorizontalScrollHints';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ChecklistEditor } from '@/components/productions/ChecklistEditor';
import { VehiclePacklistEditor } from '@/components/productions/VehiclePacklistEditor';
import { cn } from '@/lib/utils';
import { getStableGroupAccentHex } from '@/lib/groupAccentColor';
import { STORAGE_KEYS } from '@/lib/storageService';
import { getItems } from '@/lib/storageService';
import { logger } from '@/lib/logging';
import {
  appendFieldChecklistActivity,
  clearFieldChecklistActivities,
  getFieldChecklistActivities,
  type FieldChecklistActivityEntry,
} from '@/lib/fieldChecklistActivity';
import {
  getProductions,
  PRODUCTIONS_UPDATED_EVENT,
  updateProduction,
} from '@/lib/productionService';
import {
  ensureVehiclePacklistShape,
  mirrorChecklistCompletionOntoVehiclePacklists,
  upsertVehiclePacklistItemById,
} from '@/lib/vehiclePacklistUtils';
import { DEFAULT_SETTINGS_CHANGED_EVENT, SettingsService } from '@/lib/settingsService';
import type {
  ChecklistGroup,
  ChecklistItem,
  Production,
  ProductionStatus,
  VehiclePacklist,
} from '@/types/productions';

/** Field checklist dropdown: active productions only (matches typical “show” workflow). */
const FIELD_CHECKLIST_ACTIVE_STATUSES: ProductionStatus[] = ['confirmed', 'in_progress'];

/** Sort/group key: vehicle packlines by vehicle name; field checklist lines by production + checklist bucket (avoids mixing trucks across productions). */
function fieldActivityVehicleGroupKey(entry: {
  productionId: string;
  productionName: string;
  scope: 'checklist' | 'truck';
  vehicleName?: string;
}): string {
  if (entry.scope === 'truck' && entry.vehicleName?.trim()) {
    return `${entry.productionId}\u0001${entry.vehicleName.trim()}`;
  }
  return `${entry.productionId}\u0001\u0000field-checklist`;
}

function fieldActivityVehicleSectionTitle(entry: {
  productionName: string;
  scope: 'checklist' | 'truck';
  vehicleName?: string;
}): string {
  if (entry.scope === 'truck' && entry.vehicleName?.trim()) {
    return entry.vehicleName.trim();
  }
  return `${entry.productionName} · Field checklist`;
}

/** Same accent hash as vehicle section headers — for Recent activity borders. */
function fieldActivityAccentHex(activity: {
  scope: 'checklist' | 'truck';
  vehicleName?: string;
  productionName: string;
  groupTitle?: string;
}): string {
  if (activity.scope === 'truck' && activity.vehicleName?.trim()) {
    return getStableGroupAccentHex(activity.vehicleName.trim());
  }
  const checklistKey = (activity.groupTitle?.trim() || activity.productionName).trim() || 'checklist';
  return getStableGroupAccentHex(checklistKey);
}

function fieldActivityAccentFromGroupKey(key: string, title: string): string {
  const sep = '\u0001';
  const idx = key.indexOf(sep);
  if (idx === -1) return getStableGroupAccentHex(title);
  const tail = key.slice(idx + sep.length);
  if (tail.includes('field-checklist')) {
    return getStableGroupAccentHex(title);
  }
  return getStableGroupAccentHex(tail);
}

function applyFieldAudit(item: ChecklistItem, completed: boolean, userLabel: string): ChecklistItem {
  const now = new Date().toISOString();
  return {
    ...item,
    completed,
    fieldCompletedAt: completed ? now : undefined,
    fieldCompletedBy: completed ? userLabel : undefined,
  };
}

function countChecklistCompletion(items: Pick<ChecklistItem, 'completed'>[]): { done: number; total: number } {
  const total = items.length;
  const done = items.filter((i) => i.completed).length;
  return { done, total };
}

/** Touch checklist / vehicle headers: not checked · in progress #/# · complete */
function FieldChecklistProgressBadge({ done, total }: { done: number; total: number }) {
  if (total === 0) return null;
  const base =
    'inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums leading-none';
  if (done === 0) {
    return (
      <span
        className={cn(
          base,
          'bg-amber-500/15 text-amber-950 ring-1 ring-amber-600/35 dark:bg-amber-950/40 dark:text-amber-50 dark:ring-amber-500/40'
        )}
      >
        Not checked
      </span>
    );
  }
  if (done === total) {
    return <span className={cn(base, 'bg-emerald-600 text-white shadow-sm dark:bg-emerald-700')}>Complete</span>;
  }
  return (
    <span
      className={cn(
        base,
        'bg-sky-600/15 text-sky-950 ring-1 ring-sky-600/30 dark:bg-sky-950/45 dark:text-sky-100 dark:ring-sky-500/35'
      )}
    >
      In progress ({done}/{total})
    </span>
  );
}

function toggleChecklistItemUpdate(
  production: Production,
  groupId: string,
  itemId: string,
  nextCompleted: boolean,
  userLabel: string
): Partial<Production> {
  const nextGroups: ChecklistGroup[] = production.checklistGroups.map((group) => {
    if (group.id !== groupId) return group;
    return {
      ...group,
      items: group.items.map((item) =>
        item.id === itemId ? applyFieldAudit(item, nextCompleted, userLabel) : item
      ),
    };
  });
  const vehiclePacklists = mirrorChecklistCompletionOntoVehiclePacklists(
    production.vehiclePacklists,
    nextGroups
  );
  return { checklistGroups: nextGroups, vehiclePacklists };
}

function toggleTruckItemUpdate(
  production: Production,
  packlistId: string,
  itemId: string,
  nextCompleted: boolean,
  userLabel: string
): Partial<Production> {
  const vehiclePacklists = production.vehiclePacklists.map((packlist) => {
    if (packlist.id !== packlistId) return packlist;
    return upsertVehiclePacklistItemById(packlist, itemId, (item) =>
      applyFieldAudit(item, nextCompleted, userLabel)
    );
  });
  return { vehiclePacklists };
}

export default function FieldChecklistPage() {
  const { currentUser } = useAuth();
  const userLabel =
    (currentUser?.username || currentUser?.displayName || '').trim() || 'User';

  const [searchParams, setSearchParams] = useSearchParams();
  const productionIdQuery = searchParams.get('productionId') ?? '';

  const [productions, setProductions] = useState<Production[]>(() => getProductions());
  const [selectedProductionId, setSelectedProductionId] = useState(() => productionIdQuery);
  const [recentLocal, setRecentLocal] = useState<FieldChecklistActivityEntry[]>(() =>
    getFieldChecklistActivities()
  );
  const [activityView, setActivityView] = useState<'list' | 'vehicle'>('list');
  const [activitySortBy, setActivitySortBy] = useState<'vehicle' | 'time'>('time');
  const [activitySortDirection, setActivitySortDirection] = useState<'asc' | 'desc'>('desc');
  const {
    scrollRef: activityTabsListRef,
    isOverflowing: isActivityTabsOverflowing,
    canScrollLeft: canActivityTabsScrollLeft,
    canScrollRight: canActivityTabsScrollRight,
    shouldPulseRightHint: shouldPulseActivityTabsHint,
  } = useHorizontalScrollHints<ElementRef<typeof TabsList>>({
    pulseStorageKey: 'field-checklist-activity-tabs-hint-pulsed',
  });
  const [mobileTabletUi, setMobileTabletUi] = useState(
    () => SettingsService.loadDefaultSettings().mobileTabletUi
  );

  useEffect(() => {
    const sync = () => setMobileTabletUi(SettingsService.loadDefaultSettings().mobileTabletUi);
    window.addEventListener(DEFAULT_SETTINGS_CHANGED_EVENT, sync);
    return () => window.removeEventListener(DEFAULT_SETTINGS_CHANGED_EVENT, sync);
  }, []);

  useEffect(() => {
    const refresh = () => setProductions(getProductions());
    window.addEventListener(PRODUCTIONS_UPDATED_EVENT, refresh);
    return () => window.removeEventListener(PRODUCTIONS_UPDATED_EVENT, refresh);
  }, []);

  /** Other tabs / windows update `localStorage` — keep this page in sync for concurrent-edit hints. */
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEYS.PRODUCTIONS) return;
      setProductions(getProductions());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const lastLocalEditAtRef = useRef(0);
  const prevUpdatedAtRef = useRef<string | null>(null);
  const [concurrentRemoteHint, setConcurrentRemoteHint] = useState(false);

  const bumpLocalEdit = useCallback(() => {
    lastLocalEditAtRef.current = Date.now();
    setConcurrentRemoteHint(false);
  }, []);

  useEffect(() => {
    const list = getProductions();
    const p = list.find((x) => x.id === selectedProductionId);
    prevUpdatedAtRef.current = p?.updatedAt ?? null;
    setConcurrentRemoteHint(false);
  }, [selectedProductionId]);

  useEffect(() => {
    const p = productions.find((x) => x.id === selectedProductionId);
    if (!p) return;
    const prev = prevUpdatedAtRef.current;
    if (prev !== null && p.updatedAt !== prev) {
      if (Date.now() - lastLocalEditAtRef.current > 2000) {
        setConcurrentRemoteHint(true);
      }
    }
    prevUpdatedAtRef.current = p.updatedAt;
  }, [productions, selectedProductionId]);

  useEffect(() => {
    if (productionIdQuery && productionIdQuery !== selectedProductionId) {
      setSelectedProductionId(productionIdQuery);
    }
  }, [productionIdQuery, selectedProductionId]);

  const activeProductions = useMemo(
    () => productions.filter((p) => FIELD_CHECKLIST_ACTIVE_STATUSES.includes(p.status)),
    [productions]
  );

  const selectedProduction = useMemo(
    () => productions.find((p) => p.id === selectedProductionId) ?? null,
    [productions, selectedProductionId]
  );

  const persistProductionIdInUrl = useCallback(
    (id: string) => {
      const next = new URLSearchParams(searchParams);
      if (id) next.set('productionId', id);
      else next.delete('productionId');
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams]
  );

  useEffect(() => {
    if (!selectedProductionId) return;
    if (activeProductions.some((p) => p.id === selectedProductionId)) return;
    setSelectedProductionId('');
    persistProductionIdInUrl('');
  }, [selectedProductionId, activeProductions, persistProductionIdInUrl]);

  const handleProductionChange = (value: string) => {
    setSelectedProductionId(value);
    persistProductionIdInUrl(value);
  };

  const logAndRemember = useCallback(
    (entry: Omit<FieldChecklistActivityEntry, 'at' | 'by'> & { at?: string; by?: string }) => {
      const full: FieldChecklistActivityEntry = {
        ...entry,
        at: entry.at ?? new Date().toISOString(),
        by: entry.by ?? userLabel,
      };
      appendFieldChecklistActivity(full);
      setRecentLocal(getFieldChecklistActivities());
      logger.info(
        'audit',
        'FIELD_CHECKLIST_TOGGLE',
        {
          productionId: full.productionId,
          productionName: full.productionName,
          scope: full.scope,
          groupTitle: full.groupTitle,
          sectionTitle: full.sectionTitle,
          vehicleName: full.vehicleName,
          itemLabel: full.itemLabel,
          completed: full.completed,
          performedBy: full.by,
          category: 'field_checklist_audit',
        },
        'Field checklist audit'
      );
    },
    [userLabel]
  );

  const onToggleChecklistItem = (
    production: Production,
    groupTitle: string,
    groupId: string,
    item: ChecklistItem,
    checked: boolean
  ) => {
    bumpLocalEdit();
    const updates = toggleChecklistItemUpdate(production, groupId, item.id, checked, userLabel);
    const updated = updateProduction(production.id, updates);
    if (!updated) return;
    logAndRemember({
      productionId: production.id,
      productionName: production.name,
      scope: 'checklist',
      groupTitle,
      itemLabel: item.label,
      completed: checked,
    });
  };

  const onToggleTruckItem = (
    production: Production,
    vehicleName: string,
    packlistId: string,
    item: ChecklistItem,
    sectionTitle: string | undefined,
    checked: boolean
  ) => {
    bumpLocalEdit();
    const updates = toggleTruckItemUpdate(production, packlistId, item.id, checked, userLabel);
    const updated = updateProduction(production.id, updates);
    if (!updated) return;
    logAndRemember({
      productionId: production.id,
      productionName: production.name,
      scope: 'truck',
      vehicleName,
      sectionTitle,
      itemLabel: item.label,
      completed: checked,
    });
  };

  const inventoryItems = useMemo(() => getItems(), [selectedProductionId]);

  const handleDesktopChecklistChange = useCallback(
    (nextGroups: ChecklistGroup[]) => {
      bumpLocalEdit();
      const prod = getProductions().find((p) => p.id === selectedProductionId);
      if (!prod) return;
      const updated = updateProduction(prod.id, {
        checklistGroups: nextGroups,
        vehiclePacklists: mirrorChecklistCompletionOntoVehiclePacklists(prod.vehiclePacklists, nextGroups),
      });
      if (updated) setProductions(getProductions());
    },
    [selectedProductionId, bumpLocalEdit]
  );

  const handleDesktopVehiclePacklistsChange = useCallback(
    (nextPacklists: VehiclePacklist[]) => {
      bumpLocalEdit();
      const prod = getProductions().find((p) => p.id === selectedProductionId);
      if (!prod) return;
      const updated = updateProduction(prod.id, { vehiclePacklists: nextPacklists });
      if (updated) setProductions(getProductions());
    },
    [selectedProductionId, bumpLocalEdit]
  );

  const handleChecklistGroupsWhenMirroredFromPack = useCallback(
    (nextGroups: ChecklistGroup[]) => {
      bumpLocalEdit();
      const prod = getProductions().find((p) => p.id === selectedProductionId);
      if (!prod) return;
      const vehiclePacklists = mirrorChecklistCompletionOntoVehiclePacklists(prod.vehiclePacklists, nextGroups);
      const updated = updateProduction(prod.id, { checklistGroups: nextGroups, vehiclePacklists });
      if (updated) setProductions(getProductions());
    },
    [selectedProductionId, bumpLocalEdit]
  );

  const touch = mobileTabletUi;

  const normalizedActivities = useMemo(
    () =>
      recentLocal.map((activity, index) => {
        const base = {
          id: `${activity.at}-${index}`,
          productionName: activity.productionName,
          productionId: activity.productionId,
          itemLabel: activity.itemLabel,
          completed: activity.completed,
          scope: activity.scope,
          vehicleName: activity.vehicleName,
          sectionTitle: activity.sectionTitle,
          groupTitle: activity.groupTitle,
          performedBy: activity.by,
          timestamp: new Date(activity.at),
        };
        return {
          ...base,
          vehicleGroupKey: fieldActivityVehicleGroupKey(base),
          vehicleSectionTitle: fieldActivityVehicleSectionTitle(base),
        };
      }),
    [recentLocal]
  );

  const sortedActivityList = useMemo(() => {
    return [...normalizedActivities].sort((left, right) => {
      const directionMultiplier = activitySortDirection === 'asc' ? 1 : -1;
      if (activitySortBy === 'vehicle') {
        const compareVehicle = left.vehicleGroupKey.localeCompare(right.vehicleGroupKey);
        if (compareVehicle !== 0) {
          return compareVehicle * directionMultiplier;
        }
      }
      return (left.timestamp.getTime() - right.timestamp.getTime()) * directionMultiplier;
    });
  }, [normalizedActivities, activitySortBy, activitySortDirection]);

  /**
   * Per vehicle / field-checklist bucket: latest toggle per item wins (binary on-vehicle vs missing).
   * Does not mirror secure-cabinet quantity math — field checks verify prelisted gear.
   */
  const vehicleActivityGroups = useMemo(() => {
    type Norm = (typeof normalizedActivities)[number];
    const byKey = new Map<string, Norm[]>();
    for (const entry of normalizedActivities) {
      const k = entry.vehicleGroupKey;
      const list = byKey.get(k);
      if (list) list.push(entry);
      else byKey.set(k, [entry]);
    }

    const groups: {
      key: string;
      title: string;
      accentHex: string;
      items: { label: string; onVehicle: boolean }[];
      missingLabels: string[];
      allVerified: boolean;
    }[] = [];

    for (const [key, groupEntries] of byKey) {
      const title = groupEntries[0]?.vehicleSectionTitle ?? key;
      const chronological = [...groupEntries].sort(
        (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
      );
      const latestByLabel = new Map<string, boolean>();
      for (const e of chronological) {
        latestByLabel.set(e.itemLabel, e.completed);
      }
      const items = [...latestByLabel.entries()]
        .map(([label, onVehicle]) => ({ label, onVehicle }))
        .sort((a, b) => a.label.localeCompare(b.label));
      const missingLabels = items.filter((i) => !i.onVehicle).map((i) => i.label);
      groups.push({
        key,
        title,
        accentHex: fieldActivityAccentFromGroupKey(key, title),
        items,
        missingLabels,
        allVerified: missingLabels.length === 0,
      });
    }

    groups.sort((a, b) => a.title.localeCompare(b.title));
    return groups;
  }, [normalizedActivities]);

  const activityActionItems: ActionRailItem[] = useMemo(
    () => [
      {
        id: 'toggle-sort-by',
        label: activitySortBy === 'time' ? 'Sorting by time/date' : 'Sorting by vehicle',
        icon:
          activitySortBy === 'time' ? (
            <Clock3 className="h-4 w-4" />
          ) : (
            <Car className="h-4 w-4" />
          ),
        onClick: () => setActivitySortBy((previous) => (previous === 'time' ? 'vehicle' : 'time')),
        active: activitySortBy === 'vehicle',
      },
      {
        id: 'toggle-sort-direction',
        label: activitySortDirection === 'desc' ? 'Newest first' : 'Oldest first',
        icon: <ArrowDownUp className="h-4 w-4" />,
        onClick: () =>
          setActivitySortDirection((previous) => (previous === 'desc' ? 'asc' : 'desc')),
        active: activitySortDirection === 'asc',
      },
      {
        id: 'clear-activity',
        label: 'Clear activity',
        icon: <Trash2 className="h-4 w-4" />,
        onClick: () => {
          clearFieldChecklistActivities();
          setRecentLocal([]);
        },
        disabled: sortedActivityList.length === 0,
      },
    ],
    [activitySortBy, activitySortDirection, sortedActivityList.length]
  );

  return (
    <div
      className={cn(
        'field-checklist-page mx-auto w-full min-w-0',
        touch
          ? 'max-w-lg px-3 pb-[max(1rem,env(safe-area-inset-bottom,0px))] pt-3 sm:px-4 sm:pb-8 sm:pt-6'
          : 'max-w-[min(100%,1200px)] px-4 py-6 sm:px-6'
      )}
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <ClipboardList
          className={cn('shrink-0 text-primary', touch ? 'h-6 w-6' : 'h-5 w-5')}
          aria-hidden
        />
        <h1 className={cn('font-semibold tracking-tight', touch ? 'text-xl sm:text-2xl' : 'text-2xl')}>
          Field checklist
        </h1>
        {selectedProduction && concurrentRemoteHint ? (
          <span
            className="inline-flex items-center gap-1 rounded-full border border-amber-500/35 bg-amber-500/10 px-2 py-1 text-xs font-medium text-amber-950 dark:text-amber-100"
            title="Production data changed outside this session"
          >
            <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden />
            Concurrent update
          </span>
        ) : null}
      </div>

      <Card className="mb-4 border shadow-sm">
        <CardHeader className="px-4 pb-2 pt-4 sm:px-6">
          <CardTitle className={touch ? 'text-base' : 'text-sm font-semibold'}>Production</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 sm:px-6">
          {activeProductions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No productions in Confirmed or In progress. Update status on the Productions page.
            </p>
          ) : (
            <Select value={selectedProductionId || undefined} onValueChange={handleProductionChange}>
              <SelectTrigger
                className={cn('w-full', touch ? 'h-12 text-base' : 'h-9 text-sm')}
              >
                <SelectValue placeholder="Select production" />
              </SelectTrigger>
              <SelectContent>
                {activeProductions.map((p) => (
                  <SelectItem key={p.id} value={p.id} className={touch ? 'text-base' : 'text-sm'}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </CardContent>
      </Card>

      {selectedProduction && concurrentRemoteHint ? (
        <Alert className="mb-4 border-amber-500/35 bg-amber-500/10 py-3">
          <Lock className="h-4 w-4 text-amber-900 dark:text-amber-200" aria-hidden />
          <AlertDescription className="text-sm text-amber-950 dark:text-amber-50 [&_p]:mb-0">
            Another tab or device saved this production. Rows already refreshed — confirm checkboxes match what you expect (last write wins).
          </AlertDescription>
        </Alert>
      ) : null}

      {!selectedProduction ? (
        <p className="rounded-md border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
          Select a production.
        </p>
      ) : (
        <Tabs defaultValue="checklist" className="w-full">
          <TabsList
            className={cn(
              'grid w-full grid-cols-2 rounded-lg p-1',
              touch ? 'h-12' : 'h-10'
            )}
          >
            <TabsTrigger value="checklist" className={touch ? 'text-sm sm:text-base' : 'text-sm'}>
              Checklist
            </TabsTrigger>
            <TabsTrigger value="vehicle" className={touch ? 'text-sm sm:text-base' : 'text-sm'}>
              Vehicle checks
            </TabsTrigger>
          </TabsList>

          <TabsContent value="checklist" className="mt-4 space-y-3 outline-none">
            {selectedProduction.checklistGroups.length === 0 ? (
              <p className="text-sm text-muted-foreground">No checklist sections yet.</p>
            ) : touch ? (
              selectedProduction.checklistGroups.map((group) => (
                <details
                  key={group.id}
                  className="group overflow-hidden rounded-lg border border-border/90 bg-card shadow-sm"
                  style={{
                    borderLeftWidth: 4,
                    borderLeftColor: getStableGroupAccentHex(group.title),
                  }}
                >
                  <summary
                    className={cn(
                      'flex cursor-pointer list-none items-center justify-between gap-2 border-b border-border/60 bg-muted/50 text-left font-medium marker:content-none [&::-webkit-details-marker]:hidden',
                      'px-4 py-3 text-[15px] transition-colors hover:bg-muted/70'
                    )}
                  >
                    <span className="flex min-w-0 flex-1 items-center gap-2">
                      <span className="min-w-0 truncate">{group.title}</span>
                      <FieldChecklistProgressBadge {...countChecklistCompletion(group.items)} />
                    </span>
                    <ChevronDown className="h-4 w-4 shrink-0 opacity-60 transition-transform duration-200 group-open:rotate-180" />
                  </summary>
                  <div className="bg-muted/15 px-2 py-2">
                    <div className="ml-1 border-l-2 border-border/60 pl-3 sm:ml-2 sm:pl-4">
                      <ul className="divide-y divide-border/50 rounded-md border border-border/40 bg-background/80">
                        {group.items.map((item) => (
                          <li key={item.id} className="flex gap-3 px-3 py-3">
                            <Checkbox
                              id={`cl-${item.id}`}
                              checked={item.completed}
                              className="mt-0.5 h-6 w-6 shrink-0 touch-manipulation"
                              onCheckedChange={(v) =>
                                onToggleChecklistItem(
                                  selectedProduction,
                                  group.title,
                                  group.id,
                                  item,
                                  v === true
                                )
                              }
                            />
                            <div className="min-w-0 flex-1">
                              <Label
                                htmlFor={`cl-${item.id}`}
                                className="cursor-pointer text-base font-medium leading-snug"
                              >
                                {item.label}
                                {item.quantity != null && item.quantity > 1 ? (
                                  <span className="ml-1.5 inline-flex min-w-[1.75rem] items-center justify-center rounded-md border border-border bg-muted/70 px-1.5 py-0.5 align-middle text-xs font-semibold tabular-nums text-foreground shadow-sm">
                                    ×{item.quantity}
                                  </span>
                                ) : null}
                              </Label>
                              {item.completed && item.fieldCompletedAt && (
                                <p className="mt-1 text-xs text-muted-foreground">
                                  {item.fieldCompletedBy ?? userLabel} ·{' '}
                                  {format(new Date(item.fieldCompletedAt), 'MMM d, h:mm a')}
                                </p>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </details>
              ))
            ) : (
              <ChecklistEditor
                groups={selectedProduction.checklistGroups}
                onChange={handleDesktopChecklistChange}
                inventoryItems={inventoryItems}
                requireDeleteConfirm
                mergeOnCompletionToggle={(item, completed) => {
                  const next = applyFieldAudit(item, completed, userLabel);
                  return {
                    completed: next.completed,
                    fieldCompletedAt: next.fieldCompletedAt,
                    fieldCompletedBy: next.fieldCompletedBy,
                  };
                }}
                onCompletionToggle={({ groupTitle, item, completed }) => {
                  logAndRemember({
                    productionId: selectedProduction.id,
                    productionName: selectedProduction.name,
                    scope: 'checklist',
                    groupTitle,
                    itemLabel: item.label,
                    completed,
                  });
                }}
                renderItemBelowLabel={(item) =>
                  item.completed && item.fieldCompletedAt ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {item.fieldCompletedBy ?? userLabel} ·{' '}
                      {format(new Date(item.fieldCompletedAt), 'MMM d, h:mm a')}
                    </p>
                  ) : null
                }
              />
            )}
          </TabsContent>

          <TabsContent value="vehicle" className="mt-4 space-y-4 outline-none">
            {selectedProduction.vehiclePacklists.length === 0 ? (
              <p className="text-sm text-muted-foreground">No vehicle packlists yet.</p>
            ) : touch ? (
              selectedProduction.vehiclePacklists.map((packlist) => (
                <VehiclePacklistTouchBlock
                  key={packlist.id}
                  production={selectedProduction}
                  packlist={packlist}
                  userLabel={userLabel}
                  onToggle={onToggleTruckItem}
                />
              ))
            ) : (
              <VehiclePacklistEditor
                packlists={selectedProduction.vehiclePacklists}
                onChange={handleDesktopVehiclePacklistsChange}
                checklistGroups={selectedProduction.checklistGroups}
                onChecklistGroupsChange={handleChecklistGroupsWhenMirroredFromPack}
                inventoryItems={inventoryItems}
                requireDeleteConfirm
                suppressFooterHint
                mergeOnPackCompletionToggle={(item, completed) => {
                  const next = applyFieldAudit(item, completed, userLabel);
                  return {
                    completed: next.completed,
                    fieldCompletedAt: next.fieldCompletedAt,
                    fieldCompletedBy: next.fieldCompletedBy,
                  };
                }}
                onPackCompletionToggle={({ vehicleName, sectionTitle, item, completed }) => {
                  logAndRemember({
                    productionId: selectedProduction.id,
                    productionName: selectedProduction.name,
                    scope: 'truck',
                    vehicleName,
                    sectionTitle,
                    itemLabel: item.label,
                    completed,
                  });
                }}
                renderPackItemBelowLabel={(item) =>
                  item.completed && item.fieldCompletedAt ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {item.fieldCompletedBy ?? userLabel} ·{' '}
                      {format(new Date(item.fieldCompletedAt), 'MMM d, h:mm a')}
                    </p>
                  ) : null
                }
              />
            )}
          </TabsContent>
        </Tabs>
      )}

      <Card className="mt-6 border shadow-sm">
        <CardHeader className="px-4 pb-2 pt-4 sm:px-6">
          <CardTitle className={touch ? 'text-base' : 'text-sm font-semibold'}>Recent activity</CardTitle>
          <CardDescription>
            Latest verification per line item (on vehicle vs missing). Follow up on anything flagged.
          </CardDescription>
        </CardHeader>
        <CardContent className="relative px-4 pb-4 sm:px-6 sm:pb-6">
          <Tabs
            value={activityView}
            onValueChange={(value) => setActivityView(value as 'list' | 'vehicle')}
          >
            <div className="mb-3 flex flex-col gap-3">
              <div
                className="scroll-hints-shell relative"
                data-overflowing={isActivityTabsOverflowing ? 'true' : 'false'}
                data-can-scroll-left={canActivityTabsScrollLeft ? 'true' : 'false'}
                data-can-scroll-right={canActivityTabsScrollRight ? 'true' : 'false'}
              >
                <TabsList
                  ref={activityTabsListRef as Ref<ElementRef<typeof TabsList>>}
                  className="h-auto w-full justify-start overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                >
                  <TabsTrigger value="list">All Recent Activity</TabsTrigger>
                  <TabsTrigger value="vehicle">By Vehicle</TabsTrigger>
                </TabsList>
                <div className="scroll-hint scroll-hint-left" aria-hidden>
                  <ChevronLeft className="h-4 w-4" />
                </div>
                <div
                  className={`scroll-hint scroll-hint-right${shouldPulseActivityTabsHint ? ' scroll-hint-pulse-once' : ''}`}
                  aria-hidden
                >
                  <ChevronRight className="h-4 w-4" />
                </div>
              </div>
              {activityView === 'list' && (
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <ActionRail
                      items={activityActionItems}
                      pulseStorageKey="field-checklist-activity-actions-pulsed"
                    />
                  </div>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="shrink-0 text-xs text-muted-foreground">
                          {activitySortBy === 'time' ? 'Time' : 'Vehicle'} ·{' '}
                          {activitySortDirection === 'desc' ? 'Newest' : 'Oldest'}
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        Tap clock/vehicle to change grouping; arrow swaps newest/oldest.
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              )}
            </div>

            <TabsContent value="list" className="space-y-3">
              {sortedActivityList.length > 0 ? (
                sortedActivityList.map((activity) => (
                  <div
                    key={activity.id}
                    className={`grid gap-2 rounded-md border border-border p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start ${
                      activity.completed
                        ? 'bg-emerald-50/95 text-emerald-950 dark:bg-emerald-950/45 dark:text-emerald-50'
                        : 'bg-amber-50/95 text-amber-950 dark:bg-amber-950/40 dark:text-amber-50'
                    }`}
                    style={{
                      borderLeftWidth: 4,
                      borderLeftColor: fieldActivityAccentHex(activity),
                    }}
                  >
                    <div>
                      <p className="font-medium">
                        <span
                          className={
                            activity.completed
                              ? 'mr-1.5 inline-block rounded-sm bg-emerald-700 px-1.5 py-0.5 text-xs font-semibold text-white dark:bg-emerald-600'
                              : 'mr-1.5 inline-block rounded-sm bg-amber-700 px-1.5 py-0.5 text-xs font-semibold text-white dark:bg-amber-600'
                          }
                        >
                          {activity.completed ? 'On vehicle' : 'Missing'}
                        </span>
                        {activity.itemLabel}
                      </p>
                      <p className="break-words text-sm text-muted-foreground">
                        Production: {activity.productionName}
                        {activity.scope === 'truck' && activity.vehicleName
                          ? ` | Vehicle: ${activity.vehicleName}`
                          : ''}{' '}
                        | By: {activity.performedBy}
                        {activity.groupTitle ? ` | ${activity.groupTitle}` : ''}
                        {activity.sectionTitle ? ` | ${activity.sectionTitle}` : ''}
                      </p>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {format(activity.timestamp, 'MMM d, h:mm a')}
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">No recent activity</p>
              )}
            </TabsContent>

            <TabsContent value="vehicle" className="space-y-4">
              {vehicleActivityGroups.length > 0 ? (
                vehicleActivityGroups.map((group) => (
                  <div
                    key={group.key}
                    className={cn(
                      'rounded-md border border-border p-3',
                      group.allVerified
                        ? 'bg-emerald-50/90 dark:bg-emerald-950/30'
                        : 'bg-amber-50/90 dark:bg-amber-950/35'
                    )}
                    style={{
                      borderLeftWidth: 4,
                      borderLeftColor: group.accentHex,
                    }}
                  >
                    <div className="mb-2 flex flex-wrap items-start justify-between gap-2 border-b border-border/80 pb-2">
                      <h3 className="min-w-0 text-sm font-semibold leading-snug">{group.title}</h3>
                      {group.allVerified ? (
                        <span className="shrink-0 rounded-full bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white">
                          Complete
                        </span>
                      ) : (
                        <span className="shrink-0 rounded-full bg-amber-600 px-2.5 py-1 text-xs font-semibold text-white">
                          Needs attention
                        </span>
                      )}
                    </div>
                    <p className="mb-3 text-xs text-muted-foreground">
                      {group.allVerified
                        ? 'All listed items are verified for this vehicle or section.'
                        : `${group.missingLabels.length} not verified — locate, sub in, or update the list before you roll.`}
                    </p>
                    <ul className="space-y-2">
                      {group.items.map((row) => (
                        <li
                          key={row.label}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-card px-3 py-2.5 text-sm shadow-sm"
                        >
                          <span className="min-w-0 flex-1 break-words font-medium text-foreground">
                            {row.label}
                          </span>
                          {row.onVehicle ? (
                            <span className="shrink-0 rounded-full bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white">
                              On vehicle
                            </span>
                          ) : (
                            <span className="shrink-0 rounded-full bg-amber-600 px-2.5 py-1 text-xs font-semibold text-white">
                              Missing
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">No vehicle activity yet</p>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

/** Touch vehicle tab: same collapsible hierarchy as checklist — vehicle → section → rows. */
function VehiclePacklistTouchBlock({
  production,
  packlist,
  userLabel,
  onToggle,
}: {
  production: Production;
  packlist: VehiclePacklist;
  userLabel: string;
  onToggle: (
    production: Production,
    vehicleName: string,
    packlistId: string,
    item: ChecklistItem,
    sectionTitle: string | undefined,
    checked: boolean
  ) => void;
}) {
  const shaped = useMemo(() => ensureVehiclePacklistShape(packlist), [packlist]);
  const sectionsWithItems = useMemo(
    () => (shaped.sections ?? []).filter((s) => s.items.length > 0),
    [shaped.sections]
  );
  const looseItems = shaped.items;
  const hasLines = sectionsWithItems.length > 0 || looseItems.length > 0;

  const looseAccent = getStableGroupAccentHex(`${packlist.vehicleName}-loose`);

  const vehicleCompletion = useMemo(() => {
    const all: Pick<ChecklistItem, 'completed'>[] = [];
    for (const s of sectionsWithItems) {
      all.push(...s.items);
    }
    all.push(...looseItems);
    return countChecklistCompletion(all);
  }, [sectionsWithItems, looseItems]);

  return (
    <details
      className="group overflow-hidden rounded-lg border border-border/90 bg-card shadow-sm"
      style={{
        borderLeftWidth: 4,
        borderLeftColor: getStableGroupAccentHex(packlist.vehicleName),
      }}
    >
      <summary
        className={cn(
          'flex cursor-pointer list-none items-center justify-between gap-2 border-b border-slate-300/80 text-left font-medium marker:content-none [&::-webkit-details-marker]:hidden',
          'bg-slate-200/95 px-4 py-3 text-[15px] text-slate-900 shadow-sm transition-colors hover:bg-slate-300/75',
          'dark:border-slate-700 dark:bg-slate-800/95 dark:text-slate-100 dark:hover:bg-slate-800'
        )}
      >
        <span className="flex min-w-0 flex-1 items-center gap-2">
          <span className="min-w-0 truncate">{packlist.vehicleName}</span>
          <FieldChecklistProgressBadge {...vehicleCompletion} />
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-slate-600 opacity-90 transition-transform duration-200 group-open:rotate-180 dark:text-slate-400" />
      </summary>
      {!hasLines ? (
        <p className="px-4 py-3 text-sm text-muted-foreground">No lines on this vehicle.</p>
      ) : (
        <div className="space-y-2 bg-muted/15 px-2 py-2">
          {sectionsWithItems.map((section) => (
            <details
              key={section.id}
              className="group/sec overflow-hidden rounded-md border border-border/70 bg-muted/25 shadow-inner"
              style={{
                borderLeftWidth: 4,
                borderLeftColor: getStableGroupAccentHex(section.title),
              }}
            >
              <summary
                className={cn(
                  'flex cursor-pointer list-none items-center justify-between gap-2 border-b border-border/50 bg-muted/40 px-3 py-2.5 text-left text-sm font-medium marker:content-none [&::-webkit-details-marker]:hidden',
                  'transition-colors hover:bg-muted/60'
                )}
              >
                <span className="flex min-w-0 flex-1 items-center gap-2">
                  <span className="min-w-0 truncate">{section.title}</span>
                  <FieldChecklistProgressBadge {...countChecklistCompletion(section.items)} />
                </span>
                <ChevronDown className="h-4 w-4 shrink-0 opacity-50 transition-transform duration-200 group-open/sec:rotate-180" />
              </summary>
              <div className="bg-muted/10 px-1.5 py-1.5">
                <div className="ml-1 border-l-2 border-border/55 pl-2.5 sm:ml-2 sm:pl-3">
                  <ul className="divide-y divide-border/50 rounded-md border border-border/40 bg-background/80">
                    {section.items.map((item) => (
                      <li key={item.id} className="flex gap-3 px-3 py-3">
                        <Checkbox
                          id={`tr-${item.id}`}
                          checked={item.completed}
                          className="mt-0.5 h-6 w-6 shrink-0 touch-manipulation"
                          onCheckedChange={(v) =>
                            onToggle(
                              production,
                              packlist.vehicleName,
                              packlist.id,
                              item,
                              section.title,
                              v === true
                            )
                          }
                        />
                        <div className="min-w-0 flex-1">
                          <Label htmlFor={`tr-${item.id}`} className="cursor-pointer text-base font-medium leading-snug">
                            {item.label}
                            {item.quantity != null && item.quantity > 1 ? (
                              <span className="ml-1.5 inline-flex min-w-[1.75rem] items-center justify-center rounded-md border border-border bg-muted/70 px-1.5 py-0.5 align-middle text-xs font-semibold tabular-nums text-foreground shadow-sm">
                                ×{item.quantity}
                              </span>
                            ) : null}
                          </Label>
                          {item.completed && item.fieldCompletedAt && (
                            <p className="mt-1 text-xs text-muted-foreground">
                              {item.fieldCompletedBy ?? userLabel} ·{' '}
                              {format(new Date(item.fieldCompletedAt), 'MMM d, h:mm a')}
                            </p>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </details>
          ))}
          {looseItems.length > 0 ? (
            <details
              className="group/loose overflow-hidden rounded-md border border-border/70 bg-muted/25 shadow-inner"
              style={{ borderLeftWidth: 4, borderLeftColor: looseAccent }}
            >
              <summary
                className={cn(
                  'flex cursor-pointer list-none items-center justify-between gap-2 border-b border-border/50 bg-muted/40 px-3 py-2.5 text-left text-sm font-medium marker:content-none [&::-webkit-details-marker]:hidden',
                  'transition-colors hover:bg-muted/60'
                )}
              >
                <span className="flex min-w-0 flex-1 items-center gap-2">
                  <span className="min-w-0 truncate">Loose items on this vehicle</span>
                  <FieldChecklistProgressBadge {...countChecklistCompletion(looseItems)} />
                </span>
                <ChevronDown className="h-4 w-4 shrink-0 opacity-50 transition-transform duration-200 group-open/loose:rotate-180" />
              </summary>
              <div className="bg-muted/10 px-1.5 py-1.5">
                <div className="ml-1 border-l-2 border-border/55 pl-2.5 sm:ml-2 sm:pl-3">
                  <ul className="divide-y divide-border/50 rounded-md border border-border/40 bg-background/80">
                    {looseItems.map((item) => (
                      <li key={item.id} className="flex gap-3 px-3 py-3">
                        <Checkbox
                          id={`tr-loose-${item.id}`}
                          checked={item.completed}
                          className="mt-0.5 h-6 w-6 shrink-0 touch-manipulation"
                          onCheckedChange={(v) =>
                            onToggle(production, packlist.vehicleName, packlist.id, item, undefined, v === true)
                          }
                        />
                        <div className="min-w-0 flex-1">
                          <Label
                            htmlFor={`tr-loose-${item.id}`}
                            className="cursor-pointer text-base font-medium leading-snug"
                          >
                            {item.label}
                            {item.quantity != null && item.quantity > 1 ? (
                              <span className="ml-1.5 inline-flex min-w-[1.75rem] items-center justify-center rounded-md border border-border bg-muted/70 px-1.5 py-0.5 align-middle text-xs font-semibold tabular-nums text-foreground shadow-sm">
                                ×{item.quantity}
                              </span>
                            ) : null}
                          </Label>
                          {item.completed && item.fieldCompletedAt && (
                            <p className="mt-1 text-xs text-muted-foreground">
                              {item.fieldCompletedBy ?? userLabel} ·{' '}
                              {format(new Date(item.fieldCompletedAt), 'MMM d, h:mm a')}
                            </p>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </details>
          ) : null}
        </div>
      )}
    </details>
  );
}
