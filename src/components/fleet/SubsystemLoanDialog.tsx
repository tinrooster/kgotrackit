import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { FleetVehicle, VehicleSubsystem, SubsystemLoan } from '@/types/fleet';
import { SUBSYSTEM_KIND_LABELS } from '@/types/fleet';
import { getFleet, openLoan, closeLoan } from '@/lib/fleetService';
import { toast } from 'sonner';

// ---------------------------------------------------------------------------
// Open-loan dialog
// ---------------------------------------------------------------------------

interface SubsystemLoanDialogProps {
  open: boolean;
  donorVehicle: FleetVehicle;
  subsystem: VehicleSubsystem;
  allVehicles: FleetVehicle[];
  onClose: () => void;
}

export function SubsystemLoanDialog({
  open,
  donorVehicle,
  subsystem,
  allVehicles,
  onClose,
}: SubsystemLoanDialogProps) {
  const [recipientId, setRecipientId] = useState('');
  const [expectedReturn, setExpectedReturn] = useState('');
  const [notes, setNotes] = useState('');

  const candidates = allVehicles.filter((v) => v.id !== donorVehicle.id);

  const handleOpen = () => {
    if (!recipientId) return;
    const loan: SubsystemLoan = {
      id: crypto.randomUUID(),
      donorVehicleId: donorVehicle.id,
      recipientVehicleId: recipientId,
      subsystemKind: subsystem.kind,
      startedAt: new Date().toISOString(),
      expectedReturn: expectedReturn ? `${expectedReturn}T00:00:00.000Z` : undefined,
      notes: notes.trim() || undefined,
    };
    openLoan(loan);
    const recipient = candidates.find((v) => v.id === recipientId);
    toast.success(
      `${SUBSYSTEM_KIND_LABELS[subsystem.kind]} moved from ${donorVehicle.code} to ${recipient?.code ?? 'vehicle'}`,
    );
    setRecipientId('');
    setExpectedReturn('');
    setNotes('');
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>
            Loan {SUBSYSTEM_KIND_LABELS[subsystem.kind]} from {donorVehicle.code}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label>Recipient vehicle *</Label>
            <Select value={recipientId} onValueChange={setRecipientId}>
              <SelectTrigger>
                <SelectValue placeholder="Select vehicle…" />
              </SelectTrigger>
              <SelectContent>
                {candidates.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.code}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="loan-return">Expected return</Label>
            <Input
              id="loan-return"
              type="date"
              value={expectedReturn}
              onChange={(e) => setExpectedReturn(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="loan-notes">Notes</Label>
            <Textarea
              id="loan-notes"
              rows={2}
              placeholder="Reason, tracking number…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleOpen} disabled={!recipientId}>
            Open Loan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Close-loan confirmation (inline, not a dialog — called from SubsystemRow)
// ---------------------------------------------------------------------------

export function closeActiveLoan(vehicleId: string, subsystemKind: VehicleSubsystem['kind']): void {
  const state = getFleet();
  const loan = state.loans.find(
    (l) => l.donorVehicleId === vehicleId && l.subsystemKind === subsystemKind && !l.resolvedAt,
  );
  if (loan) {
    closeLoan(loan.id);
    toast.success(`${SUBSYSTEM_KIND_LABELS[subsystemKind]} loan closed`);
  }
}
