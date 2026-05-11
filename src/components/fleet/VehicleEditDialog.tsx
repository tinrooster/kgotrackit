import { useEffect, useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  FleetVehicle,
  VehicleKind,
  VehicleStatus,
  CapabilityFlag,
  VEHICLE_KIND_OPTIONS,
  VEHICLE_STATUS_OPTIONS,
  CAPABILITY_LABELS,
} from '@/types/fleet';
import { getFleet } from '@/lib/fleetService';

interface VehicleEditDialogProps {
  open: boolean;
  vehicle: FleetVehicle | null;
  onSave: (vehicle: FleetVehicle) => void;
  onClose: () => void;
}

const ALL_CAPABILITIES = Object.keys(CAPABILITY_LABELS) as CapabilityFlag[];

const BLANK: Omit<FleetVehicle, 'id' | 'createdAt' | 'updatedAt' | 'subsystems' | 'assignments' | 'scheduledWork'> = {
  code: '',
  designation: '',
  kind: 'truck',
  displayOrder: 99,
  status: 'in_service',
  capabilities: ['liveshot', 'dejero', 'edit'],
  location: '',
  truckCellPhone: '',
  plate: '',
  vin: '',
  make: '',
  model: '',
  year: undefined,
  parkingSpot: '',
  notes: '',
};

export function VehicleEditDialog({ open, vehicle, onSave, onClose }: VehicleEditDialogProps) {
  const isNew = vehicle === null;
  const [form, setForm] = useState({ ...BLANK });
  const [showDetails, setShowDetails] = useState(false);
  const designationListId = useId();

  const designationOptions = Array.from(
    new Set(
      getFleet().vehicles
        .map((v) => v.designation)
        .filter((d): d is string => Boolean(d)),
    ),
  );

  useEffect(() => {
    if (!open) return;
    if (vehicle) {
      setForm({
        code: vehicle.code,
        designation: vehicle.designation ?? '',
        kind: vehicle.kind,
        displayOrder: vehicle.displayOrder,
        status: vehicle.status,
        capabilities: [...vehicle.capabilities],
        location: vehicle.location ?? '',
        truckCellPhone: vehicle.truckCellPhone ?? '',
        plate: vehicle.plate ?? '',
        vin: vehicle.vin ?? '',
        make: vehicle.make ?? '',
        model: vehicle.model ?? '',
        year: vehicle.year,
        parkingSpot: vehicle.parkingSpot ?? '',
        notes: vehicle.notes ?? '',
      });
      setShowDetails(!!(vehicle.plate || vehicle.vin || vehicle.make || vehicle.model || vehicle.year || vehicle.parkingSpot));
    } else {
      setForm({ ...BLANK });
      setShowDetails(false);
    }
  }, [open, vehicle]);

  const toggleCap = (cap: CapabilityFlag) => {
    setForm((f) => ({
      ...f,
      capabilities: f.capabilities.includes(cap)
        ? f.capabilities.filter((c) => c !== cap)
        : [...f.capabilities, cap],
    }));
  };

  const handleSave = () => {
    const code = form.code.trim();
    if (!code) return;
    const now = new Date().toISOString();
    const saved: FleetVehicle = {
      id: vehicle?.id ?? crypto.randomUUID(),
      code,
      designation: (form.designation ?? '').trim() || undefined,
      kind: form.kind as VehicleKind,
      displayOrder: Number(form.displayOrder) || 99,
      status: form.status as VehicleStatus,
      capabilities: form.capabilities,
      location: (form.location ?? '').trim() || undefined,
      truckCellPhone: (form.truckCellPhone ?? '').trim() || undefined,
      plate: (form.plate ?? '').trim() || undefined,
      vin: (form.vin ?? '').trim() || undefined,
      make: (form.make ?? '').trim() || undefined,
      model: (form.model ?? '').trim() || undefined,
      year: form.year ? Number(form.year) : undefined,
      parkingSpot: (form.parkingSpot ?? '').trim() || undefined,
      notes: (form.notes ?? '').trim() || undefined,
      subsystems: vehicle?.subsystems ?? [],
      assignments: vehicle?.assignments ?? [],
      scheduledWork: vehicle?.scheduledWork ?? [],
      createdAt: vehicle?.createdAt ?? now,
      updatedAt: now,
    };
    onSave(saved);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isNew ? 'Add Vehicle' : `Edit ${vehicle?.code}`}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Code + display order */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="veh-code">Vehicle code *</Label>
              <Input
                id="veh-code"
                placeholder="M5, Sat Truck…"
                value={form.code}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="veh-order">Order</Label>
              <Input
                id="veh-order"
                type="number"
                min={1}
                value={form.displayOrder}
                onChange={(e) => setForm((f) => ({ ...f, displayOrder: Number(e.target.value) }))}
              />
            </div>
          </div>

          {/* Designation */}
          <div className="space-y-1.5">
            <Label htmlFor="veh-designation">Designation</Label>
            <Input
              id="veh-designation"
              list={designationListId}
              placeholder="Grip Van, Lighting & Production…"
              value={form.designation ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, designation: e.target.value }))}
              autoComplete="off"
            />
            <datalist id={designationListId}>
              {designationOptions.map((d) => (
                <option key={d} value={d} />
              ))}
            </datalist>
          </div>

          {/* Kind + Status */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={form.kind} onValueChange={(v) => setForm((f) => ({ ...f, kind: v as VehicleKind }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VEHICLE_KIND_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v as VehicleStatus }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VEHICLE_STATUS_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Location + truck cell */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="veh-loc">Location</Label>
              <Input
                id="veh-loc"
                placeholder="Market St, KPIX…"
                value={form.location}
                onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="veh-cell">Truck cell</Label>
              <Input
                id="veh-cell"
                placeholder="(415) 555-0100"
                value={form.truckCellPhone}
                onChange={(e) => setForm((f) => ({ ...f, truckCellPhone: e.target.value }))}
              />
            </div>
          </div>

          {/* Capabilities */}
          <div className="space-y-2">
            <Label>Capabilities</Label>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 sm:grid-cols-3">
              {ALL_CAPABILITIES.map((cap) => (
                <label key={cap} className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={form.capabilities.includes(cap)}
                    onCheckedChange={() => toggleCap(cap)}
                  />
                  {CAPABILITY_LABELS[cap]}
                </label>
              ))}
            </div>
          </div>

          {/* Vehicle details disclosure */}
          <button
            type="button"
            className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
            onClick={() => setShowDetails((v) => !v)}
          >
            {showDetails ? 'Hide' : 'Show'} vehicle details (plate, VIN, make/model…)
          </button>

          {showDetails && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="veh-plate">Plate</Label>
                  <Input id="veh-plate" value={form.plate} onChange={(e) => setForm((f) => ({ ...f, plate: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="veh-parking">Parking spot</Label>
                  <Input id="veh-parking" value={form.parkingSpot} onChange={(e) => setForm((f) => ({ ...f, parkingSpot: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="veh-make">Make</Label>
                  <Input id="veh-make" placeholder="Ford" value={form.make} onChange={(e) => setForm((f) => ({ ...f, make: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="veh-model">Model</Label>
                  <Input id="veh-model" placeholder="F-150" value={form.model} onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="veh-year">Year</Label>
                  <Input id="veh-year" type="number" min={1990} max={2030} value={form.year ?? ''} onChange={(e) => setForm((f) => ({ ...f, year: e.target.value ? Number(e.target.value) : undefined }))} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="veh-vin">VIN</Label>
                <Input id="veh-vin" className="font-mono" value={form.vin} onChange={(e) => setForm((f) => ({ ...f, vin: e.target.value }))} />
              </div>
            </div>
          )}

          {/* Notes */}
          <div className="space-y-1.5">
            <Label htmlFor="veh-notes">Notes</Label>
            <Textarea
              id="veh-notes"
              rows={2}
              placeholder="Known issues, caveats…"
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={!form.code.trim()}>
            {isNew ? 'Add Vehicle' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
