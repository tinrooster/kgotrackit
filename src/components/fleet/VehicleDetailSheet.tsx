import { MapPin, Phone, Pencil, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import {
  FleetVehicle,
  VEHICLE_STATUS_LABELS,
  VEHICLE_STATUS_BADGE_CLASSES,
  VEHICLE_KIND_LABELS,
  CAPABILITY_LABELS,
} from '@/types/fleet';

interface VehicleDetailSheetProps {
  vehicle: FleetVehicle | null;
  defaultOperatorName?: string;
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

export function VehicleDetailSheet({ vehicle, defaultOperatorName, onClose, onEdit }: VehicleDetailSheetProps) {
  if (!vehicle) return null;

  const hasVehicleDetails = vehicle.plate || vehicle.vin || vehicle.make || vehicle.model || vehicle.year || vehicle.parkingSpot;
  const makeModel = [vehicle.make, vehicle.model].filter(Boolean).join(' ');

  return (
    <Sheet open={!!vehicle} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-md">
        {/* Header */}
        <SheetHeader className="border-b border-border px-6 pb-4 pt-6">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <SheetTitle className="text-xl font-bold leading-tight">{vehicle.code}</SheetTitle>
              <p className="mt-0.5 text-sm text-muted-foreground">{VEHICLE_KIND_LABELS[vehicle.kind]}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span
                className={cn(
                  'rounded-full border px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide',
                  VEHICLE_STATUS_BADGE_CLASSES[vehicle.status],
                )}
              >
                {VEHICLE_STATUS_LABELS[vehicle.status]}
              </span>
              {onEdit && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8"
                  onClick={() => onEdit(vehicle)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                  <span className="sr-only">Edit vehicle</span>
                </Button>
              )}
            </div>
          </div>
        </SheetHeader>

        {/* Body */}
        <div className="flex-1 space-y-5 px-6 py-5">
          {/* Quick-glance row */}
          <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
            {vehicle.location && (
              <div className="flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 shrink-0" />
                <span>{vehicle.location}</span>
              </div>
            )}
            {defaultOperatorName && (
              <div className="flex items-center gap-1.5">
                <User className="h-3.5 w-3.5 shrink-0" />
                <span>{defaultOperatorName}</span>
              </div>
            )}
            {vehicle.truckCellPhone && (
              <div className="flex items-center gap-1.5">
                <Phone className="h-3.5 w-3.5 shrink-0" />
                <span>{vehicle.truckCellPhone}</span>
              </div>
            )}
          </div>

          {/* Capabilities */}
          {vehicle.capabilities.length > 0 && (
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Capabilities
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {vehicle.capabilities.map((cap) => (
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

          {/* Vehicle details */}
          {hasVehicleDetails && (
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Vehicle Details
              </h3>
              <div className="space-y-1.5">
                {makeModel && <DetailRow label="Make / Model" value={makeModel} />}
                {vehicle.year && <DetailRow label="Year" value={vehicle.year} />}
                <DetailRow label="Plate" value={vehicle.plate} />
                <DetailRow label="VIN" value={vehicle.vin} />
                <DetailRow label="Parking spot" value={vehicle.parkingSpot} />
              </div>
            </section>
          )}

          {/* Notes */}
          {vehicle.notes && (
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Notes
              </h3>
              <p className="whitespace-pre-wrap text-sm">{vehicle.notes}</p>
            </section>
          )}

          {/* Phase 2 placeholder tabs */}
          <section className="rounded-lg border border-dashed border-border/60 p-4">
            <p className="text-center text-xs text-muted-foreground/60">
              Subsystems · Assignments · Scheduled Work · Log — Phase 2
            </p>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
