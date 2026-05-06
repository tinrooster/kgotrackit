import * as React from 'react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { DraggableDialogContent } from "@/components/ui/draggable-dialog"
import { toast } from 'sonner'
import { Pencil, Trash2, GripVertical, ArrowLeftRight, QrCode, Printer, Download } from "lucide-react"
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { SettingsService } from "@/lib/settingsService";
import { SETTINGS_UPDATED_EVENT } from "@/lib/storageService";
import { requestCloudSync } from "@/lib/cloudSyncEvents";
import { useNavigate } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";

interface Cabinet {
  id: string;
  name: string;
  locationId: string;
  description: string;
  isSecure: boolean;
  allowedCategories: string[];
  qrCode: string;
  notes?: string;
}

interface CabinetCheckout {
  id: string;
  itemId: string;
  itemName: string;
  quantity: number;
  timestamp: string;
  userId: string;
  userName: string;
  type: 'check-in' | 'check-out';
}

interface DefaultSettings {
  defaultLocation: string;
  enableQRTracking: boolean;
  requireCheckoutForSecureCabinets: boolean;
}

interface Location {
  id: string;
  name: string;
}

interface CabinetManagementProps {
  locations: string[];
}

interface SortableCabinetProps {
  cabinet: Cabinet;
  onEdit: (cabinet: Cabinet) => void;
  onDelete: (id: string) => void;
  onMaintenance: (cabinet: Cabinet) => void;
  onShowQr: (cabinet: Cabinet) => void;
}

const generateQRCode = (cabinetId: string): string => {
  // Generate a simple unique identifier instead of QR code
  return `cabinet-${cabinetId}-${Date.now()}`;
};

// Add SortableCabinet component
function SortableCabinet({ cabinet, onEdit, onDelete, onMaintenance, onShowQr }: SortableCabinetProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: cabinet.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style} className="mb-2 flex items-center gap-2 rounded-lg border bg-card p-2 text-card-foreground shadow-sm">
      <div {...attributes} {...listeners} className="cursor-move">
        <GripVertical className="h-5 w-5 text-muted-foreground" />
      </div>
      <div className="flex-1">
        <h3 className="font-medium">{cabinet.name}</h3>
        <p className="text-sm text-muted-foreground">{cabinet.description}</p>
        {cabinet.notes && <p className="mt-1 text-sm text-muted-foreground">{cabinet.notes}</p>}
      </div>
      <div className="flex gap-2">
        <Button variant="ghost" size="icon" onClick={() => onShowQr(cabinet)} title="Print QR">
          <QrCode className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={() => onMaintenance(cabinet)} title="Check In / Check Out">
          <ArrowLeftRight className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={() => onEdit(cabinet)}>
          <Pencil className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={() => onDelete(cabinet.id)}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export default function CabinetManagement({ locations = [] }: CabinetManagementProps) {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = React.useState('cabinets')
  const [cabinets, setCabinets] = React.useState<Cabinet[]>([])
  const [settings, setSettings] = React.useState<DefaultSettings>({
    defaultLocation: locations[0] || '',
    enableQRTracking: true,
    requireCheckoutForSecureCabinets: true
  })

  // Cabinet form state
  const [cabinetForm, setCabinetForm] = React.useState<Cabinet>({
    id: '',
    name: '',
    locationId: locations[0] || '',
    description: '',
    isSecure: false,
    allowedCategories: [],
    qrCode: '',
    notes: ''
  })

  const [editingCabinet, setEditingCabinet] = React.useState<Cabinet | null>(null);
  const [showCabinetDialog, setShowCabinetDialog] = React.useState(false);
  const [qrCabinet, setQrCabinet] = React.useState<Cabinet | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const cabinetIdPrefixMap: Record<string, string> = {
    ENGINEER: 'ENG',
    MAINT: 'MAINT',
    REMOTE: 'REMOTE',
    STUDIO: 'STUDIO',
    WAREHOUSE: 'WH',
    SHELF: 'SHELF',
    RACK: 'RACK',
  };

  // Load cabinets from localStorage
  React.useEffect(() => {
    const loadCabinets = async () => {
      try {
        const loadedCabinets = await SettingsService.getCabinets();
        console.log('Loaded cabinets:', loadedCabinets);
        setCabinets(loadedCabinets);
      } catch (error) {
        console.error('Error loading cabinets:', error);
        toast.error("Failed to load cabinets");
      }
    };
    loadCabinets();
    const refreshCabinets = () => void loadCabinets();
    window.addEventListener(SETTINGS_UPDATED_EVENT, refreshCabinets);
    window.addEventListener('focus', refreshCabinets);
    return () => {
      window.removeEventListener(SETTINGS_UPDATED_EVENT, refreshCabinets);
      window.removeEventListener('focus', refreshCabinets);
    };
  }, []);

  // Save cabinets to localStorage
  const saveCabinets = async (newCabinets: Cabinet[]) => {
    try {
      console.log('Attempting to save cabinets:', newCabinets);
      try {
        window.electronStore?.setData?.('cabinets', newCabinets);
      } catch {
        // fall through to localStorage fallback
      }
      localStorage.setItem('cabinets', JSON.stringify(newCabinets));
      window.dispatchEvent(new CustomEvent(SETTINGS_UPDATED_EVENT));
      requestCloudSync();
      setCabinets(newCabinets);
      console.log('Cabinets saved successfully');
    } catch (error) {
      console.error('Error saving cabinets:', error);
      toast.error("Failed to save cabinet");
    }
  };

  // Update default location when locations list changes
  React.useEffect(() => {
    if (locations.length > 0 && !locations.includes(settings.defaultLocation)) {
      setSettings(prev => ({ ...prev, defaultLocation: locations[0] }))
    }
    if (locations.length > 0 && !locations.includes(cabinetForm.locationId)) {
      setCabinetForm(prev => ({ ...prev, locationId: locations[0] }))
    }
  }, [locations])

  const buildPrefixFromLocation = (locationName: string) => {
    const value = locationName.toUpperCase();
    for (const [keyword, prefix] of Object.entries(cabinetIdPrefixMap)) {
      if (value.includes(keyword)) return prefix.padEnd(4, '_').slice(0, 4);
    }
    const normalized = value.replace(/[^A-Z0-9]/g, '');
    return normalized.padEnd(4, '_').slice(0, 4);
  };

  const generateStorageId = (locationName: string, excludeId?: string) => {
    const prefix = buildPrefixFromLocation(locationName);
    const highestSequence = cabinets
      .filter((cabinet) => cabinet.id !== excludeId)
      .map((cabinet) => {
        const matchedValue = cabinet.id.match(/^([A-Z0-9_]{4})(\d{2})$/);
        if (!matchedValue) return null;
        if (matchedValue[1] !== prefix) return null;
        return Number(matchedValue[2]);
      })
      .filter((value): value is number => value !== null && Number.isFinite(value))
      .reduce((max, value) => Math.max(max, value), 0);
    return `${prefix}${String(highestSequence + 1).padStart(2, '0')}`;
  };

  const applyAutoStorageId = (locationName: string, isEditing: boolean, existingId?: string) => {
    const nextId = isEditing && existingId ? existingId : generateStorageId(locationName, existingId);
    setCabinetForm((previousForm) => ({ ...previousForm, id: nextId, locationId: locationName }));
  };

  const handleSaveCabinet = () => {
    console.log('Save button clicked');
    console.log('Current form state:', cabinetForm);
    
    if (!cabinetForm.id.trim() || !cabinetForm.name.trim() || !cabinetForm.locationId) {
      console.log('Validation failed:', {
        id: !cabinetForm.id.trim(),
        name: !cabinetForm.name.trim(),
        locationId: !cabinetForm.locationId
      });
      toast.error("Storage ID, name, and location are required");
      return;
    }

    if (!/^[A-Z0-9_]{4}[0-9]{2}$/.test(cabinetForm.id.trim().toUpperCase())) {
      toast.error("Storage ID format is locked to XXXX## (example: ENG_01, WH__02).");
      return;
    }

    const expectedPrefix = buildPrefixFromLocation(cabinetForm.locationId || settings.defaultLocation || 'CAB');
    if (!cabinetForm.id.trim().toUpperCase().startsWith(expectedPrefix) || cabinetForm.id.trim().toUpperCase().length !== 6) {
      toast.error(`Storage ID should start with "${expectedPrefix}" for location ${cabinetForm.locationId}.`);
      return;
    }

    // Trim and uppercase the ID
    const formattedId = cabinetForm.id.trim().toUpperCase();

    // Only check for duplicate ID if we're not editing or if we're editing a different cabinet
    if (!editingCabinet && cabinets.some(cab => cab.id === formattedId)) {
      toast.error("Storage ID already exists");
      return;
    }

    const newCabinet = {
      ...cabinetForm,
      id: formattedId,
      name: cabinetForm.name.trim(),
      description: cabinetForm.description.trim(),
      notes: cabinetForm.notes?.trim(),
      qrCode: generateQRCode(formattedId)
    };

    console.log('Saving new cabinet:', newCabinet);
    
    if (editingCabinet) {
      // Update existing cabinet
      saveCabinets(cabinets.map(cab => cab.id === editingCabinet.id ? newCabinet : cab));
      toast.success("Storage unit updated successfully");
    } else {
      // Add new cabinet
      saveCabinets([...cabinets, newCabinet]);
      toast.success("Storage unit saved successfully");
    }
    
    // Reset form
    setCabinetForm({
      id: '',
      name: '',
      locationId: locations[0] || '',
      description: '',
      isSecure: false,
      allowedCategories: [],
      qrCode: '',
      notes: ''
    });
    
    setEditingCabinet(null);
    setShowCabinetDialog(false);
  };

  const handleDeleteCabinet = (id: string) => {
    saveCabinets(cabinets.filter(cabinet => cabinet.id !== id));
    toast.success("Cab/Storage item deleted successfully");
  }

  const handleUpdateSettings = (newSettings: Partial<DefaultSettings>) => {
    setSettings({ ...settings, ...newSettings })
  }

  const handleEditCabinet = (cabinet: Cabinet) => {
    setEditingCabinet(cabinet);
    setCabinetForm({ ...cabinet, id: cabinet.id.toUpperCase() });
    setShowCabinetDialog(true);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    
    if (active.id !== over?.id && over) {
      setCabinets((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);
        
        const newOrder = arrayMove(items, oldIndex, newIndex);
        saveCabinets(newOrder);
        return newOrder;
      });
    }
  };

  const openMaintenance = (cabinet: Cabinet) => {
    navigate(`/checkout?cabinet=${encodeURIComponent(cabinet.id)}`);
  };

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="cabinets">Cab/Storage List</TabsTrigger>
          <TabsTrigger value="settings">Cab/Storage Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="cabinets" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <CardDescription>Manage and reorder cabinets, racks, and shelves.</CardDescription>
                </div>
                <Dialog open={showCabinetDialog} onOpenChange={setShowCabinetDialog}>
                  <DialogTrigger asChild>
                    <Button
                      type="button"
                      onClick={() => {
                        setEditingCabinet(null);
                        const defaultLocation = locations[0] || settings.defaultLocation || '';
                        setCabinetForm({
                          id: generateStorageId(defaultLocation),
                          name: '',
                          locationId: defaultLocation,
                          description: '',
                          isSecure: false,
                          allowedCategories: [],
                          qrCode: '',
                          notes: '',
                        });
                      }}
                    >
                      Add Secure Cabinet / Storage Location
                    </Button>
                  </DialogTrigger>
                  <DraggableDialogContent className="w-[min(calc(100vw-1rem),760px)]">
                    <DialogHeader>
                      <DialogTitle>{editingCabinet ? 'Edit Secure Cabinet or Storage Unit' : 'Add New Secure Cabinet or Storage Location'}</DialogTitle>
                      <DialogDescription>
                        Storage ID is auto-generated from location as XXXX##. Use a consistent name format like "Eng xxx".
                      </DialogDescription>
                    </DialogHeader>
                    <form className="space-y-6" autoComplete="off">
                      <div className="flex justify-end">
                        <div className="rounded-md border bg-muted/40 px-3 py-1 text-sm font-mono text-foreground">
                          Storage ID: {cabinetForm.id || '____00'}
                        </div>
                      </div>
                      <div className="grid gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="name">Name</Label>
                          <Input
                            id="name"
                            name="cabinet-name"
                            placeholder="Enter storage name"
                            className="h-11"
                            value={cabinetForm.name}
                            maxLength={12}
                            autoComplete="off"
                            onChange={(e) => setCabinetForm({ ...cabinetForm, name: e.target.value })}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="description">Description</Label>
                          <Input
                            id="description"
                            name="cabinet-description"
                            placeholder="Enter description"
                            className="h-11"
                            value={cabinetForm.description}
                            autoComplete="off"
                            onChange={(e) => setCabinetForm({ ...cabinetForm, description: e.target.value })}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="notes">Notes</Label>
                          <textarea
                            id="notes"
                            name="cabinet-notes"
                            placeholder="Enter additional notes"
                            className="w-full min-h-[100px] rounded-md border border-input bg-background px-3 py-2 ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                            value={cabinetForm.notes || ''}
                            autoComplete="off"
                            onChange={(e) => setCabinetForm({ ...cabinetForm, notes: e.target.value })}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="location">Location</Label>
                          <Select
                            value={cabinetForm.locationId}
                            onValueChange={(value) => applyAutoStorageId(value, !!editingCabinet, editingCabinet?.id)}
                          >
                            <SelectTrigger id="location" name="cabinet-location" className="h-11">
                              <SelectValue placeholder="Select a location" />
                            </SelectTrigger>
                            <SelectContent>
                              {(locations || []).map((location) => (
                                <SelectItem key={location} value={location}>
                                  {location}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Switch
                            id="secure"
                            name="cabinet-secure"
                            checked={cabinetForm.isSecure}
                            onCheckedChange={(checked) => setCabinetForm({ ...cabinetForm, isSecure: checked })}
                          />
                          <Label htmlFor="secure">Secure storage unit</Label>
                        </div>
                      </div>
                      <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setShowCabinetDialog(false)}>
                          Cancel
                        </Button>
                        <Button type="button" onClick={handleSaveCabinet}>
                          {editingCabinet ? 'Update Secure Cabinet / Storage Unit' : 'Save Secure Cabinet / Storage Unit'}
                        </Button>
                      </DialogFooter>
                    </form>
                  </DraggableDialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={cabinets.map(c => c.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {cabinets.map((cabinet) => (
                    <div key={cabinet.id} className="space-y-4">
                      <SortableCabinet
                        cabinet={cabinet}
                        onEdit={handleEditCabinet}
                        onDelete={handleDeleteCabinet}
                        onMaintenance={openMaintenance}
                          onShowQr={(selectedCabinet) => setQrCabinet(selectedCabinet)}
                      />
                    </div>
                  ))}
                </SortableContext>
              </DndContext>
              {cabinets.length === 0 && (
                <p className="text-sm text-muted-foreground">No storage units yet. Add one to get started.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Default Settings</CardTitle>
              <CardDescription>Configure cab/storage default settings</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label>Default Location</Label>
                <Select 
                  value={settings.defaultLocation}
                  onValueChange={(value) => handleUpdateSettings({ defaultLocation: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(locations || []).map(location => (
                      <SelectItem key={location} value={location}>
                        {location}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center space-x-2">
                <Switch 
                  checked={settings.enableQRTracking}
                  onCheckedChange={(checked) => handleUpdateSettings({ enableQRTracking: checked })}
                />
                <Label>Enable QR Tracking</Label>
              </div>

              <div className="flex items-center space-x-2">
                <Switch 
                  checked={settings.requireCheckoutForSecureCabinets}
                  onCheckedChange={(checked) => handleUpdateSettings({ requireCheckoutForSecureCabinets: checked })}
                />
                <Label>Require Checkout for Secure Cabinets</Label>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={!!qrCabinet} onOpenChange={(open) => !open && setQrCabinet(null)}>
        <DraggableDialogContent className="w-[min(calc(100vw-1rem),460px)]">
          <DialogHeader>
            <DialogTitle>Storage QR Code</DialogTitle>
            <DialogDescription>Print or download QR for location labeling and fast check-in/out.</DialogDescription>
          </DialogHeader>
          {qrCabinet && (
            <div className="space-y-4">
              <div id="cabinet-qr-print-target" className="rounded-lg border bg-white p-4">
                <div className="mx-auto w-fit">
                  <QRCodeSVG
                    value={JSON.stringify({ type: 'cabinet', id: qrCabinet.id, name: qrCabinet.name })}
                    size={220}
                    includeMargin
                  />
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                {qrCabinet.id} - {qrCabinet.name}
              </p>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    const svgElement = document.querySelector('#cabinet-qr-print-target svg');
                    if (!svgElement) return;
                    const svgData = new XMLSerializer().serializeToString(svgElement);
                    const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
                    const url = URL.createObjectURL(blob);
                    const link = document.createElement('a');
                    link.href = url;
                    link.download = `${qrCabinet.id}-qr.svg`;
                    link.click();
                    URL.revokeObjectURL(url);
                  }}
                >
                  <Download className="mr-2 h-4 w-4" />
                  Download
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    const printWindow = window.open('', '_blank');
                    if (!printWindow) return;
                    printWindow.document.write(`
                      <html><body style="font-family:system-ui;padding:24px;text-align:center">
                      <h2>${qrCabinet.name}</h2><p>${qrCabinet.id}</p>
                      <div>${document.querySelector('#cabinet-qr-print-target svg')?.outerHTML ?? ''}</div>
                      </body></html>
                    `);
                    printWindow.document.close();
                    printWindow.print();
                  }}
                >
                  <Printer className="mr-2 h-4 w-4" />
                  Print
                </Button>
              </DialogFooter>
            </div>
          )}
        </DraggableDialogContent>
      </Dialog>
    </div>
  )
}
