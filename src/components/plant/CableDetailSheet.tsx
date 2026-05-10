import { useEffect, useState } from 'react';
import { CheckCircle2, Loader2, ArrowRight } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  getCable,
  verifyCable,
  setCableStatus,
  updateCableNotes,
  SIGNAL_TYPE_LABELS,
  STATUS_LABELS,
  STATUS_COLOURS,
} from '@/lib/plantService';
import type { PlantCable, PlantCableStatus } from '@/types/plant';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';

interface CableDetailSheetProps {
  cableId: string | null;
  onClose: () => void;
  onUpdated?: () => void;
}

const STATUS_OPTIONS: PlantCableStatus[] = [
  'unknown',
  'active',
  'review',
  'decommissioning',
  'decommissioned',
  'archived',
];

function Field({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium break-all">{value}</span>
    </div>
  );
}

export function CableDetailSheet({ cableId, onClose, onUpdated }: CableDetailSheetProps) {
  const { currentUser } = useAuth();
  const [cable, setCable] = useState<PlantCable | null>(null);
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [changingStatus, setChangingStatus] = useState(false);
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesValue, setNotesValue] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);

  useEffect(() => {
    if (!cableId) {
      setCable(null);
      return;
    }
    setLoading(true);
    setEditingNotes(false);
    getCable(cableId).then((c) => {
      setCable(c);
      setNotesValue(c?.notes ?? '');
      setLoading(false);
    });
  }, [cableId]);

  const handleVerify = async () => {
    if (!cable || !currentUser?.id) return;
    setVerifying(true);
    const ok = await verifyCable(cable.id, currentUser.id);
    if (ok) {
      toast.success('Cable marked active');
      const updated = await getCable(cable.id);
      setCable(updated);
      onUpdated?.();
    } else {
      toast.error('Failed to verify cable');
    }
    setVerifying(false);
  };

  const handleSaveNotes = async () => {
    if (!cable) return;
    setSavingNotes(true);
    const ok = await updateCableNotes(cable.id, notesValue);
    if (ok) {
      toast.success('Notes saved');
      setCable({ ...cable, notes: notesValue || undefined });
      setEditingNotes(false);
      onUpdated?.();
    } else {
      toast.error('Failed to save notes');
    }
    setSavingNotes(false);
  };

  const handleStatusChange = async (status: PlantCableStatus) => {
    if (!cable) return;
    setChangingStatus(true);
    const ok = await setCableStatus(cable.id, status);
    if (ok) {
      toast.success(`Status set to ${STATUS_LABELS[status]}`);
      const updated = await getCable(cable.id);
      setCable(updated);
      onUpdated?.();
    } else {
      toast.error('Failed to update status');
    }
    setChangingStatus(false);
  };

  return (
    <Sheet open={!!cableId} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent side="right" className="w-full max-w-md overflow-y-auto">
        {loading && (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}
        {!loading && cable && (
          <>
            <SheetHeader className="mb-4">
              <SheetTitle className="flex items-center gap-2 text-base">
                {cable.cableNumber ?? <span className="text-muted-foreground italic">No number</span>}
                <Badge className={cn('ml-auto shrink-0', STATUS_COLOURS[cable.status])}>
                  {STATUS_LABELS[cable.status]}
                </Badge>
              </SheetTitle>
              {cable.signalType && (
                <p className="text-sm text-muted-foreground">
                  {SIGNAL_TYPE_LABELS[cable.signalType]}
                  {cable.cableFamily && <> &middot; {cable.cableFamily}</>}
                  {cable.lengthFt && <> &middot; {cable.lengthFt} ft</>}
                </p>
              )}
            </SheetHeader>

            {/* Signal path */}
            <div className="rounded-lg border bg-muted/30 p-3 mb-4">
              <div className="flex items-start gap-2 text-sm">
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-muted-foreground mb-0.5">Origin</div>
                  <div className="font-medium break-all">{cable.originRaw || '—'}</div>
                  {cable.originLocationCode && (
                    <div className="text-xs text-muted-foreground mt-0.5">{cable.originLocationCode}</div>
                  )}
                </div>
                <ArrowRight className="h-4 w-4 shrink-0 mt-4 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-muted-foreground mb-0.5">Destination</div>
                  <div className="font-medium break-all">{cable.destRaw || '—'}</div>
                  {cable.destLocationCode && (
                    <div className="text-xs text-muted-foreground mt-0.5">{cable.destLocationCode}</div>
                  )}
                </div>
              </div>
            </div>

            {/* Verify / status actions */}
            <div className="flex flex-col gap-2 mb-4">
              {cable.status === 'unknown' && (
                <Button
                  onClick={handleVerify}
                  disabled={verifying}
                  className="w-full"
                >
                  {verifying
                    ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Verifying...</>
                    : <><CheckCircle2 className="h-4 w-4 mr-2" /> Confirm Active</>}
                </Button>
              )}
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground shrink-0">Set status:</span>
                <Select
                  value={cable.status}
                  onValueChange={(v) => handleStatusChange(v as PlantCableStatus)}
                  disabled={changingStatus}
                >
                  <SelectTrigger className="h-8 flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((s) => (
                      <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Separator className="my-4" />

            {/* Detail fields */}
            <div className="flex flex-col gap-3">
              <Field label="Drawing" value={cable.drawingId} />
              <Field label="Wire type (raw)" value={cable.wireTypeRaw} />
              <Field label="Jacket color" value={cable.jacketColor} />
              <Field label="Length (raw)" value={cable.lengthRaw} />
              <Field label="Alt drawing" value={cable.altDwg} />
              <Field label="NUMC" value={cable.numc} />
              <Field label="Legacy project" value={cable.legacyProjectId} />
              <div className="flex flex-col gap-0.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Notes</span>
                  {!editingNotes && (
                    <button
                      onClick={() => { setEditingNotes(true); setNotesValue(cable.notes ?? ''); }}
                      className="text-xs text-primary hover:underline"
                    >
                      {cable.notes ? 'Edit' : 'Add'}
                    </button>
                  )}
                </div>
                {editingNotes ? (
                  <div className="flex flex-col gap-1.5">
                    <Textarea
                      value={notesValue}
                      onChange={(e) => setNotesValue(e.target.value)}
                      rows={3}
                      className="text-sm resize-none"
                      placeholder="Add notes…"
                    />
                    <div className="flex gap-2">
                      <Button size="sm" className="h-7" onClick={handleSaveNotes} disabled={savingNotes}>
                        {savingNotes ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}Save
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7"
                        onClick={() => setEditingNotes(false)} disabled={savingNotes}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  cable.notes
                    ? <p className="text-sm whitespace-pre-wrap">{cable.notes}</p>
                    : <p className="text-xs text-muted-foreground italic">No notes</p>
                )}
              </div>
            </div>

            {(cable.verifiedAt) && (
              <>
                <Separator className="my-4" />
                <p className="text-xs text-muted-foreground">
                  Verified {new Date(cable.verifiedAt).toLocaleString()}
                  {cable.verifiedBy && <> by {cable.verifiedBy}</>}
                </p>
              </>
            )}

            <p className="mt-4 text-xs text-muted-foreground">
              ID: {cable.legacyId ?? cable.id}
            </p>
          </>
        )}
        {!loading && !cable && cableId && (
          <p className="text-sm text-muted-foreground mt-8 text-center">Cable not found.</p>
        )}
      </SheetContent>
    </Sheet>
  );
}
