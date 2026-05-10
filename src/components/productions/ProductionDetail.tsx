import { useMemo, useState } from 'react';
import { Pencil, CalendarDays, MapPin } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  Production,
  ProductionStatus,
  PRODUCTION_STATUS_LABELS,
  ChecklistGroup,
  VehiclePacklist,
  ProductionCrewMember,
  CrewScheduleEntry,
} from '@/types/productions';
import { InventoryItem } from '@/types/inventory';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { ChecklistEditor } from './ChecklistEditor';
import { VehiclePacklistEditor } from './VehiclePacklistEditor';
import { CrewEditor } from './CrewEditor';
import { ProductionForm } from './ProductionForm';
import { CrewScheduleCalendar } from './CrewScheduleCalendar';
import { ProductionFusedStripProgress } from '@/components/dashboard/ProductionDashboardProgress';
import { getProductionProgressSnapshot } from '@/lib/productionProgressMetrics';
import {
  ProductionSheetDragHandle,
  useProductionSheetEdgeDrag,
} from '@/components/productions/ProductionSheetDragHandle';
import { applyProductionInventoryAction, exportProductionPacklistsToPdf } from '@/lib/productionService';
import {
  flattenVehiclePacklistItems,
  mirrorChecklistCompletionOntoVehiclePacklists,
} from '@/lib/vehiclePacklistUtils';
import { toast } from 'sonner';
import { usePlannerListDeleteConfirm } from '@/hooks/usePlannerListDeleteConfirm';
import { normalizeProductionSheetTab, type ProductionSheetTab } from '@/lib/productionSheetTab';

const STATUS_CLASS: Record<ProductionStatus, string> = {
  planning: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  confirmed: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  in_progress: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  completed: 'bg-muted text-muted-foreground',
  cancelled: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
};

function formatDate(d?: string) {
  if (!d) return null;
  return new Date(d + 'T00:00:00').toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

interface ProductionDetailProps {
  production: Production | null;
  inventoryItems: InventoryItem[];
  currentUsername?: string;
  onUpdate: (id: string, updates: Partial<Production>) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
  /** URL-driven tab when used from Productions list (breadcrumb + deep link). */
  activeSheetTab?: ProductionSheetTab;
  onActiveSheetTabChange?: (tab: ProductionSheetTab) => void;
}

export function ProductionDetail({
  production,
  inventoryItems,
  currentUsername,
  onUpdate,
  onDelete,
  onClose,
  activeSheetTab: activeSheetTabProp,
  onActiveSheetTabChange,
}: ProductionDetailProps) {
  const [editOpen, setEditOpen] = useState(false);
  const confirmListDeletes = usePlannerListDeleteConfirm();
  const [fallbackTab, setFallbackTab] = useState<ProductionSheetTab>('overview');
  const sheetTabControlled = activeSheetTabProp != null && onActiveSheetTabChange != null;
  const activeTab = sheetTabControlled ? activeSheetTabProp : fallbackTab;
  const setActiveTab = (value: ProductionSheetTab) => {
    if (sheetTabControlled) onActiveSheetTabChange(value);
    else setFallbackTab(value);
  };
  const navigate = useNavigate();
  const plannerProductionId = production?.id ?? '';
  const sheetEdgeDrag = useProductionSheetEdgeDrag({
    onRequestClose: onClose,
    onRequestOpenPlanner: () => {
      if (!plannerProductionId) return;
      navigate(`/productions/planner?productionId=${plannerProductionId}`);
      onClose();
    },
  });
  const scheduleResources = useMemo(() => {
    if (!production) return [];
    const resourceMap = new Map<string, number>();
    const appendItem = (label: string, quantity?: number) => {
      const name = label.trim();
      if (!name) return;
      const qty = Math.max(1, Number(quantity || 1));
      resourceMap.set(name, (resourceMap.get(name) || 0) + qty);
    };
    production.checklistGroups.forEach((group) => {
      group.items.forEach((item) => appendItem(item.label, item.quantity));
    });
    production.vehiclePacklists.forEach((packlist) => {
      flattenVehiclePacklistItems(packlist).forEach((item) => appendItem(item.label, item.quantity));
    });
    return Array.from(resourceMap.entries()).map(([label, quantity], index) => ({
      id: `${index}-${label}`,
      label,
      quantity,
    }));
  }, [production]);

  if (!production) return null;

  const progressSnapshot = getProductionProgressSnapshot(production);

  const handleChecklistChange = (checklistGroups: ChecklistGroup[]) => {
    const vehiclePacklists = mirrorChecklistCompletionOntoVehiclePacklists(
      production.vehiclePacklists,
      checklistGroups,
    );
    onUpdate(production.id, { checklistGroups, vehiclePacklists });
  };

  const handleVehicleChange = (vehiclePacklists: VehiclePacklist[]) => {
    onUpdate(production.id, { vehiclePacklists });
  };

  const handleCrewChange = (crew: ProductionCrewMember[]) => {
    onUpdate(production.id, { crew });
  };

  const handleScheduleChange = (crewSchedule: CrewScheduleEntry[]) => {
    onUpdate(production.id, { crewSchedule });
  };

  const handleProjectedWindowChange = (window: { startTime?: string; endTime?: string }) => {
    onUpdate(production.id, {
      scheduleDefaultStartTime: window.startTime,
      scheduleDefaultEndTime: window.endTime,
    });
  };

  const handleEditSave = (data: Omit<Production, 'id' | 'createdAt' | 'updatedAt' | 'checklistGroups' | 'vehiclePacklists' | 'crew' | 'crewSchedule'>) => {
    onUpdate(production.id, data);
    setEditOpen(false);
  };

  const handleDelete = () => {
    onDelete(production.id);
    onClose();
  };

  const totalItems = production.checklistGroups.reduce((s, g) => s + g.items.length, 0);
  const doneItems = production.checklistGroups.reduce(
    (s, g) => s + g.items.filter((i) => i.completed).length,
    0
  );

  const linkedItemsCount =
    production.checklistGroups.reduce(
      (sum, group) => sum + group.items.filter((item) => !!item.inventoryItemId).length,
      0
    ) +
    production.vehiclePacklists.reduce(
      (sum, packlist) =>
        sum + flattenVehiclePacklistItems(packlist).filter((item) => !!item.inventoryItemId).length,
      0
    );

  const runInventoryAction = (action: 'reserve' | 'checkout' | 'checkin') => {
    const result = applyProductionInventoryAction(production.id, action, currentUsername);
    if (result.ok) {
      toast.success(result.message);
      return;
    }
    toast.error(result.message);
  };

  return (
    <>
      <Sheet open={Boolean(production)} onOpenChange={(open) => { if (!open) onClose(); }}>
        <SheetContent
          className="flex h-[100dvh] max-h-[100dvh] w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(88vw,1200px)]"
          side="right"
          onPointerDownOutside={(event) => event.preventDefault()}
          onInteractOutside={(event) => event.preventDefault()}
        >
          <div className="flex h-full min-h-0 w-full">
            <ProductionSheetDragHandle
              onPointerDown={sheetEdgeDrag.handlePointerDown}
              onPointerMove={sheetEdgeDrag.handlePointerMove}
              onPointerUp={sheetEdgeDrag.handlePointerUp}
              onPointerCancel={sheetEdgeDrag.handlePointerCancel}
            />
            <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden" style={sheetEdgeDrag.contentStyle}>
          <SheetHeader className="shrink-0 border-b px-6 py-4">
            <div className="flex items-start justify-between gap-3 pr-8">
              <div className="min-w-0 flex-1">
                <SheetTitle className="leading-snug">{production.name}</SheetTitle>
                {production.client && (
                  <p className="mt-0.5 text-sm text-muted-foreground">{production.client}</p>
                )}
              </div>
              <span
                className={cn(
                  'shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium',
                  STATUS_CLASS[production.status]
                )}
              >
                {PRODUCTION_STATUS_LABELS[production.status]}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap gap-4">
              {(production.startDate || production.endDate) && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <CalendarDays className="h-3.5 w-3.5" />
                  {production.startDate && formatDate(production.startDate)}
                  {production.startDate && production.endDate && ' – '}
                  {production.endDate && formatDate(production.endDate)}
                </div>
              )}
              {production.location && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5" />
                  {production.location}
                </div>
              )}
            </div>
            <div className="mt-3 max-w-2xl pr-1">
              <ProductionFusedStripProgress metrics={progressSnapshot} density="comfortable" />
            </div>
            <div className="mt-2 flex gap-2">
              <Button variant="outline" size="sm" className="h-7 gap-1" onClick={() => setEditOpen(true)}>
                <Pencil className="h-3.5 w-3.5" />
                Edit
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7"
                onClick={() => exportProductionPacklistsToPdf(production)}
              >
                Export Packlists PDF
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7"
                onClick={() => navigate(`/productions/planner?productionId=${production.id}`)}
              >
                Open Planner Workspace
              </Button>
            </div>
          </SheetHeader>

          <Tabs
            value={activeTab}
            onValueChange={(value) => setActiveTab(normalizeProductionSheetTab(value))}
            className="flex min-h-0 flex-1 flex-col"
          >
            <TabsList className="mx-6 mt-3 w-auto shrink-0 justify-start rounded-none border-b bg-transparent p-0">
              {(['overview', 'checklist', 'vehicles', 'crew', 'schedule'] as const).map((tab) => (
                <TabsTrigger
                  key={tab}
                  value={tab}
                  className="rounded-none border-b-2 border-transparent px-3 py-2 text-sm data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
                >
                  {tab === 'overview' ? 'Overview'
                    : tab === 'checklist' ? 'Checklist'
                    : tab === 'vehicles' ? 'Vehicle Packlists'
                    : tab === 'crew' ? 'Crew'
                    : 'Schedule'}
                </TabsTrigger>
              ))}
            </TabsList>

            <ScrollArea className="min-h-0 flex-1">
              <div className="box-border pb-[max(1.5rem,env(safe-area-inset-bottom,0px))] pt-px">
                <div className="p-6">
                <TabsContent value="overview" className="mt-0 space-y-4">
                  {production.description && (
                    <div>
                      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Description</p>
                      <p className="text-sm">{production.description}</p>
                    </div>
                  )}
                  {production.notes && (
                    <>
                      {production.description && <Separator />}
                      <div>
                        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Notes</p>
                        <p className="text-sm">{production.notes}</p>
                      </div>
                    </>
                  )}
                  {!production.description && !production.notes && (
                    <p className="text-sm text-muted-foreground">No description or notes.</p>
                  )}
                  <Separator />
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">Checklist items</p>
                      <p className="font-medium">{totalItems > 0 ? `${doneItems} / ${totalItems}` : '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Vehicle packlists</p>
                      <p className="font-medium">{production.vehiclePacklists.length || '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Crew</p>
                      <p className="font-medium">{production.crew.length || '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Created</p>
                      <p className="font-medium">
                        {new Date(production.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="checklist" className="mt-0">
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      Linked inventory items: {linkedItemsCount}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7"
                      disabled={linkedItemsCount === 0}
                      onClick={() => runInventoryAction('reserve')}
                    >
                      Reserve
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7"
                      disabled={linkedItemsCount === 0}
                      onClick={() => runInventoryAction('checkout')}
                    >
                      Checkout Linked
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7"
                      disabled={linkedItemsCount === 0}
                      onClick={() => runInventoryAction('checkin')}
                    >
                      Check In Linked
                    </Button>
                  </div>
                  <ChecklistEditor
                    groups={production.checklistGroups}
                    onChange={handleChecklistChange}
                    inventoryItems={inventoryItems}
                    requireDeleteConfirm={confirmListDeletes}
                  />
                </TabsContent>

                <TabsContent value="vehicles" className="mt-0">
                  <VehiclePacklistEditor
                    packlists={production.vehiclePacklists}
                    onChange={handleVehicleChange}
                    checklistGroups={production.checklistGroups}
                    onChecklistGroupsChange={handleChecklistChange}
                    inventoryItems={inventoryItems}
                    requireDeleteConfirm={confirmListDeletes}
                  />
                </TabsContent>

                <TabsContent value="crew" forceMount className="mt-0 data-[state=inactive]:hidden">
                  <CrewEditor
                    crew={production.crew}
                    onChange={handleCrewChange}
                    requireDeleteConfirm={confirmListDeletes}
                  />
                </TabsContent>

                <TabsContent value="schedule" className="mt-0">
                  <CrewScheduleCalendar
                    productionName={production.name}
                    productionClient={production.client}
                    productionLocation={production.location}
                    projectStartDate={production.startDate}
                    projectEndDate={production.endDate}
                    projectedWindowStartTime={production.scheduleDefaultStartTime}
                    projectedWindowEndTime={production.scheduleDefaultEndTime}
                    onProjectedWindowChange={handleProjectedWindowChange}
                    resources={scheduleResources}
                    crewMembers={production.crew}
                    schedule={production.crewSchedule ?? []}
                    scheduleScopeKey={production.id}
                    requireDeleteConfirm={confirmListDeletes}
                    onChange={handleScheduleChange}
                  />
                </TabsContent>
                </div>
              </div>
            </ScrollArea>
          </Tabs>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <ProductionForm
        open={editOpen}
        production={production}
        onSave={handleEditSave}
        onDelete={handleDelete}
        onClose={() => setEditOpen(false)}
      />
    </>
  );
}
