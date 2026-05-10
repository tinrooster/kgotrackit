#!/usr/bin/env python3
"""
Plant module — reconciliation script.

Diffs a new Excel export against the existing Supabase plant_cables table
and produces three action sets:

    out/reconcile_insert.json   new cables not yet in Supabase
    out/reconcile_update.json   cables whose raw fields changed
    out/reconcile_missing.json  cables in Supabase absent from new export
    out/reconcile_summary.json  counts + sample diffs for review

Lifecycle fields (status, verified_at, verified_by) are NEVER overwritten
on update — only raw content and normalised classification columns change.

Usage:
    python reconcile.py \\
        --excel    "F:\\KGO_Cablle Database\\afcables_YYYYMMDD.xlsx" \\
        --supabase-url  https://<ref>.supabase.co \\
        --service-key   <service_role_key> \\
        --org-id        <organization_uuid>

    # Review the summary, then apply:
    python reconcile.py ... --apply
"""

import argparse
import json
import sys
import time
from collections import defaultdict
from pathlib import Path

# Re-use normalisation helpers from normalize.py (same directory)
sys.path.insert(0, str(Path(__file__).parent))
from normalize import (
    normalize_wire_type,
    infer_signal_type,
    parse_origin_dest,
    parse_length_ft,
    infer_drawing_signal_category,
    CABLE_CHUNK_SIZE,
)
import uuid as _uuid

OUT_DIR = Path(__file__).parent / "out"

# Fields that define whether a raw record has changed.
# If any of these differ between the export and Supabase, the cable is updated.
RAW_COMPARE_FIELDS = ("origin_raw", "dest_raw", "wire_type_raw", "length_raw", "notes")

# Fields the reconcile update writes (never touches lifecycle fields).
UPDATE_FIELDS = (
    "origin_raw", "origin_location_code", "origin_device", "origin_port",
    "dest_raw", "dest_location_code", "dest_device", "dest_port",
    "cable_family", "jacket_color", "wire_type_raw",
    "signal_type", "length_raw", "length_ft",
    "alt_dwg", "numc", "legacy_project_id",
    "drawing_id", "notes",
)


# ---------------------------------------------------------------------------
# Fetch existing Supabase records
# ---------------------------------------------------------------------------

def fetch_existing(client, base_url: str, org_id: str) -> dict[int, dict]:
    """
    Returns a dict keyed by legacy_id (int).
    Fetches all plant_cables for the org in pages of 1000.
    Only retrieves columns needed for diffing + update keys.
    """
    select_cols = (
        "id,legacy_id,cable_number,drawing_id,"
        "origin_raw,dest_raw,wire_type_raw,length_raw,notes,"
        "status,verified_at,verified_by"
    )
    url = (
        f"{base_url}/rest/v1/plant_cables"
        f"?select={select_cols}"
        f"&organization_id=eq.{org_id}"
        f"&order=legacy_id.asc"
    )

    existing: dict[int, dict] = {}
    offset = 0
    page_size = 1000

    print("Fetching existing cables from Supabase ...")
    while True:
        paged = url + f"&limit={page_size}&offset={offset}"
        resp = client.get(paged)
        if resp.status_code != 200:
            print(f"ERROR {resp.status_code}: {resp.text[:300]}")
            sys.exit(1)
        rows = resp.json()
        if not rows:
            break
        for r in rows:
            lid = r.get("legacy_id")
            if lid is not None:
                existing[int(lid)] = r
        print(f"  fetched {offset + len(rows):,} ...", end="\r")
        if len(rows) < page_size:
            break
        offset += page_size

    print(f"  {len(existing):,} existing records loaded.      ")
    return existing


def fetch_existing_drawings(client, base_url: str, org_id: str) -> dict[str, str]:
    """Returns dict of dwg_number -> drawing id for all org drawings."""
    url = (
        f"{base_url}/rest/v1/plant_drawings"
        f"?select=id,dwg_number"
        f"&organization_id=eq.{org_id}"
        f"&limit=2000"
    )
    resp = client.get(url)
    if resp.status_code != 200:
        sys.exit(f"ERROR fetching drawings: {resp.text[:200]}")
    return {r["dwg_number"]: r["id"] for r in resp.json()}


# ---------------------------------------------------------------------------
# Read and normalise the new Excel export
# ---------------------------------------------------------------------------

def read_excel(path: str, org_id: str, drawing_map: dict[str, str]) -> dict[int, dict]:
    """
    Returns a dict keyed by legacy_id (int) of normalised cable dicts.
    Mirrors the output of normalize.py's main loop.
    """
    try:
        import openpyxl
    except ImportError:
        sys.exit("openpyxl not installed.  Run: pip install openpyxl")

    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb.worksheets[0]
    rows = ws.iter_rows(values_only=True)
    headers = [str(h).strip() if h is not None else f"F{i}" for i, h in enumerate(next(rows))]

    def col(row_dict, *names):
        for n in names:
            v = row_dict.get(n)
            if v is not None and str(v).strip():
                return str(v).strip()
        return None

    new_records: dict[int, dict] = {}

    print(f"Reading {path} ...")
    for i, raw_row in enumerate(rows):
        if i % 5000 == 0 and i > 0:
            print(f"  {i:,} rows read ...", end="\r")

        row = dict(zip(headers, raw_row))
        legacy_id_raw = row.get("ID")
        if legacy_id_raw is None:
            continue
        try:
            legacy_id = int(legacy_id_raw)
        except (ValueError, TypeError):
            continue

        origin_raw = col(row, "ORIGIN") or ""
        dest_raw = col(row, "DEST") or ""
        if not origin_raw and not dest_raw:
            continue

        wire_type_raw = col(row, "Wire Type")
        cable_family, jacket_color = normalize_wire_type(wire_type_raw)

        dwg_number = col(row, "DWG")
        drawing_id = drawing_map.get(dwg_number) if dwg_number else None

        signal_type = infer_signal_type(cable_family, dwg_number, origin_raw, dest_raw)

        o_loc, o_dev, o_port = parse_origin_dest(origin_raw)
        d_loc, d_dev, d_port = parse_origin_dest(dest_raw)

        length_raw = col(row, "Length")

        new_records[legacy_id] = {
            "organization_id":      org_id,
            "legacy_id":            legacy_id,
            "cable_number":         col(row, "NUMBER"),
            "numc":                 col(row, "NUMC"),
            "legacy_project_id":    col(row, "Project ID"),
            "alt_dwg":              col(row, "Alternate Dwg"),
            "drawing_id":           drawing_id,
            "origin_raw":           origin_raw,
            "origin_location_code": o_loc,
            "origin_device":        o_dev,
            "origin_port":          o_port,
            "dest_raw":             dest_raw,
            "dest_location_code":   d_loc,
            "dest_device":          d_dev,
            "dest_port":            d_port,
            "cable_family":         cable_family,
            "jacket_color":         jacket_color,
            "wire_type_raw":        wire_type_raw,
            "signal_type":          signal_type,
            "length_raw":           length_raw,
            "length_ft":            parse_length_ft(length_raw),
            "status":               "unknown",
            "notes":                col(row, "Note"),
        }

    wb.close()
    print(f"  {len(new_records):,} records in new export.      ")
    return new_records


# ---------------------------------------------------------------------------
# Diff
# ---------------------------------------------------------------------------

def diff(
    existing: dict[int, dict],
    incoming: dict[int, dict],
) -> tuple[list[dict], list[dict], list[dict]]:
    """
    Returns (to_insert, to_update, missing).

    to_insert : in incoming, not in existing -> new cable row (full dict)
    to_update : in both, raw fields changed  -> {id, ...UPDATE_FIELDS}
    missing   : in existing, not in incoming -> {id, legacy_id, cable_number,
                                                   current_status}
    """
    to_insert: list[dict] = []
    to_update: list[dict] = []
    missing:   list[dict] = []

    existing_ids = set(existing.keys())
    incoming_ids = set(incoming.keys())

    # New cables
    for lid in sorted(incoming_ids - existing_ids):
        rec = incoming[lid].copy()
        rec["id"] = str(_uuid.uuid4())
        to_insert.append(rec)

    # Changed cables
    for lid in sorted(incoming_ids & existing_ids):
        ex = existing[lid]
        inc = incoming[lid]

        changed = any(
            (ex.get(f) or "").strip() != (inc.get(f) or "").strip()
            for f in RAW_COMPARE_FIELDS
        )
        if not changed:
            continue

        update = {"id": ex["id"]}
        for f in UPDATE_FIELDS:
            update[f] = inc.get(f)
        to_update.append(update)

    # Missing from new export
    for lid in sorted(existing_ids - incoming_ids):
        ex = existing[lid]
        # Only flag if not already in a terminal lifecycle state
        if ex.get("status") not in ("decommissioned", "archived"):
            missing.append({
                "id":             ex["id"],
                "legacy_id":      lid,
                "cable_number":   ex.get("cable_number"),
                "current_status": ex.get("status"),
            })

    return to_insert, to_update, missing


# ---------------------------------------------------------------------------
# Apply
# ---------------------------------------------------------------------------

def apply_changes(
    client,
    base_url: str,
    to_insert: list[dict],
    to_update: list[dict],
    missing:   list[dict],
    batch_size: int,
    dry_run: bool,
) -> None:
    table_url = f"{base_url}/rest/v1/plant_cables"

    # -- Inserts --
    if to_insert:
        print(f"\nInserting {len(to_insert):,} new cables ...")
        for start in range(0, len(to_insert), batch_size):
            batch = to_insert[start:start + batch_size]
            if not dry_run:
                resp = client.post(
                    table_url,
                    json=batch,
                    headers={"Prefer": "resolution=merge-duplicates,return=minimal"},
                )
                if resp.status_code not in (200, 201):
                    print(f"  INSERT ERROR {resp.status_code}: {resp.text[:300]}")
                    sys.exit(1)
                time.sleep(0.05)
            done = min(start + batch_size, len(to_insert))
            print(f"  {done:>6,} / {len(to_insert):,}", end="\r")
        print(f"  {len(to_insert):,} inserted.            ")

    # -- Updates (patch raw fields only, lifecycle preserved in DB) --
    if to_update:
        print(f"\nUpdating {len(to_update):,} changed cables ...")
        for i, rec in enumerate(to_update):
            rec_id = rec.pop("id")
            if not dry_run:
                resp = client.patch(
                    f"{table_url}?id=eq.{rec_id}",
                    json=rec,
                    headers={"Prefer": "return=minimal"},
                )
                if resp.status_code not in (200, 204):
                    print(f"  PATCH ERROR {resp.status_code}: {resp.text[:300]}")
                    sys.exit(1)
                if i % 50 == 0:
                    time.sleep(0.05)
            if i % 200 == 0:
                print(f"  {i:>6,} / {len(to_update):,}", end="\r")
        print(f"  {len(to_update):,} updated.             ")

    # -- Missing: set status=review, note the absence --
    if missing:
        print(f"\nFlagging {len(missing):,} missing cables as status=review ...")
        for i, rec in enumerate(missing):
            rec_id = rec["id"]
            payload = {
                "status": "review",
                "notes":  "Not found in latest Access DB export — verify or decommission.",
            }
            if not dry_run:
                resp = client.patch(
                    f"{table_url}?id=eq.{rec_id}",
                    json=payload,
                    headers={"Prefer": "return=minimal"},
                )
                if resp.status_code not in (200, 204):
                    print(f"  PATCH ERROR {resp.status_code}: {resp.text[:300]}")
                    sys.exit(1)
                if i % 50 == 0:
                    time.sleep(0.05)
            if i % 200 == 0:
                print(f"  {i:>6,} / {len(missing):,}", end="\r")
        print(f"  {len(missing):,} flagged.              ")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description="Reconcile new Access DB export with Supabase.")
    parser.add_argument("--excel",         required=True)
    parser.add_argument("--supabase-url",  required=True)
    parser.add_argument("--service-key",   required=True)
    parser.add_argument("--org-id",        required=True)
    parser.add_argument("--batch-size",    type=int, default=200)
    parser.add_argument("--apply",         action="store_true",
                        help="Apply changes. Without this flag the script is read-only.")
    args = parser.parse_args()

    try:
        import httpx
    except ImportError:
        sys.exit("httpx not installed.  Run: pip install httpx")

    dry_run = not args.apply
    if dry_run:
        print("DRY RUN — pass --apply to write changes.")

    base_url = args.supabase_url.rstrip("/")
    headers = {
        "apikey":        args.service_key,
        "Authorization": f"Bearer {args.service_key}",
        "Content-Type":  "application/json",
    }
    client = httpx.Client(headers=headers, timeout=60)

    OUT_DIR.mkdir(parents=True, exist_ok=True)

    # 1. Fetch existing data from Supabase
    existing  = fetch_existing(client, base_url, args.org_id)
    draw_map  = fetch_existing_drawings(client, base_url, args.org_id)

    # 2. Read and normalise the new export
    incoming = read_excel(args.excel, args.org_id, draw_map)

    # 3. Diff
    to_insert, to_update, missing = diff(existing, incoming)

    # 4. Write action files
    summary = {
        "existing_in_supabase": len(existing),
        "in_new_export":        len(incoming),
        "to_insert":            len(to_insert),
        "to_update":            len(to_update),
        "missing_from_export":  len(missing),
        "lifecycle_protected":  sum(
            1 for r in to_update
            # update rows don't carry status; missing ones that were skipped do
        ),
        "sample_updates": [
            {
                "id":         r.get("id", ""),
                "origin_raw": r.get("origin_raw", ""),
                "dest_raw":   r.get("dest_raw", ""),
            }
            for r in to_update[:10]
        ],
        "sample_missing": missing[:10],
    }

    (OUT_DIR / "reconcile_summary.json").write_text(
        json.dumps(summary, indent=2), encoding="utf-8"
    )
    (OUT_DIR / "reconcile_insert.json").write_text(
        json.dumps(to_insert, indent=2), encoding="utf-8"
    )
    (OUT_DIR / "reconcile_update.json").write_text(
        json.dumps(to_update, indent=2), encoding="utf-8"
    )
    (OUT_DIR / "reconcile_missing.json").write_text(
        json.dumps(missing, indent=2), encoding="utf-8"
    )

    print(f"\n--- Reconciliation summary ---")
    print(f"  Existing in Supabase : {len(existing):,}")
    print(f"  In new export        : {len(incoming):,}")
    print(f"  To insert (new)      : {len(to_insert):,}")
    print(f"  To update (changed)  : {len(to_update):,}  [lifecycle fields preserved]")
    print(f"  Missing from export  : {len(missing):,}  [will be flagged status=review]")

    if dry_run:
        print("\nReview out/reconcile_*.json then re-run with --apply to commit.")
    else:
        apply_changes(
            client, base_url,
            to_insert, to_update, missing,
            args.batch_size, dry_run=False,
        )
        print("\nReconciliation complete.")

    client.close()


if __name__ == "__main__":
    main()
