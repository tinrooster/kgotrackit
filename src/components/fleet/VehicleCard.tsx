import { MoreHorizontal, MapPin, User, Pencil, Trash2, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  FleetVehicle,
  VehicleStatus,
  VEHICLE_STATUS_LABELS,
  VEHICLE_STATUS_BADGE_CLASSES,
  VEHICLE_STATUS_OPTIONS,
} from '@/types/fleet';
import { productionListingTileInteractiveClassName } from '@/lib/productionListingTileStyles';

interface VehicleCardProps {
  vehicle: FleetVehicle;
  defaultOperatorName?: string;
  onClick: (vehicle: FleetVehicle) => void;
  onEdit?: (vehicle: FleetVehicle) => void;
  onStatusChange?: (vehicle: FleetVehicle, status: VehicleStatus) => void;
  onDelete?: (vehicle: FleetVehicle) => void;
}

export function VehicleCard({
  vehicle,
  defaultOperatorName,
  onClick,
  onEdit,
  onStatusChange,
  onDelete,
}: VehicleCardProps) {
  const openIssues = vehicle.subsystems.filter(
    (s) => s.status === 'down' || s.status === 'degraded' || s.status === 'awaiting_repair',
  ).length;

  const activeScheduled = vehicle.scheduledWork.filter(
    (w) => w.status === 'scheduled' || w.status === 'in_progress',
  ).length;

  return (
    <div
      className={productionListingTileInteractiveClassName}
      onClick={() => onClick(vehicle)}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 p-3 pb-2">
        <div className="min-w-0">
          <p className="font-bold text-base leading-tight truncate">{vehicle.code}</p>
          {vehicle.designation && (
            <p className="text-[10px] text-muted-foreground/70 truncate leading-tight">{vehicle.designation}</p>
          )}
          {defaultOperatorName ? (
            <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
              <User className="h-3 w-3 shrink-0" aria-hidden />
              <span className="truncate">{defaultOperatorName}</span>
            </div>
          ) : (
            <p className="mt-0.5 text-xs text-muted-foreground italic">Unassigned</p>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <span
            className={cn(
              'rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
              VEHICLE_STATUS_BADGE_CLASSES[vehicle.status],
            )}
          >
            {VEHICLE_STATUS_LABELS[vehicle.status]}
          </span>

          {(onEdit || onStatusChange || onDelete) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
                  <MoreHorizontal className="h-3.5 w-3.5" />
                  <span className="sr-only">Vehicle actions</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                {onEdit && (
                  <DropdownMenuItem onSelect={() => onEdit(vehicle)}>
                    <Pencil className="mr-2 h-3.5 w-3.5" />
                    Edit vehicle
                  </DropdownMenuItem>
                )}
                {onStatusChange && (
                  <>
                    {onEdit && <DropdownMenuSeparator />}
                    <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Set status
                    </p>
                    {VEHICLE_STATUS_OPTIONS.filter((o) => o.value !== vehicle.status).map((opt) => (
                      <DropdownMenuItem
                        key={opt.value}
                        onSelect={() => onStatusChange(vehicle, opt.value)}
                      >
                        {opt.label}
                      </DropdownMenuItem>
                    ))}
                  </>
                )}
                {onDelete && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onSelect={() => onDelete(vehicle)}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 className="mr-2 h-3.5 w-3.5" />
                      Delete
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between gap-2 border-t border-border/50 px-3 py-2 dark:border-border/40">
        {vehicle.location ? (
          <div className="flex items-center gap-1 text-xs text-muted-foreground min-w-0">
            <MapPin className="h-3 w-3 shrink-0" aria-hidden />
            <span className="truncate">{vehicle.location}</span>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground/50 italic">No location</span>
        )}

        {(openIssues > 0 || activeScheduled > 0) && (
          <div className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 shrink-0">
            <AlertCircle className="h-3 w-3" aria-hidden />
            <span>
              {openIssues > 0 ? `${openIssues} issue${openIssues !== 1 ? 's' : ''}` : `${activeScheduled} scheduled`}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
