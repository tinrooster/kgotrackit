import { useMemo, useState } from 'react';
import { addDays, format, parseISO, startOfWeek } from 'date-fns';
import { CrewScheduleEntry, ProductionCrewMember } from '@/types/productions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2 } from 'lucide-react';

interface CrewScheduleCalendarProps {
  crewMembers: ProductionCrewMember[];
  schedule: CrewScheduleEntry[];
  onChange: (schedule: CrewScheduleEntry[]) => void;
}

function resolveCrewLabel(crewMembers: ProductionCrewMember[], crewMemberId: string): string {
  const member = crewMembers.find((item) => item.id === crewMemberId);
  return member ? `${member.name}${member.role ? ` (${member.role})` : ''}` : 'Unassigned';
}

export function CrewScheduleCalendar({ crewMembers, schedule, onChange }: CrewScheduleCalendarProps) {
  const [draft, setDraft] = useState<Omit<CrewScheduleEntry, 'id'>>({
    crewMemberId: '',
    date: '',
    startTime: '',
    endTime: '',
    role: '',
    location: '',
    notes: '',
  });

  const weekStart = useMemo(() => {
    const baseDate = schedule[0]?.date ? parseISO(schedule[0].date) : new Date();
    return startOfWeek(baseDate, { weekStartsOn: 1 });
  }, [schedule]);
  const visibleDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  const addEntry = () => {
    if (!draft.crewMemberId || !draft.date) return;
    onChange([
      ...schedule,
      {
        ...draft,
        id: crypto.randomUUID(),
        role: draft.role || undefined,
        startTime: draft.startTime || undefined,
        endTime: draft.endTime || undefined,
        location: draft.location || undefined,
        notes: draft.notes || undefined,
      },
    ]);
    setDraft({ crewMemberId: '', date: '', startTime: '', endTime: '', role: '', location: '', notes: '' });
  };

  const removeEntry = (id: string) => {
    onChange(schedule.filter((entry) => entry.id !== id));
  };

  const groupedByDate = useMemo(() => {
    const map: Record<string, CrewScheduleEntry[]> = {};
    for (const entry of schedule) {
      if (!map[entry.date]) map[entry.date] = [];
      map[entry.date].push(entry);
    }
    return map;
  }, [schedule]);

  return (
    <div className="space-y-4">
      <div className="rounded-md border p-3">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Add schedule entry</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <Select value={draft.crewMemberId} onValueChange={(value) => setDraft((previous) => ({ ...previous, crewMemberId: value }))}>
            <SelectTrigger className="h-8">
              <SelectValue placeholder="Crew member" />
            </SelectTrigger>
            <SelectContent>
              {crewMembers.map((member) => (
                <SelectItem key={member.id} value={member.id}>
                  {member.name} {member.role ? `(${member.role})` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input className="h-8" type="date" value={draft.date} onChange={(event) => setDraft((previous) => ({ ...previous, date: event.target.value }))} />
          <Input className="h-8" type="time" value={draft.startTime} onChange={(event) => setDraft((previous) => ({ ...previous, startTime: event.target.value }))} />
          <Input className="h-8" type="time" value={draft.endTime} onChange={(event) => setDraft((previous) => ({ ...previous, endTime: event.target.value }))} />
          <Input className="h-8" placeholder="Role override" value={draft.role} onChange={(event) => setDraft((previous) => ({ ...previous, role: event.target.value }))} />
          <Input className="h-8" placeholder="Location" value={draft.location} onChange={(event) => setDraft((previous) => ({ ...previous, location: event.target.value }))} />
        </div>
        <Input className="mt-2 h-8" placeholder="Notes" value={draft.notes} onChange={(event) => setDraft((previous) => ({ ...previous, notes: event.target.value }))} />
        <Button className="mt-2 h-8 gap-1" size="sm" onClick={addEntry} disabled={!draft.crewMemberId || !draft.date}>
          <Plus className="h-3.5 w-3.5" />
          Add Entry
        </Button>
      </div>

      <div className="grid gap-2 md:grid-cols-7">
        {visibleDays.map((day) => {
          const dateKey = format(day, 'yyyy-MM-dd');
          const entries = groupedByDate[dateKey] || [];
          return (
            <div key={dateKey} className="rounded-md border p-2">
              <p className="mb-1 text-xs font-semibold">{format(day, 'EEE MMM d')}</p>
              <div className="space-y-1">
                {entries.length === 0 ? <p className="text-xs text-muted-foreground">No shifts</p> : null}
                {entries.map((entry) => (
                  <div key={entry.id} className="rounded border bg-muted/30 p-1.5 text-xs">
                    <div className="flex items-start justify-between gap-1">
                      <p className="font-medium">{resolveCrewLabel(crewMembers, entry.crewMemberId)}</p>
                      <button
                        type="button"
                        className="text-destructive hover:text-destructive/80"
                        onClick={() => removeEntry(entry.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                    <p>{entry.startTime || '--:--'} - {entry.endTime || '--:--'}</p>
                    {entry.location ? <p className="text-muted-foreground">{entry.location}</p> : null}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
