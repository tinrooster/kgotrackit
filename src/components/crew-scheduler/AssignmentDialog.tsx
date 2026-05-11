import { useState } from 'react';
import { format, parseISO } from 'date-fns';
import { X, UserCircle2 } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { ShiftDefinition, ShiftAssignment, DepartmentMember } from '@/types/crewScheduler';
import type { CrewContact } from '@/types/crewContacts';
import { createAssignment, deleteAssignment } from '@/lib/crewSchedulerService';

interface Props {
  open: boolean;
  onClose: () => void;
  shiftDef: ShiftDefinition | null;
  date: string;
  assignments: ShiftAssignment[];
  departmentMembers: DepartmentMember[];
  allContacts: CrewContact[];
}

export function AssignmentDialog({
  open, onClose, shiftDef, date, assignments, departmentMembers, allContacts,
}: Props) {
  const [selectedContactId, setSelectedContactId] = useState('');
  const [notes, setNotes] = useState('');

  if (!shiftDef) return null;

  const rosterContacts = departmentMembers
    .filter((m) => m.departmentId === shiftDef.departmentId)
    .map((m) => allContacts.find((c) => c.id === m.crewContactId))
    .filter((c): c is CrewContact => Boolean(c) && c.isActive);

  const assignedIds = new Set(assignments.map((a) => a.crewContactId));
  const available = rosterContacts.filter((c) => !assignedIds.has(c.id));

  const handleAdd = () => {
    if (!selectedContactId) return;
    createAssignment({
      shiftDefinitionId: shiftDef.id,
      crewContactId: selectedContactId,
      date,
      notes: notes.trim() || undefined,
    });
    setSelectedContactId('');
    setNotes('');
  };

  const filled = assignments.length;
  const required = shiftDef.requiredStaff;
  const coverageLabel =
    filled === 0 ? 'Unstaffed' : filled < required ? `${filled}/${required} — needs ${required - filled} more` : `${filled}/${required} — fully staffed`;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {shiftDef.color && (
              <span className="inline-block h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: shiftDef.color }} />
            )}
            {shiftDef.name} — {format(parseISO(date), 'EEE d MMM yyyy')}
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            {shiftDef.startTime}–{shiftDef.endTime} &middot; {coverageLabel}
          </p>
        </DialogHeader>

        <div className="space-y-4">
          {/* Current assignments */}
          <div>
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Assigned Crew
            </Label>
            <div className="mt-2 space-y-1">
              {assignments.length === 0 && (
                <p className="text-sm text-muted-foreground">No one assigned yet.</p>
              )}
              {assignments.map((a) => {
                const contact = allContacts.find((c) => c.id === a.crewContactId);
                return (
                  <div
                    key={a.id}
                    className="flex items-center justify-between rounded-md border bg-card px-3 py-2"
                  >
                    <div className="flex items-center gap-2">
                      <UserCircle2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <div>
                        <div className="text-sm font-medium">{contact?.fullName ?? 'Unknown'}</div>
                        {a.notes && <div className="text-xs text-muted-foreground">{a.notes}</div>}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                      onClick={() => deleteAssignment(a.id)}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Add crew */}
          <div>
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Add Crew Member
            </Label>
            {available.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">
                All roster members are assigned, or roster is empty.
              </p>
            ) : (
              <div className="mt-2 space-y-2">
                <Select value={selectedContactId} onValueChange={setSelectedContactId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select crew member..." />
                  </SelectTrigger>
                  <SelectContent>
                    {available.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.fullName}
                        {c.roleTags?.length > 0 && (
                          <span className="ml-1 text-xs text-muted-foreground">
                            ({c.roleTags.slice(0, 2).join(', ')})
                          </span>
                        )}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Textarea
                  placeholder="Notes (optional)"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="h-16 resize-none"
                />
                <Button onClick={handleAdd} disabled={!selectedContactId} className="w-full">
                  Add to Shift
                </Button>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
