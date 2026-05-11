import { useEffect, useState } from 'react';
import { MapPin, Phone, Pencil, User, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import {
  FleetVehicle,
  VehicleSubsystem,
  VEHICLE_STATUS_LABELS,
  VEHICLE_STATUS_BADGE_CLASSES,
  VEHICLE_KIND_LABELS,
  CAPABILITY_LABELS,
  SUBSYSTEM_KIND_LABELS,
} from '@/types/fleet';
import { FLEET_UPDATED_EVENT, getFleet, addSubsystem } from '@/lib/fleetService';
import { getCrewContacts } from '@/lib/crewContactsService';
import { SubsystemRow } from './SubsystemRow';
import { ScheduledWorkRow, ScheduledWorkRowSkeleton } from './ScheduledWorkRow';
import { SubsystemLoanDialog, closeActiveLoan } from './SubsystemLoanDialog';
import { AssignmentRow, AssignmentRowSkeleton } from './AssignmentRow';
import { LogTimeline } from './LogTimeline';

interface VehicleDetailSheetProps {
  vehicle: FleetVehicle | null;
  defaultOperatorName?: string;
  canMutate?: boolean;
  onClose: () => void;
  onEdit?: (vehicle: FleetVehicle) => void;
}

function DetailRow({ label, value }: { label: string; value?: string | number }) {
  if (!value && value !== 0) return null;
  return (
    <div className="flex items-baseline gap-2">
      <span className="w-28 shrink-0 text-xs text-muted-foreground">{label}</span>
      <span className="text-sm">{value}</span>
    </div>
  );
}

type TabId = 'overview' | 'assignments' | 'subsystems' | 'scheduled' | 'log';

export function VehicleDetailSheet({
  vehicle,
  defaultOperatorName,
  canMutate = false,
  onClose,
  onEdit,
}: VehicleDetailSheetProps) {
  const [tab, setTab] = useState<TabId>('overview');
  const [localVehicle, setLocalVehicle] = useState<FleetVehicle | null>(vehicle);

  // Track which vehicle was previously selected so we can reset the tab on change
  const [prevVehicleId, setPrevVehicleId] = useState<string | null>(vehicle?.id ?? null);

  useEffect(() => {
    if (vehicle?.id !== prevVehicleId) {
      setTab('overview');
      setPrevVehicleId(vehicle?.id ?? null);
    }
    setLocalVehicle(vehicle);
  }, [vehicle]);

  // Stay in sync when fleet mutations happen inside the sheet
  useEffect(() => {
    if (!vehicle) return;
    const sync = () => {
      const fresh = getFleet().vehicles.find((v) => v.id === vehicle.id);
      setLocalVehicle(fresh ?? null);
    };
    window.addEventListener(FLEET_UPDATED_EVENT, sync);
    return () => window.removeEventListener(FLEET_UPDATED_EVENT, sync);
  }, [vehicle?.id]);

  const [contacts, setContacts] = useState(() => getCrewContacts());

  useEffect(() => {
    const sync = () => setContacts(getCrewContacts());
    window.addEventListener('trackit:crew-contacts-updated', sync);
    return () => window.removeEventListener('trackit:crew-contacts-updated', sync);
  }, []);

  // Loan dialog state
  const [loanTarget, setLoanTarget] = useState<VehicleSubsystem | null>(null);
  const [addingSubsystem, setAddingSubsystem] = useState(false);
  const [addingScheduled, setAddingScheduled] = useState(false);
  const [addingAssignment, setAddingAssignment] = useState(false);

  if (!localVehicle) return null;

  const v = localVehicle;
  const allVehicles = getFleet().vehicles;
  const hasVehicleDetails = v.plate || v.vin || v.make || v.model || v.year || v.parkingSpot;
  const makeModel = [v.make, v.model].filter(Boolean).join(' ');

  const handleAddSubsystem = () => {
    const newSub: VehicleSubsystem = {
      id: crypto.randomUUID(),
      kind: 'dejero',
      label: SUBSYSTEM_KIND_LABELS['dejero'],
      status: 'operational',
    };
    addSubsystem(v.id, newSub);
    setAddingSubsystem(false);
  };

  return (
    <>
      <Sheet open={!!vehicle} onOpenChange={(o) => { if (!o) onClose(); }}>
        <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
          {/* Header */}
          <SheetHeader className="border-b border-border px-6 pb-4 pt-6 shrink-0">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <SheetTitle className="text-xl font-bold leading-tight">{v.code}</SheetTitle>
                <p className="mt-0.5 text-sm text-muted-foreground">{VEHICLE_KIND_LABELS[v.kind]}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span
                  className={cn(
                    'rounded-full border px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide',
                    VEHICLE_STATUS_BADGE_CLASSES[v.status],
                  )}
                >
                  {VEHICLE_STATUS_LABELS[v.status]}
                </span>
                {onEdit && (
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => onEdit(v)}>
                    <Pencil className="h-3.5 w-3.5" />
                    <span className="sr-only">Edit vehicle</span>
                  </Button>
                )}
              </div>
            </div>
          </SheetHeader>

          {/* Tabs */}
          <Tabs
            value={tab}
            onValueChange={(val) => setTab(val as TabId)}
            className="flex min-h-0 flex-1 flex-col"
          >
            <TabsList className="mx-6 mt-0 w-auto shrink-0 justify-start rounded-none border-b bg-transparent p-0">
              {(['overview', 'assignments', 'subsystems', 'scheduled', 'log'] as const).map((t) => (
                <TabsTrigger
                  key={t}
                  value={t}
                  className="rounded-none border-b-2 border-transparent px-3 py-2.5 text-sm data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
                >
                  {t === 'overview' ? 'Overview'
                    : t === 'assignments' ? 'Crew'
                    : t === 'subsystems' ? 'Subsystems'
                    : t === 'scheduled' ? 'Scheduled'
                    : 'Log'}
                  {t === 'assignments' && v.assignments.length > 0 && (
                    <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0 text-[10px] font-semibold tabular-nums text-muted-foreground">
                      {v.assignments.length}
                    </span>
                  )}
                  {t === 'subsystems' && v.subsystems.length > 0 && (
                    <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0 text-[10px] font-semibold tabular-nums text-muted-foreground">
                      {v.subsystems.length}
                    </span>
                  )}
                  {t === 'scheduled' && v.scheduledWork.filter((w) => w.status === 'scheduled' || w.status === 'in_progress').length > 0 && (
                    <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0 text-[10px] font-semibold tabular-nums text-muted-foreground">
                      {v.scheduledWork.filter((w) => w.status === 'scheduled' || w.status === 'in_progress').length}
                    </span>
                  )}
                </TabsTrigger>
              ))}
            </TabsList>

            <ScrollArea className="min-h-0 flex-1">
              <div className="pb-8">

                {/* ── Overview ────────────────────────────────────────────── */}
                <TabsContent value="overview" className="mt-0 space-y-5 p-6">
                  {v.designation && (
                    <p className="text-sm text-muted-foreground -mb-2">{v.designation}</p>
                  )}
                  {/* Quick-glance row */}
                  <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                    {v.location && (
                      <div className="flex items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5 shrink-0" />
                        <span>{v.location}</span>
                      </div>
                    )}
                    {defaultOperatorName && (
                      <div className="flex items-center gap-1.5">
                        <User className="h-3.5 w-3.5 shrink-0" />
                        <span>{defaultOperatorName}</span>
                      </div>
                    )}
                    {v.truckCellPhone && (
                      <div className="flex items-center gap-1.5">
                        <Phone className="h-3.5 w-3.5 shrink-0" />
                        <span>{v.truckCellPhone}</span>
                      </div>
                    )}
                  </div>

                  {v.capabilities.length > 0 && (
                    <section>
                      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Capabilities
                      </h3>
                      <div className="flex flex-wrap gap-1.5">
                        {v.capabilities.map((cap) => (
                          <span
                            key={cap}
                            className="rounded-full border border-border bg-muted/50 px-2.5 py-0.5 text-xs font-medium"
                          >
                            {CAPABILITY_LABELS[cap]}
                          </span>
                        ))}
                      </div>
                    </section>
                  )}

                  {hasVehicleDetails && (
                    <section>
                      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Vehicle Details
                      </h3>
                      <div className="space-y-1.5">
                        {makeModel && <DetailRow label="Make / Model" value={makeModel} />}
                        {v.year && <DetailRow label="Year" value={v.year} />}
                        <DetailRow label="Plate" value={v.plate} />
                        <DetailRow label="VIN" value={v.vin} />
                        <DetailRow label="Parking spot" value={v.parkingSpot} />
                      </div>
                    </section>
                  )}

                  {v.notes && (
                    <section>
                      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Notes
                      </h3>
                      <p className="whitespace-pre-wrap text-sm">{v.notes}</p>
                    </section>
                  )}
                </TabsContent>

                {/* ── Crew assignments ────────────────────────────────────── */}
                <TabsContent value="assignments" className="mt-0 p-4 space-y-1">
                  {v.assignments.length === 0 && !addingAssignment && (
                    <p className="py-6 text-center text-sm text-muted-foreground">
                      No crew assigned yet.
                    </p>
                  )}

                  {v.assignments.map((a) => (
                    <AssignmentRow
                      key={a.id}
                      vehicleId={v.id}
                      assignment={a}
                      contacts={contacts}
                      canMutate={canMutate}
                    />
                  ))}

                  {addingAssignment && canMutate && (
                    <AssignmentRowSkeleton
                      vehicleId={v.id}
                      contacts={contacts}
                      onDone={() => setAddingAssignment(false)}
                    />
                  )}

                  {canMutate && !addingAssignment && (
                    <div className="pt-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs gap-1"
                        onClick={() => setAddingAssignment(true)}
                      >
                        <Plus className="h-3 w-3" />
                        Assign crew
                      </Button>
                    </div>
                  )}
                </TabsContent>

                {/* ── Subsystems ──────────────────────────────────────────── */}
                <TabsContent value="subsystems" className="mt-0 p-4 space-y-1">
                  {v.subsystems.length === 0 && !addingSubsystem && (
                    <p className="py-6 text-center text-sm text-muted-foreground">
                      No subsystems tracked yet.
                    </p>
                  )}

                  {v.subsystems.map((sub) => (
                    <SubsystemRow
                      key={sub.id}
                      vehicleId={v.id}
                      subsystem={sub}
                      canMutate={canMutate}
                      onLoanOut={canMutate ? setLoanTarget : undefined}
                      onCloseLoan={
                        canMutate
                          ? (s) => closeActiveLoan(v.id, s.kind)
                          : undefined
                      }
                    />
                  ))}

                  {addingSubsystem && canMutate && (
                    <div className="rounded-lg border border-primary/30 bg-muted/30 p-3 text-center text-xs text-muted-foreground space-y-2">
                      <p>Adding a Dejero subsystem (operational). Edit it inline to change kind/status.</p>
                      <div className="flex justify-center gap-2">
                        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setAddingSubsystem(false)}>
                          Cancel
                        </Button>
                        <Button size="sm" className="h-7 text-xs" onClick={handleAddSubsystem}>
                          Confirm add
                        </Button>
                      </div>
                    </div>
                  )}

                  {canMutate && !addingSubsystem && (
                    <div className="pt-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs gap-1"
                        onClick={() => setAddingSubsystem(true)}
                      >
                        <Plus className="h-3 w-3" />
                        Add subsystem
                      </Button>
                    </div>
                  )}
                </TabsContent>

                {/* ── Scheduled work ──────────────────────────────────────── */}
                <TabsContent value="scheduled" className="mt-0 p-4 space-y-1">
                  {/* Active first, then completed/cancelled */}
                  {(() => {
                    const active = v.scheduledWork.filter(
                      (w) => w.status === 'scheduled' || w.status === 'in_progress',
                    );
                    const past = v.scheduledWork.filter(
                      (w) => w.status === 'done' || w.status === 'cancelled',
                    );
                    return (
                      <>
                        {active.length === 0 && past.length === 0 && !addingScheduled && (
                          <p className="py-6 text-center text-sm text-muted-foreground">
                            No scheduled work yet.
                          </p>
                        )}
                        {active.map((w) => (
                          <ScheduledWorkRow key={w.id} vehicleId={v.id} entry={w} canMutate={canMutate} />
                        ))}
                        {past.length > 0 && (
                          <>
                            {active.length > 0 && <div className="my-2 border-t border-border/40" />}
                            <p className="px-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/50">
                              Past
                            </p>
                            {past.map((w) => (
                              <ScheduledWorkRow key={w.id} vehicleId={v.id} entry={w} canMutate={canMutate} />
                            ))}
                          </>
                        )}
                        {addingScheduled && (
                          <ScheduledWorkRowSkeleton
                            vehicleId={v.id}
                            canMutate={canMutate}
                            onDone={() => setAddingScheduled(false)}
                          />
                        )}
                        {canMutate && !addingScheduled && (
                          <div className="pt-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs gap-1"
                              onClick={() => setAddingScheduled(true)}
                            >
                              <Plus className="h-3 w-3" />
                              Add work order
                            </Button>
                          </div>
                        )}
                      </>
                    );
                  })()}
                </TabsContent>

                {/* ── Log ────────────────────────────────────────────────── */}
                <TabsContent value="log" className="mt-0 p-4">
                  <LogTimeline
                    vehicleId={v.id}
                    vehicles={allVehicles}
                    canMutate={canMutate}
                    defaultVehicleIds={[v.id]}
                  />
                </TabsContent>

              </div>
            </ScrollArea>
          </Tabs>
        </SheetContent>
      </Sheet>

      {/* Loan dialog — rendered outside Sheet to avoid z-index nesting issues */}
      {loanTarget && (
        <SubsystemLoanDialog
          open={!!loanTarget}
          donorVehicle={v}
          subsystem={loanTarget}
          allVehicles={allVehicles}
          onClose={() => setLoanTarget(null)}
        />
      )}
    </>
  );
}
