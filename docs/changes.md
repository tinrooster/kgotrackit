# Changelog

All notable changes to this project are documented here. The format is loosely inspired by [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- **P3 — Workspaces & RBAC (Supabase)** — Migration [`supabase/migrations/20260506120000_workspace_shared_data.sql`](../supabase/migrations/20260506120000_workspace_shared_data.sql): `workspaces`, `workspace_members`, `workspace_app_data` with RLS. Client: [`src/lib/supabase/workspaceData.ts`](../src/lib/supabase/workspaceData.ts), [`WorkspaceContext`](../src/contexts/WorkspaceContext.tsx), bootstrap/push routing in [`cloudData.ts`](../src/lib/supabase/cloudData.ts). **Settings → Data management → Team workspace**: create team from current snapshot, switch personal vs team (reload). See [`docs/p3-workspaces-auth.md`](p3-workspaces-auth.md).
- **P3 — Inventory permissions** — [`useInventoryPermissions`](../src/hooks/useInventoryPermissions.ts): bulk delete only for **admin** users and **workspace admin** when a shared workspace is active; batch edit blocked for **viewer** (local or workspace). Wired in [`BatchOperations.tsx`](../src/components/BatchOperations.tsx).
- **P3 — Email magic link** — Supabase login: **Send sign-in link** (`signInWithOtp`) in [`LoginForm.tsx`](../src/components/LoginForm.tsx); fixed reset-dialog `watch` shadowing login `watch`.
- **P3 — `deviceLibraryId` on items** — Optional field on [`InventoryItem`](../src/types/inventory.ts); form + apply in [`deviceLibraryFormApply.ts`](../src/lib/deviceLibraryFormApply.ts), [`AdditionalInfoTab.tsx`](../src/components/AdditionalInfoTab.tsx), Add/Edit dialogs; detail line in [`ItemDetails.tsx`](../src/components/ItemDetails.tsx).
- **P3 — Mobile layout** — [`DashboardPage.tsx`](../src/pages/DashboardPage.tsx) pie + legend stacks on small screens; [`CheckoutPage.tsx`](../src/pages/CheckoutPage.tsx) tighter padding and heading scale.

- **Cable / fiber fields on inventory items** — Optional `cableColor`, `fiberMode` (SM / MM / N/A), `connectorType`, `cableLotNumber` on [`InventoryItem`](../src/types/inventory.ts); **Additional Info** tab in Add/Edit (`AdditionalInfoTab.tsx`, `AddItemForm.tsx`, `EditItemForm.tsx`); merge on save in `EditItemDialog.tsx`; template seeding in `AddItemDialog.tsx`; report column options and inventory search (`ReportsPage.tsx`, `InventoryPage.tsx`).
- **Nested project selection in forms** — Flattened parent/child project options for `BasicDetailsTab` plus value normalization helper [`src/lib/projectOptions.ts`](../src/lib/projectOptions.ts). Add/Edit/Template forms now resolve legacy stored project name/id values and persist path ids consistently where applicable.
- **Supplier read-only panel on item details** — `ItemDetails.tsx` now renders supplier info as a dedicated read-only card section (name + website open action + URL text), improving discoverability without adding edit-side effects.
- **Local restore points (IndexedDB)** — Settings → Backup & Restore: named ring buffer (max 8) of full-app JSON via [`src/lib/localRestorePoints.ts`](../src/lib/localRestorePoints.ts); create / list / delete / confirm restore with validation summary; system log lines on create, delete, and restore (`DataBackupTab.tsx`). See [`docs/production-roadmap.md`](production-roadmap.md) P1 backup item (MVP scope).
- **Production roadmap in repo** — [`docs/production-roadmap.md`](production-roadmap.md): versioned copy of the Cursor production plan (YAML todos + narrative); indexed from [`docs/README.md`](README.md).
- **Supabase: `custom_report_definitions` column** — `public.user_app_data.custom_report_definitions` (JSONB array, default `[]`). `collectLocalSnapshot` / `applySnapshotToLocal` in [`src/lib/supabase/cloudData.ts`](../src/lib/supabase/cloudData.ts) sync with localStorage key `inventory-custom-report-definitions`; [`src/lib/storageService.ts`](../src/lib/storageService.ts) defines `STORAGE_KEYS.CUSTOM_REPORT_DEFINITIONS` and `CUSTOM_REPORT_DEFINITIONS_UPDATED_EVENT`. Migration: [`supabase/migrations/20260505120000_user_app_data_custom_report_definitions.sql`](../supabase/migrations/20260505120000_user_app_data_custom_report_definitions.sql).
- **Reports page: discoverable custom save + cloud push** — **Define / save custom…** in the Report Runner row (scrolls to the define card); `requestCloudSync` when custom definitions change; cross-tab / post-pull refresh via `CUSTOM_REPORT_DEFINITIONS_UPDATED_EVENT` (`ReportsPage.tsx`).
- **Supabase CLI project root** — `supabase/config.toml` (for `npx supabase link` / `db push`); `.gitignore` includes `supabase/.temp/` so link state stays local.
- **Inventory: Quick add dialog** — Fast mobile-oriented flow (toolbar lightning / Quick add) with:
  - Sticky **Current** strip (location, category, unit, project) and **Go to** jumps (Name, Shortcuts, Details, Unit, Project).
  - **Name** block with optional voice input and **Last name** from the previous successful add.
  - **Shortcuts**: Same as last apply row; **Often used** location/category chips from local usage counts.
  - **Details** (collapsible): barcode scan or type, photo via live camera (`getUserMedia`) or file picker, quantity.
  - **Collapsible** sections: All locations, All categories, Unit, Project, Details — each with filter when expanded.
  - **Units with sub-sizes** (e.g. Spools): parent unit chips, then **Sizes** under a dashed separator; persists `unit` + `unitSubcategory` like the main item forms.
  - **Project**: None row, then projects under a dashed separator.
  - Session/local preferences: quick-add prefs, last snapshot (including optional last name and unit size), usage-based favorites.

### Changed

- **Destructive-action confirmations (roadmap)** — Full backup restore and settings snapshot restore open a confirm dialog after file pick (`DataBackupTab`). Removing a user from the local Users list requires confirmation (`UsersTab`).

- **UI labels and dialogs**
  - Reports page title: **Reports** (was “Production Reports”).
  - Top navigation: **Check-In/Out** for the `/checkout` route (was “Checkout”).
  - Create/Edit **Template** dialog: same window pattern as **Add Item** (top-anchored dialog, header band + single scroll body, tab panels use a minimum height so the window does not jump when switching sections).
- Help page: new **Quick add** section and inventory workflow cross-link.
- Documentation: this file, `help-menu.md`, `user-guide.md`, `README` files, and docs index aligned with the above.
- Documentation: `development-status.md`, `technical-documentation.md`, `logging.md`, `getting-started.md`, `repository-reference.md`, and docs index updated for Supabase profile sync (reports + system logs) and CLI layout.
- Documentation: `user-guide.md` (backup / confirm restore); `development-status.md` and this changelog aligned with destructive-action confirmations (`DataBackupTab`, `UsersTab`).

---

## Earlier releases

Prior work was not tracked in this file. See git history and [Development Status](development-status.md) for broader context.
