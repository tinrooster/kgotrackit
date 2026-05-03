# Changelog

All notable changes to this project are documented here. The format is loosely inspired by [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- **Supabase profile sync: custom reports and system logs** — `public.user_app_data` gains `custom_report_definitions` and `system_logs` (JSON arrays, capped in app). `src/lib/supabase/cloudData.ts` includes them in snapshot upserts and applies them on pull (localStorage + Electron store for logs; `trackit:custom-reports-updated` / `trackit:logs-updated` events). Migration: `supabase/migrations/20260505120000_user_app_data_reports_system_logs.sql`.
- **Debounced cloud push for system logs** — `src/lib/logging.ts` schedules a 10s debounced sync after durable audit and in-memory log persistence so logging does not spam the network.
- **Reports page cloud UX** — `CUSTOM_REPORTS_STORAGE_KEY` from `cloudData`, `requestCloudSync` after custom report changes, listener for `trackit:custom-reports-updated`, persisted “define custom report” section open state, and **Define / save custom…** in the report runner toolbar (`ReportsPage.tsx`).
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
