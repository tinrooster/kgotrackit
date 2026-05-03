import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { getItems, getSettings, saveItems } from '@/lib/storageService'
import type { InventoryItem } from '@/types/inventory'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { toast } from 'sonner'
import { useAuth } from '@/contexts/AuthContext'
import { SettingsService } from '@/lib/settingsService'
import { SETTINGS_UPDATED_EVENT } from '@/lib/storageService'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { Cabinet } from '@/types/cabinets'
import { format } from 'date-fns'
import { logger } from '@/lib/logging'
import { LogEntry } from '@/lib/logging'

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
  const [searchParams] = useSearchParams()
  const { currentUser } = useAuth()
  const [settings, setSettings] = useState({
    requireCheckoutForSecureCabinets: true
  })
  const [locationAliasById, setLocationAliasById] = useState<Record<string, string>>({})

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

  const handleAction = async (action: 'check-in' | 'check-out') => {
    try {
      console.log(`[${action.toUpperCase()}] Starting ${action} action`, {
        itemId: selectedItemId,
        quantity,
        cabinetId: selectedCabinetId
      });

      if (!selectedItemId || !quantity || isNaN(Number(quantity)) || Number(quantity) <= 0) {
        const error = 'Invalid item or quantity';
        console.log(`[ERROR] ${error}`, { selectedItemId, quantity });
        logger.error('audit', error, { selectedItemId, quantity }, 'CheckoutPage');
        toast.error('Please select an item and enter a valid quantity');
        return;
      }

      if (!selectedCabinetId) {
        const error = 'No cabinet selected';
        console.log(`[ERROR] ${error}`);
        logger.error('audit', error, {}, 'CheckoutPage');
        toast.error('Please select a cabinet');
        return;
      }

      const selectedCabinet = cabinets.find(c => c.id === selectedCabinetId);
      if (!selectedCabinet) {
        const error = 'Selected cabinet not found';
        console.log(`[ERROR] ${error}`, { cabinetId: selectedCabinetId });
        logger.error('audit', error, { cabinetId: selectedCabinetId }, 'CheckoutPage');
        toast.error('Selected cabinet not found');
        return;
      }

      // Check if cabinet is secure and requires checkout
      if (settings.requireCheckoutForSecureCabinets && selectedCabinet.isSecure) {
        console.log('[INFO] Processing secure cabinet transaction', {
          cabinet: selectedCabinet.name,
          isSecure: selectedCabinet.isSecure
        });
      } else {
        const error = 'Cabinet does not require check-in/out';
        console.log(`[ERROR] ${error}`, { cabinet: selectedCabinet });
        logger.error('audit', error, { cabinetId: selectedCabinetId, cabinetName: selectedCabinet.name, isSecure: selectedCabinet.isSecure }, 'CheckoutPage');
        toast.error('This cabinet does not require check-in/out');
        return;
      }

      const numQuantity = Number(quantity)
      const selectedItem = items.find(item => item.id === selectedItemId)
      
      if (!selectedItem) {
        toast.error('Selected item not found')
        return
      }

      if (action === 'check-out' && (selectedItem.quantity || 0) < numQuantity) {
        toast.error('Not enough items available')
        return
      }

      const updatedItems = items.map(item => {
        if (item.id === selectedItemId) {
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
        itemId: selectedItemId,
        itemName: selectedItem?.name,
        quantity: numQuantity,
        cabinetId: selectedCabinetId,
        cabinetName: selectedCabinet.name,
        performedBy: currentUser?.username
      }, 'CheckoutPage');
      
      toast.success(`Successfully ${action === 'check-out' ? 'checked out' : 'checked in'} ${numQuantity} ${selectedItem?.name}`)
      
      // Reset form
      setSelectedItemId('')
      setSelectedCabinetId('')
      setQuantity('1')

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

  const sortedActivityList = [...normalizedActivities].sort((left, right) => {
    const directionMultiplier = activitySortDirection === 'asc' ? 1 : -1;
    if (activitySortBy === 'cabinet') {
      const compareCabinet = left.cabinetName.localeCompare(right.cabinetName);
      if (compareCabinet !== 0) {
        return compareCabinet * directionMultiplier;
      }
    }
    return (left.timestamp.getTime() - right.timestamp.getTime()) * directionMultiplier;
  });

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

  // Add logging for selection changes
  const handleCabinetChange = async (cabinetId: string) => {
    console.log('[INFO] Cabinet selected', { cabinetId });
    setSelectedCabinetId(cabinetId);
  };

  const handleItemChange = async (itemId: string) => {
    console.log('[INFO] Item selected', { itemId });
    setSelectedItemId(itemId);
  };

  const handleQuantityChange = async (value: string) => {
    console.log('[INFO] Quantity changed', { value });
    setQuantity(value);
  };

  return (
    <div className="container max-w-4xl py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Secure Cabinet Check-In/Out</h1>
      </div>

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Check In/Out Items</CardTitle>
            <CardDescription>
              Select a secure cabinet and item to check in or out.
            </CardDescription>
          </CardHeader>
          <CardContent className="relative">
            <div className="grid gap-4">
              <div className="grid gap-2">
                <label className="text-sm font-medium">Cabinet</label>
                <Select value={selectedCabinetId} onValueChange={handleCabinetChange}>
                  <SelectTrigger>
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
                  <SelectTrigger>
                    <SelectValue placeholder="Select an item" />
                  </SelectTrigger>
                  <SelectContent>
                    {(selectedCabinet ? cabinetScopedItems : items).map(item => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.name} ({item.quantity || 0} available)
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
                  placeholder="Enter quantity"
                />
              </div>

              <div className="flex gap-4 pt-4">
                <Button
                  variant="outline"
                  className="flex-1 border-green-600 bg-green-50 text-green-900 hover:bg-green-100 dark:border-green-700 dark:bg-green-950/50 dark:text-green-50 dark:hover:bg-green-900/40"
                  onClick={() => handleAction('check-in')}
                >
                  Check In
                </Button>
                <Button
                  variant="outline"
                  className="flex-1 border-red-600 bg-red-50 text-red-900 hover:bg-red-100 dark:border-red-700 dark:bg-red-950/50 dark:text-red-50 dark:hover:bg-red-900/40"
                  onClick={() => handleAction('check-out')}
                >
                  Check Out
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>
              Recent check-ins and check-outs from secure cabinets
            </CardDescription>
          </CardHeader>
          <CardContent className="relative">
            <Tabs value={activityView} onValueChange={(value) => setActivityView(value as 'list' | 'cabinet')}>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <TabsList>
                  <TabsTrigger value="list">All Recent Activity</TabsTrigger>
                  <TabsTrigger value="cabinet">By Cabinet</TabsTrigger>
                </TabsList>
                {activityView === 'list' && (
                  <div className="flex items-center gap-2">
                    <Select value={activitySortBy} onValueChange={(value) => setActivitySortBy(value as 'cabinet' | 'time')}>
                      <SelectTrigger className="w-[160px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="time">Sort by time/date</SelectItem>
                        <SelectItem value="cabinet">Sort by cabinet</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select
                      value={activitySortDirection}
                      onValueChange={(value) => setActivitySortDirection(value as 'asc' | 'desc')}
                    >
                      <SelectTrigger className="w-[120px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="desc">Newest first</SelectItem>
                        <SelectItem value="asc">Oldest first</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setRecentActivities([]);
                        localStorage.setItem('checkout-recent-activities', JSON.stringify([]));
                      }}
                    >
                      Clear Activity
                    </Button>
                  </div>
                )}
              </div>

              <TabsContent value="list" className="space-y-3">
                {sortedActivityList.length > 0 ? (
                  sortedActivityList.map((activity) => (
                    <div
                      key={activity.id}
                      className={`flex items-center justify-between rounded-md border p-3 ${
                        activity.type === 'check-in'
                          ? 'border-green-700/40 bg-green-900/20'
                          : 'border-red-700/40 bg-red-900/20'
                      }`}
                    >
                      <div>
                        <p className="font-medium">
                          {activity.type === 'check-out' ? 'Checked Out' : 'Checked In'}: {activity.quantity}x {activity.itemName}
                        </p>
                        <p className="text-sm text-muted-foreground">
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
                          <div key={itemName} className="grid grid-cols-[2fr_1fr_1fr_1fr] items-center gap-2 text-sm">
                            <div className="font-medium">{itemName}</div>
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
    </div>
  )
} 