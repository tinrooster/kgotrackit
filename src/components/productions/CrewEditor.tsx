import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Plus, Trash2, User, Database, ChevronDown, ChevronRight, GripVertical, MoreHorizontal, Flag, CalendarDays } from 'lucide-react';
import { PositionTemplate, ProductionCrewMember } from '@/types/productions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { getCrewContacts, CREW_CONTACTS_UPDATED_EVENT } from '@/lib/crewContactsService';
import { CrewContact } from '@/types/crewContacts';
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
import {
  createPositionTemplate,
  getPositionTemplates,
  POSITION_TEMPLATES_UPDATED_EVENT,
} from '@/lib/positionTemplatesService';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ListExpandAllSwitch } from '@/components/ui/list-expand-all-switch';
import { TimeInput } from '@/components/ui/time-input';
import { OptionalFormCollapsible } from '@/components/forms/OptionalFormCollapsible';
import { normalizeDateInputValue, normalizeQuarterHourTime } from '@/lib/dateTimeInputs';
import { normalizeUsPhoneForStorage } from '@/lib/phoneNormalization';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface CrewEditorProps {
  crew: ProductionCrewMember[];
  onChange: (crew: ProductionCrewMember[]) => void;
  readOnly?: boolean;
  requireDeleteConfirm?: boolean;
}

type CrewSortMode = 'manual' | 'name_asc' | 'name_desc' | 'role_asc' | 'role_desc';
type CrewCardDensityMode = 'detailed' | 'compact';

const DEFAULT_DEPARTMENT = 'General';

const EMPTY_MEMBER: Omit<ProductionCrewMember, 'id'> = {
  name: '',
  role: '',
  department: DEFAULT_DEPARTMENT,
  positionLabel: '',
};

const EMPTY_SHIFT_DRAFT = {
  date: '',
  startTime: '',
  endTime: '',
  location: '',
  notes: '',
};

function parseLegacyContact(contact?: string): { phone?: string; email?: string } {
  if (!contact) return {};
  const emailMatch = contact.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  const phoneMatch = contact.match(/(?:\+?\d[\d\s().-]{6,}\d)/);
  return {
    phone: phoneMatch?.[0]?.trim(),
    email: emailMatch?.[0]?.trim(),
  };
}

function normalizeDepartment(value?: string): string {
  return value?.trim() || DEFAULT_DEPARTMENT;
}

function getDepartmentAccentHex(departmentName: string): string {
  const key = departmentName.trim().toLowerCase() || DEFAULT_DEPARTMENT;
  let hash = 2166136261;
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue} 75% 58%)`;
}

function ShiftDateField({
  value,
  onChange,
  ariaLabel,
}: {
  value: string;
  onChange: (nextValue: string) => void;
  ariaLabel: string;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  const openDatePicker = () => {
    const inputElement = inputRef.current;
    if (!inputElement) return;
    if (typeof inputElement.showPicker === 'function') {
      inputElement.showPicker();
      return;
    }
    inputElement.focus();
    inputElement.click();
  };

  return (
    <div className="flex min-w-[220px] items-center gap-1">
      <Input
        ref={inputRef}
        className="h-7 min-w-0 flex-1 text-xs"
        type="date"
        aria-label={ariaLabel}
        value={value}
        onChange={(event) => onChange(normalizeDateInputValue(event.target.value))}
      />
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="h-7 w-7 shrink-0"
        onClick={openDatePicker}
        title="Open date picker"
      >
        <CalendarDays className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

export function CrewEditor({ crew, onChange, readOnly = false, requireDeleteConfirm = false }: CrewEditorProps) {
  const [draft, setDraft] = useState<Omit<ProductionCrewMember, 'id'>>(EMPTY_MEMBER);
  const [masterDialogOpen, setMasterDialogOpen] = useState(false);
  const [masterSearch, setMasterSearch] = useState('');
  const [masterContacts, setMasterContacts] = useState<CrewContact[]>(() => getCrewContacts());
  const [pendingDeleteMemberId, setPendingDeleteMemberId] = useState<string | null>(null);
  const [positionTemplates, setPositionTemplates] = useState<PositionTemplate[]>(() => getPositionTemplates());
  const [newTemplateLabel, setNewTemplateLabel] = useState('');
  const [newDepartmentName, setNewDepartmentName] = useState('');
  const [departmentOrder, setDepartmentOrder] = useState<string[]>([DEFAULT_DEPARTMENT]);
  const [renameDepartmentDialog, setRenameDepartmentDialog] = useState<{
    open: boolean;
    currentName: string;
    nextName: string;
    error: string | null;
  }>({
    open: false,
    currentName: '',
    nextName: '',
    error: null,
  });
  /** Departments start collapsed; user expands one or more to view crew. */
  const [expandedDepartmentNames, setExpandedDepartmentNames] = useState<string[]>([]);
  const [memberSearchTerm, setMemberSearchTerm] = useState('');
  const [memberSortMode, setMemberSortMode] = useState<CrewSortMode>('manual');
  const [cardDensityMode, setCardDensityMode] = useState<CrewCardDensityMode>('compact');
  const [expandedMemberIds, setExpandedMemberIds] = useState<string[]>([]);
  const [draggingDepartmentName, setDraggingDepartmentName] = useState<string | null>(null);
  const [draggingMemberId, setDraggingMemberId] = useState<string | null>(null);
  const [draggingMemberSourceDepartment, setDraggingMemberSourceDepartment] = useState<string | null>(null);
  const [quickAddDraftByDepartment, setQuickAddDraftByDepartment] = useState<
    Record<string, { name: string; role: string }>
  >({});
  const [shiftDraftsByMemberId, setShiftDraftsByMemberId] = useState<
    Record<
      string,
      {
        date: string;
        startTime: string;
        endTime: string;
        location: string;
        notes: string;
      }
    >
  >({});

  useEffect(() => {
    const refresh = () => setMasterContacts(getCrewContacts());
    window.addEventListener(CREW_CONTACTS_UPDATED_EVENT, refresh);
    return () => window.removeEventListener(CREW_CONTACTS_UPDATED_EVENT, refresh);
  }, []);

  useEffect(() => {
    const refresh = () => setPositionTemplates(getPositionTemplates());
    window.addEventListener(POSITION_TEMPLATES_UPDATED_EVENT, refresh);
    return () => window.removeEventListener(POSITION_TEMPLATES_UPDATED_EVENT, refresh);
  }, []);

  useEffect(() => {
    let hasChanged = false;
    const nextCrew = crew.map((member) => {
      const department = normalizeDepartment(member.department);
      const legacyParsed = parseLegacyContact(member.contact);
      const nextPhone = member.phone ?? legacyParsed.phone;
      const nextEmail = member.email ?? legacyParsed.email;
      if (department === member.department && nextPhone === member.phone && nextEmail === member.email) {
        return member;
      }
      hasChanged = true;
      return { ...member, department, phone: nextPhone, email: nextEmail };
    });
    if (hasChanged) onChange(nextCrew);
  }, [crew, onChange]);

  const orderedDepartments = useMemo(() => {
    const memberDepartments = Array.from(new Set(crew.map((member) => normalizeDepartment(member.department))));
    const merged = [...departmentOrder];
    for (const memberDepartment of memberDepartments) {
      if (!merged.includes(memberDepartment)) merged.push(memberDepartment);
    }
    return merged;
  }, [crew, departmentOrder]);

  useEffect(() => {
    const validNames = new Set(orderedDepartments);
    setExpandedDepartmentNames((previous) => previous.filter((name) => validNames.has(name)));
  }, [orderedDepartments]);

  useEffect(() => {
    const knownDepartments = new Set(departmentOrder);
    const nextDepartmentOrder = [...departmentOrder];
    for (const member of crew) {
      const memberDepartment = normalizeDepartment(member.department);
      if (!knownDepartments.has(memberDepartment)) {
        knownDepartments.add(memberDepartment);
        nextDepartmentOrder.push(memberDepartment);
      }
    }
    if (!knownDepartments.has(DEFAULT_DEPARTMENT)) nextDepartmentOrder.unshift(DEFAULT_DEPARTMENT);
    if (nextDepartmentOrder.join('||') !== departmentOrder.join('||')) setDepartmentOrder(nextDepartmentOrder);
  }, [crew, departmentOrder]);

  const filteredMasterContacts = useMemo(() => {
    const normalizedQuery = masterSearch.trim().toLowerCase();
    if (!normalizedQuery) return masterContacts.filter((contact) => contact.isActive);
    return masterContacts.filter((contact) => {
      const haystack = [contact.fullName, ...contact.roleTags, contact.phone ?? '', contact.email ?? ''].join(' ').toLowerCase();
      return contact.isActive && haystack.includes(normalizedQuery);
    });
  }, [masterContacts, masterSearch]);

  const masterContactByLowerName = useMemo(() => {
    const nextMap = new Map<string, CrewContact>();
    for (const contact of masterContacts) {
      const key = contact.fullName.trim().toLowerCase();
      if (!key) continue;
      if (!nextMap.has(key)) nextMap.set(key, contact);
    }
    return nextMap;
  }, [masterContacts]);

  const allMasterNameSuggestions = useMemo(() => {
    return Array.from(new Set(masterContacts.map((contact) => contact.fullName.trim()).filter(Boolean))).sort((a, b) =>
      a.localeCompare(b)
    );
  }, [masterContacts]);

  const applyMasterContactToMainDraft = (typedName: string) => {
    const matchedContact = masterContactByLowerName.get(typedName.trim().toLowerCase());
    if (!matchedContact) return;
    setDraft((current) => ({
      ...current,
      name: matchedContact.fullName,
      role: current.role || matchedContact.roleTags[0] || '',
      department: normalizeDepartment(current.department || matchedContact.functionalArea),
      phone: current.phone || normalizeUsPhoneForStorage(matchedContact.phone ?? '') || undefined,
      email: current.email || matchedContact.email || undefined,
      notes: current.notes || matchedContact.notes || undefined,
    }));
  };

  const getShiftDraft = (memberId: string) => shiftDraftsByMemberId[memberId] ?? EMPTY_SHIFT_DRAFT;

  const updateShiftDraft = (
    memberId: string,
    updates: Partial<{ date: string; startTime: string; endTime: string; location: string; notes: string }>
  ) => {
    setShiftDraftsByMemberId((previous) => ({ ...previous, [memberId]: { ...getShiftDraft(memberId), ...updates } }));
  };

  const updateMember = (id: string, updates: Partial<ProductionCrewMember>) => {
    onChange(crew.map((member) => (member.id === id ? { ...member, ...updates } : member)));
  };

  const removeMember = (id: string) => onChange(crew.filter((member) => member.id !== id));

  const runDeleteAction = (memberId: string) => {
    if (!requireDeleteConfirm) return removeMember(memberId);
    setPendingDeleteMemberId(memberId);
  };

  const addMember = () => {
    if (!draft.name?.trim()) return;
    const nextDepartment = normalizeDepartment(draft.department);
    onChange([
      ...crew,
      {
        ...draft,
        id: crypto.randomUUID(),
        name: draft.name.trim(),
        role: draft.role?.trim() || '',
        phone: normalizeUsPhoneForStorage(draft.phone ?? ''),
        email: draft.email?.trim() || undefined,
        department: nextDepartment,
      },
    ]);
    setExpandedDepartmentNames((previous) =>
      previous.includes(nextDepartment) ? previous : [...previous, nextDepartment]
    );
    setDraft(EMPTY_MEMBER);
  };

  const addMemberFromMaster = (contact: CrewContact) => {
    const alreadyAssigned = crew.some((member) => member.name.trim().toLowerCase() === contact.fullName.trim().toLowerCase());
    if (alreadyAssigned) return;
    const nextDepartment = normalizeDepartment(contact.functionalArea);
    onChange([
      ...crew,
      {
        id: crypto.randomUUID(),
        name: contact.fullName,
        role: contact.roleTags[0] ?? '',
        department: nextDepartment,
        contactId: contact.id,
        positionLabel: '',
        phone: normalizeUsPhoneForStorage(contact.phone ?? ''),
        email: contact.email,
        notes: contact.notes,
      },
    ]);
    setExpandedDepartmentNames((previous) =>
      previous.includes(nextDepartment) ? previous : [...previous, nextDepartment]
    );
  };

  const addShiftForMember = (memberId: string) => {
    const draftForMember = getShiftDraft(memberId);
    if (!draftForMember.date) return;
    const shift = {
      id: crypto.randomUUID(),
      date: draftForMember.date,
      startTime: draftForMember.startTime ? normalizeQuarterHourTime(draftForMember.startTime) : undefined,
      endTime: draftForMember.endTime ? normalizeQuarterHourTime(draftForMember.endTime) : undefined,
      location: draftForMember.location.trim() || undefined,
      notes: draftForMember.notes.trim() || undefined,
    };
    onChange(crew.map((member) => (member.id === memberId ? { ...member, shifts: [...(member.shifts ?? []), shift] } : member)));
    setShiftDraftsByMemberId((previous) => ({ ...previous, [memberId]: EMPTY_SHIFT_DRAFT }));
  };

  const updateShiftForMember = (memberId: string, shiftId: string, updates: Partial<{ date: string; startTime?: string; endTime?: string; location?: string; notes?: string }>) => {
    onChange(
      crew.map((member) =>
        member.id === memberId
          ? { ...member, shifts: (member.shifts ?? []).map((shift) => (shift.id === shiftId ? { ...shift, ...updates } : shift)) }
          : member
      )
    );
  };

  const removeShiftForMember = (memberId: string, shiftId: string) => {
    onChange(
      crew.map((member) =>
        member.id === memberId ? { ...member, shifts: (member.shifts ?? []).filter((shift) => shift.id !== shiftId) } : member
      )
    );
  };

  const applyPositionTemplateToMember = (memberId: string, positionTemplateId: string) => {
    const selectedTemplate = positionTemplates.find((template) => template.id === positionTemplateId);
    if (!selectedTemplate) return;
    onChange(
      crew.map((member) =>
        member.id === memberId
          ? {
              ...member,
              positionTemplateId: selectedTemplate.id,
              positionLabel: selectedTemplate.label,
              role: member.role || selectedTemplate.defaultRoleTag || '',
            }
          : member
      )
    );
  };

  const handleCreateTemplate = () => {
    const template = createPositionTemplate({ label: newTemplateLabel });
    if (!template) return;
    setNewTemplateLabel('');
  };

  const addDepartment = () => {
    const cleaned = newDepartmentName.trim();
    if (!cleaned) return;
    if (departmentOrder.some((name) => name.toLowerCase() === cleaned.toLowerCase())) {
      setNewDepartmentName('');
      return;
    }
    setDepartmentOrder((previous) => [...previous, cleaned]);
    setNewDepartmentName('');
  };

  const toggleDepartmentExpanded = (departmentName: string) => {
    setExpandedDepartmentNames((previous) =>
      previous.includes(departmentName)
        ? previous.filter((name) => name !== departmentName)
        : [...previous, departmentName]
    );
  };

  const renameDepartment = (departmentName: string, nextDepartmentNameRaw: string) => {
    const nextName = nextDepartmentNameRaw.trim();
    if (!nextName || nextName === departmentName) return { ok: true as const };
    if (orderedDepartments.some((name) => name.toLowerCase() === nextName.toLowerCase())) {
      return { ok: false as const, error: 'Department name already exists.' };
    }
    setDepartmentOrder((previous) => previous.map((name) => (name === departmentName ? nextName : name)));
    setExpandedDepartmentNames((previous) =>
      previous.map((name) => (name === departmentName ? nextName : name)),
    );
    onChange(
      crew.map((member) =>
        normalizeDepartment(member.department) === departmentName ? { ...member, department: nextName } : member
      )
    );
    return { ok: true as const };
  };

  const openRenameDepartmentDialog = (departmentName: string) => {
    setRenameDepartmentDialog({
      open: true,
      currentName: departmentName,
      nextName: departmentName,
      error: null,
    });
  };

  const submitRenameDepartmentDialog = () => {
    if (!renameDepartmentDialog.currentName) return;
    const result = renameDepartment(renameDepartmentDialog.currentName, renameDepartmentDialog.nextName);
    if (!result.ok) {
      setRenameDepartmentDialog((previous) => ({ ...previous, error: result.error }));
      return;
    }
    setRenameDepartmentDialog({
      open: false,
      currentName: '',
      nextName: '',
      error: null,
    });
  };

  const deleteDepartment = (departmentName: string) => {
    const hasMembers = crew.some((member) => normalizeDepartment(member.department) === departmentName);
    const fallbackDepartment = departmentName === DEFAULT_DEPARTMENT
      ? orderedDepartments.find((name) => name !== DEFAULT_DEPARTMENT) ?? DEFAULT_DEPARTMENT
      : DEFAULT_DEPARTMENT;
    if (departmentName === DEFAULT_DEPARTMENT && hasMembers && fallbackDepartment === DEFAULT_DEPARTMENT) return;
    const confirmMessage = hasMembers
      ? `Delete "${departmentName}" and move members to "${fallbackDepartment}"?`
      : `Delete "${departmentName}"?`;
    if (!window.confirm(confirmMessage)) return;
    setDepartmentOrder((previous) => previous.filter((name) => name !== departmentName));
    setExpandedDepartmentNames((previous) => previous.filter((name) => name !== departmentName));
    if (!hasMembers) return;
    onChange(
      crew.map((member) =>
        normalizeDepartment(member.department) === departmentName
          ? { ...member, department: fallbackDepartment }
          : member
      )
    );
  };

  const moveMemberWithinDepartment = (sourceMemberId: string, targetMemberId: string, departmentName: string) => {
    const departmentMembers = crew.filter((member) => normalizeDepartment(member.department) === departmentName);
    const sourceIndex = departmentMembers.findIndex((member) => member.id === sourceMemberId);
    const targetIndex = departmentMembers.findIndex((member) => member.id === targetMemberId);
    if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return;
    const reorderedDepartmentMembers = [...departmentMembers];
    const [moved] = reorderedDepartmentMembers.splice(sourceIndex, 1);
    reorderedDepartmentMembers.splice(targetIndex, 0, moved);
    const reorderedIds = reorderedDepartmentMembers.map((member) => member.id);
    let cursor = 0;
    onChange(
      crew.map((member) =>
        normalizeDepartment(member.department) === departmentName
          ? crew.find((candidate) => candidate.id === reorderedIds[cursor++]) || member
          : member
      )
    );
  };

  const moveMemberToDepartment = (memberId: string, nextDepartmentName: string) => {
    onChange(
      crew.map((member) =>
        member.id === memberId ? { ...member, department: normalizeDepartment(nextDepartmentName) } : member
      )
    );
    setExpandedDepartmentNames((previous) =>
      previous.includes(nextDepartmentName) ? previous : [...previous, nextDepartmentName]
    );
  };

  const toggleMemberExpanded = (memberId: string) => {
    setExpandedMemberIds((previous) =>
      previous.includes(memberId) ? previous.filter((id) => id !== memberId) : [...previous, memberId]
    );
  };

  const clearDraggingMemberState = () => {
    setDraggingMemberId(null);
    setDraggingMemberSourceDepartment(null);
  };

  const getQuickAddDraft = (departmentName: string) => {
    return quickAddDraftByDepartment[departmentName] ?? { name: '', role: '' };
  };

  const updateQuickAddDraft = (
    departmentName: string,
    updates: Partial<{ name: string; role: string }>
  ) => {
    const nextDraft = { ...getQuickAddDraft(departmentName), ...updates };
    if (Object.prototype.hasOwnProperty.call(updates, 'name')) {
      const matchedContact = masterContactByLowerName.get((updates.name ?? '').trim().toLowerCase());
      if (matchedContact) {
        nextDraft.name = matchedContact.fullName;
        if (!nextDraft.role.trim()) nextDraft.role = matchedContact.roleTags[0] ?? '';
      }
    }
    setQuickAddDraftByDepartment((previous) => ({
      ...previous,
      [departmentName]: nextDraft,
    }));
  };

  const addQuickMemberToDepartment = (departmentName: string) => {
    const draftForDepartment = getQuickAddDraft(departmentName);
    const nextName = draftForDepartment.name.trim();
    if (!nextName) return;
    onChange([
      ...crew,
      {
        ...EMPTY_MEMBER,
        id: crypto.randomUUID(),
        name: nextName,
        role: draftForDepartment.role.trim(),
        department: departmentName,
      },
    ]);
    updateQuickAddDraft(departmentName, { name: '', role: '' });
    setExpandedDepartmentNames((previous) =>
      previous.includes(departmentName) ? previous : [...previous, departmentName]
    );
  };

  const membersByDepartment = useMemo(() => {
    const grouped = new Map<string, ProductionCrewMember[]>();
    for (const departmentName of orderedDepartments) grouped.set(departmentName, []);
    for (const member of crew) {
      const departmentName = normalizeDepartment(member.department);
      const existing = grouped.get(departmentName) ?? [];
      existing.push(member);
      grouped.set(departmentName, existing);
    }
    if (memberSortMode === 'manual') return grouped;
    for (const [departmentName, departmentMembers] of grouped.entries()) {
      const sorted = [...departmentMembers];
      sorted.sort((left, right) => {
        if (memberSortMode === 'name_asc') return left.name.localeCompare(right.name);
        if (memberSortMode === 'name_desc') return right.name.localeCompare(left.name);
        if (memberSortMode === 'role_asc') return (left.role || '').localeCompare(right.role || '');
        return (right.role || '').localeCompare(left.role || '');
      });
      grouped.set(departmentName, sorted);
    }
    return grouped;
  }, [crew, orderedDepartments, memberSortMode]);

  const normalizedMemberSearchTerm = memberSearchTerm.trim().toLowerCase();

  const visibleMembersByDepartment = useMemo(() => {
    if (!normalizedMemberSearchTerm) return membersByDepartment;
    const filtered = new Map<string, ProductionCrewMember[]>();
    for (const [departmentName, departmentMembers] of membersByDepartment.entries()) {
      const visibleMembers = departmentMembers.filter((member) =>
        [
          member.name,
          member.role ?? '',
          member.phone ?? '',
          member.email ?? '',
          member.notes ?? '',
          member.positionLabel ?? '',
        ]
          .join(' ')
          .toLowerCase()
          .includes(normalizedMemberSearchTerm)
      );
      if (visibleMembers.length > 0) filtered.set(departmentName, visibleMembers);
    }
    return filtered;
  }, [membersByDepartment, normalizedMemberSearchTerm]);

  const visibleDepartmentNames = useMemo(() => {
    if (!normalizedMemberSearchTerm) return orderedDepartments;
    return orderedDepartments.filter((departmentName) => (visibleMembersByDepartment.get(departmentName)?.length ?? 0) > 0);
  }, [orderedDepartments, normalizedMemberSearchTerm, visibleMembersByDepartment]);

  const expandAllSwitchId = useId();

  /** Trimmed keys so expanded state matches header labels even if legacy spacing differs. */
  const expandedDepartmentKeySet = useMemo(
    () => new Set(expandedDepartmentNames.map((name) => name.trim())),
    [expandedDepartmentNames],
  );

  const allDepartmentsExpanded =
    visibleDepartmentNames.length > 0 &&
    visibleDepartmentNames.every((name) => expandedDepartmentKeySet.has(name.trim()));

  const handleExpandAllDepartments = () => {
    setExpandedDepartmentNames([...visibleDepartmentNames]);
  };

  const handleCollapseAllDepartments = () => {
    setExpandedDepartmentNames([]);
  };

  if (crew.length === 0 && readOnly) return <p className="text-sm text-muted-foreground">No crew members assigned.</p>;

  return (
    <div className="space-y-3">
      {!readOnly && (
        <div className="rounded-md border bg-muted/20 p-2">
          <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
            <div className="flex gap-2">
              <Input
                placeholder="Add department"
                className="h-8 text-sm"
                value={newDepartmentName}
                onChange={(event) => setNewDepartmentName(event.target.value)}
                onKeyDown={(event) => event.key === 'Enter' && addDepartment()}
              />
              <Button variant="outline" size="sm" className="h-8" onClick={addDepartment}>Add</Button>
            </div>
            <Select value={memberSortMode} onValueChange={(value) => setMemberSortMode(value as CrewSortMode)}>
              <SelectTrigger className="h-8 w-full sm:w-[220px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="manual">Manual order</SelectItem>
                <SelectItem value="name_asc">Name A-Z</SelectItem>
                <SelectItem value="name_desc">Name Z-A</SelectItem>
                <SelectItem value="role_asc">Role A-Z</SelectItem>
                <SelectItem value="role_desc">Role Z-A</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Input
              placeholder="Search assigned crew by name, role, phone, email..."
              className="h-8 min-w-[min(100%,12rem)] flex-1 text-sm"
              value={memberSearchTerm}
              onChange={(event) => setMemberSearchTerm(event.target.value)}
            />
            <Select
              value={cardDensityMode}
              onValueChange={(value) => setCardDensityMode(value as CrewCardDensityMode)}
            >
              <SelectTrigger className="h-8 w-full min-w-[10rem] sm:w-[150px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="detailed">Detailed cards</SelectItem>
                <SelectItem value="compact">Compact cards</SelectItem>
              </SelectContent>
            </Select>
            <ListExpandAllSwitch
              className="sm:ml-auto"
              id={expandAllSwitchId}
              label="Expand all"
              allExpanded={allDepartmentsExpanded}
              onExpandAll={handleExpandAllDepartments}
              onCollapseAll={handleCollapseAllDepartments}
              disabled={visibleDepartmentNames.length === 0}
            />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md border border-border/80 bg-background/70 px-2 py-1.5">
            <span className="text-xs font-medium text-foreground/90">Legend:</span>
            <Badge className="border border-emerald-300 bg-emerald-100 text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-600/20 dark:text-emerald-200">
              Active
            </Badge>
            <Badge className="border border-slate-300 bg-slate-100 text-slate-800 dark:border-slate-500/40 dark:bg-slate-600/20 dark:text-slate-200">
              Inactive
            </Badge>
            <Badge className="border border-blue-300 bg-blue-100 text-blue-800 dark:border-blue-500/40 dark:bg-blue-600/20 dark:text-blue-200">
              Crew
            </Badge>
            <Badge className="border border-amber-300 bg-amber-100 text-amber-800 dark:border-amber-500/40 dark:bg-amber-600/20 dark:text-amber-200">
              Vendor
            </Badge>
            <Badge variant="outline" className="border-border/80 bg-background text-foreground">
              Local only
            </Badge>
          </div>
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
        {visibleDepartmentNames.map((departmentName) => {
          const departmentMembers = visibleMembersByDepartment.get(departmentName) ?? [];
          const totalDepartmentMembers = membersByDepartment.get(departmentName) ?? [];
          const isExpanded = expandedDepartmentKeySet.has(departmentName.trim());
          return (
            <div
              key={departmentName}
              className="rounded-lg border border-border/90 bg-card/95 p-2.5 shadow-md"
              style={{ borderLeftColor: getDepartmentAccentHex(departmentName), borderLeftWidth: '4px' }}
              draggable={!readOnly}
              onDragStart={() => setDraggingDepartmentName(departmentName)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => {
                if (!draggingDepartmentName || draggingDepartmentName === departmentName) return;
                const nextOrder = [...orderedDepartments];
                const sourceIndex = nextOrder.indexOf(draggingDepartmentName);
                const targetIndex = nextOrder.indexOf(departmentName);
                if (sourceIndex < 0 || targetIndex < 0) return;
                const [moved] = nextOrder.splice(sourceIndex, 1);
                nextOrder.splice(targetIndex, 0, moved);
                setDepartmentOrder(nextOrder);
                setDraggingDepartmentName(null);
              }}
            >
              <div className="mb-2 flex items-center gap-2 rounded-md border border-border/80 bg-muted/50 px-2 py-1.5">
                {!readOnly && <GripVertical className="h-4 w-4 text-muted-foreground" />}
                <Flag className="h-3.5 w-3.5" style={{ color: getDepartmentAccentHex(departmentName) }} />
                <button type="button" className="inline-flex items-center gap-1 text-sm font-semibold" onClick={() => toggleDepartmentExpanded(departmentName)}>
                  {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  {departmentName}
                </button>
                <span className="rounded bg-background/80 px-1.5 py-0.5 text-xs text-muted-foreground">
                  {normalizedMemberSearchTerm
                    ? `${departmentMembers.length} of ${totalDepartmentMembers.length} crew`
                    : `${departmentMembers.length} crew`}
                </span>
                {!readOnly && (
                  <div className="ml-auto">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button type="button" variant="ghost" size="icon" className="h-7 w-7" title="Department actions">
                          <MoreHorizontal className="h-3.5 w-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onSelect={(event) => {
                            event.preventDefault();
                            openRenameDepartmentDialog(departmentName);
                          }}
                        >
                          Rename department
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onSelect={(event) => {
                            event.preventDefault();
                            deleteDepartment(departmentName);
                          }}
                        >
                          Delete department
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                )}
              </div>
              {isExpanded && (
                <div
                  className="space-y-2"
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => {
                    if (!draggingMemberId) return;
                    if (draggingMemberSourceDepartment === departmentName) {
                      clearDraggingMemberState();
                      return;
                    }
                    moveMemberToDepartment(draggingMemberId, departmentName);
                    clearDraggingMemberState();
                  }}
                >
                  {!readOnly ? (
                    <div className="grid grid-cols-[1fr_1fr_auto] gap-1.5 rounded-md border border-dashed border-border/90 bg-muted/30 px-2 py-1.5">
                    <Input
                      placeholder={`Quick add name in ${departmentName}`}
                      className="h-7 text-sm"
                      list="crew-editor-master-name-suggestions"
                      value={getQuickAddDraft(departmentName).name}
                      onChange={(event) => updateQuickAddDraft(departmentName, { name: event.target.value })}
                      onKeyDown={(event) => {
                        if (event.key !== 'Enter') return;
                        event.preventDefault();
                        addQuickMemberToDepartment(departmentName);
                      }}
                    />
                    <Input
                      placeholder="Role"
                      className="h-7 text-sm"
                      value={getQuickAddDraft(departmentName).role}
                      onChange={(event) => updateQuickAddDraft(departmentName, { role: event.target.value })}
                      onKeyDown={(event) => {
                        if (event.key !== 'Enter') return;
                        event.preventDefault();
                        addQuickMemberToDepartment(departmentName);
                      }}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7"
                      onClick={() => addQuickMemberToDepartment(departmentName)}
                    >
                      Add
                    </Button>
                  </div>
                  ) : null}
                  {departmentMembers.map((member) => {
                    const matchedMasterContact = member.contactId
                      ? masterContacts.find((contact) => contact.id === member.contactId)
                      : masterContactByLowerName.get(member.name.trim().toLowerCase());
                    return (
                    <div
                      key={member.id}
                      className="flex items-start gap-2 rounded-md border border-border bg-background px-2 py-1.5 shadow-sm"
                      draggable={!readOnly && memberSortMode === 'manual'}
                      onDragStart={() => {
                        setDraggingMemberId(member.id);
                        setDraggingMemberSourceDepartment(departmentName);
                      }}
                      onDragEnd={clearDraggingMemberState}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={() => {
                        if (!draggingMemberId || draggingMemberId === member.id || memberSortMode !== 'manual') return;
                        if (draggingMemberSourceDepartment && draggingMemberSourceDepartment !== departmentName) {
                          moveMemberToDepartment(draggingMemberId, departmentName);
                          clearDraggingMemberState();
                          return;
                        }
                        moveMemberWithinDepartment(draggingMemberId, member.id, departmentName);
                        clearDraggingMemberState();
                      }}
                      onDoubleClick={(event) => {
                        if (readOnly) return;
                        const targetElement = event.target as HTMLElement;
                        if (targetElement.closest('input,button,textarea,[role="button"],[data-radix-select-trigger]')) return;
                        toggleMemberExpanded(member.id);
                      }}
                      title="Double-click card body to toggle details"
                    >
                    <button
                      type="button"
                      className="mt-0.5 shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                      title="Double-click to expand full details"
                      aria-label={`Open details for ${member.name || 'crew member'}`}
                      onDoubleClick={(event) => {
                        event.stopPropagation();
                        event.preventDefault();
                        if (readOnly) return;
                        setExpandedMemberIds((previous) =>
                          previous.includes(member.id) ? previous : [...previous, member.id],
                        );
                      }}
                    >
                      <User className="h-4 w-4" aria-hidden />
                    </button>
                    <div className="min-w-0 flex-1 space-y-2">
                      {matchedMasterContact ? (
                        <div className="flex flex-wrap items-center gap-1">
                          <Badge
                            className={matchedMasterContact.isActive
                              ? 'border border-emerald-300 bg-emerald-100 text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-600/20 dark:text-emerald-200'
                              : 'border border-slate-300 bg-slate-100 text-slate-800 dark:border-slate-500/40 dark:bg-slate-600/20 dark:text-slate-200'}
                          >
                            {matchedMasterContact.isActive ? 'Active' : 'Inactive'}
                          </Badge>
                          <Badge
                            className={matchedMasterContact.contactType === 'vendor'
                              ? 'border border-amber-300 bg-amber-100 text-amber-800 dark:border-amber-500/40 dark:bg-amber-600/20 dark:text-amber-200'
                              : 'border border-blue-300 bg-blue-100 text-blue-800 dark:border-blue-500/40 dark:bg-blue-600/20 dark:text-blue-200'}
                          >
                            {matchedMasterContact.contactType === 'vendor' ? 'Vendor' : 'Crew'}
                          </Badge>
                        </div>
                      ) : (
                        <Badge variant="outline" className="text-xs">
                          Local only
                        </Badge>
                      )}
                      {readOnly ? (
                        <>
                          <p className="text-sm font-medium">{member.name}</p>
                          {member.role && <p className="text-xs text-muted-foreground">{member.role}</p>}
                          {member.positionLabel && <p className="text-xs text-muted-foreground">{member.positionLabel}</p>}
                          {(member.phone || member.email || member.contact) && (
                            <p className="text-xs text-muted-foreground">{[member.phone, member.email, member.contact].filter(Boolean).join(' · ')}</p>
                          )}
                        </>
                      ) : (
                        <>
                          {cardDensityMode === 'compact' ? (
                            <>
                              <div className="flex flex-col gap-1.5 sm:grid sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-center">
                                <Input
                                  placeholder="Name *"
                                  className="h-8 text-base sm:h-7 sm:text-sm"
                                  value={member.name}
                                  onChange={(event) => updateMember(member.id, { name: event.target.value })}
                                />
                                <div className="flex items-center gap-1.5 sm:contents">
                                  <Input
                                    placeholder="Role"
                                    className="h-8 min-w-0 flex-1 text-base sm:h-7 sm:text-sm"
                                    value={member.role}
                                    onChange={(event) => updateMember(member.id, { role: event.target.value })}
                                  />
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-8 shrink-0 px-3 sm:h-7 sm:px-2"
                                    onClick={() => toggleMemberExpanded(member.id)}
                                  >
                                    {expandedMemberIds.includes(member.id) ? 'Less' : 'Details'}
                                  </Button>
                                </div>
                              </div>
                              {expandedMemberIds.includes(member.id) ? (
                                <>
                                  <div className="grid grid-cols-2 gap-1.5 lg:grid-cols-3">
                                    <Input
                                      placeholder="Phone"
                                      className="h-7 text-sm"
                                      value={member.phone ?? ''}
                                      onChange={(event) => updateMember(member.id, { phone: event.target.value })}
                                      onBlur={(event) => updateMember(member.id, { phone: normalizeUsPhoneForStorage(event.target.value) || undefined })}
                                    />
                                    <Input
                                      placeholder="Email"
                                      className="h-7 text-sm"
                                      type="email"
                                      value={member.email ?? ''}
                                      onChange={(event) => updateMember(member.id, { email: event.target.value.trim() || undefined })}
                                    />
                                    <Select value={normalizeDepartment(member.department)} onValueChange={(value) => updateMember(member.id, { department: value })}>
                                      <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                                      <SelectContent>
                                        {orderedDepartments.map((name) => <SelectItem key={name} value={name}>{name}</SelectItem>)}
                                      </SelectContent>
                                    </Select>
                                    <Input placeholder="Position label" className="h-7 text-sm" value={member.positionLabel ?? ''} onChange={(event) => updateMember(member.id, { positionLabel: event.target.value })} />
                                    <Select
                                      value={member.positionTemplateId ?? 'none'}
                                      onValueChange={(value) => {
                                        if (value === 'none') return updateMember(member.id, { positionTemplateId: undefined });
                                        applyPositionTemplateToMember(member.id, value);
                                      }}
                                    >
                                      <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="none">No template</SelectItem>
                                        {positionTemplates.map((template) => <SelectItem key={template.id} value={template.id}>{template.label}</SelectItem>)}
                                      </SelectContent>
                                    </Select>
                                    <Input
                                      placeholder="Notes"
                                      className="h-7 text-sm lg:col-span-3"
                                      value={member.notes ?? ''}
                                      onChange={(event) => updateMember(member.id, { notes: event.target.value })}
                                    />
                                  </div>
                                  <OptionalFormCollapsible title="Assignment shifts">
                                    <div className="space-y-2">
                                      <p className="text-[11px] text-muted-foreground">
                                        Shift fields are <span className="font-medium text-foreground">Date</span>,
                                        <span className="font-medium text-foreground"> Start</span>,
                                        <span className="font-medium text-foreground"> End</span>, and
                                        <span className="font-medium text-foreground"> Location</span>.
                                      </p>
                                      {(member.shifts ?? []).map((shift) => (
                                        <div key={shift.id} className="grid grid-cols-1 gap-1 rounded border p-1.5 sm:grid-cols-2 xl:grid-cols-[minmax(220px,1.8fr)_minmax(88px,1fr)_minmax(88px,1fr)_minmax(110px,1fr)_auto]">
                                          <ShiftDateField
                                            ariaLabel="Shift date"
                                            value={shift.date}
                                            onChange={(nextValue) => updateShiftForMember(member.id, shift.id, { date: nextValue })}
                                          />
                                          <TimeInput
                                            className="h-7 text-xs"
                                            aria-label="Start time"
                                            value={shift.startTime ?? ''}
                                            onChange={(event) => updateShiftForMember(member.id, shift.id, { startTime: event.target.value || undefined })}
                                            onBlurCommit={(value) => updateShiftForMember(member.id, shift.id, { startTime: value })}
                                          />
                                          <TimeInput
                                            className="h-7 text-xs"
                                            aria-label="End time"
                                            value={shift.endTime ?? ''}
                                            onChange={(event) => updateShiftForMember(member.id, shift.id, { endTime: event.target.value || undefined })}
                                            onBlurCommit={(value) => updateShiftForMember(member.id, shift.id, { endTime: value })}
                                          />
                                          <Input className="h-7 text-xs" placeholder="Location" aria-label="Shift location" value={shift.location ?? ''} onChange={(event) => updateShiftForMember(member.id, shift.id, { location: event.target.value || undefined })} />
                                          <div className="flex items-center justify-end">
                                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeShiftForMember(member.id, shift.id)}>
                                              <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                            </Button>
                                          </div>
                                          <Input className="col-span-full h-7 text-xs" placeholder="Shift notes" value={shift.notes ?? ''} onChange={(event) => updateShiftForMember(member.id, shift.id, { notes: event.target.value || undefined })} />
                                        </div>
                                      ))}
                                      <div className="grid grid-cols-1 gap-1 rounded border border-dashed p-1.5 sm:grid-cols-2 xl:grid-cols-[minmax(220px,1.8fr)_minmax(88px,1fr)_minmax(88px,1fr)_minmax(110px,1fr)_auto]">
                                        <ShiftDateField
                                          ariaLabel="New shift date"
                                          value={getShiftDraft(member.id).date}
                                          onChange={(nextValue) => updateShiftDraft(member.id, { date: nextValue })}
                                        />
                                        <TimeInput
                                          className="h-7 text-xs"
                                          aria-label="New shift start time"
                                          value={getShiftDraft(member.id).startTime}
                                          onChange={(event) => updateShiftDraft(member.id, { startTime: event.target.value })}
                                          onBlurCommit={(value) => updateShiftDraft(member.id, { startTime: value ?? '' })}
                                        />
                                        <TimeInput
                                          className="h-7 text-xs"
                                          aria-label="New shift end time"
                                          value={getShiftDraft(member.id).endTime}
                                          onChange={(event) => updateShiftDraft(member.id, { endTime: event.target.value })}
                                          onBlurCommit={(value) => updateShiftDraft(member.id, { endTime: value ?? '' })}
                                        />
                                        <Input className="h-7 text-xs" placeholder="Location" aria-label="New shift location" value={getShiftDraft(member.id).location} onChange={(event) => updateShiftDraft(member.id, { location: event.target.value })} />
                                        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => addShiftForMember(member.id)} disabled={!getShiftDraft(member.id).date}>Add shift row</Button>
                                        <Input className="col-span-full h-7 text-xs" placeholder="Shift notes" value={getShiftDraft(member.id).notes} onChange={(event) => updateShiftDraft(member.id, { notes: event.target.value })} />
                                      </div>
                                    </div>
                                  </OptionalFormCollapsible>
                                </>
                              ) : null}
                            </>
                          ) : (
                            <>
                              <div className="grid grid-cols-2 gap-1.5 lg:grid-cols-3">
                                <Input placeholder="Name *" className="h-7 text-sm" value={member.name} onChange={(event) => updateMember(member.id, { name: event.target.value })} />
                                <Input placeholder="Role" className="h-7 text-sm" value={member.role} onChange={(event) => updateMember(member.id, { role: event.target.value })} />
                                <Input
                                  placeholder="Phone"
                                  className="h-7 text-sm"
                                  value={member.phone ?? ''}
                                  onChange={(event) => updateMember(member.id, { phone: event.target.value })}
                                  onBlur={(event) => updateMember(member.id, { phone: normalizeUsPhoneForStorage(event.target.value) || undefined })}
                                />
                                <Input
                                  placeholder="Email"
                                  className="h-7 text-sm"
                                  type="email"
                                  value={member.email ?? ''}
                                  onChange={(event) => updateMember(member.id, { email: event.target.value.trim() || undefined })}
                                />
                                <Select value={normalizeDepartment(member.department)} onValueChange={(value) => updateMember(member.id, { department: value })}>
                                  <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    {orderedDepartments.map((name) => <SelectItem key={name} value={name}>{name}</SelectItem>)}
                                  </SelectContent>
                                </Select>
                                <Input placeholder="Position label" className="h-7 text-sm" value={member.positionLabel ?? ''} onChange={(event) => updateMember(member.id, { positionLabel: event.target.value })} />
                                <Select
                                  value={member.positionTemplateId ?? 'none'}
                                  onValueChange={(value) => {
                                    if (value === 'none') return updateMember(member.id, { positionTemplateId: undefined });
                                    applyPositionTemplateToMember(member.id, value);
                                  }}
                                >
                                  <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="none">No template</SelectItem>
                                    {positionTemplates.map((template) => <SelectItem key={template.id} value={template.id}>{template.label}</SelectItem>)}
                                  </SelectContent>
                                </Select>
                                <Input
                                  placeholder="Notes"
                                  className="h-7 text-sm lg:col-span-3"
                                  value={member.notes ?? ''}
                                  onChange={(event) => updateMember(member.id, { notes: event.target.value })}
                                />
                              </div>
                              <OptionalFormCollapsible title="Assignment shifts">
                                <div className="space-y-2">
                                  <p className="text-[11px] text-muted-foreground">
                                    Shift fields are <span className="font-medium text-foreground">Date</span>,
                                    <span className="font-medium text-foreground"> Start</span>,
                                    <span className="font-medium text-foreground"> End</span>, and
                                    <span className="font-medium text-foreground"> Location</span>.
                                  </p>
                                  {(member.shifts ?? []).map((shift) => (
                                    <div key={shift.id} className="grid grid-cols-1 gap-1 rounded border p-1.5 sm:grid-cols-2 xl:grid-cols-[minmax(220px,1.8fr)_minmax(88px,1fr)_minmax(88px,1fr)_minmax(110px,1fr)_auto]">
                                      <ShiftDateField
                                        ariaLabel="Shift date"
                                        value={shift.date}
                                        onChange={(nextValue) => updateShiftForMember(member.id, shift.id, { date: nextValue })}
                                      />
                                      <TimeInput
                                        className="h-7 text-xs"
                                        aria-label="Start time"
                                        value={shift.startTime ?? ''}
                                        onChange={(event) => updateShiftForMember(member.id, shift.id, { startTime: event.target.value || undefined })}
                                        onBlurCommit={(value) => updateShiftForMember(member.id, shift.id, { startTime: value })}
                                      />
                                      <TimeInput
                                        className="h-7 text-xs"
                                        aria-label="End time"
                                        value={shift.endTime ?? ''}
                                        onChange={(event) => updateShiftForMember(member.id, shift.id, { endTime: event.target.value || undefined })}
                                        onBlurCommit={(value) => updateShiftForMember(member.id, shift.id, { endTime: value })}
                                      />
                                      <Input className="h-7 text-xs" placeholder="Location" aria-label="Shift location" value={shift.location ?? ''} onChange={(event) => updateShiftForMember(member.id, shift.id, { location: event.target.value || undefined })} />
                                      <div className="flex items-center justify-end">
                                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeShiftForMember(member.id, shift.id)}>
                                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                        </Button>
                                      </div>
                                      <Input className="col-span-full h-7 text-xs" placeholder="Shift notes" value={shift.notes ?? ''} onChange={(event) => updateShiftForMember(member.id, shift.id, { notes: event.target.value || undefined })} />
                                    </div>
                                  ))}
                                  <div className="grid grid-cols-1 gap-1 rounded border border-dashed p-1.5 sm:grid-cols-2 xl:grid-cols-[minmax(220px,1.8fr)_minmax(88px,1fr)_minmax(88px,1fr)_minmax(110px,1fr)_auto]">
                                    <ShiftDateField
                                      ariaLabel="New shift date"
                                      value={getShiftDraft(member.id).date}
                                      onChange={(nextValue) => updateShiftDraft(member.id, { date: nextValue })}
                                    />
                                    <TimeInput
                                      className="h-7 text-xs"
                                      aria-label="New shift start time"
                                      value={getShiftDraft(member.id).startTime}
                                      onChange={(event) => updateShiftDraft(member.id, { startTime: event.target.value })}
                                      onBlurCommit={(value) => updateShiftDraft(member.id, { startTime: value ?? '' })}
                                    />
                                    <TimeInput
                                      className="h-7 text-xs"
                                      aria-label="New shift end time"
                                      value={getShiftDraft(member.id).endTime}
                                      onChange={(event) => updateShiftDraft(member.id, { endTime: event.target.value })}
                                      onBlurCommit={(value) => updateShiftDraft(member.id, { endTime: value ?? '' })}
                                    />
                                    <Input className="h-7 text-xs" placeholder="Location" aria-label="New shift location" value={getShiftDraft(member.id).location} onChange={(event) => updateShiftDraft(member.id, { location: event.target.value })} />
                                    <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => addShiftForMember(member.id)} disabled={!getShiftDraft(member.id).date}>Add shift row</Button>
                                    <Input className="col-span-full h-7 text-xs" placeholder="Shift notes" value={getShiftDraft(member.id).notes} onChange={(event) => updateShiftDraft(member.id, { notes: event.target.value })} />
                                  </div>
                                </div>
                              </OptionalFormCollapsible>
                            </>
                          )}
                        </>
                      )}
                    </div>
                    {!readOnly && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" title="Crew member actions">
                            <MoreHorizontal className="h-3.5 w-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onSelect={(event) => {
                              event.preventDefault();
                              runDeleteAction(member.id);
                            }}
                          >
                            Remove crew member
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                    </div>
                    );
                  })}
                  {departmentMembers.length === 0 && <p className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">No crew in this department.</p>}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {!readOnly && normalizedMemberSearchTerm && visibleDepartmentNames.length === 0 ? (
        <p className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
          No assigned crew members match your search.
        </p>
      ) : null}

      {!readOnly && (
        <OptionalFormCollapsible title="Add crew member">
          <div className="space-y-2">
          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" size="sm" className="h-7 gap-1" onClick={() => setMasterDialogOpen(true)}>
              <Database className="h-3.5 w-3.5" />
              Add from master DB
            </Button>
          </div>
          <div className="mb-2 flex items-center gap-2">
            <Input placeholder="New position template label" className="h-7 text-sm" value={newTemplateLabel} onChange={(event) => setNewTemplateLabel(event.target.value)} />
            <Button variant="outline" size="sm" className="h-7" onClick={handleCreateTemplate}>Save template</Button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <datalist id="crew-editor-master-name-suggestions">
              {allMasterNameSuggestions.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
            <Input
              placeholder="Name *"
              className="h-7 text-sm"
              list="crew-editor-master-name-suggestions"
              value={draft.name}
              onChange={(event) => {
                const nextName = event.target.value;
                setDraft((current) => ({ ...current, name: nextName }));
                applyMasterContactToMainDraft(nextName);
              }}
              onBlur={(event) => applyMasterContactToMainDraft(event.target.value)}
              onKeyDown={(event) => event.key === 'Enter' && addMember()}
            />
            <Input placeholder="Role" className="h-7 text-sm" value={draft.role} onChange={(event) => setDraft((current) => ({ ...current, role: event.target.value }))} onKeyDown={(event) => event.key === 'Enter' && addMember()} />
            <Input placeholder="Phone" className="h-7 text-sm" value={draft.phone ?? ''} onChange={(event) => setDraft((current) => ({ ...current, phone: event.target.value }))} onBlur={(event) => setDraft((current) => ({ ...current, phone: normalizeUsPhoneForStorage(event.target.value) || undefined }))} />
            <Input placeholder="Email" type="email" className="h-7 text-sm" value={draft.email ?? ''} onChange={(event) => setDraft((current) => ({ ...current, email: event.target.value }))} />
            <Select value={normalizeDepartment(draft.department)} onValueChange={(value) => setDraft((current) => ({ ...current, department: value }))}>
              <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {orderedDepartments.map((name) => <SelectItem key={name} value={name}>{name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input placeholder="Position label" className="h-7 text-sm" value={draft.positionLabel ?? ''} onChange={(event) => setDraft((current) => ({ ...current, positionLabel: event.target.value }))} />
            <Select
              value={draft.positionTemplateId ?? 'none'}
              onValueChange={(value) => {
                if (value === 'none') return setDraft((current) => ({ ...current, positionTemplateId: undefined }));
                const selectedTemplate = positionTemplates.find((template) => template.id === value);
                if (!selectedTemplate) return;
                setDraft((current) => ({
                  ...current,
                  positionTemplateId: selectedTemplate.id,
                  positionLabel: selectedTemplate.label,
                  role: current.role || selectedTemplate.defaultRoleTag || '',
                }));
              }}
            >
              <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No template</SelectItem>
                {positionTemplates.map((template) => <SelectItem key={template.id} value={template.id}>{template.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input placeholder="Notes" className="h-7 text-sm" value={draft.notes ?? ''} onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))} />
          </div>
          <Button variant="outline" size="sm" className="mt-2 h-7 gap-1" onClick={addMember}>
            <Plus className="h-3.5 w-3.5" />
            Add
          </Button>
          </div>
        </OptionalFormCollapsible>
      )}

      <Dialog open={masterDialogOpen} onOpenChange={setMasterDialogOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader><DialogTitle>Master Crew Contacts</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Input placeholder="Search contacts..." value={masterSearch} onChange={(event) => setMasterSearch(event.target.value)} />
            <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
              {filteredMasterContacts.map((contact) => {
                const alreadyAssigned = crew.some((member) => member.name.trim().toLowerCase() === contact.fullName.trim().toLowerCase());
                return (
                  <button
                    key={contact.id}
                    type="button"
                    disabled={alreadyAssigned}
                    onClick={() => addMemberFromMaster(contact)}
                    className="flex w-full items-start justify-between rounded-md border px-3 py-2 text-left transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <div>
                      <p className="text-sm font-medium">{contact.fullName}</p>
                      <p className="text-xs text-muted-foreground">{[contact.functionalArea, contact.roleTags.join(', '), contact.phone, contact.email].filter(Boolean).join(' · ')}</p>
                    </div>
                    <span className="text-xs text-muted-foreground">{alreadyAssigned ? 'Assigned' : 'Add'}</span>
                  </button>
                );
              })}
              {filteredMasterContacts.length === 0 && <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">No active contacts match your search.</p>}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={renameDepartmentDialog.open}
        onOpenChange={(open) => {
          if (open) return;
          setRenameDepartmentDialog({
            open: false,
            currentName: '',
            nextName: '',
            error: null,
          });
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Rename department</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              value={renameDepartmentDialog.nextName}
              onChange={(event) =>
                setRenameDepartmentDialog((previous) => ({
                  ...previous,
                  nextName: event.target.value,
                  error: null,
                }))
              }
              onKeyDown={(event) => {
                if (event.key !== 'Enter') return;
                event.preventDefault();
                submitRenameDepartmentDialog();
              }}
              autoFocus
            />
            {renameDepartmentDialog.error ? (
              <p className="text-xs font-medium text-destructive">{renameDepartmentDialog.error}</p>
            ) : null}
            <div className="flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  setRenameDepartmentDialog({
                    open: false,
                    currentName: '',
                    nextName: '',
                    error: null,
                  })
                }
              >
                Cancel
              </Button>
              <Button type="button" onClick={submitRenameDepartmentDialog}>
                Save
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(pendingDeleteMemberId)} onOpenChange={(open) => !open && setPendingDeleteMemberId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove crew member?</AlertDialogTitle>
            <AlertDialogDescription>This removes the crew member from this production.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel type="button">Cancel</AlertDialogCancel>
            <AlertDialogAction
              type="button"
              onClick={() => {
                if (!pendingDeleteMemberId) return;
                removeMember(pendingDeleteMemberId);
                setPendingDeleteMemberId(null);
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
