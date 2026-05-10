# Bug backlog and edit plans

**Version:** 1.0.3 · **Created:** 2026-05-09 · **Status pass:** 2026-05-09 (codebase review)  
**Purpose:** Track reported issues and planned fixes from product review. Prioritize by tier; implement in phases below.

---

## Status legend

| Symbol | Meaning |
|--------|---------|
| **✅** | Shipped or clearly implemented in the current codebase |
| **🔶** | Partially addressed (some UX/code exists; backlog note may still apply) |
| **☐** | Open — not verified / not implemented |

---

## Severity tiers

| Tier | Focus | Examples |
|------|--------|----------|
| **P0 — Data / trust** | Loss of real data, misleading destructive actions | Sample import deleting directory contacts; productions overwritten by demo; backup/restore must be clear |
| **P1 — Broken behavior** | Blocks workflows or wrong outcomes | Vendor/supplier lock-ups; sync crew position templates missing; Firefox cannot add; schedule drag moves multiple bars |
| **P2 — Safety net** | Prevents accidents | Confirms on sample import, workspace utilities, consistent delete confirmations |
| **P3 — UX / clarity** | Polish and hierarchy | Light-mode contrast (flags, poker); dashboard card separation; About copy; org vs workspace signaling (prefer compact UI + docs) |
| **P4 — Mobile / density** | Phone layouts | Inventory list + production schedule scroll/layout; checklist check-in/out layout |
| **P5 — Depth** | Power users | Planner undo; checklist double-click headers; audit in logs + UI |

---

## Theme 1 — Theme / visual contrast (light mode)

| Item | Notes | Edit plan | Status |
|------|--------|-----------|--------|
| Flags: low text contrast until hover | Default state hard to read | Audit badge/chip components + CSS variables for light theme; darker default label text | ☐ |
| Poker: button labels invisible | Same class of issue as flags | Align poker controls with semantic colors / foreground tokens | ☐ |
| Dashboard production cards | Cards blend into background | Slightly different card surface (fill/border) in light vs dark for separation | ☐ |

**Implementation sketch:** One pass on `globals.css` / Tailwind theme tokens; fix shared primitives so flags + poker + cards stay consistent.

---

## Theme 2 — Copy, About, hierarchy (minimal on-screen prose)

| Item | Notes | Edit plan | Status |
|------|--------|-----------|--------|
| About menu | Remove marketing phrasing (“tuned for…”) | Short factual bullets: scheduling, crew, vehicle management | 🔶 Factual “Version & Build Notes” block exists on About; page still mixes product notes with poker lab — trim/marketing pass TBD |
| Org vs workspace | Admin can add user to workspace but not org — expectations unclear | Document product rules in help/manual; UI: compact scope indicator (badge/section), not long copy | ✅ Help → Organization vs. workspace; `OrganizationWorkspaceScopeHint` on Settings → Users (Supabase card) and Workspaces tab + manage dialog |
| Master crew “add from contacts” | Grey-out + tiny Add; unclear where people land | Stronger selected state; obvious Add affordance; post-add feedback (e.g. highlight production pool / toast). Details belong in **product docs**, not long UI paragraphs | ☐ |

---

## Theme 3 — Contacts, imports, phones

| Item | Notes | Edit plan | Status |
|------|--------|-----------|--------|
| Org contacts — phone on edit | Validate / normalize | Shared validator (display + E.164 or project standard); optional server-side check | ☐ |
| Contact pages | Extra fields | Work phone / alt phone + storage + import mapping | ☐ |
| KGO phone list import | Only name copied | Reparse; extend column mapping; test against sample export | ☐ |
| Parse Excel / import dialogs | Close felt like accept | Explicit Cancel vs Import; optional “Continue to Master import” if two-step | ✅ Inventory `ImportDialog`: **Close without importing** vs **Import … rows** (distinct actions) |
| List cleanup | Too easy to hit | Not top-level; tuck under overflow / “Data tools” + confirm | ☐ |
| Sample data import on existing DB | Merge deleted directory contacts (reported) | **P0:** Reproduce, fix merge logic; **P2:** Strong “Are you sure?” with consequences stated | 🔶 Demo markers + workspace utilities confirms (`WorkspaceUtilitiesDialog`); merge/directory edge case **needs repro** |

---

## Theme 4 — Dashboard

| Item | Notes | Edit plan | Status |
|------|--------|-----------|--------|
| Status color bars | Should navigate | Click → production / checklist / packlist / crew as applicable (routes + stable IDs) | ✅ `ProductionFusedStripProgress` / `ProductionCard` `onSegmentClick` → planner with `pt` |

---

## Theme 5 — Destructive actions and workspace utilities

| Item | Notes | Edit plan | Status |
|------|--------|-----------|--------|
| Delete everywhere | Accidental loss | Shared confirm pattern (e.g. Radix `AlertDialog` wrapper) for destructive actions | 🔶 `AlertDialog` used widely (lists, crew, imports, etc.); optional single shared wrapper still TBD |
| Workspace utilities | Risky bulk ops | Confirm **all** utility actions | ✅ `WorkspaceUtilitiesDialog`: confirm dialogs for populate / strip / apply defaults |

---

## Theme 6 — Vendors / suppliers / Firefox

| Item | Notes | Edit plan | Status |
|------|--------|-----------|--------|
| Vendors “acting odd” | Lock-up, list truncation, cannot add | Single investigation track: repro → Network → errors swallowed vs state bugs | ☐ |
| Firefox: cannot add (crew/suppliers) | Similar class | Compare Chrome vs Firefox; cookies/session/strict mode; ensure failed API surfaces | ☐ |

---

## Theme 7 — Branding, logging, settings layout

| Item | Notes | Edit plan | Status |
|------|--------|-----------|--------|
| Org branding cleared / not persistent | Data path bug | Trace save/load (tenant key, persistence layer, RLS) | ☐ |
| Logs missing admin changes | Audit gap | Log user add/remove, DB/org edits; surface where admins expect | ☐ |
| Maintenance window cautions | Wrong placement | Move to **own tab** under Settings → Libraries | ☐ |

---

## Theme 8 — Sync

| Item | Notes | Edit plan | Status |
|------|--------|-----------|--------|
| Crew position templates | Not populating after sync | Verify sync payload, IDs, merge order; log apply step | ☐ |

---

## Theme 9 — Backups and demo data

| Item | Notes | Edit plan | Status |
|------|--------|-----------|--------|
| Productions overwritten with demo | Trust issue | Document and expose **restore from backup**; gate demo/sample flows with confirms (ties to P0 import) | 🔶 Backup/restore in Settings Data tab + demo confirms in workspace utilities; ongoing **trust/discoverability** copy |

---

## Theme 10 — Production planner / schedule

| Item | Notes | Edit plan | Status |
|------|--------|-----------|--------|
| Day board drag | Dragging one bar moves others | Debug drag scope (`@dnd-kit` / sortable): keys, grouping, shared transforms | ☐ |
| Undo | Requested for planner | Command stack or hook into existing undo if present (**P5**, after P1 drag fix) | ☐ |

---

## Theme 11 — Checklists / packlists / production lists

| Item | Notes | Edit plan | Status |
|------|--------|-----------|--------|
| Inventory vs task/position checklist | Unclear type | Distinction via icon/subtitle/tab — **short** labels only | ☐ |
| Section headers | Expand/collapse | **Double-click** to toggle | ✅ Checklist + vehicle packlist section headers (`onDoubleClick` toggles expand) |
| Production lists inline add | Always visible | Hide until user uses **+** on section header | ✅ `inlineAddOpenByGroup` pattern in `ChecklistEditor` |
| Expand/collapse all control | Was on second row under filters | Shared `ListExpandAllSwitch` (same `Switch` as Confirm deletes), same toolbar row as search + filters | ✅ |
| Confirm production list deletes | In-sheet / planner toggles | User preference in **Settings → General** (`confirmPlannerListDeletesByUser`); `usePlannerListDeleteConfirm` | ✅ |

---

## Theme 12 — Audit (checklists / packlists)

| Item | Notes | Edit plan | Status |
|------|--------|-----------|--------|
| Who / when for check-in/out | Compliance + clarity | Store actor + timestamp; show compact line in detail view; mirror in logs | ☐ |

---

## Theme 13 — Navigation and crew UI

| Item | Notes | Edit plan | Status |
|------|--------|-----------|--------|
| Breadcrumb + deep links | Planner tab + production sheet tab missing from trail / stale query | Planner: breadcrumb reads React Router `location.search` (+ `trackit:url-sync`). Production sheet: `/productions?productionId=&pt=`; crumbs show production + tab | ✅ |
| Crew kanban cards | One busy card wastes vertical space | Sort/preview cap / collapse long entries | ☐ |

---

## Theme 14 — Poker interaction

| Item | Notes | Edit plan | Status |
|------|--------|-----------|--------|
| Activation | Accidental triggers | **Double-click** hotspot to activate (single-click no-op or tooltip only) | ☐ |
| Light mode labels | See Theme 1 | | ☐ |

---

## Cross-cutting dependencies

- Phone fields + KGO import depend on **schema** and **merge** rules.
- Checklist audit depends on **events** (client and/or server).
- Prefer **compact metadata** (who/when) over long instructional copy for audit visibility.

---

## Implementation phases (recommended order)

1. **Stabilize data (P0):** Sample import merge + directory wipe fix; demo/sample confirms; backup/restore discoverability. — *🔶 confirms + backup UI; P0 merge needs repro*
2. **Fix broken flows (P1):** Vendors/suppliers + Firefox adds; sync templates; schedule multi-bar drag. — *☐*
3. **Safety (P2):** Delete confirms; workspace utility confirms. — *🔶 / ✅ see Theme 5 + list delete setting*
4. **Visual (P3):** Light-mode tokens (flags, poker, dashboard cards); About update. — *☐ / 🔶*
5. **Imports/contacts:** Phones, fields, KGO mapper, dialog semantics. — *🔶 import dialog semantics only*
6. **Planner UX:** Breadcrumbs; crew picker clarity; kanban density; planner undo when ready. — *✅ breadcrumbs + sheet URL; ☐ rest*
7. **Audit & logs:** Admin + checklist events. — *☐*
8. **Mobile pass:** Inventory + schedule; checklist check-in/out layout. — *☐*

---

## Tracking

Use GitHub Issues or project boards: copy rows from theme tables into issues tagged `P0`–`P5` and `theme:*`. Link PRs to this doc when closing clusters (e.g. “Theme 1 light mode”). **Update the Status column** when shipping work so the doc stays honest.
