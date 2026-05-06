import { useMemo, useRef, useState } from 'react';
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

function parseTimeToMinutes(value?: string): number {
  if (!value) return 8 * 60;
  const [h, m] = value.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 8 * 60;
  return Math.max(0, Math.min(24 * 60, h * 60 + m));
}

function minutesToTime(minutes: number): string {
  const safe = Math.max(0, Math.min(24 * 60, Math.round(minutes / 5) * 5));
  const h = Math.floor(safe / 60);
  const m = safe % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function colorForCrew(crewMemberId: string): string {
  const seed = crewMemberId.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const hue = seed % 360;
  return `hsl(${hue} 75% 55% / 0.22)`;
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
  const timelineContainerRef = useRef<HTMLDivElement | null>(null);
  const [dragState, setDragState] = useState<{
    entryId: string;
    mode: 'move' | 'resize';
    startX: number;
    initialStartMinutes: number;
    initialEndMinutes: number;
  } | null>(null);

  const dayEntries = useMemo(
    () =>
      schedule
        .filter((entry) => entry.date === dayFilter)
        .sort((left, right) => `${left.startTime || ''}`.localeCompare(right.startTime || '')),
    [schedule, dayFilter]
  );

  const timelineBlocks = dayEntries.map((entry) => {
    const startMinutes = parseTimeToMinutes(entry.startTime || '08:00');
    const endMinutes = Math.max(startMinutes + 30, parseTimeToMinutes(entry.endTime || '17:00'));
    return {
      entry,
      startMinutes,
      endMinutes,
      leftPercent: (startMinutes / (24 * 60)) * 100,
      widthPercent: ((endMinutes - startMinutes) / (24 * 60)) * 100,
    };
  });

  const updateEntryTimeRange = (entryId: string, nextStartMinutes: number, nextEndMinutes: number) => {
    const boundedStart = Math.max(0, Math.min(24 * 60 - 15, nextStartMinutes));
    const boundedEnd = Math.max(boundedStart + 15, Math.min(24 * 60, nextEndMinutes));
    onChange(
      schedule.map((entry) =>
        entry.id === entryId
          ? {
              ...entry,
              startTime: minutesToTime(boundedStart),
              endTime: minutesToTime(boundedEnd),
            }
          : entry
      )
    );
  };

  const handleBlockPointerDown = (
    event: React.MouseEvent<HTMLDivElement>,
    block: (typeof timelineBlocks)[number],
    mode: 'move' | 'resize'
  ) => {
    setDragState({
      entryId: block.entry.id,
      mode,
      startX: event.clientX,
      initialStartMinutes: block.startMinutes,
      initialEndMinutes: block.endMinutes,
    });
  };

  const handlePointerMove = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!dragState || !timelineContainerRef.current) return;
    const width = timelineContainerRef.current.clientWidth || 1;
    const deltaPx = event.clientX - dragState.startX;
    const deltaMinutes = (deltaPx / width) * 24 * 60;
    if (dragState.mode === 'move') {
      const duration = dragState.initialEndMinutes - dragState.initialStartMinutes;
      const nextStart = dragState.initialStartMinutes + deltaMinutes;
      updateEntryTimeRange(dragState.entryId, nextStart, nextStart + duration);
      return;
    }
    updateEntryTimeRange(
      dragState.entryId,
      dragState.initialStartMinutes,
      dragState.initialEndMinutes + deltaMinutes
    );
  };

  const handlePointerUp = () => {
    if (!dragState) return;
    setDragState(null);
  };

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
            <div
              ref={timelineContainerRef}
              className="space-y-2 rounded bg-muted/20 p-2"
              onMouseMove={handlePointerMove}
              onMouseUp={handlePointerUp}
              onMouseLeave={handlePointerUp}
            >
              {timelineBlocks.length === 0 ? (
                <p className="p-3 text-xs text-muted-foreground">No shifts scheduled for this day.</p>
              ) : null}
              {timelineBlocks.map((block) => (
                <div key={block.entry.id} className="grid grid-cols-[180px_1fr] items-center gap-3">
                  <div className="text-xs">
                    <p className="truncate font-medium">{resolveCrewLabel(crewMembers, block.entry.crewMemberId)}</p>
                    <p className="text-muted-foreground">
                      {block.entry.startTime || '--:--'} - {block.entry.endTime || '--:--'}
                    </p>
                  </div>
                  <div className="relative h-12 rounded border bg-background/70">
                    <div
                      className="absolute top-1 h-10 cursor-grab rounded border px-2 py-1 text-[11px] active:cursor-grabbing"
                      style={{
                        left: `${block.leftPercent}%`,
                        width: `${Math.max(block.widthPercent, 4)}%`,
                        backgroundColor: colorForCrew(block.entry.crewMemberId),
                        borderColor: 'hsl(var(--primary) / 0.5)',
                      }}
                      onMouseDown={(event) => handleBlockPointerDown(event, block, 'move')}
                      title="Drag to move block"
                    >
                      <div className="truncate font-medium">{block.entry.location || 'Scheduled block'}</div>
                      <div className="truncate text-[10px] text-muted-foreground">{block.entry.notes || 'Drag to move'}</div>
                      <div
                        className="absolute right-0 top-0 h-full w-2 cursor-ew-resize rounded-r bg-primary/40"
                        onMouseDown={(event) => {
                          event.stopPropagation();
                          handleBlockPointerDown(event, block, 'resize');
                        }}
                        title="Drag to resize block"
                      />
                    </div>
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
                    <div className="min-h-9 rounded border bg-muted/20 px-1 py-1">
                      <div className="flex flex-wrap gap-1">
                        {entries.length === 0 ? (
                          <span className="text-[10px] text-muted-foreground">No blocks</span>
                        ) : (
                          entries.map((entry) => (
                            <span
                              key={entry.id}
                              className="rounded border px-2 py-0.5 text-[10px]"
                              style={{ backgroundColor: colorForCrew(entry.crewMemberId) }}
                            >
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
