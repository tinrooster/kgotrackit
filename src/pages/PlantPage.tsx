import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Cable, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CableRegisterTab } from '@/components/plant/CableRegisterTab';
import { DrawingsTab } from '@/components/plant/DrawingsTab';
import { CampaignsTab } from '@/components/plant/CampaignsTab';
import { LocationsTab } from '@/components/plant/LocationsTab';
import { getCableStats, PLANT_CABLES_UPDATED_EVENT } from '@/lib/plantService';
import type { PlantCableStats } from '@/lib/plantService';

type PlantTab = 'register' | 'drawings' | 'locations' | 'campaigns';

const TABS: { id: PlantTab; label: string }[] = [
  { id: 'register',  label: 'Cable Register' },
  { id: 'drawings',  label: 'Drawings' },
  { id: 'locations', label: 'Locations' },
  { id: 'campaigns', label: 'Campaigns' },
];

function StatChip({ label, value, highlight }: { label: string; value: number | string; highlight?: boolean }) {
  return (
    <div className={cn(
      'flex flex-col items-center px-3 py-1.5 rounded-md border text-center min-w-[72px]',
      highlight ? 'border-orange-300 bg-orange-50 dark:border-orange-800 dark:bg-orange-950/30' : 'border-border bg-muted/30'
    )}>
      <span className={cn('text-lg font-semibold tabular-nums leading-tight', highlight ? 'text-orange-700 dark:text-orange-400' : '')}>{value}</span>
      <span className="text-[10px] text-muted-foreground leading-tight">{label}</span>
    </div>
  );
}

export default function PlantPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get('pt') as PlantTab | null;
  const activeTab: PlantTab = TABS.some((t) => t.id === rawTab) ? rawTab! : 'register';

  const [stats, setStats] = useState<PlantCableStats | null>(null);

  useEffect(() => {
    getCableStats().then(setStats);
    const handler = () => getCableStats().then(setStats);
    window.addEventListener(PLANT_CABLES_UPDATED_EVENT, handler);
    return () => window.removeEventListener(PLANT_CABLES_UPDATED_EVENT, handler);
  }, []);

  const setTab = (tab: PlantTab) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('pt', tab);
      // Clear cross-tab filters when switching tabs manually
      next.delete('loc');
      next.delete('dwg');
      return next;
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <Cable className="h-6 w-6 text-muted-foreground shrink-0" />
          <div>
            <h1 className="text-xl font-semibold leading-tight">Cable Plant</h1>
            <p className="text-sm text-muted-foreground">Wire infrastructure lifecycle management</p>
          </div>
        </div>

        {/* Stats bar */}
        {stats ? (
          <div className="flex items-center gap-1.5 flex-wrap">
            <StatChip label="Total" value={stats.total.toLocaleString()} />
            <StatChip label="Unverified" value={stats.unknown.toLocaleString()} highlight={stats.unknown > 0} />
            <StatChip label="Active" value={stats.active.toLocaleString()} />
            {stats.review > 0 && <StatChip label="Review" value={stats.review.toLocaleString()} highlight />}
            {stats.decommissioning > 0 && <StatChip label="Decomm." value={stats.decommissioning.toLocaleString()} />}
            {stats.activeCampaigns > 0 && (
              <StatChip label="Campaigns" value={stats.activeCampaigns} highlight />
            )}
          </div>
        ) : (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground mt-1" />
        )}
      </div>

      {/* Tab bar */}
      <div className="flex border-b gap-0">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setTab(tab.id)}
            className={cn(
              'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
              activeTab === tab.id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'register'  && <CableRegisterTab />}
      {activeTab === 'drawings'  && <DrawingsTab />}
      {activeTab === 'locations' && <LocationsTab />}
      {activeTab === 'campaigns' && <CampaignsTab />}
    </div>
  );
}
