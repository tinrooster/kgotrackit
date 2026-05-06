import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, User, Database } from 'lucide-react';
import { ProductionCrewMember } from '@/types/productions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { getCrewContacts, CREW_CONTACTS_UPDATED_EVENT } from '@/lib/crewContactsService';
import { CrewContact } from '@/types/crewContacts';

interface CrewEditorProps {
  crew: ProductionCrewMember[];
  onChange: (crew: ProductionCrewMember[]) => void;
  readOnly?: boolean;
  requireDeleteConfirm?: boolean;
}

const EMPTY_MEMBER: Omit<ProductionCrewMember, 'id'> = { name: '', role: '', positionLabel: '' };

export function CrewEditor({ crew, onChange, readOnly = false, requireDeleteConfirm = false }: CrewEditorProps) {
  const [draft, setDraft] = useState<Omit<ProductionCrewMember, 'id'>>(EMPTY_MEMBER);
  const [masterDialogOpen, setMasterDialogOpen] = useState(false);
  const [masterSearch, setMasterSearch] = useState('');
  const [masterContacts, setMasterContacts] = useState<CrewContact[]>(() => getCrewContacts());
  const [pendingDeleteMemberId, setPendingDeleteMemberId] = useState<string | null>(null);

  useEffect(() => {
    const refresh = () => setMasterContacts(getCrewContacts());
    window.addEventListener(CREW_CONTACTS_UPDATED_EVENT, refresh);
    return () => window.removeEventListener(CREW_CONTACTS_UPDATED_EVENT, refresh);
  }, []);

  const filteredMasterContacts = useMemo(() => {
    const normalizedQuery = masterSearch.trim().toLowerCase();
    if (!normalizedQuery) {
      return masterContacts.filter((contact) => contact.isActive);
    }
    return masterContacts.filter((contact) => {
      const haystack = [contact.fullName, ...contact.roleTags, contact.phone ?? '', contact.email ?? '']
        .join(' ')
        .toLowerCase();
      return contact.isActive && haystack.includes(normalizedQuery);
    });
  }, [masterContacts, masterSearch]);

  const updateMember = (id: string, updates: Partial<ProductionCrewMember>) => {
    onChange(crew.map((m) => (m.id === id ? { ...m, ...updates } : m)));
  };

  const removeMember = (id: string) => {
    onChange(crew.filter((m) => m.id !== id));
  };

  const runDeleteAction = (memberId: string) => {
    if (!requireDeleteConfirm) {
      removeMember(memberId);
      return;
    }
    if (pendingDeleteMemberId === memberId) {
      removeMember(memberId);
      setPendingDeleteMemberId(null);
      return;
    }
    setPendingDeleteMemberId(memberId);
  };

  const addMember = () => {
    if (!draft.name.trim()) return;
    onChange([...crew, { ...draft, id: crypto.randomUUID(), name: draft.name.trim(), role: draft.role.trim() }]);
    setDraft(EMPTY_MEMBER);
  };

  const addMemberFromMaster = (contact: CrewContact) => {
    const alreadyAssigned = crew.some(
      (member) => member.name.trim().toLowerCase() === contact.fullName.trim().toLowerCase()
    );
    if (alreadyAssigned) return;
    onChange([
      ...crew,
      {
        id: crypto.randomUUID(),
        name: contact.fullName,
        role: contact.roleTags[0] ?? '',
        contactId: contact.id,
        positionLabel: '',
        contact: [contact.phone, contact.email].filter(Boolean).join(' · ') || undefined,
        notes: contact.notes,
      },
    ]);
  };

  if (crew.length === 0 && readOnly) {
    return <p className="text-sm text-muted-foreground">No crew members assigned.</p>;
  }

  return (
    <div className="space-y-3">
      {crew.map((member) => (
        <div key={member.id} className="flex items-start gap-2 rounded-md border px-3 py-2">
          <User className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1 space-y-1">
            {readOnly ? (
              <>
                <p className="text-sm font-medium">{member.name}</p>
                {member.role && <p className="text-xs text-muted-foreground">{member.role}</p>}
                {member.positionLabel && <p className="text-xs text-muted-foreground">{member.positionLabel}</p>}
                {member.contact && <p className="text-xs text-muted-foreground">{member.contact}</p>}
                {member.notes && <p className="text-xs text-muted-foreground italic">{member.notes}</p>}
              </>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <Input
                  placeholder="Name *"
                  className="h-7 text-sm"
                  value={member.name}
                  onChange={(e) => updateMember(member.id, { name: e.target.value })}
                />
                <Input
                  placeholder="Role"
                  className="h-7 text-sm"
                  value={member.role}
                  onChange={(e) => updateMember(member.id, { role: e.target.value })}
                />
                <Input
                  placeholder="Contact (phone / email)"
                  className="h-7 text-sm"
                  value={member.contact ?? ''}
                  onChange={(e) => updateMember(member.id, { contact: e.target.value })}
                />
                <Input
                  placeholder="Position label"
                  className="h-7 text-sm"
                  value={member.positionLabel ?? ''}
                  onChange={(e) => updateMember(member.id, { positionLabel: e.target.value })}
                />
                <Input
                  placeholder="Notes"
                  className="h-7 text-sm"
                  value={member.notes ?? ''}
                  onChange={(e) => updateMember(member.id, { notes: e.target.value })}
                />
              </div>
            )}
          </div>
          {!readOnly && (
            <Button
              variant="ghost"
              size="icon"
              className={`h-8 w-8 shrink-0 border ${
                pendingDeleteMemberId === member.id
                  ? 'border-red-400/70 bg-red-500/20'
                  : 'border-red-500/40 bg-red-500/10 hover:bg-red-500/20'
              }`}
              onClick={() => runDeleteAction(member.id)}
              title={
                pendingDeleteMemberId === member.id
                  ? 'Click again to confirm remove'
                  : 'Remove crew member'
              }
            >
              <Trash2 className="h-3.5 w-3.5 text-red-300" />
            </Button>
          )}
        </div>
      ))}
      {!readOnly && (
        <div className="rounded-md border px-3 py-2">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-xs font-medium text-muted-foreground">Add crew member</p>
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1"
              onClick={() => setMasterDialogOpen(true)}
            >
              <Database className="h-3.5 w-3.5" />
              Add from master DB
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Input
              placeholder="Name *"
              className="h-7 text-sm"
              value={draft.name}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
              onKeyDown={(e) => e.key === 'Enter' && addMember()}
            />
            <Input
              placeholder="Role"
              className="h-7 text-sm"
              value={draft.role}
              onChange={(e) => setDraft((d) => ({ ...d, role: e.target.value }))}
              onKeyDown={(e) => e.key === 'Enter' && addMember()}
            />
            <Input
              placeholder="Contact (phone / email)"
              className="h-7 text-sm"
              value={draft.contact ?? ''}
              onChange={(e) => setDraft((d) => ({ ...d, contact: e.target.value }))}
            />
            <Input
              placeholder="Position label"
              className="h-7 text-sm"
              value={draft.positionLabel ?? ''}
              onChange={(e) => setDraft((d) => ({ ...d, positionLabel: e.target.value }))}
            />
            <Input
              placeholder="Notes"
              className="h-7 text-sm"
              value={draft.notes ?? ''}
              onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
            />
          </div>
          <Button variant="outline" size="sm" className="mt-2 h-7 gap-1" onClick={addMember}>
            <Plus className="h-3.5 w-3.5" />
            Add
          </Button>
        </div>
      )}
      <Dialog open={masterDialogOpen} onOpenChange={setMasterDialogOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Master Crew Contacts</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Input
              placeholder="Search contacts..."
              value={masterSearch}
              onChange={(event) => setMasterSearch(event.target.value)}
            />
            <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
              {filteredMasterContacts.map((contact) => {
                const alreadyAssigned = crew.some(
                  (member) => member.name.trim().toLowerCase() === contact.fullName.trim().toLowerCase()
                );
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
                      <p className="text-xs text-muted-foreground">
                        {[contact.roleTags.join(', '), contact.phone, contact.email].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {alreadyAssigned ? 'Assigned' : 'Add'}
                    </span>
                  </button>
                );
              })}
              {filteredMasterContacts.length === 0 && (
                <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                  No active contacts match your search.
                </p>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
