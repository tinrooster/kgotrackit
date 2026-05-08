# trackIT v2 — Roadmap

**Version:** 1.0.1 · **Last reviewed:** 2026-05-08

This document tracks what has shipped, what is actively in progress, and what is planned or deferred. Items are grouped by priority tier (P0-P3) and then by batch for near-term work.

---

## Shipped enhancements (Productions · 2026-05)

- **Navigator:** Productions is primary; **`/crew` redirects to `/productions`** — per-show crew is edited inside a production/planner only.
- **New production UX:** Prompt to start **blank** or **clone from an existing production** (select source, then granular copy options).
- **Planner boundaries:** Crew schedule calendar **date pickers constrained** to production start/end.
- **Crew UX:** Departments with **rename / delete toolbar icons**, reorder, collapse; typed **phone + email**; shared **`src/lib/dateTimeInputs.ts`** for date + quarter-hour time normalization across productions UI.
- **Overlay safety:** Production **slide-out** (`Sheet`) and **Planning Workspace** dialog **ignore outside-click dismissal** so in-progress drafts are not wiped by stray clicks.

---

## Shipped enhancements (Auth + Workspace users · 2026-05)

- **Invite redirect hardening:** `workspace-member-admin` now resolves invite redirects from `INVITE_REDIRECT_URL` -> `SITE_URL` -> request origin and passes `redirectTo` to `inviteUserByEmail`.
- **Auth Send Email hook:** Added `supabase/functions/send-email` with webhook-signature verification and Resend API delivery, plus setup guide (`docs/supabase-auth-send-email-hook.md`) and script support in `scripts/setup-supabase-invite.sh`.
- **Operational note:** hosted Auth email throughput is still constrained by project plan limits (`GOTRUE_RATE_LIMIT_EMAIL_SENT`), so generated-link admin testing remains the fallback when email quota is exhausted.

---

## Current release: v1.0.1 (2026-05-06)
old roadmap items removed
## Medium-term (P2 deferred / architectural)

These items are well-defined but require meaningful design or schema work before implementation.

### Cloud audit log persistence
- **Decision required:** (A) extend `user_app_data` / `workspace_app_data` with a bounded `audit_logs` JSONB column + pruning policy; or (B) dedicated `audit_events` table with RLS.
- Checkout recent activity (`checkout-recent-activities`) is currently localStorage-only; needs the same decision.
- System logs and checkout activity are already captured locally in `durable-system-audit-logs` - the gap is cross-device / cross-login persistence.

### Cloud restore points (`user_app_snapshots`)
- Current restore points live in IndexedDB (per-browser, not cross-device).
- Add a `user_app_snapshots` (and `workspace_app_snapshots`) table with capped versioned rows, RLS same as `user_app_data`.
- Restoring from cloud snapshot in team mode is an **overwrite** of the shared payload - document explicitly and add an admin-only guard.

### Image upload normalization
- `imageNormalization.ts` exists; integrate it fully into photo-upload paths so oversized photos are compressed client-side before storage.
- Enforce a maximum stored size per item to prevent localStorage quota exhaustion.

### Mobile layout polish
- Reduce nested-frame constraints that narrow content on phones; use full available width for inventory and form flows.
- Fix horizontal overflow from wide filter controls on larger screens (stack filter inputs into two rows when needed).
- Remove distracting white scrollbar artifacts in inventory/filter regions.

### Cable spool/lot usage ledger
- New `cableLotNumber` field is Phase 1 (shipped).
- Phase 2 (deferred): structured spool/lot entity with remaining-feet tracking and usage event history; dedicated UI for recording consumption.

---

## Long-term / deferred

These items require product decisions, significant scope, or external dependencies. No implementation timeline.

| Item | Notes |
|---|---|
| Full MFA enroll UI | Supabase TOTP/MFA can be configured in the Dashboard today; full in-app enroll wizard deferred. |
| Service-role admin API | Full `list/add/remove/role-change` for workspace users via service-role protected backend; partial implementation via Edge Function already present. |
| Secure cabinet activity cloud persistence | Cross-login / cross-device checkout history. Depends on audit log persistence decision. |
| Native mobile app | React Native or Capacitor wrapper; out of scope until web UX is stable. |
| Nested project hierarchy features | Beyond current parent/child selection: project-level filters, hierarchy tree view, reporting aggregation by project tree. |
| Supplier enrichment (web scraping) | Manual URL entry is shipped. Automated scraping is policy-sensitive and non-trivial; deferred indefinitely. |
| Fast user switching | Session-management UX for shared browser devices; trade-offs with magic-link model TBD. |
| Drag-and-drop rack layout visualizer | Interactive rack diagram for server room locations; depends on richer rack-slot metadata. |

---

## Data model answers (quick reference)

| Question | Answer |
|---|---|
| Where does user data live? | `user_app_data` (personal) or `workspace_app_data` (team) in Supabase, mirrored to `localStorage`. |
| Are logs synced to cloud? | No - `durable-system-audit-logs` and `checkout-recent-activities` are localStorage-only. |
| What does restore do in team mode? | **Overwrite** of the shared `workspace_app_data` payload from the restoring member's local snapshot. No per-field merge. |
| Is the printed QR the Supabase record id? | It encodes `item.assetId || item.recordId || item.id`. There is no separate `inventory` table - payload is JSONB in `user_app_data`. |
| How to manage Supabase users via API? | Via the `workspace-member-admin` Edge Function (service-role). Never use the anon key for admin operations from the browser. |
| How is role enforced? | `workspace_members.role` is checked server-side via RLS; client reads role from `WorkspaceContext.activeWorkspaceRole` and disables destructive UI for `viewer`. |
