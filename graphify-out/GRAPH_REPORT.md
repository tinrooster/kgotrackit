# Graph Report - trackIT_v2  (2026-05-02)

## Corpus Check
- 186 files · ~95,780 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 633 nodes · 649 edges · 34 communities detected
- Extraction: 87% EXTRACTED · 13% INFERRED · 0% AMBIGUOUS · INFERRED: 84 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_Community 31|Community 31]]
- [[_COMMUNITY_Community 32|Community 32]]
- [[_COMMUNITY_Community 36|Community 36]]
- [[_COMMUNITY_Community 41|Community 41]]
- [[_COMMUNITY_Community 44|Community 44]]
- [[_COMMUNITY_Community 90|Community 90]]

## God Nodes (most connected - your core abstractions)
1. `saveItems()` - 17 edges
2. `getItems()` - 14 edges
3. `Logger` - 13 edges
4. `SettingsService` - 10 edges
5. `ItemUpdateService` - 8 edges
6. `handleDuplicateItem()` - 8 edges
7. `FileLogger` - 8 edges
8. `getFinancialSettings()` - 7 edges
9. `recordInventorySnapshotBeforeChange()` - 7 edges
10. `handleSaveEdit()` - 7 edges

## Surprising Connections (you probably didn't know these)
- `handleAction()` --calls--> `saveItems()`  [INFERRED]
  src\pages\CheckoutPage.tsx → src\lib\storageService.ts
- `handleAddSubcategory()` --calls--> `onUpdate()`  [INFERRED]
  src\components\settings\ListManagement.tsx → src\components\BasicDetailsTab.tsx
- `handleDeleteConfirm()` --calls--> `onUpdate()`  [INFERRED]
  src\components\settings\ListManagement.tsx → src\components\BasicDetailsTab.tsx
- `handleBatchDelete()` --calls--> `saveItems()`  [INFERRED]
  src\components\BatchOperations.tsx → src\lib\storageService.ts
- `handleBatchEdit()` --calls--> `saveItems()`  [INFERRED]
  src\components\BatchOperations.tsx → src\lib\storageService.ts

## Communities

### Community 0 - "Community 0"
Cohesion: 0.06
Nodes (22): handleBatchDelete(), handleBatchEdit(), applyInventoryState(), canRedoInventory(), canUndoInventory(), cloneItems(), recordInventorySnapshotBeforeChange(), redoInventoryMutation() (+14 more)

### Community 1 - "Community 1"
Cohesion: 0.09
Nodes (25): reconcileInventoryGroup(), fixUnreconciledCategories(), fixUnreconciledForLookupPanel(), fixUnreconciledLocations(), fixUnreconciledProjects(), fixUnreconciledSuppliers(), fixUnreconciledUnits(), getItems() (+17 more)

### Community 2 - "Community 2"
Cohesion: 0.1
Nodes (17): getFinancialSettings(), normalizeEntries(), readKey(), saveFinancialSettings(), writeKey(), getTemplates(), saveSettings(), saveTemplates() (+9 more)

### Community 3 - "Community 3"
Cohesion: 0.11
Nodes (4): handleExport(), handleExportCurrentView(), handleExportCurrentView(), exportToExcel()

### Community 4 - "Community 4"
Cohesion: 0.16
Nodes (10): addLogEntry(), clearLogs(), getLogs(), getRecentLogs(), getStoredLogs(), logAction(), storeLogs(), fetchLogs() (+2 more)

### Community 5 - "Community 5"
Cohesion: 0.15
Nodes (9): onUpdate(), handleKeyDown(), handleSave(), handleAddSubcategory(), handleKeyDown(), handleSave(), handleSubcategoryKeyDown(), handleAddSubcategory() (+1 more)

### Community 6 - "Community 6"
Cohesion: 0.21
Nodes (10): advanceStreet(), buildDeck(), compareScores(), dealHand(), evaluateFiveCards(), getBestHand(), getStreetBaseBet(), handleRaise() (+2 more)

### Community 7 - "Community 7"
Cohesion: 0.2
Nodes (9): applyAutoStorageId(), buildPrefixFromLocation(), generateQRCode(), generateStorageId(), handleDeleteCabinet(), handleSaveCabinet(), loadCabinets(), refreshCabinets() (+1 more)

### Community 8 - "Community 8"
Cohesion: 0.18
Nodes (4): bumpUsage(), loadLast(), loadUsage(), MobileQuickAddDialog()

### Community 9 - "Community 9"
Cohesion: 0.27
Nodes (11): AddItemForm(), allocateAssetTags(), allocateRecordId(), buildAssetTagString(), coerceDateInServiceForTag(), formatTagDateYYMMDD(), formatTagSeq(), parseDateForTag() (+3 more)

### Community 10 - "Community 10"
Cohesion: 0.23
Nodes (1): Logger

### Community 11 - "Community 11"
Cohesion: 0.17
Nodes (5): LoginPage(), UserMenu(), useAuth(), useLocalStorage(), ItemDetailsPage()

### Community 12 - "Community 12"
Cohesion: 0.27
Nodes (1): SettingsService

### Community 13 - "Community 13"
Cohesion: 0.22
Nodes (1): ItemUpdateService

### Community 14 - "Community 14"
Cohesion: 0.31
Nodes (4): exportSelectedReportExcel(), generateCSV(), runSelectedReport(), toReportRows()

### Community 15 - "Community 15"
Cohesion: 0.31
Nodes (1): FileLogger

### Community 16 - "Community 16"
Cohesion: 0.36
Nodes (4): handleAddItem(), handleCancel(), handleKeyDown(), handleSave()

### Community 17 - "Community 17"
Cohesion: 0.32
Nodes (3): handleCancel(), handleKeyDown(), handleSave()

### Community 18 - "Community 18"
Cohesion: 0.36
Nodes (5): onChange(), onClick(), addEntry(), confirmDelete(), updateEntry()

### Community 19 - "Community 19"
Cohesion: 0.29
Nodes (3): handleAction(), handleSettingsUpdated(), loadData()

### Community 20 - "Community 20"
Cohesion: 0.48
Nodes (6): handleFieldMappingChange(), handleFileChange(), handleImportClick(), parseFile(), resetState(), validateData()

### Community 21 - "Community 21"
Cohesion: 0.33
Nodes (2): formatReconcileReport(), handleRunGroupReconcile()

### Community 22 - "Community 22"
Cohesion: 0.48
Nodes (5): addToRemoveQueue(), dispatch(), genId(), reducer(), toast()

### Community 24 - "Community 24"
Cohesion: 0.33
Nodes (3): handleInvalid(), collectRootFieldNames(), getFirstTabWithErrors()

### Community 25 - "Community 25"
Cohesion: 0.43
Nodes (5): accentColorForLocation(), accentColorForProject(), hashHue(), walkProjects(), resolveLocationDisplay()

### Community 27 - "Community 27"
Cohesion: 0.47
Nodes (3): handleDelete(), loadCabinets(), onSubmit()

### Community 29 - "Community 29"
Cohesion: 0.53
Nodes (4): dispatch(), genId(), reducer(), toast()

### Community 30 - "Community 30"
Cohesion: 0.5
Nodes (2): getFieldSuggestions(), getUniqueValues()

### Community 31 - "Community 31"
Cohesion: 0.4
Nodes (1): ErrorBoundary

### Community 32 - "Community 32"
Cohesion: 0.6
Nodes (4): getRackOptionsForFlatLocationLabel(), lastSegmentLower(), parseFile(), refreshRackLocationsFromServer()

### Community 36 - "Community 36"
Cohesion: 0.83
Nodes (3): handleCheckIn(), handleCheckOut(), handleSubmit()

### Community 41 - "Community 41"
Cohesion: 0.67
Nodes (2): getCategoryColor(), getResolvedLabel()

### Community 44 - "Community 44"
Cohesion: 1.0
Nodes (2): Get-Inventory(), Test-ExcludedFile()

### Community 90 - "Community 90"
Cohesion: 1.0
Nodes (1): Html5QrcodeScanner

## Knowledge Gaps
- **1 isolated node(s):** `Html5QrcodeScanner`
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 10`** (13 nodes): `Logger`, `.clearLogs()`, `.constructor()`, `.debug()`, `.error()`, `.getInstance()`, `.getLogs()`, `.getSettings()`, `.info()`, `.log()`, `.persistLogs()`, `.updateSettings()`, `.warn()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 12`** (11 nodes): `SettingsService`, `.deleteCabinet()`, `.getCabinets()`, `.getCabinetsByLocation()`, `.getCabinetWithItems()`, `.getDefaultSettings()`, `.loadDefaultSettings()`, `.replaceAllCabinets()`, `.saveCabinet()`, `.saveDefaultSettings()`, `settingsService.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 13`** (9 nodes): `ItemUpdateService`, `.generateCabinetQRCode()`, `.handleCabinetUpdate()`, `.handleCategoryUpdate()`, `.handleLocationUpdate()`, `.handleSupplierUpdate()`, `.handleUnitUpdate()`, `.validateCabinetAssignment()`, `itemUpdateService.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 15`** (9 nodes): `logger.ts`, `FileLogger`, `.constructor()`, `.downloadLogs()`, `.error()`, `.info()`, `.log()`, `.setContext()`, `.warn()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 21`** (7 nodes): `formatReconcileReport()`, `handleExcelFileChange()`, `handleJsonFileChange()`, `handleRestore()`, `handleRunGroupReconcile()`, `handleSettingsSnapshotFile()`, `DataBackupTab.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 30`** (5 nodes): `getFieldSuggestions()`, `getSubcategoriesForCategory()`, `getUniqueValues()`, `onSubmit()`, `EditItemForm.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 31`** (5 nodes): `ErrorBoundary`, `.componentDidCatch()`, `.getDerivedStateFromError()`, `.render()`, `ErrorBoundary.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 41`** (4 nodes): `getCategoryColor()`, `getResolvedLabel()`, `if()`, `CellValue.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 44`** (3 nodes): `Get-Inventory()`, `Test-ExcludedFile()`, `Compare-ToBaseline.ps1`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 90`** (2 nodes): `html5-qrcode.d.ts`, `Html5QrcodeScanner`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `saveItems()` connect `Community 1` to `Community 0`, `Community 9`, `Community 2`, `Community 19`?**
  _High betweenness centrality (0.024) - this node is a cross-community bridge._
- **Why does `handleDuplicateItem()` connect `Community 9` to `Community 0`, `Community 1`?**
  _High betweenness centrality (0.011) - this node is a cross-community bridge._
- **Why does `getItems()` connect `Community 1` to `Community 2`, `Community 19`?**
  _High betweenness centrality (0.007) - this node is a cross-community bridge._
- **Are the 16 inferred relationships involving `saveItems()` (e.g. with `handleBatchDelete()` and `handleBatchEdit()`) actually correct?**
  _`saveItems()` has 16 INFERRED edges - model-reasoned connections that need verification._
- **Are the 13 inferred relationships involving `getItems()` (e.g. with `fixUnreconciledCategories()` and `fixUnreconciledSuppliers()`) actually correct?**
  _`getItems()` has 13 INFERRED edges - model-reasoned connections that need verification._
- **What connects `Html5QrcodeScanner` to the rest of the system?**
  _1 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.06 - nodes in this community are weakly interconnected._