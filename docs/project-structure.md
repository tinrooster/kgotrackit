# trackIT v2 — Project Structure

**Version:** 1.0.1 · **Last reviewed:** 2026-05-07

---

## Repository layout

```
trackIT_v2/
│
├── src/                            # Application source
│   ├── App.tsx                     # Root router, auth guard, theme/condensed init
│   ├── main.tsx                    # React DOM entry + /login route
│   ├── globals.css / index.css     # Tailwind base + CSS custom properties
│   │
│   ├── pages/                      # Route-level pages (see Routes section)
│   ├── components/                 # Feature and shared UI components
│   │   ├── settings/               # Settings tab components
│   │   ├── setup/                  # First-run / workspace setup dialogs
│   │   ├── cabinets/               # Cabinet-specific components
│   │   ├── forms/                  # Reusable form section helpers
│   │   ├── formatting/             # Cell/value display formatters
│   │   └── ui/                     # shadcn/Radix UI primitives
│   │
│   ├── contexts/                   # React context providers
│   ├── hooks/                      # Custom React hooks
│   ├── lib/                        # Services, utilities, storage logic
│   │   ├── supabase/               # Supabase client, cloud sync, workspace data
│   │   └── ui/                     # UI-layer CSS helpers
│   ├── types/                      # TypeScript interfaces and enums
│   ├── utils/                      # Low-level utilities (toast, auth, url, logger)
│   ├── config/                     # Static config files
│   │
│   ├── deprecated/                 # Archived code — do not import
│   │   ├── AutocompleteInput.tsx   # @deprecated — use src/components/AutocompleteInput.tsx
│   │   └── settings/page.tsx       # DEPRECATED Next.js App Router experiment
│   │
│   └── app/                        # Leftover Next.js App Router scaffolding — unused
│       ├── checkout/page.tsx        # Not wired to router; stub only
│       └── checkouts/page.tsx       # Not wired to router; stub only
│
├── supabase/                       # Supabase project config
│   ├── migrations/                 # SQL migrations (apply in order)
│   └── functions/                  # Deno Edge Functions
│       ├── admin-settings-notify/  # Email notifications via Resend
│       └── workspace-member-admin/ # Service-role member management API
│
├── public/
│   └── config/
│       └── rack-locations.json     # Optional rack preset override (fetched at runtime)
│
├── scripts/
│   └── baselines/                  # PowerShell inventory baseline comparison scripts
│
├── docs/                           # Project documentation (this folder)
├── docs_old/                       # Archived previous documentation
├── test-data/                      # Sample JSON payloads for manual testing
├── graphify-out/                   # Auto-generated code knowledge graph
│
├── index.html                      # Vite HTML entry
├── vite.config.ts                  # Vite config
├── vite.config.web.ts              # Vite static web build variant
├── tailwind.config.ts              # Tailwind theme + dark mode config
├── components.json                 # shadcn/ui registry config
└── .graphifyignore                 # Paths excluded from graphify graph
```

---

## Routing

Routes are defined across two files:

**`src/main.tsx`**

| Path | Component | Notes |
|---|---|---|
| `/login` | `LoginPage` | Unauthenticated entry point |
| `/*` | `App` | All in-app routes; `ProtectedRoute` redirects to `/login` if unauthenticated |

**`src/App.tsx`** (all routes wrapped in `ProtectedRoute`)

| Path | Component | Description |
|---|---|---|
| `/` | `DashboardPage` | Summary cards, category/location charts, inventory overview |
| `/inventory` | `InventoryPage` | Full inventory table: CRUD, filters, bulk ops, printing, QR |
| `/checkout` | `CheckoutPage` | Secure cabinet check-in / check-out workflow |
| `/productions` | `ProductionsPage` | Event/shoot productions: cards, slide-out detail, checklist, crew, schedule, planner workspace |
| `/reports` | `ReportsPage` | Standard and custom report runner, CSV/Excel export |
| `/settings` | `SettingsPage` | All settings tabs (tabbed, see below) |
| `/help` | `HelpPage` | In-app help reference |
| `/about` | `AboutPage` | Version info and credits |
| `/crew` | `Navigate → /productions` | Legacy path; crew is edited per-production, not top-level nav |
| `*` | `Navigate to /` | Catch-all redirect (no 404 page) |

**Pages present on disk but not wired to any route:**

These files exist under `src/pages/` but are not imported or routed. They are candidates for removal.

- `Dashboard.tsx` — alternate dashboard implementation
- `Inventory.tsx` — older inventory implementation
- `ItemDetail.tsx` — item detail with `useParams('itemId')`
- `ItemDetailsPage.tsx` — item detail with `useParams('id')`
- `NotFound.tsx` — 404 page (App uses `<Navigate>` instead)
- `RestockPage.tsx` — restock form driven by `?id=` query param

**Pages used as components (not top-level routes):**

- `CabinetManagement.tsx` — embedded inside `settings/UserDefinedListsSection`
- `TemplatesPage.tsx` — embedded inside `settings/LibrariesSection`
- `CrewPage.tsx` — **not currently routed**; crew contacts CRUD UI on disk (`crewContactsService` is used from Productions crew “Add from master DB”). Legacy `/crew` redirects to `/productions`.

---

## Settings tabs (`src/pages/SettingsPage.tsx`)

| Tab | Component | Manages |
|---|---|---|
| `general` | `GeneralSettingsTab` | Theme, layout, display preferences |
| `lookup-lists` | `UserDefinedListsSection` | Categories, units, locations, suppliers, projects, expense codes |
| `libraries` | `LibrariesSection` | Device library catalog, templates |
| `data` | `WorkspaceTeamTab` | Personal vs team workspace selection, create/switch workspace |
| `users` | `SupabaseWorkspaceUsersCard` + `AddUserDialog` | Workspace member management |
| `backup-restore` | `DataBackupTab` | Local restore points (IndexedDB), full-payload backup/restore, CSV/Excel import-export |
| `logs` | `SystemLogs` | Durable audit log viewer and download |
| `camera` | `CameraSettingsDialog` | Camera device selection for barcode/QR scanning |

---

## Components (`src/components/`)

### Feature components

| File | Purpose |
|---|---|
| `Navigation.tsx` | App shell nav bar (Dashboard, Inventory, Productions, Checkout, Reports, Settings); workspace context chip (Personal / Team); no standalone Crew item (`/crew` → Productions) |
| `LoginPage.tsx` | Full-page login layout (route `/login`) |
| `LoginForm.tsx` | Sign-in form; handles both local and Supabase auth paths |
| `UserMenu.tsx` | Account dropdown (logout, etc.) |
| `ErrorBoundary.tsx` | React class error boundary wrapping app sections |
| `SupabaseSyncBridge.tsx` | Bridges cloud sync lifecycle events for children |
| `AddItemDialog.tsx` | Modal wrapper — triggers item creation flow |
| `AddItemForm.tsx` | Multi-tab item creation form |
| `EditItemDialog.tsx` | Modal wrapper — triggers item edit flow |
| `EditItemForm.tsx` | Multi-tab item edit form (mirrors add) |
| `DuplicateItemDialog.tsx` | Pre-fills add form from an existing item |
| `BasicDetailsTab.tsx` | Core item fields tab (name, category, location, quantity, etc.) |
| `AdditionalInfoTab.tsx` | Additional info tab (cable fields, custom fields, notes) |
| `InventorySupplyTab.tsx` | Supply and ordering fields tab |
| `DecommissioningTab.tsx` | EOL / asset status and decommission dates tab |
| `InventoryTable.tsx` | Main inventory data table |
| `BatchOperations.tsx` | Bulk select, delete, edit, print, and QR label generation |
| `ItemDetails.tsx` | Read-only item detail panel with supplier info block and edit/delete hooks |
| `InventoryHistory.tsx` | Timeline/table of history entries for an item |
| `InventoryAdjustment.tsx` | Adjust quantity for a single item |
| `ItemPhotoField.tsx` | Photo URL / capture field wired to forms |
| `QuickCapturePhotoDialog.tsx` | Quick photo capture dialog |
| `ExportDialog.tsx` | CSV/Excel export with column picker |
| `ImportDialog.tsx` | CSV/Excel import with field mapping and validation |
| `BarcodeScannerDialog.tsx` | html5-qrcode scanner modal (camera + file-decode fallback) |
| `BarcodeScanner.tsx` | Camera/barcode scan UI component |
| `SimpleBarcodeScanner.tsx` | Lighter scanner surface |
| `ManualBarcodeInput.tsx` | Manual barcode entry fallback |
| `MobileQuickAddDialog.tsx` | Mobile-optimised quick add dialog |
| `QuickLookup.tsx` | Barcode/asset-tag lookup modal |
| `AutocompleteInput.tsx` | Combobox input with live suggestions from lookup lists |
| `TemplateForm.tsx` | Create/edit item template form |
| `AddUserDialog.tsx` | Add a local user |
| `UsersTab.tsx` | Local user management tab content |
| `CategoryManager.tsx` | Flat category list editor |
| `CategoryTreeManager.tsx` | Hierarchical category editor |
| `EditableItemList.tsx` | Editable flat lookup-value list |
| `EditableItemWithSubcategoriesList.tsx` | DnD + nested subcategory editor for structured lookup lists |
| `ListManagement.tsx` | Generic list management UI (root copy) |
| `SortableItem.tsx` | Single draggable row for DnD list contexts |
| `ReassignSettingDialog.tsx` | Reassign items when deleting or renaming a lookup value |
| `BulkCableFiberSection.tsx` | Cable/fiber-specific bulk form section |
| `OrderStatusSelector.tsx` | Order status field control |
| `SupplierWebsiteStatusBlock.tsx` | Supplier URL display block |
| `DashboardSummaryCard.tsx` | Metric/summary card for dashboard views |
| `CategorySummary.tsx` | Category-level aggregate summary |
| `ProjectSummary.tsx` | Project-level aggregate summary |
| `ProjectDetailedReport.tsx` | Detailed project report panel |
| `LowStockItemsTable.tsx` | Table of items at or below reorder level |
| `CameraSettingsDialog.tsx` | Camera device picker; exports device ID key + update event name |

### Productions (`src/components/productions/`)

| File | Purpose |
|---|---|
| `ProductionsPage.tsx` (`pages/`) | `/productions` hub: filters, undo/redo, new production (**blank vs clone-from-existing**) |
| `ProductionCard.tsx` | Production summary tile |
| `ProductionDetail.tsx` | Right **Sheet** detail; **Planner Workspace** draggable dialog; outside overlay does **not** dismiss panes (avoids losing unsubmitted edits) |
| `ProductionForm.tsx` | Create/edit metadata; persists dates via `normalizeDateInputValue` |
| `ChecklistEditor.tsx` | Checklist groups: collapse, reorder, inventory links |
| `VehiclePacklistEditor.tsx` | Vehicle packlists tied to checklist |
| `CrewEditor.tsx` | Crew list by **department** (rename/delete department with icons); phone/email fields; shifts; templates; master DB import |
| `CrewScheduleCalendar.tsx` | Crew schedule scoped to production date range |
| `InventoryItemPicker.tsx` | Attach inventory items to checklist lines |
| `BulkInventorySelectionDialog.tsx` | Multi-select bulk link dialog |

Production date/time normalization: **`src/lib/dateTimeInputs.ts`** (`normalizeDateInputValue`, `normalizeQuarterHourTime`, shared minute helpers) — reuse target for Schedule + crew shifts + metadata dates.

**Stale / test artefacts in `src/components/`** (present on disk, not actively used in production flows):

- `InventoryTable.old.tsx` — legacy table (`.old` suffix)
- `MobileQuickAddDialog.v1.tsx` — parallel version (`.v1` suffix)
- `DebugInfo.tsx` — renders null; logs `data` to console only
- `MinimalTest.tsx` — minimal test harness
- `TestComponent.tsx` — dev test component

### Cabinets (`src/components/cabinets/`)

| File | Purpose |
|---|---|
| `CabinetManager.tsx` | Cabinet grid/editor with items and location assignment |
| `ItemCheckInOut.tsx` | Check-in / check-out transaction form |
| `CheckoutHistory.tsx` | History list for a cabinet's checkout events |
| `QRCodeManager.tsx` | Generate and manage QR codes for cabinets |
| `QRScanner.tsx` | Scan a QR code within cabinet workflows |

### Settings (`src/components/settings/`)

| File | Purpose |
|---|---|
| `CreateWorkspaceDialog.tsx` | Create a new team workspace and push initial snapshot |
| `DataBackupTab.tsx` | Backup/restore tab: local restore points, full-payload import/export, settings snapshot |
| `DeleteListItemDialog.tsx` | Confirm deletion with optional reassignment to another value |
| `DeviceLibrarySortableList.tsx` | DnD list for device library catalog entries |
| `DeviceLibraryTab.tsx` | Device library settings tab |
| `FinancialCodesTab.tsx` | Financial/GL code definitions tab |
| `GeneralSettingsTab.tsx` | General UI and inventory defaults (theme, layout, display) |
| `LibrariesSection.tsx` | Libraries hub — embeds `TemplatesPage`, navigates to related flows |
| `ListManagement.tsx` | Settings-scoped list management (distinct from root `ListManagement.tsx`) |
| `SettingsPage.tsx` | Tabbed settings layout component used inside `pages/SettingsPage.tsx` |
| `SupabaseWorkspaceUsersCard.tsx` | Workspace members admin card for Supabase mode |
| `SystemLogs.tsx` | Log viewer merging in-memory, durable, and legacy log sources |
| `TemplatesSortableList.tsx` | Sortable templates list |
| `UserDefinedListsSection.tsx` | User-defined lookup lists section; embeds `CabinetManagement` |
| `WorkspaceTeamTab.tsx` | Team/workspace mode tab — switch between personal and team data |
| `WorkspaceUtilitiesDialog.tsx` | Workspace maintenance utilities |

### Setup (`src/components/setup/`)

| File | Purpose |
|---|---|
| `InitialDefaultsDialog.tsx` | First-run modal: choose blank or starter defaults, optional sample inventory |

### Forms (`src/components/forms/`)

| File | Purpose |
|---|---|
| `OptionalFormCollapsible.tsx` | Collapsible wrapper for optional form sections |
| `ReqAsterisk.tsx` | Required-field asterisk indicator |

### Formatting (`src/components/formatting/`)

| File | Purpose |
|---|---|
| `CellValue.tsx` | `FormatCellValue` — formats one inventory table cell by column ID |

### UI primitives (`src/components/ui/`)

shadcn/Radix-style wrappers. Each file is a thin styled wrapper around one UI pattern:

`accordion` · `alert-dialog` · `alert` · `aspect-ratio` · `avatar` · `badge` · `breadcrumb` · `button` · `calendar` · `card` · `carousel` · `chart` · `checkbox` · `collapsible` · `command` · `combobox` · `context-menu` · `dialog` · `draggable-dialog` · `drawer` · `dropdown-menu` · `form` · `hover-card` · `input` · `input-otp` · `label` · `list-detail-collapsible` · `menubar` · `navigation-menu` · `nested-dialog-portal-container` · `pagination` · `popover` · `progress` · `radio-group` · `resizable` · `scroll-area` · `select` · `separator` · `sheet` · `sidebar` · `skeleton` · `slider` · `sonner` · `switch` · `table` · `tabs` · `textarea` · `toast` · `toaster` · `toggle` · `toggle-group` · `tooltip`

---

## Contexts (`src/contexts/`)

### `AuthContext.tsx`
Exports: `AuthProvider`, `useAuth`, `User`, `UserWithPassword`, `LoginResult`

| Provided value | Type | Notes |
|---|---|---|
| `currentUser` | `User \| null` | Local: `{ id, username, displayName, role: 'admin'\|'user'\|'viewer', ... }` · Supabase: mapped via `mapSupabaseUserToAppUser` |
| `authBackend` | `'local' \| 'supabase'` | Determined at init from Supabase config presence |
| `loading` | `boolean` | Auth state initialisation in progress |
| `login` | `(username, password, rememberMe) => Promise<LoginResult>` | Dispatches to local or Supabase path |
| `logout` | `() => void` | Clears session and active workspace |
| `resetPassword` | — | Local-auth only |
| `requestPasswordResetEmail` | — | Supabase magic-link / reset path |

### `WorkspaceContext.tsx`
Exports: `WorkspaceProvider`, `useWorkspace`

| Provided value | Type | Notes |
|---|---|---|
| `workspaces` | `WorkspaceSummary[]` | List of Supabase workspaces the user belongs to |
| `activeWorkspaceId` | `string \| null` | `null` = personal (`user_app_data`) mode |
| `activeWorkspaceRole` | `'admin' \| 'editor' \| 'viewer' \| null` | Role in the active team workspace; `null` in personal mode |
| `loading` | `boolean` | Workspace list fetch in progress |
| `refreshWorkspaces` | `() => Promise<void>` | Reload workspace list from Supabase |
| `selectPersonalData` | `() => void` | Switch to personal mode |
| `selectWorkspace` | `(id: string) => void` | Switch to a team workspace |

---

## Hooks (`src/hooks/`)

| File | Export | Purpose |
|---|---|---|
| `useInventory.ts` | `useInventory` | Loads items + lookup lists from `storageService`; CRUD helpers; setup-state check |
| `useInventoryPermissions.ts` | `useInventoryPermissions` | `canBulkDelete`, `canBatchEdit` — derived from `currentUser.role` + `activeWorkspaceRole` |
| `useLocalStorage.ts` | `useLocalStorage` | React state synced to `localStorage` for a given key |
| `use-mobile.tsx` | `useIsMobile` | `true` when viewport ≤ 768 px via `matchMedia` |
| `use-toast.ts` | `useToast`, `toast` | shadcn-style toast state machine (reducer + action queue) |

---

## Libraries (`src/lib/`)

### Storage and sync

| File | Responsibility |
|---|---|
| `storageService.ts` | Core read/write for all app data keys. Uses `localStorage` with an optional legacy bridge fallback. Fires `trackit:settings-updated` and `trackit:custom-reports-updated` custom events. Exports `STORAGE_KEYS`, `getItems`, `saveItems`, `getSettings`, `saveSettings`, `getTemplates`, `saveTemplates`, and others. |
| `settingsService.ts` | `SettingsService` class + Zod `defaultSettingsSchema` for display preferences (`theme`, `condensedView`, `mobileTabletUi`, column widths, etc.). |
| `financialSettingsService.ts` | `FinancialCodeEntry` load/save against `localStorage`. |
| `cloudSyncEvents.ts` | Lightweight custom-event bus: `requestCloudSync`, `dispatchCloudHydrated`, `CLOUD_HYDRATED_EVENT`. |
| `localRestorePoints.ts` | Named full-payload snapshots in IndexedDB — up to 8 (ring buffer). Create, list, restore, delete. |
| `backupValidation.ts` | Client-side schema validation for full backup and settings-only JSON payloads before apply. |
| `trackItDailyBackup.ts` | `buildFullOfflineBackupPayload` — constructs full export payload object (used by manual export; daily auto-download removed from scope). |

### Supabase (`src/lib/supabase/`)

| File | Responsibility |
|---|---|
| `client.ts` | `getSupabase()` singleton, `isSupabaseConfigured()`, URL normalisation. |
| `cloudData.ts` | Personal-mode sync: `bootstrapCloudData` (pull on sign-in), `collectLocalSnapshot`, debounced `pushUserAppData`, `applySnapshotToLocal`. |
| `workspaceData.ts` | Workspace CRUD: `listWorkspaceSummariesForUser`, `pullWorkspaceAppData`, `pushWorkspaceSnapshot`, `createWorkspace`, `getActiveWorkspaceId`, `setActiveWorkspaceId`, `fetchWorkspaceMemberRole`. |
| `workspaceMemberAdmin.ts` | `invokeWorkspaceMemberAdmin` — typed client for the `workspace-member-admin` Edge Function (list, invite, update role, remove, delete workspace, reset password). |
| `adminNotifications.ts` | `sendAdminSettingsNotification` — typed client for the `admin-settings-notify` Edge Function. |
| `formatSupabaseError.ts` | `formatSupabaseOrUnknownError` — normalises Supabase error objects to human-readable strings. |

### Inventory logic

| File | Responsibility |
|---|---|
| `itemUpdateService.ts` | `ItemUpdateService` — propagates setting renames (category, location, supplier, unit, cabinet) across all items; validates cabinet assignment. |
| `inventoryIdGeneration.ts` | Asset tag generation (`{prefix}_{YYMMDD}_{seq}`), monotonic `recordId` allocation. |
| `inventoryUndo.ts` | Undo/redo snapshot stack for inventory mutations in `localStorage`. |
| `groupInventoryReconciliation.ts` | `reconcileInventoryGroup` — bulk reconcile items against lookup list values. |
| `listReconcileFixes.ts` | Per-panel auto-reconcile helpers invoked on list save; `fixUnreconciledForLookupPanel`, `panelSupportsListReconcile`. |
| `referenceNormalization.ts` | `normalizeProjectValue`, `normalizeLocationValue` — canonical id/path normalisation at write boundaries. |
| `deviceLibraryStorage.ts` | Read/write device catalog entries; `parseDeviceLibraryFromBackup`. |
| `deviceLibraryFormApply.ts` | Map a `DeviceLibraryEntry` onto item form fields when a device name matches the library. |
| `exportUtils.ts` | `exportToExcel`, `exportToCSV` used by export dialog and reports. |
| `restockIntent.ts` | Target-quantity and package-increment math helpers for restock flows. |
| `imageNormalization.ts` | Client-side image resize/compression to data URLs before storage. |
| `productionService.ts` | `getProductions`, `saveProductions`, CRUD, packlist PDF export; `PRODUCTIONS_UPDATED_EVENT` |
| `productionUndo.ts` | Undo/redo stack for productions list mutations (`ProductionsPage`) |
| `positionTemplatesService.ts` | Organization-scoped crew position templates (used in `CrewEditor`) |
| `crewContactsService.ts` | Workspace crew roster read/write keyed for cloud bundle + Productions import |

### Settings and lookup helpers

| File | Responsibility |
|---|---|
| `locationOptions.ts` | Flatten hierarchical location tree to option list; find location by id. |
| `projectOptions.ts` | Flatten project tree; resolve value/display labels. |
| `resolveLocationLabel.ts` | `resolveLocationDisplay` — human-readable location from raw id/path/name. |
| `inventoryFormDefaults.ts` | `getTodayDateInputValue`, `resolveDefaultUnitName`. |
| `inventoryFormTabs.ts` | Tab IDs, order, and `getFirstTabWithErrors` helper. |
| `rackLocationsConfig.ts` | Load rack position presets from `public/config/rack-locations.json` or bundled defaults; `refreshRackLocationsFromServer`. |
| `cableFacetPicklists.ts` | Predefined picklists for cable colour, fibre mode, and connector type. |
| `decommissioningAssetStatusOptions.ts` | Grouped asset-status label/value options for decommissioning workflows. |
| `lookupAccentColors.ts` | Accent colour mapping for location/project chips. |
| `supplierProfiles.ts` | `findSupplierProfile`, `toSupplierProfile`, `clean` — derive read-only supplier panel data from lookup entries. |
| `initData.ts` | Stub — initialization logic removed; file retained. |

### Utilities

| File | Responsibility |
|---|---|
| `logging.ts` | `FileLogger` / `logger` singleton — durable audit log backed by `localStorage` key `durable-system-audit-logs`. Methods: `info`, `warn`, `error`, `log`, `setContext`, `downloadLogs`. |
| `dummyData.ts` | `isFreshSetupState`, `applySetupDefaultsChoice`, `getSetupDefaultsChoice`, `recordSetupChoiceForWorkspace`, starter inventory seed. |
| `utils.ts` | `cn` (clsx + twMerge), `debounce`, `formatCurrency`, `truncateText`, `stringToColor`, `ensureUrlProtocol`. |
| `dateTimeInputs.ts` | Production flows: `normalizeDateInputValue`, quarter-hour `normalizeQuarterHourTime`, shared minute helpers for schedule/shift/date fields |
| `ui/collapsibleSectionSurface.ts` | CSS class helper for collapsible section card surfaces |

---

## Utilities (`src/utils/`)

| File | Responsibility |
|---|---|
| `passwordUtils.ts` | Password validation, `comparePasswords`, hashing — used by local auth in `AuthContext`. |
| `toast.ts` | Thin `sonner` wrappers: `showSuccess`, `showError`, `showLoading`, `dismissToast`. |
| `logger.ts` | `FileLogger` + browser log-download helpers. |
| `url.ts` | `ensureUrlProtocol` — also present in `lib/utils.ts`; duplicate concern. |

---

## Types (`src/types/`)

### `inventory.ts`

| Export | Description |
|---|---|
| `OrderStatus` | Enum: `PENDING`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`, `BACK_ORDERED` |
| `FiberOpticMode` | `'sm' \| 'mm' \| 'na' \| 'mtp_mpo'` |
| `InventoryItem` | Core inventory record — full field list below |
| `InventoryHistoryEntry` | History event: `itemId`, `previousQuantity`, `newQuantity`, `reason`, `timestamp`, `userId`, `userName` |
| `Template` | Omit `id` and `lastUpdated` from `InventoryItem`; adds `templateName` |
| `CategoryNode` | Hierarchical category node: `id`, `name`, `children[]`, `parentId`, `path` |
| `ItemWithSubcategories` | Lookup-list node (categories, units, locations, suppliers, projects); also carries supplier contact fields and location rack fields |

**`InventoryItem` field groups:**

| Group | Key fields |
|---|---|
| Identity | `id` (UUID), `recordId` (monotonic), `assetId` (`{prefix}_{YYMMDD}_{seq}`), `companyAssetTag` |
| Description | `name`, `description`, `category`, `subcategory`, `unit`, `unitSubcategory`, `manufacturer`, `modelNumber`, `serialNumber`, `barcode` |
| Location | `location`, `locationSubcategory`, `cabinet`, `rackLocation` |
| Quantity | `quantity`, `minQuantity`, `reorderLevel`, `assetTrackingMode` (`line_item \| per_unit`), `assetTagEnd` |
| Financial | `expenseCode`, `expenseTypeCode`, `expenseTypeDescription`, `costCenterCode`, `costCenterDescription`, `costPerUnit`, `price`, `orderStatus`, `deliveryPercentage`, `expectedDeliveryDate` |
| Project | `project`, `notes`, `additionalNotes`, `manufacturerNotes`, `customFields` |
| Supplier | `supplier`, `supplierWebsite`, `deviceLibraryId` |
| Dates | `dateInService`, `lastMaintenanceDate`, `nextMaintenanceDate`, `decomEOLDate`, `decomCutoverDate` |
| Asset status | `assetStatus` (`active \| hot_spare \| cold_spare \| in_service \| ready_decommission \| slated_removal \| cut_over_pending \| ewaste \| other`) |
| Cable | `cableColor`, `fiberMode` (`sm \| mm \| na \| mtp_mpo`), `connectorType`, `cableLotNumber` |
| Media | `photoUrl` (data URL or HTTPS URL), `qrCode` |
| Audit | `lastUpdated`, `lastModifiedBy` |
| Decomm notes | `decomNotes` |

### Other type files

| File | Key exports |
|---|---|
| `cabinets.ts` | `Cabinet` (`id`, `name`, `locationId`, `isSecure`, `allowedCategories[]`, `qrCode`, `description`), `cabinetSchema` (Zod), `CabinetWithItems` |
| `deviceLibrary.ts` | `DeviceLibraryKind`, `DEVICE_LIBRARY_KIND_PRESETS`, `DeviceLibraryEntry` |
| `templates.ts` | `ItemTemplate`, `TemplateCategory` |
| `productions.ts` | `Production`, `ProductionCrewMember` (`department`, `phone`, `email`, templates), checklist/packlists, `CrewScheduleEntry`, status enums |
| `crewContacts.ts` | `CrewContact`, drafts — roster used when importing crew into productions |
| `logging.ts` | `LogEntry` — log event interface |
| `html5-qrcode.d.ts` | `declare module 'html5-qrcode'` — `Html5QrcodeScanner` type declaration |

---

## Supabase schema (`supabase/migrations/`)

Apply migrations in filename order via the Supabase SQL editor or `supabase db push`.

| Migration | What it creates / modifies |
|---|---|
| `20260502_user_app_data.sql` | `user_app_data` — one row per Supabase user. Columns: `user_id` (PK), `items`, `settings`, `templates`, `history`, `cabinets`, `financial`, `ui_defaults`, `general_settings`. RLS: `auth.uid() = user_id`. |
| `20260505_user_app_data_custom_report_definitions.sql` | Adds `custom_report_definitions jsonb` column to `user_app_data`. |
| `20260506_workspace_shared_data.sql` | `workspaces` (`id`, `name`, `owner_user_id`), `workspace_members` (`workspace_id`, `user_id`, `role`: `admin\|editor\|viewer`), `workspace_app_data` (same shape as `user_app_data` plus `custom_report_definitions`, keyed by `workspace_id`). Full RLS via membership join. |
| `20260507_workspace_rls_recursion_fix.sql` | Fixes infinite-recursion in RLS policy on `workspace_members` self-join. |
| `20260508_workspace_owner_select.sql` | Grants workspace owners direct `SELECT` on their own workspace rows. |

### Edge Functions (`supabase/functions/`)

| Function | Trigger / purpose |
|---|---|
| `workspace-member-admin` | POST with bearer token. Verifies caller is a workspace admin, then executes service-role operations: list members, invite, update role, remove member, delete workspace, reset password. |
| `admin-settings-notify` | Accepts a JSON notification payload; builds and sends an email via Resend (or a configurable `EMAIL_PROVIDER`). |

---

## Storage architecture

```
┌──────────────────────────────────────────────────────────┐
│  Client (browser)                                        │
│                                                          │
│  localStorage                     (primary data store)  │
│    inventoryItems                  InventoryItem[]       │
│    inventory-categories            ItemWithSubcategories[]│
│    inventory-units                                       │
│    inventory-locations                                   │
│    inventory-suppliers                                   │
│    inventory-projects                                    │
│    inventory-expense-codes                               │
│    inventory-templates             ItemTemplate[]        │
│    inventory-history               InventoryHistoryEntry[]│
│    inventory-financial-settings                          │
│    inventory-device-library        DeviceLibraryEntry[]  │
│    inventory-custom-report-definitions                   │
│    inventory-general-settings                            │
│    inventory-productions           Production[]         │
│    durable-system-audit-logs   ← NOT synced to cloud     │
│    checkout-recent-activities  ← NOT synced to cloud     │
│                                                          │
│  IndexedDB                        (restore points)       │
│    Up to 8 named full-payload snapshots                  │
│                                                          │
└─────────────────┬────────────────────────────────────────┘
                  │  bootstrapCloudData / requestCloudSync
                  ▼
┌──────────────────────────────────────────────────────────┐
│  Supabase                                                │
│                                                          │
│  user_app_data            (personal mode)                │
│    user_id · items · settings · templates · history      │
│    cabinets · financial · ui_defaults · general_settings │
│    custom_report_definitions                             │
│                                                          │
│  workspace_app_data       (team mode)                    │
│    workspace_id · same columns as user_app_data          │
│                                                          │
│  workspaces + workspace_members                          │
│    role: admin | editor | viewer                         │
│                                                          │
│  NOT synced: audit logs, checkout activity               │
└──────────────────────────────────────────────────────────┘
```

---

## Build targets

| Command | Output | Description |
|---|---|---|
| `npm run dev` | — | Vite local dev server with hot-reload |
| `npm run build` | `dist/` | Typecheck + production web bundle |
| `npm run build:web` | `dist/` | Static web bundle for Vercel / Netlify |
| `npm run preview:web` | — | Local preview of `dist/` |
| `npm run lint` | — | ESLint across `src/` |
| `npm run test` | — | Vitest unit tests |
| `npm run baselines:sync` | `baseline-reports/` | Snapshot current inventory |
| `npm run baselines:compare` | — | Diff against saved baseline |
| `npm run version:bump:patch` | — | Bump patch version in `package.json` |
| `npm run commit:patch` | — | Bump + stage + commit in one step |

---

## Naming conventions

| Convention | Pattern |
|---|---|
| Components | PascalCase `.tsx` in `src/components/` or `src/pages/` |
| Libraries / services | camelCase `.ts` in `src/lib/` |
| Storage keys | kebab-case, `inventory-` prefix — see `STORAGE_KEYS` in `storageService.ts` |
| Custom events | `trackit:` prefix — e.g. `trackit:settings-updated`, `trackit:custom-reports-updated` |
| Supabase tables | snake_case, domain-prefixed — `user_app_data`, `workspace_app_data`, `workspace_members` |
| Deprecated files | `.old` or `.v1` suffix in filename, or in `src/deprecated/` with `@deprecated` JSDoc |
