import { useMemo, useState } from 'react';
import { addDays, format, parseISO, startOfWeek } from 'date-fns';
import { CrewScheduleEntry, ProductionCrewMember } from '@/types/productions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2 } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface CrewScheduleCalendarProps {
  crewMembers: ProductionCrewMember[];
  schedule: CrewScheduleEntry[];
  projectStartDate?: string;
  projectEndDate?: string;
  resources?: Array<{ id: string; label: string; quantity: number }>;
  onChange: (schedule: CrewScheduleEntry[]) => void;
}

function resolveCrewLabel(crewMembers: ProductionCrewMember[], crewMemberId: string): string {
  const member = crewMembers.find((item) => item.id === crewMemberId);
  return member ? `${member.name}${member.role ? ` (${member.role})` : ''}` : 'Unassigned';
}

export function CrewScheduleCalendar({
  crewMembers,
  schedule,
  projectStartDate,
  projectEndDate,
  resources = [],
  onChange
}: CrewScheduleCalendarProps) {
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

  const selectedDay = useMemo(() => {
    if (schedule[0]?.date) return schedule[0].date;
    if (projectStartDate) return projectStartDate;
    return format(new Date(), 'yyyy-MM-dd');
  }, [schedule, projectStartDate]);

  const [dayFilter, setDayFilter] = useState(selectedDay);

  const dayEntries = useMemo(
    () =>
      schedule
        .filter((entry) => entry.date === dayFilter)
        .sort((left, right) => `${left.startTime || ''}`.localeCompare(right.startTime || '')),
    [schedule, dayFilter]
  );

  const timelineBlocks = dayEntries.map((entry) => {
    const startHour = Number((entry.startTime || '08:00').split(':')[0]) + Number((entry.startTime || '08:00').split(':')[1]) / 60;
    const endHour = Number((entry.endTime || '17:00').split(':')[0]) + Number((entry.endTime || '17:00').split(':')[1]) / 60;
    const safeStart = Math.max(0, Math.min(23.5, startHour));
    const safeEnd = Math.max(safeStart + 0.25, Math.min(24, endHour));
    return {
      entry,
      leftPercent: (safeStart / 24) * 100,
      widthPercent: ((safeEnd - safeStart) / 24) * 100,
    };
  });

  const projectSpanDates = useMemo(() => {
    const start = projectStartDate ? parseISO(projectStartDate) : weekStart;
    const end = projectEndDate ? parseISO(projectEndDate) : addDays(start, 6);
    const days = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1);
    return Array.from({ length: days }, (_, index) => addDays(start, index));
  }, [projectStartDate, projectEndDate, weekStart]);

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

      <Tabs defaultValue="day-board" className="space-y-3">
        <TabsList>
          <TabsTrigger value="day-board">Day Board</TabsTrigger>
          <TabsTrigger value="project-span">Project Span</TabsTrigger>
          <TabsTrigger value="week-cards">Week Cards</TabsTrigger>
        </TabsList>

        <TabsContent value="day-board" className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              className="h-8 w-[180px]"
              type="date"
              value={dayFilter}
              onChange={(event) => setDayFilter(event.target.value)}
            />
            <span className="text-xs text-muted-foreground">
              Graphical day-of blocking by crew/resource time
            </span>
          </div>
          <div className="rounded-md border p-3">
            <div className="mb-2 grid grid-cols-8 text-[10px] text-muted-foreground">
              {['00', '03', '06', '09', '12', '15', '18', '21'].map((hour) => (
                <span key={hour}>{hour}:00</span>
              ))}
            </div>
            <div className="relative h-44 rounded bg-muted/20">
              {timelineBlocks.length === 0 ? (
                <p className="p-3 text-xs text-muted-foreground">No shifts scheduled for this day.</p>
              ) : null}
              {timelineBlocks.map((block, index) => (
                <div
                  key={block.entry.id}
                  className="absolute rounded border bg-primary/15 px-2 py-1 text-[11px]"
                  style={{
                    left: `${block.leftPercent}%`,
                    width: `${Math.max(block.widthPercent, 6)}%`,
                    top: `${8 + (index % 6) * 22}px`,
                  }}
                >
                  <div className="truncate font-medium">{resolveCrewLabel(crewMembers, block.entry.crewMemberId)}</div>
                  <div className="truncate text-[10px] text-muted-foreground">
                    {block.entry.startTime || '--:--'} - {block.entry.endTime || '--:--'}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-md border p-3">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Day resources</p>
            {resources.length === 0 ? (
              <p className="text-xs text-muted-foreground">No linked resources.</p>
            ) : (
              <div className="grid gap-1 sm:grid-cols-2">
                {resources.map((resource) => (
                  <div key={resource.id} className="flex items-center justify-between rounded border bg-muted/20 px-2 py-1 text-xs">
                    <span className="truncate">{resource.label}</span>
                    <span className="font-medium">x{resource.quantity}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="project-span" className="space-y-3">
          <div className="rounded-md border p-3">
            <p className="mb-2 text-xs text-muted-foreground">Graphical span of scheduled blocks across project days</p>
            <div className="space-y-2">
              {projectSpanDates.map((date) => {
                const key = format(date, 'yyyy-MM-dd');
                const entries = groupedByDate[key] || [];
                return (
                  <div key={key} className="grid grid-cols-[120px_1fr] items-center gap-2">
                    <span className="text-xs font-medium">{format(date, 'EEE MMM d')}</span>
                    <div className="min-h-7 rounded border bg-muted/20 px-1 py-1">
                      <div className="flex flex-wrap gap-1">
                        {entries.length === 0 ? (
                          <span className="text-[10px] text-muted-foreground">No blocks</span>
                        ) : (
                          entries.map((entry) => (
                            <span key={entry.id} className="rounded bg-primary/15 px-2 py-0.5 text-[10px]">
                              {resolveCrewLabel(crewMembers, entry.crewMemberId)} {entry.startTime || ''}-{entry.endTime || ''}
                            </span>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="week-cards">
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
        </TabsContent>
      </Tabs>
    </div>
  );
}
