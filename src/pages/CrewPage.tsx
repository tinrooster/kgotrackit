import { useEffect, useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, Users, Truck, PackageSearch } from 'lucide-react';
import { CrewContact, CrewContactDraft } from '@/types/crewContacts';
import {
  CREW_CONTACTS_UPDATED_EVENT,
  createCrewContact,
  getCrewContacts,
  removeCrewContact,
  updateCrewContact,
} from '@/lib/crewContactsService';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { getItems } from '@/lib/storageService';
import { InventoryItem } from '@/types/inventory';
import { Checkbox } from '@/components/ui/checkbox';

const EMPTY_DRAFT: CrewContactDraft = {
  fullName: '',
  roleTags: '',
  defaultEquipmentItemIds: [],
  preferredVehicle: '',
  vehicleNotes: '',
  phone: '',
  email: '',
  notes: '',
  baseLocation: '',
  unionStatus: '',
  isActive: true,
};

export default function CrewPage() {
  const [contacts, setContacts] = useState<CrewContact[]>(() => getCrewContacts());
  const [searchTerm, setSearchTerm] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingContactId, setEditingContactId] = useState<string | null>(null);
  const [draft, setDraft] = useState<CrewContactDraft>(EMPTY_DRAFT);
  const [equipmentPickerOpen, setEquipmentPickerOpen] = useState(false);
  const [equipmentSearchTerm, setEquipmentSearchTerm] = useState('');
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>(() => getItems());

  useEffect(() => {
    const refresh = () => setContacts(getCrewContacts());
    window.addEventListener(CREW_CONTACTS_UPDATED_EVENT, refresh);
    return () => window.removeEventListener(CREW_CONTACTS_UPDATED_EVENT, refresh);
  }, []);

  useEffect(() => {
    setInventoryItems(getItems());
  }, []);

  const filteredContacts = useMemo(() => {
    const normalizedQuery = searchTerm.trim().toLowerCase();
    if (!normalizedQuery) {
      return contacts;
    }
    return contacts.filter((contact) => {
      const haystack = [
        contact.fullName,
        ...(contact.roleTags ?? []),
        contact.phone ?? '',
        contact.email ?? '',
        contact.baseLocation ?? '',
        contact.unionStatus ?? '',
        contact.notes ?? '',
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [contacts, searchTerm]);

  const openCreateDialog = () => {
    setEditingContactId(null);
    setDraft(EMPTY_DRAFT);
    setDialogOpen(true);
  };

  const openEditDialog = (contact: CrewContact) => {
    setEditingContactId(contact.id);
    setDraft({
      fullName: contact.fullName,
      roleTags: (contact.roleTags ?? []).join(', '),
      phone: contact.phone ?? '',
      email: contact.email ?? '',
      notes: contact.notes ?? '',
      defaultEquipmentItemIds: contact.defaultEquipmentItemIds ?? [],
      preferredVehicle: contact.preferredVehicle ?? '',
      vehicleNotes: contact.vehicleNotes ?? '',
      baseLocation: contact.baseLocation ?? '',
      unionStatus: contact.unionStatus ?? '',
      isActive: contact.isActive,
    });
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!draft.fullName.trim()) {
      return;
    }
    if (editingContactId) {
      updateCrewContact(editingContactId, draft);
    } else {
      createCrewContact(draft);
    }
    setDialogOpen(false);
  };

  const activeCount = contacts.filter((contact) => contact.isActive).length;
  const equipmentNameById = useMemo(
    () =>
      Object.fromEntries(
        inventoryItems.map((item) => [item.id, `${item.name}${item.location ? ` (${item.location})` : ''}`])
      ),
    [inventoryItems]
  );
  const filteredEquipmentItems = useMemo(() => {
    const normalizedQuery = equipmentSearchTerm.trim().toLowerCase();
    if (!normalizedQuery) return inventoryItems;
    return inventoryItems.filter((item) =>
      [item.name, item.location ?? '', item.category ?? '', item.project ?? '', item.notes ?? '']
        .join(' ')
        .toLowerCase()
        .includes(normalizedQuery)
    );
  }, [inventoryItems, equipmentSearchTerm]);

  const toggleDraftEquipmentItem = (itemId: string) => {
    setDraft((previous) => {
      const exists = previous.defaultEquipmentItemIds.includes(itemId);
      return {
        ...previous,
        defaultEquipmentItemIds: exists
          ? previous.defaultEquipmentItemIds.filter((id) => id !== itemId)
          : [...previous.defaultEquipmentItemIds, itemId],
      };
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Crew Directory</h1>
          <p className="text-sm text-muted-foreground">
            Shared workspace contact database for all productions.
          </p>
        </div>
        <Button onClick={openCreateDialog} className="gap-2">
          <Plus className="h-4 w-4" />
          Add Contact
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4" />
            Contacts
            <Badge variant="secondary">{contacts.length}</Badge>
            <Badge variant="outline">{activeCount} Active</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            placeholder="Search by name, role, location, contact..."
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />
          <div className="space-y-2">
            {filteredContacts.map((contact) => (
              <div key={contact.id} className="rounded-md border px-3 py-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-medium">{contact.fullName}</p>
                      <Badge variant={contact.isActive ? 'default' : 'outline'}>
                        {contact.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                      {(contact.roleTags ?? []).slice(0, 3).map((roleTag) => (
                        <Badge key={`${contact.id}-${roleTag}`} variant="secondary">
                          {roleTag}
                        </Badge>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {[contact.phone, contact.email, contact.baseLocation].filter(Boolean).join(' · ')}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-1">
                      {contact.preferredVehicle ? (
                        <Badge variant="outline" className="gap-1">
                          <Truck className="h-3 w-3" />
                          {contact.preferredVehicle}
                        </Badge>
                      ) : null}
                      {(contact.defaultEquipmentItemIds ?? []).slice(0, 3).map((itemId) => (
                        <Badge key={`${contact.id}-eq-${itemId}`} variant="outline">
                          {equipmentNameById[itemId] ?? 'Linked equipment'}
                        </Badge>
                      ))}
                      {(contact.defaultEquipmentItemIds?.length ?? 0) > 3 ? (
                        <Badge variant="outline">+{(contact.defaultEquipmentItemIds?.length ?? 0) - 3} more</Badge>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" onClick={() => openEditDialog(contact)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeCrewContact(contact.id)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
            {filteredContacts.length === 0 && (
              <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                No contacts match current filters.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{editingContactId ? 'Edit Crew Contact' : 'New Crew Contact'}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input
              placeholder="Full name *"
              value={draft.fullName}
              onChange={(event) => setDraft((prev) => ({ ...prev, fullName: event.target.value }))}
            />
            <Input
              placeholder="Roles (comma separated)"
              value={draft.roleTags}
              onChange={(event) => setDraft((prev) => ({ ...prev, roleTags: event.target.value }))}
            />
            <Input
              placeholder="Phone"
              value={draft.phone}
              onChange={(event) => setDraft((prev) => ({ ...prev, phone: event.target.value }))}
            />
            <Input
              placeholder="Email"
              value={draft.email}
              onChange={(event) => setDraft((prev) => ({ ...prev, email: event.target.value }))}
            />
            <Input
              placeholder="Base location"
              value={draft.baseLocation}
              onChange={(event) => setDraft((prev) => ({ ...prev, baseLocation: event.target.value }))}
            />
            <Input
              placeholder="Union / Status"
              value={draft.unionStatus}
              onChange={(event) => setDraft((prev) => ({ ...prev, unionStatus: event.target.value }))}
            />
            <Input
              placeholder="Preferred vehicle"
              value={draft.preferredVehicle}
              onChange={(event) => setDraft((prev) => ({ ...prev, preferredVehicle: event.target.value }))}
            />
            <Input
              placeholder="Vehicle notes"
              value={draft.vehicleNotes}
              onChange={(event) => setDraft((prev) => ({ ...prev, vehicleNotes: event.target.value }))}
            />
            <div className="sm:col-span-2">
              <Input
                placeholder="Notes"
                value={draft.notes}
                onChange={(event) => setDraft((prev) => ({ ...prev, notes: event.target.value }))}
              />
            </div>
            <div className="sm:col-span-2">
              <Button
                type="button"
                variant="outline"
                className="w-full justify-between"
                onClick={() => setEquipmentPickerOpen(true)}
              >
                <span className="inline-flex items-center gap-2">
                  <PackageSearch className="h-4 w-4" />
                  Default equipment loadout
                </span>
                <Badge variant="secondary">{draft.defaultEquipmentItemIds.length} selected</Badge>
              </Button>
              {draft.defaultEquipmentItemIds.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1">
                  {draft.defaultEquipmentItemIds.slice(0, 6).map((itemId) => (
                    <Badge key={`draft-eq-${itemId}`} variant="outline">
                      {equipmentNameById[itemId] ?? itemId}
                    </Badge>
                  ))}
                  {draft.defaultEquipmentItemIds.length > 6 ? (
                    <Badge variant="outline">+{draft.defaultEquipmentItemIds.length - 6} more</Badge>
                  ) : null}
                </div>
              ) : null}
            </div>
            <div className="flex items-center gap-2 sm:col-span-2">
              <Switch
                checked={draft.isActive}
                onCheckedChange={(checked) => setDraft((prev) => ({ ...prev, isActive: checked }))}
                id="crew-contact-active"
              />
              <Label htmlFor="crew-contact-active">Active and available</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave}>{editingContactId ? 'Save Changes' : 'Create Contact'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={equipmentPickerOpen} onOpenChange={setEquipmentPickerOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Select Default Equipment</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Input
              placeholder="Search equipment by name, location, category..."
              value={equipmentSearchTerm}
              onChange={(event) => setEquipmentSearchTerm(event.target.value)}
            />
            <div className="max-h-[440px] space-y-1 overflow-y-auto rounded-md border p-2">
              {filteredEquipmentItems.map((item) => {
                const isChecked = draft.defaultEquipmentItemIds.includes(item.id);
                return (
                  <label
                    key={item.id}
                    className="flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 hover:bg-accent"
                  >
                    <Checkbox
                      checked={isChecked}
                      onCheckedChange={() => toggleDraftEquipmentItem(item.id)}
                    />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{item.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {[item.location, item.category, item.project].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                  </label>
                );
              })}
              {filteredEquipmentItems.length === 0 ? (
                <p className="p-2 text-xs text-muted-foreground">No matching inventory items.</p>
              ) : null}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEquipmentPickerOpen(false)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
