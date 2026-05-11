import { addDays, format, isSameDay } from 'date-fns';
import { UserCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SchedulerDepartment, ShiftAssignment, ShiftDefinition } from '@/types/crewScheduler';
import type { CrewContact } from '@/types/crewContacts';

interface Props {
  weekStart: Date;
  department: SchedulerDepartment;
  shiftDefs: ShiftDefinition[];
  assignments: ShiftAssignment[];
  contacts: CrewContact[];
  onCellClick: (shiftDefId: string, date: string) => void;
}

export function WeekScheduleGrid({ weekStart, department, shiftDefs, assignments, contacts, onCellClick }: Props) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const deptShifts = shiftDefs
    .filter((s) => s.departmentId === department.id)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const today = new Date();

  return (
    <div className="overflow-x-auto rounded-lg border border-ti-divider">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-ti-divider bg-ti-sunken">
            <th className="w-32 p-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Shift
            </th>
            {days.map((day) => (
              <th
                key={day.toISOString()}
                className={cn(
                  'border-l border-ti-divider p-2 text-center text-xs font-medium',
                  isSameDay(day, today) ? 'text-primary' : 'text-muted-foreground',
                )}
              >
                <div className="font-semibold uppercase tracking-wide">{format(day, 'EEE')}</div>
                <div
                  className={cn(
                    'mx-auto mt-0.5 flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold',
                    isSameDay(day, today) ? 'bg-primary text-primary-foreground' : '',
                  )}
                >
                  {format(day, 'd')}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {deptShifts.length === 0 && (
            <tr>
              <td colSpan={8} className="p-8 text-center text-sm text-muted-foreground">
                No shifts defined. Open <strong>Manage</strong> to add shifts for this department.
              </td>
            </tr>
          )}
          {deptShifts.map((shift, rowIdx) => (
            <tr
              key={shift.id}
              className={cn('border-b border-ti-divider last:border-b-0', rowIdx % 2 === 1 ? 'bg-ti-sunken/40' : '')}
            >
              {/* Shift label */}
              <td className="p-2 align-top">
                <div className="flex items-center gap-1.5">
                  {shift.color && (
                    <span
                      className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: shift.color }}
                    />
                  )}
                  <span className="font-semibold">{shift.name}</span>
                </div>
                <div className="mt-0.5 pl-4 text-[10px] text-muted-foreground">
                  {shift.startTime}–{shift.endTime}
                </div>
              </td>

              {/* Day cells */}
              {days.map((day) => {
                const dateStr = format(day, 'yyyy-MM-dd');
                const cellAssignments = assignments.filter(
                  (a) => a.shiftDefinitionId === shift.id && a.date === dateStr,
                );
                const filled = cellAssignments.length;
                const required = shift.requiredStaff;

                const coverageCls =
                  filled === 0 && required > 0
                    ? 'text-destructive'
                    : filled < required
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-emerald-600 dark:text-emerald-400';

                return (
                  <td
                    key={dateStr}
                    className={cn(
                      'cursor-pointer border-l border-ti-divider p-1.5 align-top transition-colors hover:bg-card/70',
                      isSameDay(day, today) ? 'bg-primary/5' : '',
                    )}
                    onClick={() => onCellClick(shift.id, dateStr)}
                  >
                    <div className="min-h-[60px]">
                      {cellAssignments.map((a) => {
                        const contact = contacts.find((c) => c.id === a.crewContactId);
                        return (
                          <div
                            key={a.id}
                            className="mb-0.5 flex items-center gap-1 truncate rounded px-1 py-0.5 text-[11px] font-medium"
                            style={{ backgroundColor: `${shift.color ?? '#6366f1'}22` }}
                          >
                            <UserCircle2 className="h-3 w-3 shrink-0 text-muted-foreground" />
                            <span className="truncate">
                              {contact ? contact.fullName.split(/[\s,]+/)[0] : 'Unknown'}
                            </span>
                          </div>
                        );
                      })}
                      <div className={cn('mt-0.5 text-[10px] font-semibold tabular-nums', coverageCls)}>
                        {filled}/{required}
                      </div>
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
