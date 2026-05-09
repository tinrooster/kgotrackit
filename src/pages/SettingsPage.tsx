import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Save, GripVertical, Upload, Trash2, Pencil, UserPlus, Shield, Key, Camera, SlidersHorizontal, Boxes, Users, HardDrive, ScrollText, Undo2, Redo2, Wrench, Library, Building2, ChevronLeft, ChevronRight } from 'lucide-react'
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
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { DraggableDialogContent } from '@/components/ui/draggable-dialog'
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
import { useOrganization } from '@/contexts/OrganizationContext'
import { useLocation } from 'react-router-dom'
import { Label } from "@/components/ui/label"
import { Checkbox } from '@/components/ui/checkbox'
import { getPasswordError } from '@/utils/passwordUtils'
import { v4 as uuidv4 } from 'uuid'
import { DataBackupTab } from "@/components/settings/DataBackupTab"
import { WorkspaceTeamTab } from '@/components/settings/WorkspaceTeamTab'
import { WorkspaceUtilitiesDialog } from '@/components/settings/WorkspaceUtilitiesDialog'
import { SupabaseWorkspaceUsersCard } from '@/components/settings/SupabaseWorkspaceUsersCard'
import { GeneralSettingsTab } from '@/components/settings/GeneralSettingsTab'
import { OrganizationSettingsSection } from '@/components/settings/OrganizationSettingsSection'
import {
  ORGANIZATION_SETTINGS_SUB_TAB_IDS,
  readOrganizationSubTabFromSearch,
} from '@/components/settings/organizationSettingsSubTabs'
import type { OrganizationSettingsSubTabId } from '@/components/settings/organizationSettingsSubTabs'
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
import { parseDeviceLibraryFromBackup, saveDeviceLibrary } from '@/lib/deviceLibraryStorage'
import { sendAdminSettingsNotification } from '@/lib/supabase/adminNotifications'
import { useHorizontalScrollHints } from '@/components/ui/useHorizontalScrollHints'
import {
  exportOrganizationBundle,
  importOrganizationBundleFromFile,
  previewOrganizationImportFromFile,
  resetOrganizationLibraryMetadata,
  type OrganizationImportStrategy,
  type OrganizationImportSections,
} from '@/lib/supabase/organizationPortability'
import {
  pullOrganizationAppData,
  pushOrganizationSnapshot,
  type OrganizationSnapshotPayload,
} from '@/lib/supabase/organizationData'
import { parseMaintenanceOnAirScheduleFromUnknown, type MaintenanceOnAirSchedule } from '@/lib/settingsService'
import { getCrewContacts, saveCrewContacts } from '@/lib/crewContactsService'
import {
  normalizeLookupListPayload,
  mergeLookupListEntries,
  type NormalizedImportPayload,
} from '@/lib/importListNormalization'
import { ImportPayloadPreview } from '@/components/settings/ImportPayloadPreview'
import {
  promoteProductionCrewToDirectory,
  type PromoteProductionCrewResult,
} from '@/lib/crewDirectoryMigration'
import { parseContactWorkbookFile, type ParsedContactCandidate } from '@/lib/contactWorkbookImport'
import { canonicalNameKey, parseContactDisplayName } from '@/lib/contactName'

type ParsedContactDestination = 'production' | 'org_directory';

interface ParsedContactImportRow extends ParsedContactCandidate {
  rowId: string;
  include: boolean;
  destination: ParsedContactDestination;
  matchedMasterContactId?: string;
  matchedMasterContactName?: string;
}

type ParsedRowIssue = 'invalid_name' | 'phone_in_name' | 'handle_in_name' | 'possible_duplicate';

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
  role: 'admin' | 'editor' | 'user' | 'viewer';
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
      <DraggableDialogContent className="w-[min(calc(100vw-1rem),480px)]">
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
      </DraggableDialogContent>
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
      <DraggableDialogContent className="w-[min(calc(100vw-1rem),480px)]">
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
      </DraggableDialogContent>
    </Dialog>
  );
}

const SETTINGS_PRIMARY_TAB_IDS = [
  'general',
  'userDefined',
  'libraries',
  'organization',
  'users',
  'data',
  'workspaces',
  'logs',
] as const;
type SettingsPrimaryTabId = (typeof SETTINGS_PRIMARY_TAB_IDS)[number];
const ADMIN_ONLY_SETTINGS_TABS: SettingsPrimaryTabId[] = [
  'userDefined',
  'libraries',
  'organization',
  'users',
  'logs',
];
const URL_SYNC_EVENT = 'trackit:url-sync';

function isAdminOnlySettingsTab(tab: SettingsPrimaryTabId): boolean {
  return ADMIN_ONLY_SETTINGS_TABS.includes(tab);
}

function readSettingsPrimaryTabFromSearch(): SettingsPrimaryTabId {
  try {
    const raw = new URLSearchParams(window.location.search).get('st');
    if (raw === 'masterCrew') {
      return 'organization';
    }
    if (raw && (SETTINGS_PRIMARY_TAB_IDS as readonly string[]).includes(raw)) {
      return raw as SettingsPrimaryTabId;
    }
  } catch {
    /* ignore malformed URLs */
  }
  return 'general';
}

function readUserDefinedPanelFromSearch(): UserDefinedPanel {
  try {
    const raw = new URLSearchParams(window.location.search).get('usp');
    const allowedPanels: UserDefinedPanel[] = ['overview', 'categories', 'units', 'locations', 'projects', 'financial'];
    if (raw && allowedPanels.includes(raw as UserDefinedPanel)) {
      return raw as UserDefinedPanel;
    }
  } catch {
    /* ignore malformed URLs */
  }
  return 'categories';
}

function readLibrariesPanelFromSearch(): LibrariesPanel {
  try {
    const raw = new URLSearchParams(window.location.search).get('lp');
    const allowedPanels: LibrariesPanel[] = ['suppliers', 'positionTemplates', 'templates', 'deviceLibrary', 'cabinets'];
    if (raw && allowedPanels.includes(raw as LibrariesPanel)) {
      return raw as LibrariesPanel;
    }
  } catch {
    /* ignore malformed URLs */
  }
  return 'suppliers';
}

export default function SettingsPage() {
  const location = useLocation();
  const { currentUser, authBackend } = useAuth();
  const { activeWorkspaceId, activeWorkspaceRole, workspaces, loading: workspacesLoading, lastWorkspaceError } =
    useWorkspace();
  const {
    organizations,
    activeOrganizationId,
    activeOrganizationName,
    activeOrganizationRole,
    loading: organizationsLoading,
    refreshOrganizations,
    selectOrganization,
  } = useOrganization();
  const activeWorkspaceName = activeWorkspaceId
    ? workspaces.find((workspace) => workspace.workspaceId === activeWorkspaceId)?.name ?? null
    : null;
  
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
    window.dispatchEvent(new CustomEvent(URL_SYNC_EVENT));
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
  const [orgMaintenanceTemplateStored, setOrgMaintenanceTemplateStored] = useState<MaintenanceOnAirSchedule | null>(
    null,
  );

  const refreshOrgMaintenanceTemplate = useCallback(async () => {
    if (authBackend !== 'supabase' || !activeOrganizationId) {
      setOrgMaintenanceTemplateStored(null);
      return;
    }
    try {
      const row = await pullOrganizationAppData(activeOrganizationId);
      setOrgMaintenanceTemplateStored(parseMaintenanceOnAirScheduleFromUnknown(row?.maintenance_on_air_template));
    } catch {
      setOrgMaintenanceTemplateStored(null);
    }
  }, [authBackend, activeOrganizationId]);

  useEffect(() => {
    void refreshOrgMaintenanceTemplate();
  }, [refreshOrgMaintenanceTemplate]);
  const [financialSettings, setFinancialSettings] = useState<{ expenseTypes: FinancialCodeEntry[]; costCenters: FinancialCodeEntry[] }>(() => getFinancialSettings());
  const [settingsTab, setSettingsTab] = useState<SettingsPrimaryTabId>(() =>
    readSettingsPrimaryTabFromSearch(),
  )
  const [userDefinedPanel, setUserDefinedPanel] = useState<UserDefinedPanel>(() => readUserDefinedPanelFromSearch());
  const [librariesPanel, setLibrariesPanel] = useState<LibrariesPanel>(() => readLibrariesPanelFromSearch());
  const [organizationSubTab, setOrganizationSubTab] = useState<OrganizationSettingsSubTabId>(() =>
    readOrganizationSubTabFromSearch(),
  );
  const organizationSubTabRef = useRef(organizationSubTab);
  organizationSubTabRef.current = organizationSubTab;
  const userDefinedPanelRef = useRef(userDefinedPanel);
  userDefinedPanelRef.current = userDefinedPanel;
  const librariesPanelRef = useRef(librariesPanel);
  librariesPanelRef.current = librariesPanel;
  const canManageSharedConfig = activeWorkspaceId
    ? activeWorkspaceRole === 'admin' || activeWorkspaceRole === 'editor'
    : currentUser?.role === 'admin' || currentUser?.role === 'editor';
  const activeWorkspaceOwnerUserId = activeWorkspaceId
    ? workspaces.find((w) => w.workspaceId === activeWorkspaceId)?.ownerUserId ?? null
    : null;
  const isActiveWorkspaceOwner = !!currentUser?.id && activeWorkspaceOwnerUserId === currentUser.id;
  /** Member admin UI is backed by workspace-member-admin, which allows workspace admin or owner (not editors). */
  const canManageWorkspaceUsers =
    !!activeWorkspaceId && (activeWorkspaceRole === 'admin' || isActiveWorkspaceOwner);
  const canAccessWorkspacesTab = authBackend === 'supabase';
  const activeWorkspaceMissingFromList =
    !!activeWorkspaceId &&
    !workspacesLoading &&
    !workspaces.some((w) => w.workspaceId === activeWorkspaceId);

  const listUndoStackRef = useRef<ListUndoSnapshot[]>([]);
  const listRedoStackRef = useRef<ListUndoSnapshot[]>([]);
  const [listUndoAvailable, setListUndoAvailable] = useState(false);
  const [listRedoAvailable, setListRedoAvailable] = useState(false);
  const {
    scrollRef: primaryTabsListRef,
    isOverflowing: isPrimaryTabsOverflowing,
    canScrollLeft: primaryTabsCanScrollLeft,
    canScrollRight: primaryTabsCanScrollRight,
    shouldPulseRightHint: shouldPulsePrimaryTabsHint,
  } = useHorizontalScrollHints<HTMLDivElement>({
    pulseStorageKey: 'settings-primary-tabs-hint-pulsed',
  });

  const [importDuplicates, setImportDuplicates] = useState<{
    type: SettingsKey;
    existing: ItemWithSubcategories[];
    imported: any[];
  } | null>(null);
  const [importDuplicateReport, setImportDuplicateReport] = useState<
    Array<{ type: string; existing: Array<{ id?: string; name?: string }>; imported: Array<{ id?: string; name?: string }> }>
  >([]);
  const [importDuplicateAction, setImportDuplicateAction] = useState<'skip' | 'replace' | 'merge'>('merge');
  const [importReviewOpen, setImportReviewOpen] = useState(false);
  const [importSectionActions, setImportSectionActions] = useState<Record<string, 'skip' | 'replace' | 'merge'>>({});
  const [importInProgress, setImportInProgress] = useState<{
    data: any;
    fileType: 'json' | 'excel';
    file: File;
  } | null>(null);
  const [workspaceUtilitiesOpen, setWorkspaceUtilitiesOpen] = useState(false);
  const [crewPromotionBusy, setCrewPromotionBusy] = useState(false);
  const [lastCrewPromotionResult, setLastCrewPromotionResult] =
    useState<PromoteProductionCrewResult | null>(null);
  const [contactParseBusy, setContactParseBusy] = useState(false);
  const [contactImportBusy, setContactImportBusy] = useState(false);
  const [parsedContactCandidates, setParsedContactCandidates] = useState<ParsedContactCandidate[]>([]);
  const [parsedContactRows, setParsedContactRows] = useState<ParsedContactImportRow[]>([]);
  const [parsedContactSourceSummary, setParsedContactSourceSummary] = useState<{
    files: number;
    sheets: number;
    rows: number;
    sheetSummaries: Array<{
      fileName: string;
      sheetName: string;
      candidatesFound: number;
    }>;
  } | null>(null);
  const [contactPreviewOpen, setContactPreviewOpen] = useState(false);
  const [contactPreviewFilter, setContactPreviewFilter] = useState<
    'all' | 'included' | 'production' | 'org_directory' | 'flagged'
  >('all');
  const [contactPreviewSort, setContactPreviewSort] = useState<
    'name_asc' | 'name_desc' | 'destination'
  >('name_asc');
  const [contactPreviewSourceFilter, setContactPreviewSourceFilter] = useState<string>('all');
  const [contactParseProgress, setContactParseProgress] = useState<{
    fileName: string;
    fileIndex: number;
    fileTotal: number;
    sheetName: string;
    sheetIndex: number;
    sheetTotal: number;
  } | null>(null);
  const contactExcelImportRef = useRef<HTMLInputElement>(null);

  const isLikelyPhoneToken = (value: string): boolean => value.replace(/\D/g, '').length >= 7;
  const isLikelyHandleToken = (value: string): boolean => /^@/.test(value.trim()) || /twitter|facebook|instagram|tiktok/i.test(value);
  const normalizedNameForDupes = (value: string): string => canonicalNameKey(value);

  const parsedRowIssues = useMemo(() => {
    const issuesByRowId = new Map<string, ParsedRowIssue[]>();
    const masterContacts = getCrewContacts();
    const normalizedMasterNames = masterContacts.map((contact) => normalizedNameForDupes(contact.fullName));

    for (const row of parsedContactRows) {
      const issues: ParsedRowIssue[] = [];
      const fullName = row.fullName.trim();
      const normalizedName = normalizedNameForDupes(fullName);
      const nameTokens = normalizedName.split(' ').filter(Boolean);

      if (!fullName || nameTokens.length < 2) {
        issues.push('invalid_name');
      }
      if (isLikelyPhoneToken(fullName)) {
        issues.push('phone_in_name');
      }
      if (isLikelyHandleToken(fullName)) {
        issues.push('handle_in_name');
      }
      if (!row.matchedMasterContactId && normalizedName) {
        const possibleMatch = normalizedMasterNames.some((existingName) => {
          if (existingName === normalizedName) return false;
          const existingTokens = existingName.split(' ').filter(Boolean);
          if (existingTokens.length < 2 || nameTokens.length < 2) return false;
          const sameLastName = existingTokens[existingTokens.length - 1] === nameTokens[nameTokens.length - 1];
          const sameFirstInitial = existingTokens[0]?.[0] === nameTokens[0]?.[0];
          return sameLastName && sameFirstInitial;
        });
        if (possibleMatch) {
          issues.push('possible_duplicate');
        }
      }
      issuesByRowId.set(row.rowId, issues);
    }

    return issuesByRowId;
  }, [parsedContactRows]);

  const contactPreviewSourceOptions = useMemo(() => {
    const sources = Array.from(
      new Set(
        parsedContactRows
          .map((row) => row.sourceFile?.trim() ?? '')
          .filter((value) => value.length > 0),
      ),
    ).sort((left, right) => left.localeCompare(right, undefined, { sensitivity: 'base' }));
    return ['all', ...sources];
  }, [parsedContactRows]);

  const previewRows = useMemo(() => {
    let rows = [...parsedContactRows];
    if (contactPreviewFilter === 'included') {
      rows = rows.filter((row) => row.include);
    } else if (contactPreviewFilter === 'production') {
      rows = rows.filter((row) => row.destination === 'production');
    } else if (contactPreviewFilter === 'org_directory') {
      rows = rows.filter((row) => row.destination === 'org_directory');
    } else if (contactPreviewFilter === 'flagged') {
      rows = rows.filter((row) => (parsedRowIssues.get(row.rowId)?.length ?? 0) > 0);
    }
    if (contactPreviewSourceFilter !== 'all') {
      rows = rows.filter((row) => (row.sourceFile?.trim() ?? '') === contactPreviewSourceFilter);
    }

    rows.sort((a, b) => {
      if (contactPreviewSort === 'name_asc') {
        return a.fullName.localeCompare(b.fullName, undefined, { sensitivity: 'base' });
      }
      if (contactPreviewSort === 'name_desc') {
        return b.fullName.localeCompare(a.fullName, undefined, { sensitivity: 'base' });
      }
      if (a.destination === b.destination) {
        return a.fullName.localeCompare(b.fullName, undefined, { sensitivity: 'base' });
      }
      return a.destination === 'production' ? -1 : 1;
    });
    return rows;
  }, [parsedContactRows, contactPreviewFilter, contactPreviewSort, contactPreviewSourceFilter, parsedRowIssues]);

  const previewTally = useMemo(() => {
    const total = parsedContactRows.length;
    const included = parsedContactRows.filter((row) => row.include).length;
    const flagged = parsedContactRows.filter((row) => (parsedRowIssues.get(row.rowId)?.length ?? 0) > 0).length;
    const matchedMaster = parsedContactRows.filter((row) => Boolean(row.matchedMasterContactId)).length;
    const productionTotal = parsedContactRows.filter((row) => row.destination === 'production').length;
    const productionIncluded = parsedContactRows.filter(
      (row) => row.destination === 'production' && row.include,
    ).length;
    const directoryTotal = parsedContactRows.filter((row) => row.destination === 'org_directory').length;
    const directoryIncluded = parsedContactRows.filter(
      (row) => row.destination === 'org_directory' && row.include,
    ).length;
    return {
      total,
      included,
      flagged,
      matchedMaster,
      productionTotal,
      productionIncluded,
      directoryTotal,
      directoryIncluded,
    };
  }, [parsedContactRows, parsedRowIssues]);

  useEffect(() => {
    const search = new URLSearchParams(location.search);
    const stRaw = search.get('st');
    const normalizedSt = stRaw === 'masterCrew' ? 'organization' : stRaw;
    const requestedSettingsTab =
      normalizedSt && (SETTINGS_PRIMARY_TAB_IDS as readonly string[]).includes(normalizedSt)
        ? (normalizedSt as SettingsPrimaryTabId)
        : 'general';
    const nextSettingsTab =
      !canManageSharedConfig && isAdminOnlySettingsTab(requestedSettingsTab)
        ? 'general'
        : requestedSettingsTab;
    if (nextSettingsTab !== settingsTab) {
      setSettingsTab(nextSettingsTab);
    }

    if (nextSettingsTab === 'userDefined') {
      const uspRaw = search.get('usp');
      const allowedUserPanels: UserDefinedPanel[] = ['overview', 'categories', 'units', 'locations', 'projects', 'financial'];
      // When `usp` is missing or invalid, keep the in-memory panel (ref). Do not list `userDefinedPanel`
      // in this effect's deps — that re-ran after every sub-tab click while `location.search` could still
      // show `st=general` (or a stale `usp`) and forced the primary tab back to General.
      const nextUserPanel =
        uspRaw && allowedUserPanels.includes(uspRaw as UserDefinedPanel)
          ? (uspRaw as UserDefinedPanel)
          : userDefinedPanelRef.current;
      setUserDefinedPanel((prev) => (nextUserPanel !== prev ? nextUserPanel : prev));
    }

    if (nextSettingsTab === 'libraries') {
      const lpRaw = search.get('lp');
      const allowedLibraryPanels: LibrariesPanel[] = ['suppliers', 'positionTemplates', 'templates', 'deviceLibrary', 'cabinets'];
      const nextLibraryPanel =
        lpRaw && allowedLibraryPanels.includes(lpRaw as LibrariesPanel)
          ? (lpRaw as LibrariesPanel)
          : librariesPanelRef.current;
      setLibrariesPanel((prev) => (nextLibraryPanel !== prev ? nextLibraryPanel : prev));
    }

    if (nextSettingsTab === 'organization') {
      const stRawForOrg = search.get('st');
      if (stRawForOrg === 'masterCrew') {
        setOrganizationSubTab((prev) => (prev !== 'crew' ? 'crew' : prev));
      } else {
        const ospRaw = search.get('osp');
        // When `osp` is missing, keep the in-memory tab (ref); do not depend on `organizationSubTab`
        // in this effect's deps — that re-ran after every click while `location.search` was still stale
        // and forced `osp` from the URL (e.g. overview) to overwrite the new selection.
        const nextOsp =
          ospRaw && (ORGANIZATION_SETTINGS_SUB_TAB_IDS as readonly string[]).includes(ospRaw)
            ? (ospRaw as OrganizationSettingsSubTabId)
            : organizationSubTabRef.current;
        setOrganizationSubTab((prev) => (nextOsp !== prev ? nextOsp : prev));
      }
    }
    // Intentionally omit `settingsTab` and sub-panel state from deps: including them re-ran this effect
    // after in-app tab changes while `location.search` could still be stale and forced `st` back to `general`.
  }, [location.search, canManageSharedConfig]);

  useEffect(() => {
    if (!canManageSharedConfig && isAdminOnlySettingsTab(settingsTab)) {
      setSettingsTab('general');
    }
  }, [settingsTab, canManageSharedConfig]);

  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set('st', settingsTab);
    if (settingsTab === 'userDefined') {
      url.searchParams.set('usp', userDefinedPanel);
      url.searchParams.delete('lp');
      url.searchParams.delete('osp');
    } else if (settingsTab === 'libraries') {
      url.searchParams.set('lp', librariesPanel);
      url.searchParams.delete('usp');
      url.searchParams.delete('osp');
    } else if (settingsTab === 'organization') {
      url.searchParams.set('osp', organizationSubTab);
      url.searchParams.delete('usp');
      url.searchParams.delete('lp');
    } else {
      url.searchParams.delete('usp');
      url.searchParams.delete('lp');
      url.searchParams.delete('osp');
      if (settingsTab !== 'data') {
        url.searchParams.delete('dp');
      }
    }
    window.history.replaceState({}, '', url.toString());
    window.dispatchEvent(new CustomEvent(URL_SYNC_EVENT));
  }, [settingsTab, userDefinedPanel, librariesPanel, organizationSubTab]);

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

  const normalizeImportPayload = (rawInput: unknown): NormalizedImportPayload => {
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
      categories: normalizeLookupListPayload(fromRootOrSettings('categories')),
      units: normalizeLookupListPayload(fromRootOrSettings('units')),
      locations: normalizeLookupListPayload(fromRootOrSettings('locations')),
      suppliers: normalizeLookupListPayload(fromRootOrSettings('suppliers')),
      projects: normalizeLookupListPayload(fromRootOrSettings('projects')),
      expenseCodes: normalizeLookupListPayload(fromRootOrSettings('expenseCodes')),
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
      categories: normalizeLookupListPayload(lists.categories) as unknown as Settings['categories'],
      units: normalizeLookupListPayload(lists.units),
      locations: normalizeLookupListPayload(lists.locations),
      suppliers: normalizeLookupListPayload(lists.suppliers),
      projects: normalizeLookupListPayload(lists.projects),
      expenseCodes: normalizeLookupListPayload(lists.expenseCodes),
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

  const handleExportOrganizationData = async (): Promise<void> => {
    if (!activeOrganizationId) {
      throw new Error('No active organization selected.');
    }
    const payload = await exportOrganizationBundle(activeOrganizationId);
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const slug = (activeOrganizationName || 'organization').replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '');
    link.download = `trackIT-org-export-${slug || 'organization'}-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success('Organization library export complete');
  };

  const handleImportOrganizationData = async (
    file: File,
    strategy: OrganizationImportStrategy,
    sections: OrganizationImportSections,
  ): Promise<void> => {
    if (!activeOrganizationId) {
      throw new Error('No active organization selected.');
    }
    await importOrganizationBundleFromFile({
      organizationId: activeOrganizationId,
      file,
      strategy,
      sections,
    });
    toast.success('Organization library import complete', {
      description: `Applied with "${strategy}" strategy.`,
    });
  };

  const handlePreviewOrganizationImportData = async (file: File) => {
    if (!activeOrganizationId) {
      throw new Error('No active organization selected.');
    }
    return previewOrganizationImportFromFile({
      organizationId: activeOrganizationId,
      file,
    });
  };

  const handleResetOrganizationSettings = async (): Promise<void> => {
    if (!activeOrganizationId) {
      throw new Error('No active organization selected.');
    }
    await resetOrganizationLibraryMetadata(activeOrganizationId);
    toast.success('Organization settings-only data reset');
  };

  const handlePromoteProductionCrew = (): void => {
    setCrewPromotionBusy(true);
    try {
      const result = promoteProductionCrewToDirectory();
      setLastCrewPromotionResult(result);
      toast.success('Production crew migration completed.', {
        description:
          result.addedContacts > 0
            ? `Added ${result.addedContacts} contact${result.addedContacts === 1 ? '' : 's'} to the Master Crew Directory.`
            : 'No new contacts were added.',
      });
    } catch (error) {
      toast.error('Could not migrate production crew.', {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setCrewPromotionBusy(false);
    }
  };

  const inferParsedContactDestination = (candidate: ParsedContactCandidate): ParsedContactDestination => {
    const source = `${candidate.functionalArea ?? ''} ${candidate.sourceSheet ?? ''}`.toLowerCase();
    const generalSignals = [
      'facilities',
      'building',
      'security',
      'janitorial',
      'mail room',
      'travel',
      'reservation',
      'manager',
      'engineering',
      'it',
      'tie lines',
    ];
    const productionSignals = [
      'anchor',
      'reporter',
      'producer',
      'assignment',
      'weather',
      'photog',
      'news',
    ];
    if (generalSignals.some((token) => source.includes(token))) return 'org_directory';
    if (productionSignals.some((token) => source.includes(token))) return 'production';
    return 'org_directory';
  };

  const mergeNotesWithExtension = (notes: string | undefined, extension: string | undefined): string | undefined => {
    const trimmedNotes = notes?.trim() || '';
    const trimmedExtension = extension?.trim() || '';
    if (!trimmedExtension) {
      return trimmedNotes || undefined;
    }
    const extensionToken = `Extension: ${trimmedExtension}`;
    if (!trimmedNotes) {
      return extensionToken;
    }
    if (trimmedNotes.toLowerCase().includes(extensionToken.toLowerCase())) {
      return trimmedNotes;
    }
    return `${trimmedNotes} | ${extensionToken}`;
  };

  const mergeRoleTags = (currentRoleTags: string[] | undefined, incomingTags: string[]): string[] => {
    const result = new Set<string>();
    for (const roleTag of currentRoleTags ?? []) {
      const normalizedRoleTag = roleTag.trim();
      if (normalizedRoleTag) result.add(normalizedRoleTag);
    }
    for (const roleTag of incomingTags) {
      const normalizedRoleTag = roleTag.trim();
      if (normalizedRoleTag) result.add(normalizedRoleTag);
    }
    return Array.from(result);
  };

  const handleParseContactExcelFiles = async (event: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const selectedFiles = Array.from(event.target.files ?? []);
    if (contactExcelImportRef.current) {
      contactExcelImportRef.current.value = '';
    }
    if (selectedFiles.length === 0) return;

    setContactParseBusy(true);
    setContactParseProgress(null);
    try {
      const parseResults: Array<Awaited<ReturnType<typeof parseContactWorkbookFile>>> = [];
      for (let fileIndex = 0; fileIndex < selectedFiles.length; fileIndex += 1) {
        const selectedFile = selectedFiles[fileIndex];
        const parsed = await parseContactWorkbookFile(selectedFile, {
          onProgress: (progress) => {
            setContactParseProgress({
              fileName: selectedFile.name,
              fileIndex: fileIndex + 1,
              fileTotal: selectedFiles.length,
              sheetName: progress.sheetName,
              sheetIndex: progress.sheetIndex,
              sheetTotal: progress.totalSheets,
            });
          },
        });
        parseResults.push(parsed);
      }
      const mergedByName = new Map<string, ParsedContactCandidate>();
      let totalSheets = 0;
      let totalRows = 0;
      for (const result of parseResults) {
        totalSheets += result.sheetsScanned;
        totalRows += result.rowsScanned;
        for (const candidate of result.contacts) {
          const normalizedFullName = parseContactDisplayName(candidate.fullName);
          const key = canonicalNameKey(normalizedFullName);
          if (!key) continue;
          const existing = mergedByName.get(key);
          if (!existing) {
            mergedByName.set(key, {
              ...candidate,
              fullName: normalizedFullName,
            });
            continue;
          }
          mergedByName.set(key, {
            ...existing,
            fullName: normalizedFullName,
            phone: existing.phone || candidate.phone,
            extension: existing.extension || candidate.extension,
            email: existing.email || candidate.email,
            functionalArea: existing.functionalArea || candidate.functionalArea,
          });
        }
      }

      const parsedContacts = Array.from(mergedByName.values());
      const existingMasterContacts = getCrewContacts();
      const existingMasterByName = new Map(
        existingMasterContacts.map((contact) => [canonicalNameKey(contact.fullName), contact]),
      );
      setParsedContactCandidates(parsedContacts);
      setParsedContactRows(
        parsedContacts.map((candidate) => {
          const matchedMaster = existingMasterByName.get(canonicalNameKey(candidate.fullName));
          return {
            ...candidate,
            rowId: crypto.randomUUID(),
            include: true,
            destination: matchedMaster ? 'production' : inferParsedContactDestination(candidate),
            matchedMasterContactId: matchedMaster?.id,
            matchedMasterContactName: matchedMaster?.fullName,
          };
        }),
      );
      setParsedContactSourceSummary({
        files: selectedFiles.length,
        sheets: totalSheets,
        rows: totalRows,
        sheetSummaries: parseResults.flatMap((result, index) =>
          result.sheetSummaries.map((summary) => ({
            fileName: selectedFiles[index]?.name ?? 'Unknown file',
            sheetName: summary.sheetName,
            candidatesFound: summary.candidatesFound,
          })),
        ),
      });
      setContactPreviewOpen(true);
      toast.success('Parsed contact workbook files.', {
        description: `Detected ${parsedContacts.length} candidate contact${parsedContacts.length === 1 ? '' : 's'} across ${selectedFiles.length} file${selectedFiles.length === 1 ? '' : 's'}.`,
      });
    } catch (error) {
      toast.error('Could not parse contact workbooks.', {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setContactParseBusy(false);
      setContactParseProgress(null);
    }
  };

  const handleImportParsedContactsToMaster = async (): Promise<void> => {
    if (parsedContactRows.length === 0) {
      toast.error('No parsed contacts available to import.');
      return;
    }
    const selectedRows = parsedContactRows.filter((row) => row.include);
    if (selectedRows.length === 0) {
      toast.error('No parsed contacts selected for import.');
      return;
    }
    const productionRows = selectedRows.filter((row) => row.destination === 'production');
    const orgDirectoryRows = selectedRows.filter((row) => row.destination === 'org_directory');

    setContactImportBusy(true);
    try {
      const existingContacts = getCrewContacts();
      const existingByName = new Map(
        existingContacts.map((contact) => [canonicalNameKey(contact.fullName), contact]),
      );
      const nextContacts = [...existingContacts];

      let added = 0;
      let updated = 0;
      let unchanged = 0;

      for (const candidate of productionRows) {
        const normalizedFullName = parseContactDisplayName(candidate.fullName);
        const nameKey = canonicalNameKey(normalizedFullName);
        if (!nameKey) continue;
        const existing = existingByName.get(nameKey);
        if (!existing) {
          const nowIso = new Date().toISOString();
          nextContacts.push({
            id: crypto.randomUUID(),
            fullName: normalizedFullName,
            contactType: 'crew',
            roleTags: mergeRoleTags([], ['production']),
            defaultEquipmentItemIds: [],
            organizationName: undefined,
            functionalArea: candidate.functionalArea?.trim() || undefined,
            preferredVehicle: undefined,
            vehicleNotes: undefined,
            phone: candidate.phone?.trim() || undefined,
            email: candidate.email?.trim() || undefined,
            notes: mergeNotesWithExtension(undefined, candidate.extension),
            baseLocation: undefined,
            unionStatus: undefined,
            isActive: true,
            createdAt: nowIso,
            updatedAt: nowIso,
          });
          added += 1;
          continue;
        }

        const nextPhone = candidate.phone?.trim() || existing.phone;
        const nextEmail = candidate.email?.trim() || existing.email;
        const nextFunctionalArea = candidate.functionalArea?.trim() || existing.functionalArea;
        const nextNotes = mergeNotesWithExtension(existing.notes, candidate.extension);
        const nextRoleTags = mergeRoleTags(existing.roleTags, ['production']);

        const changed =
          nextPhone !== existing.phone ||
          nextEmail !== existing.email ||
          nextFunctionalArea !== existing.functionalArea ||
          nextNotes !== existing.notes ||
          nextRoleTags.join('|').toLowerCase() !== (existing.roleTags ?? []).join('|').toLowerCase();

        if (!changed) {
          unchanged += 1;
          continue;
        }

        const updatedContact = {
          ...existing,
          phone: nextPhone,
          email: nextEmail,
          functionalArea: nextFunctionalArea,
          notes: nextNotes,
          roleTags: nextRoleTags,
          updatedAt: new Date().toISOString(),
        };
        const index = nextContacts.findIndex((contact) => contact.id === existing.id);
        if (index >= 0) {
          nextContacts[index] = updatedContact;
          updated += 1;
        } else {
          nextContacts.push(updatedContact);
          updated += 1;
        }
      }

      saveCrewContacts(nextContacts);

      let orgDirectoryAdded = 0;
      let orgDirectoryUpdated = 0;
      if (activeOrganizationId) {
        const currentRow = await pullOrganizationAppData(activeOrganizationId);
        const currentBranding =
          currentRow?.branding && typeof currentRow.branding === 'object' && !Array.isArray(currentRow.branding)
            ? ({ ...currentRow.branding } as Record<string, unknown>)
            : {};
        const existingDirectoryContacts = Array.isArray(currentBranding.directoryContacts)
          ? (currentBranding.directoryContacts as Array<Record<string, unknown>>)
          : [];
        const directoryByName = new Map(
          existingDirectoryContacts
            .filter((entry) => typeof entry.fullName === 'string')
            .map((entry) => [canonicalNameKey(String(entry.fullName)), entry]),
        );
        const nextDirectoryContacts = [...existingDirectoryContacts];

        for (const candidate of orgDirectoryRows) {
          const normalizedFullName = parseContactDisplayName(candidate.fullName);
          const key = canonicalNameKey(normalizedFullName);
          if (!key) continue;
          const existingEntry = directoryByName.get(key);
          if (!existingEntry) {
            nextDirectoryContacts.push({
              id: crypto.randomUUID(),
              fullName: normalizedFullName,
              phone: candidate.phone?.trim() || undefined,
              email: candidate.email?.trim() || undefined,
              extension: candidate.extension?.trim() || undefined,
              functionalArea: candidate.functionalArea?.trim() || undefined,
              sourceFile: candidate.sourceFile,
              sourceSheet: candidate.sourceSheet,
              updatedAt: new Date().toISOString(),
            });
            orgDirectoryAdded += 1;
            continue;
          }
          const updatedEntry = {
            ...existingEntry,
            phone: (existingEntry.phone as string | undefined) || candidate.phone?.trim() || undefined,
            email: (existingEntry.email as string | undefined) || candidate.email?.trim() || undefined,
            extension:
              (existingEntry.extension as string | undefined) || candidate.extension?.trim() || undefined,
            functionalArea:
              (existingEntry.functionalArea as string | undefined) ||
              candidate.functionalArea?.trim() ||
              undefined,
            updatedAt: new Date().toISOString(),
          };
          const existingIndex = nextDirectoryContacts.findIndex(
            (entry) => canonicalNameKey(String(entry.fullName ?? '')) === key,
          );
          if (existingIndex >= 0) {
            nextDirectoryContacts[existingIndex] = updatedEntry;
            orgDirectoryUpdated += 1;
          }
        }

        currentBranding.directoryContacts = nextDirectoryContacts;
        await pushOrganizationSnapshot(activeOrganizationId, {
          contacts: nextContacts,
          position_templates: Array.isArray(currentRow?.position_templates)
            ? currentRow.position_templates
            : [],
          inventory_baseline: Array.isArray(currentRow?.inventory_baseline)
            ? currentRow.inventory_baseline
            : [],
          role_tags: Array.isArray(currentRow?.role_tags) ? currentRow.role_tags : [],
          branding: currentBranding,
          maintenance_on_air_template: currentRow?.maintenance_on_air_template ?? null,
        } as OrganizationSnapshotPayload);
      }

      toast.success('Master Crew Directory updated from parsed contacts.', {
        description:
          `Production contacts — added ${added}, updated ${updated}, unchanged ${unchanged}. ` +
          `Org directory contacts — added ${orgDirectoryAdded}, updated ${orgDirectoryUpdated}.`,
      });
    } catch (error) {
      toast.error('Could not import parsed contacts.', {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setContactImportBusy(false);
    }
  };

  const handleDownloadParsedContactsAsOrganizationJson = (): void => {
    if (parsedContactRows.length === 0) {
      toast.error('No parsed contacts available to export.');
      return;
    }
    const selectedRows = parsedContactRows.filter((row) => row.include);
    if (selectedRows.length === 0) {
      toast.error('No parsed contacts selected for export.');
      return;
    }
    const nowIso = new Date().toISOString();
    const productionContacts = selectedRows
      .filter((row) => row.destination === 'production')
      .map((candidate) => ({
      id: crypto.randomUUID(),
      fullName: candidate.fullName.trim(),
      contactType: 'crew' as const,
      roleTags: [] as string[],
      defaultEquipmentItemIds: [] as string[],
      organizationName: undefined,
      functionalArea: candidate.functionalArea?.trim() || undefined,
      preferredVehicle: undefined,
      vehicleNotes: undefined,
      phone: candidate.phone?.trim() || undefined,
      email: candidate.email?.trim() || undefined,
      notes: mergeNotesWithExtension(undefined, candidate.extension),
      baseLocation: undefined,
      unionStatus: undefined,
      isActive: true,
      createdAt: nowIso,
      updatedAt: nowIso,
    }));
    const directoryContacts = selectedRows
      .filter((row) => row.destination === 'org_directory')
      .map((candidate) => ({
        id: crypto.randomUUID(),
        fullName: candidate.fullName.trim(),
        phone: candidate.phone?.trim() || undefined,
        email: candidate.email?.trim() || undefined,
        extension: candidate.extension?.trim() || undefined,
        functionalArea: candidate.functionalArea?.trim() || undefined,
        sourceFile: candidate.sourceFile,
        sourceSheet: candidate.sourceSheet,
        updatedAt: nowIso,
      }));

    const payload = {
      version: 'trackit-organization-export-v1',
      exportedAt: nowIso,
      organizationId: activeOrganizationId || 'unassigned-organization',
      data: {
        contacts: productionContacts,
        position_templates: [],
        inventory_baseline: [],
        role_tags: [],
        branding: {
          directoryContacts,
        },
        maintenance_on_air_template: null,
      },
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `trackIT-org-contacts-from-excel-${nowIso.split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success('Parsed contacts exported as organization JSON.', {
      description: `Exported ${productionContacts.length} production contact(s) and ${directoryContacts.length} org directory contact(s).`,
    });
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

          checkForDuplicates(data);
          setImportReviewOpen(true);
          resolve();
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
              
              importedData[sheetName.toLowerCase()] = normalizeLookupListPayload(items);
            }
          });
          if (workbook.SheetNames.includes("ExpenseCodes")) {
            const expenseCodesSheet = workbook.Sheets["ExpenseCodes"];
            const expenseCodeItems = XLSX.utils.sheet_to_json(expenseCodesSheet);
            importedData.expenseCodes = normalizeLookupListPayload(expenseCodeItems);
          }

          const normalizedImportPayload = normalizeImportPayload(importedData);

          setImportInProgress({
            data: normalizedImportPayload,
            fileType: 'excel',
            file
          });

          // Check for duplicates
          checkForDuplicates(normalizedImportPayload);
          setImportReviewOpen(true);
          resolve();
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
        const mergedItems = mergeLookupListEntries(existingItems, data[key]);
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
    setImportDuplicateAction('merge');
    setImportReviewOpen(false);
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
      categories: Array.isArray(data.categories)
        ? (normalizeLookupListPayload(data.categories) as unknown as Settings['categories'])
        : [],
      units: Array.isArray(data.units) ? normalizeLookupListPayload(data.units) : [],
      locations: Array.isArray(data.locations) ? normalizeLookupListPayload(data.locations) : [],
      suppliers: Array.isArray(data.suppliers) ? normalizeLookupListPayload(data.suppliers) : [],
      projects: Array.isArray(data.projects) ? normalizeLookupListPayload(data.projects) : [],
      expenseCodes: Array.isArray(data.expenseCodes) ? normalizeLookupListPayload(data.expenseCodes) : [],
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

  return (
    <div className="settings-page mx-auto w-full max-w-6xl px-2 py-6 sm:px-4">
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
        </div>
      </div>

      <Tabs value={settingsTab} onValueChange={(value) => setSettingsTab(value as SettingsPrimaryTabId)} className="w-full">
        <div
          className="settings-primary-tabs-shell relative mb-4"
          data-overflowing={isPrimaryTabsOverflowing ? 'true' : 'false'}
          data-can-scroll-left={primaryTabsCanScrollLeft ? 'true' : 'false'}
          data-can-scroll-right={primaryTabsCanScrollRight ? 'true' : 'false'}
        >
          <TabsList
            ref={primaryTabsListRef}
            data-overflowing={isPrimaryTabsOverflowing ? 'true' : 'false'}
            className="settings-primary-tabs flex h-auto min-h-10 w-full max-w-full flex-nowrap justify-start gap-1 overflow-x-auto overflow-y-hidden overscroll-x-contain bg-muted p-1 [-ms-overflow-style:none] [scrollbar-width:none] lg:flex-wrap lg:overflow-x-visible [&::-webkit-scrollbar]:hidden"
          >
            <TabsTrigger value="general" title="General settings" className="inline-flex items-center gap-1.5">
              <SlidersHorizontal className="settings-tab-icon h-4 w-4 shrink-0 opacity-90" aria-hidden />
              <span data-settings-tab-long>General Settings</span>
              <span data-settings-tab-short>General</span>
            </TabsTrigger>
            {canManageSharedConfig && (
              <TabsTrigger value="userDefined" title="Lookup lists" className="inline-flex items-center gap-1.5">
                <Boxes className="settings-tab-icon h-4 w-4 shrink-0 opacity-90" aria-hidden />
                <span data-settings-tab-long>Lookup Lists</span>
                <span data-settings-tab-short>Lookup Lists</span>
              </TabsTrigger>
            )}
            {canManageSharedConfig && (
              <TabsTrigger value="libraries" title="Libraries" className="inline-flex items-center gap-1.5">
                <Library className="settings-tab-icon h-4 w-4 shrink-0 opacity-90" aria-hidden />
                <span data-settings-tab-long>Libraries</span>
                <span data-settings-tab-short>Libraries</span>
              </TabsTrigger>
            )}
            {canManageSharedConfig && (
              <TabsTrigger value="organization" title="Organization library" className="inline-flex items-center gap-1.5">
                <Building2 className="settings-tab-icon h-4 w-4 shrink-0 opacity-90" aria-hidden />
                <span data-settings-tab-long>Organization</span>
                <span data-settings-tab-short>Org</span>
              </TabsTrigger>
            )}
            {canManageSharedConfig && (
              <TabsTrigger value="users" title="Users" className="inline-flex items-center gap-1.5">
                <Users className="settings-tab-icon h-4 w-4 shrink-0 opacity-90" aria-hidden />
                <span data-settings-tab-long>Users</span>
                <span data-settings-tab-short>Users</span>
              </TabsTrigger>
            )}
            <TabsTrigger value="data" title="Data management" className="inline-flex items-center gap-1.5">
              <HardDrive className="settings-tab-icon h-4 w-4 shrink-0 opacity-90" aria-hidden />
              <span data-settings-tab-long>Data Management</span>
              <span data-settings-tab-short>Data</span>
            </TabsTrigger>
            {canAccessWorkspacesTab && (
              <TabsTrigger value="workspaces" title="Workspaces" className="inline-flex items-center gap-1.5">
                <Wrench className="settings-tab-icon h-4 w-4 shrink-0 opacity-90" aria-hidden />
                <span data-settings-tab-long>Workspaces</span>
                <span data-settings-tab-short>Workspaces</span>
              </TabsTrigger>
            )}
            {canManageSharedConfig && (
              <TabsTrigger value="logs" title="System logs" className="inline-flex items-center gap-1.5">
                <ScrollText className="settings-tab-icon h-4 w-4 shrink-0 opacity-90" aria-hidden />
                <span data-settings-tab-long>System Logs</span>
                <span data-settings-tab-short>Logs</span>
              </TabsTrigger>
            )}
          </TabsList>
          <div className="settings-tabs-scroll-hint settings-tabs-scroll-hint-left" aria-hidden>
            <ChevronLeft className="h-4 w-4" />
          </div>
          <div
            className={`settings-tabs-scroll-hint settings-tabs-scroll-hint-right${shouldPulsePrimaryTabsHint ? ' settings-tabs-scroll-hint-pulse-once' : ''}`}
            aria-hidden
          >
            <ChevronRight className="h-4 w-4" />
          </div>
        </div>

        <TabsContent value="general">
          <GeneralSettingsTab
            onOpenCameraSettings={() => setIsCameraDialogOpen(true)}
            settings={defaultSettings}
            onSettingsChange={handleGeneralSettingsChange}
            currentUsername={currentUser?.username ?? 'admin'}
            canEditAssetTagPrefix={canManageSharedConfig}
            canEditAdminNotificationEmail={canManageSharedConfig}
            organizationMaintenanceTemplate={orgMaintenanceTemplateStored}
            activeOrganizationId={activeOrganizationId}
          />
        </TabsContent>

        {canManageSharedConfig && (
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
        )}

        {canManageSharedConfig && (
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
        )}

        {canManageSharedConfig && (
          <TabsContent value="organization" className="space-y-4">
            <OrganizationSettingsSection
              organizationSubTab={organizationSubTab}
              onOrganizationSubTabChange={setOrganizationSubTab}
              authBackend={authBackend}
              organizations={organizations}
              activeOrganizationId={activeOrganizationId}
              activeOrganizationName={activeOrganizationName}
              activeOrganizationRole={activeOrganizationRole}
              organizationsLoading={organizationsLoading}
              selectOrganization={selectOrganization}
              refreshOrganizations={refreshOrganizations}
              orgMaintenanceTemplateStored={orgMaintenanceTemplateStored}
              onAfterOrgMaintenanceSave={() => void refreshOrgMaintenanceTemplate()}
              onNavigateToDataTab={() => setSettingsTab('data')}
              onNavigateToWorkspacesTab={() => setSettingsTab('workspaces')}
              onNavigateToLibrariesPositionTemplates={() => {
                setSettingsTab('libraries');
                setLibrariesPanel('positionTemplates');
              }}
            />
          </TabsContent>
        )}

        {canManageSharedConfig && (
          <TabsContent value="users">
            {authBackend === 'supabase' ? (
              activeWorkspaceId ? (
                <div className="space-y-4">
                  {activeWorkspaceMissingFromList ? (
                    <div className="rounded-md border border-amber-500/50 bg-amber-950/40 px-3 py-2 text-sm text-amber-100">
                      <p className="font-medium text-amber-50">
                        This browser&apos;s active workspace id is not in the workspace list returned for your account.
                      </p>
                      <p className="mt-1 text-amber-100/90">
                        User management calls the API with that id; if the row does not exist in Supabase you will see
                        errors or empty members. Open{' '}
                        <Button
                          type="button"
                          variant="link"
                          className="h-auto p-0 text-amber-200 underline"
                          onClick={() => setSettingsTab('workspaces')}
                        >
                          Workspaces
                        </Button>{' '}
                        and activate the correct team, or compare{' '}
                        <code className="rounded bg-black/30 px-1">VITE_SUPABASE_URL</code> with the project you query in
                        the SQL editor. To list real ids:{' '}
                        <code className="mt-1 block rounded bg-black/30 px-1 font-mono text-xs">
                          select id, name, owner_user_id from workspaces order by created_at desc;
                        </code>
                      </p>
                    </div>
                  ) : null}
                  {lastWorkspaceError ? (
                    <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                      Workspace list error: {lastWorkspaceError}
                    </div>
                  ) : null}
                  <SupabaseWorkspaceUsersCard
                    workspaceId={activeWorkspaceId}
                    workspaceName={activeWorkspaceName}
                    currentUserId={currentUser?.id || ''}
                    canManageUsers={canManageWorkspaceUsers}
                  />
                </div>
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
        )}

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
            onExportOrganizationData={authBackend === 'supabase' ? handleExportOrganizationData : undefined}
            onPreviewOrganizationImportData={authBackend === 'supabase' ? handlePreviewOrganizationImportData : undefined}
            onImportOrganizationData={authBackend === 'supabase' ? handleImportOrganizationData : undefined}
            onResetOrganizationSettings={authBackend === 'supabase' ? handleResetOrganizationSettings : undefined}
            organizationDataLabel={authBackend === 'supabase' ? activeOrganizationName : null}
          />
        </TabsContent>

        {canAccessWorkspacesTab && (
          <TabsContent value="workspaces" className="space-y-6">
            <WorkspaceTeamTab />
            <Card>
              <CardHeader>
                <CardTitle>Workspace Utilities</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Run workspace-level utility actions and migrate assigned production crew into the
                  Master Crew Directory.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setWorkspaceUtilitiesOpen(true)}
                    disabled={!activeWorkspaceId}
                  >
                    Open Workspace Utilities
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={handlePromoteProductionCrew}
                    disabled={crewPromotionBusy}
                  >
                    {crewPromotionBusy
                      ? 'Migrating…'
                      : 'Promote Production Crew to Master Directory'}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => contactExcelImportRef.current?.click()}
                    disabled={contactParseBusy}
                  >
                    {contactParseBusy ? 'Parsing…' : 'Parse Contact Excel Files'}
                  </Button>
                  <input
                    type="file"
                    ref={contactExcelImportRef}
                    accept=".xlsx,.xls"
                    multiple
                    onChange={(event) => void handleParseContactExcelFiles(event)}
                    className="hidden"
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => void handleImportParsedContactsToMaster()}
                    disabled={contactImportBusy || parsedContactRows.length === 0}
                  >
                    {contactImportBusy ? 'Importing…' : 'Import Parsed Contacts to Master'}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setContactPreviewOpen(true)}
                    disabled={parsedContactRows.length === 0}
                  >
                    Preview Parsed Contacts
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleDownloadParsedContactsAsOrganizationJson}
                    disabled={parsedContactRows.length === 0}
                  >
                    Download Parsed Contacts as Org JSON
                  </Button>
                </div>
                {!activeWorkspaceId ? (
                  <p className="text-xs text-muted-foreground">
                    Select an active team workspace to open Workspace Utilities.
                  </p>
                ) : null}
                {parsedContactSourceSummary ? (
                  <div className="rounded-md border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                    <p>
                      Parsed {parsedContactRows.length} contact candidate
                      {parsedContactRows.length === 1 ? '' : 's'} from{' '}
                      {parsedContactSourceSummary.files} file
                      {parsedContactSourceSummary.files === 1 ? '' : 's'}, {' '}
                      {parsedContactSourceSummary.sheets} sheet
                      {parsedContactSourceSummary.sheets === 1 ? '' : 's'}, {' '}
                      {parsedContactSourceSummary.rows} scanned row
                      {parsedContactSourceSummary.rows === 1 ? '' : 's'}.
                    </p>
                    <div className="mt-2 max-h-24 overflow-y-auto rounded border border-border/50 bg-background/40 p-2">
                      {parsedContactSourceSummary.sheetSummaries.map((summary) => (
                        <p key={`${summary.fileName}-${summary.sheetName}`}>
                          {summary.fileName} → {summary.sheetName}: {summary.candidatesFound} candidate
                          {summary.candidatesFound === 1 ? '' : 's'}
                        </p>
                      ))}
                    </div>
                  </div>
                ) : null}
                {contactParseBusy && contactParseProgress ? (
                  <div className="rounded-md border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                    <p className="font-medium text-foreground">
                      Parsing in progress — you can keep using the app while this runs.
                    </p>
                    <p className="mt-1">
                      File {contactParseProgress.fileIndex} of {contactParseProgress.fileTotal}:{' '}
                      {contactParseProgress.fileName}
                    </p>
                    <p>
                      Sheet {contactParseProgress.sheetIndex} of {contactParseProgress.sheetTotal}:{' '}
                      {contactParseProgress.sheetName}
                    </p>
                  </div>
                ) : null}
                {lastCrewPromotionResult ? (
                  <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                    <p>
                      Scanned: {lastCrewPromotionResult.scannedCrewMembers} crew member
                      {lastCrewPromotionResult.scannedCrewMembers === 1 ? '' : 's'}
                    </p>
                    <p>
                      Added: {lastCrewPromotionResult.addedContacts} contact
                      {lastCrewPromotionResult.addedContacts === 1 ? '' : 's'}
                    </p>
                    <p>
                      Skipped existing: {lastCrewPromotionResult.skippedExistingContacts}
                    </p>
                    <p>
                      Skipped invalid: {lastCrewPromotionResult.skippedInvalidCrewMembers}
                    </p>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {canManageSharedConfig && (
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
        )}
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

      {activeWorkspaceId ? (
        <WorkspaceUtilitiesDialog
          open={workspaceUtilitiesOpen}
          workspaceId={activeWorkspaceId}
          workspaceName={activeWorkspaceName ?? 'Active workspace'}
          onClose={() => setWorkspaceUtilitiesOpen(false)}
          onApplied={() => void 0}
        />
      ) : null}

      <Dialog open={contactPreviewOpen} onOpenChange={setContactPreviewOpen}>
        <DraggableDialogContent className="flex h-[min(90vh,860px)] max-h-[min(90vh,860px)] w-[min(calc(100vw-1rem),980px)] flex-col gap-0 overflow-hidden p-0">
          <div className="shrink-0 border-b border-border/60 px-6 pb-3 pt-6">
            <DialogHeader className="space-y-2 p-0 text-left">
              <DialogTitle>Parsed Contact Preview</DialogTitle>
              <DialogDescription>
                Choose which contacts to import and route each row to Production Master Crew or the org-level
                directory bucket.
              </DialogDescription>
            </DialogHeader>
          </div>
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-6 py-4">
            <div className="mb-3 flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setParsedContactRows((previous) => previous.map((row) => ({ ...row, include: true })))
                }
              >
                Select all
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setParsedContactRows((previous) => previous.map((row) => ({ ...row, include: false })))
                }
              >
                Clear all
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setParsedContactRows((previous) =>
                    previous.map((row) => ({
                      ...row,
                      include: (parsedRowIssues.get(row.rowId)?.length ?? 0) === 0 ? row.include : false,
                    })),
                  )
                }
              >
                Exclude flagged
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setParsedContactRows((previous) =>
                    previous.map((row) => ({
                      ...row,
                      include: (parsedRowIssues.get(row.rowId)?.length ?? 0) > 0 ? true : row.include,
                    })),
                  )
                }
              >
                Include flagged
              </Button>
              <div className="mx-1 h-8 w-px bg-border" />
              <Button
                type="button"
                variant={contactPreviewFilter === 'all' ? 'secondary' : 'outline'}
                size="sm"
                onClick={() => setContactPreviewFilter('all')}
              >
                All
              </Button>
              <Button
                type="button"
                variant={contactPreviewFilter === 'included' ? 'secondary' : 'outline'}
                size="sm"
                onClick={() => setContactPreviewFilter('included')}
              >
                Included
              </Button>
              <Button
                type="button"
                variant={contactPreviewFilter === 'production' ? 'secondary' : 'outline'}
                size="sm"
                onClick={() => setContactPreviewFilter('production')}
              >
                Production
              </Button>
              <Button
                type="button"
                variant={contactPreviewFilter === 'org_directory' ? 'secondary' : 'outline'}
                size="sm"
                onClick={() => setContactPreviewFilter('org_directory')}
              >
                Org Directory
              </Button>
              <Button
                type="button"
                variant={contactPreviewFilter === 'flagged' ? 'secondary' : 'outline'}
                size="sm"
                onClick={() => setContactPreviewFilter('flagged')}
              >
                Flagged
              </Button>
              <div className="mx-1 h-8 w-px bg-border" />
              {contactPreviewSourceOptions.map((sourceOption) => (
                <Button
                  key={sourceOption}
                  type="button"
                  variant={contactPreviewSourceFilter === sourceOption ? 'secondary' : 'outline'}
                  size="sm"
                  onClick={() => setContactPreviewSourceFilter(sourceOption)}
                  title={sourceOption === 'all' ? 'All source files' : sourceOption}
                >
                  {sourceOption === 'all'
                    ? 'All Sources'
                    : sourceOption.length > 24
                    ? `${sourceOption.slice(0, 24)}…`
                    : sourceOption}
                </Button>
              ))}
              <Select
                value={contactPreviewSort}
                onValueChange={(value) =>
                  setContactPreviewSort(
                    value === 'name_desc'
                      ? 'name_desc'
                      : value === 'destination'
                      ? 'destination'
                      : 'name_asc',
                  )
                }
              >
                <SelectTrigger className="h-8 w-[220px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="name_asc">Sort: Name A-Z</SelectItem>
                  <SelectItem value="name_desc">Sort: Name Z-A</SelectItem>
                  <SelectItem value="destination">Sort: Destination (chips)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Badge className="bg-blue-600/20 text-blue-200 border border-blue-500/40">
                Total: {previewTally.total}
              </Badge>
              <Badge className="bg-emerald-600/20 text-emerald-200 border border-emerald-500/40">
                Included: {previewTally.included}
              </Badge>
              <Badge className="bg-amber-600/20 text-amber-200 border border-amber-500/40">
                Flagged: {previewTally.flagged}
              </Badge>
              <Badge className="bg-violet-600/20 text-violet-200 border border-violet-500/40">
                Matched master: {previewTally.matchedMaster}
              </Badge>
              <Badge className="bg-cyan-600/20 text-cyan-200 border border-cyan-500/40">
                Production: {previewTally.productionIncluded}/{previewTally.productionTotal}
              </Badge>
              <Badge className="bg-fuchsia-600/20 text-fuchsia-200 border border-fuchsia-500/40">
                Org Directory: {previewTally.directoryIncluded}/{previewTally.directoryTotal}
              </Badge>
            </div>
            <div className="min-h-0 flex-1 overflow-auto rounded-md border border-border/60">
              <table className="w-full border-collapse text-xs">
                <thead className="sticky top-0 bg-muted/90 text-left">
                  <tr className="border-b border-border/60">
                    <th className="px-2 py-2">Use</th>
                    <th className="px-2 py-2">Name</th>
                    <th className="px-2 py-2">Phone</th>
                    <th className="px-2 py-2">Ext</th>
                    <th className="px-2 py-2">Email</th>
                    <th className="px-2 py-2">Area</th>
                    <th className="px-2 py-2">Match</th>
                    <th className="px-2 py-2">Issues</th>
                    <th className="px-2 py-2">Destination</th>
                    <th className="px-2 py-2">Source</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row) => (
                    <tr key={row.rowId} className="border-b border-border/40 align-top">
                      <td className="px-2 py-2">
                        <Checkbox
                          checked={row.include}
                          onCheckedChange={(checked) =>
                            setParsedContactRows((previous) =>
                              previous.map((candidateRow) =>
                                candidateRow.rowId === row.rowId
                                  ? { ...candidateRow, include: Boolean(checked) }
                                  : candidateRow,
                              ),
                            )
                          }
                        />
                      </td>
                      <td className="px-2 py-2">{row.fullName}</td>
                      <td className="px-2 py-2">{row.phone ?? ''}</td>
                      <td className="px-2 py-2">{row.extension ?? ''}</td>
                      <td className="px-2 py-2">{row.email ?? ''}</td>
                      <td className="px-2 py-2">{row.functionalArea ?? ''}</td>
                      <td className="px-2 py-2">
                        {row.matchedMasterContactId ? (
                          <Badge className="bg-violet-600/20 text-violet-200 border border-violet-500/40">
                            Matched master
                          </Badge>
                        ) : (
                          <Badge className="bg-slate-600/20 text-slate-200 border border-slate-500/40">New</Badge>
                        )}
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex flex-wrap gap-1">
                          {(parsedRowIssues.get(row.rowId) ?? []).map((issue) => (
                            <Badge
                              key={`${row.rowId}-${issue}`}
                              className="bg-amber-600/20 text-amber-200 border border-amber-500/40"
                            >
                              {issue === 'invalid_name'
                                ? 'Invalid name'
                                : issue === 'phone_in_name'
                                ? 'Phone in name'
                                : issue === 'handle_in_name'
                                ? 'Handle in name'
                                : 'Possible duplicate'}
                            </Badge>
                          ))}
                        </div>
                      </td>
                      <td className="px-2 py-2">
                        <Badge
                          className={`mb-1 border ${
                            row.destination === 'production'
                              ? 'bg-cyan-600/20 text-cyan-200 border-cyan-500/40'
                              : 'bg-fuchsia-600/20 text-fuchsia-200 border-fuchsia-500/40'
                          }`}
                        >
                          {row.destination === 'production' ? 'Production' : 'Org Directory'}
                        </Badge>
                        <Select
                          value={row.destination}
                          onValueChange={(value) =>
                            setParsedContactRows((previous) =>
                              previous.map((candidateRow) =>
                                candidateRow.rowId === row.rowId
                                  ? {
                                      ...candidateRow,
                                      destination:
                                        value === 'production' ? 'production' : 'org_directory',
                                    }
                                  : candidateRow,
                              ),
                            )
                          }
                        >
                          <SelectTrigger className="h-7 w-[180px] text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="production">Production Master Crew</SelectItem>
                            <SelectItem value="org_directory">Org Directory (non-production)</SelectItem>
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-2 py-2">
                        {row.sourceSheet}
                        <div className="text-[11px] text-muted-foreground">{row.sourceFile}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="shrink-0 border-t border-border/60 px-6 py-4">
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setContactPreviewOpen(false)}>
                Close
              </Button>
            </DialogFooter>
          </div>
        </DraggableDialogContent>
      </Dialog>

      {/* Reconciliation Dialog */}
      <Dialog open={showReconcileDialog} onOpenChange={setShowReconcileDialog}>
        <DraggableDialogContent className="w-[min(calc(100vw-1rem),480px)]">
          {(() => {
            const toSingularLabel = (rawType?: string): string => {
              const value = (rawType ?? '').trim().toLowerCase();
              const singularMap: Record<string, string> = {
                categories: 'category',
                units: 'unit',
                locations: 'location',
                suppliers: 'supplier',
                projects: 'project',
                expensecodes: 'expense code',
              };
              if (singularMap[value]) return singularMap[value];
              if (value.endsWith('ies')) return `${value.slice(0, -3)}y`;
              if (value.endsWith('s') && value.length > 1) return value.slice(0, -1);
              return value || 'value';
            };
            const singularTypeLabel = toSingularLabel(itemToDelete?.type);
            return (
              <>
          <DialogHeader>
            <DialogTitle>Confirm Removal</DialogTitle>
            <DialogDescription>
              The {singularTypeLabel} "{itemToDelete?.value}" is used by {affectedItemsCount} inventory items.
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
                  Remove this {singularTypeLabel} from all items that use it.
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
                  Replace with another {singularTypeLabel} in all affected items.
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
              </>
            );
          })()}
        </DraggableDialogContent>
      </Dialog>

      {/* Import review: payload preview + optional duplicate reconciliation */}
      <Dialog
        open={importReviewOpen && !!importInProgress}
        onOpenChange={(open) => {
          if (!open) {
            setImportDuplicates(null);
            setImportDuplicateReport([]);
            setImportSectionActions({});
            setImportInProgress(null);
            setImportReviewOpen(false);
          }
        }}
      >
        <DraggableDialogContent className="flex h-[min(90vh,860px)] max-h-[min(90vh,860px)] w-[min(calc(100vw-1rem),820px)] flex-col gap-0 overflow-hidden p-0">
          <div className="shrink-0 border-b border-border/60 px-6 pb-3 pt-6">
            <DialogHeader className="space-y-2 p-0 text-left">
              <DialogTitle>
                {importDuplicateReport.length > 0 ? 'Review import — overlaps detected' : 'Review import'}
              </DialogTitle>
              <DialogDescription>
                {importDuplicateReport.length > 0
                  ? `Found ${importDuplicateReport.reduce((sum, section) => sum + section.imported.length, 0)} overlapping list or inventory entries across ${importDuplicateReport.length} section(s). Use the tabs to switch between the file preview and overlap resolution.`
                  : 'Preview what will be imported, then use Import to apply lists and inventory from this file.'}
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-6">
            {importInProgress?.data && importDuplicateReport.length > 0 ? (
              <Tabs
                key={`${importInProgress.file?.name ?? 'import'}-${importDuplicateReport.map((s) => s.type).join('|')}`}
                defaultValue="preview"
                className="flex min-h-0 flex-1 flex-col gap-0 pt-2"
              >
                <TabsList className="mb-2 h-auto shrink-0 flex-wrap justify-start gap-1 bg-muted/50 p-1">
                  <TabsTrigger value="preview" className="text-xs sm:text-sm">
                    List preview
                  </TabsTrigger>
                  <TabsTrigger value="reconcile" className="text-xs sm:text-sm">
                    Resolve overlaps (
                    {importDuplicateReport.reduce((sum, section) => sum + section.imported.length, 0)})
                  </TabsTrigger>
                </TabsList>
                <TabsContent
                  value="preview"
                  className="mt-0 min-h-0 flex-1 overflow-y-auto overflow-x-hidden pr-1 data-[state=inactive]:hidden"
                >
                  <ImportPayloadPreview
                    data={importInProgress.data as NormalizedImportPayload}
                    fileName={importInProgress.file?.name}
                    maxLinesPerList={45}
                  />
                </TabsContent>
                <TabsContent
                  value="reconcile"
                  className="mt-0 flex min-h-0 flex-1 flex-col gap-3 overflow-hidden data-[state=inactive]:hidden"
                >
                  <div className="shrink-0 space-y-2 rounded-md border border-border/60 bg-muted/10 p-3">
                    <p className="text-xs font-medium text-foreground">Default for all sections</p>
                    <div className="flex items-start gap-2">
                      <input
                        type="radio"
                        id="skip-option"
                        name="import-action"
                        checked={importDuplicateAction === 'skip'}
                        onChange={() => setImportDuplicateAction('skip')}
                        className="mt-1"
                      />
                      <div>
                        <label htmlFor="skip-option" className="font-medium text-foreground">
                          Skip duplicate rows
                        </label>
                        <p className="text-sm text-muted-foreground">
                          Skip list rows whose id or top-level name already exists. Other rows are still added.
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <input
                        type="radio"
                        id="replace-option"
                        name="import-action"
                        checked={importDuplicateAction === 'replace'}
                        onChange={() => setImportDuplicateAction('replace')}
                        className="mt-1"
                      />
                      <div>
                        <label htmlFor="replace-option" className="font-medium text-foreground">
                          Replace existing items
                        </label>
                        <p className="text-sm text-muted-foreground">
                          Replace matching rows with the imported versions (per section below).
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <input
                        type="radio"
                        id="merge-option"
                        name="import-action"
                        checked={importDuplicateAction === 'merge'}
                        onChange={() => setImportDuplicateAction('merge')}
                        className="mt-1"
                      />
                      <div>
                        <label htmlFor="merge-option" className="font-medium text-foreground">
                          Merge (recommended for locations)
                        </label>
                        <p className="text-sm text-muted-foreground">
                          Same-named parents combine; nested rows merge by id. Keeps existing parent ids.
                        </p>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Override the default per section in each tab. Scroll the tab row if many lists conflict.
                    </p>
                  </div>

                  <Tabs
                    defaultValue={importDuplicateReport[0]?.type ?? 'categories'}
                    className="flex min-h-0 flex-1 flex-col overflow-hidden"
                  >
                    <TabsList className="mb-2 h-auto max-h-28 shrink-0 flex-wrap justify-start gap-1 overflow-y-auto border border-border/40 bg-background/80 p-1">
                      {importDuplicateReport.map((section) => (
                        <TabsTrigger
                          key={section.type}
                          value={section.type}
                          className="max-w-[11rem] truncate px-2 py-1.5 text-[11px] capitalize sm:text-xs"
                          title={String(section.type)}
                        >
                          {section.type} ({section.imported.length})
                        </TabsTrigger>
                      ))}
                    </TabsList>
                    {importDuplicateReport.map((section) => (
                      <TabsContent
                        key={section.type}
                        value={section.type}
                        className="mt-0 flex min-h-0 flex-1 flex-col gap-2 overflow-hidden rounded-md border border-border/50 data-[state=inactive]:hidden"
                      >
                        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b bg-muted/30 px-3 py-2">
                          <div className="text-sm font-medium capitalize">
                            {section.type} — action for this section
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
                        <div className="min-h-0 flex-1 overflow-y-auto">
                          <table className="w-full text-sm">
                            <thead className="sticky top-0 z-[1] bg-muted/90 backdrop-blur-sm">
                              <tr>
                                <th className="px-3 py-2 text-left">Existing</th>
                                <th className="px-3 py-2 text-left">Imported</th>
                              </tr>
                            </thead>
                            <tbody>
                              {section.imported.slice(0, 12).map((entry, index) => {
                                const match = section.existing.find(
                                  (ex) => ex.id === entry.id || ex.name === entry.name,
                                );
                                return (
                                  <tr key={`${section.type}-${String(entry.id ?? index)}`} className="border-t border-border/40">
                                    <td className="px-3 py-2 text-muted-foreground">
                                      {match?.name || match?.id || '(match by id/name)'}
                                    </td>
                                    <td className="px-3 py-2">{entry.name || entry.id || '(unnamed)'}</td>
                                  </tr>
                                );
                              })}
                              {section.imported.length > 12 ? (
                                <tr className="border-t border-border/40">
                                  <td colSpan={2} className="px-3 py-2 text-xs text-muted-foreground italic">
                                    +{section.imported.length - 12} more conflicts
                                  </td>
                                </tr>
                              ) : null}
                            </tbody>
                          </table>
                        </div>
                      </TabsContent>
                    ))}
                  </Tabs>
                </TabsContent>
              </Tabs>
            ) : importInProgress?.data ? (
              <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden py-2 pr-1">
                <ImportPayloadPreview
                  data={importInProgress.data as NormalizedImportPayload}
                  fileName={importInProgress.file?.name}
                  maxLinesPerList={50}
                />
              </div>
            ) : null}
          </div>

          <DialogFooter className="shrink-0 gap-2 border-t border-border/60 bg-background px-6 py-4">
            <Button
              variant="outline"
              type="button"
              onClick={() => {
                setImportDuplicates(null);
                setImportDuplicateReport([]);
                setImportSectionActions({});
                setImportInProgress(null);
                setImportReviewOpen(false);
              }}
            >
              Cancel
            </Button>
            <Button type="button" onClick={handleImportConfirm}>
              Import
            </Button>
          </DialogFooter>
        </DraggableDialogContent>
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
        <DraggableDialogContent className="w-[min(calc(100vw-1rem),460px)]">
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
        </DraggableDialogContent>
      </Dialog>
    </div>
  );
}
