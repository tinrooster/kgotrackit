import { useEffect, useState, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Search, Undo2, Redo2 } from 'lucide-react';
import { Production, ProductionStatus, PRODUCTION_STATUS_OPTIONS } from '@/types/productions';
import {
  getProductions,
  createProduction,
  updateProduction,
  deleteProduction,
  PRODUCTIONS_UPDATED_EVENT,
} from '@/lib/productionService';
import { ensureVehiclePacklistShape } from '@/lib/vehiclePacklistUtils';
import { getItems, STORAGE_KEYS } from '@/lib/storageService';
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
import { ProductionCard } from '@/components/productions/ProductionCard';
import { ProductionDetail } from '@/components/productions/ProductionDetail';
import { ProductionForm } from '@/components/productions/ProductionForm';
import { useAuth } from '@/contexts/AuthContext';
import { useCanMutateAppData } from '@/hooks/useCanMutateAppData';
import { toast } from 'sonner';
import {
  applyProductionState,
  canRedoProduction,
  canUndoProduction,
  recordProductionSnapshotBeforeChange,
  redoProductionMutation,
  undoProductionMutation,
} from '@/lib/productionUndo';
import type { ProductionSheetTab } from '@/lib/productionSheetTab';
import { normalizeProductionSheetTab } from '@/lib/productionSheetTab';

export default function ProductionsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { currentUser } = useAuth();
  const canMutateAppData = useCanMutateAppData();
  const [productions, setProductions] = useState<Production[]>(() => getProductions());
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>(() => getItems());
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<ProductionStatus | 'all'>('all');
  const [selectedProduction, setSelectedProduction] = useState<Production | null>(null);
  const [newFormOpen, setNewFormOpen] = useState(false);
  const [createOptionsOpen, setCreateOptionsOpen] = useState(false);
  const [createMode, setCreateMode] = useState<'blank' | 'clone'>('blank');
  const [cloneSourceProductionId, setCloneSourceProductionId] = useState<string>('');
  const [undoAvailable, setUndoAvailable] = useState(false);
  const [redoAvailable, setRedoAvailable] = useState(false);
  const [cloneDialogOpen, setCloneDialogOpen] = useState(false);
  const [cloneCrew, setCloneCrew] = useState(true);
  const [cloneSchedule, setCloneSchedule] = useState(true);
  const [cloneChecklist, setCloneChecklist] = useState(false);
  const [cloneVehiclePacklists, setCloneVehiclePacklists] = useState(false);
  const [deleteTargetProduction, setDeleteTargetProduction] = useState<Production | null>(null);
  const productionIdFromQuery = searchParams.get('productionId');
  const sheetTabFromQuery = normalizeProductionSheetTab(searchParams.get('pt'));

  const pushProductionSheetUrl = (production: Production, tab: ProductionSheetTab) => {
    const next = new URLSearchParams(searchParams);
    next.set('productionId', production.id);
    next.set('pt', tab);
    setSearchParams(next, { replace: true });
  };

  const clearProductionSheetUrl = () => {
    const next = new URLSearchParams(searchParams);
    next.delete('productionId');
    next.delete('pt');
    setSearchParams(next, { replace: true });
  };

  const openProductionInSheet = (production: Production, tab: ProductionSheetTab = 'overview') => {
    setSelectedProduction(production);
    pushProductionSheetUrl(production, tab);
  };

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
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEYS.PRODUCTIONS) return;
      const latest = getProductions();
      setProductions(latest);
      setSelectedProduction((current) =>
        current ? latest.find((production) => production.id === current.id) ?? null : null,
      );
      setUndoAvailable(canUndoProduction());
      setRedoAvailable(canRedoProduction());
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  useEffect(() => {
    setInventoryItems(getItems());
  }, []);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEYS.ITEMS) return;
      setInventoryItems(getItems());
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
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
    nextParams.delete('pt');
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
    if (!canMutateAppData) {
      toast.error('Viewers cannot create productions.');
      return;
    }
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

  const cloneSourceProduction = useMemo(
    () => productions.find((production) => production.id === cloneSourceProductionId) ?? null,
    [productions, cloneSourceProductionId]
  );

  const confirmCloneSelected = () => {
    if (!canMutateAppData) {
      toast.error('Viewers cannot clone productions.');
      return;
    }
    if (!cloneSourceProduction) {
      setCloneDialogOpen(false);
      return;
    }
    const source = cloneSourceProduction;
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
    const checklistIdMap = new Map<string, string>();
    const clonedChecklistGroups = cloneChecklist
      ? source.checklistGroups.map((group) => {
          const nextGroupId = crypto.randomUUID();
          checklistIdMap.set(group.id, nextGroupId);
          return {
            ...group,
            id: nextGroupId,
            items: group.items.map((item) => ({
              ...item,
              id: crypto.randomUUID(),
              completed: false,
              reservedQuantity: 0,
              checkedOutQuantity: 0,
            })),
          };
        })
      : [];
    const clonedVehiclePacklists = cloneVehiclePacklists
      ? source.vehiclePacklists.map((packlist) => {
          const shaped = ensureVehiclePacklistShape(packlist);
          return {
            ...shaped,
            id: crypto.randomUUID(),
            items: shaped.items.map((item) => ({
              ...item,
              id: crypto.randomUUID(),
              completed: false,
              reservedQuantity: 0,
              checkedOutQuantity: 0,
            })),
            sections: (shaped.sections ?? []).map((section) => ({
              ...section,
              id: crypto.randomUUID(),
              checklistGroupId:
                cloneChecklist && section.checklistGroupId ? checklistIdMap.get(section.checklistGroupId) : undefined,
              items: section.items.map((item) => ({
                ...item,
                id: crypto.randomUUID(),
                completed: false,
                reservedQuantity: 0,
                checkedOutQuantity: 0,
              })),
            })),
          };
        })
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
    openProductionInSheet(clonedProduction, 'overview');
    setCloneDialogOpen(false);
    setCreateOptionsOpen(false);
    setCloneSourceProductionId('');
    toast.success('Production cloned with crew assignments.');
  };

  const openCreateOptions = () => {
    setCreateMode('blank');
    setCloneSourceProductionId(productions[0]?.id ?? '');
    setCreateOptionsOpen(true);
  };

  const continueCreate = () => {
    if (!canMutateAppData) {
      toast.error('Viewers cannot create or clone productions.');
      return;
    }
    if (createMode === 'blank') {
      setCreateOptionsOpen(false);
      setNewFormOpen(true);
      return;
    }
    if (!cloneSourceProductionId) {
      toast.info('Select a source production to clone.');
      return;
    }
    setCreateOptionsOpen(false);
    setCloneDialogOpen(true);
  };

  const handleCardEdit = (production: Production) => {
    openProductionInSheet(production, 'overview');
  };

  const handleCardClone = (production: Production) => {
    if (!canMutateAppData) {
      toast.error('Viewers cannot clone productions.');
      return;
    }
    setCloneSourceProductionId(production.id);
    setCloneDialogOpen(true);
  };

  const handleCardDelete = (production: Production) => {
    setDeleteTargetProduction(production);
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
          <Button onClick={openCreateOptions} disabled={!canMutateAppData} className="gap-1.5">
            <Plus className="h-4 w-4" />
            New Production
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
              <Button className="mt-4 gap-1.5" onClick={openCreateOptions} disabled={!canMutateAppData}>
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
        <div className="grid gap-6 sm:grid-cols-2 sm:gap-7 lg:grid-cols-3 lg:gap-8 xl:grid-cols-4 xl:gap-8">
          {sorted.map((production) => (
            <ProductionCard
              key={production.id}
              production={production}
              onClick={setSelectedProduction}
              onEdit={handleCardEdit}
              onClone={handleCardClone}
              onDelete={handleCardDelete}
              onPlannerSegmentClick={(prod, segment) => {
                const id = encodeURIComponent(prod.id);
                const pt =
                  segment === 'checklist' ? 'checklist' : segment === 'packlists' ? 'vehicles' : 'crew';
                navigate(`/productions/planner?productionId=${id}&pt=${pt}`);
              }}
            />
          ))}
        </div>
      )}

      <ProductionDetail
        production={selectedProduction}
        inventoryItems={inventoryItems}
        onRefreshInventory={() => setInventoryItems(getItems())}
        currentUsername={currentUser?.username || currentUser?.displayName}
        onUpdate={handleUpdate}
        onDelete={handleDelete}
        activeSheetTab={selectedProduction ? sheetTabFromQuery : undefined}
        onActiveSheetTabChange={
          selectedProduction
            ? (tab) => pushProductionSheetUrl(selectedProduction, tab)
            : undefined
        }
        onClose={() => {
          setSelectedProduction(null);
          if (searchParams.has('productionId') || searchParams.has('pt')) {
            clearProductionSheetUrl();
          }
        }}
      />

      <ProductionForm
        open={newFormOpen}
        onSave={handleCreate}
        onClose={() => setNewFormOpen(false)}
      />
      <Dialog open={createOptionsOpen} onOpenChange={setCreateOptionsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Production</DialogTitle>
            <DialogDescription>
              Start blank or clone from an existing production.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={createMode === 'blank'} onCheckedChange={() => setCreateMode('blank')} />
              Start with blank production
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={createMode === 'clone'} onCheckedChange={() => setCreateMode('clone')} />
              Clone from existing production
            </label>
            {createMode === 'clone' ? (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Clone source</p>
                <Select value={cloneSourceProductionId} onValueChange={setCloneSourceProductionId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select source production" />
                  </SelectTrigger>
                  <SelectContent>
                    {productions.map((production) => (
                      <SelectItem key={production.id} value={production.id}>
                        {production.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOptionsOpen(false)}>
              Cancel
            </Button>
            <Button onClick={continueCreate}>
              Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
      <AlertDialog
        open={deleteTargetProduction !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTargetProduction(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete production?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove{' '}
              <span className="font-medium text-foreground">{deleteTargetProduction?.name}</span>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteTargetProduction(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (!deleteTargetProduction) return;
                handleDelete(deleteTargetProduction.id);
                toast.success('Production deleted');
                setDeleteTargetProduction(null);
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
