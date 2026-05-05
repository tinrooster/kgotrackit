import { useState, useEffect, useRef } from 'react'
import { Save, GripVertical, Upload, Trash2, Pencil, UserPlus, Shield, Key, Camera, SlidersHorizontal, Boxes, Users, HardDrive, ScrollText, Undo2, Redo2, Wrench, Library } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import {
  getItems,
  saveItems,
  getSettings,
  saveSettings,
  saveTemplates,
  parseItemDates,
  STORAGE_KEYS,
  SETTINGS_UPDATED_EVENT,
  type Settings,
} from '@/lib/storageService'
import { buildFullOfflineBackupPayload } from '@/lib/trackItDailyBackup'
import { validateFullBackupJsonText } from '@/lib/backupValidation'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable'
import { restrictToVerticalAxis } from '@dnd-kit/modifiers'
import { CSS } from '@dnd-kit/utilities'
import { InventoryItem, CategoryNode, ItemWithSubcategories } from '@/types/inventory'
import type { ItemTemplate } from '@/types/templates'
import type { Cabinet } from '@/types/cabinets'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { useAuth } from '@/contexts/AuthContext'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { Label } from "@/components/ui/label"
import { getPasswordError } from '@/utils/passwordUtils'
import { v4 as uuidv4 } from 'uuid'
import { DataBackupTab } from "@/components/settings/DataBackupTab"
import { WorkspaceTeamTab } from '@/components/settings/WorkspaceTeamTab'
import { SupabaseWorkspaceUsersCard } from '@/components/settings/SupabaseWorkspaceUsersCard'
import { GeneralSettingsTab } from '@/components/settings/GeneralSettingsTab'
import {
  UserDefinedListsSection,
  type UserDefinedPanel,
} from '@/components/settings/UserDefinedListsSection'
import { LibrariesSection, type LibrariesPanel } from '@/components/settings/LibrariesSection'
import { CameraSettingsDialog } from '@/components/CameraSettingsDialog'
import { SettingsService, type DefaultSettings, defaultSettingsSchema } from '@/lib/settingsService'
import { FinancialCodeEntry, getFinancialSettings, saveFinancialSettings } from '@/lib/financialSettingsService'
import * as XLSX from 'xlsx'
import { SystemLogs } from '@/components/settings/SystemLogs'
import AddUserDialog from '@/components/AddUserDialog'
import { logger } from '@/lib/logging'
import { reconcileInventoryGroup, type GroupReconcileResult } from '@/lib/groupInventoryReconciliation'
import {
  fixUnreconciledForLookupPanel,
  panelSupportsListReconcile,
} from '@/lib/listReconcileFixes'
import { parseDeviceLibraryFromBackup, saveDeviceLibrary } from '@/lib/deviceLibraryStorage'
import { sendAdminSettingsNotification } from '@/lib/supabase/adminNotifications'

interface SettingsState {
  categories: ItemWithSubcategories[];
  units: ItemWithSubcategories[];
  locations: ItemWithSubcategories[];
  suppliers: ItemWithSubcategories[];
  projects: ItemWithSubcategories[];
  expenseCodes: ItemWithSubcategories[];
}

interface ListUndoSnapshot {
  settings: SettingsState;
  items: InventoryItem[];
}

type SettingsKey = keyof SettingsState;

const MAX_LIST_UNDO = 40;

interface ListInfo {
  list: ItemWithSubcategories[];
  title: string;
  key: SettingsKey;
  description: string;
}

const listInfo: Record<SettingsKey, { title: string; description: string }> = {
  categories: {
    title: 'Categories',
    description: 'Manage categories and subcategories for organizing your inventory items'
  },
  units: {
    title: 'Units',
    description: 'Manage units of measurement for your inventory items'
  },
  locations: {
    title: 'Locations',
    description: 'Manage storage locations for your inventory items'
  },
  suppliers: {
    title: 'Suppliers',
    description: 'Manage suppliers for your inventory items'
  },
  projects: {
    title: 'Projects',
    description: 'Manage projects for your inventory items'
  },
  expenseCodes: {
    title: 'Expense Codes',
    description: 'Manage Cost Center / Expense Type combinations used for accounting allocation'
  }
};

// Define User type locally for now
type User = {
  id: string;
  username: string;
  displayName: string;
  password: string;
  role: 'admin' | 'user' | 'viewer';
  securityQuestion: string;
  securityAnswer: string;
  phoneExtension?: string;
};

type EditUserDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: User;
  onSave: (userId: string, updates: Partial<User>) => void;
};

function EditUserDialog({ open, onOpenChange, user, onSave }: EditUserDialogProps) {
  const [displayName, setDisplayName] = useState(user.displayName);
  const [phoneExtension, setPhoneExtension] = useState(user.phoneExtension ?? '');

  useEffect(() => {
    setDisplayName(user.displayName);
    setPhoneExtension(user.phoneExtension ?? '');
  }, [user]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit User</DialogTitle>
          <DialogDescription>Update user profile details.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="edit-user-display-name">Display Name</Label>
            <Input
              id="edit-user-display-name"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="Display name"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-user-phone-ext">Phone Extension</Label>
            <Input
              id="edit-user-phone-ext"
              value={phoneExtension}
              onChange={(event) => setPhoneExtension(event.target.value)}
              placeholder="Optional phone extension"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} type="button">
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => {
              const trimmedDisplayName = displayName.trim();
              if (!trimmedDisplayName) {
                toast.error('Display name is required');
                return;
              }

              onSave(user.id, {
                displayName: trimmedDisplayName,
                phoneExtension: phoneExtension.trim() || undefined,
              });
              onOpenChange(false);
            }}
          >
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type AdminResetPasswordDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: User;
  onReset: (username: string, newPassword: string) => Promise<void>;
};

function AdminResetPasswordDialog({
  open,
  onOpenChange,
  user,
  onReset,
}: AdminResetPasswordDialogProps) {
  const [newPassword, setNewPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      setNewPassword('');
      setIsSubmitting(false);
    }
  }, [open]);

  const passwordError = getPasswordError(newPassword);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reset User Password</DialogTitle>
          <DialogDescription>
            Set a new password for @{user.username}. This action does not require the security answer.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-2">
          <Label htmlFor="admin-reset-password">New Password</Label>
          <Input
            id="admin-reset-password"
            type="password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            placeholder="Enter new password"
          />
          {newPassword.length > 0 && passwordError && (
            <p className="text-sm text-destructive">{passwordError}</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} type="button">
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!!passwordError || isSubmitting}
            onClick={async () => {
              const validationError = getPasswordError(newPassword);
              if (validationError) {
                toast.error(validationError);
                return;
              }

              setIsSubmitting(true);
              try {
                await onReset(user.username, newPassword);
                onOpenChange(false);
              } finally {
                setIsSubmitting(false);
              }
            }}
          >
            {isSubmitting ? 'Resetting...' : 'Reset Password'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function SettingsPage() {
  const { currentUser, authBackend } = useAuth();
  const { activeWorkspaceId, activeWorkspaceRole } = useWorkspace();
  
  // Initialize states from URL parameters
  const [mainTab, setMainTab] = useState(() => {
    // Get tab from URL query parameter
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab');
    // If tab is 'users', set mainTab to 'users', if 'test' set to 'test', otherwise default to 'lists'
    if (tab === 'users') return 'users';
    if (tab === 'test') return 'test';
    return 'lists';
  });
  
  const [activeTab, setActiveTab] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab');
    return tab || 'categories';
  });

  // Update URL when tabs change
  useEffect(() => {
    const url = new URL(window.location.href);
    if (mainTab === 'users') {
      url.searchParams.set('tab', 'users');
    } else {
      url.searchParams.set('tab', activeTab);
    }
    window.history.replaceState({}, '', url.toString());
  }, [mainTab, activeTab]);

  const [settings, setSettings] = useState<SettingsState>({
    categories: [],
    units: [],
    locations: [],
    suppliers: [],
    projects: [],
    expenseCodes: []
  });

  const [showReconcileDialog, setShowReconcileDialog] = useState(false)
  const [itemToDelete, setItemToDelete] = useState<{type: string, value: string} | null>(null)
  const [affectedItemsCount, setAffectedItemsCount] = useState<number>(0)
  const [reconcileAction, setReconcileAction] = useState<'delete' | 'replace'>('delete')
  const [replacementValue, setReplacementValue] = useState('')
  const [showAddUserDialog, setShowAddUserDialog] = useState(false)
  const [users, setUsers] = useState<User[]>([])
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [resettingUser, setResettingUser] = useState<User | null>(null)
  const [isCameraDialogOpen, setIsCameraDialogOpen] = useState(false);
  const [defaultSettings, setDefaultSettings] = useState<DefaultSettings>(() => SettingsService.loadDefaultSettings());
  const [financialSettings, setFinancialSettings] = useState<{ expenseTypes: FinancialCodeEntry[]; costCenters: FinancialCodeEntry[] }>(() => getFinancialSettings());
  const [settingsTab, setSettingsTab] = useState('general');
  const [userDefinedPanel, setUserDefinedPanel] = useState<UserDefinedPanel>('categories');
  const [librariesPanel, setLibrariesPanel] = useState<LibrariesPanel>('suppliers');
  const canManageSharedConfig = activeWorkspaceId
    ? activeWorkspaceRole === 'admin'
    : currentUser?.role === 'admin';

  const listUndoStackRef = useRef<ListUndoSnapshot[]>([]);
  const listRedoStackRef = useRef<ListUndoSnapshot[]>([]);
  const [listUndoAvailable, setListUndoAvailable] = useState(false);
  const [listRedoAvailable, setListRedoAvailable] = useState(false);

  const [importDuplicates, setImportDuplicates] = useState<{
    type: SettingsKey;
    existing: ItemWithSubcategories[];
    imported: any[];
  } | null>(null);
  const [importDuplicateReport, setImportDuplicateReport] = useState<
    Array<{ type: string; existing: Array<{ id?: string; name?: string }>; imported: Array<{ id?: string; name?: string }> }>
  >([]);
  const [importDuplicateAction, setImportDuplicateAction] = useState<'skip' | 'replace' | 'merge'>('skip');
  const [importSectionActions, setImportSectionActions] = useState<Record<string, 'skip' | 'replace' | 'merge'>>({});
  const [importInProgress, setImportInProgress] = useState<{
    data: any;
    fileType: 'json' | 'excel';
    file: File;
  } | null>(null);

  useEffect(() => {
    if (importDuplicateReport.length === 0) {
      return;
    }
    setImportSectionActions((previous) => {
      const next = { ...previous };
      importDuplicateReport.forEach((section) => {
        if (!next[section.type]) {
          next[section.type] = importDuplicateAction;
        }
      });
      return next;
    });
  }, [importDuplicateAction, importDuplicateReport]);

  // Add a new state variable for the import success dialog near other state variables
  const [importSuccess, setImportSuccess] = useState<{
    itemCounts: Record<string, number>;
    fileType: 'json' | 'excel';
  } | null>(null);

  const normalizeListEntry = (entry: any): ItemWithSubcategories => {
    const normalizedChildren = Array.isArray(entry?.children)
      ? entry.children.map((child: any) => normalizeListEntry(child))
      : [];
    const normalizedSubcategories = Array.isArray(entry?.subcategories)
      ? entry.subcategories.map((subcategory: unknown) => String(subcategory))
      : [];
    return {
      id: entry?.id ? String(entry.id) : uuidv4(),
      name: entry?.name ? String(entry.name) : 'Unnamed',
      subcategories: normalizedSubcategories,
      ...(normalizedChildren.length > 0 ? { children: normalizedChildren } : {}),
      ...(Array.isArray(entry?.rackSlots) ? { rackSlots: entry.rackSlots.map((rack: unknown) => String(rack)) } : {}),
    };
  };

  const normalizeListPayload = (input: unknown): ItemWithSubcategories[] =>
    Array.isArray(input) ? input.map((entry) => normalizeListEntry(entry)) : [];

  const normalizeImportPayload = (rawInput: unknown) => {
    const root = (rawInput && typeof rawInput === 'object' ? rawInput : {}) as Record<string, unknown>;
    const source = (root.data && typeof root.data === 'object' ? root.data : root) as Record<string, unknown>;
    const sourceSettings =
      source.settings && typeof source.settings === 'object'
        ? (source.settings as Record<string, unknown>)
        : {};

    const inventoryInput = Array.isArray(source.inventory)
      ? source.inventory
      : Array.isArray(source.items)
        ? source.items
        : [];
    const inventory = inventoryInput.map((item: any) => ({
      ...(item || {}),
      id: item?.id ? String(item.id) : uuidv4(),
    }));

    const fromRootOrSettings = (key: SettingsKey): unknown => source[key] ?? sourceSettings[key];

    return {
      inventory,
      categories: normalizeListPayload(fromRootOrSettings('categories')),
      units: normalizeListPayload(fromRootOrSettings('units')),
      locations: normalizeListPayload(fromRootOrSettings('locations')),
      suppliers: normalizeListPayload(fromRootOrSettings('suppliers')),
      projects: normalizeListPayload(fromRootOrSettings('projects')),
      expenseCodes: normalizeListPayload(fromRootOrSettings('expenseCodes')),
    };
  };

  const listMap: Record<SettingsKey, ListInfo> = {
    categories: { 
      list: settings.categories, 
      title: 'Categories', 
      key: 'categories',
      description: 'Manage categories and subcategories for organizing your inventory items'
    },
    units: { 
      list: settings.units, 
      title: 'Units', 
      key: 'units',
      description: 'Manage units'
    },
    locations: { 
      list: settings.locations, 
      title: 'Locations', 
      key: 'locations',
      description: 'Manage storage locations for your inventory items'
    },
    suppliers: { 
      list: settings.suppliers, 
      title: 'Suppliers', 
      key: 'suppliers',
      description: 'Manage suppliers for your inventory items'
    },
    projects: { 
      list: settings.projects, 
      title: 'Projects', 
      key: 'projects',
      description: 'Manage projects for your inventory items'
    },
    expenseCodes: {
      list: settings.expenseCodes,
      title: 'Expense Codes',
      key: 'expenseCodes',
      description: 'Manage Cost Center / Expense Type code combinations'
    }
  };

  const updateSettingsList = (key: SettingsKey, newValue: ItemWithSubcategories[]) => {
    setSettings((previousSettings) => {
      listUndoStackRef.current.push({
        settings: JSON.parse(JSON.stringify(previousSettings)) as SettingsState,
        items: JSON.parse(JSON.stringify(getItems())) as InventoryItem[],
      });
      if (listUndoStackRef.current.length > MAX_LIST_UNDO) {
        listUndoStackRef.current.shift();
      }
      listRedoStackRef.current = [];

      const previousList = previousSettings[key];
      const updatedSettings = {
        ...previousSettings,
        [key]: newValue,
      };

      const inventoryFieldMap: Record<SettingsKey, keyof InventoryItem> = {
        categories: 'category',
        units: 'unit',
        locations: 'location',
        suppliers: 'supplier',
        projects: 'project',
        expenseCodes: 'expenseCode',
      };

      const targetField = inventoryFieldMap[key];
      const previousNamesById = new Map(previousSettings[key].map((item) => [item.id, item.name]));
      const renamedPairs = newValue
        .map((item) => {
          const previousName = previousNamesById.get(item.id);
          return previousName && previousName !== item.name
            ? { previousName, nextName: item.name }
            : null;
        })
        .filter((value): value is { previousName: string; nextName: string } => value !== null);

      if (renamedPairs.length > 0) {
        const inventoryItems = getItems();
        const remappedItems = inventoryItems.map((inventoryItem) => {
          const currentValue = inventoryItem[targetField];
          if (!currentValue) {
            return inventoryItem;
          }
          const match = renamedPairs.find(({ previousName }) => previousName === currentValue);
          return match ? { ...inventoryItem, [targetField]: match.nextName } : inventoryItem;
        });
        saveItems(remappedItems);
      }

      const previousById = new Map(previousList.map((entry) => [entry.id, entry.name]));
      const nextById = new Map(newValue.map((entry) => [entry.id, entry.name]));
      const addedEntries = newValue.filter((entry) => !previousById.has(entry.id)).map((entry) => entry.name);
      const removedEntries = previousList.filter((entry) => !nextById.has(entry.id)).map((entry) => entry.name);
      const renamedEntries = newValue
        .map((entry) => {
          const previousName = previousById.get(entry.id);
          return previousName && previousName !== entry.name
            ? `${previousName} -> ${entry.name}`
            : null;
        })
        .filter((entry): entry is string => entry !== null);

      if (addedEntries.length > 0 || removedEntries.length > 0 || renamedEntries.length > 0) {
        logger.info(
          'security',
          'USER_DEFINED_ITEMS_UPDATED',
          {
            listKey: key,
            added: addedEntries,
            removed: removedEntries,
            renamed: renamedEntries,
            performedBy: currentUser?.username || 'Unknown',
          },
          'SettingsPage'
        );
        if ((currentUser?.role === 'admin' || activeWorkspaceRole === 'admin') && defaultSettings.adminNotificationEmail) {
          logger.info(
            'system',
            'ADMIN_SETTINGS_CHANGE_NOTIFICATION_TARGET',
            {
              listKey: key,
              notifyEmail: defaultSettings.adminNotificationEmail,
              addedCount: addedEntries.length,
              removedCount: removedEntries.length,
              renamedCount: renamedEntries.length,
              performedBy: currentUser?.username || 'Unknown',
            },
            'SettingsPage'
          );
          void sendAdminSettingsNotification({
            notifyEmail: defaultSettings.adminNotificationEmail,
            changeType: 'lookup-list-update',
            listKey: key,
            addedCount: addedEntries.length,
            removedCount: removedEntries.length,
            renamedCount: renamedEntries.length,
            performedBy: currentUser?.username || 'Unknown',
            workspaceId: activeWorkspaceId,
          }).catch((error) => {
            logger.warn(
              'system',
              'ADMIN_SETTINGS_EMAIL_NOTIFY_FAILED',
              {
                listKey: key,
                notifyEmail: defaultSettings.adminNotificationEmail,
                error: error instanceof Error ? error.message : String(error),
              },
              'SettingsPage'
            );
          });
        }
      }

      saveSettings(updatedSettings);
      return updatedSettings;
    });
    setListUndoAvailable(true);
    setListRedoAvailable(false);
  };

  useEffect(() => {
    const loadSettings = () => {
      // Use the new getSettings interface that returns all settings at once
      const savedSettings = getSettings();
      setSettings(savedSettings);
    };
    loadSettings();
  }, []);

  useEffect(() => {
    setFinancialSettings(getFinancialSettings());
  }, []);

  useEffect(() => {
    const savedUsers = localStorage.getItem('inventory-users');
    if (savedUsers) {
      setUsers(JSON.parse(savedUsers));
    }
  }, []);

  const applyUiPreferences = (uiSettings: DefaultSettings) => {
    const rootElement = document.documentElement;
    const shouldUseDarkTheme = uiSettings.theme === 'dark'
      || (uiSettings.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    rootElement.classList.toggle('dark', shouldUseDarkTheme);
    document.body.classList.toggle('compact-ui', uiSettings.condensedView);
    document.body.classList.toggle('mt-compact-ui', uiSettings.mobileTabletUi);
  };

  useEffect(() => {
    applyUiPreferences(defaultSettings);
  }, [defaultSettings]);

  const handleGeneralSettingsChange = (updates: Partial<DefaultSettings>) => {
    if (
      Object.prototype.hasOwnProperty.call(updates, 'assetIdPrefix') &&
      !canManageSharedConfig
    ) {
      toast.error('Only administrators can change the global asset tag prefix.');
      return;
    }
    if (
      Object.prototype.hasOwnProperty.call(updates, 'adminNotificationEmail') &&
      !canManageSharedConfig
    ) {
      toast.error('Only administrators can change the admin notification email.');
      return;
    }

    const nextAssetIdPrefix = updates.assetIdPrefix?.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
    const nextAdminNotificationEmail = updates.adminNotificationEmail?.trim().toLowerCase();
    const nextSettings = {
      ...defaultSettings,
      ...updates,
      ...(nextAssetIdPrefix !== undefined ? { assetIdPrefix: nextAssetIdPrefix } : {}),
      ...(nextAdminNotificationEmail !== undefined ? { adminNotificationEmail: nextAdminNotificationEmail } : {}),
    };
    setDefaultSettings(nextSettings);
    SettingsService.saveDefaultSettings(nextSettings);

    if (
      nextAssetIdPrefix !== undefined &&
      nextAssetIdPrefix.length > 0 &&
      nextAssetIdPrefix !== defaultSettings.assetIdPrefix
    ) {
      toast.success(`Global asset tag prefix updated to ${nextAssetIdPrefix}.`);
      if (nextSettings.adminNotificationEmail) {
        void sendAdminSettingsNotification({
          notifyEmail: nextSettings.adminNotificationEmail,
          changeType: 'global-setting-update',
          settingKey: 'assetIdPrefix',
          previousValue: defaultSettings.assetIdPrefix || '',
          nextValue: nextAssetIdPrefix,
          performedBy: currentUser?.username || 'Unknown',
          workspaceId: activeWorkspaceId,
        }).catch((error) => {
          logger.warn(
            'system',
            'ADMIN_SETTINGS_EMAIL_NOTIFY_FAILED',
            {
              settingKey: 'assetIdPrefix',
              notifyEmail: nextSettings.adminNotificationEmail,
              error: error instanceof Error ? error.message : String(error),
            },
            'SettingsPage'
          );
        });
      }
    }
    if (
      nextAdminNotificationEmail !== undefined &&
      nextAdminNotificationEmail !== defaultSettings.adminNotificationEmail
    ) {
      toast.success(
        nextAdminNotificationEmail
          ? `Admin notification email updated to ${nextAdminNotificationEmail}.`
          : 'Admin notification email cleared.'
      );
    }
  };

  const handleNormalizeRackIds = () => {
    const normalizeRackId = (value: string) => value.replace(/([A-Za-z]+)-(\d+)/g, "$1$2").trim();

    const normalizeRows = (rows: ItemWithSubcategories[]): { next: ItemWithSubcategories[]; changed: number } => {
      let changed = 0;
      const walk = (row: ItemWithSubcategories): ItemWithSubcategories => {
        const nextSlots = (row.rackSlots || []).map((slot) => normalizeRackId(String(slot)));
        const slotsChanged =
          nextSlots.length !== (row.rackSlots || []).length ||
          nextSlots.some((slot, idx) => slot !== (row.rackSlots || [])[idx]);
        const nextChildren = (row.children || []).map(walk);
        const childrenChanged = nextChildren.some((child, idx) => child !== (row.children || [])[idx]);
        if (!slotsChanged && !childrenChanged) return row;
        changed += (slotsChanged ? 1 : 0) + (childrenChanged ? 1 : 0);
        return {
          ...row,
          rackSlots: nextSlots,
          children: nextChildren,
        };
      };
      return { next: rows.map(walk), changed };
    };

    const { next: normalizedLocations, changed: changedLocationRows } = normalizeRows(settings.locations);
    if (changedLocationRows > 0) {
      updateSettingsList("locations", normalizedLocations);
    }

    const items = getItems();
    let changedItems = 0;
    const nextItems = items.map((item) => {
      if (!item.rackLocation) return item;
      const normalized = normalizeRackId(item.rackLocation);
      if (normalized === item.rackLocation) return item;
      changedItems += 1;
      return { ...item, rackLocation: normalized };
    });
    if (changedItems > 0) {
      saveItems(nextItems);
    }

    if (changedLocationRows === 0 && changedItems === 0) {
      toast.info("Rack IDs are already normalized.");
      return;
    }

    toast.success("Rack IDs normalized", {
      description: `Updated ${changedItems} inventory item(s) and ${changedLocationRows} location row(s).`,
    });
  };

  const handleExportSettingsSnapshot = async () => {
    try {
      const cabinets = await SettingsService.getCabinets();
      const snapshot = {
        version: 'trackIT-settings-snapshot',
        timestamp: new Date().toISOString(),
        defaultSettings: SettingsService.loadDefaultSettings(),
        lists: settings,
        financial: financialSettings,
        cabinets,
      };
      const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `trackIT-settings-snapshot_${new Date().toISOString().split('T')[0]}.json`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success('Settings snapshot downloaded', {
        description: 'Portable backup of general preferences, lists, financial codes, and cabinets.',
      });
    } catch (error) {
      console.error('Settings snapshot export failed:', error);
      toast.error('Failed to export settings snapshot');
    }
  };

  const handleRestoreSettingsSnapshot = async (file: File): Promise<void> => {
    const text = await file.text();
    const snapshot = JSON.parse(text) as Record<string, unknown>;
    if (snapshot.version !== 'trackIT-settings-snapshot') {
      throw new Error('Invalid file: expected "version": "trackIT-settings-snapshot".');
    }
    const lists = snapshot.lists as Record<string, unknown> | undefined;
    if (!lists || typeof lists !== 'object') {
      throw new Error('Snapshot is missing a "lists" object.');
    }
    const nextLists: Settings = {
      categories: normalizeListPayload(lists.categories) as unknown as Settings['categories'],
      units: normalizeListPayload(lists.units),
      locations: normalizeListPayload(lists.locations),
      suppliers: normalizeListPayload(lists.suppliers),
      projects: normalizeListPayload(lists.projects),
      expenseCodes: normalizeListPayload(lists.expenseCodes),
    };
    setSettings(nextLists as SettingsState);
    saveSettings(nextLists);

    if (snapshot.financial && typeof snapshot.financial === 'object') {
      const f = snapshot.financial as { expenseTypes?: unknown; costCenters?: unknown };
      saveFinancialSettings({
        expenseTypes: Array.isArray(f.expenseTypes) ? (f.expenseTypes as FinancialCodeEntry[]) : [],
        costCenters: Array.isArray(f.costCenters) ? (f.costCenters as FinancialCodeEntry[]) : [],
      });
      setFinancialSettings(getFinancialSettings());
    }

    if (snapshot.defaultSettings && typeof snapshot.defaultSettings === 'object') {
      const merged = defaultSettingsSchema.parse({
        ...SettingsService.loadDefaultSettings(),
        ...(snapshot.defaultSettings as object),
      });
      SettingsService.saveDefaultSettings(merged);
      setDefaultSettings(merged);
      applyUiPreferences(merged);
    }

    if (Array.isArray(snapshot.cabinets)) {
      await SettingsService.replaceAllCabinets(snapshot.cabinets as Cabinet[]);
    }

    window.dispatchEvent(new CustomEvent(SETTINGS_UPDATED_EVENT, { detail: getSettings() }));
  };

  const handleGroupInventoryReconcile = (): GroupReconcileResult => {
    const items = getItems();
    const { nextItems, result } = reconcileInventoryGroup(items, settings, financialSettings);
    if (result.itemsTouched > 0) {
      saveItems(nextItems);
    }
    return result;
  };

  const saveUsers = (newUsers: User[]) => {
    localStorage.setItem('inventory-users', JSON.stringify(newUsers));
    setUsers(newUsers);
  };

  const handleAddItem = (list: string[], setList: React.Dispatch<React.SetStateAction<string[]>>, value: string) => {
    if (value && !list.includes(value)) {
      setList([...list, value]) // Add to end
    }
  }

  const handleRemoveItemCheck = (typeTitle: string, list: string[], setList: React.Dispatch<React.SetStateAction<string[]>>, value: string) => {
    const items = getItems()
    const typeKey = listMap[activeTab as keyof typeof listMap].key as keyof InventoryItem;
    const affected = items.filter(item => item[typeKey] === value)

    if (affected.length > 0) {
      setItemToDelete({type: typeTitle, value}) // Store Title (e.g., "Categories")
      setAffectedItemsCount(affected.length)
      setReconcileAction('delete'); // Default action
      setReplacementValue(''); // Reset replacement value
      setShowReconcileDialog(true)
    } else {
      // No items affected, just remove
      setList(list.filter(item => item !== value))
    }
  }

  const handleReconcileConfirm = () => {
    if (!itemToDelete) return;

    const { type, value } = itemToDelete;
    const typeKey = type.toLowerCase();

    // Find the correct settings key for this item type
    let settingsKey: SettingsKey;
    switch (typeKey) {
      case 'categories':
        settingsKey = 'categories';
        break;
      case 'units':
        settingsKey = 'units';
        break;
      case 'locations':
        settingsKey = 'locations';
        break;
      case 'suppliers':
        settingsKey = 'suppliers';
        break;
      case 'projects':
        settingsKey = 'projects';
        break;
      default:
        // Handle singular form of the types
        settingsKey = (typeKey.endsWith('y') ? 
          typeKey.slice(0, -1) + 'ies' : 
          typeKey.endsWith('s') ? 
            typeKey : 
            typeKey + 's') as SettingsKey;
    }

    // 1. Update the settings list
    const newList = settings[settingsKey].filter(item => item.name !== value);
    updateSettingsList(settingsKey, newList);

    // 2. Update affected inventory items
    const items = getItems();
    let updatedItems = items;
    let toastMessage = "";

    // For singular key name in inventory items (category instead of categories)
    const itemKey = typeKey.endsWith('ies') ? 
      typeKey.slice(0, -3) + 'y' : 
      typeKey.endsWith('s') ? 
        typeKey.slice(0, -1) : 
        typeKey;

    if (reconcileAction === 'replace' && replacementValue) {
      updatedItems = items.map(item => {
        if (item[itemKey as keyof InventoryItem] === value) {
          return { ...item, [itemKey]: replacementValue };
        }
        return item;
      });
      toastMessage = `Updated ${affectedItemsCount} items: Replaced "${value}" with "${replacementValue}" in ${typeKey}.`;
    } else { // 'delete' action
      updatedItems = items.map(item => {
        if (item[itemKey as keyof InventoryItem] === value) {
          const newItem = { ...item };
          delete newItem[itemKey as keyof InventoryItem];
          return newItem;
        }
        return item;
      });
      toastMessage = `Removed "${value}" from ${affectedItemsCount} items.`;
    }

    saveItems(updatedItems);
    toast.success(toastMessage);

    setShowReconcileDialog(false);
    setItemToDelete(null);
    setAffectedItemsCount(0);
    setReplacementValue('');
  };

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const getCurrentListInfo = () => {
    const listMap: Record<string, { list: ItemWithSubcategories[]; settingsKey: SettingsKey }> = {
      categories: { list: settings.categories, settingsKey: 'categories' },
      units: { list: settings.units, settingsKey: 'units' },
      locations: { list: settings.locations, settingsKey: 'locations' },
      suppliers: { list: settings.suppliers, settingsKey: 'suppliers' },
      projects: { list: settings.projects, settingsKey: 'projects' },
      expenseCodes: { list: settings.expenseCodes, settingsKey: 'expenseCodes' }
    };
    return listMap[activeTab];
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const { list, settingsKey } = getCurrentListInfo();
      const oldIndex = list.findIndex(item => item.id === active.id);
      const newIndex = list.findIndex(item => item.id === over.id);

      const newList = arrayMove(list, oldIndex, newIndex);
      updateSettingsList(settingsKey, newList);
    }
  };

  const importConfiguration = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const config = JSON.parse(e.target?.result as string);
        
        // Validate the configuration structure
        const requiredKeys = ['categories', 'units', 'locations', 'suppliers', 'projects', 'expenseCodes'];
        if (!requiredKeys.every(key => Array.isArray(config[key]))) {
          throw new Error('Invalid configuration format');
        }

        // Import all settings at once
        saveSettings({
          categories: config.categories,
          units: config.units,
          locations: config.locations,
          suppliers: config.suppliers,
          projects: config.projects,
          expenseCodes: config.expenseCodes
        });

        // Refresh the UI
        setSettings({
          categories: config.categories,
          units: config.units,
          locations: config.locations,
          suppliers: config.suppliers,
          projects: config.projects,
          expenseCodes: config.expenseCodes
        });

        toast.success("Configuration imported successfully");
      } catch (error) {
        toast.error("Failed to import configuration. Please check the file format.");
      }
    };
    reader.readAsText(file);
  };

  const exportConfiguration = () => {
    const config = {
      ...settings,
      generalSettings: null, // We'll handle general settings separately if needed
      timestamp: new Date().toISOString()
    };

    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `trackIT_config_${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);

    toast.success("Configuration exported successfully");
  };

  const handleImportData = async (file: File): Promise<void> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          console.log("Processing JSON file:", file.name);
          const parsedInput = JSON.parse(e.target?.result as string);
          
          // Validate data structure
          if (!parsedInput || typeof parsedInput !== 'object') {
            throw new Error('Invalid data format');
          }
          console.log("JSON data parsed successfully:", Object.keys(parsedInput as object));
          const data = normalizeImportPayload(parsedInput);

          setImportInProgress({
            data,
            fileType: 'json',
            file
          });
          
          // Check for duplicates and potential conflicts
          const duplicates = checkForDuplicates(data);

          if (!duplicates || duplicates.length === 0) {
            // No duplicates, proceed with import
            console.log("No duplicates found, proceeding with import");
            processImport(data, [], {});
            toast.success("Data imported successfully");
            resolve();
          } else {
            // Duplicates found, dialog will handle the rest
            // Resolution will be handled through the dialog
            // The dialog will call processImport when user confirms
            resolve();
          }
        } catch (error) {
          console.error("Error importing JSON:", error);
          reject(error);
        }
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(file);
    });
  };

  const handleImportExcel = async (file: File): Promise<void> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const data = e.target?.result;
          if (!data) {
            throw new Error("Failed to read Excel file");
          }
          
          console.log("Processing Excel file:", file.name);
          // Parse the Excel file
          const workbook = XLSX.read(data, { type: 'array' });
          console.log("Excel sheets found:", workbook.SheetNames);
          
          // Extract data from worksheets
          const importedData: any = {};
          
          // Import inventory items
          if (workbook.SheetNames.includes("Inventory")) {
            const inventorySheet = workbook.Sheets["Inventory"];
            const inventoryItems = XLSX.utils.sheet_to_json(inventorySheet);
            console.log("Inventory items found in Excel:", inventoryItems.length);
            
            // Process dates - XLSX might parse dates as numbers, need to convert them
            const processedItems = inventoryItems.map((item: any) => {
              const processedItem = { ...item };
              
              // Ensure item has an ID
              if (!processedItem.id) {
                processedItem.id = uuidv4();
                console.log("Generated new ID for item:", processedItem.name || "unnamed item");
              }
              
              // Convert date fields if they exist
              ['lastUpdated', 'dateInService', 'lastMaintenanceDate', 'nextMaintenanceDate', 'expectedDeliveryDate'].forEach(field => {
                if (processedItem[field]) {
                  // Handle Excel date format (number of days since 1900-01-01)
                  if (typeof processedItem[field] === 'number') {
                    processedItem[field] = new Date(Math.round((processedItem[field] - 25569) * 86400 * 1000));
                  } else {
                    processedItem[field] = new Date(processedItem[field]);
                  }
                }
              });
              return processedItem;
            });
            
            importedData.inventory = processedItems;
          }
          
          // Import categories, units, locations, suppliers, projects
          ['Categories', 'Units', 'Locations', 'Suppliers', 'Projects'].forEach(sheetName => {
            if (workbook.SheetNames.includes(sheetName)) {
              const sheet = workbook.Sheets[sheetName];
              const items = XLSX.utils.sheet_to_json(sheet);
              console.log(`${sheetName} found in Excel:`, items.length);
              
              importedData[sheetName.toLowerCase()] = normalizeListPayload(items);
            }
          });
          if (workbook.SheetNames.includes("ExpenseCodes")) {
            const expenseCodesSheet = workbook.Sheets["ExpenseCodes"];
            const expenseCodeItems = XLSX.utils.sheet_to_json(expenseCodesSheet);
            importedData.expenseCodes = normalizeListPayload(expenseCodeItems);
          }

          const normalizedImportPayload = normalizeImportPayload(importedData);

          setImportInProgress({
            data: normalizedImportPayload,
            fileType: 'excel',
            file
          });

          // Check for duplicates
          const duplicates = checkForDuplicates(normalizedImportPayload);

          if (!duplicates || duplicates.length === 0) {
            // No duplicates, proceed with import
            console.log("No duplicates found, proceeding with import");
            processImport(normalizedImportPayload, [], {});
            toast.success("Data imported from Excel successfully");
            resolve();
          } else {
            // Duplicates found, dialog will handle
            resolve();
          }
        } catch (error) {
          reject(error);
        }
      };
      reader.onerror = () => reject(new Error('Failed to read Excel file'));
      reader.readAsArrayBuffer(file);
    });
  };

  // Check for duplicate items in imported data
  const checkForDuplicates = (data: any) => {
    console.log("Checking for duplicates in imported data:", data);
    const settingsKeys: SettingsKey[] = ['categories', 'units', 'locations', 'suppliers', 'projects', 'expenseCodes'];
    const duplicateReport: Array<{
      type: string;
      existing: Array<{ id?: string; name?: string }>;
      imported: Array<{ id?: string; name?: string }>;
    }> = [];

    // First check inventory items if they exist
    if (data.inventory && Array.isArray(data.inventory)) {
      const existingItems = getItems();
      console.log("Existing inventory items:", existingItems.length);
      
      if (existingItems.length > 0) {
        // Find duplicate items by ID
        const duplicateItems = data.inventory.filter((imported: any) => 
          existingItems.some(existing => existing.id === imported.id)
        );
        
        if (duplicateItems.length > 0) {
          console.log("Found duplicate inventory items:", duplicateItems.length);
          duplicateReport.push({
            type: 'inventory' as any,
            existing: existingItems.filter(existing => 
              duplicateItems.some((dup: any) => dup.id === existing.id)
            ),
            imported: duplicateItems
          });
        }
      }
    }

    for (const key of settingsKeys) {
      if (!data[key] || !Array.isArray(data[key])) continue;

      // Get existing items
      const existingItems = settings[key];
      console.log(`Checking ${key}:`, data[key].length, "against", existingItems.length);
      
      // Find items with duplicate IDs or names
      const importedItems = data[key];
      const duplicateItems = importedItems.filter(imported => 
        existingItems.some(existing => 
          existing.id === imported.id || existing.name === imported.name
        )
      );

      if (duplicateItems.length > 0) {
        console.log(`Found duplicate ${key}:`, duplicateItems.length);
        // Get the existing items that conflict
        const existingDuplicates = existingItems.filter(existing => 
          importedItems.some(imported => 
            existing.id === imported.id || existing.name === imported.name
          )
        );

        duplicateReport.push({
          type: key,
          existing: existingDuplicates,
          imported: duplicateItems
        });
      }
    }

    const firstSettingsConflict = duplicateReport.find((entry) => entry.type !== 'inventory');
    setImportDuplicates(
      firstSettingsConflict
        ? ({
            type: firstSettingsConflict.type as SettingsKey,
            existing: firstSettingsConflict.existing as ItemWithSubcategories[],
            imported: firstSettingsConflict.imported as any[],
          })
        : null
    );
    setImportDuplicateReport(duplicateReport);
    setImportSectionActions(
      Object.fromEntries(duplicateReport.map((section) => [section.type, importDuplicateAction])) as Record<
        string,
        'skip' | 'replace' | 'merge'
      >
    );
    console.log("Duplicate report:", duplicateReport);
    return duplicateReport;
  };

  // Process the import based on user's decision
  const processImport = (
    data: any,
    duplicateReport: Array<{ type: string; existing: Array<{ id?: string; name?: string }> }> = [],
    sectionActions: Record<string, 'skip' | 'replace' | 'merge'> = {},
  ) => {
    const settingsKeys: SettingsKey[] = ['categories', 'units', 'locations', 'suppliers', 'projects', 'expenseCodes'];
    const importedCounts: Record<string, number> = {};
    const duplicateTypeSet = new Set(duplicateReport.map((entry) => entry.type));
    const actionFor = (type: string): 'skip' | 'replace' | 'merge' =>
      sectionActions[type] ?? importDuplicateAction;
    const mergeListEntries = (existingItems: any[], importedItems: any[]) => {
      const nextByKey = new Map<string, any>();
      const keyFor = (entry: any) => String(entry?.id || '').trim().toLowerCase() || String(entry?.name || '').trim().toLowerCase();
      existingItems.forEach((entry) => nextByKey.set(keyFor(entry), entry));
      importedItems.forEach((entry) => {
        const key = keyFor(entry);
        const existing = nextByKey.get(key);
        if (!existing) {
          nextByKey.set(key, entry);
          return;
        }
        const mergedSubcategories = Array.from(
          new Set([...(existing.subcategories || []), ...(entry.subcategories || [])])
        );
        const mergedChildren = Array.isArray(existing.children) || Array.isArray(entry.children)
          ? mergeListEntries(existing.children || [], entry.children || [])
          : undefined;
        nextByKey.set(key, {
          ...existing,
          ...entry,
          subcategories: mergedSubcategories,
          ...(mergedChildren ? { children: mergedChildren } : {}),
        });
      });
      return Array.from(nextByKey.values());
    };
    
    // Handle inventory separately if it exists
    if (data.inventory && Array.isArray(data.inventory)) {
      const inventoryAction = actionFor('inventory');
      console.log(`Processing ${data.inventory.length} inventory items with action: ${inventoryAction}`);
      const existingItems = getItems();
      const existingById = new Map(existingItems.map((item) => [item.id, item]));
      const importedById = new Map(data.inventory.map((item: any) => [String(item.id), item]));
      // Handle based on reconciliation choice
      if (inventoryAction === 'replace') {
        saveItems(data.inventory.map(parseItemDates));
        importedCounts.inventory = data.inventory.length;
      } else if (inventoryAction === 'merge') {
        const mergedItems = existingItems.map((existing) =>
          importedById.has(existing.id) ? parseItemDates(importedById.get(existing.id)) : existing
        );
        const newItems = data.inventory
          .filter((imported: any) => !existingById.has(String(imported.id)))
          .map(parseItemDates);
        saveItems([...mergedItems, ...newItems]);
        importedCounts.inventory = newItems.length;
      } else {
        const newItems = data.inventory
          .filter((imported: any) => !existingById.has(String(imported.id)))
          .map(parseItemDates);
        saveItems([...existingItems, ...newItems]);
        importedCounts.inventory = newItems.length;
      }
    }
    
    // Process other settings data
    for (const key of settingsKeys) {
      if (!data[key] || !Array.isArray(data[key])) continue;
      const existingItems = settings[key];
      const sectionHasConflicts = duplicateTypeSet.has(key);
      const sectionAction = sectionHasConflicts ? actionFor(key) : 'skip';
      
      if (sectionAction === 'replace') {
        updateSettingsList(key, data[key]);
        importedCounts[key] = data[key].length;
      } else if (sectionAction === 'merge') {
        const mergedItems = mergeListEntries(existingItems, data[key]);
        updateSettingsList(key, mergedItems);
        importedCounts[key] = Math.max(0, mergedItems.length - existingItems.length);
      } else {
        const importedWithoutDuplicates = data[key].filter((imported: any) =>
          !existingItems.some((existing) => existing.id === imported.id || existing.name === imported.name)
        );
        updateSettingsList(key, [...existingItems, ...importedWithoutDuplicates]);
        importedCounts[key] = importedWithoutDuplicates.length;
      }
    }
    
    // Show success dialog with import details
    setImportSuccess({
      itemCounts: importedCounts,
      fileType: importInProgress?.fileType || 'json'
    });
    
    // Reset import state
    setImportDuplicates(null);
    setImportInProgress(null);
    setImportDuplicateReport([]);
    setImportSectionActions({});
    setImportDuplicateAction('skip');
  };

  // Handle the import dialog confirmation
  const handleImportConfirm = () => {
    if (!importInProgress) return;
    
    processImport(importInProgress.data, importDuplicateReport, importSectionActions);
    toast.success(`Import complete. Check the summary for details.`);
  };

  const handleEditItem = (list: string[], setList: React.Dispatch<React.SetStateAction<string[]>>, oldValue: string, newValue: string, key: keyof typeof STORAGE_KEYS) => {
    if (!newValue.trim() || list.includes(newValue.trim())) {
      toast.error(newValue.trim() ? "This value already exists" : "Please enter a value");
      return;
    }

    // Check if the item being edited is used in any inventory items
    const items = getItems();
    const typeKey = listMap[activeTab as keyof typeof listMap].key as keyof InventoryItem;
    const affected = items.filter(item => item[typeKey] === oldValue);

    // Update the list
    const updatedList = list.map(item => item === oldValue ? newValue.trim() : item);
    setList(updatedList);
    saveSettings({
      ...settings,
      [key]: updatedList
    });

    // Update any inventory items using this value
    if (affected.length > 0) {
      const updatedItems = items.map(item => {
        if (item[typeKey] === oldValue) {
          return { ...item, [typeKey]: newValue.trim() };
        }
        return item
      });
      saveItems(updatedItems);
      toast.success(`Updated ${affected.length} items with the new value`);
    } else {
      toast.success("Value updated successfully");
    }
  };

  const handleAddUser = (newUser: Omit<User, 'id'>) => {
    const userExists = users.some(u => u.username === newUser.username);
    if (userExists) {
      toast.error("Username already exists");
      return;
    }

    const user: User = {
      ...newUser,
      id: crypto.randomUUID()
    };

    saveUsers([...users, user]);
    logger.info(
      'security',
      'USER_CREATED',
      {
        username: user.username,
        role: user.role,
        performedBy: currentUser?.username || 'Unknown',
      },
      'SettingsPage'
    );
    toast.success("User added successfully");
  };

  const handleEditUser = (userId: string, updates: Partial<User>) => {
    // Only allow admins to change roles
    if (updates.role && currentUser?.role !== 'admin') {
      toast.error("Only administrators can change user roles");
      return;
    }

    // Users can only edit their own profile unless they're an admin
    if (userId !== currentUser?.id && currentUser?.role !== 'admin') {
      toast.error("You can only edit your own profile");
      return;
    }

    // Don't allow users to change their own role
    if (userId === currentUser?.id && updates.role && updates.role !== currentUser.role) {
      toast.error("You cannot change your own role");
      return;
    }

    const updatedUsers = users.map(u => 
      u.id === userId ? { ...u, ...updates } : u
    );
    const targetUser = users.find((userRecord) => userRecord.id === userId);
    saveUsers(updatedUsers);
    logger.info(
      'security',
      'USER_PROFILE_UPDATED',
      {
        targetUsername: targetUser?.username || userId,
        updatedFields: Object.keys(updates),
        performedBy: currentUser?.username || 'Unknown',
      },
      'SettingsPage'
    );
    toast.success("User profile updated");
  };

  const handleUpdateRole = (userId: string, newRole: 'admin' | 'user' | 'viewer') => {
    if (currentUser?.role !== 'admin') {
      toast.error("Only administrators can change user roles");
      return;
    }

    if (userId === currentUser?.id) {
      toast.error("You cannot change your own role");
      return;
    }

    const updatedUsers = users.map(u => 
      u.id === userId ? { ...u, role: newRole } : u
    );
    const targetUser = users.find((userRecord) => userRecord.id === userId);
    saveUsers(updatedUsers);
    logger.info(
      'security',
      'USER_ROLE_UPDATED',
      {
        targetUsername: targetUser?.username || userId,
        newRole,
        performedBy: currentUser?.username || 'Unknown',
      },
      'SettingsPage'
    );
    toast.success("User role updated");
  };

  const handleRemoveUser = (userId: string) => {
    if (currentUser?.role !== 'admin') {
      toast.error("Only administrators can remove users");
      return;
    }

    if (userId === currentUser?.id) {
      toast.error("You cannot remove your own account");
      return;
    }
    
    const targetUser = users.find((userRecord) => userRecord.id === userId);
    const updatedUsers = users.filter(u => u.id !== userId);
    saveUsers(updatedUsers);
    logger.info(
      'security',
      'USER_REMOVED',
      {
        targetUsername: targetUser?.username || userId,
        performedBy: currentUser?.username || 'Unknown',
      },
      'SettingsPage'
    );
    toast.success("User removed");
  };

  const handleResetPassword = async (username: string, newPassword: string) => {
    try {
      const validationError = getPasswordError(newPassword);
      if (validationError) {
        toast.error(validationError);
        return;
      }

      const normalizedUsername = username.trim().toLowerCase();
      const updatedUsers = users.map((user) =>
        user.username.toLowerCase() === normalizedUsername
          ? { ...user, password: newPassword }
          : user
      );

      saveUsers(updatedUsers);
      logger.info(
        'security',
        'USER_PASSWORD_RESET',
        {
          targetUsername: username,
          performedBy: currentUser?.username || 'Unknown',
        },
        'SettingsPage'
      );
      toast.success(`Password reset for @${username}`);
    } catch (error) {
      toast.error("Failed to reset password");
    }
  };

  const renderUsersList = () => {
    if (!currentUser) return null;

    return users.map(u => (
      <div
        key={u.id}
        className="flex items-center justify-between p-4 rounded-lg border cursor-pointer hover:bg-accent/50 transition-colors"
        onClick={() => {
          // Only allow users to edit their own profile unless they're an admin
          if (u.id === currentUser.id || currentUser.role === 'admin') {
            setEditingUser(u);
          }
        }}
      >
        <div className="flex items-center space-x-4">
          <div>
            <p className="font-medium">{u.displayName}</p>
            <p className="text-sm text-muted-foreground">@{u.username}</p>
          </div>
          <Badge variant={u.role === 'admin' ? 'default' : u.role === 'user' ? 'secondary' : 'outline'}>
            {u.role}
          </Badge>
        </div>
        
        <div className="flex items-center gap-2">
          {currentUser.role === 'admin' && u.id !== currentUser.id && (
            <>
              <Button
                variant="ghost"
                size="icon"
                onClick={(e) => {
                  e.stopPropagation();
                  setResettingUser(u);
                }}
                title="Reset Password"
              >
                <Key className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={(e) => {
                  e.stopPropagation();
                  handleRemoveUser(u.id);
                }}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </>
          )}
        </div>
      </div>
    ));
  };

  // Add these functions to handle data import, export, backup and restore
  const handleExportData = () => {
    try {
      const data = {
        locations: settings.locations,
        categories: settings.categories,
        units: settings.units,
        suppliers: settings.suppliers,
        projects: settings.projects,
        // Include any other data you want to export
        settings: {} // Add your settings here
      };
      
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'trackIT-data-export.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Data exported successfully");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "An unknown error occurred");
    }
  };

  const handleBackupData = async (): Promise<void> => {
    try {
      const backupData = await buildFullOfflineBackupPayload();
      const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `trackIT-backup-${new Date().toISOString().split('T')[0]}.backup`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      const items = getItems();
      toast.success('Backup created successfully', {
        description: `Format v${backupData.version} · ${items.length} inventory rows · lists, financials, templates, cabinets included.`,
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'An unknown error occurred');
    }
  };

  const handleRestoreData = async (file: File): Promise<void> => {
    const text = await file.text();
    const checked = validateFullBackupJsonText(text);
    if (!checked.ok) {
      throw new Error(checked.error);
    }

    const backupData = JSON.parse(text) as { version: string; data: Record<string, unknown> };
    const { data } = backupData;

    const nextLists: Settings = {
      categories: Array.isArray(data.categories) ? (data.categories as Settings['categories']) : [],
      units: Array.isArray(data.units) ? (data.units as Settings['units']) : [],
      locations: Array.isArray(data.locations) ? (data.locations as Settings['locations']) : [],
      suppliers: Array.isArray(data.suppliers) ? (data.suppliers as Settings['suppliers']) : [],
      projects: Array.isArray(data.projects) ? (data.projects as Settings['projects']) : [],
      expenseCodes: Array.isArray(data.expenseCodes) ? (data.expenseCodes as Settings['expenseCodes']) : [],
    };

    setSettings(nextLists as SettingsState);
    saveSettings(nextLists);

    if (Array.isArray(data.items)) {
      saveItems((data.items as InventoryItem[]).map(parseItemDates));
    } else {
      saveItems([]);
    }

    if (data.financial && typeof data.financial === 'object') {
      const f = data.financial as { expenseTypes?: unknown; costCenters?: unknown };
      saveFinancialSettings({
        expenseTypes: Array.isArray(f.expenseTypes) ? (f.expenseTypes as FinancialCodeEntry[]) : [],
        costCenters: Array.isArray(f.costCenters) ? (f.costCenters as FinancialCodeEntry[]) : [],
      });
      setFinancialSettings(getFinancialSettings());
    }

    if (data.defaultSettings && typeof data.defaultSettings === 'object') {
      const merged = defaultSettingsSchema.parse({
        ...SettingsService.loadDefaultSettings(),
        ...(data.defaultSettings as object),
      });
      SettingsService.saveDefaultSettings(merged);
      setDefaultSettings(merged);
      applyUiPreferences(merged);
    }

    if (Array.isArray(data.cabinets)) {
      await SettingsService.replaceAllCabinets(data.cabinets as Cabinet[]);
    }

    if (Array.isArray(data.templates)) {
      saveTemplates(data.templates as ItemTemplate[]);
    }

    if (Object.prototype.hasOwnProperty.call(data, 'deviceLibrary')) {
      saveDeviceLibrary(parseDeviceLibraryFromBackup(data.deviceLibrary));
    }

    window.dispatchEvent(new CustomEvent(SETTINGS_UPDATED_EVENT, { detail: getSettings() }));
  };

  // Add Excel export function to handle Excel export
  const handleExportExcel = () => {
    try {
      // Create a data object similar to handleExportData
      const data = {
        locations: settings.locations,
        categories: settings.categories,
        units: settings.units,
        suppliers: settings.suppliers,
        projects: settings.projects,
        expenseCodes: settings.expenseCodes,
        inventory: getItems()
      };
      
      // Create a worksheet from the data
      const workbook = XLSX.utils.book_new();
      
      // Create a separate worksheet for each data type
      const inventoryWorksheet = XLSX.utils.json_to_sheet(data.inventory);
      XLSX.utils.book_append_sheet(workbook, inventoryWorksheet, "Inventory");
      
      const categoriesWorksheet = XLSX.utils.json_to_sheet(data.categories);
      XLSX.utils.book_append_sheet(workbook, categoriesWorksheet, "Categories");
      
      const unitsWorksheet = XLSX.utils.json_to_sheet(data.units);
      XLSX.utils.book_append_sheet(workbook, unitsWorksheet, "Units");
      
      const locationsWorksheet = XLSX.utils.json_to_sheet(data.locations);
      XLSX.utils.book_append_sheet(workbook, locationsWorksheet, "Locations");
      
      const suppliersWorksheet = XLSX.utils.json_to_sheet(data.suppliers);
      XLSX.utils.book_append_sheet(workbook, suppliersWorksheet, "Suppliers");
      
      const projectsWorksheet = XLSX.utils.json_to_sheet(data.projects);
      XLSX.utils.book_append_sheet(workbook, projectsWorksheet, "Projects");

      const expenseCodesWorksheet = XLSX.utils.json_to_sheet(data.expenseCodes);
      XLSX.utils.book_append_sheet(workbook, expenseCodesWorksheet, "ExpenseCodes");
      
      // Generate the Excel file
      XLSX.writeFile(workbook, `trackIT-data-export-${new Date().toISOString().split('T')[0]}.xlsx`);
      
      toast.success("Data exported to Excel successfully");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "An unknown error occurred during Excel export");
    }
  };

  const requestListDeleteReconcile = ({
    type,
    value,
    affectedCount,
  }: {
    type: string;
    value: string;
    affectedCount: number;
  }) => {
    setItemToDelete({ type, value });
    setAffectedItemsCount(affectedCount);
    setReconcileAction('delete');
    setReplacementValue('');
    setShowReconcileDialog(true);
  };

  const undoLookupListChange = () => {
    const snap = listUndoStackRef.current.pop();
    if (!snap) {
      toast.info('Nothing to undo');
      return;
    }
    setSettings((current) => {
      listRedoStackRef.current.push({
        settings: JSON.parse(JSON.stringify(current)) as SettingsState,
        items: JSON.parse(JSON.stringify(getItems())) as InventoryItem[],
      });
      saveSettings(snap.settings);
      saveItems(snap.items);
      return snap.settings;
    });
    setListRedoAvailable(true);
    setListUndoAvailable(listUndoStackRef.current.length > 0);
  };

  const redoLookupListChange = () => {
    const snap = listRedoStackRef.current.pop();
    if (!snap) {
      toast.info('Nothing to redo');
      return;
    }
    setSettings((current) => {
      listUndoStackRef.current.push({
        settings: JSON.parse(JSON.stringify(current)) as SettingsState,
        items: JSON.parse(JSON.stringify(getItems())) as InventoryItem[],
      });
      saveSettings(snap.settings);
      saveItems(snap.items);
      return snap.settings;
    });
    setListUndoAvailable(true);
    setListRedoAvailable(listRedoStackRef.current.length > 0);
  };

  const handleFixUnreconciledLookup = () => {
    if (settingsTab === 'libraries' && librariesPanel === 'suppliers') {
      fixUnreconciledForLookupPanel('suppliers', settings);
      return;
    }
    if (!panelSupportsListReconcile(userDefinedPanel)) {
      return;
    }
    fixUnreconciledForLookupPanel(userDefinedPanel, settings);
  };

  return (
    <div className="settings-page container max-w-6xl py-6">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <h1 className="text-2xl font-bold text-foreground">Settings</h1>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={undoLookupListChange}
            disabled={!listUndoAvailable}
            title="Undo last lookup list change"
          >
            <Undo2 className="mr-2 h-4 w-4" />
            Undo
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={redoLookupListChange}
            disabled={!listRedoAvailable}
            title="Redo lookup list change"
          >
            <Redo2 className="mr-2 h-4 w-4" />
            Redo
          </Button>
          {(settingsTab === 'userDefined' && panelSupportsListReconcile(userDefinedPanel)) && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleFixUnreconciledLookup}
              title="Clear invalid inventory references for this list"
            >
              <Wrench className="mr-2 h-4 w-4" />
              Fix unreconciled
            </Button>
          )}
        </div>
      </div>

      <Tabs value={settingsTab} onValueChange={setSettingsTab} className="w-full">
        <TabsList className="settings-primary-tabs mb-4 flex h-auto min-h-10 w-full max-w-full flex-nowrap justify-start gap-1 overflow-x-auto overflow-y-hidden overscroll-x-contain bg-muted p-1 [-ms-overflow-style:none] [scrollbar-width:none] lg:flex-wrap lg:overflow-x-visible [&::-webkit-scrollbar]:hidden">
          <TabsTrigger value="general" title="General settings" className="inline-flex items-center gap-1.5">
            <SlidersHorizontal className="settings-tab-icon h-4 w-4 shrink-0 opacity-90" aria-hidden />
            <span data-settings-tab-long>General Settings</span>
            <span data-settings-tab-short>General</span>
          </TabsTrigger>
          <TabsTrigger value="userDefined" title="Lookup lists" className="inline-flex items-center gap-1.5">
            <Boxes className="settings-tab-icon h-4 w-4 shrink-0 opacity-90" aria-hidden />
            <span data-settings-tab-long>Lookup Lists</span>
            <span data-settings-tab-short>Lookup Lists</span>
          </TabsTrigger>
          <TabsTrigger value="libraries" title="Libraries" className="inline-flex items-center gap-1.5">
            <Library className="settings-tab-icon h-4 w-4 shrink-0 opacity-90" aria-hidden />
            <span data-settings-tab-long>Libraries</span>
            <span data-settings-tab-short>Libraries</span>
          </TabsTrigger>
          <TabsTrigger value="users" title="Users" className="inline-flex items-center gap-1.5">
            <Users className="settings-tab-icon h-4 w-4 shrink-0 opacity-90" aria-hidden />
            <span data-settings-tab-long>Users</span>
            <span data-settings-tab-short>Users</span>
          </TabsTrigger>
          <TabsTrigger value="data" title="Data management" className="inline-flex items-center gap-1.5">
            <HardDrive className="settings-tab-icon h-4 w-4 shrink-0 opacity-90" aria-hidden />
            <span data-settings-tab-long>Data Management</span>
            <span data-settings-tab-short>Data</span>
          </TabsTrigger>
          <TabsTrigger value="logs" title="System logs" className="inline-flex items-center gap-1.5">
            <ScrollText className="settings-tab-icon h-4 w-4 shrink-0 opacity-90" aria-hidden />
            <span data-settings-tab-long>System Logs</span>
            <span data-settings-tab-short>Logs</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="general">
          <GeneralSettingsTab
            onOpenCameraSettings={() => setIsCameraDialogOpen(true)}
            settings={defaultSettings}
            onSettingsChange={handleGeneralSettingsChange}
            currentUsername={currentUser?.username ?? 'admin'}
            canEditAssetTagPrefix={canManageSharedConfig}
            canEditAdminNotificationEmail={canManageSharedConfig}
          />
        </TabsContent>

        <TabsContent value="userDefined">
          <UserDefinedListsSection
            panel={userDefinedPanel}
            onPanelChange={setUserDefinedPanel}
            settings={settings}
            updateSettingsList={updateSettingsList}
            financialSettings={financialSettings}
            setFinancialSettings={setFinancialSettings}
            currentUsername={currentUser?.username ?? 'admin'}
            onRequestDeleteReconcile={requestListDeleteReconcile}
            onNormalizeRackIds={handleNormalizeRackIds}
            canDeleteItems={canManageSharedConfig}
          />
        </TabsContent>

        <TabsContent value="libraries">
          <LibrariesSection
            panel={librariesPanel}
            onPanelChange={setLibrariesPanel}
            settings={settings}
            updateSettingsList={updateSettingsList}
            onRequestDeleteReconcile={requestListDeleteReconcile}
            canDeleteItems={canManageSharedConfig}
          />
        </TabsContent>

        <TabsContent value="users">
          {authBackend === 'supabase' ? (
            activeWorkspaceId ? (
              <SupabaseWorkspaceUsersCard
                workspaceId={activeWorkspaceId}
                currentUserId={currentUser?.id || ''}
                canManageUsers={canManageSharedConfig}
              />
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle>User Management</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="rounded-md border border-border/60 bg-muted/20 p-3 text-sm text-muted-foreground">
                    Switch to a team workspace to manage users. Personal mode does not expose team user administration.
                  </div>
                </CardContent>
              </Card>
            )
          ) : (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle>User Management</CardTitle>
                <Button onClick={() => setShowAddUserDialog(true)} className="flex items-center">
                  <UserPlus className="mr-2 h-4 w-4" />
                  Add User
                </Button>
              </CardHeader>
              <CardContent>{renderUsersList()}</CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="data" className="space-y-6">
          <DataBackupTab
            onExportData={handleExportData}
            onExportExcel={handleExportExcel}
            onImportData={handleImportData}
            onImportExcel={handleImportExcel}
            onBackupData={handleBackupData}
            onRestoreData={handleRestoreData}
            onExportSettingsSnapshot={() => void handleExportSettingsSnapshot()}
            onRestoreSettingsSnapshot={handleRestoreSettingsSnapshot}
            onRunGroupInventoryReconcile={handleGroupInventoryReconcile}
          />
          <WorkspaceTeamTab />
        </TabsContent>

        <TabsContent value="logs">
          <Card>
            <CardHeader>
              <CardTitle>System Logs</CardTitle>
            </CardHeader>
            <CardContent>
              <SystemLogs />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <AddUserDialog
        open={showAddUserDialog}
        onOpenChange={setShowAddUserDialog}
        onAdd={handleAddUser}
      />

      {editingUser && (
        <EditUserDialog
          open={!!editingUser}
          onOpenChange={(open) => !open && setEditingUser(null)}
          user={editingUser as User}
          onSave={handleEditUser}
        />
      )}

      {resettingUser && (
        <AdminResetPasswordDialog
          open={!!resettingUser}
          onOpenChange={(open) => !open && setResettingUser(null)}
          user={resettingUser as User}
          onReset={handleResetPassword}
        />
      )}

      {/* Reconciliation Dialog */}
      <Dialog open={showReconcileDialog} onOpenChange={setShowReconcileDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Removal</DialogTitle>
            <DialogDescription>
              The {itemToDelete?.type.toLowerCase().slice(0, -1)} "{itemToDelete?.value}" is used by {affectedItemsCount} inventory items.
              What would you like to do?
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="flex items-start space-x-2">
              <input
                type="radio"
                id="delete-option"
                name="reconcile-action"
                checked={reconcileAction === 'delete'}
                onChange={() => setReconcileAction('delete')}
                className="mt-1"
              />
              <div>
                <label htmlFor="delete-option" className="font-medium text-foreground">Remove from items</label>
                <p className="text-sm text-muted-foreground">
                  Remove this {itemToDelete?.type.toLowerCase().slice(0, -1)} from all items that use it.
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-2">
              <input
                type="radio"
                id="replace-option"
                name="reconcile-action"
                checked={reconcileAction === 'replace'}
                onChange={() => setReconcileAction('replace')}
                className="mt-1"
              />
              <div className="flex-1">
                <label htmlFor="replace-option" className="font-medium text-foreground">Replace with another value</label>
                <p className="text-sm text-muted-foreground mb-2">
                  Replace with another {itemToDelete?.type.toLowerCase().slice(0, -1)} in all affected items.
                </p>

                {reconcileAction === 'replace' && itemToDelete && (
                  <select
                    className="w-full rounded border border-input bg-background px-2 py-2 text-foreground"
                    value={replacementValue}
                    onChange={(e) => setReplacementValue(e.target.value)}
                  >
                    <option value="">Select replacement...</option>
                    {settings[itemToDelete.type.toLowerCase() as SettingsKey]
                      .filter(item => item.name !== itemToDelete.value)
                      .map(item => (
                        <option key={item.id} value={item.name}>{item.name}</option>
                      ))}
                  </select>
                )}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowReconcileDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleReconcileConfirm}
              disabled={reconcileAction === 'replace' && !replacementValue}
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import Reconciliation Dialog */}
      <Dialog 
        open={importDuplicateReport.length > 0} 
        onOpenChange={(open) => {
          if (!open) {
            setImportDuplicates(null);
            setImportDuplicateReport([]);
            setImportSectionActions({});
            setImportInProgress(null);
          }
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Duplicate Items Found</DialogTitle>
            <DialogDescription>
              {`Found ${importDuplicateReport.reduce((sum, section) => sum + section.imported.length, 0)} overlapping entries across ${
                importDuplicateReport.length
              } section(s). Review diffs below and choose how to reconcile.`}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4 max-h-96 overflow-auto">
            <div className="flex items-start space-x-2">
              <input
                type="radio"
                id="skip-option"
                name="import-action"
                checked={importDuplicateAction === 'skip'}
                onChange={() => setImportDuplicateAction('skip')}
                className="mt-1"
              />
              <div>
                <label htmlFor="skip-option" className="font-medium text-foreground">Skip duplicates</label>
                <p className="text-sm text-muted-foreground">
                  Import only new items and skip any duplicates found.
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-2">
              <input
                type="radio"
                id="replace-option"
                name="import-action"
                checked={importDuplicateAction === 'replace'}
                onChange={() => setImportDuplicateAction('replace')}
                className="mt-1"
              />
              <div>
                <label htmlFor="replace-option" className="font-medium text-foreground">Replace existing items</label>
                <p className="text-sm text-muted-foreground">
                  Replace existing items with the imported versions.
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-2">
              <input
                type="radio"
                id="merge-option"
                name="import-action"
                checked={importDuplicateAction === 'merge'}
                onChange={() => setImportDuplicateAction('merge')}
                className="mt-1"
              />
              <div>
                <label htmlFor="merge-option" className="font-medium text-foreground">Merge and keep existing</label>
                <p className="text-sm text-muted-foreground">
                  Import all items, but keep existing versions when duplicates are found.
                </p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Global choice above is the default. You can override action per section below.
            </p>

            {importDuplicateReport.length > 0 && (
              <div className="mt-6">
                <h4 className="mb-2 font-medium text-foreground">Conflict diff preview</h4>
                <div className="space-y-3">
                  {importDuplicateReport.map((section) => (
                    <div key={section.type} className="rounded border border-border/60">
                      <div className="flex items-center justify-between gap-2 border-b bg-muted/40 px-3 py-2">
                        <div className="text-sm font-medium capitalize">
                          {section.type} ({section.imported.length} conflict{section.imported.length === 1 ? '' : 's'})
                        </div>
                        <Select
                          value={importSectionActions[section.type] || importDuplicateAction}
                          onValueChange={(value: 'skip' | 'replace' | 'merge') =>
                            setImportSectionActions((previous) => ({ ...previous, [section.type]: value }))
                          }
                        >
                          <SelectTrigger className="h-8 w-[160px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="skip">Skip duplicates</SelectItem>
                            <SelectItem value="merge">Merge</SelectItem>
                            <SelectItem value="replace">Replace existing</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="max-h-44 overflow-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-muted/20">
                            <tr>
                              <th className="px-3 py-2 text-left">Existing</th>
                              <th className="px-3 py-2 text-left">Imported</th>
                            </tr>
                          </thead>
                          <tbody>
                            {section.imported.slice(0, 12).map((entry, index) => (
                              <tr key={`${section.type}-${index}`} className="border-t">
                                <td className="px-3 py-2 text-muted-foreground">
                                  {section.existing[index]?.name || section.existing[index]?.id || '(match by id/name)'}
                                </td>
                                <td className="px-3 py-2">{entry.name || entry.id || '(unnamed)'}</td>
                              </tr>
                            ))}
                            {section.imported.length > 12 ? (
                              <tr className="border-t">
                                <td colSpan={2} className="px-3 py-2 text-xs text-muted-foreground italic">
                                  +{section.imported.length - 12} more conflicts
                                </td>
                              </tr>
                            ) : null}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setImportDuplicates(null);
                setImportDuplicateReport([]);
                setImportSectionActions({});
                setImportInProgress(null);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleImportConfirm}
            >
              Confirm Import
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CameraSettingsDialog
        isOpen={isCameraDialogOpen}
        onClose={() => setIsCameraDialogOpen(false)}
      />

      {/* Import Success Dialog */}
      <Dialog 
        open={!!importSuccess} 
        onOpenChange={(open) => {
          if (!open) {
            setImportSuccess(null);
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Import Successful</DialogTitle>
            <DialogDescription>
              The following items were imported from {importSuccess?.fileType === 'excel' ? 'Excel' : 'JSON'} file:
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            <div className="space-y-2">
              {importSuccess && Object.entries(importSuccess.itemCounts).map(([key, count]) => (
                <div key={key} className="flex justify-between items-center py-2 border-b">
                  <span className="font-medium capitalize">{key}</span>
                  <span className="text-foreground">{count} items</span>
                </div>
              ))}

              {importSuccess && Object.keys(importSuccess.itemCounts).length === 0 && (
                <p className="text-amber-600 italic text-center py-2">
                  No items were imported. Check if your file has the correct format.
                </p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              onClick={() => setImportSuccess(null)}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}