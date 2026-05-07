# trackIT v2 — Documentation

**Version:** 1.0.1 · **Last reviewed:** 2026-05-06

trackIT is a broadcast/AV inventory management system delivered as a **web app** (local Vite dev + static deploy targets such as Vercel/Netlify), with shared React/TypeScript source under `src/`.

---

## Documents

| File | Description |
|---|---|
| [project-structure.md](./project-structure.md) | Directory layout, routes, components, services, data model, Supabase schema, storage architecture |
| [roadmap.md](./roadmap.md) | Shipped work, active priorities, upcoming items, and deferred features |

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
| `src/App.tsx` | In-app routes (`/`, `/inventory`, `/checkout`, `/reports`, `/settings`, `/help`, `/about`); theme and condensed-view init |
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

- **Unused pages:** Several files under `src/pages/` are not wired to any route (`Dashboard.tsx`, `Inventory.tsx`, `ItemDetail.tsx`, `ItemDetailsPage.tsx`, `NotFound.tsx`, `RestockPage.tsx`). See `project-structure.md` for the full list.
- **Deprecated code:** `src/deprecated/` contains two archived files; do not import from this path.
- **Stale artefacts:** `InventoryTable.old.tsx`, `MobileQuickAddDialog.v1.tsx`, `DebugInfo.tsx`, `TestComponent.tsx`, `MinimalTest.tsx` are present in `src/components/` but not used in production flows.
- **Next.js remnants:** `src/app/` and `src/deprecated/settings/page.tsx` are leftover Next.js App Router experiments and are not loaded by the Vite build.
