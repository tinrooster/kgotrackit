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
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { minutesToTime, normalizeQuarterHourTime, parseTimeToMinutes } from '@/lib/dateTimeInputs';
import { loadAppBranding, resolveBrandLogoForTheme } from '@/lib/appBranding';
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

interface ShiftTemplate {
  id: string;
  name: string;
  startTime?: string;
  endTime?: string;
  role?: string;
  location?: string;
  notes?: string;
}

interface RoleCoverageTarget {
  id: string;
  role: string;
  requiredCount: number;
}

interface ScheduleConflict {
  entryId: string;
  level: 'warning' | 'error';
  message: string;
}

const SHIFT_TEMPLATE_STORAGE_KEY = 'trackit:schedule-shift-templates:v1';
const ROLE_COVERAGE_TARGETS_STORAGE_KEY = 'trackit:schedule-role-coverage-targets:v1';
const DAY_LOCKS_STORAGE_KEY_PREFIX = 'trackit:schedule-day-locks:v1';
const CRITICAL_ROLES_STORAGE_KEY_PREFIX = 'trackit:schedule-critical-roles:v1';
const CRITICAL_FOCUS_MODE_STORAGE_KEY_PREFIX = 'trackit:schedule-critical-focus-mode:v1';
const SCHEDULE_VIEW_MODE_STORAGE_KEY_PREFIX = 'trackit:schedule-view-mode:v1';
/**
 * Temporarily hidden for current production workflow.
 * Keep implementation in place for future projects that need staffing targets.
 */
const SHOW_ROLE_COVERAGE_TARGETS = false;

interface CrewScheduleCalendarProps {
  productionName?: string;
  productionClient?: string;
  productionLocation?: string;
  crewMembers: ProductionCrewMember[];
  schedule: CrewScheduleEntry[];
  projectStartDate?: string;
  projectEndDate?: string;
  projectedWindowStartTime?: string;
  projectedWindowEndTime?: string;
  onProjectedWindowChange?: (window: { startTime?: string; endTime?: string }) => void;
  dayBoardDate?: string;
  onDayBoardDateChange?: (dayValue: string) => void;
  scheduleScopeKey?: string;
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

function toTemplateSlug(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 64);
}

function buildScheduleConflicts(
  schedule: CrewScheduleEntry[],
  crewMembers: ProductionCrewMember[],
  projectStartDate?: string,
  projectEndDate?: string
): ScheduleConflict[] {
  const conflicts: ScheduleConflict[] = [];
  const entriesByCrewAndDate = new Map<string, CrewScheduleEntry[]>();
  const crewById = new Map(crewMembers.map((member) => [member.id, member]));
  for (const entry of schedule) {
    if (!entry.date) continue;
    if ((projectStartDate && entry.date < projectStartDate) || (projectEndDate && entry.date > projectEndDate)) {
      conflicts.push({
        entryId: entry.id,
        level: 'warning',
        message: 'Shift is outside project date range.',
      });
    }
    if (!entry.startTime || !entry.endTime) {
      conflicts.push({
        entryId: entry.id,
        level: 'warning',
        message: 'Shift is missing start or end time.',
      });
    }
    if (!entry.location?.trim()) {
      conflicts.push({
        entryId: entry.id,
        level: 'warning',
        message: 'Missing callout: location is not set.',
      });
    }
    if (!entry.startTime || !entry.endTime) {
      continue;
    }
    const crewMember = crewById.get(entry.crewMemberId);
    const availabilityWindows = (crewMember?.shifts ?? [])
      .filter((shift) => shift.date === entry.date)
      .map((shift) => ({
        start: parseTimeToMinutes(shift.startTime || shift.callTime, 0),
        end: parseTimeToMinutes(shift.endTime, 24 * 60 + 1),
      }))
      .filter((window) => Number.isFinite(window.start) && Number.isFinite(window.end) && window.end > window.start);
    if (availabilityWindows.length > 0) {
      const entryStart = parseTimeToMinutes(entry.startTime, 0);
      const entryEnd = parseTimeToMinutes(entry.endTime, 24 * 60 + 1);
      const hasAvailabilityOverlap = availabilityWindows.some(
        (window) => Math.max(window.start, entryStart) < Math.min(window.end, entryEnd)
      );
      if (!hasAvailabilityOverlap) {
        conflicts.push({
          entryId: entry.id,
          level: 'warning',
          message: 'Shift conflicts with crew availability window.',
        });
      }
    }
    const key = `${entry.crewMemberId}::${entry.date}`;
    const bucket = entriesByCrewAndDate.get(key) ?? [];
    bucket.push(entry);
    entriesByCrewAndDate.set(key, bucket);
  }
  for (const bucket of entriesByCrewAndDate.values()) {
    const sorted = [...bucket].sort(
      (left, right) => parseTimeToMinutes(left.startTime, 0) - parseTimeToMinutes(right.startTime, 0)
    );
    for (let index = 1; index < sorted.length; index += 1) {
      const previous = sorted[index - 1];
      const current = sorted[index];
      const previousEnd = parseTimeToMinutes(previous.endTime, 0);
      const currentStart = parseTimeToMinutes(current.startTime, 0);
      if (currentStart < previousEnd) {
        conflicts.push({
          entryId: current.id,
          level: 'error',
          message: 'Shift overlaps another shift for this crew member.',
        });
      }
    }
  }
  return conflicts;
}

function resolveEffectiveEntryRole(
  entry: CrewScheduleEntry,
  crewMembers: ProductionCrewMember[]
): string {
  return (entry.role || crewMembers.find((member) => member.id === entry.crewMemberId)?.role || '').trim();
}

function shouldIncludeEntryInCriticalFocus(
  entry: CrewScheduleEntry,
  crewMembers: ProductionCrewMember[],
  criticalFocusModeEnabled: boolean,
  criticalRoleNames: string[]
): boolean {
  if (!criticalFocusModeEnabled) return true;
  if (criticalRoleNames.length === 0) return false;
  const effectiveRole = resolveEffectiveEntryRole(entry, crewMembers);
  return criticalRoleNames.includes(effectiveRole);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function loadCriticalRoles(scopeKey: string): string[] {
  try {
    const raw = window.localStorage.getItem(`${CRITICAL_ROLES_STORAGE_KEY_PREFIX}:${scopeKey}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as string[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((value) => typeof value === 'string' && value.trim().length > 0);
  } catch {
    return [];
  }
}

function loadCriticalFocusMode(scopeKey: string): boolean {
  try {
    return window.localStorage.getItem(`${CRITICAL_FOCUS_MODE_STORAGE_KEY_PREFIX}:${scopeKey}`) === '1';
  } catch {
    return false;
  }
}

export function CrewScheduleCalendar({
  productionName,
  productionClient,
  productionLocation,
  crewMembers,
  schedule,
  projectStartDate,
  projectEndDate,
  projectedWindowStartTime,
  projectedWindowEndTime,
  onProjectedWindowChange,
  dayBoardDate,
  onDayBoardDateChange,
  scheduleScopeKey = 'global',
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
  const [templateNameDraft, setTemplateNameDraft] = useState('');
  const [savedTemplates, setSavedTemplates] = useState<ShiftTemplate[]>([]);
  const [quickApplyTemplateId, setQuickApplyTemplateId] = useState('');
  const [quickApplyRole, setQuickApplyRole] = useState('');
  const [quickApplySummary, setQuickApplySummary] = useState('');
  const [availabilityFilter, setAvailabilityFilter] = useState<'all' | 'availability-conflicts'>('all');
  const [callSheetIncludeNotes, setCallSheetIncludeNotes] = useState(true);
  const [callSheetIncludeResources, setCallSheetIncludeResources] = useState(true);
  const [callSheetIncludeWarnings, setCallSheetIncludeWarnings] = useState(true);
  const [callSheetTemplateMode, setCallSheetTemplateMode] = useState<'simple' | 'detailed' | 'branded'>('detailed');
  const [callSheetFilteredOnly, setCallSheetFilteredOnly] = useState(false);
  const [callSheetTitle, setCallSheetTitle] = useState('Call Sheet');
  const [callSheetShowName, setCallSheetShowName] = useState(productionName ?? '');
  const [callSheetVenue, setCallSheetVenue] = useState(productionLocation ?? '');
  const [callSheetProducer, setCallSheetProducer] = useState('');
  const [callSheetLogoDataUrl, setCallSheetLogoDataUrl] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [locationFilter, setLocationFilter] = useState('all');
  const [copyToDate, setCopyToDate] = useState('');
  const [roleCoverageTargets, setRoleCoverageTargets] = useState<RoleCoverageTarget[]>([]);
  const [coverageRoleDraft, setCoverageRoleDraft] = useState('');
  const [coverageRequiredDraft, setCoverageRequiredDraft] = useState('1');
  const [dayLocksByDate, setDayLocksByDate] = useState<Record<string, boolean>>({});
  const [criticalRoleNames, setCriticalRoleNames] = useState<string[]>(() => loadCriticalRoles(scheduleScopeKey));
  const [criticalRoleDraft, setCriticalRoleDraft] = useState('');
  const [criticalFocusModeEnabled, setCriticalFocusModeEnabled] = useState<boolean>(() =>
    loadCriticalFocusMode(scheduleScopeKey)
  );
  const [lockOverridesByDate, setLockOverridesByDate] = useState<Record<string, boolean>>({});
  const [lockOverrideDialogOpen, setLockOverrideDialogOpen] = useState(false);
  const [lockOverrideDate, setLockOverrideDate] = useState('');
  const [lockOverrideActionLabel, setLockOverrideActionLabel] = useState('');
  const [pendingLockOverrideAction, setPendingLockOverrideAction] = useState<(() => void) | null>(null);
  const [scheduleViewMode, setScheduleViewMode] = useState<'simple' | 'detailed'>(() => {
    try {
      return window.localStorage.getItem(`${SCHEDULE_VIEW_MODE_STORAGE_KEY_PREFIX}:${scheduleScopeKey}`) === 'simple'
        ? 'simple'
        : 'detailed';
    } catch {
      return 'detailed';
    }
  });
  const [localDayBoardDate, setLocalDayBoardDate] = useState('');
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

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(SHIFT_TEMPLATE_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as ShiftTemplate[];
      if (Array.isArray(parsed)) setSavedTemplates(parsed);
    } catch {
      setSavedTemplates([]);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(SHIFT_TEMPLATE_STORAGE_KEY, JSON.stringify(savedTemplates));
  }, [savedTemplates]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(ROLE_COVERAGE_TARGETS_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as RoleCoverageTarget[];
      if (Array.isArray(parsed)) setRoleCoverageTargets(parsed);
    } catch {
      setRoleCoverageTargets([]);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(ROLE_COVERAGE_TARGETS_STORAGE_KEY, JSON.stringify(roleCoverageTargets));
  }, [roleCoverageTargets]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(`${DAY_LOCKS_STORAGE_KEY_PREFIX}:${scheduleScopeKey}`);
      if (!raw) {
        setDayLocksByDate({});
        setLockOverridesByDate({});
        return;
      }
      const parsed = JSON.parse(raw) as Record<string, boolean>;
      setDayLocksByDate(parsed && typeof parsed === 'object' ? parsed : {});
      setLockOverridesByDate({});
    } catch {
      setDayLocksByDate({});
      setLockOverridesByDate({});
    }
  }, [scheduleScopeKey]);

  useEffect(() => {
    window.localStorage.setItem(
      `${DAY_LOCKS_STORAGE_KEY_PREFIX}:${scheduleScopeKey}`,
      JSON.stringify(dayLocksByDate)
    );
  }, [dayLocksByDate, scheduleScopeKey]);

  useEffect(() => {
    setCriticalRoleNames(loadCriticalRoles(scheduleScopeKey));
    setCriticalFocusModeEnabled(loadCriticalFocusMode(scheduleScopeKey));
  }, [scheduleScopeKey]);

  useEffect(() => {
    window.localStorage.setItem(
      `${CRITICAL_ROLES_STORAGE_KEY_PREFIX}:${scheduleScopeKey}`,
      JSON.stringify(criticalRoleNames)
    );
  }, [criticalRoleNames, scheduleScopeKey]);

  useEffect(() => {
    window.localStorage.setItem(
      `${CRITICAL_FOCUS_MODE_STORAGE_KEY_PREFIX}:${scheduleScopeKey}`,
      criticalFocusModeEnabled ? '1' : '0'
    );
  }, [criticalFocusModeEnabled, scheduleScopeKey]);

  useEffect(() => {
    try {
      const persistedMode =
        window.localStorage.getItem(`${SCHEDULE_VIEW_MODE_STORAGE_KEY_PREFIX}:${scheduleScopeKey}`) === 'simple'
          ? 'simple'
          : 'detailed';
      setScheduleViewMode(persistedMode);
    } catch {
      setScheduleViewMode('detailed');
    }
  }, [scheduleScopeKey]);

  useEffect(() => {
    window.localStorage.setItem(`${SCHEDULE_VIEW_MODE_STORAGE_KEY_PREFIX}:${scheduleScopeKey}`, scheduleViewMode);
  }, [scheduleViewMode, scheduleScopeKey]);

  useEffect(() => {
    if (!callSheetShowName && productionName) {
      setCallSheetShowName(productionName);
    }
  }, [productionName, callSheetShowName]);

  useEffect(() => {
    if (!callSheetVenue && productionLocation) {
      setCallSheetVenue(productionLocation);
    }
  }, [productionLocation, callSheetVenue]);

  const weekStart = useMemo(() => {
    const baseDate = schedule[0]?.date ? parseISO(schedule[0].date) : new Date();
    return startOfWeek(baseDate, { weekStartsOn: 1 });
  }, [schedule]);
  const visibleDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  const addEntry = (skipLockCheck = false) => {
    if (!skipLockCheck && !requestLockOverride(dayFilter, 'adding a schedule entry', () => addEntry(true))) return;
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
        resourceIds: [],
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

  const removeEntry = (id: string, skipLockCheck = false) => {
    const entry = schedule.find((item) => item.id === id);
    if (!entry) return;
    if (!skipLockCheck && !requestLockOverride(entry.date, 'deleting a schedule entry', () => removeEntry(id, true))) return;
    onChange(schedule.filter((entry) => entry.id !== id));
  };

  const runDeleteAction = (entryId: string) => {
    if (!requireDeleteConfirm) {
      removeEntry(entryId);
      return;
    }
    setPendingDeleteEntryId(entryId);
  };

  const saveDraftAsTemplate = () => {
    const templateName = templateNameDraft.trim();
    if (!templateName) return;
    const slug = toTemplateSlug(templateName);
    const nextTemplate: ShiftTemplate = {
      id: crypto.randomUUID(),
      name: templateName,
      startTime: draft.startTime ? normalizeQuarterHourTime(draft.startTime) : undefined,
      endTime: draft.endTime ? normalizeQuarterHourTime(draft.endTime) : undefined,
      role: draft.role || undefined,
      location: draft.location || undefined,
      notes: draft.notes || undefined,
    };
    setSavedTemplates((previous) => {
      const withoutSameName = previous.filter((template) => toTemplateSlug(template.name) !== slug);
      return [...withoutSameName, nextTemplate].sort((a, b) => a.name.localeCompare(b.name));
    });
    setTemplateNameDraft('');
  };

  const applyTemplateToDraft = (templateId: string) => {
    const selectedTemplate = savedTemplates.find((template) => template.id === templateId);
    if (!selectedTemplate) return;
    setDraft((previous) => ({
      ...previous,
      startTime: selectedTemplate.startTime ?? '',
      endTime: selectedTemplate.endTime ?? '',
      role: selectedTemplate.role ?? '',
      location: selectedTemplate.location ?? '',
      notes: selectedTemplate.notes ?? '',
    }));
  };

  const quickApplyTemplateToRoleForDay = (skipLockCheck = false) => {
    if (!quickApplyTemplateId || !quickApplyRole) return;
    if (
      !skipLockCheck &&
      !requestLockOverride(dayFilter, 'quick-applying a role template on this day', () => quickApplyTemplateToRoleForDay(true))
    ) {
      return;
    }
    const selectedTemplate = savedTemplates.find((template) => template.id === quickApplyTemplateId);
    if (!selectedTemplate) return;
    const normalizedRole = quickApplyRole.trim().toLowerCase();
    if (!normalizedRole) return;
    const crewForRole = crewMembers.filter((member) => (member.role || '').trim().toLowerCase() === normalizedRole);
    if (crewForRole.length === 0) {
      setQuickApplySummary(`No crew members found for role "${quickApplyRole}".`);
      return;
    }
    const existingCrewIdsForDay = new Set(schedule.filter((entry) => entry.date === dayFilter).map((entry) => entry.crewMemberId));
    const newEntries: CrewScheduleEntry[] = crewForRole
      .filter((member) => !existingCrewIdsForDay.has(member.id))
      .map((member) => ({
        id: crypto.randomUUID(),
        crewMemberId: member.id,
        date: dayFilter,
        startTime: selectedTemplate.startTime ? normalizeQuarterHourTime(selectedTemplate.startTime) : undefined,
        endTime: selectedTemplate.endTime ? normalizeQuarterHourTime(selectedTemplate.endTime) : undefined,
        role: selectedTemplate.role || quickApplyRole || undefined,
        location: selectedTemplate.location || undefined,
        notes: selectedTemplate.notes || undefined,
        resourceIds: [],
      }));
    const skippedCount = crewForRole.length - newEntries.length;
    if (newEntries.length === 0) {
      setQuickApplySummary(`Applied to 0 crew, skipped ${skippedCount} already scheduled.`);
      return;
    }
    onChange([...schedule, ...newEntries]);
    setQuickApplySummary(`Applied to ${newEntries.length} crew, skipped ${skippedCount} already scheduled.`);
  };

  const deleteTemplate = (templateId: string) => {
    setSavedTemplates((previous) => previous.filter((template) => template.id !== templateId));
  };

  const copyDaySchedule = (skipLockCheck = false) => {
    if (!copyToDate || copyToDate === dayFilter) return;
    if (!isDateWithinProjectRange(copyToDate, projectStartDate, projectEndDate)) return;
    if (!skipLockCheck && !requestLockOverride(copyToDate, 'copying shifts to this day', () => copyDaySchedule(true))) return;
    const sourceEntries = schedule.filter((entry) => entry.date === dayFilter);
    if (sourceEntries.length === 0) return;
    const copiedEntries = sourceEntries.map((entry) => ({ ...entry, id: crypto.randomUUID(), date: copyToDate }));
    onChange([...schedule, ...copiedEntries]);
  };

  const getDayBoardCsvContent = () => {
    const rows = [
      ['date', 'crew_member', 'role', 'start_time', 'end_time', 'location', 'notes', 'resources'].join(','),
      ...dayEntries.map((entry) => {
        const crewLabel = resolveCrewLabel(crewMembers, entry.crewMemberId);
        const assignedResources = (entry.resourceIds ?? [])
          .map((resourceId) => resources.find((resource) => resource.id === resourceId)?.label)
          .filter(Boolean)
          .join(' | ');
        return [
          entry.date,
          `"${crewLabel.replaceAll('"', '""')}"`,
          `"${(entry.role || '').replaceAll('"', '""')}"`,
          entry.startTime || '',
          entry.endTime || '',
          `"${(entry.location || '').replaceAll('"', '""')}"`,
          `"${(entry.notes || '').replaceAll('"', '""')}"`,
          `"${assignedResources.replaceAll('"', '""')}"`,
        ].join(',');
      }),
    ];
    return rows.join('\n');
  };

  const exportDayBoardCsv = () => {
    const blob = new Blob([getDayBoardCsvContent()], { type: 'text/csv;charset=utf-8;' });
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = `schedule-${dayFilter}.csv`;
    link.click();
    URL.revokeObjectURL(objectUrl);
  };

  const getDayCallSheetContent = () => {
    const selectedDayEntries = (callSheetFilteredOnly ? dayEntries : dayEntriesAllRoles).sort(
      (left, right) =>
        parseTimeToMinutes(left.startTime, 24 * 60 + 1) - parseTimeToMinutes(right.startTime, 24 * 60 + 1)
    );
    const lines: string[] = [];
    lines.push(`${callSheetTitle || 'Call Sheet'} - ${dayFilter}`);
    if (productionName?.trim()) lines.push(`Production: ${productionName.trim()}`);
    if (productionClient?.trim()) lines.push(`Client: ${productionClient.trim()}`);
    if (callSheetShowName.trim()) lines.push(`Show: ${callSheetShowName.trim()}`);
    if (callSheetVenue.trim()) lines.push(`Venue: ${callSheetVenue.trim()}`);
    if (callSheetProducer.trim()) lines.push(`Producer: ${callSheetProducer.trim()}`);
    if (callSheetFilteredOnly) lines.push('Scope: Filtered entries only');
    lines.push('');
    if (callSheetTemplateMode !== 'simple') {
      lines.push(`First call: ${dayHandoffSummary.firstCall?.startTime ?? '--:--'} (${dayHandoffSummary.firstCall ? resolveCrewLabel(crewMembers, dayHandoffSummary.firstCall.crewMemberId) : 'n/a'})`);
      lines.push(`Last out: ${dayHandoffSummary.lastOut?.endTime ?? '--:--'} (${dayHandoffSummary.lastOut ? resolveCrewLabel(crewMembers, dayHandoffSummary.lastOut.crewMemberId) : 'n/a'})`);
      lines.push(`Shifts: ${selectedDayEntries.length}`);
      lines.push(
        `Day lock: ${
          isDayActuallyLocked ? (isDayOverrideEnabled ? 'LOCKED (OVERRIDE ENABLED)' : 'LOCKED') : 'UNLOCKED'
        }`
      );
      lines.push(`Missing callout fields: ${dayHandoffSummary.missingCalloutCount}`);
      lines.push(`Conflicts: ${dayHandoffSummary.conflictCount}`);
      lines.push(`Resource assignments: ${dayHandoffSummary.assignedResourceCount}`);
      lines.push('');
    }
    lines.push('CREW CALLS');
    lines.push('----------');
    if (selectedDayEntries.length === 0) {
      lines.push('No shifts scheduled.');
    } else {
      for (const entry of selectedDayEntries) {
        const assignedResources = (entry.resourceIds ?? [])
          .map((resourceId) => resources.find((resource) => resource.id === resourceId)?.label)
          .filter(Boolean)
          .join(', ');
        const conflictMessages = (conflictsByEntryId.get(entry.id) ?? []).map((conflict) => conflict.message).join(' | ');
        lines.push(
          [
            `${entry.startTime ?? '--:--'}-${entry.endTime ?? '--:--'}`,
            resolveCrewLabel(crewMembers, entry.crewMemberId),
            `Role: ${entry.role || crewMembers.find((member) => member.id === entry.crewMemberId)?.role || 'n/a'}`,
            `Location: ${entry.location || 'MISSING'}`,
            ...(callSheetIncludeNotes ? [`Notes: ${entry.notes || '—'}`] : []),
            ...(callSheetIncludeResources ? [`Resources: ${assignedResources || '—'}`] : []),
            ...(callSheetIncludeWarnings ? [`Warnings: ${conflictMessages || '—'}`] : []),
          ].join(' | ')
        );
      }
    }
    if (callSheetTemplateMode === 'detailed' && callSheetIncludeResources) {
      lines.push('');
      lines.push('DAY RESOURCES');
      lines.push('-------------');
      if (resources.length === 0) {
        lines.push('No linked resources.');
      } else {
        for (const resource of resources) {
          const assignedCount = selectedDayEntries.filter((entry) => (entry.resourceIds ?? []).includes(resource.id)).length;
          lines.push(`${resource.label} | qty ${resource.quantity} | assigned ${assignedCount}`);
        }
      }
    }
    return lines.join('\n');
  };

  const exportDayCallSheet = () => {
    const blob = new Blob([getDayCallSheetContent()], { type: 'text/plain;charset=utf-8;' });
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = `call-sheet-${dayFilter}.txt`;
    link.click();
    URL.revokeObjectURL(objectUrl);
  };

  const handleCallSheetLogoUpload = (file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === 'string') {
        setCallSheetLogoDataUrl(result);
      }
    };
    reader.readAsDataURL(file);
  };

  const getPrintableCallSheetHtml = () => {
    const branding = loadAppBranding();
    const defaultBrandLogo = resolveBrandLogoForTheme(branding);
    const effectiveCallSheetLogo = callSheetLogoDataUrl || defaultBrandLogo;
    const selectedDayEntries = (callSheetFilteredOnly ? dayEntries : dayEntriesAllRoles).sort(
      (left, right) =>
        parseTimeToMinutes(left.startTime, 24 * 60 + 1) - parseTimeToMinutes(right.startTime, 24 * 60 + 1)
    );
    const columns = ['Time', 'Crew', 'Role', 'Location'];
    if (callSheetIncludeNotes) columns.push('Notes');
    if (callSheetIncludeResources) columns.push('Resources');
    if (callSheetIncludeWarnings) columns.push('Warnings');
    const rowHtml =
      selectedDayEntries.length === 0
        ? `<tr><td colspan="${columns.length}">No shifts scheduled.</td></tr>`
        : selectedDayEntries
            .map((entry) => {
              const assignedResources = (entry.resourceIds ?? [])
                .map((resourceId) => resources.find((resource) => resource.id === resourceId)?.label)
                .filter(Boolean)
                .join(', ');
              const warnings = (conflictsByEntryId.get(entry.id) ?? [])
                .map((conflict) => conflict.message)
                .join(' | ');
              const effectiveRole =
                entry.role || crewMembers.find((member) => member.id === entry.crewMemberId)?.role || 'n/a';
              return `<tr>
<td>${escapeHtml(`${entry.startTime ?? '--:--'} - ${entry.endTime ?? '--:--'}`)}</td>
<td>${escapeHtml(resolveCrewLabel(crewMembers, entry.crewMemberId))}</td>
<td>${escapeHtml(effectiveRole)}</td>
<td>${escapeHtml(entry.location || 'MISSING')}</td>${callSheetIncludeNotes ? `
<td>${escapeHtml(entry.notes || '—')}</td>` : ''}${callSheetIncludeResources ? `
<td>${escapeHtml(assignedResources || '—')}</td>` : ''}${callSheetIncludeWarnings ? `
<td>${escapeHtml(warnings || '—')}</td>` : ''}
</tr>`;
            })
            .join('');
    const lockStatusText = isDayActuallyLocked ? (isDayOverrideEnabled ? 'Locked (override enabled)' : 'Locked') : 'Unlocked';
    const isBrandedTemplate = callSheetTemplateMode === 'branded';
    const isDetailedTemplate = callSheetTemplateMode !== 'simple';
    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Call Sheet ${escapeHtml(dayFilter)}</title>
  <style>
    body { font-family: ${isBrandedTemplate ? "'Inter', 'Segoe UI', Arial, sans-serif" : 'Arial, sans-serif'}; margin: 24px; color: #111; line-height: 1.35; }
    h1 { margin: 0 0 8px; font-size: 22px; }
    h2 { margin: 0 0 8px; font-size: 15px; }
    .meta { margin: 0 0 14px; font-size: 13px; }
    .meta-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px 12px; margin-bottom: 14px; font-size: 12px; }
    .section { margin-top: 14px; page-break-inside: avoid; ${isBrandedTemplate ? 'border: 1px solid #e8e8ef; border-radius: 10px; padding: 10px;' : ''} }
    table { width: 100%; border-collapse: collapse; font-size: 12px; page-break-inside: auto; }
    th, td { border: 1px solid #ccc; padding: 6px; text-align: left; vertical-align: top; }
    th { background: ${isBrandedTemplate ? '#f2f0ff' : '#f4f4f4'}; ${isBrandedTemplate ? 'color: #352c87;' : ''} }
    .signoff-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px 24px; margin-top: 18px; }
    .signoff-line { margin-top: 18px; border-top: 1px solid #222; padding-top: 3px; font-size: 11px; }
    .hero { ${isBrandedTemplate ? 'background: linear-gradient(135deg, #312e81 0%, #1d4ed8 50%, #0ea5e9 100%); color: #fff; border-radius: 12px; padding: 14px 16px; margin-bottom: 12px;' : ''} }
    .hero-sub { ${isBrandedTemplate ? 'opacity: 0.9; font-size: 12px;' : ''} }
    .hero-top { ${isBrandedTemplate ? 'display: flex; align-items: center; justify-content: space-between; gap: 12px;' : ''} }
    .hero-logo { ${isBrandedTemplate ? 'max-height: 52px; max-width: 180px; object-fit: contain; border-radius: 6px; background: rgba(255,255,255,0.12); padding: 4px 6px;' : ''} }
    @media print {
      body { margin: 12mm; }
      .section--break-before { break-before: page; }
      .no-print { display: none !important; }
    }
  </style>
</head>
<body>
  ${isBrandedTemplate ? `<div class="hero">
    <div class="hero-top">
      <h1>${escapeHtml(callSheetTitle || 'Call Sheet')} - ${escapeHtml(dayFilter)}</h1>
      ${effectiveCallSheetLogo ? `<img class="hero-logo" src="${effectiveCallSheetLogo}" alt="Production logo" />` : ''}
    </div>
    <p class="hero-sub">${escapeHtml(productionName || callSheetShowName || 'Production')} • ${escapeHtml(callSheetVenue || productionLocation || 'Location TBD')}</p>
  </div>` : `<h1>${escapeHtml(callSheetTitle || 'Call Sheet')} - ${escapeHtml(dayFilter)}</h1>
  <p class="meta">Prepared from Planner Workspace schedule export.</p>`}
  ${!isBrandedTemplate ? '' : `<p class="meta">Prepared from Planner Workspace schedule export.</p>`}
  ${callSheetShowName.trim() || callSheetVenue.trim() || callSheetProducer.trim() ? `<div class="meta-grid">
    ${productionName?.trim() ? `<div><strong>Production:</strong> ${escapeHtml(productionName.trim())}</div>` : ''}
    ${productionClient?.trim() ? `<div><strong>Client:</strong> ${escapeHtml(productionClient.trim())}</div>` : ''}
    ${callSheetShowName.trim() ? `<div><strong>Show:</strong> ${escapeHtml(callSheetShowName.trim())}</div>` : ''}
    ${callSheetVenue.trim() ? `<div><strong>Venue:</strong> ${escapeHtml(callSheetVenue.trim())}</div>` : ''}
    ${callSheetProducer.trim() ? `<div><strong>Producer:</strong> ${escapeHtml(callSheetProducer.trim())}</div>` : ''}
    ${callSheetFilteredOnly ? '<div><strong>Scope:</strong> Filtered entries only</div>' : ''}
  </div>` : ''}
  <div class="meta-grid">
    <div><strong>First call:</strong> ${escapeHtml(dayHandoffSummary.firstCall?.startTime ?? '--:--')}</div>
    <div><strong>Last out:</strong> ${escapeHtml(dayHandoffSummary.lastOut?.endTime ?? '--:--')}</div>
    <div><strong>Shift count:</strong> ${selectedDayEntries.length}</div>
    <div><strong>Lock status:</strong> ${escapeHtml(lockStatusText)}</div>
    <div><strong>Missing callouts:</strong> ${dayHandoffSummary.missingCalloutCount}</div>
    <div><strong>Conflicts:</strong> ${dayHandoffSummary.conflictCount}</div>
  </div>
  <div class="section">
    <h2>Crew Calls</h2>
    <table>
      <thead>
        <tr>
          ${columns.map((column) => `<th>${escapeHtml(column)}</th>`).join('')}
        </tr>
      </thead>
      <tbody>${rowHtml}</tbody>
    </table>
  </div>
  ${isDetailedTemplate ? `<div class="section section--break-before">
    <h2>Day Handoff</h2>
    <table>
      <tbody>
        <tr><th>First call</th><td>${escapeHtml(dayHandoffSummary.firstCall?.startTime ?? '--:--')}</td></tr>
        <tr><th>Last out</th><td>${escapeHtml(dayHandoffSummary.lastOut?.endTime ?? '--:--')}</td></tr>
        <tr><th>Assigned resources</th><td>${dayHandoffSummary.assignedResourceCount}</td></tr>
      </tbody>
    </table>
  </div>
  <div class="section">
    <h2>Sign-Off</h2>
    <div class="signoff-grid">
      <div><div class="signoff-line">Prepared by</div></div>
      <div><div class="signoff-line">Approved by</div></div>
      <div><div class="signoff-line">Operations lead</div></div>
      <div><div class="signoff-line">Date / Time</div></div>
    </div>
  </div>` : ''}
</body>
</html>`;
  };

  const exportPrintableCallSheetHtml = () => {
    const blob = new Blob([getPrintableCallSheetHtml()], { type: 'text/html;charset=utf-8;' });
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = `call-sheet-${dayFilter}.html`;
    link.click();
    URL.revokeObjectURL(objectUrl);
  };

  const addRoleCoverageTarget = () => {
    const role = coverageRoleDraft.trim();
    if (!role) return;
    const requiredCount = Math.max(1, Number(coverageRequiredDraft) || 1);
    setRoleCoverageTargets((previous) => {
      const existingIndex = previous.findIndex((target) => target.role.toLowerCase() === role.toLowerCase());
      if (existingIndex >= 0) {
        const next = [...previous];
        next[existingIndex] = { ...next[existingIndex], role, requiredCount };
        return next;
      }
      return [...previous, { id: crypto.randomUUID(), role, requiredCount }];
    });
    setCoverageRoleDraft('');
    setCoverageRequiredDraft('1');
  };

  const removeRoleCoverageTarget = (targetId: string) => {
    setRoleCoverageTargets((previous) => previous.filter((target) => target.id !== targetId));
  };

  const addCriticalRole = () => {
    const role = criticalRoleDraft.trim();
    if (!role) return;
    setCriticalRoleNames((previous) => {
      if (previous.includes(role)) return previous;
      return [...previous, role].sort((left, right) => left.localeCompare(right));
    });
    setCriticalRoleDraft('');
  };

  const removeCriticalRole = (role: string) => {
    setCriticalRoleNames((previous) => previous.filter((existingRole) => existingRole !== role));
  };

  const toggleResourceAssignmentForEntry = (entryId: string, resourceId: string, skipLockCheck = false) => {
    const entryForLockCheck = schedule.find((item) => item.id === entryId);
    if (!entryForLockCheck) return;
    if (
      !skipLockCheck &&
      !requestLockOverride(entryForLockCheck.date, 'updating resource assignments', () =>
        toggleResourceAssignmentForEntry(entryId, resourceId, true)
      )
    ) {
      return;
    }
    onChange(
      schedule.map((entry) => {
        if (entry.id !== entryId) return entry;
        const existing = entry.resourceIds ?? [];
        const next = existing.includes(resourceId)
          ? existing.filter((id) => id !== resourceId)
          : [...existing, resourceId];
        return { ...entry, resourceIds: next };
      })
    );
  };

  const openEditEntry = (entry: CrewScheduleEntry, skipLockCheck = false) => {
    if (!skipLockCheck && !requestLockOverride(entry.date, 'editing this schedule entry', () => openEditEntry(entry, true))) {
      return;
    }
    setEditingEntryId(entry.id);
    setEditingDraft({
      crewMemberId: entry.crewMemberId,
      date: entry.date,
      startTime: entry.startTime ?? '',
      endTime: entry.endTime ?? '',
      role: entry.role ?? '',
      location: entry.location ?? '',
      notes: entry.notes ?? '',
      resourceIds: entry.resourceIds ?? [],
    });
  };

  const saveEditedEntry = (skipLockCheck = false) => {
    if (!editingEntryId || !editingDraft?.crewMemberId || !editingDraft.date) return;
    const originalEntry = schedule.find((entry) => entry.id === editingEntryId);
    if (!originalEntry) return;
    if (
      !skipLockCheck &&
      !requestLockOverride(originalEntry.date, 'saving edits to this schedule entry', () => saveEditedEntry(true))
    ) {
      return;
    }
    if (
      !skipLockCheck &&
      editingDraft.date !== originalEntry.date &&
      !requestLockOverride(editingDraft.date, 'moving this schedule entry to a locked day', () => saveEditedEntry(true))
    ) {
      return;
    }
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
      if (!shouldIncludeEntryInCriticalFocus(entry, crewMembers, criticalFocusModeEnabled, criticalRoleNames)) {
        continue;
      }
      if (!map[entry.date]) map[entry.date] = [];
      map[entry.date].push(entry);
    }
    return map;
  }, [schedule, crewMembers, criticalFocusModeEnabled, criticalRoleNames]);

  const selectedDay = useMemo(() => {
    if (schedule[0]?.date) return schedule[0].date;
    if (projectStartDate) return projectStartDate;
    return format(new Date(), 'yyyy-MM-dd');
  }, [schedule, projectStartDate]);

  useEffect(() => {
    if (dayBoardDate) {
      return;
    }
    const clampedSelectedDay = clampDateToProjectRange(selectedDay, projectStartDate, projectEndDate);
    setLocalDayBoardDate((previous) => {
      if (!previous) {
        return clampedSelectedDay;
      }
      return clampDateToProjectRange(previous, projectStartDate, projectEndDate);
    });
  }, [dayBoardDate, selectedDay, projectStartDate, projectEndDate]);

  const effectiveDayBoardDate = dayBoardDate || localDayBoardDate || selectedDay;
  const dayFilter = clampDateToProjectRange(effectiveDayBoardDate, projectStartDate, projectEndDate);
  const isDateEditingLocked = (date: string): boolean => Boolean(dayLocksByDate[date]) && !lockOverridesByDate[date];
  const requestLockOverride = (date: string, actionLabel: string, onConfirm: () => void): boolean => {
    if (!isDateEditingLocked(date)) return true;
    setLockOverrideDate(date);
    setLockOverrideActionLabel(actionLabel);
    setPendingLockOverrideAction(() => onConfirm);
    setLockOverrideDialogOpen(true);
    return false;
  };
  const isDayLocked = isDateEditingLocked(dayFilter);
  const isDayActuallyLocked = Boolean(dayLocksByDate[dayFilter]);
  const isDayOverrideEnabled = Boolean(lockOverridesByDate[dayFilter]);
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
  const [exportPreviewOpen, setExportPreviewOpen] = useState(false);
  const [exportPreviewTab, setExportPreviewTab] = useState<'call-sheet' | 'csv' | 'html'>('call-sheet');
  const selectedEditingEntry = useMemo(
    () => schedule.find((entry) => entry.id === editingEntryId) ?? null,
    [schedule, editingEntryId]
  );

  const updateDayFilter = (nextDayValue: string) => {
    const clamped = clampDateToProjectRange(nextDayValue, projectStartDate, projectEndDate);
    if (!clamped) return;
    if (clamped === dayFilter) return;
    setLocalDayBoardDate(clamped);
    onDayBoardDateChange?.(clamped);
  };

  const toggleDayLock = () => {
    if (!dayFilter) return;
    setDayLocksByDate((previous) => ({ ...previous, [dayFilter]: !previous[dayFilter] }));
    setLockOverridesByDate((previous) => ({ ...previous, [dayFilter]: false }));
  };

  const conflictList = useMemo(
    () => buildScheduleConflicts(schedule, crewMembers, projectStartDate, projectEndDate),
    [schedule, crewMembers, projectStartDate, projectEndDate]
  );
  const missingCalloutCount = useMemo(
    () =>
      conflictList.filter((conflict) => conflict.message.startsWith('Missing callout:') || conflict.message.includes('missing start or end time')).length,
    [conflictList]
  );
  const conflictsByEntryId = useMemo(() => {
    const map = new Map<string, ScheduleConflict[]>();
    for (const conflict of conflictList) {
      const existing = map.get(conflict.entryId) ?? [];
      existing.push(conflict);
      map.set(conflict.entryId, existing);
    }
    return map;
  }, [conflictList]);
  const availabilityConflictEntryIds = useMemo(() => {
    const ids = new Set<string>();
    for (const conflict of conflictList) {
      if (conflict.message.includes('availability window')) ids.add(conflict.entryId);
    }
    return ids;
  }, [conflictList]);
  const availabilityConflictCount = availabilityConflictEntryIds.size;

  const dayEntries = useMemo(
    () =>
      schedule
        .filter((entry) => entry.date === dayFilter)
        .filter((entry) => {
          if (roleFilter !== 'all') {
            const effectiveRole = resolveEffectiveEntryRole(entry, crewMembers);
            if (effectiveRole !== roleFilter) return false;
          }
          if (locationFilter !== 'all') {
            const effectiveLocation = (entry.location || '').trim();
            if (effectiveLocation !== locationFilter) return false;
          }
          if (availabilityFilter === 'availability-conflicts' && !availabilityConflictEntryIds.has(entry.id)) {
            return false;
          }
          if (!shouldIncludeEntryInCriticalFocus(entry, crewMembers, criticalFocusModeEnabled, criticalRoleNames)) return false;
          return true;
        })
        .sort((left, right) => `${left.startTime || ''}`.localeCompare(right.startTime || '')),
    [
      schedule,
      dayFilter,
      roleFilter,
      locationFilter,
      availabilityFilter,
      availabilityConflictEntryIds,
      crewMembers,
      criticalFocusModeEnabled,
      criticalRoleNames,
    ]
  );

  const dayEntriesAllRoles = useMemo(
    () =>
      schedule
        .filter((entry) => entry.date === dayFilter)
        .sort((left, right) => `${left.startTime || ''}`.localeCompare(right.startTime || '')),
    [schedule, dayFilter]
  );

  const roleFilterOptions = useMemo(() => {
    const values = new Set<string>();
    for (const entry of schedule) {
      const effectiveRole = (entry.role || crewMembers.find((member) => member.id === entry.crewMemberId)?.role || '').trim();
      if (effectiveRole) values.add(effectiveRole);
    }
    return Array.from(values).sort((a, b) => a.localeCompare(b));
  }, [schedule, crewMembers]);

  const roleQuickApplyOptions = useMemo(() => {
    const values = new Set<string>();
    for (const member of crewMembers) {
      const role = (member.role || '').trim();
      if (role) values.add(role);
    }
    return Array.from(values).sort((left, right) => left.localeCompare(right));
  }, [crewMembers]);

  const roleCoverageByTarget = useMemo(() => {
    const assignedCounts = new Map<string, number>();
    for (const entry of dayEntriesAllRoles) {
      const effectiveRole = (entry.role || crewMembers.find((member) => member.id === entry.crewMemberId)?.role || '').trim();
      if (!effectiveRole) continue;
      assignedCounts.set(effectiveRole, (assignedCounts.get(effectiveRole) ?? 0) + 1);
    }
    return roleCoverageTargets.map((target) => {
      const assignedCount = assignedCounts.get(target.role) ?? 0;
      const variance = assignedCount - target.requiredCount;
      return { ...target, assignedCount, variance };
    });
  }, [dayEntriesAllRoles, crewMembers, roleCoverageTargets]);

  const locationFilterOptions = useMemo(() => {
    const values = new Set<string>();
    for (const entry of schedule) {
      const location = (entry.location || '').trim();
      if (location) values.add(location);
    }
    return Array.from(values).sort((a, b) => a.localeCompare(b));
  }, [schedule]);

  const nextUpcomingEntry = useMemo(() => {
    const now = new Date();
    const todayKey = format(now, 'yyyy-MM-dd');
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const candidates = schedule
      .filter((entry) => {
        if (entry.date > todayKey) return true;
        if (entry.date < todayKey) return false;
        const startMinutes = parseTimeToMinutes(entry.startTime, 24 * 60 + 1);
        return startMinutes >= nowMinutes;
      })
      .sort((left, right) => {
        if (left.date !== right.date) return left.date.localeCompare(right.date);
        return parseTimeToMinutes(left.startTime, 24 * 60 + 1) - parseTimeToMinutes(right.startTime, 24 * 60 + 1);
      });
    return candidates[0] ?? null;
  }, [schedule]);

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

  const dayHandoffSummary = useMemo(() => {
    const selectedDayEntries = schedule.filter((entry) => entry.date === dayFilter);
    if (selectedDayEntries.length === 0) {
      return {
        firstCall: null as CrewScheduleEntry | null,
        lastOut: null as CrewScheduleEntry | null,
        shiftCount: 0,
        missingCalloutCount: 0,
        conflictCount: 0,
        assignedResourceCount: 0,
      };
    }

    const withStart = selectedDayEntries
      .filter((entry) => Boolean(entry.startTime))
      .sort(
        (left, right) =>
          parseTimeToMinutes(left.startTime, 24 * 60 + 1) - parseTimeToMinutes(right.startTime, 24 * 60 + 1)
      );
    const withEnd = selectedDayEntries
      .filter((entry) => Boolean(entry.endTime))
      .sort(
        (left, right) =>
          parseTimeToMinutes(right.endTime, -1) - parseTimeToMinutes(left.endTime, -1)
      );

    const missingCalloutCount = selectedDayEntries.reduce((sum, entry) => {
      let missing = 0;
      if (!entry.location?.trim()) missing += 1;
      if (!entry.startTime) missing += 1;
      if (!entry.endTime) missing += 1;
      return sum + missing;
    }, 0);

    const conflictCount = selectedDayEntries.reduce((sum, entry) => {
      return sum + (conflictsByEntryId.get(entry.id)?.length ?? 0);
    }, 0);

    const assignedResourceCount = selectedDayEntries.reduce((sum, entry) => {
      return sum + (entry.resourceIds?.length ?? 0);
    }, 0);

    return {
      firstCall: withStart[0] ?? null,
      lastOut: withEnd[0] ?? null,
      shiftCount: selectedDayEntries.length,
      missingCalloutCount,
      conflictCount,
      assignedResourceCount,
    };
  }, [schedule, dayFilter, conflictsByEntryId]);

  const isDetailedView = scheduleViewMode === 'detailed';

  const updateEntryTimeRange = (
    entryId: string,
    nextStartMinutes: number,
    nextEndMinutes: number,
    skipLockCheck = false
  ) => {
    const entryForLockCheck = schedule.find((item) => item.id === entryId);
    if (!entryForLockCheck) return;
    if (
      !skipLockCheck &&
      !requestLockOverride(entryForLockCheck.date, 'dragging or resizing this schedule block', () =>
        updateEntryTimeRange(entryId, nextStartMinutes, nextEndMinutes, true)
      )
    ) {
      return;
    }
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
    const startDrag = () => {
      setDragState({
        entryId: block.entry.id,
        mode,
        startX: event.clientX,
        initialStartMinutes: block.startMinutes,
        initialEndMinutes: block.endMinutes,
      });
    };
    if (!requestLockOverride(block.entry.date, 'dragging or resizing this schedule block', startDrag)) return;
    startDrag();
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
        {isDetailedView ? <div className="mt-2 flex flex-wrap items-center gap-2">
          <Select onValueChange={applyTemplateToDraft}>
            <SelectTrigger className="h-7 w-[190px]">
              <SelectValue placeholder="Apply shift template" />
            </SelectTrigger>
            <SelectContent>
              {savedTemplates.length === 0 ? (
                <SelectItem value="none" disabled>
                  No templates
                </SelectItem>
              ) : (
                savedTemplates.map((template) => (
                  <SelectItem key={template.id} value={template.id}>
                    {template.name}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
          <Input
            className="h-7 w-[170px]"
            placeholder="Template name"
            value={templateNameDraft}
            onChange={(event) => setTemplateNameDraft(event.target.value)}
          />
          <Button type="button" variant="outline" size="sm" className="h-7" onClick={saveDraftAsTemplate}>
            Save Template
          </Button>
          <Select value={quickApplyTemplateId || 'none'} onValueChange={(value) => setQuickApplyTemplateId(value === 'none' ? '' : value)}>
            <SelectTrigger className="h-7 w-[190px]">
              <SelectValue placeholder="Quick-apply template" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Select template</SelectItem>
              {savedTemplates.map((template) => (
                <SelectItem key={template.id} value={template.id}>
                  {template.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={quickApplyRole || 'none'} onValueChange={(value) => setQuickApplyRole(value === 'none' ? '' : value)}>
            <SelectTrigger className="h-7 w-[180px]">
              <SelectValue placeholder="Role for quick-apply" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Select role</SelectItem>
              {roleQuickApplyOptions.map((role) => (
                <SelectItem key={role} value={role}>
                  {role}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7"
            onClick={() => quickApplyTemplateToRoleForDay()}
            disabled={!quickApplyTemplateId || !quickApplyRole}
          >
            Quick-Apply Role (Day)
          </Button>
          {quickApplySummary ? (
            <span className="text-xs text-muted-foreground">{quickApplySummary}</span>
          ) : null}
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
        </div> : null}
        <Input className="mt-2 h-8" placeholder="Notes" value={draft.notes} onChange={(event) => setDraft((previous) => ({ ...previous, notes: event.target.value }))} />
        <Button className="mt-2 h-8 gap-1" size="sm" onClick={addEntry} disabled={!draft.crewMemberId || !draft.date}>
          <Plus className="h-3.5 w-3.5" />
          Add Entry
        </Button>
        {isDetailedView && savedTemplates.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1">
            {savedTemplates.map((template) => (
              <button
                key={template.id}
                type="button"
                className="rounded border bg-muted/40 px-2 py-1 text-[11px] hover:bg-muted"
                onClick={() => applyTemplateToDraft(template.id)}
                onContextMenu={(event) => {
                  event.preventDefault();
                  deleteTemplate(template.id);
                }}
                title="Right-click to remove template"
              >
                {template.name}
              </button>
            ))}
          </div>
        ) : null}
      </OptionalFormCollapsible>

      <Tabs defaultValue="day-board" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <TabsList>
            <TabsTrigger value="day-board">Day Board</TabsTrigger>
            {isDetailedView ? <TabsTrigger value="project-span">Project Span</TabsTrigger> : null}
            {isDetailedView ? <TabsTrigger value="week-cards">Week Cards</TabsTrigger> : null}
          </TabsList>
          <div className="inline-flex h-8 items-center gap-2 rounded border bg-background px-2">
            <Label htmlFor="schedule-view-mode-toggle" className="text-xs text-muted-foreground">
              Simple
            </Label>
            <Switch
              id="schedule-view-mode-toggle"
              checked={isDetailedView}
              onCheckedChange={(checked) => setScheduleViewMode(checked ? 'detailed' : 'simple')}
            />
            <Label htmlFor="schedule-view-mode-toggle" className="text-xs text-muted-foreground">
              Detailed
            </Label>
          </div>
        </div>

        <TabsContent value="day-board" className="space-y-3">
          <div className="rounded-md border bg-muted/20 p-1.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <Input
                className="h-7 w-[150px]"
                type="date"
                min={projectStartDate}
                max={projectEndDate}
                value={dayFilter}
                onChange={(event) => updateDayFilter(event.target.value)}
              />
              {isDetailedView ? (
                <>
                  <Select value={roleFilter} onValueChange={setRoleFilter}>
                    <SelectTrigger className="h-7 w-[150px]">
                      <SelectValue placeholder="Role" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All roles</SelectItem>
                      {roleFilterOptions.map((role) => (
                        <SelectItem key={role} value={role}>
                          {role}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={locationFilter} onValueChange={setLocationFilter}>
                    <SelectTrigger className="h-7 w-[150px]">
                      <SelectValue placeholder="Location" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All locations</SelectItem>
                      {locationFilterOptions.map((location) => (
                        <SelectItem key={location} value={location}>
                          {location}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={availabilityFilter}
                    onValueChange={(value) => setAvailabilityFilter(value as 'all' | 'availability-conflicts')}
                  >
                    <SelectTrigger className="h-7 w-[190px]">
                      <SelectValue placeholder="Availability" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All availability</SelectItem>
                      <SelectItem value="availability-conflicts">Availability conflicts ({availabilityConflictCount})</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    className="h-7 w-[135px]"
                    type="date"
                    min={projectStartDate}
                    max={projectEndDate}
                    value={copyToDate}
                    onChange={(event) =>
                      setCopyToDate(clampDateToProjectRange(event.target.value, projectStartDate, projectEndDate))
                    }
                  />
                  <Button type="button" variant="outline" size="sm" className="h-7" onClick={copyDaySchedule}>
                    Copy
                  </Button>
                </>
              ) : null}
              <Button
                type="button"
                variant={isDayActuallyLocked ? 'default' : 'outline'}
                size="sm"
                className="h-7"
                onClick={toggleDayLock}
              >
                {isDayActuallyLocked ? 'Unlock' : 'Lock'}
              </Button>
            </div>
            {isDetailedView ? <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <Button type="button" variant="outline" size="sm" className="h-7" onClick={exportDayBoardCsv}>
                CSV
              </Button>
              <Button type="button" variant="outline" size="sm" className="h-7" onClick={exportDayCallSheet}>
                Call Sheet
              </Button>
              <Button type="button" variant="outline" size="sm" className="h-7" onClick={exportPrintableCallSheetHtml}>
                Printable HTML
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7"
                onClick={() => setExportPreviewOpen(true)}
              >
                Preview
              </Button>
            </div> : null}
            {isDetailedView ? <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <Button
                type="button"
                variant={criticalFocusModeEnabled ? 'default' : 'outline'}
                size="sm"
                className="h-7"
                onClick={() => setCriticalFocusModeEnabled((previous) => !previous)}
              >
                {criticalFocusModeEnabled ? 'Critical Focus On' : 'Critical Focus Off'}
              </Button>
              <Select
                value={criticalRoleDraft || 'none'}
                onValueChange={(value) => setCriticalRoleDraft(value === 'none' ? '' : value)}
              >
                <SelectTrigger className="h-7 w-[200px]">
                  <SelectValue placeholder="Add critical role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Select role</SelectItem>
                  {roleFilterOptions.map((role) => (
                    <SelectItem key={role} value={role}>
                      {role}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button type="button" variant="outline" size="sm" className="h-7" onClick={addCriticalRole}>
                Add Critical Role
              </Button>
              {criticalRoleNames.map((role) => (
                <button
                  key={role}
                  type="button"
                  className="rounded border border-border/70 bg-background px-2 py-1 text-xs"
                  title="Right-click to remove"
                  onContextMenu={(event) => {
                    event.preventDefault();
                    removeCriticalRole(role);
                  }}
                >
                  {role}
                </button>
              ))}
            </div> : null}
            {SHOW_ROLE_COVERAGE_TARGETS ? (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Select
                  value={coverageRoleDraft || 'none'}
                  onValueChange={(value) => setCoverageRoleDraft(value === 'none' ? '' : value)}
                >
                  <SelectTrigger className="h-8 w-[220px]">
                    <SelectValue placeholder="Coverage role target" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Select role</SelectItem>
                    {roleFilterOptions.map((role) => (
                      <SelectItem key={role} value={role}>
                        {role}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  className="h-8 w-[90px]"
                  type="number"
                  min={1}
                  value={coverageRequiredDraft}
                  onChange={(event) => setCoverageRequiredDraft(event.target.value)}
                />
                <Button type="button" variant="outline" size="sm" className="h-8" onClick={addRoleCoverageTarget}>
                  Add Target
                </Button>
              </div>
            ) : null}
            {isDetailedView ? <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>Graphical day-of blocking by crew/resource time</span>
              {nextUpcomingEntry ? (
                <span className="rounded border bg-background px-2 py-0.5 text-foreground">
                  Next shift: {nextUpcomingEntry.date} {nextUpcomingEntry.startTime || '--:--'} · {resolveCrewLabel(crewMembers, nextUpcomingEntry.crewMemberId)}
                </span>
              ) : (
                <span className="rounded border bg-background px-2 py-0.5">No upcoming shifts</span>
              )}
              {isDetailedView && conflictList.length > 0 ? (
                <span className="rounded border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-amber-700 dark:text-amber-300">
                  {conflictList.length} scheduling warning(s)
                </span>
              ) : null}
              {isDetailedView && missingCalloutCount > 0 ? (
                <span className="rounded border border-red-500/40 bg-red-500/10 px-2 py-0.5 text-red-700 dark:text-red-300">
                  {missingCalloutCount} missing callout field(s)
                </span>
              ) : null}
              {isDayLocked ? (
                <span className="rounded border border-primary/40 bg-primary/10 px-2 py-0.5 text-primary">
                  Day is locked (editing disabled)
                </span>
              ) : null}
              {isDayActuallyLocked && isDayOverrideEnabled ? (
                <span className="rounded border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-emerald-700 dark:text-emerald-300">
                  Lock override enabled for this day
                </span>
              ) : null}
              {availabilityConflictCount > 0 ? (
                <span className="rounded border border-orange-500/40 bg-orange-500/10 px-2 py-0.5 text-orange-700 dark:text-orange-300">
                  {availabilityConflictCount} availability conflict(s)
                </span>
              ) : null}
              {criticalFocusModeEnabled ? (
                <span className="rounded border border-blue-500/40 bg-blue-500/10 px-2 py-0.5 text-blue-700 dark:text-blue-300">
                  Critical focus mode active
                </span>
              ) : null}
            </div> : null}
            {SHOW_ROLE_COVERAGE_TARGETS && roleCoverageByTarget.length > 0 ? (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                {roleCoverageByTarget.map((target) => (
                  <span
                    key={target.id}
                    className={
                      target.variance < 0
                        ? 'rounded border border-red-500/40 bg-red-500/10 px-2 py-0.5 text-red-700 dark:text-red-300'
                        : target.variance > 0
                          ? 'rounded border border-blue-500/40 bg-blue-500/10 px-2 py-0.5 text-blue-700 dark:text-blue-300'
                          : 'rounded border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-emerald-700 dark:text-emerald-300'
                    }
                    title="Right-click to remove target"
                    onContextMenu={(event) => {
                      event.preventDefault();
                      removeRoleCoverageTarget(target.id);
                    }}
                  >
                    {target.role}: {target.assignedCount}/{target.requiredCount}
                    {target.variance < 0
                      ? ` (under ${Math.abs(target.variance)})`
                      : target.variance > 0
                        ? ` (over ${target.variance})`
                        : ' (on target)'}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
          {isDetailedView ? <div className="rounded-md border p-3">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Day handoff summary</p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded border bg-muted/20 px-2 py-1.5 text-xs">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">First call</p>
                {dayHandoffSummary.firstCall ? (
                  <p className="font-medium">
                    {dayHandoffSummary.firstCall.startTime || '--:--'} ·{' '}
                    {resolveCrewLabel(crewMembers, dayHandoffSummary.firstCall.crewMemberId)}
                  </p>
                ) : (
                  <p className="text-muted-foreground">No scheduled start time</p>
                )}
              </div>
              <div className="rounded border bg-muted/20 px-2 py-1.5 text-xs">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Last out</p>
                {dayHandoffSummary.lastOut ? (
                  <p className="font-medium">
                    {dayHandoffSummary.lastOut.endTime || '--:--'} ·{' '}
                    {resolveCrewLabel(crewMembers, dayHandoffSummary.lastOut.crewMemberId)}
                  </p>
                ) : (
                  <p className="text-muted-foreground">No scheduled end time</p>
                )}
              </div>
              <div className="rounded border bg-muted/20 px-2 py-1.5 text-xs">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Operational status</p>
                <p className="font-medium">
                  {dayHandoffSummary.shiftCount} shifts ·{' '}
                  {isDayActuallyLocked ? (isDayOverrideEnabled ? 'Locked (override)' : 'Locked') : 'Unlocked'}
                </p>
              </div>
              <div className="rounded border bg-muted/20 px-2 py-1.5 text-xs">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Warnings</p>
                <p className="font-medium">
                  {dayHandoffSummary.missingCalloutCount} missing fields · {dayHandoffSummary.conflictCount} conflicts
                </p>
              </div>
            </div>
            <div className="mt-2 text-xs text-muted-foreground">
              Resource assignments across day: {dayHandoffSummary.assignedResourceCount}
            </div>
          </div> : null}
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
                    {(conflictsByEntryId.get(block.entry.id) ?? []).map((conflict) => (
                      <p
                        key={`${block.entry.id}-${conflict.message}`}
                        className={conflict.level === 'error' ? 'text-red-600 dark:text-red-300' : 'text-amber-700 dark:text-amber-300'}
                      >
                        {conflict.message}
                      </p>
                    ))}
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
                      <div className="truncate pr-14 font-medium">{block.entry.location || 'Scheduled block'}</div>
                      <div className="truncate pr-14 text-[10px] text-muted-foreground">{block.entry.notes || 'Drag to move'}</div>
                      {(block.entry.resourceIds ?? []).length > 0 ? (
                        <div className="mt-0.5 truncate text-[10px] text-blue-700 dark:text-blue-300">
                          {(block.entry.resourceIds ?? [])
                            .map((resourceId) => resources.find((resource) => resource.id === resourceId)?.label)
                            .filter(Boolean)
                            .join(' | ')}
                        </div>
                      ) : null}
                      <div className="absolute right-1 top-1 flex items-center gap-0.5 rounded border bg-background/90 px-1 py-0.5 shadow-sm">
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
          {isDetailedView ? <div className="rounded-md border p-3">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Day resources</p>
            {resources.length === 0 ? (
              <p className="text-xs text-muted-foreground">No linked resources.</p>
            ) : (
              <div className="grid gap-1 sm:grid-cols-2">
                {resources.map((resource) => (
                  <div key={resource.id} className="flex items-center justify-between rounded border bg-muted/20 px-2 py-1 text-xs">
                    <span className="truncate">{resource.label}</span>
                    <span className="flex items-center gap-2">
                      <span className="text-[10px] text-muted-foreground">
                        assigned{' '}
                        {schedule.filter((entry) => (entry.resourceIds ?? []).includes(resource.id)).length}
                      </span>
                      <span className="font-medium">x{resource.quantity}</span>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div> : null}
        </TabsContent>

        {isDetailedView ? <TabsContent value="project-span" className="space-y-3">
          <div className="rounded-md border p-3">
            <p className="mb-2 text-xs text-muted-foreground">Graphical span of scheduled blocks across project days</p>
            {criticalFocusModeEnabled && Object.keys(groupedByDate).length === 0 ? (
              <p className="mb-2 rounded border border-dashed px-2 py-1 text-xs text-muted-foreground">
                No critical-role shifts in project span for current filters.
              </p>
            ) : null}
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
        </TabsContent> : null}

        {isDetailedView ? <TabsContent value="week-cards">
          {criticalFocusModeEnabled && Object.keys(groupedByDate).length === 0 ? (
            <p className="mb-2 rounded border border-dashed px-2 py-1 text-xs text-muted-foreground">
              No critical-role shifts in this week for current filters.
            </p>
          ) : null}
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
                        {(conflictsByEntryId.get(entry.id) ?? []).map((conflict) => (
                          <p
                            key={`${entry.id}-${conflict.message}`}
                            className={conflict.level === 'error' ? 'text-red-600 dark:text-red-300' : 'text-amber-700 dark:text-amber-300'}
                          >
                            {conflict.message}
                          </p>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </TabsContent> : null}
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
              {editingEntryId && resources.length > 0 ? (
                <div className="sm:col-span-2 space-y-1 rounded-md border bg-muted/20 p-2">
                  <p className="text-xs font-medium text-muted-foreground">Assigned resources</p>
                  <div className="grid gap-1 sm:grid-cols-2">
                    {resources.map((resource) => {
                      const isAssigned = (selectedEditingEntry?.resourceIds ?? []).includes(resource.id);
                      return (
                        <label key={resource.id} className="inline-flex items-center gap-1.5 text-xs">
                          <input
                            type="checkbox"
                            checked={isAssigned}
                            onChange={() => toggleResourceAssignmentForEntry(editingEntryId, resource.id)}
                          />
                          <span className="truncate">{resource.label}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ) : null}
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
      <Dialog
        open={exportPreviewOpen}
        onOpenChange={(open) => {
          setExportPreviewOpen(open);
          if (!open) setExportPreviewTab('call-sheet');
        }}
      >
        <DialogContent className="sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>Export Preview ({dayFilter})</DialogTitle>
          </DialogHeader>
          <div className="rounded-md border bg-muted/20 p-2">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Call Sheet Options</p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <label className="inline-flex items-center gap-1.5 text-xs">
                <input
                  type="checkbox"
                  checked={callSheetIncludeNotes}
                  onChange={(event) => setCallSheetIncludeNotes(event.target.checked)}
                />
                Include notes
              </label>
              <label className="inline-flex items-center gap-1.5 text-xs">
                <input
                  type="checkbox"
                  checked={callSheetIncludeResources}
                  onChange={(event) => setCallSheetIncludeResources(event.target.checked)}
                />
                Include resources
              </label>
              <label className="inline-flex items-center gap-1.5 text-xs">
                <input
                  type="checkbox"
                  checked={callSheetIncludeWarnings}
                  onChange={(event) => setCallSheetIncludeWarnings(event.target.checked)}
                />
                Include warnings
              </label>
              <label className="inline-flex items-center gap-1.5 text-xs">
                <input
                  type="checkbox"
                  checked={callSheetFilteredOnly}
                  onChange={(event) => setCallSheetFilteredOnly(event.target.checked)}
                />
                Filtered entries only
              </label>
              <Select
                value={callSheetTemplateMode}
                onValueChange={(value) => setCallSheetTemplateMode(value as 'simple' | 'detailed' | 'branded')}
              >
                <SelectTrigger className="h-7">
                  <SelectValue placeholder="Template mode" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="simple">Simple template</SelectItem>
                  <SelectItem value="detailed">Detailed template</SelectItem>
                  <SelectItem value="branded">Branded template</SelectItem>
                </SelectContent>
              </Select>
              <Input
                className="h-7"
                value={callSheetTitle}
                placeholder="Header title"
                onChange={(event) => setCallSheetTitle(event.target.value)}
              />
              <Input
                className="h-7"
                value={callSheetShowName}
                placeholder="Show name"
                onChange={(event) => setCallSheetShowName(event.target.value)}
              />
              <Input
                className="h-7"
                value={callSheetVenue}
                placeholder="Venue"
                onChange={(event) => setCallSheetVenue(event.target.value)}
              />
            </div>
            <Input
              className="mt-2 h-7"
              value={callSheetProducer}
              placeholder="Producer"
              onChange={(event) => setCallSheetProducer(event.target.value)}
            />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Input
                className="h-7 max-w-[320px]"
                type="file"
                accept="image/*"
                onChange={(event) => handleCallSheetLogoUpload(event.target.files?.[0] ?? null)}
              />
              {callSheetLogoDataUrl ? (
                <Button type="button" variant="outline" size="sm" className="h-7" onClick={() => setCallSheetLogoDataUrl('')}>
                  Clear Logo
                </Button>
              ) : null}
            </div>
          </div>
          <Tabs
            value={exportPreviewTab}
            onValueChange={(value) => setExportPreviewTab(value as 'call-sheet' | 'csv' | 'html')}
            className="space-y-3"
          >
            <TabsList>
              <TabsTrigger value="call-sheet">Call Sheet</TabsTrigger>
              <TabsTrigger value="csv">CSV</TabsTrigger>
              <TabsTrigger value="html">Printable HTML</TabsTrigger>
            </TabsList>
            <TabsContent value="call-sheet" className="space-y-2">
              <div className="max-h-[420px] overflow-auto rounded border bg-muted/20 p-2">
                <pre className="whitespace-pre-wrap text-xs">{getDayCallSheetContent()}</pre>
              </div>
              <div className="flex justify-end">
                <Button type="button" size="sm" onClick={exportDayCallSheet}>
                  Download Call Sheet
                </Button>
              </div>
            </TabsContent>
            <TabsContent value="csv" className="space-y-2">
              <div className="max-h-[420px] overflow-auto rounded border bg-muted/20 p-2">
                <pre className="whitespace-pre-wrap text-xs">{getDayBoardCsvContent()}</pre>
              </div>
              <div className="flex justify-end">
                <Button type="button" size="sm" onClick={exportDayBoardCsv}>
                  Download CSV
                </Button>
              </div>
            </TabsContent>
            <TabsContent value="html" className="space-y-2">
              <div className="max-h-[420px] overflow-auto rounded border bg-muted/20 p-2">
                <iframe
                  title="Printable call sheet preview"
                  className="h-[400px] w-full rounded border bg-white"
                  srcDoc={getPrintableCallSheetHtml()}
                />
              </div>
              <div className="flex justify-end">
                <Button type="button" size="sm" onClick={exportPrintableCallSheetHtml}>
                  Download Printable HTML
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={lockOverrideDialogOpen}
        onOpenChange={(open) => {
          setLockOverrideDialogOpen(open);
          if (!open) {
            setPendingLockOverrideAction(null);
            setLockOverrideDate('');
            setLockOverrideActionLabel('');
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Day lock override required</AlertDialogTitle>
            <AlertDialogDescription>
              This day is locked. Confirm override for {lockOverrideDate || dayFilter} before {lockOverrideActionLabel}.
              The override remains active until you relock this day.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel type="button">Cancel</AlertDialogCancel>
            <AlertDialogAction
              type="button"
              onClick={() => {
                if (lockOverrideDate) {
                  setLockOverridesByDate((previous) => ({ ...previous, [lockOverrideDate]: true }));
                }
                pendingLockOverrideAction?.();
                setPendingLockOverrideAction(null);
                setLockOverrideDate('');
                setLockOverrideActionLabel('');
              }}
            >
              Override lock
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
