# trackIT v2 — Documentation

**Version:** 1.0.1 · **Last reviewed:** 2026-05-09

trackIT is a broadcast/AV inventory management system delivered as a **web app** (local Vite dev + static deploy targets such as Vercel/Netlify), with shared React/TypeScript source under `src/`.

---

## Documents

| File | Description |
|---|---|
| [project-structure.md](./project-structure.md) | Directory layout, routes, components, services, data model, Supabase schema, storage architecture |
| [roadmap.md](./roadmap.md) | Shipped work, active priorities, upcoming items, and deferred features |
| [supabase-auth-send-email-hook.md](./supabase-auth-send-email-hook.md) | Setup guide for Supabase Auth Send Email HTTP hook using Resend API |
| [planner-workspace-and-branding.md](./planner-workspace-and-branding.md) | Planner scheduling, call sheet options, exports, and organization branding workflow |
| [BUG_BACKLOG_AND_EDIT_PLANS.md](./BUG_BACKLOG_AND_EDIT_PLANS.md) | Bug backlog from product review: tiers, themes, dependencies, implementation phases |

Archived legacy docs are stored in `docs_old/`.

---

## Runtime modes

| Dimension | Options |
|---|---|
| **Platform** | Web (browser) |
| **Auth** | Supabase magic-link (`signInWithOtp`) · Local username/password (offline) |
| **Data** | Personal — `user_app_data` (per Supabase user) · Team — `workspace_app_data` (shared by workspace members) |
| **Storage** | `localStorage` (primary) → IndexedDB (restore points) |

---

## Key entry points

| File | Role |
|---|---|
| `src/main.tsx` | React DOM mount; defines `/login` route and wraps `App` |
| `src/App.tsx` | In-app routes (`/`, `/inventory`, `/checkout`, `/productions`, `/reports`, `/settings`, `/help`, `/about`); theme and condensed-view init. Legacy `/crew` redirects to `/productions`. |
| `index.html` | Vite HTML entry |

---

## Quick reference

```
npm run dev            # Vite dev server (hot-reload)
npm run build:web      # Static web bundle
npm run build          # Typecheck + production web build
npm run lint           # ESLint
npm run test           # Vitest
```

Supabase migrations live in `supabase/migrations/` and must be applied in filename order.  
Edge Functions are in `supabase/functions/` (Deno).

---

## Codebase notes

### Productions (planning)

- **Route:** `/productions` — card list, detail **slide-out** (`Sheet`), **Planning Workspace** draggable dialog (`DraggableDialogContent`). Crew directory for a show is edited on the production’s **Crew** tab or in the planner; there is **no separate top-nav “Crew” item** (`/crew` redirects to `/productions`).
- **New production:** **New Production** opens a short flow — start blank **or** clone from an existing show (pick source, then checklist/crew/schedule/copy options).
- **Date/time helpers:** Shared parsing and quarter-hour normalization for production flows live in `src/lib/dateTimeInputs.ts` (used by schedule calendar, crew shift rows, production date fields).
- **Dismiss behavior:** Production detail sheet and planner dialog **do not close on outside click**, so accidental overlay clicks don’t discard in-progress edits. Close explicitly (e.g. X or your own dismiss control).

### Other

- **Supabase Auth email flow:** Redirect URL validation issues were resolved by enforcing full-origin redirects (`https://...`) in Auth URL config and invite-link generation. The project now includes a `send-email` Auth hook function for custom email delivery via Resend API, but hosted Auth email quota/rate limits still apply on the current plan.
- **Unused pages:** Several files under `src/pages/` are not wired to any route (`Dashboard.tsx`, `Inventory.tsx`, `ItemDetail.tsx`, `ItemDetailsPage.tsx`, `NotFound.tsx`, `RestockPage.tsx`). See `project-structure.md` for the full list.
- **Workspace crew contacts (master DB):** `crewContactsService` persists shared contacts for **Add from master DB** inside production crew editing. `src/pages/CrewPage.tsx` is a standalone directory UI that is **not routed** today (historical `/crew` URL redirects to `/productions`).
- **Deprecated code:** `src/deprecated/` contains two archived files; do not import from this path.
- **Stale artefacts:** `InventoryTable.old.tsx`, `MobileQuickAddDialog.v1.tsx`, `DebugInfo.tsx`, `TestComponent.tsx`, `MinimalTest.tsx` are present in `src/components/` but not used in production flows.
- **Next.js remnants:** `src/app/` and `src/deprecated/settings/page.tsx` are leftover Next.js App Router experiments and are not loaded by the Vite build.
