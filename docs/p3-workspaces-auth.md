# P3: Shared workspaces, RBAC, auth, device catalog reference

This document matches the **P3** slice in [`production-roadmap.md`](production-roadmap.md) (org, security, clients).

## 1. Database (Supabase)

Apply the migration (CLI or SQL editor):

- File: `supabase/migrations/20260506120000_workspace_shared_data.sql`
- Tables: `workspaces`, `workspace_members`, `workspace_app_data`
- Row-level security: members read workspace metadata and payload; **admin/editor** can upsert `workspace_app_data`; **viewer** is read-only at the database layer for updates (client also skips cloud push for viewers).

**Personal data** continues to use `user_app_data` (one row per `auth.users.id`) when no team workspace is selected.

## 2. Client behavior

- **Active workspace** is stored in `localStorage` under `trackit:active-workspace-id`. Clearing it returns the app to **personal** cloud sync on the next reload.
- **Bootstrap** (`bootstrapCloudData`): if an active workspace id is set and the user is still a member, load `workspace_app_data`; otherwise fall back to `user_app_data`.
- **Push** (`pushFullSnapshotToSupabase`): writes to `workspace_app_data` when a workspace is active and the member is **admin** or **editor**; viewers do not push.

## 3. UI

- **Settings → Data management** — **Team workspace** card: create a workspace from the current local snapshot, switch between **Personal data** and a listed workspace (full page reload after switch so all hooks rehydrate).
- **Inventory → Batch operations** — **Delete selected** requires account **admin** and, if a team workspace is active, **workspace admin**. **Batch edit** is disabled for **viewer** (profile or workspace role).

## 4. Adding a teammate (until invite UI exists)

In the Supabase SQL editor, after the owner has created a workspace (from the app) and you know `workspace_id` and the teammate’s `auth.users.id`:

```sql
insert into public.workspace_members (workspace_id, user_id, role)
values ('WORKSPACE_UUID_HERE', 'USER_UUID_HERE', 'editor');
-- or 'viewer'
```

The new user signs in, selects the workspace in Settings (or sets storage key), and reloads.

## 5. Email magic link

The login screen includes **Send sign-in link**, which calls `signInWithOtp`. In the Supabase project, add your site URL and redirect URLs under **Authentication → URL configuration**.

## 6. TOTP / MFA

There is no full in-app MFA enrollment wizard yet. Use the Supabase Dashboard (per-user MFA) and/or the JavaScript Auth client (`mfa.enroll`, `mfa.challenge`, etc.) after password login, per Supabase docs.

## 7. Device library reference on items

`InventoryItem.deviceLibraryId` stores the catalog row id when the user picks a row in **Additional Info → Device library**. Applying a row still fills manufacturer, model, supplier hints, etc.
