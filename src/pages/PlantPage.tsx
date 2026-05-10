import { useSearchParams } from 'react-router-dom';
import { Cable } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CableRegisterTab } from '@/components/plant/CableRegisterTab';
import { DrawingsTab } from '@/components/plant/DrawingsTab';

type PlantTab = 'register' | 'drawings' | 'campaigns';

const TABS: { id: PlantTab; label: string }[] = [
  { id: 'register', label: 'Cable Register' },
  { id: 'drawings', label: 'Drawings' },
  { id: 'campaigns', label: 'Campaigns' },
];

export default function PlantPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get('pt') as PlantTab | null;
  const activeTab: PlantTab = TABS.some((t) => t.id === rawTab) ? rawTab! : 'register';

  const setTab = (tab: PlantTab) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('pt', tab);
      return next;
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <Cable className="h-6 w-6 text-muted-foreground shrink-0" />
        <div>
          <h1 className="text-xl font-semibold leading-tight">Cable Plant</h1>
          <p className="text-sm text-muted-foreground">Wire infrastructure lifecycle management</p>
        </div>
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
      {activeTab === 'register' && <CableRegisterTab />}
      {activeTab === 'drawings' && <DrawingsTab />}
      {activeTab === 'campaigns' && (
        <div className="flex flex-col items-center justify-center py-20 text-center gap-2">
          <p className="text-muted-foreground text-sm">Cleanup campaigns — coming soon.</p>
          <p className="text-xs text-muted-foreground max-w-md">
            Campaigns let you bulk-decommission cables by system (e.g. all Grass Valley),
            location, or drawing. Review a preview set before committing.
          </p>
        </div>
      )}
    </div>
  );
}
