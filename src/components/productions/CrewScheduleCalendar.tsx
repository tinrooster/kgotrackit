import { useEffect, useMemo, useRef, useState } from 'react';
import { addDays, format, parseISO, startOfWeek } from 'date-fns';
import { CrewScheduleEntry, ProductionCrewMember } from '@/types/productions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TimeInput } from '@/components/ui/time-input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, Pencil } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { OptionalFormCollapsible } from '@/components/forms/OptionalFormCollapsible';
import { minutesToTime, normalizeQuarterHourTime, parseTimeToMinutes } from '@/lib/dateTimeInputs';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface CrewScheduleCalendarProps {
  crewMembers: ProductionCrewMember[];
  schedule: CrewScheduleEntry[];
  projectStartDate?: string;
  projectEndDate?: string;
  projectedWindowStartTime?: string;
  projectedWindowEndTime?: string;
  onProjectedWindowChange?: (window: { startTime?: string; endTime?: string }) => void;
  requireDeleteConfirm?: boolean;
  resources?: Array<{ id: string; label: string; quantity: number }>;
  onChange: (schedule: CrewScheduleEntry[]) => void;
}

function resolveCrewLabel(crewMembers: ProductionCrewMember[], crewMemberId: string): string {
  const member = crewMembers.find((item) => item.id === crewMemberId);
  return member ? `${member.name}${member.role ? ` (${member.role})` : ''}` : 'Unassigned';
}

function clampDateToProjectRange(dateValue: string, projectStartDate?: string, projectEndDate?: string): string {
  if (!dateValue) return dateValue;
  if (projectStartDate && dateValue < projectStartDate) return projectStartDate;
  if (projectEndDate && dateValue > projectEndDate) return projectEndDate;
  return dateValue;
}

function isDateWithinProjectRange(dateValue: string, projectStartDate?: string, projectEndDate?: string): boolean {
  if (!dateValue) return false;
  if (projectStartDate && dateValue < projectStartDate) return false;
  if (projectEndDate && dateValue > projectEndDate) return false;
  return true;
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
  projectedWindowStartTime,
  projectedWindowEndTime,
  onProjectedWindowChange,
  requireDeleteConfirm = false,
  resources = [],
  onChange
}: CrewScheduleCalendarProps) {
  const projectedDate = useMemo(
    () => clampDateToProjectRange(projectStartDate || format(new Date(), 'yyyy-MM-dd'), projectStartDate, projectEndDate),
    [projectStartDate, projectEndDate]
  );
  const derivedWindowStart = useMemo(() => {
    if (projectedWindowStartTime) return normalizeQuarterHourTime(projectedWindowStartTime);
    const firstScheduled = schedule.find((entry) => entry.startTime)?.startTime;
    return firstScheduled ? normalizeQuarterHourTime(firstScheduled) : '';
  }, [projectedWindowStartTime, schedule]);
  const derivedWindowEnd = useMemo(() => {
    if (projectedWindowEndTime) return normalizeQuarterHourTime(projectedWindowEndTime);
    const latestScheduled = [...schedule].reverse().find((entry) => entry.endTime)?.endTime;
    return latestScheduled ? normalizeQuarterHourTime(latestScheduled) : '';
  }, [projectedWindowEndTime, schedule]);
  const [useProjectedDefaults, setUseProjectedDefaults] = useState(true);
  const [draft, setDraft] = useState<Omit<CrewScheduleEntry, 'id'>>({
    crewMemberId: '',
    date: projectedDate,
    startTime: derivedWindowStart,
    endTime: derivedWindowEnd,
    role: '',
    location: '',
    notes: '',
  });

  useEffect(() => {
    if (!useProjectedDefaults) return;
    setDraft((previous) => ({
      ...previous,
      date: previous.date || projectedDate,
      startTime: previous.startTime || derivedWindowStart,
      endTime: previous.endTime || derivedWindowEnd,
    }));
  }, [useProjectedDefaults, projectedDate, derivedWindowStart, derivedWindowEnd]);

  const weekStart = useMemo(() => {
    const baseDate = schedule[0]?.date ? parseISO(schedule[0].date) : new Date();
    return startOfWeek(baseDate, { weekStartsOn: 1 });
  }, [schedule]);
  const visibleDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  const addEntry = () => {
    if (!draft.crewMemberId || !draft.date) return;
    if (!isDateWithinProjectRange(draft.date, projectStartDate, projectEndDate)) return;
    onChange([
      ...schedule,
      {
        ...draft,
        id: crypto.randomUUID(),
        role: draft.role || undefined,
        startTime: draft.startTime ? normalizeQuarterHourTime(draft.startTime) : undefined,
        endTime: draft.endTime ? normalizeQuarterHourTime(draft.endTime) : undefined,
        location: draft.location || undefined,
        notes: draft.notes || undefined,
      },
    ]);
    setDraft({
      crewMemberId: '',
      date: useProjectedDefaults ? projectedDate : '',
      startTime: useProjectedDefaults ? derivedWindowStart : '',
      endTime: useProjectedDefaults ? derivedWindowEnd : '',
      role: '',
      location: '',
      notes: '',
    });
  };

  const removeEntry = (id: string) => {
    onChange(schedule.filter((entry) => entry.id !== id));
  };

  const runDeleteAction = (entryId: string) => {
    if (!requireDeleteConfirm) {
      removeEntry(entryId);
      return;
    }
    setPendingDeleteEntryId(entryId);
  };

  const openEditEntry = (entry: CrewScheduleEntry) => {
    setEditingEntryId(entry.id);
    setEditingDraft({
      crewMemberId: entry.crewMemberId,
      date: entry.date,
      startTime: entry.startTime ?? '',
      endTime: entry.endTime ?? '',
      role: entry.role ?? '',
      location: entry.location ?? '',
      notes: entry.notes ?? '',
    });
  };

  const saveEditedEntry = () => {
    if (!editingEntryId || !editingDraft?.crewMemberId || !editingDraft.date) return;
    if (!isDateWithinProjectRange(editingDraft.date, projectStartDate, projectEndDate)) return;
    onChange(
      schedule.map((entry) =>
        entry.id === editingEntryId
          ? {
              ...entry,
              ...editingDraft,
              date: clampDateToProjectRange(editingDraft.date, projectStartDate, projectEndDate),
              startTime: editingDraft.startTime ? normalizeQuarterHourTime(editingDraft.startTime) : undefined,
              endTime: editingDraft.endTime ? normalizeQuarterHourTime(editingDraft.endTime) : undefined,
              role: editingDraft.role || undefined,
              location: editingDraft.location || undefined,
              notes: editingDraft.notes || undefined,
            }
          : entry
      )
    );
    setEditingEntryId(null);
    setEditingDraft(null);
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

  const [dayFilter, setDayFilter] = useState(
    clampDateToProjectRange(selectedDay, projectStartDate, projectEndDate)
  );
  const timelineContainerRef = useRef<HTMLDivElement | null>(null);
  const [dragState, setDragState] = useState<{
    entryId: string;
    mode: 'move' | 'resize';
    startX: number;
    initialStartMinutes: number;
    initialEndMinutes: number;
  } | null>(null);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState<Omit<CrewScheduleEntry, 'id'> | null>(null);
  const [pendingDeleteEntryId, setPendingDeleteEntryId] = useState<string | null>(null);

  useEffect(() => {
    setDayFilter((previous) => clampDateToProjectRange(previous || selectedDay, projectStartDate, projectEndDate));
  }, [selectedDay, projectStartDate, projectEndDate]);

  const dayEntries = useMemo(
    () =>
      schedule
        .filter((entry) => entry.date === dayFilter)
        .sort((left, right) => `${left.startTime || ''}`.localeCompare(right.startTime || '')),
    [schedule, dayFilter]
  );

  const timelineBlocks = dayEntries.map((entry) => {
    const defaultStartMinutes = parseTimeToMinutes(derivedWindowStart, 0);
    const defaultEndMinutes = parseTimeToMinutes(derivedWindowEnd, defaultStartMinutes + 15);
    const startMinutes = parseTimeToMinutes(entry.startTime, defaultStartMinutes);
    const endMinutes = Math.max(startMinutes + 15, parseTimeToMinutes(entry.endTime, defaultEndMinutes));
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
      <OptionalFormCollapsible title="Add schedule entry" className="rounded-md border">
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
          <Input
            className="h-8"
            type="date"
            min={projectStartDate}
            max={projectEndDate}
            value={draft.date}
            onChange={(event) =>
              setDraft((previous) => ({
                ...previous,
                date: clampDateToProjectRange(event.target.value, projectStartDate, projectEndDate),
              }))
            }
          />
          <TimeInput
            className="h-8"
            value={draft.startTime}
            onChange={(event) => setDraft((previous) => ({ ...previous, startTime: event.target.value }))}
            onBlurCommit={(value) =>
              setDraft((previous) => ({
                ...previous,
                startTime: value ?? '',
              }))
            }
          />
          <TimeInput
            className="h-8"
            value={draft.endTime}
            onChange={(event) => setDraft((previous) => ({ ...previous, endTime: event.target.value }))}
            onBlurCommit={(value) =>
              setDraft((previous) => ({
                ...previous,
                endTime: value ?? '',
              }))
            }
          />
          <Input className="h-8" placeholder="Role override" value={draft.role} onChange={(event) => setDraft((previous) => ({ ...previous, role: event.target.value }))} />
          <Input className="h-8" placeholder="Location" value={draft.location} onChange={(event) => setDraft((previous) => ({ ...previous, location: event.target.value }))} />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <TimeInput
            className="h-7 w-[130px]"
            value={derivedWindowStart}
            onChange={(event) =>
              onProjectedWindowChange?.({
                startTime: event.target.value ? normalizeQuarterHourTime(event.target.value) : undefined,
                endTime: projectedWindowEndTime,
              })
            }
            onBlurCommit={(value) =>
              onProjectedWindowChange?.({
                startTime: value,
                endTime: projectedWindowEndTime,
              })
            }
          />
          <TimeInput
            className="h-7 w-[130px]"
            value={derivedWindowEnd}
            onChange={(event) =>
              onProjectedWindowChange?.({
                startTime: projectedWindowStartTime,
                endTime: event.target.value ? normalizeQuarterHourTime(event.target.value) : undefined,
              })
            }
            onBlurCommit={(value) =>
              onProjectedWindowChange?.({
                startTime: projectedWindowStartTime,
                endTime: value,
              })
            }
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7"
            onClick={() =>
              setDraft((previous) => ({
                ...previous,
                date: projectedDate,
                startTime: derivedWindowStart,
                endTime: derivedWindowEnd,
              }))
            }
            disabled={!derivedWindowStart && !derivedWindowEnd}
          >
            Use Projected Window
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7"
            onClick={() => setDraft((previous) => ({ ...previous, date: dayFilter }))}
          >
            Use Day Board Date
          </Button>
          <label className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <input
              type="checkbox"
              className="h-3.5 w-3.5"
              checked={useProjectedDefaults}
              onChange={(event) => setUseProjectedDefaults(event.target.checked)}
            />
            Reset new entry to projected window
          </label>
        </div>
        <Input className="mt-2 h-8" placeholder="Notes" value={draft.notes} onChange={(event) => setDraft((previous) => ({ ...previous, notes: event.target.value }))} />
        <Button className="mt-2 h-8 gap-1" size="sm" onClick={addEntry} disabled={!draft.crewMemberId || !draft.date}>
          <Plus className="h-3.5 w-3.5" />
          Add Entry
        </Button>
      </OptionalFormCollapsible>

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
              min={projectStartDate}
              max={projectEndDate}
              value={dayFilter}
              onChange={(event) => setDayFilter(clampDateToProjectRange(event.target.value, projectStartDate, projectEndDate))}
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
                      <div className="absolute left-1 top-1 flex items-center gap-0.5">
                        <button
                          type="button"
                          className="rounded border bg-background/80 p-0.5 hover:bg-background"
                          onClick={(event) => {
                            event.stopPropagation();
                            openEditEntry(block.entry);
                          }}
                          title="Edit block"
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          className={`rounded border p-0.5 ${
                            'border-red-500/40 bg-red-500/10 hover:bg-red-500/20'
                          }`}
                          onClick={(event) => {
                            event.stopPropagation();
                            runDeleteAction(block.entry.id);
                          }}
                          title="Delete block"
                        >
                          <Trash2 className="h-3 w-3 text-red-300" />
                        </button>
                      </div>
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
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              className="text-muted-foreground hover:text-foreground"
                              onClick={() => openEditEntry(entry)}
                              title="Edit shift"
                            >
                              <Pencil className="h-3 w-3" />
                            </button>
                            <button
                              type="button"
                              className={`rounded border p-0.5 ${
                                'border-red-500/40 bg-red-500/10 text-red-300 hover:bg-red-500/20'
                              }`}
                              onClick={() => runDeleteAction(entry.id)}
                              title="Delete shift"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
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
      <Dialog
        open={Boolean(editingEntryId && editingDraft)}
        onOpenChange={(open) => {
          if (!open) {
            setEditingEntryId(null);
            setEditingDraft(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Schedule Block</DialogTitle>
          </DialogHeader>
          {editingDraft ? (
            <div className="grid gap-2 sm:grid-cols-2">
              <Select
                value={editingDraft.crewMemberId}
                onValueChange={(value) =>
                  setEditingDraft((previous) => (previous ? { ...previous, crewMemberId: value } : previous))
                }
              >
                <SelectTrigger className="h-8 sm:col-span-2">
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
              <Input
                className="h-8"
                type="date"
                min={projectStartDate}
                max={projectEndDate}
                value={editingDraft.date}
                onChange={(event) =>
                  setEditingDraft((previous) =>
                    previous
                      ? {
                          ...previous,
                          date: clampDateToProjectRange(event.target.value, projectStartDate, projectEndDate),
                        }
                      : previous
                  )
                }
              />
              <Input
                className="h-8"
                placeholder="Role override"
                value={editingDraft.role}
                onChange={(event) =>
                  setEditingDraft((previous) => (previous ? { ...previous, role: event.target.value } : previous))
                }
              />
              <TimeInput
                className="h-8"
                value={editingDraft.startTime}
                onChange={(event) =>
                  setEditingDraft((previous) => (previous ? { ...previous, startTime: event.target.value } : previous))
                }
                onBlurCommit={(value) =>
                  setEditingDraft((previous) =>
                    previous ? { ...previous, startTime: value ?? '' } : previous
                  )
                }
              />
              <TimeInput
                className="h-8"
                value={editingDraft.endTime}
                onChange={(event) =>
                  setEditingDraft((previous) => (previous ? { ...previous, endTime: event.target.value } : previous))
                }
                onBlurCommit={(value) =>
                  setEditingDraft((previous) =>
                    previous ? { ...previous, endTime: value ?? '' } : previous
                  )
                }
              />
              <Input
                className="h-8 sm:col-span-2"
                placeholder="Location"
                value={editingDraft.location}
                onChange={(event) =>
                  setEditingDraft((previous) => (previous ? { ...previous, location: event.target.value } : previous))
                }
              />
              <Input
                className="h-8 sm:col-span-2"
                placeholder="Notes"
                value={editingDraft.notes}
                onChange={(event) =>
                  setEditingDraft((previous) => (previous ? { ...previous, notes: event.target.value } : previous))
                }
              />
            </div>
          ) : null}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setEditingEntryId(null);
                setEditingDraft(null);
              }}
            >
              Cancel
            </Button>
            <Button onClick={saveEditedEntry} disabled={!editingDraft?.crewMemberId || !editingDraft?.date}>
              Save Block
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog open={Boolean(pendingDeleteEntryId)} onOpenChange={(open) => !open && setPendingDeleteEntryId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete schedule block?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the selected crew schedule block.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel type="button">Cancel</AlertDialogCancel>
            <AlertDialogAction
              type="button"
              onClick={() => {
                if (!pendingDeleteEntryId) return;
                removeEntry(pendingDeleteEntryId);
                setPendingDeleteEntryId(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
