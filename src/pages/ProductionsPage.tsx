import { useEffect, useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, Search, Undo2, Redo2 } from 'lucide-react';
import { Production, ProductionStatus, PRODUCTION_STATUS_OPTIONS } from '@/types/productions';
import {
  getProductions,
  createProduction,
  updateProduction,
  deleteProduction,
  PRODUCTIONS_UPDATED_EVENT,
} from '@/lib/productionService';
import { getItems } from '@/lib/storageService';
import { InventoryItem } from '@/types/inventory';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ProductionCard } from '@/components/productions/ProductionCard';
import { ProductionDetail } from '@/components/productions/ProductionDetail';
import { ProductionForm } from '@/components/productions/ProductionForm';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import {
  applyProductionState,
  canRedoProduction,
  canUndoProduction,
  recordProductionSnapshotBeforeChange,
  redoProductionMutation,
  undoProductionMutation,
} from '@/lib/productionUndo';

export default function ProductionsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { currentUser } = useAuth();
  const [productions, setProductions] = useState<Production[]>(() => getProductions());
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>(() => getItems());
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<ProductionStatus | 'all'>('all');
  const [selectedProduction, setSelectedProduction] = useState<Production | null>(null);
  const [newFormOpen, setNewFormOpen] = useState(false);
  const [undoAvailable, setUndoAvailable] = useState(false);
  const [redoAvailable, setRedoAvailable] = useState(false);
  const [cloneDialogOpen, setCloneDialogOpen] = useState(false);
  const [cloneCrew, setCloneCrew] = useState(true);
  const [cloneSchedule, setCloneSchedule] = useState(true);
  const [cloneChecklist, setCloneChecklist] = useState(false);
  const [cloneVehiclePacklists, setCloneVehiclePacklists] = useState(false);
  const productionIdFromQuery = searchParams.get('productionId');

  useEffect(() => {
    const handleUpdate = () => {
      const latest = getProductions();
      setProductions(latest);
      setSelectedProduction((current) =>
        current ? latest.find((production) => production.id === current.id) ?? null : null
      );
      setUndoAvailable(canUndoProduction());
      setRedoAvailable(canRedoProduction());
    };
    window.addEventListener(PRODUCTIONS_UPDATED_EVENT, handleUpdate);
    return () => window.removeEventListener(PRODUCTIONS_UPDATED_EVENT, handleUpdate);
  }, []);

  useEffect(() => {
    setInventoryItems(getItems());
  }, []);

  useEffect(() => {
    if (!productionIdFromQuery) return;
    const queryProduction = productions.find((production) => production.id === productionIdFromQuery);
    if (queryProduction) {
      setSelectedProduction(queryProduction);
      return;
    }
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('productionId');
    setSearchParams(nextParams, { replace: true });
  }, [productions, productionIdFromQuery, searchParams, setSearchParams]);

  const filtered = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return productions.filter((p) => {
      const matchesStatus = statusFilter === 'all' || p.status === statusFilter;
      const matchesSearch =
        !q ||
        p.name.toLowerCase().includes(q) ||
        (p.client ?? '').toLowerCase().includes(q) ||
        (p.location ?? '').toLowerCase().includes(q);
      return matchesStatus && matchesSearch;
    });
  }, [productions, searchQuery, statusFilter]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      if (a.startDate && b.startDate) return a.startDate.localeCompare(b.startDate);
      if (a.startDate) return -1;
      if (b.startDate) return 1;
      return b.createdAt.localeCompare(a.createdAt);
    });
  }, [filtered]);

  const handleCreate = (data: Omit<Production, 'id' | 'createdAt' | 'updatedAt' | 'checklistGroups' | 'vehiclePacklists' | 'crew' | 'crewSchedule'>) => {
    recordProductionSnapshotBeforeChange(productions);
    createProduction(
      { ...data, checklistGroups: [], vehiclePacklists: [], crew: [], crewSchedule: [] },
      currentUser?.id
    );
    setUndoAvailable(canUndoProduction());
    setRedoAvailable(canRedoProduction());
    setNewFormOpen(false);
  };

  const handleUpdate = (id: string, updates: Partial<Production>) => {
    recordProductionSnapshotBeforeChange(productions);
    const updated = updateProduction(id, updates);
    if (updated && selectedProduction?.id === id) {
      setSelectedProduction(updated);
    }
    setUndoAvailable(canUndoProduction());
    setRedoAvailable(canRedoProduction());
  };

  const handleDelete = (id: string) => {
    recordProductionSnapshotBeforeChange(productions);
    deleteProduction(id);
    setUndoAvailable(canUndoProduction());
    setRedoAvailable(canRedoProduction());
    setSelectedProduction(null);
  };

  const handleUndo = () => {
    const restored = undoProductionMutation(productions);
    if (!restored) {
      toast.info('Nothing to undo');
      return;
    }
    applyProductionState(restored, setProductions);
    setSelectedProduction((current) => (current ? restored.find((production) => production.id === current.id) ?? null : null));
    setUndoAvailable(canUndoProduction());
    setRedoAvailable(canRedoProduction());
    toast.success('Undone');
  };

  const handleRedo = () => {
    const restored = redoProductionMutation(productions);
    if (!restored) {
      toast.info('Nothing to redo');
      return;
    }
    applyProductionState(restored, setProductions);
    setSelectedProduction((current) => (current ? restored.find((production) => production.id === current.id) ?? null : null));
    setUndoAvailable(canUndoProduction());
    setRedoAvailable(canRedoProduction());
    toast.success('Redone');
  };

  const handleCloneSelected = () => {
    if (!selectedProduction) {
      toast.info('Select a production to clone.');
      return;
    }
    setCloneDialogOpen(true);
  };

  const confirmCloneSelected = () => {
    if (!selectedProduction) {
      setCloneDialogOpen(false);
      return;
    }
    const source = selectedProduction;
    const crewIdMap = new Map<string, string>();
    const clonedCrew = cloneCrew
      ? source.crew.map((member) => {
          const nextMemberId = crypto.randomUUID();
          crewIdMap.set(member.id, nextMemberId);
          return {
            ...member,
            id: nextMemberId,
            shifts: (member.shifts ?? []).map((shift) => ({
              ...shift,
              id: crypto.randomUUID(),
            })),
          };
        })
      : [];
    const clonedSchedule =
      cloneCrew && cloneSchedule
        ? (source.crewSchedule ?? []).map((entry) => ({
            ...entry,
            id: crypto.randomUUID(),
            crewMemberId: crewIdMap.get(entry.crewMemberId) ?? entry.crewMemberId,
          }))
        : [];
    const clonedChecklistGroups = cloneChecklist
      ? source.checklistGroups.map((group) => ({
          ...group,
          id: crypto.randomUUID(),
          items: group.items.map((item) => ({
            ...item,
            id: crypto.randomUUID(),
            completed: false,
            reservedQuantity: 0,
            checkedOutQuantity: 0,
          })),
        }))
      : [];
    const clonedVehiclePacklists = cloneVehiclePacklists
      ? source.vehiclePacklists.map((packlist) => ({
          ...packlist,
          id: crypto.randomUUID(),
          items: packlist.items.map((item) => ({
            ...item,
            id: crypto.randomUUID(),
            completed: false,
            reservedQuantity: 0,
            checkedOutQuantity: 0,
          })),
        }))
      : [];

    recordProductionSnapshotBeforeChange(productions);
    const clonedProduction = createProduction(
      {
        name: `${source.name} (Copy)`,
        client: source.client,
        location: source.location,
        startDate: source.startDate,
        endDate: source.endDate,
        scheduleDefaultStartTime: source.scheduleDefaultStartTime,
        scheduleDefaultEndTime: source.scheduleDefaultEndTime,
        status: 'planning',
        description: source.description,
        notes: source.notes,
        checklistGroups: clonedChecklistGroups,
        vehiclePacklists: clonedVehiclePacklists,
        crew: clonedCrew,
        crewSchedule: clonedSchedule,
        createdBy: currentUser?.id,
      },
      currentUser?.id,
    );
    setUndoAvailable(canUndoProduction());
    setRedoAvailable(canRedoProduction());
    setSelectedProduction(clonedProduction);
    setCloneDialogOpen(false);
    toast.success('Production cloned with crew assignments.');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Productions</h1>
          <p className="text-sm text-muted-foreground">
            Plan and manage event and shoot productions, crew, and equipment.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleUndo} disabled={!undoAvailable} className="gap-1.5">
            <Undo2 className="h-4 w-4" />
            Undo
          </Button>
          <Button variant="outline" onClick={handleRedo} disabled={!redoAvailable} className="gap-1.5">
            <Redo2 className="h-4 w-4" />
            Redo
          </Button>
          <Button onClick={() => setNewFormOpen(true)} className="gap-1.5">
            <Plus className="h-4 w-4" />
            New Production
          </Button>
          <Button
            variant="outline"
            onClick={handleCloneSelected}
            disabled={!selectedProduction}
            className="gap-1.5"
          >
            <Plus className="h-4 w-4" />
            Clone Selected
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1" style={{ minWidth: '200px' }}>
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search productions..."
            className="pl-8"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <Select
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v as ProductionStatus | 'all')}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {PRODUCTION_STATUS_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {sorted.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
          {productions.length === 0 ? (
            <>
              <p className="text-lg font-medium">No productions yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Create your first production to start planning equipment and crew.
              </p>
              <Button className="mt-4 gap-1.5" onClick={() => setNewFormOpen(true)}>
                <Plus className="h-4 w-4" />
                New Production
              </Button>
            </>
          ) : (
            <>
              <p className="text-lg font-medium">No results</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Try adjusting your search or status filter.
              </p>
            </>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {sorted.map((production) => (
            <ProductionCard
              key={production.id}
              production={production}
              onClick={setSelectedProduction}
            />
          ))}
        </div>
      )}

      <ProductionDetail
        production={selectedProduction}
        inventoryItems={inventoryItems}
        currentUsername={currentUser?.username || currentUser?.displayName}
        onUpdate={handleUpdate}
        onDelete={handleDelete}
        onClose={() => {
          setSelectedProduction(null);
          if (!productionIdFromQuery) return;
          const nextParams = new URLSearchParams(searchParams);
          nextParams.delete('productionId');
          setSearchParams(nextParams, { replace: true });
        }}
      />

      <ProductionForm
        open={newFormOpen}
        onSave={handleCreate}
        onClose={() => setNewFormOpen(false)}
      />
      <Dialog open={cloneDialogOpen} onOpenChange={setCloneDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clone Production Options</DialogTitle>
            <DialogDescription>
              Choose which planning blocks to copy into the new production.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={cloneCrew} onCheckedChange={(checked) => setCloneCrew(Boolean(checked))} />
              Copy crew assignments
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={cloneSchedule}
                disabled={!cloneCrew}
                onCheckedChange={(checked) => setCloneSchedule(Boolean(checked))}
              />
              Copy schedule board entries
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={cloneChecklist}
                onCheckedChange={(checked) => setCloneChecklist(Boolean(checked))}
              />
              Copy checklist groups and items
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={cloneVehiclePacklists}
                onCheckedChange={(checked) => setCloneVehiclePacklists(Boolean(checked))}
              />
              Copy vehicle packlists
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCloneDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={confirmCloneSelected}>Clone</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
