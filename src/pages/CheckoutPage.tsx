import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { getItems, getSettings, saveItems } from '@/lib/storageService'
import type { InventoryItem } from '@/types/inventory'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { SimpleBarcodeScanner } from '@/components/SimpleBarcodeScanner'
import { toast } from 'sonner'
import { useAuth } from '@/contexts/AuthContext'
import { SettingsService } from '@/lib/settingsService'
import { SETTINGS_UPDATED_EVENT } from '@/lib/storageService'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { Cabinet } from '@/types/cabinets'
import { format } from 'date-fns'
import { logger } from '@/lib/logging'
import { LogEntry } from '@/lib/logging'
import { Badge } from '@/components/ui/badge'
import { ActionRail, type ActionRailItem } from '@/components/ui/action-rail'
import { useHorizontalScrollHints } from '@/components/ui/useHorizontalScrollHints'
import { ArrowDownUp, Building2, ChevronLeft, ChevronRight, Clock3, ScanLine, Trash2 } from 'lucide-react'
import {
  getInventoryProductionAllocationMap,
  INVENTORY_PRODUCTION_ALLOCATION_UPDATED_EVENT,
} from '@/lib/productionService'
import { PageHeader } from '@/components/ui/page-shell'

export default function CheckoutPage() {
  const [items, setItems] = useState<InventoryItem[]>([])
  const [selectedItemId, setSelectedItemId] = useState<string>('')
  const [selectedCabinetId, setSelectedCabinetId] = useState<string>('')
  const [quantity, setQuantity] = useState<string>('1')
  const [cabinets, setCabinets] = useState<Cabinet[]>([])
  const [recentActivities, setRecentActivities] = useState<LogEntry[]>([])
  const [activityView, setActivityView] = useState<'list' | 'cabinet'>('list')
  const [activitySortBy, setActivitySortBy] = useState<'cabinet' | 'time'>('time')
  const [activitySortDirection, setActivitySortDirection] = useState<'asc' | 'desc'>('desc')
  const [activityTypeFilter, setActivityTypeFilter] = useState<'all' | 'check-in' | 'check-out'>('all')
  const [activitySearchQuery, setActivitySearchQuery] = useState('')
  const [scannerOpen, setScannerOpen] = useState(false)
  const [scannerMode, setScannerMode] = useState<'check-in' | 'check-out'>('check-out')
  const {
    scrollRef: activityTabsListRef,
    isOverflowing: isActivityTabsOverflowing,
    canScrollLeft: canActivityTabsScrollLeft,
    canScrollRight: canActivityTabsScrollRight,
    shouldPulseRightHint: shouldPulseActivityTabsHint,
  } = useHorizontalScrollHints<HTMLDivElement>({
    pulseStorageKey: 'checkout-activity-tabs-hint-pulsed',
  });
  const [searchParams] = useSearchParams()
  const { currentUser } = useAuth()
  const [settings, setSettings] = useState({
    requireCheckoutForSecureCabinets: true
  })
  const [locationAliasById, setLocationAliasById] = useState<Record<string, string>>({})
  const [productionAllocationMap, setProductionAllocationMap] = useState(getInventoryProductionAllocationMap())

  useEffect(() => {
    const loadData = async () => {
      const inventoryItems = getItems()
      const loadedCabinets = await SettingsService.getCabinets()
      const loadedSettings = SettingsService.loadDefaultSettings()
      const inventorySettings = getSettings()
      const aliases: Record<string, string> = {}
      ;(inventorySettings.locations || []).forEach((location) => {
        aliases[location.id] = location.name
        aliases[location.name] = location.name
        ;(location.children || []).forEach((child) => {
          aliases[child.id] = location.name
          aliases[`${location.id}/${child.id}`] = location.name
          aliases[`${location.name}/${child.name}`] = location.name
          aliases[child.name] = location.name
        })
      })

      setItems(inventoryItems)
      setCabinets(loadedCabinets)
      setSettings(loadedSettings)
      setLocationAliasById(aliases)
    }

    const handleSettingsUpdated = () => {
      void loadData()
    }

    void loadData()
    window.addEventListener(SETTINGS_UPDATED_EVENT, handleSettingsUpdated)
    window.addEventListener('focus', handleSettingsUpdated)
    return () => {
      window.removeEventListener(SETTINGS_UPDATED_EVENT, handleSettingsUpdated)
      window.removeEventListener('focus', handleSettingsUpdated)
    }
  }, [])

  useEffect(() => {
    const syncAllocations = () => {
      setProductionAllocationMap(getInventoryProductionAllocationMap())
    }
    syncAllocations()
    window.addEventListener(INVENTORY_PRODUCTION_ALLOCATION_UPDATED_EVENT, syncAllocations)
    window.addEventListener('focus', syncAllocations)
    return () => {
      window.removeEventListener(INVENTORY_PRODUCTION_ALLOCATION_UPDATED_EVENT, syncAllocations)
      window.removeEventListener('focus', syncAllocations)
    }
  }, [])

  useEffect(() => {
    const cabinetFromQuery = searchParams.get('cabinet');
    if (cabinetFromQuery) {
      setSelectedCabinetId(cabinetFromQuery);
    }
  }, [searchParams]);

  // Load recent activities from logger
  useEffect(() => {
    const persistedActivities = localStorage.getItem('checkout-recent-activities');
    if (persistedActivities) {
      try {
        setRecentActivities(JSON.parse(persistedActivities));
        return;
      } catch {
        // fall back to logger snapshot below
      }
    }
    const logs = logger.getLogs();
    const checkoutLogs = logs.filter((log) => log.message === 'ITEM_CHECKOUT' || log.message === 'ITEM_CHECKIN');
    setRecentActivities(checkoutLogs);
  }, []);

  const parseScanCandidates = (decodedText: string): string[] => {
    const trimmedValue = decodedText.trim();
    const candidates = new Set<string>();
    if (trimmedValue.length > 0) {
      candidates.add(trimmedValue);
    }

    try {
      const parsedUrl = new URL(trimmedValue);
      const queryKeys = ['assetId', 'recordId', 'id', 'code'];
      queryKeys.forEach((key) => {
        const value = parsedUrl.searchParams.get(key);
        if (value) {
          candidates.add(value.trim());
        }
      });
      const pathSegments = parsedUrl.pathname.split('/').filter(Boolean);
      const tail = pathSegments[pathSegments.length - 1];
      if (tail) {
        candidates.add(tail.trim());
      }
    } catch {
      // Not a URL payload; continue.
    }

    try {
      const parsedJson = JSON.parse(trimmedValue) as Record<string, unknown>;
      ['assetId', 'recordId', 'id', 'code'].forEach((key) => {
        const value = parsedJson[key];
        if (typeof value === 'string' && value.trim()) {
          candidates.add(value.trim());
        }
      });
    } catch {
      // Not JSON payload; continue.
    }

    return Array.from(candidates);
  };

  const findScannedItemId = (
    decodedText: string,
    sourceItems: InventoryItem[],
  ): string | null => {
    const candidates = parseScanCandidates(decodedText).map((value) => value.toLowerCase());
    if (candidates.length === 0) {
      return null;
    }
    const matchedItem = sourceItems.find((item) => {
      const probes = [item.assetId, item.recordId, item.id]
        .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
        .map((value) => value.toLowerCase());
      return probes.some((probe) => candidates.includes(probe));
    });
    return matchedItem?.id ?? null;
  };

  const resolveSecureCabinetForItem = (
    item: InventoryItem,
    preferredCabinetId?: string
  ): Cabinet | null => {
    const itemTopLocation = resolveTopLevelLocation(item.location).toLowerCase();
    const secureCabinetsOnly = cabinets.filter((cabinet) => cabinet.isSecure);
    if (secureCabinetsOnly.length === 0) {
      return null;
    }

    if (preferredCabinetId) {
      const preferredCabinet = secureCabinetsOnly.find((cabinet) => cabinet.id === preferredCabinetId);
      if (preferredCabinet) {
        const preferredTopLocation = resolveTopLevelLocation(preferredCabinet.locationId).toLowerCase();
        if (!itemTopLocation || preferredTopLocation === itemTopLocation) {
          return preferredCabinet;
        }
      }
    }

    const matchedByLocation = secureCabinetsOnly.find((cabinet) => {
      const cabinetTopLocation = resolveTopLevelLocation(cabinet.locationId).toLowerCase();
      return itemTopLocation.length > 0 && cabinetTopLocation === itemTopLocation;
    });

    return matchedByLocation ?? null;
  };

  const handleAction = async (
    action: 'check-in' | 'check-out',
    options?: { itemId?: string; quantityOverride?: number; fromScanner?: boolean; cabinetId?: string }
  ) => {
    try {
      const targetItemId = options?.itemId ?? selectedItemId;
      const targetCabinetId = options?.cabinetId ?? selectedCabinetId;
      const targetQuantity = options?.quantityOverride ?? Number(quantity);
      if (!targetItemId || !Number.isFinite(targetQuantity) || targetQuantity <= 0) {
        toast.error('Please select an item and enter a valid quantity');
        return;
      }

      if (!targetCabinetId) {
        toast.error('Please select a cabinet');
        return;
      }

      const selectedCabinet = cabinets.find(c => c.id === targetCabinetId);
      if (!selectedCabinet) {
        toast.error('Selected cabinet not found');
        return;
      }

      if (!(settings.requireCheckoutForSecureCabinets && selectedCabinet.isSecure)) {
        toast.error('This cabinet does not require check-in/out');
        return;
      }

      const numQuantity = targetQuantity
      const selectedItem = items.find(item => item.id === targetItemId)
      
      if (!selectedItem) {
        toast.error('Selected item not found')
        return
      }

      const allocation = productionAllocationMap[selectedItem.id]
      const reserved = Number(allocation?.reserved ?? 0)
      const availableForCheckout = Math.max(0, Number(selectedItem.quantity || 0) - reserved)

      if (action === 'check-out' && availableForCheckout < numQuantity) {
        toast.error('Not enough items available')
        return
      }

      const updatedItems = items.map(item => {
        if (item.id === targetItemId) {
          const newQuantity = action === 'check-out' 
            ? Math.max(0, (item.quantity || 0) - numQuantity)
            : (item.quantity || 0) + numQuantity
          
          return {
            ...item,
            quantity: newQuantity,
            lastUpdated: new Date()
          }
        }
        return item
      })

      if (!saveItems(updatedItems)) {
        toast.error('Could not save inventory after check-in/out.', {
          description: 'Browser storage may be full. Export a backup or free space, then try again.',
        });
        return;
      }
      setItems(updatedItems)
      
      // Log the activity
      logger.info('audit', action === 'check-out' ? 'ITEM_CHECKOUT' : 'ITEM_CHECKIN', {
        itemId: targetItemId,
        itemName: selectedItem?.name,
        quantity: numQuantity,
        cabinetId: targetCabinetId,
        cabinetName: selectedCabinet.name,
        performedBy: currentUser?.username
      }, 'CheckoutPage');
      
      toast.success(`Successfully ${action === 'check-out' ? 'checked out' : 'checked in'} ${numQuantity} ${selectedItem?.name}`)
      
      // Reset form
      if (options?.fromScanner) {
        setSelectedCabinetId(targetCabinetId);
        setSelectedItemId(targetItemId);
      } else {
        setSelectedItemId('')
        setSelectedCabinetId('')
        setQuantity('1')
      }

      // Persist recent activities until explicitly cleared.
      const logs = logger.getLogs();
      const checkoutLogs = logs.filter((log) => log.message === 'ITEM_CHECKOUT' || log.message === 'ITEM_CHECKIN');
      setRecentActivities(checkoutLogs);
      localStorage.setItem('checkout-recent-activities', JSON.stringify(checkoutLogs));
    } catch (error) {
      console.error('Error during check-in/out:', error)
      toast.error('Failed to process check-in/out')
    }
  }

  const secureCabinets = cabinets.filter(cabinet => cabinet.isSecure)
  const selectedCabinet = cabinets.find((cabinet) => cabinet.id === selectedCabinetId);
  const resolveTopLevelLocation = (locationValue: string | undefined) => {
    if (!locationValue) return '';
    const normalized = locationValue.split('/')[0];
    return locationAliasById[normalized] || locationAliasById[locationValue] || normalized;
  };
  const cabinetScopedItems = selectedCabinet
    ? items.filter((item) => {
        const itemLocation = resolveTopLevelLocation(item.location).toLowerCase();
        const cabinetLocation = resolveTopLevelLocation(selectedCabinet.locationId).toLowerCase();
        if (!cabinetLocation) return true;
        return itemLocation === cabinetLocation;
      })
    : [];

  const normalizedActivities = recentActivities
    .filter((activity) => activity.message === 'ITEM_CHECKOUT' || activity.message === 'ITEM_CHECKIN')
    .map((activity, index) => ({
      id: `${activity.timestamp}-${index}`,
      type: activity.message === 'ITEM_CHECKOUT' ? 'check-out' as const : 'check-in' as const,
      cabinetName: String(activity.details?.cabinetName ?? 'Unknown'),
      itemName: String(activity.details?.itemName ?? 'Unknown Item'),
      quantity: Number(activity.details?.quantity ?? 0),
      performedBy: String(activity.details?.performedBy ?? 'unknown'),
      timestamp: new Date(activity.timestamp),
    }));

  const filteredActivityList = normalizedActivities.filter((activity) => {
    const matchesType = activityTypeFilter === 'all' || activity.type === activityTypeFilter;
    const normalizedQuery = activitySearchQuery.trim().toLowerCase();
    const matchesQuery =
      !normalizedQuery ||
      [activity.itemName, activity.cabinetName, activity.performedBy].join(' ').toLowerCase().includes(normalizedQuery);
    return matchesType && matchesQuery;
  });

  const sortedActivityList = [...filteredActivityList].sort((left, right) => {
    const directionMultiplier = activitySortDirection === 'asc' ? 1 : -1;
    if (activitySortBy === 'cabinet') {
      const compareCabinet = left.cabinetName.localeCompare(right.cabinetName);
      if (compareCabinet !== 0) {
        return compareCabinet * directionMultiplier;
      }
    }
    return (left.timestamp.getTime() - right.timestamp.getTime()) * directionMultiplier;
  });

  const activityActionItems: ActionRailItem[] = [
    {
      id: 'toggle-sort-by',
      label: activitySortBy === 'time' ? 'Sorting by time/date' : 'Sorting by cabinet',
      icon: activitySortBy === 'time' ? <Clock3 className="h-4 w-4" /> : <Building2 className="h-4 w-4" />,
      onClick: () => setActivitySortBy((previous) => (previous === 'time' ? 'cabinet' : 'time')),
      active: activitySortBy === 'cabinet',
    },
    {
      id: 'toggle-sort-direction',
      label: activitySortDirection === 'desc' ? 'Newest first' : 'Oldest first',
      icon: <ArrowDownUp className="h-4 w-4" />,
      onClick: () => setActivitySortDirection((previous) => (previous === 'desc' ? 'asc' : 'desc')),
      active: activitySortDirection === 'asc',
    },
    {
      id: 'clear-activity',
      label: 'Clear activity',
      icon: <Trash2 className="h-4 w-4" />,
      onClick: () => {
        setRecentActivities([]);
        localStorage.setItem('checkout-recent-activities', JSON.stringify([]));
      },
      disabled: sortedActivityList.length === 0,
    },
  ];

  const cabinetActivitySummary = sortedActivityList.reduce((grouped, entry) => {
    if (!grouped[entry.cabinetName]) {
      grouped[entry.cabinetName] = {};
    }
    if (!grouped[entry.cabinetName][entry.itemName]) {
      grouped[entry.cabinetName][entry.itemName] = { checkedIn: 0, checkedOut: 0 };
    }
    if (entry.type === 'check-in') {
      grouped[entry.cabinetName][entry.itemName].checkedIn += entry.quantity;
    } else {
      grouped[entry.cabinetName][entry.itemName].checkedOut += entry.quantity;
    }
    return grouped;
  }, {} as Record<string, Record<string, { checkedIn: number; checkedOut: number }>>);

  const handleCabinetChange = async (cabinetId: string) => {
    setSelectedCabinetId(cabinetId);
  };

  const handleItemChange = async (itemId: string) => {
    setSelectedItemId(itemId);
  };

  const handleQuantityChange = async (value: string) => {
    setQuantity(value);
  };

  const handleOpenScanner = (mode: 'check-in' | 'check-out') => {
    setScannerMode(mode);
    setScannerOpen(true);
  };

  const handleScannerScan = async (decodedText: string) => {
    const scannedItemId = findScannedItemId(decodedText, items);
    if (!scannedItemId) {
      toast.error('Scanned code did not match an inventory item');
      return;
    }
    const scannedItem = items.find((item) => item.id === scannedItemId);
    if (!scannedItem) {
      toast.error('Scanned item was not found');
      return;
    }

    const resolvedCabinet = resolveSecureCabinetForItem(scannedItem, selectedCabinetId);
    if (!resolvedCabinet) {
      toast.error('No secure cabinet matched this scanned item location');
      return;
    }

    await handleAction(scannerMode, {
      itemId: scannedItemId,
      quantityOverride: 1,
      fromScanner: true,
      cabinetId: resolvedCabinet.id,
    });
  };

  return (
    <div className="checkout-page mx-auto w-full max-w-3xl min-w-0 space-y-5 px-2 py-2 sm:px-4">
      <PageHeader
        eyebrow="Cabinet workflow"
        title="Secure Cabinet Check-In/Out"
        description="Scan or manually select cabinet inventory, then review recent movement by item or cabinet."
        icon={<ScanLine className="h-6 w-6" aria-hidden />}
      />

      <div className="grid gap-5">
        <Card>
          <CardHeader className="px-4 pb-3 sm:px-6">
            <CardTitle>Check In/Out Items</CardTitle>
            <CardDescription>
              Select a secure cabinet and item to check in or out.
            </CardDescription>
          </CardHeader>
          <CardContent className="relative px-4 pb-4 sm:px-6 sm:pb-6">
            <div className="grid gap-4">
              <div className="grid gap-2">
                <label className="text-sm font-medium">Cabinet</label>
                <Select value={selectedCabinetId} onValueChange={handleCabinetChange}>
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder="Select a cabinet" />
                  </SelectTrigger>
                  <SelectContent>
                    {secureCabinets.map(cabinet => (
                      <SelectItem key={cabinet.id} value={cabinet.id}>
                        {cabinet.name} {cabinet.isSecure ? '(Secure)' : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <label className="text-sm font-medium">Item</label>
                <Select value={selectedItemId} onValueChange={handleItemChange}>
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder="Select an item" />
                  </SelectTrigger>
                  <SelectContent>
                    {(selectedCabinet ? cabinetScopedItems : items).map(item => (
                      <SelectItem key={item.id} value={item.id}>
                        {(() => {
                          const reserved = Number(productionAllocationMap[item.id]?.reserved ?? 0)
                          const available = Math.max(0, Number(item.quantity || 0) - reserved)
                          return `${item.name} (${available} available${reserved > 0 ? `, ${reserved} reserved` : ''})`
                        })()}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <label className="text-sm font-medium">Quantity</label>
                <Input
                  type="number"
                  min="1"
                  value={quantity}
                  onChange={(e) => handleQuantityChange(e.target.value)}
                  onFocus={(e) => e.target.select()}
                  placeholder="Enter quantity"
                  className="h-11"
                />
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2 sm:gap-3 sm:pt-4">
                <Button
                  variant="outline"
                  className="h-11 w-full border-ti-success bg-ti-success-soft text-ti-success hover:bg-ti-success-soft"
                  onClick={() => handleAction('check-in')}
                >
                  Check In
                </Button>
                <Button
                  variant="outline"
                  className="h-11 w-full border-destructive bg-ti-danger-soft text-destructive hover:bg-ti-danger-soft"
                  onClick={() => handleAction('check-out')}
                >
                  Check Out
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 w-full"
                  onClick={() => handleOpenScanner('check-in')}
                >
                  <ScanLine className="mr-2 h-4 w-4" />
                  Scan Check In
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 w-full"
                  onClick={() => handleOpenScanner('check-out')}
                >
                  <ScanLine className="mr-2 h-4 w-4" />
                  Scan Check Out
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="px-4 pb-3 sm:px-6">
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>
              Recent check-ins and check-outs from secure cabinets
            </CardDescription>
          </CardHeader>
          <CardContent className="relative px-4 pb-4 sm:px-6 sm:pb-6">
            <Tabs value={activityView} onValueChange={(value) => setActivityView(value as 'list' | 'cabinet')}>
              <div className="mb-3 flex flex-col gap-3">
                  <div className="rounded-lg border bg-muted/45 p-2 shadow-ti-sm">
                  <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
                    <Input
                      value={activitySearchQuery}
                      onChange={(event) => setActivitySearchQuery(event.target.value)}
                      placeholder="Search activity by item, cabinet, or user..."
                      className="h-8 text-sm"
                    />
                    <Select
                      value={activityTypeFilter}
                      onValueChange={(value) => setActivityTypeFilter(value as 'all' | 'check-in' | 'check-out')}
                    >
                      <SelectTrigger className="h-8 w-full sm:w-[150px]">
                        <SelectValue placeholder="Filter type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All activity</SelectItem>
                        <SelectItem value="check-in">Check-ins</SelectItem>
                        <SelectItem value="check-out">Check-outs</SelectItem>
                      </SelectContent>
                    </Select>
                    <div className="flex items-center text-xs text-muted-foreground">
                      {sortedActivityList.length} result{sortedActivityList.length === 1 ? '' : 's'}
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md border border-border/80 bg-card px-2 py-1.5">
                    <span className="text-xs font-medium text-foreground/90">Legend:</span>
                    <Badge className="border border-green-300 bg-green-100 text-green-800 dark:border-green-500/40 dark:bg-green-600/20 dark:text-green-200">
                      Check In
                    </Badge>
                    <Badge className="border border-red-300 bg-red-100 text-red-800 dark:border-red-500/40 dark:bg-red-600/20 dark:text-red-200">
                      Check Out
                    </Badge>
                  </div>
                </div>
                <div
                  className="scroll-hints-shell relative"
                  data-overflowing={isActivityTabsOverflowing ? 'true' : 'false'}
                  data-can-scroll-left={canActivityTabsScrollLeft ? 'true' : 'false'}
                  data-can-scroll-right={canActivityTabsScrollRight ? 'true' : 'false'}
                >
                  <TabsList
                    ref={activityTabsListRef}
                    className="h-auto w-full justify-start overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                  >
                    <TabsTrigger value="list">All Recent Activity</TabsTrigger>
                    <TabsTrigger value="cabinet">By Cabinet</TabsTrigger>
                  </TabsList>
                  <div className="scroll-hint scroll-hint-left" aria-hidden>
                    <ChevronLeft className="h-4 w-4" />
                  </div>
                  <div
                    className={`scroll-hint scroll-hint-right${shouldPulseActivityTabsHint ? ' scroll-hint-pulse-once' : ''}`}
                    aria-hidden
                  >
                    <ChevronRight className="h-4 w-4" />
                  </div>
                </div>
                {activityView === 'list' && (
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <ActionRail
                        items={activityActionItems}
                        pulseStorageKey="checkout-activity-actions-pulsed"
                      />
                    </div>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="shrink-0 text-xs text-muted-foreground">
                            {activitySortBy === 'time' ? 'Time' : 'Cabinet'} · {activitySortDirection === 'desc' ? 'Newest' : 'Oldest'}
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          Tap clock/building to change grouping; arrow swaps newest/oldest.
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                )}
              </div>

              <TabsContent value="list" className="space-y-3">
                {sortedActivityList.length > 0 ? (
                  sortedActivityList.map((activity) => (
                    <div
                      key={activity.id}
                      className={`grid gap-2 rounded-md border p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start ${
                        activity.type === 'check-in'
                          ? 'border-green-700/40 bg-green-900/20'
                          : 'border-red-700/40 bg-red-900/20'
                      }`}
                    >
                      <div>
                        <p className="font-medium">
                          {activity.type === 'check-out' ? 'Checked Out' : 'Checked In'}: {activity.quantity}x {activity.itemName}
                        </p>
                        <p className="text-sm text-muted-foreground break-words">
                          Cabinet: {activity.cabinetName} | By: {activity.performedBy}
                        </p>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {format(activity.timestamp, 'MMM d, h:mm a')}
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">No recent activity</p>
                )}
              </TabsContent>

              <TabsContent value="cabinet" className="space-y-4">
                {Object.keys(cabinetActivitySummary).length > 0 ? (
                  Object.entries(cabinetActivitySummary).map(([cabinetName, itemSummary]) => (
                    <div key={cabinetName} className="rounded-md border p-3">
                      <h3 className="mb-2 text-sm font-semibold">{cabinetName}</h3>
                      <div className="space-y-2">
                        {Object.entries(itemSummary).map(([itemName, totals]) => (
                          <div key={itemName} className="grid grid-cols-1 gap-2 rounded-md border border-border/50 p-2 text-sm sm:grid-cols-[minmax(0,2fr)_1fr_1fr_1fr] sm:items-center sm:border-0 sm:p-0">
                            <div className="font-medium break-words">{itemName}</div>
                            <div className="rounded border border-green-700/40 bg-green-900/20 px-2 py-1 text-center text-green-200">
                              In: {totals.checkedIn}
                            </div>
                            <div className="rounded border border-red-700/40 bg-red-900/20 px-2 py-1 text-center text-red-200">
                              Out: {totals.checkedOut}
                            </div>
                            <div className="text-center text-muted-foreground">
                              Net: {totals.checkedIn - totals.checkedOut}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">No cabinet activity yet</p>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
      <SimpleBarcodeScanner
        isOpen={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScan={(result) => {
          void handleScannerScan(result);
        }}
        quiet
      />
    </div>
  )
} 