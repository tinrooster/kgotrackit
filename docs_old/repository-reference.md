# Repository Reference

## Top-Level Areas

- `src/`  
  Primary frontend and Electron renderer application code.

- `electron/`  
  Electron main/preload runtime integration.

- `docs/`  
  Project documentation and operational guides (see `docs/README.md`, including `logging.md`).

- `public/`  
  Static assets used by the renderer.

## Core Application Paths

- `src/pages/`  
  Route-level pages (Dashboard, Inventory, Check-In/Out → `CheckoutPage` `/checkout`, Reports, Settings, Help, About).

- `src/components/`  
  Shared UI and workflow components.

- `src/components/settings/`  
  Settings-specific components including System Logs.

- `src/contexts/`  
  Auth/session context and shared app state providers.

- `src/lib/`  
  Storage services, logging services, settings services, and helper modules.

- `src/types/`  
  Shared domain models.

## Operationally Important Files

- `src/lib/storageService.ts`  
  Inventory/settings storage read/write behavior and synchronization.

- `src/lib/logging.ts`  
  Durable logging system and log-type routing.

- `src/pages/InventoryPage.tsx`  
  Primary inventory CRUD, bulk actions, printing, and audit hooks.

- `src/pages/SettingsPage.tsx`  
  User-defined item management, user management, and settings controls.

- `src/pages/ReportsPage.tsx`  
  Report generation, preview, and export routines.

## Documentation Policy

- Treat `docs/README.md` as the authoritative index.
- Keep in-app Help and docs pages synchronized.
- Add workflow docs alongside major feature additions.
