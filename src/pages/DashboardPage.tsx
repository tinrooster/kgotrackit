import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { InventoryItem } from '@/types/inventory';
import { Plus, Filter, Clapperboard } from 'lucide-react';
import { SETTINGS_UPDATED_EVENT, STORAGE_KEYS } from '@/lib/storageService';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getSettings } from '@/lib/storageService';
import { resolveLocationDisplay } from '@/lib/resolveLocationLabel';
import { resolveProjectDisplay } from '@/lib/projectOptions';
import { getProductions, PRODUCTIONS_UPDATED_EVENT } from '@/lib/productionService';
import { getProductionProgressSnapshot } from '@/lib/productionProgressMetrics';
import { Production, ProductionStatus, PRODUCTION_STATUS_LABELS } from '@/types/productions';
import { ProductionDashboardProgress } from '@/components/dashboard/ProductionDashboardProgress';
import { cn } from '@/lib/utils';

const ACTIVE_PRODUCTION_STATUS_FILTERS: ProductionStatus[] = ['planning', 'confirmed', 'in_progress'];
const PRODUCTION_STATUS_BADGE_CLASSES: Record<ProductionStatus, string> = {
  planning: 'border-yellow-500/40 bg-yellow-500/10 text-yellow-700 dark:text-yellow-300',
  confirmed: 'border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-300',
  in_progress: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  completed: 'border-muted-foreground/30 bg-muted text-muted-foreground',
  cancelled: 'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300',
};

export default function DashboardPage() {
  const navigate = useNavigate();
  const [items, setItems] = useLocalStorage<InventoryItem[]>('inventoryItems', []);
  const [productions, setProductions] = useState<Production[]>(() => getProductions());
  const [activeView, setActiveView] = useState<'project' | 'location' | 'production'>('project');
  const [activeSegment, setActiveSegment] = useState<string | null>(null);
  const [productionStatusFilter, setProductionStatusFilter] = useState<ProductionStatus | 'all'>('all');

  // Add storage event listener
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'inventoryItems') {
        const newItems = e.newValue ? JSON.parse(e.newValue) : [];
        setItems(newItems);
        return;
      }
      if (e.key === STORAGE_KEYS.PRODUCTIONS) {
        setProductions(getProductions());
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [setItems]);

  // Add periodic refresh
  useEffect(() => {
    const checkStorage = () => {
      const storedItems = localStorage.getItem('inventoryItems');
      if (storedItems) {
        const parsedItems = JSON.parse(storedItems);
        if (JSON.stringify(parsedItems) !== JSON.stringify(items)) {
          setItems(parsedItems);
        }
      }
    };

    const interval = setInterval(checkStorage, 1000);
    return () => clearInterval(interval);
  }, [items, setItems]);

  useEffect(() => {
    const refreshItems = () => {
      const storedItems = localStorage.getItem('inventoryItems');
      setItems(storedItems ? JSON.parse(storedItems) : []);
    };
    window.addEventListener(SETTINGS_UPDATED_EVENT, refreshItems);
    window.addEventListener('focus', refreshItems);
    return () => {
      window.removeEventListener(SETTINGS_UPDATED_EVENT, refreshItems);
      window.removeEventListener('focus', refreshItems);
    };
  }, [setItems]);

  useEffect(() => {
    const refreshProductions = () => {
      setProductions(getProductions());
    };
    window.addEventListener(PRODUCTIONS_UPDATED_EVENT, refreshProductions as EventListener);
    window.addEventListener('focus', refreshProductions);
    return () => {
      window.removeEventListener(PRODUCTIONS_UPDATED_EVENT, refreshProductions as EventListener);
      window.removeEventListener('focus', refreshProductions);
    };
  }, []);

  // Get project statistics
  const projectStats = useMemo(() => {
    const settings = getSettings();
    const stats = items.reduce((acc, item) => {
      const project = resolveProjectDisplay(item.project, settings.projects || []);
      if (!acc[project]) {
        acc[project] = { count: 0, items: [], totalValue: 0 };
      }
      acc[project].count += 1;
      acc[project].items.push(item);
      acc[project].totalValue += (item.quantity || 0) * (item.costPerUnit || 0);
      return acc;
    }, {} as Record<string, { count: number; items: InventoryItem[]; totalValue: number }>);

    return Object.entries(stats)
      .map(([name, data]) => ({
        name,
        value: data.count,
        items: data.items,
        percentage: (data.count / items.length * 100).toFixed(1),
        totalValue: data.totalValue.toFixed(2),
        totalQuantity: data.items.reduce((sum, item) => sum + (item.quantity || 0), 0)
      }))
      .sort((a, b) => b.value - a.value);
  }, [items]);

  // Get location statistics
  const locationStats = useMemo(() => {
    const settings = getSettings();
    const stats = items.reduce((acc, item) => {
      const location = item.location
        ? resolveLocationDisplay(item.location, settings.locations || [])
        : 'Unassigned';
      if (!acc[location]) {
        acc[location] = { count: 0, items: [], totalValue: 0 };
      }
      acc[location].count += 1;
      acc[location].items.push(item);
      acc[location].totalValue += (item.quantity || 0) * (item.costPerUnit || 0);
      return acc;
    }, {} as Record<string, { count: number; items: InventoryItem[]; totalValue: number }>);

    return Object.entries(stats)
      .map(([name, data]) => ({
        name,
        value: data.count,
        items: data.items,
        percentage: (data.count / items.length * 100).toFixed(1),
        totalValue: data.totalValue.toFixed(2),
        totalQuantity: data.items.reduce((sum, item) => sum + (item.quantity || 0), 0)
      }))
      .sort((a, b) => b.value - a.value);
  }, [items]);

  const activeStats = activeView === 'project' ? projectStats : locationStats;
  const activeProductions = useMemo(
    () =>
      productions
        .filter((production) => production.status !== 'completed' && production.status !== 'cancelled')
        .sort((left, right) => {
          const leftDate = left.startDate ? new Date(left.startDate).getTime() : Number.MAX_SAFE_INTEGER;
          const rightDate = right.startDate ? new Date(right.startDate).getTime() : Number.MAX_SAFE_INTEGER;
          return leftDate - rightDate;
        }),
    [productions]
  );
  const filteredProductions = useMemo(
    () =>
      activeProductions.filter(
        (production) => productionStatusFilter === 'all' || production.status === productionStatusFilter
      ),
    [activeProductions, productionStatusFilter]
  );
  const colors = [
    '#3B82F6', // 2024:NAB - bright blue
    '#10B981', // REMOTE_KIT_BUILD - emerald green
    '#F59E0B', // STUDIO_UPGRADE - amber
    '#F97316', // INFRASTRUCTURE - orange
    '#A78BFA', // Unassigned - purple
    '#84CC16', // 2025:SUTRO - lime green
    '#FCD34D'  // MAINTENANCE - yellow
  ];

  const getTooltipContent = (stat: any) => {
    return `${stat.name}\n${stat.value} items\nTotal Quantity: ${stat.totalQuantity}\nTotal Value: $${stat.totalValue}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          <Button onClick={() => navigate('/inventory')} className="w-full shrink-0 sm:w-auto">
            <Plus className="mr-2 h-4 w-4" />
            Manage Inventory
          </Button>
          <Button variant="outline" onClick={() => navigate('/productions')} className="w-full shrink-0 sm:w-auto">
            <Clapperboard className="mr-2 h-4 w-4" />
            Manage Productions
          </Button>
        </div>
      </div>

      {items.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Welcome to TEd_trackIT</CardTitle>
            <CardDescription>Get started by adding your first inventory items</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p>Your inventory is currently empty. Start by adding some items to track.</p>
            <Button onClick={() => navigate('/inventory')}>
              <Plus className="mr-2 h-4 w-4" />
              Go to Inventory
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <Tabs value={activeView} onValueChange={(value) => setActiveView(value as 'project' | 'location' | 'production')}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="project">By Project</TabsTrigger>
              <TabsTrigger value="location">By Location</TabsTrigger>
              <TabsTrigger value="production">By Production</TabsTrigger>
            </TabsList>

            <TabsContent value="project" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle>Items by Project</CardTitle>
                  <CardDescription>Distribution of inventory items across projects</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col items-center gap-8 lg:flex-row lg:items-start lg:gap-12">
                    <div className="relative h-[min(300px,70vw)] w-[min(300px,70vw)] shrink-0">
                      <div className="absolute inset-0 flex items-center justify-center">
                        <svg viewBox="0 0 100 100" className="w-full h-full">
                          {activeStats.map((stat, index) => {
                            const startAngle = activeStats
                              .slice(0, index)
                              .reduce((sum, s) => sum + (Number(s.value) / items.length) * 360, 0);
                            const endAngle = startAngle + (stat.value / items.length) * 360;
                            const x1 = 50 + 40 * Math.cos((startAngle - 90) * Math.PI / 180);
                            const y1 = 50 + 40 * Math.sin((startAngle - 90) * Math.PI / 180);
                            const x2 = 50 + 40 * Math.cos((endAngle - 90) * Math.PI / 180);
                            const y2 = 50 + 40 * Math.sin((endAngle - 90) * Math.PI / 180);
                            const largeArc = endAngle - startAngle > 180 ? 1 : 0;

                            // Calculate position for the text
                            const midAngle = (startAngle + endAngle) / 2;
                            const textX = 50 + 30 * Math.cos((midAngle - 90) * Math.PI / 180);
                            const textY = 50 + 30 * Math.sin((midAngle - 90) * Math.PI / 180);

                            return (
                              <g key={stat.name}>
                                <title>{getTooltipContent(stat)}</title>
                                <path
                                  d={`M 50 50 L ${x1} ${y1} A 40 40 0 ${largeArc} 1 ${x2} ${y2} Z`}
                                  fill={colors[index % colors.length]}
                                  className="cursor-pointer hover:opacity-90 transition-opacity"
                                  onMouseEnter={() => setActiveSegment(stat.name)}
                                  onMouseLeave={() => setActiveSegment(null)}
                                  onClick={() => navigate(`/inventory?${activeView}=${encodeURIComponent(stat.name)}`)}
                                  opacity="0"
                                >
                                  <animate
                                    attributeName="opacity"
                                    from="0"
                                    to="1"
                                    dur="0.3s"
                                    begin={`${index * 0.1}s`}
                                    fill="freeze"
                                    calcMode="spline"
                                    keySplines="0.4 0 0.2 1"
                                  />
                                </path>
                                <text
                                  x={textX}
                                  y={textY}
                                  textAnchor="middle"
                                  dominantBaseline="middle"
                                  fill="white"
                                  fontSize="4"
                                  className="select-none pointer-events-none font-medium"
                                  opacity="0"
                                >
                                  {stat.value}
                                  <animate
                                    attributeName="opacity"
                                    from="0"
                                    to="1"
                                    dur="0.3s"
                                    begin={`${index * 0.1 + 0.15}s`}
                                    fill="freeze"
                                    calcMode="spline"
                                    keySplines="0.4 0 0.2 1"
                                  />
                                </text>
                              </g>
                            );
                          })}
                        </svg>
                      </div>
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-col gap-6 xl:flex-row xl:gap-16">
                        <div className="min-w-0 flex-1">
                          {activeStats.slice(0, Math.ceil(activeStats.length / 2)).map((stat, index) => (
                            <div
                              key={stat.name}
                              className={`flex items-center gap-3 mb-4 cursor-pointer ${
                                activeSegment === stat.name ? 'opacity-100' : 'opacity-80'
                              }`}
                              onClick={() => navigate(`/inventory?${activeView}=${encodeURIComponent(stat.name)}`)}
                              onMouseEnter={() => setActiveSegment(stat.name)}
                              onMouseLeave={() => setActiveSegment(null)}
                            >
                              <div
                                className="w-4 h-4 rounded-full flex-shrink-0"
                                style={{ backgroundColor: colors[index % colors.length] }}
                              />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-2">
                                  <span 
                                    className="font-medium truncate"
                                    style={{ color: colors[index % colors.length] }}
                                  >
                                    {stat.name}
                                  </span>
                                  <span className="text-sm text-muted-foreground whitespace-nowrap">
                                    {stat.value} items
                                  </span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                        <div className="min-w-0 flex-1">
                          {activeStats.slice(Math.ceil(activeStats.length / 2)).map((stat, index) => (
                            <div
                              key={stat.name}
                              className={`flex items-center gap-3 mb-4 cursor-pointer ${
                                activeSegment === stat.name ? 'opacity-100' : 'opacity-80'
                              }`}
                              onClick={() => navigate(`/inventory?${activeView}=${encodeURIComponent(stat.name)}`)}
                              onMouseEnter={() => setActiveSegment(stat.name)}
                              onMouseLeave={() => setActiveSegment(null)}
                            >
                              <div
                                className="w-4 h-4 rounded-full flex-shrink-0"
                                style={{ backgroundColor: colors[(index + Math.ceil(activeStats.length / 2)) % colors.length] }}
                              />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-2">
                                  <span 
                                    className="font-medium truncate"
                                    style={{ color: colors[(index + Math.ceil(activeStats.length / 2)) % colors.length] }}
                                  >
                                    {stat.name}
                                  </span>
                                  <span className="text-sm text-muted-foreground whitespace-nowrap">
                                    {stat.value} items
                                  </span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="location" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle>Items by Location</CardTitle>
                  <CardDescription>Distribution of inventory items across locations</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col items-center gap-8 lg:flex-row lg:items-start lg:gap-12">
                    <div className="relative h-[min(300px,70vw)] w-[min(300px,70vw)] shrink-0">
                      <div className="absolute inset-0 flex items-center justify-center">
                        <svg viewBox="0 0 100 100" className="w-full h-full">
                          {activeStats.map((stat, index) => {
                            const startAngle = activeStats
                              .slice(0, index)
                              .reduce((sum, s) => sum + (Number(s.value) / items.length) * 360, 0);
                            const endAngle = startAngle + (stat.value / items.length) * 360;
                            const x1 = 50 + 40 * Math.cos((startAngle - 90) * Math.PI / 180);
                            const y1 = 50 + 40 * Math.sin((startAngle - 90) * Math.PI / 180);
                            const x2 = 50 + 40 * Math.cos((endAngle - 90) * Math.PI / 180);
                            const y2 = 50 + 40 * Math.sin((endAngle - 90) * Math.PI / 180);
                            const largeArc = endAngle - startAngle > 180 ? 1 : 0;

                            // Calculate position for the text
                            const midAngle = (startAngle + endAngle) / 2;
                            const textX = 50 + 30 * Math.cos((midAngle - 90) * Math.PI / 180);
                            const textY = 50 + 30 * Math.sin((midAngle - 90) * Math.PI / 180);

                            return (
                              <g key={stat.name}>
                                <title>{getTooltipContent(stat)}</title>
                                <path
                                  d={`M 50 50 L ${x1} ${y1} A 40 40 0 ${largeArc} 1 ${x2} ${y2} Z`}
                                  fill={colors[index % colors.length]}
                                  className="cursor-pointer hover:opacity-90 transition-opacity"
                                  onMouseEnter={() => setActiveSegment(stat.name)}
                                  onMouseLeave={() => setActiveSegment(null)}
                                  onClick={() => navigate(`/inventory?${activeView}=${encodeURIComponent(stat.name)}`)}
                                  opacity="0"
                                >
                                  <animate
                                    attributeName="opacity"
                                    from="0"
                                    to="1"
                                    dur="0.3s"
                                    begin={`${index * 0.1}s`}
                                    fill="freeze"
                                    calcMode="spline"
                                    keySplines="0.4 0 0.2 1"
                                  />
                                </path>
                                <text
                                  x={textX}
                                  y={textY}
                                  textAnchor="middle"
                                  dominantBaseline="middle"
                                  fill="white"
                                  fontSize="4"
                                  className="select-none pointer-events-none font-medium"
                                  opacity="0"
                                >
                                  {stat.value}
                                  <animate
                                    attributeName="opacity"
                                    from="0"
                                    to="1"
                                    dur="0.3s"
                                    begin={`${index * 0.1 + 0.15}s`}
                                    fill="freeze"
                                    calcMode="spline"
                                    keySplines="0.4 0 0.2 1"
                                  />
                                </text>
                              </g>
                            );
                          })}
                        </svg>
                      </div>
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-col gap-6 xl:flex-row xl:gap-16">
                        <div className="min-w-0 flex-1">
                          {activeStats.slice(0, Math.ceil(activeStats.length / 2)).map((stat, index) => (
                            <div
                              key={stat.name}
                              className={`flex items-center gap-3 mb-4 cursor-pointer ${
                                activeSegment === stat.name ? 'opacity-100' : 'opacity-80'
                              }`}
                              onClick={() => navigate(`/inventory?${activeView}=${encodeURIComponent(stat.name)}`)}
                              onMouseEnter={() => setActiveSegment(stat.name)}
                              onMouseLeave={() => setActiveSegment(null)}
                            >
                              <div
                                className="w-4 h-4 rounded-full flex-shrink-0"
                                style={{ backgroundColor: colors[index % colors.length] }}
                              />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-2">
                                  <span 
                                    className="font-medium truncate"
                                    style={{ color: colors[index % colors.length] }}
                                  >
                                    {stat.name}
                                  </span>
                                  <span className="text-sm text-muted-foreground whitespace-nowrap">
                                    {stat.value} items
                                  </span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                        <div className="min-w-0 flex-1">
                          {activeStats.slice(Math.ceil(activeStats.length / 2)).map((stat, index) => (
                            <div
                              key={stat.name}
                              className={`flex items-center gap-3 mb-4 cursor-pointer ${
                                activeSegment === stat.name ? 'opacity-100' : 'opacity-80'
                              }`}
                              onClick={() => navigate(`/inventory?${activeView}=${encodeURIComponent(stat.name)}`)}
                              onMouseEnter={() => setActiveSegment(stat.name)}
                              onMouseLeave={() => setActiveSegment(null)}
                            >
                              <div
                                className="w-4 h-4 rounded-full flex-shrink-0"
                                style={{ backgroundColor: colors[(index + Math.ceil(activeStats.length / 2)) % colors.length] }}
                              />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-2">
                                  <span 
                                    className="font-medium truncate"
                                    style={{ color: colors[(index + Math.ceil(activeStats.length / 2)) % colors.length] }}
                                  >
                                    {stat.name}
                                  </span>
                                  <span className="text-sm text-muted-foreground whitespace-nowrap">
                                    {stat.value} items
                                  </span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="production" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle>Active Productions</CardTitle>
                  <CardDescription>Current productions in planning, confirmed, or in-progress stages</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="mb-3 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant={productionStatusFilter === 'all' ? 'default' : 'outline'}
                      onClick={() => setProductionStatusFilter('all')}
                    >
                      All Active
                    </Button>
                    {ACTIVE_PRODUCTION_STATUS_FILTERS.map((status) => (
                      <Button
                        key={status}
                        size="sm"
                        variant={productionStatusFilter === status ? 'default' : 'outline'}
                        onClick={() => setProductionStatusFilter(status)}
                      >
                        {PRODUCTION_STATUS_LABELS[status]}
                      </Button>
                    ))}
                  </div>
                  {filteredProductions.length === 0 ? (
                    <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                      No productions match this filter.
                    </div>
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {filteredProductions.map((production) => {
                        const progressSnapshot = getProductionProgressSnapshot(production);
                        return (
                        <button
                          key={production.id}
                          type="button"
                          onClick={() => navigate(`/productions?productionId=${encodeURIComponent(production.id)}`)}
                          className="rounded-lg border border-border/70 bg-card p-3 text-left shadow-sm shadow-black/10 outline-none ring-offset-background transition-[box-shadow,background-color,border-color] hover:border-border hover:bg-card hover:shadow-md hover:shadow-black/15 focus-visible:ring-2 focus-visible:ring-ring dark:border-border/50 dark:bg-card/90 dark:shadow-black/35 dark:hover:shadow-black/45"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <p className="font-medium">{production.name}</p>
                            <span
                              className={cn(
                                'rounded-full border px-2 py-0.5 text-xs',
                                PRODUCTION_STATUS_BADGE_CLASSES[production.status],
                              )}
                            >
                              {PRODUCTION_STATUS_LABELS[production.status]}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {production.startDate ? `Start: ${production.startDate}` : 'Start date not set'}
                            {production.location ? ` • ${production.location}` : ''}
                          </p>
                          <div className="mt-3">
                            <ProductionDashboardProgress metrics={progressSnapshot} />
                          </div>
                        </button>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          <Card>
            <CardHeader>
              <CardTitle>Quick Filters</CardTitle>
              <CardDescription>Jump to filtered inventory views</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" className="flex items-center gap-2" onClick={() => navigate('/inventory')}>
                  <Filter className="h-4 w-4" />
                  All Items
                </Button>
                <Button variant="outline" className="flex items-center gap-2" onClick={() => navigate('/productions')}>
                  <Clapperboard className="h-4 w-4" />
                  Productions
                </Button>
                {activeStats.slice(0, 5).map((stat, index) => (
                  <Button
                    key={stat.name}
                    variant="outline"
                    className="flex items-center gap-2 relative pl-6"
                    onClick={() => navigate(`/inventory?${activeView}=${encodeURIComponent(stat.name)}`)}
                  >
                    <div 
                      className="absolute left-0 top-0 bottom-0 w-2 rounded-l-md"
                      style={{ backgroundColor: colors[index % colors.length] }}
                    />
                    {stat.name}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}