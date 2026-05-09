import { useEffect, useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, Users, Truck, PackageSearch, MoreHorizontal } from 'lucide-react';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';

const EMPTY_DRAFT: CrewContactDraft = {
  fullName: '',
  contactType: 'crew',
  roleTags: '',
  defaultEquipmentItemIds: [],
  organizationName: '',
  functionalArea: '',
  preferredVehicle: '',
  vehicleNotes: '',
  phone: '',
  email: '',
  notes: '',
  baseLocation: '',
  unionStatus: '',
  isActive: true,
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
      contactType: contact.contactType,
      roleTags: (contact.roleTags ?? []).join(', '),
      organizationName: contact.organizationName ?? '',
      functionalArea: contact.functionalArea ?? '',
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
    const normalizedPhone = draft.phone.trim() ? normalizePhoneToStandardFormat(draft.phone) : '';
    if (normalizedPhone && !isStandardPhoneFormat(normalizedPhone)) {
      toast.error('Phone number is invalid. Use format (xxx) xxx-xxxx.');
      return;
    }
    const draftToSave: CrewContactDraft = {
      ...draft,
      phone: normalizedPhone,
    };
    if (editingContactId) {
      updateCrewContact(editingContactId, draftToSave);
    } else {
      createCrewContact(draftToSave);
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

  const handleExportCrewCsv = (): void => {
    const exportRows: string[][] = [
      ['Full Name', 'Status', 'Type', 'Roles', 'Organization', 'Phone', 'Email', 'Base Location', 'Union Status', 'Notes'],
      ...filteredContacts.map((contact) => [
        contact.fullName,
        contact.isActive ? 'Active' : 'Inactive',
        contact.contactType === 'vendor' ? 'Vendor' : 'Crew',
        (contact.roleTags ?? []).join('|'),
        contact.organizationName ?? '',
        contact.phone ? normalizePhoneToStandardFormat(contact.phone) : '',
        contact.email ?? '',
        contact.baseLocation ?? '',
        contact.unionStatus ?? '',
        contact.notes ?? '',
      ]),
    ];
    const timestamp = new Date().toISOString().slice(0, 10);
    downloadCsv(`crew-directory-${timestamp}.csv`, exportRows);
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
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleExportCrewCsv} disabled={filteredContacts.length === 0}>
            Export filtered CSV
          </Button>
          <Button onClick={openCreateDialog} className="gap-2">
            <Plus className="h-4 w-4" />
            Add Contact
          </Button>
        </div>
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
              <div
                key={contact.id}
                className="rounded-md border px-3 py-2"
                onDoubleClick={() => openEditDialog(contact)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-medium">{contact.fullName}</p>
                      <Badge className={contact.isActive
                        ? 'bg-emerald-600/20 text-emerald-200 border border-emerald-500/40'
                        : 'bg-slate-600/20 text-slate-200 border border-slate-500/40'
                      }>
                        {contact.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                      <Badge className={contact.contactType === 'vendor'
                        ? 'bg-amber-600/20 text-amber-200 border border-amber-500/40'
                        : 'bg-blue-600/20 text-blue-200 border border-blue-500/40'
                      }>
                        {contact.contactType === 'vendor' ? 'Vendor' : 'Crew'}
                      </Badge>
                      {(contact.roleTags ?? []).slice(0, 3).map((roleTag) => (
                        <Badge
                          key={`${contact.id}-${roleTag}`}
                          className="bg-fuchsia-600/20 text-fuchsia-200 border border-fuchsia-500/40"
                        >
                          {roleTag}
                        </Badge>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {[contact.organizationName, contact.phone, contact.email, contact.baseLocation]
                        .filter(Boolean)
                        .join(' · ')}
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
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => openEditDialog(contact)}>
                        <Pencil className="mr-2 h-4 w-4" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={() => {
                          const shouldDelete = window.confirm('Delete this crew contact?');
                          if (!shouldDelete) return;
                          removeCrewContact(contact.id);
                        }}
                      >
                        <Trash2 className="mr-2 h-4 w-4 text-destructive" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
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
            <div className="flex items-center gap-2 rounded-md border px-3">
              <Label htmlFor="contact-type" className="shrink-0 text-xs text-muted-foreground">
                Type
              </Label>
              <select
                id="contact-type"
                className="h-9 w-full bg-transparent text-sm outline-none"
                value={draft.contactType}
                onChange={(event) =>
                  setDraft((prev) => ({
                    ...prev,
                    contactType: event.target.value === 'vendor' ? 'vendor' : 'crew',
                  }))
                }
              >
                <option value="crew">Crew</option>
                <option value="vendor">Vendor</option>
              </select>
            </div>
            <Input
              placeholder="Roles (comma separated)"
              value={draft.roleTags}
              onChange={(event) => setDraft((prev) => ({ ...prev, roleTags: event.target.value }))}
            />
            <Input
              placeholder="Organization"
              value={draft.organizationName}
              onChange={(event) => setDraft((prev) => ({ ...prev, organizationName: event.target.value }))}
            />
            <Input
              placeholder="Functional area"
              value={draft.functionalArea}
              onChange={(event) => setDraft((prev) => ({ ...prev, functionalArea: event.target.value }))}
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
