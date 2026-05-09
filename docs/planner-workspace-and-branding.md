# Planner Workspace and Branding Guide

This guide documents the scheduling, call-sheet export, and organization-branding capabilities in TrackIT.

## Planner Workspace

Path: `Productions -> Planner Workspace`

- Planner tabs: `Checklist`, `Vehicle Packlists`, `Schedule`, `Crew`, `Overview`.
- Route context is preserved (selected production, tab, and schedule day) when navigating around the app.
- Schedule supports:
  - Day Board editing
  - Day lock + explicit lock override flow
  - Conflict detection (missing callouts, overlaps, out-of-range, and availability-window conflicts)
  - Day copy to another date
  - Shift template save and quick-apply by role
  - Simple vs Detailed view modes

## Schedule: Simple vs Detailed

- `Simple`: essential day operations with reduced UI density.
- `Detailed`: full controls including filters, exports, critical-role focus, and advanced status chips.

## Call Sheet Exports

Path: `Planner Workspace -> Schedule -> Preview`

Available outputs:

- Text call sheet (`.txt`)
- Printable HTML call sheet (`.html`)
- Day-board CSV (`.csv`)

Call Sheet Options panel supports:

- Include/exclude:
  - Notes
  - Resources
  - Warnings
- Template mode:
  - Simple
  - Detailed
  - Branded
- Scope:
  - Filtered entries only (uses current schedule filters)
- Custom headers:
  - Header title
  - Show name
  - Venue
  - Producer
- Logo upload for call-sheet branding override

Printable HTML preview is rendered live in-app and matches downloaded output.

## Organization Branding (Shared)

Path: `Settings -> Organization -> Overview -> Organization Branding`

Organization-level branding fields:

- App name
- Light-mode logo
- Dark-mode logo

Behavior:

- Branding is stored in organization shared data (`branding.appBranding`).
- Theme auto-switch selects light/dark logos automatically.
- Branding is applied in:
  - Global navigation header
  - Login form header
  - Branded call-sheet export (unless a call-sheet-specific logo override is set)

## Permissions

- Organization branding edits require `admin` or `editor` role on the active organization.
- Viewers can see branding but cannot persist changes.

