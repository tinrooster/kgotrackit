import { useEffect, useState, useMemo } from 'react';
import { Plus, Search } from 'lucide-react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ProductionCard } from '@/components/productions/ProductionCard';
import { ProductionDetail } from '@/components/productions/ProductionDetail';
import { ProductionForm } from '@/components/productions/ProductionForm';
import { useAuth } from '@/contexts/AuthContext';

export default function ProductionsPage() {
  const { currentUser } = useAuth();
  const [productions, setProductions] = useState<Production[]>(() => getProductions());
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>(() => getItems());
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<ProductionStatus | 'all'>('all');
  const [selectedProduction, setSelectedProduction] = useState<Production | null>(null);
  const [newFormOpen, setNewFormOpen] = useState(false);

  useEffect(() => {
    const handleUpdate = () => {
      const latest = getProductions();
      setProductions(latest);
      setSelectedProduction((current) =>
        current ? latest.find((production) => production.id === current.id) ?? null : null
      );
    };
    window.addEventListener(PRODUCTIONS_UPDATED_EVENT, handleUpdate);
    return () => window.removeEventListener(PRODUCTIONS_UPDATED_EVENT, handleUpdate);
  }, []);

  useEffect(() => {
    setInventoryItems(getItems());
  }, []);

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
    createProduction(
      { ...data, checklistGroups: [], vehiclePacklists: [], crew: [], crewSchedule: [] },
      currentUser?.id
    );
    setNewFormOpen(false);
  };

  const handleUpdate = (id: string, updates: Partial<Production>) => {
    const updated = updateProduction(id, updates);
    if (updated && selectedProduction?.id === id) {
      setSelectedProduction(updated);
    }
  };

  const handleDelete = (id: string) => {
    deleteProduction(id);
    setSelectedProduction(null);
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
        <Button onClick={() => setNewFormOpen(true)} className="gap-1.5">
          <Plus className="h-4 w-4" />
          New Production
        </Button>
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
        onClose={() => setSelectedProduction(null)}
      />

      <ProductionForm
        open={newFormOpen}
        onSave={handleCreate}
        onClose={() => setNewFormOpen(false)}
      />
    </div>
  );
}
