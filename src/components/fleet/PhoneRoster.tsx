import { useMemo } from 'react';
import { Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { FleetVehicle } from '@/types/fleet';
import type { CrewContact } from '@/types/crewContacts';

interface PhoneRosterProps {
  open: boolean;
  vehicles: FleetVehicle[];
  contacts: CrewContact[];
  onClose: () => void;
}

interface RosterEntry {
  vehicleCode: string;
  truckPhone?: string;
  photographerName?: string;
  photographerPhone?: string;
}

export function PhoneRoster({ open, vehicles, contacts, onClose }: PhoneRosterProps) {
  const entries = useMemo<RosterEntry[]>(() => {
    const contactMap = new Map(contacts.map((c) => [c.id, c]));
    return vehicles
      .filter((v) => v.kind === 'truck' || v.kind === 'sat_truck' || v.kind === 'expedition')
      .sort((a, b) => a.displayOrder - b.displayOrder)
      .map((v) => {
        const defaultAssignment = v.assignments.find(
          (a) => a.role === 'photographer' && a.isDefault,
        );
        const contact = defaultAssignment ? contactMap.get(defaultAssignment.contactId) : undefined;
        return {
          vehicleCode: v.code,
          truckPhone: v.truckCellPhone,
          photographerName: contact?.fullName,
          photographerPhone: contact?.phone,
        };
      });
  }, [vehicles, contacts]);

  const handlePrint = () => {
    window.print();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>Phone Roster</DialogTitle>
            <Button size="sm" variant="outline" className="gap-1.5 print:hidden" onClick={handlePrint}>
              <Printer className="h-3.5 w-3.5" />
              Print
            </Button>
          </div>
        </DialogHeader>

        <style>{`
          @media print {
            .print\\:hidden { display: none !important; }
            body * { visibility: hidden; }
            .phone-roster-grid, .phone-roster-grid * { visibility: visible; }
            .phone-roster-grid { position: fixed; top: 0; left: 0; width: 100%; }
          }
        `}</style>

        <div className="phone-roster-grid grid grid-cols-2 gap-2 py-2">
          {entries.map((entry) => (
            <div
              key={entry.vehicleCode}
              className="rounded-md border border-border p-3 space-y-1 text-sm"
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-bold text-base">{entry.vehicleCode}</span>
                {entry.truckPhone && (
                  <span className="text-xs text-muted-foreground font-mono">{entry.truckPhone}</span>
                )}
              </div>
              {entry.photographerName ? (
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm">{entry.photographerName}</span>
                  {entry.photographerPhone && (
                    <span className="text-xs text-muted-foreground font-mono">{entry.photographerPhone}</span>
                  )}
                </div>
              ) : (
                <span className="text-xs text-muted-foreground italic">Unassigned</span>
              )}
            </div>
          ))}
        </div>

        {entries.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No vehicles to display. Add vehicles and crew assignments first.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
