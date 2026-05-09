import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CalendarDays, ChevronLeft, FileText, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { ChecklistEditor } from '@/components/productions/ChecklistEditor';
import { VehiclePacklistEditor } from '@/components/productions/VehiclePacklistEditor';
import { CrewEditor } from '@/components/productions/CrewEditor';
import { CrewScheduleCalendar } from '@/components/productions/CrewScheduleCalendar';
import {
  getProductions,
  PRODUCTIONS_UPDATED_EVENT,
  updateProduction,
} from '@/lib/productionService';
import { getItems, STORAGE_KEYS } from '@/lib/storageService';
import { flattenVehiclePacklistItems } from '@/lib/vehiclePacklistUtils';
import { Production, PRODUCTION_STATUS_LABELS } from '@/types/productions';
import { InventoryItem } from '@/types/inventory';

const LAST_PLANNER_ROUTE_STORAGE_KEY = 'trackit:last-planner-route';
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
  const [confirmListDeletes, setConfirmListDeletes] = useState(true);

  const productionIdFromQuery = searchParams.get('productionId') ?? '';
  const scheduleDayFilter = getScheduleDayFromSearchParams(searchParams);

  useEffect(() => {
    const refresh = () => setProductions(getProductions());
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
    updateProduction(selectedProduction.id, updates);
  };

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

      <div className="grid gap-3 rounded-lg border bg-card p-3 sm:grid-cols-[1fr_auto]">
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
        <div className="flex items-end">
          <div className="inline-flex items-center gap-2 rounded border px-2 py-1">
            <Switch
              id="planner-confirm-list-delete-toggle"
              checked={confirmListDeletes}
              onCheckedChange={setConfirmListDeletes}
            />
            <Label htmlFor="planner-confirm-list-delete-toggle" className="text-xs text-muted-foreground">
              Confirm list deletes
            </Label>
          </div>
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
            {selectedProduction.checklistGroups.length > 0 && (
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <FileText className="h-3.5 w-3.5" />
                {selectedProduction.checklistGroups.reduce((sum, group) => sum + group.items.length, 0)} checklist items
              </span>
            )}
          </div>

          <Tabs
            value={activeTab}
            onValueChange={handleTabChange}
            className="flex min-h-0 flex-1 flex-col gap-3"
          >
            <TabsList className="mb-1 shrink-0">
              <TabsTrigger value="checklist">Checklist</TabsTrigger>
              <TabsTrigger value="vehicles">Vehicle Packlists</TabsTrigger>
              <TabsTrigger value="schedule">Schedule</TabsTrigger>
              <TabsTrigger value="crew">Crew</TabsTrigger>
              <TabsTrigger value="overview">Overview</TabsTrigger>
            </TabsList>

            <TabsContent value="checklist" className="space-y-3">
              <ChecklistEditor
                groups={selectedProduction.checklistGroups}
                onChange={(checklistGroups) => handleUpdate({ checklistGroups })}
                inventoryItems={inventoryItems}
                requireDeleteConfirm={confirmListDeletes}
              />
            </TabsContent>
            <TabsContent value="vehicles" className="space-y-3">
              <VehiclePacklistEditor
                packlists={selectedProduction.vehiclePacklists}
                onChange={(vehiclePacklists) => handleUpdate({ vehiclePacklists })}
                checklistGroups={selectedProduction.checklistGroups}
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
                  onChange={(crewSchedule) => handleUpdate({ crewSchedule })}
                />
              </div>
            </TabsContent>
            <TabsContent value="crew">
              <CrewEditor
                crew={selectedProduction.crew}
                onChange={(crew) => handleUpdate({ crew })}
                requireDeleteConfirm={confirmListDeletes}
              />
            </TabsContent>
            <TabsContent value="overview" className="space-y-3 text-sm">
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
                      {selectedProduction.startDate || '—'} {selectedProduction.endDate ? `to ${selectedProduction.endDate}` : ''}
                    </p>
                  </div>
                  <div className="rounded-md border bg-background px-3 py-2">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Status</p>
                    <p className="text-sm">{PRODUCTION_STATUS_LABELS[selectedProduction.status]}</p>
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      )}
    </div>
  );
}
