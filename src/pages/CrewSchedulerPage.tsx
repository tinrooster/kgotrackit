import { useEffect, useMemo, useState } from 'react';
import {
  addDays, addWeeks, format, getISOWeek, startOfWeek, subWeeks,
} from 'date-fns';
import {
  CalendarClock, ChevronLeft, ChevronRight, Copy, Settings2, Send, AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { WeekScheduleGrid } from '@/components/crew-scheduler/WeekScheduleGrid';
import { AssignmentDialog } from '@/components/crew-scheduler/AssignmentDialog';
import { DepartmentManageDialog } from '@/components/crew-scheduler/DepartmentManageDialog';
import {
  getCrewSchedulerState,
  CREW_SCHEDULER_UPDATED_EVENT,
  copyWeekAssignments,
} from '@/lib/crewSchedulerService';
import { getCrewContacts, CREW_CONTACTS_UPDATED_EVENT } from '@/lib/crewContactsService';
import { publishWeekToTeamsShifts } from '@/lib/teamsShiftsService';
import type { CrewSchedulerState, ShiftDefinition } from '@/types/crewScheduler';
import type { CrewContact } from '@/types/crewContacts';

export default function CrewSchedulerPage() {
  const [schedulerState, setSchedulerState] = useState<CrewSchedulerState>(() => getCrewSchedulerState());
  const [contacts, setContacts] = useState<CrewContact[]>(() => getCrewContacts());
  const [activeDeptId, setActiveDeptId] = useState<string>('');
  const [currentWeekStart, setCurrentWeekStart] = useState<Date>(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 }),
  );
  const [selectedCell, setSelectedCell] = useState<{ shiftDefId: string; date: string } | null>(null);
  const [showManage, setShowManage] = useState(false);
  const [publishing, setPublishing] = useState(false);

  // Sync state when scheduler or contacts update
  useEffect(() => {
    const syncScheduler = () => setSchedulerState(getCrewSchedulerState());
    const syncContacts = () => setContacts(getCrewContacts());
    window.addEventListener(CREW_SCHEDULER_UPDATED_EVENT, syncScheduler);
    window.addEventListener(CREW_CONTACTS_UPDATED_EVENT, syncContacts);
    return () => {
      window.removeEventListener(CREW_SCHEDULER_UPDATED_EVENT, syncScheduler);
      window.removeEventListener(CREW_CONTACTS_UPDATED_EVENT, syncContacts);
    };
  }, []);

  // Set default active department
  useEffect(() => {
    if (!activeDeptId && schedulerState.departments.length > 0) {
      setActiveDeptId(schedulerState.departments[0].id);
    }
  }, [schedulerState.departments, activeDeptId]);

  const weekEnd = addDays(currentWeekStart, 6);
  const weekStartStr = format(currentWeekStart, 'yyyy-MM-dd');
  const weekEndStr = format(weekEnd, 'yyyy-MM-dd');
  const isoWeek = getISOWeek(currentWeekStart);
  const rotationLabel = isoWeek % 2 === 0 ? 'Week B' : 'Week A';

  const activeDept = schedulerState.departments.find((d) => d.id === activeDeptId);
  const deptShifts = useMemo(
    () => schedulerState.shiftDefinitions.filter((s) => s.departmentId === activeDeptId),
    [schedulerState.shiftDefinitions, activeDeptId],
  );

  const weekAssignments = useMemo(() => {
    const deptShiftIds = new Set(deptShifts.map((s) => s.id));
    return schedulerState.assignments.filter(
      (a) => a.date >= weekStartStr && a.date <= weekEndStr && deptShiftIds.has(a.shiftDefinitionId),
    );
  }, [schedulerState.assignments, deptShifts, weekStartStr, weekEndStr]);

  const selectedShiftDef: ShiftDefinition | null = selectedCell
    ? deptShifts.find((s) => s.id === selectedCell.shiftDefId) ?? null
    : null;
  const selectedCellAssignments = selectedCell
    ? weekAssignments.filter(
        (a) => a.shiftDefinitionId === selectedCell.shiftDefId && a.date === selectedCell.date,
      )
    : [];

  const hasTeamsConfig = Boolean(activeDeptId && schedulerState.teamsConfig?.[activeDeptId]);

  const handleCopyToPrevWeek = () => {
    const prevWeekStart = format(subWeeks(currentWeekStart, 1), 'yyyy-MM-dd');
    const n = copyWeekAssignments(weekStartStr, prevWeekStart, activeDeptId);
    toast.success(`Copied ${n} assignment${n !== 1 ? 's' : ''} to previous week`);
  };

  const handleCopyToNextWeek = () => {
    const nextWeekStart = format(addWeeks(currentWeekStart, 1), 'yyyy-MM-dd');
    const n = copyWeekAssignments(weekStartStr, nextWeekStart, activeDeptId);
    toast.success(`Copied ${n} assignment${n !== 1 ? 's' : ''} to next week`);
  };

  const handlePublishToTeams = async () => {
    if (!activeDeptId) return;
    const config = schedulerState.teamsConfig?.[activeDeptId];
    if (!config) return;
    setPublishing(true);
    try {
      const result = await publishWeekToTeamsShifts(
        config,
        weekAssignments,
        deptShifts,
        contacts,
        weekStartStr,
        weekEndStr,
      );
      if (result.success) {
        toast.success(`Published ${result.created} shift${result.created !== 1 ? 's' : ''} to Teams Shifts`);
      } else {
        toast.error(
          <div>
            <div className="font-semibold">Published with errors</div>
            <div className="mt-1 space-y-0.5 text-xs">
              {result.errors.slice(0, 3).map((e, i) => <div key={i}>{e}</div>)}
              {result.errors.length > 3 && <div>+{result.errors.length - 3} more</div>}
            </div>
          </div>,
        );
      }
    } catch (err) {
      toast.error(`Teams publish failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <CalendarClock className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-bold tracking-tight">Crew Scheduler</h1>
        </div>
        <div className="flex items-center gap-2">
          {hasTeamsConfig && (
            <Button
              variant="outline"
              size="sm"
              onClick={handlePublishToTeams}
              disabled={publishing || weekAssignments.length === 0}
              className="gap-1.5"
            >
              <Send className="h-3.5 w-3.5" />
              {publishing ? 'Publishing…' : 'Publish to Teams'}
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => setShowManage(true)} className="gap-1.5">
            <Settings2 className="h-3.5 w-3.5" /> Manage
          </Button>
        </div>
      </div>

      {/* Department tabs */}
      {schedulerState.departments.length > 0 && (
        <Tabs value={activeDeptId} onValueChange={setActiveDeptId}>
          <TabsList>
            {schedulerState.departments
              .sort((a, b) => a.sortOrder - b.sortOrder)
              .map((dept) => (
                <TabsTrigger key={dept.id} value={dept.id} className="gap-1.5">
                  {dept.color && (
                    <span
                      className="inline-block h-2 w-2 rounded-full"
                      style={{ backgroundColor: dept.color }}
                    />
                  )}
                  {dept.name}
                </TabsTrigger>
              ))}
          </TabsList>
        </Tabs>
      )}

      {schedulerState.departments.length === 0 && (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <CalendarClock className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            No departments yet. Open <strong>Manage</strong> to set up departments and shifts.
          </p>
        </div>
      )}

      {activeDept && (
        <>
          {/* Week navigation */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => setCurrentWeekStart((d) => subWeeks(d, 1))}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="min-w-[200px] text-center">
                <span className="text-sm font-semibold">
                  {format(currentWeekStart, 'MMM d')} – {format(weekEnd, 'MMM d, yyyy')}
                </span>
                <Badge
                  variant="outline"
                  className={cn(
                    'ml-2 text-[10px]',
                    isoWeek % 2 !== 0
                      ? 'border-blue-300 text-blue-600 dark:border-blue-700 dark:text-blue-400'
                      : 'border-purple-300 text-purple-600 dark:border-purple-700 dark:text-purple-400',
                  )}
                >
                  {rotationLabel}
                </Badge>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => setCurrentWeekStart((d) => addWeeks(d, 1))}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setCurrentWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}
                className="text-xs text-muted-foreground"
              >
                Today
              </Button>
            </div>

            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCopyToPrevWeek}
                disabled={weekAssignments.length === 0}
                className="gap-1.5 text-xs text-muted-foreground"
                title="Copy this week's assignments to the previous week"
              >
                <Copy className="h-3.5 w-3.5" /> Copy ← Prev
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCopyToNextWeek}
                disabled={weekAssignments.length === 0}
                className="gap-1.5 text-xs text-muted-foreground"
                title="Copy this week's assignments to the next week"
              >
                <Copy className="h-3.5 w-3.5" /> Copy → Next
              </Button>
            </div>
          </div>

          {/* No Teams config notice */}
          {!hasTeamsConfig && activeDept && (
            <div className="flex items-center gap-2 rounded-md border border-ti-divider bg-card px-3 py-2 text-xs text-muted-foreground">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              Teams Shifts integration not configured for <strong>{activeDept.name}</strong>.
              Open <strong>Manage → Teams</strong> to connect this department to Microsoft Teams.
            </div>
          )}

          {/* Schedule grid */}
          <WeekScheduleGrid
            weekStart={currentWeekStart}
            department={activeDept}
            shiftDefs={deptShifts}
            assignments={weekAssignments}
            contacts={contacts}
            onCellClick={(shiftDefId, date) => setSelectedCell({ shiftDefId, date })}
          />
        </>
      )}

      {/* Assignment dialog */}
      <AssignmentDialog
        open={Boolean(selectedCell)}
        onClose={() => setSelectedCell(null)}
        shiftDef={selectedShiftDef}
        date={selectedCell?.date ?? ''}
        assignments={selectedCellAssignments}
        departmentMembers={schedulerState.departmentMembers}
        allContacts={contacts}
      />

      {/* Manage dialog */}
      <DepartmentManageDialog
        open={showManage}
        onClose={() => setShowManage(false)}
        allContacts={contacts}
      />
    </div>
  );
}
