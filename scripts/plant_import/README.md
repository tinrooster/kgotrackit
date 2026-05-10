# Plant Import Scripts

One-time migration from the KGO Access cable DB Excel export into Supabase.

## Prerequisites

```
pip install openpyxl httpx
```

## Step 1 — Normalise

```
python normalize.py \
  --excel "F:\KGO_Cablle Database\afcables_06102025.xlsx" \
  --org-id <supabase-organization-uuid>
```

Optional flags:
- `--limit 500` — process only the first 500 rows (quick test run)
- `--sheet 0`   — sheet index or name (default: first sheet)

Outputs to `./out/`:

| File | Contents |
|---|---|
| `plant_locations.json` | One row per unique location-code prefix |
| `plant_drawings.json` | One row per unique DWG number |
| `plant_systems.json` | Seed rows for known decommissioned systems (GV, Miranda…) |
| `plant_cables_0000.json` … | Cable rows in 1 000-row chunks |
| `import_summary.json` | Distribution counts for review |
| `unmatched_wire_types.csv` | Wire Type strings that fell through to `cable_family = 'other'` |

## Step 2 — Review before uploading

**Required review — plant_locations.json**

The script generates one location row per unique prefix code with a placeholder
`name` equal to the code itself. Before uploading, open this file and fill in
the human-readable `name` for each code, and confirm/correct the `room_type`.

Example — change:
```json
{ "code": "TK03", "name": "TK03", "room_type": "rack_room" }
```
to:
```json
{ "code": "TK03", "name": "Technical Rack K-03", "room_type": "rack_room" }
```

Also set `"status": "decommissioned"` for racks that are no longer in use
(e.g. `TRINIX`, `APEX` if those frames have been removed).

**Optional review — unmatched_wire_types.csv**

Any Wire Type string that didn't match a known cable family falls through to
`cable_family = "other"`. Review this file and either:
- Add new `FAMILY_RULES` entries to `normalize.py` and re-run, or
- Leave as `other` and correct in the UI after import.

## Step 3 — Upload (dry run first)

```
python upload.py \
  --supabase-url  https://<project-ref>.supabase.co \
  --service-key   <service_role_key> \
  --org-id        <organization-uuid> \
  --dry-run
```

Then for real:

```
python upload.py \
  --supabase-url  https://<project-ref>.supabase.co \
  --service-key   <service_role_key> \
  --org-id        <organization-uuid>
```

The upload order is: locations → systems → drawings → cables (FK dependency order).

To upload only one table (e.g. after correcting locations):

```
python upload.py ... --only locations
```

## Reconciling a newer export (subsequent runs)

When you get a fresh Access DB export, use `reconcile.py` instead of re-running
`normalize.py` + `upload.py`. It diffs the new export against what's already in
Supabase and only touches what changed.

```
# Dry run first — writes summary to out/reconcile_*.json, touches nothing in DB
python reconcile.py \
  --excel        "F:\\KGO_Cablle Database\\afcables_YYYYMMDD.xlsx" \
  --supabase-url https://fjfwxhgmgzxtipcarasl.supabase.co \
  --service-key  <service_role_key> \
  --org-id       5742657c-eaa3-4d0b-aa39-ed081c5e3545

# Review out/reconcile_summary.json, then apply:
python reconcile.py ... --apply
```

### What reconcile does

| Scenario | Action |
|---|---|
| In new export, not in Supabase | INSERT as `status: unknown` |
| In both, raw fields unchanged | Skip (no write) |
| In both, raw fields changed | UPDATE raw + normalised fields; **preserves status, verified_at, verified_by** |
| In Supabase, missing from new export | Sets `status: review` with a note — never deletes |

Cables that are already `decommissioned` or `archived` are skipped entirely
from the missing check — they're expected to be gone from the live export.

The match key is `legacy_id` (the Access `ID` integer). If Access ever
reassigns IDs (rare), the summary will show unexpected inserts — review
`reconcile_insert.json` before applying.

## After import

- All cable rows land with `status = 'unknown'` — nothing is visible as active until verified.
- The `plant_locations.json` codes become the location picker options in the Plant UI.
- The GV system seed rows in `plant_systems.json` are ready to use as campaign rules immediately.
- Run a test cleanup campaign with `--dry-run` mode in the UI to preview the GV decommission set before activating.
