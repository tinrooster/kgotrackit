import { useEffect, useMemo, useState } from 'react';
import { MoreHorizontal, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DraggableDialogContent } from '@/components/ui/draggable-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import {
  pullOrganizationAppData,
  pushOrganizationSnapshot,
  type OrganizationSnapshotPayload,
} from '@/lib/supabase/organizationData';
import {
  CREW_CONTACTS_UPDATED_EVENT,
  getCrewContacts,
} from '@/lib/crewContactsService';
import { canonicalNameKey, parseContactDisplayName } from '@/lib/contactName';

interface DirectoryContactEntry {
  id: string;
  fullName: string;
  phone?: string;
  email?: string;
  extension?: string;
  department?: string;
  jobTitle?: string;
  functionalArea?: string;
  sourceFile?: string;
  sourceSheet?: string;
  notes?: string;
  updatedAt?: string;
}

interface OrganizationDirectoryContactsSectionProps {
  organizationId: string | null;
  authBackend: string;
  canEdit: boolean;
}

const EMPTY_ENTRY: Omit<DirectoryContactEntry, 'id'> = {
  fullName: '',
  phone: '',
  email: '',
  extension: '',
  department: '',
  jobTitle: '',
  functionalArea: '',
  sourceFile: '',
  sourceSheet: '',
  notes: '',
};

const normalizePhoneToStandardFormat = (value: string): string => {
  const trimmedValue = value.trim();
  if (!trimmedValue) return '';
  const digits = trimmedValue.replace(/\D/g, '');
  if (digits.length !== 10) return trimmedValue;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
};

const isStandardPhoneFormat = (value: string): boolean =>
  /^\(\d{3}\)\s\d{3}-\d{4}$/.test(value.trim());

export function OrganizationDirectoryContactsSection({
  organizationId,
  authBackend,
  canEdit,
}: OrganizationDirectoryContactsSectionProps) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [contacts, setContacts] = useState<DirectoryContactEntry[]>([]);
  const [draft, setDraft] = useState<Omit<DirectoryContactEntry, 'id'>>(EMPTY_ENTRY);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [masterNameKeys, setMasterNameKeys] = useState<Set<string>>(new Set());

  const loadDirectoryContacts = async (): Promise<void> => {
    if (authBackend !== 'supabase' || !organizationId) {
      setContacts([]);
      return;
    }
    setLoading(true);
    try {
      const row = await pullOrganizationAppData(organizationId);
      const branding =
        row?.branding && typeof row.branding === 'object' && !Array.isArray(row.branding)
          ? (row.branding as Record<string, unknown>)
          : {};
      const raw = Array.isArray(branding.directoryContacts)
        ? (branding.directoryContacts as Array<Record<string, unknown>>)
        : [];
      const normalized = raw
        .map((entry) => ({
          id: typeof entry.id === 'string' ? entry.id : crypto.randomUUID(),
          fullName:
            typeof entry.fullName === 'string' ? parseContactDisplayName(entry.fullName) : '',
          phone:
            typeof entry.phone === 'string'
              ? normalizePhoneToStandardFormat(entry.phone)
              : undefined,
          email: typeof entry.email === 'string' ? entry.email : undefined,
          extension: typeof entry.extension === 'string' ? entry.extension : undefined,
          department: typeof entry.department === 'string' ? entry.department : undefined,
          jobTitle: typeof entry.jobTitle === 'string' ? entry.jobTitle : undefined,
          functionalArea: typeof entry.functionalArea === 'string' ? entry.functionalArea : undefined,
          sourceFile: typeof entry.sourceFile === 'string' ? entry.sourceFile : undefined,
          sourceSheet: typeof entry.sourceSheet === 'string' ? entry.sourceSheet : undefined,
          notes: typeof entry.notes === 'string' ? entry.notes : undefined,
          updatedAt: typeof entry.updatedAt === 'string' ? entry.updatedAt : undefined,
        }))
        .filter((entry) => entry.fullName.trim().length > 0);
      setContacts(normalized);
    } catch (error) {
      toast.error('Could not load organization directory contacts.', {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadDirectoryContacts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, authBackend]);

  useEffect(() => {
    const refreshMasterNameKeys = (): void => {
      const keys = getCrewContacts()
        .map((contact) => canonicalNameKey(contact.fullName))
        .filter(Boolean);
      setMasterNameKeys(new Set(keys));
    };
    refreshMasterNameKeys();
    window.addEventListener(CREW_CONTACTS_UPDATED_EVENT, refreshMasterNameKeys);
    return () => window.removeEventListener(CREW_CONTACTS_UPDATED_EVENT, refreshMasterNameKeys);
  }, []);

  const filteredContacts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter((contact) =>
      [
        contact.fullName,
        contact.phone ?? '',
        contact.email ?? '',
        contact.extension ?? '',
        contact.department ?? '',
        contact.jobTitle ?? '',
        contact.functionalArea ?? '',
        contact.sourceSheet ?? '',
        contact.notes ?? '',
      ]
        .join(' ')
        .toLowerCase()
        .includes(q),
    );
  }, [contacts, search]);

  const directoryTally = useMemo(() => {
    const withPhone = contacts.filter((entry) => Boolean(entry.phone)).length;
    const withEmail = contacts.filter((entry) => Boolean(entry.email)).length;
    const withExtension = contacts.filter((entry) => Boolean(entry.extension)).length;
    return {
      total: contacts.length,
      filtered: filteredContacts.length,
      withPhone,
      withEmail,
      withExtension,
    };
  }, [contacts, filteredContacts]);

  const isValidEmail = (value: string): boolean =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

  const persistContacts = async (nextContacts: DirectoryContactEntry[]): Promise<void> => {
    if (!organizationId) return;
    setSaving(true);
    try {
      const currentRow = await pullOrganizationAppData(organizationId);
      const branding =
        currentRow?.branding && typeof currentRow.branding === 'object' && !Array.isArray(currentRow.branding)
          ? ({ ...currentRow.branding } as Record<string, unknown>)
          : {};
      branding.directoryContacts = nextContacts.map((entry) => ({
        ...entry,
        updatedAt: new Date().toISOString(),
      }));
      await pushOrganizationSnapshot(organizationId, {
        contacts: Array.isArray(currentRow?.contacts) ? currentRow.contacts : [],
        position_templates: Array.isArray(currentRow?.position_templates) ? currentRow.position_templates : [],
        inventory_baseline: Array.isArray(currentRow?.inventory_baseline) ? currentRow.inventory_baseline : [],
        role_tags: Array.isArray(currentRow?.role_tags) ? currentRow.role_tags : [],
        branding,
        maintenance_on_air_template: currentRow?.maintenance_on_air_template ?? null,
      } as OrganizationSnapshotPayload);
      setContacts(nextContacts);
      toast.success('Organization directory contacts updated.');
    } catch (error) {
      toast.error('Could not save organization directory contacts.', {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveDraft = async (): Promise<void> => {
    const fullName = parseContactDisplayName(draft.fullName);
    if (!fullName) {
      toast.error('Full name is required.');
      return;
    }
    const normalizedPhone = draft.phone?.trim() ? normalizePhoneToStandardFormat(draft.phone) : '';
    if (normalizedPhone && !isStandardPhoneFormat(normalizedPhone)) {
      toast.error('Phone number is invalid. Use format (xxx) xxx-xxxx.');
      return;
    }
    const normalizedEmail = draft.email?.trim() || '';
    if (normalizedEmail && !isValidEmail(normalizedEmail)) {
      toast.error('Email address is invalid.');
      return;
    }
    const base: DirectoryContactEntry = {
      id: editingId ?? crypto.randomUUID(),
      fullName,
      phone: normalizedPhone || undefined,
      email: normalizedEmail || undefined,
      extension: draft.extension?.trim() || undefined,
      department: draft.department?.trim() || undefined,
      jobTitle: draft.jobTitle?.trim() || undefined,
      functionalArea: draft.functionalArea?.trim() || undefined,
      sourceFile: draft.sourceFile?.trim() || undefined,
      sourceSheet: draft.sourceSheet?.trim() || undefined,
      notes: draft.notes?.trim() || undefined,
      updatedAt: new Date().toISOString(),
    };
    const next =
      editingId === null
        ? [...contacts, base]
        : contacts.map((entry) => (entry.id === editingId ? base : entry));
    await persistContacts(next);
    setEditingId(null);
    setDraft(EMPTY_ENTRY);
    setEditorOpen(false);
  };

  const handleEdit = (entry: DirectoryContactEntry): void => {
    setEditingId(entry.id);
    setDraft({
      fullName: entry.fullName,
      phone: entry.phone ?? '',
      email: entry.email ?? '',
      extension: entry.extension ?? '',
      department: entry.department ?? '',
      jobTitle: entry.jobTitle ?? '',
      functionalArea: entry.functionalArea ?? '',
      sourceFile: entry.sourceFile ?? '',
      sourceSheet: entry.sourceSheet ?? '',
      notes: entry.notes ?? '',
    });
    setEditorOpen(true);
  };

  const handleDelete = async (id: string): Promise<void> => {
    const shouldDelete = window.confirm('Delete this directory contact?');
    if (!shouldDelete) return;
    await persistContacts(contacts.filter((entry) => entry.id !== id));
  };

  const handleOpenAddDialog = (): void => {
    setEditingId(null);
    setDraft(EMPTY_ENTRY);
    setEditorOpen(true);
  };

  const copyDirectoryContactsToMasterCrew = (entries: DirectoryContactEntry[]): { added: number; updated: number } => {
    const existingMasterContacts = getCrewContacts();
    const masterByName = new Map(
      existingMasterContacts.map((contact) => [canonicalNameKey(contact.fullName), contact]),
    );
    const nextMasterContacts = [...existingMasterContacts];
    let added = 0;
    let updated = 0;

    for (const entry of entries) {
      const key = canonicalNameKey(entry.fullName);
      if (!key) continue;
      const existing = masterByName.get(key);
      if (!existing) {
        const nowIso = new Date().toISOString();
        nextMasterContacts.push({
          id: crypto.randomUUID(),
          fullName: entry.fullName,
          contactType: 'crew',
          roleTags: ['directory'],
          defaultEquipmentItemIds: [],
          organizationName: undefined,
          functionalArea: entry.department || entry.functionalArea,
          preferredVehicle: undefined,
          vehicleNotes: undefined,
          phone: entry.phone,
          email: entry.email,
          notes: [entry.jobTitle, entry.notes].filter(Boolean).join(' | ') || undefined,
          baseLocation: undefined,
          unionStatus: undefined,
          isActive: true,
          createdAt: nowIso,
          updatedAt: nowIso,
        });
        added += 1;
        continue;
      }
      const mergedRoleTags = Array.from(
        new Set([...(existing.roleTags ?? []), 'directory'].map((tag) => tag.trim()).filter(Boolean)),
      );
      const merged = {
        ...existing,
        phone: existing.phone || entry.phone,
        email: existing.email || entry.email,
        functionalArea: existing.functionalArea || entry.department || entry.functionalArea,
        notes: existing.notes || [entry.jobTitle, entry.notes].filter(Boolean).join(' | ') || undefined,
        roleTags: mergedRoleTags,
        updatedAt: new Date().toISOString(),
      };
      const hasChanged =
        merged.phone !== existing.phone ||
        merged.email !== existing.email ||
        merged.functionalArea !== existing.functionalArea ||
        merged.notes !== existing.notes ||
        merged.roleTags.join('|').toLowerCase() !== (existing.roleTags ?? []).join('|').toLowerCase();
      if (!hasChanged) continue;
      const index = nextMasterContacts.findIndex((contact) => contact.id === existing.id);
      if (index >= 0) {
        nextMasterContacts[index] = merged;
      } else {
        nextMasterContacts.push(merged);
      }
      updated += 1;
    }

    saveCrewContacts(nextMasterContacts);
    return { added, updated };
  };

  const handleCopyEntryToMasterCrew = (entry: DirectoryContactEntry): void => {
    const result = copyDirectoryContactsToMasterCrew([entry]);
    toast.success('Copied directory contact to Master Crew.', {
      description: `Added ${result.added}, updated ${result.updated}.`,
    });
  };

  const escapeCsvValue = (value: string): string => `"${value.replace(/"/g, '""')}"`;

  const downloadCsv = (fileName: string, rows: string[][]): void => {
    const csvText = rows.map((row) => row.map((value) => escapeCsvValue(value)).join(',')).join('\n');
    const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(objectUrl);
  };

  const handleExportDirectoryCsv = (): void => {
    const exportRows: string[][] = [
      ['Full Name', 'Phone', 'Email', 'Extension', 'Department', 'Job Title', 'Area', 'In Master Crew', 'Notes'],
      ...filteredContacts.map((entry) => [
        entry.fullName,
        entry.phone ?? '',
        entry.email ?? '',
        entry.extension ?? '',
        entry.department ?? '',
        entry.jobTitle ?? '',
        entry.functionalArea ?? '',
        masterNameKeys.has(canonicalNameKey(entry.fullName)) ? 'Yes' : 'No',
        entry.notes ?? '',
      ]),
    ];
    const timestamp = new Date().toISOString().slice(0, 10);
    downloadCsv(`organization-directory-${timestamp}.csv`, exportRows);
  };

  if (authBackend !== 'supabase') {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Organization Directory</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Organization directory contacts are available when using Supabase-backed organizations.
        </CardContent>
      </Card>
    );
  }

  if (!organizationId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Organization Directory</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Select an active organization to view and edit directory contacts.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>Organization Directory (non-production contacts)</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleExportDirectoryCsv}
              disabled={filteredContacts.length === 0}
            >
              Export filtered CSV
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleOpenAddDialog}
              disabled={!canEdit || saving}
            >
              <Plus className="mr-1 h-4 w-4" />
              Add Directory Contact
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search name, phone, email, area..."
          disabled={loading}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Badge className="bg-blue-600/20 text-blue-200 border border-blue-500/40">
            Total: {directoryTally.total}
          </Badge>
          <Badge className="bg-emerald-600/20 text-emerald-200 border border-emerald-500/40">
            Filtered: {directoryTally.filtered}
          </Badge>
          <Badge className="bg-cyan-600/20 text-cyan-200 border border-cyan-500/40">
            Phone: {directoryTally.withPhone}
          </Badge>
          <Badge className="bg-violet-600/20 text-violet-200 border border-violet-500/40">
            Email: {directoryTally.withEmail}
          </Badge>
          <Badge className="bg-amber-600/20 text-amber-200 border border-amber-500/40">
            Ext: {directoryTally.withExtension}
          </Badge>
        </div>
        <div className="max-h-80 space-y-2 overflow-y-auto rounded-md border p-2">
          {filteredContacts.map((entry) => (
            <div
              key={entry.id}
              className="rounded-md border px-3 py-2 text-sm"
              onDoubleClick={() => handleEdit(entry)}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-base font-semibold text-foreground">{entry.fullName}</p>
                  {entry.jobTitle ? (
                    <p className="mt-0.5 text-xs font-medium text-primary">{entry.jobTitle}</p>
                  ) : null}
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    {masterNameKeys.has(canonicalNameKey(entry.fullName)) ? (
                      <Badge className="text-[11px] bg-indigo-600/20 text-indigo-200 border border-indigo-500/40">
                        In Master Crew
                      </Badge>
                    ) : null}
                    {entry.phone ? (
                      <Badge className="font-mono text-[11px] bg-cyan-600/20 text-cyan-200 border border-cyan-500/40">
                        {entry.phone}
                      </Badge>
                    ) : null}
                    {entry.extension ? (
                      <Badge className="font-mono text-[11px] bg-amber-600/20 text-amber-200 border border-amber-500/40">
                        x{entry.extension}
                      </Badge>
                    ) : null}
                    {entry.email ? (
                      <Badge className="text-[11px] bg-violet-600/20 text-violet-200 border border-violet-500/40">
                        {entry.email}
                      </Badge>
                    ) : null}
                    {entry.functionalArea ? (
                      <Badge className="text-[11px] bg-emerald-600/20 text-emerald-200 border border-emerald-500/40">
                        {entry.functionalArea}
                      </Badge>
                    ) : null}
                    {entry.department ? (
                      <Badge className="text-[11px] bg-blue-600/20 text-blue-200 border border-blue-500/40">
                        Dept: {entry.department}
                      </Badge>
                    ) : null}
                  </div>
                  {entry.notes ? (
                    <p className="mt-1 text-xs text-muted-foreground">{entry.notes}</p>
                  ) : null}
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onSelect={() => handleCopyEntryToMasterCrew(entry)}
                      disabled={saving || masterNameKeys.has(canonicalNameKey(entry.fullName))}
                    >
                      {masterNameKeys.has(canonicalNameKey(entry.fullName))
                        ? 'Already in Master Crew'
                        : 'Copy to Master Crew'}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() => handleEdit(entry)}
                      disabled={!canEdit || saving}
                    >
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() => void handleDelete(entry.id)}
                      disabled={!canEdit || saving}
                    >
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          ))}
          {filteredContacts.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              {loading ? 'Loading contacts…' : 'No directory contacts found.'}
            </p>
          ) : null}
        </div>

      </CardContent>
      <Dialog
        open={editorOpen}
        onOpenChange={(nextOpen) => {
          setEditorOpen(nextOpen);
          if (!nextOpen) {
            setEditingId(null);
            setDraft(EMPTY_ENTRY);
          }
        }}
      >
        <DraggableDialogContent className="w-[min(calc(100vw-1rem),560px)]">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit directory contact' : 'Add directory contact'}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-2 py-2 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="org-directory-full-name">Full name</Label>
              <Input
                id="org-directory-full-name"
                value={draft.fullName}
                onChange={(event) => setDraft((prev) => ({ ...prev, fullName: event.target.value }))}
                disabled={!canEdit || saving}
              />
            </div>
            <div>
              <Label htmlFor="org-directory-phone">Phone</Label>
              <Input
                id="org-directory-phone"
                value={draft.phone ?? ''}
                onChange={(event) => setDraft((prev) => ({ ...prev, phone: event.target.value }))}
                disabled={!canEdit || saving}
              />
            </div>
            <div>
              <Label htmlFor="org-directory-extension">Extension</Label>
              <Input
                id="org-directory-extension"
                value={draft.extension ?? ''}
                onChange={(event) => setDraft((prev) => ({ ...prev, extension: event.target.value }))}
                disabled={!canEdit || saving}
              />
            </div>
            <div>
              <Label htmlFor="org-directory-email">Email</Label>
              <Input
                id="org-directory-email"
                value={draft.email ?? ''}
                onChange={(event) => setDraft((prev) => ({ ...prev, email: event.target.value }))}
                disabled={!canEdit || saving}
              />
            </div>
            <div>
              <Label htmlFor="org-directory-department">Dept</Label>
              <Input
                id="org-directory-department"
                value={draft.department ?? ''}
                onChange={(event) => setDraft((prev) => ({ ...prev, department: event.target.value }))}
                disabled={!canEdit || saving}
              />
            </div>
            <div>
              <Label htmlFor="org-directory-area">Area</Label>
              <Input
                id="org-directory-area"
                value={draft.functionalArea ?? ''}
                onChange={(event) => setDraft((prev) => ({ ...prev, functionalArea: event.target.value }))}
                disabled={!canEdit || saving}
              />
            </div>
            <div>
              <Label htmlFor="org-directory-job-title">Job title</Label>
              <Input
                id="org-directory-job-title"
                value={draft.jobTitle ?? ''}
                onChange={(event) => setDraft((prev) => ({ ...prev, jobTitle: event.target.value }))}
                disabled={!canEdit || saving}
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="org-directory-notes">Notes</Label>
              <Input
                id="org-directory-notes"
                value={draft.notes ?? ''}
                onChange={(event) => setDraft((prev) => ({ ...prev, notes: event.target.value }))}
                disabled={!canEdit || saving}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setEditorOpen(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void handleSaveDraft()}
              disabled={!canEdit || saving}
            >
              {saving ? 'Saving…' : editingId ? 'Save changes' : 'Add contact'}
            </Button>
          </DialogFooter>
        </DraggableDialogContent>
      </Dialog>
    </Card>
  );
}
