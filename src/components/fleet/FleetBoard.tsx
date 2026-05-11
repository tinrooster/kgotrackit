import { useEffect, useMemo, useState } from 'react';
import { Plus, Truck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { VehicleCard } from './VehicleCard';
import { VehicleEditDialog } from './VehicleEditDialog';
import { VehicleDetailSheet } from './VehicleDetailSheet';
import {
  FLEET_UPDATED_EVENT,
  getFleet,
  removeVehicle,
  seedDefaultFleet,
  setVehicleStatus,
  upsertVehicle,
} from '@/lib/fleetService';
import { getCrewContacts } from '@/lib/crewContactsService';
import { useCanMutateAppData } from '@/hooks/useCanMutateAppData';
import { FleetVehicle, VehicleStatus, VEHICLE_STATUS_LABELS } from '@/types/fleet';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const STATUS_FILTERS: (VehicleStatus | 'all')[] = [
  'all', 'in_service', 'spare', 'in_shop', 'limited_use', 'out_of_service',
];

const FILTER_LABELS: Record<VehicleStatus | 'all', string> = {
  all: 'All',
  ...VEHICLE_STATUS_LABELS,
};

export function FleetBoard() {
  const canMutate = useCanMutateAppData();
  const [vehicles, setVehicles] = useState(() => getFleet().vehicles);
  const [statusFilter, setStatusFilter] = useState<VehicleStatus | 'all'>('all');
  const [selectedVehicle, setSelectedVehicle] = useState<FleetVehicle | null>(null);
  const [editTarget, setEditTarget] = useState<FleetVehicle | null | 'new'>( null);
  const [deleteTarget, setDeleteTarget] = useState<FleetVehicle | null>(null);

  // Build a quick lookup from contactId → name for default operators
  const contactNames = useMemo(() => {
    const map = new Map<string, string>();
    getCrewContacts().forEach((c) => map.set(c.id, c.fullName));
    return map;
  }, [vehicles]);

  useEffect(() => {
    const sync = () => setVehicles(getFleet().vehicles);
    window.addEventListener(FLEET_UPDATED_EVENT, sync);
    return () => window.removeEventListener(FLEET_UPDATED_EVENT, sync);
  }, []);

  const filtered = useMemo(
    () => (statusFilter === 'all' ? vehicles : vehicles.filter((v) => v.status === statusFilter)),
    [vehicles, statusFilter],
  );

  const counts = useMemo(() => {
    const c: Partial<Record<VehicleStatus | 'all', number>> = { all: vehicles.length };
    vehicles.forEach((v) => { c[v.status] = (c[v.status] ?? 0) + 1; });
    return c;
  }, [vehicles]);

  function getDefaultOperator(vehicle: FleetVehicle): string | undefined {
    const defaultAssignment = vehicle.assignments.find((a) => a.isDefault && a.role === 'photographer');
    if (!defaultAssignment) return undefined;
    return contactNames.get(defaultAssignment.contactId);
  }

  const handleSeed = () => {
    seedDefaultFleet();
    toast.success('Fleet roster seeded — M1–M25, Sat Truck, Expedition, M-26, M-33');
  };

  const handleDelete = (v: FleetVehicle) => {
    removeVehicle(v.id);
    if (selectedVehicle?.id === v.id) setSelectedVehicle(null);
    setDeleteTarget(null);
    toast.success(`${v.code} removed`);
  };

  return (
    <div className="space-y-4">
      {/* Page header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Fleet</h1>
          <p className="text-sm text-muted-foreground">
            News vehicles, crew assignments, and equipment status.
          </p>
        </div>
        {canMutate && (
          <Button onClick={() => setEditTarget('new')} className="gap-1.5">
            <Plus className="h-4 w-4" />
            Add Vehicle
          </Button>
        )}
      </div>

      {/* Filter chips */}
      {vehicles.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setStatusFilter(f)}
              className={cn(
                'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                statusFilter === f
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-background text-muted-foreground hover:border-foreground/40 hover:text-foreground',
              )}
            >
              {FILTER_LABELS[f]}
              {counts[f] !== undefined && (
                <span className={cn('ml-1.5 tabular-nums', statusFilter === f ? 'opacity-75' : 'opacity-50')}>
                  {counts[f]}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Empty state */}
      {vehicles.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
          <Truck className="mb-3 h-10 w-10 text-muted-foreground/30" />
          <p className="text-base font-medium">No vehicles yet</p>
          {canMutate ? (
            <div className="mt-4 flex flex-col items-center gap-2">
              <Button onClick={handleSeed} variant="default">
                Seed default roster
                <span className="ml-1.5 text-xs opacity-75">(M1–M25 + specials)</span>
              </Button>
              <p className="text-xs text-muted-foreground">or</p>
              <Button variant="outline" onClick={() => setEditTarget('new')}>
                Add vehicle manually
              </Button>
            </div>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">Ask an admin to add vehicles.</p>
          )}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
          No vehicles match this filter.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {filtered.map((v) => (
            <VehicleCard
              key={v.id}
              vehicle={v}
              defaultOperatorName={getDefaultOperator(v)}
              onClick={setSelectedVehicle}
              onEdit={canMutate ? (veh) => setEditTarget(veh) : undefined}
              onStatusChange={canMutate ? (veh, status) => { setVehicleStatus(veh.id, status); } : undefined}
              onDelete={canMutate ? setDeleteTarget : undefined}
            />
          ))}
        </div>
      )}

      {/* Detail sheet */}
      <VehicleDetailSheet
        vehicle={selectedVehicle}
        defaultOperatorName={selectedVehicle ? getDefaultOperator(selectedVehicle) : undefined}
        onClose={() => setSelectedVehicle(null)}
        onEdit={canMutate ? (v) => { setEditTarget(v); } : undefined}
      />

      {/* Edit / create dialog */}
      <VehicleEditDialog
        open={editTarget !== null}
        vehicle={editTarget === 'new' ? null : editTarget}
        onSave={(vehicle) => {
          upsertVehicle(vehicle);
          toast.success(editTarget === 'new' ? `${vehicle.code} added` : `${vehicle.code} updated`);
          setEditTarget(null);
        }}
        onClose={() => setEditTarget(null)}
      />

      {/* Delete confirmation */}
      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {deleteTarget?.code}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the vehicle and all its data. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && handleDelete(deleteTarget)}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
