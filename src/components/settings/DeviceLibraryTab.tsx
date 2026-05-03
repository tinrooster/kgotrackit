import { useMemo, useState } from 'react';
import { Cpu, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  createDeviceLibraryEntry,
  deleteDeviceLibraryEntry,
  getDeviceLibrary,
} from '@/lib/deviceLibraryStorage';
import { logger } from '@/lib/logging';

export function DeviceLibraryTab() {
  const [entries, setEntries] = useState(() => getDeviceLibrary());
  const [manufacturer, setManufacturer] = useState('');
  const [modelNumber, setModelNumber] = useState('');
  const [defaultSupplier, setDefaultSupplier] = useState('');
  const [defaultSupplierWebsite, setDefaultSupplierWebsite] = useState('');
  const [notes, setNotes] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const sorted = useMemo(() => {
    return [...entries].sort((a, b) => {
      const ma = a.manufacturer.toLowerCase();
      const mb = b.manufacturer.toLowerCase();
      if (ma !== mb) {
        return ma.localeCompare(mb);
      }
      return a.modelNumber.toLowerCase().localeCompare(b.modelNumber.toLowerCase());
    });
  }, [entries]);

  const refresh = () => setEntries(getDeviceLibrary());

  const handleAdd = () => {
    try {
      createDeviceLibraryEntry({
        manufacturer,
        modelNumber,
        defaultSupplier: defaultSupplier || undefined,
        defaultSupplierWebsite: defaultSupplierWebsite || undefined,
        notes: notes || undefined,
      });
      logger.info('Device library entry added', { manufacturer: manufacturer.trim() });
      toast.success('Device added to library');
      setManufacturer('');
      setModelNumber('');
      setDefaultSupplier('');
      setDefaultSupplierWebsite('');
      setNotes('');
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not add device');
    }
  };

  const confirmDelete = () => {
    if (!deleteId) {
      return;
    }
    deleteDeviceLibraryEntry(deleteId);
    logger.info('Device library entry removed', { id: deleteId });
    toast.success('Device removed from library');
    setDeleteId(null);
    refresh();
  };

  const pendingDeleteLabel = deleteId
    ? sorted.find((e) => e.id === deleteId)
    : undefined;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Cpu className="h-5 w-5 shrink-0 opacity-90" aria-hidden />
            Device library
          </CardTitle>
          <CardDescription>
            Save manufacturer / model combinations and default supplier hints. Included in full backups
            (Create Backup); restoring a backup replaces the library when the file contains a deviceLibrary
            block.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-2 sm:col-span-2 lg:col-span-1">
              <Label htmlFor="device-lib-manufacturer">Manufacturer</Label>
              <Input
                id="device-lib-manufacturer"
                value={manufacturer}
                onChange={(e) => setManufacturer(e.target.value)}
                placeholder="e.g. Belden"
                autoComplete="organization"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="device-lib-model">Model / part #</Label>
              <Input
                id="device-lib-model"
                value={modelNumber}
                onChange={(e) => setModelNumber(e.target.value)}
                placeholder="Optional"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="device-lib-supplier">Default supplier</Label>
              <Input
                id="device-lib-supplier"
                value={defaultSupplier}
                onChange={(e) => setDefaultSupplier(e.target.value)}
                placeholder="Optional"
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="device-lib-url">Default supplier website</Label>
              <Input
                id="device-lib-url"
                value={defaultSupplierWebsite}
                onChange={(e) => setDefaultSupplierWebsite(e.target.value)}
                placeholder="https://…"
                type="url"
                autoComplete="url"
              />
            </div>
            <div className="space-y-2 sm:col-span-2 lg:col-span-3">
              <Label htmlFor="device-lib-notes">Notes</Label>
              <Textarea
                id="device-lib-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional"
                rows={2}
              />
            </div>
          </div>
          <Button type="button" onClick={handleAdd} className="inline-flex items-center gap-2">
            <Plus className="h-4 w-4" aria-hidden />
            Add to library
          </Button>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Manufacturer</TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead>Default supplier</TableHead>
                  <TableHead className="w-[72px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-muted-foreground">
                      No devices yet. Add entries above or restore from a backup that includes deviceLibrary.
                    </TableCell>
                  </TableRow>
                ) : (
                  sorted.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium">{row.manufacturer}</TableCell>
                      <TableCell>{row.modelNumber || '—'}</TableCell>
                      <TableCell className="max-w-[200px] truncate" title={row.defaultSupplier}>
                        {row.defaultSupplier || '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive"
                          title="Remove from library"
                          onClick={() => setDeleteId(row.id)}
                        >
                          <Trash2 className="h-4 w-4" aria-hidden />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={deleteId !== null} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove device from library?</AlertDialogTitle>
            <AlertDialogDescription>
              This only removes the catalog row. Inventory items are not changed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {pendingDeleteLabel ? (
            <p className="text-sm text-muted-foreground">
              {pendingDeleteLabel.manufacturer}
              {pendingDeleteLabel.modelNumber ? ` · ${pendingDeleteLabel.modelNumber}` : ''}
            </p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel type="button">Cancel</AlertDialogCancel>
            <Button type="button" variant="destructive" onClick={confirmDelete}>
              Remove
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
