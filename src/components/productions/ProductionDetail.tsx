import { useMemo, useState } from 'react';
import { Pencil, Trash2, CalendarDays, MapPin, FileText } from 'lucide-react';
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
import { applyProductionInventoryAction, exportProductionPacklistsToPdf } from '@/lib/productionService';
import { toast } from 'sonner';

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
}

export function ProductionDetail({
  production,
  inventoryItems,
  currentUsername,
  onUpdate,
  onDelete,
  onClose,
}: ProductionDetailProps) {
  const [editOpen, setEditOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'checklist' | 'vehicles' | 'crew' | 'schedule'>('overview');
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
      packlist.items.forEach((item) => appendItem(item.label, item.quantity));
    });
    return Array.from(resourceMap.entries()).map(([label, quantity], index) => ({
      id: `${index}-${label}`,
      label,
      quantity,
    }));
  }, [production]);

  if (!production) return null;

  const handleChecklistChange = (checklistGroups: ChecklistGroup[]) => {
    onUpdate(production.id, { checklistGroups });
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

  const handleEditSave = (data: Omit<Production, 'id' | 'createdAt' | 'updatedAt' | 'checklistGroups' | 'vehiclePacklists' | 'crew' | 'crewSchedule'>) => {
    onUpdate(production.id, data);
    setEditOpen(false);
  };

  const handleDelete = () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
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
      (sum, packlist) => sum + packlist.items.filter((item) => !!item.inventoryItemId).length,
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
          className={cn(
            'flex w-full flex-col gap-0 p-0',
            activeTab === 'schedule'
              ? 'sm:max-w-[min(96vw,1700px)]'
              : 'sm:max-w-[min(88vw,1200px)]'
          )}
          side="right"
        >
          <SheetHeader className="border-b px-6 py-4">
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
              {totalItems > 0 && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <FileText className="h-3.5 w-3.5" />
                  {doneItems}/{totalItems} checklist items done
                </div>
              )}
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
              {confirmDelete ? (
                <>
                  <Button variant="destructive" size="sm" className="h-7" onClick={handleDelete}>
                    Confirm delete
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7" onClick={() => setConfirmDelete(false)}>
                    Cancel
                  </Button>
                </>
              ) : (
                <Button variant="ghost" size="sm" className="h-7 gap-1 text-destructive hover:text-destructive" onClick={handleDelete}>
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </Button>
              )}
            </div>
          </SheetHeader>

          <Tabs
            value={activeTab}
            onValueChange={(value) => setActiveTab(value as typeof activeTab)}
            className="flex min-h-0 flex-1 flex-col"
          >
            <TabsList className="mx-6 mt-3 w-auto justify-start rounded-none border-b bg-transparent p-0">
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

            <ScrollArea className="flex-1">
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
                  />
                </TabsContent>

                <TabsContent value="vehicles" className="mt-0">
                  <VehiclePacklistEditor
                    packlists={production.vehiclePacklists}
                    onChange={handleVehicleChange}
                    inventoryItems={inventoryItems}
                  />
                </TabsContent>

                <TabsContent value="crew" className="mt-0">
                  <CrewEditor crew={production.crew} onChange={handleCrewChange} />
                </TabsContent>

                <TabsContent value="schedule" className="mt-0">
                  <CrewScheduleCalendar
                    projectStartDate={production.startDate}
                    projectEndDate={production.endDate}
                    resources={scheduleResources}
                    crewMembers={production.crew}
                    schedule={production.crewSchedule ?? []}
                    onChange={handleScheduleChange}
                  />
                </TabsContent>
              </div>
            </ScrollArea>
          </Tabs>
        </SheetContent>
      </Sheet>

      <ProductionForm
        open={editOpen}
        production={production}
        onSave={handleEditSave}
        onClose={() => setEditOpen(false)}
      />
    </>
  );
}
