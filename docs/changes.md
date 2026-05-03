# Changelog

All notable changes to this project are documented here. The format is loosely inspired by [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

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

- **UI labels and dialogs**
  - Reports page title: **Reports** (was “Production Reports”).
  - Top navigation: **Check-In/Out** for the `/checkout` route (was “Checkout”).
  - Create/Edit **Template** dialog: same window pattern as **Add Item** (top-anchored dialog, header band + single scroll body, tab panels use a minimum height so the window does not jump when switching sections).
- Help page: new **Quick add** section and inventory workflow cross-link.
- Documentation: this file, `help-menu.md`, `user-guide.md`, `README` files, and docs index aligned with the above.

---

## Earlier releases

Prior work was not tracked in this file. See git history and [Development Status](development-status.md) for broader context.
