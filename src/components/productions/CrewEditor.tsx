import { useState } from 'react';
import { Plus, Trash2, User } from 'lucide-react';
import { ProductionCrewMember } from '@/types/productions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface CrewEditorProps {
  crew: ProductionCrewMember[];
  onChange: (crew: ProductionCrewMember[]) => void;
  readOnly?: boolean;
}

const EMPTY_MEMBER: Omit<ProductionCrewMember, 'id'> = { name: '', role: '' };

export function CrewEditor({ crew, onChange, readOnly = false }: CrewEditorProps) {
  const [draft, setDraft] = useState<Omit<ProductionCrewMember, 'id'>>(EMPTY_MEMBER);

  const updateMember = (id: string, updates: Partial<ProductionCrewMember>) => {
    onChange(crew.map((m) => (m.id === id ? { ...m, ...updates } : m)));
  };

  const removeMember = (id: string) => {
    onChange(crew.filter((m) => m.id !== id));
  };

  const addMember = () => {
    if (!draft.name.trim()) return;
    onChange([...crew, { ...draft, id: crypto.randomUUID(), name: draft.name.trim(), role: draft.role.trim() }]);
    setDraft(EMPTY_MEMBER);
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
              className="h-7 w-7 shrink-0"
              onClick={() => removeMember(member.id)}
            >
              <Trash2 className="h-3.5 w-3.5 text-destructive" />
            </Button>
          )}
        </div>
      ))}
      {!readOnly && (
        <div className="rounded-md border px-3 py-2">
          <p className="mb-2 text-xs font-medium text-muted-foreground">Add crew member</p>
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
    </div>
  );
}
