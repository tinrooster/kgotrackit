import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CalendarDays, ChevronLeft, ChevronRight, MapPin, Printer, Redo2, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { ChecklistEditor } from '@/components/productions/ChecklistEditor';
import { VehiclePacklistEditor } from '@/components/productions/VehiclePacklistEditor';
import { CrewEditor } from '@/components/productions/CrewEditor';
import { CrewScheduleCalendar } from '@/components/productions/CrewScheduleCalendar';
import { ProductionFusedStripProgress } from '@/components/dashboard/ProductionDashboardProgress';
import { getProductionProgressSnapshot } from '@/lib/productionProgressMetrics';
import {
  exportPlannerOfflineCrewPrintPack,
  getProductions,
  PRODUCTIONS_UPDATED_EVENT,
  updateProduction,
} from '@/lib/productionService';
import {
  applyProductionState,
  canRedoProduction,
  canUndoProduction,
  recordProductionSnapshotBeforeChange,
  redoProductionMutation,
  undoProductionMutation,
} from '@/lib/productionUndo';
import { getItems, STORAGE_KEYS } from '@/lib/storageService';
import {
  flattenVehiclePacklistItems,
  mirrorChecklistCompletionOntoVehiclePacklists,
} from '@/lib/vehiclePacklistUtils';
import { Production, PRODUCTION_STATUS_LABELS } from '@/types/productions';
import { InventoryItem } from '@/types/inventory';
import { usePlannerListDeleteConfirm } from '@/hooks/usePlannerListDeleteConfirm';
import { LAST_PLANNER_ROUTE_STORAGE_KEY } from '@/lib/navigationReturn';
import { useHorizontalScrollHints } from '@/components/ui/useHorizontalScrollHints';
import { toast } from 'sonner';
const PLANNER_TABS = ['checklist', 'vehicles', 'schedule', 'crew', 'overview'] as const;
type PlannerTab = (typeof PLANNER_TABS)[number];

function getPlannerTabFromSearchParams(searchParams: URLSearchParams): PlannerTab {
  const tabFromQuery = searchParams.get('pt');
  if (tabFromQuery && PLANNER_TABS.includes(tabFromQuery as PlannerTab)) {
    return tabFromQuery as PlannerTab;
  }
  return 'checklist';
}

function getScheduleDayFromSearchParams(searchParams: URLSearchParams): string | undefined {
  const dayFromQuery = searchParams.get('sd');
  if (!dayFromQuery) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dayFromQuery)) return undefined;
  return dayFromQuery;
}

function formatDate(value?: string): string | null {
  if (!value) return null;
  return new Date(`${value}T00:00:00`).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function PlannerWorkspacePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [productions, setProductions] = useState<Production[]>(() => getProductions());
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>(() => getItems());
  const [activeTab, setActiveTab] = useState<PlannerTab>(() => getPlannerTabFromSearchParams(searchParams));
  const [undoAvailable, setUndoAvailable] = useState<boolean>(() => canUndoProduction());
  const [redoAvailable, setRedoAvailable] = useState<boolean>(() => canRedoProduction());
  const isScheduleGestureActiveRef = useRef(false);
  const hasRecordedGestureSnapshotRef = useRef(false);
  const confirmListDeletes = usePlannerListDeleteConfirm();
  const {
    scrollRef: plannerTabsListRef,
    isOverflowing: isPlannerTabsOverflowing,
    canScrollLeft: canPlannerTabsScrollLeft,
    canScrollRight: canPlannerTabsScrollRight,
    shouldPulseRightHint: shouldPulsePlannerTabsHint,
  } = useHorizontalScrollHints<HTMLDivElement>({
    pulseStorageKey: 'planner-tabs-scroll-hint-pulsed',
  });

  const productionIdFromQuery = searchParams.get('productionId') ?? '';
  const scheduleDayFilter = getScheduleDayFromSearchParams(searchParams);

  useEffect(() => {
    const refresh = () => {
      setProductions(getProductions());
      setUndoAvailable(canUndoProduction());
      setRedoAvailable(canRedoProduction());
    };
    window.addEventListener(PRODUCTIONS_UPDATED_EVENT, refresh);
    return () => window.removeEventListener(PRODUCTIONS_UPDATED_EVENT, refresh);
  }, []);

  useEffect(() => {
    const refresh = () => setInventoryItems(getItems());
    refresh();
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEYS.ITEMS) return;
      refresh();
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  useEffect(() => {
    const tabFromQuery = getPlannerTabFromSearchParams(searchParams);
    setActiveTab((previous) => (previous === tabFromQuery ? previous : tabFromQuery));
  }, [searchParams]);

  useEffect(() => {
    try {
      const plannerPath = `/productions/planner?${searchParams.toString()}`;
      sessionStorage.setItem(LAST_PLANNER_ROUTE_STORAGE_KEY, plannerPath);
    } catch {
      /* ignore */
    }
  }, [searchParams]);

  const selectedProduction = useMemo(
    () => productions.find((production) => production.id === productionIdFromQuery) ?? null,
    [productions, productionIdFromQuery]
  );

  const handleSelectProduction = (productionId: string) => {
    const next = new URLSearchParams(searchParams);
    next.set('productionId', productionId);
    next.set('pt', activeTab);
    if (scheduleDayFilter) next.set('sd', scheduleDayFilter);
    setSearchParams(next, { replace: true });
  };

  const handleTabChange = (tabValue: string) => {
    const nextTab = tabValue as PlannerTab;
    setActiveTab(nextTab);
    const next = new URLSearchParams(searchParams);
    next.set('pt', nextTab);
    if (scheduleDayFilter) next.set('sd', scheduleDayFilter);
    setSearchParams(next, { replace: true });
  };

  const handleScheduleDayFilterChange = (nextDay: string) => {
    const next = new URLSearchParams(searchParams);
    const currentDay = getScheduleDayFromSearchParams(searchParams);
    if (currentDay === nextDay) return;
    if (nextDay) {
      next.set('sd', nextDay);
    } else {
      next.delete('sd');
    }
    setSearchParams(next, { replace: true });
  };

  const handleUpdate = (updates: Partial<Production>) => {
    if (!selectedProduction) return;
    if (isScheduleGestureActiveRef.current) {
      if (!hasRecordedGestureSnapshotRef.current) {
        recordProductionSnapshotBeforeChange(productions);
        hasRecordedGestureSnapshotRef.current = true;
      }
    } else {
      recordProductionSnapshotBeforeChange(productions);
    }
    updateProduction(selectedProduction.id, updates);
    setUndoAvailable(canUndoProduction());
    setRedoAvailable(canRedoProduction());
  };

  const handleUndo = () => {
    const restored = undoProductionMutation(productions);
    if (!restored) {
      toast.info('Nothing to undo');
      return;
    }
    applyProductionState(restored, setProductions);
    setUndoAvailable(canUndoProduction());
    setRedoAvailable(canRedoProduction());
    toast.success('Undone');
  };

  const handleRedo = () => {
    const restored = redoProductionMutation(productions);
    if (!restored) {
      toast.info('Nothing to redo');
      return;
    }
    applyProductionState(restored, setProductions);
    setUndoAvailable(canUndoProduction());
    setRedoAvailable(canRedoProduction());
    toast.success('Redone');
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        const isTypingTarget = tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable;
        if (isTypingTarget) return;
      }
      const isModifierPressed = event.ctrlKey || event.metaKey;
      if (!isModifierPressed) return;
      const key = event.key.toLowerCase();
      if (key === 'z' && event.shiftKey) {
        event.preventDefault();
        handleRedo();
        return;
      }
      if (key === 'z') {
        event.preventDefault();
        handleUndo();
        return;
      }
      if (key === 'y') {
        event.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, handleRedo]);

  const scheduleResources = useMemo(() => {
    if (!selectedProduction) return [];
    const resourceMap = new Map<string, number>();
    const appendItem = (label: string, quantity?: number) => {
      const name = label.trim();
      if (!name) return;
      const qty = Math.max(1, Number(quantity || 1));
      resourceMap.set(name, (resourceMap.get(name) || 0) + qty);
    };
    selectedProduction.checklistGroups.forEach((group) => {
      group.items.forEach((item) => appendItem(item.label, item.quantity));
    });
    selectedProduction.vehiclePacklists.forEach((packlist) => {
      flattenVehiclePacklistItems(packlist).forEach((item) => appendItem(item.label, item.quantity));
    });
    return Array.from(resourceMap.entries()).map(([label, quantity], index) => ({
      id: `${index}-${label}`,
      label,
      quantity,
    }));
  }, [selectedProduction]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">Planner Workspace</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm" className="gap-1.5">
            <Link to="/productions">
              <ChevronLeft className="h-3.5 w-3.5" />
              Back to Productions
            </Link>
          </Button>
        </div>
      </div>

      <div className="rounded-lg border bg-card p-3">
        <div className="space-y-1">
          <Label htmlFor="planner-production-select">Production</Label>
          <Select value={productionIdFromQuery || undefined} onValueChange={handleSelectProduction}>
            <SelectTrigger id="planner-production-select">
              <SelectValue placeholder="Select a production to plan" />
            </SelectTrigger>
            <SelectContent>
              {productions.map((production) => (
                <SelectItem key={production.id} value={production.id}>
                  {production.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {!selectedProduction ? (
        <p className="rounded-lg border border-dashed px-4 py-8 text-sm text-muted-foreground">
          Select a production to open its planner workspace.
        </p>
      ) : (
        <div className="space-y-4 rounded-lg border bg-card p-4">
          <div className="flex flex-wrap items-center gap-4">
            <p className="text-lg font-semibold">{selectedProduction.name}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={handleUndo}
              disabled={!undoAvailable}
            >
              <Undo2 className="h-3.5 w-3.5" aria-hidden />
              Undo
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={handleRedo}
              disabled={!redoAvailable}
            >
              <Redo2 className="h-3.5 w-3.5" aria-hidden />
              Redo
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              title="Print checklist, vehicle lines, and crew contacts for people without phones"
              onClick={() => exportPlannerOfflineCrewPrintPack(selectedProduction)}
            >
              <Printer className="h-3.5 w-3.5" aria-hidden />
              Print offline pack
            </Button>
            <span className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              {PRODUCTION_STATUS_LABELS[selectedProduction.status]}
            </span>
            {(selectedProduction.startDate || selectedProduction.endDate) && (
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <CalendarDays className="h-3.5 w-3.5" />
                {selectedProduction.startDate && formatDate(selectedProduction.startDate)}
                {selectedProduction.startDate && selectedProduction.endDate && ' – '}
                {selectedProduction.endDate && formatDate(selectedProduction.endDate)}
              </span>
            )}
            {selectedProduction.location && (
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <MapPin className="h-3.5 w-3.5" />
                {selectedProduction.location}
              </span>
            )}
          </div>
          <div className="max-w-md">
            <ProductionFusedStripProgress metrics={getProductionProgressSnapshot(selectedProduction)} density="comfortable" />
          </div>

          <Tabs
            value={activeTab}
            onValueChange={handleTabChange}
            className="flex min-h-0 flex-1 flex-col gap-3"
          >
            <div
              className="scroll-hints-shell relative"
              data-overflowing={isPlannerTabsOverflowing ? 'true' : 'false'}
              data-can-scroll-left={canPlannerTabsScrollLeft ? 'true' : 'false'}
              data-can-scroll-right={canPlannerTabsScrollRight ? 'true' : 'false'}
            >
              <div
                ref={plannerTabsListRef}
                className="mb-1 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              >
                <TabsList className="h-auto w-max shrink-0 justify-start gap-1">
                  <TabsTrigger className="shrink-0" value="checklist">Checklist</TabsTrigger>
                  <TabsTrigger className="shrink-0" value="vehicles">Vehicle Packlists</TabsTrigger>
                  <TabsTrigger className="shrink-0" value="schedule">Schedule</TabsTrigger>
                  <TabsTrigger className="shrink-0" value="crew">Crew</TabsTrigger>
                  <TabsTrigger className="shrink-0" value="overview">Overview</TabsTrigger>
                </TabsList>
              </div>
              <div className="scroll-hint scroll-hint-left" aria-hidden>
                <ChevronLeft className="h-4 w-4" />
              </div>
              <div
                className={`scroll-hint scroll-hint-right${shouldPulsePlannerTabsHint ? ' scroll-hint-pulse-once' : ''}`}
                aria-hidden
              >
                <ChevronRight className="h-4 w-4" />
              </div>
            </div>

            <TabsContent value="checklist" className="space-y-3">
              <ChecklistEditor
                groups={selectedProduction.checklistGroups}
                onChange={(checklistGroups) => {
                  const vehiclePacklists = mirrorChecklistCompletionOntoVehiclePacklists(
                    selectedProduction.vehiclePacklists,
                    checklistGroups,
                  );
                  handleUpdate({ checklistGroups, vehiclePacklists });
                }}
                inventoryItems={inventoryItems}
                onRefreshInventory={() => setInventoryItems(getItems())}
                requireDeleteConfirm={confirmListDeletes}
              />
            </TabsContent>
            <TabsContent value="vehicles" className="space-y-3">
              <VehiclePacklistEditor
                packlists={selectedProduction.vehiclePacklists}
                onChange={(vehiclePacklists) => handleUpdate({ vehiclePacklists })}
                checklistGroups={selectedProduction.checklistGroups}
                onChecklistGroupsChange={(checklistGroups) => handleUpdate({ checklistGroups })}
                inventoryItems={inventoryItems}
                requireDeleteConfirm={confirmListDeletes}
              />
            </TabsContent>
            <TabsContent value="schedule" className="space-y-3">
              <div className="rounded-md border bg-muted/20 p-2">
                <CrewScheduleCalendar
                  productionName={selectedProduction.name}
                  productionClient={selectedProduction.client}
                  productionLocation={selectedProduction.location}
                  projectStartDate={selectedProduction.startDate}
                  projectEndDate={selectedProduction.endDate}
                  projectedWindowStartTime={selectedProduction.scheduleDefaultStartTime}
                  projectedWindowEndTime={selectedProduction.scheduleDefaultEndTime}
                  onProjectedWindowChange={(window) =>
                    handleUpdate({
                      scheduleDefaultStartTime: window.startTime,
                      scheduleDefaultEndTime: window.endTime,
                    })
                  }
                  resources={scheduleResources}
                  crewMembers={selectedProduction.crew}
                  schedule={selectedProduction.crewSchedule ?? []}
                  dayBoardDate={scheduleDayFilter}
                  onDayBoardDateChange={handleScheduleDayFilterChange}
                  scheduleScopeKey={selectedProduction.id}
                  requireDeleteConfirm={confirmListDeletes}
                  onTimelineGestureStart={() => {
                    isScheduleGestureActiveRef.current = true;
                    hasRecordedGestureSnapshotRef.current = false;
                  }}
                  onTimelineGestureEnd={() => {
                    isScheduleGestureActiveRef.current = false;
                    hasRecordedGestureSnapshotRef.current = false;
                  }}
                  onChange={(crewSchedule) => handleUpdate({ crewSchedule })}
                />
              </div>
            </TabsContent>
            <TabsContent value="crew" forceMount className="data-[state=inactive]:hidden">
              <CrewEditor
                crew={selectedProduction.crew}
                onChange={(crew) => handleUpdate({ crew })}
                requireDeleteConfirm={confirmListDeletes}
              />
            </TabsContent>
            <TabsContent value="overview" className="space-y-3 text-sm">
              <div className="max-w-xl">
                <ProductionFusedStripProgress
                  metrics={getProductionProgressSnapshot(selectedProduction)}
                  density="comfortable"
                />
              </div>
              <div className="rounded-md border bg-muted/20 p-2">
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="rounded-md border bg-background px-3 py-2">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Client</p>
                    <p className="text-sm">{selectedProduction.client || '—'}</p>
                  </div>
                  <div className="rounded-md border bg-background px-3 py-2">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Location</p>
                    <p className="text-sm">{selectedProduction.location || '—'}</p>
                  </div>
                  <div className="rounded-md border bg-background px-3 py-2">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Dates</p>
                    <p className="text-sm">
                      {selectedProduction.startDate || '—'}{' '}
                      {selectedProduction.endDate ? `to ${selectedProduction.endDate}` : ''}
                    </p>
                  </div>
                  <div className="rounded-md border bg-background px-3 py-2">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Status</p>
                    <p className="text-sm">{PRODUCTION_STATUS_LABELS[selectedProduction.status]}</p>
                  </div>
                </div>
              </div>
              {(() => {
                const snap = getProductionProgressSnapshot(selectedProduction);
                const blocks = selectedProduction.crewSchedule?.length ?? 0;
                const vehicles = selectedProduction.vehiclePacklists.length;
                return (
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    <div className="rounded-md border bg-background px-3 py-2">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Field checklist</p>
                      <p className="text-sm tabular-nums">
                        {snap.checklist.done}/{snap.checklist.total} done ({snap.checklist.percent}%)
                      </p>
                    </div>
                    <div className="rounded-md border bg-background px-3 py-2">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Vehicle packlists</p>
                      <p className="text-sm tabular-nums">
                        {snap.packlists.done}/{snap.packlists.total} done ({snap.packlists.percent}%) · {vehicles}{' '}
                        vehicle{vehicles === 1 ? '' : 's'}
                      </p>
                    </div>
                    <div className="rounded-md border bg-background px-3 py-2">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Crew & schedule</p>
                      <p className="text-sm tabular-nums">
                        {snap.crew.scheduled}/{snap.crew.crewCount} on schedule ({snap.crew.percent}%) · {blocks} block
                        {blocks === 1 ? '' : 's'}
                      </p>
                    </div>
                  </div>
                );
              })()}
            </TabsContent>
          </Tabs>
        </div>
      )}
    </div>
  );
}
