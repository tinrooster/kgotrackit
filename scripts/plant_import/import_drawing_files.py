#!/usr/bin/env python3
"""
Plant module — drawing file path import script.

Reads the drawing directory Excel file (produced by the DWG folder scanner)
and updates dwg_file_path on matching plant_drawings records in Supabase.

Matching logic:
  1. Extract the leading number from the file name (e.g. "22100 PCR2 Video.dwg" → 22100)
  2. Match against plant_drawings.dwg_number (exact integer string match)
  3. Prefer the most-recently-written .dwg file when multiple files share the same number
  4. Only updates rows where dwg_file_path IS NULL or --overwrite is passed

Usage:
    pip install openpyxl httpx
    python import_drawing_files.py \\
        --excel "H:\\path\\to\\DrawingsDirListExtracted.xlsx" \\
        --supabase-url https://<ref>.supabase.co \\
        --service-key <service_role_key> \\
        --org-id <organization_uuid> \\
        [--dry-run] \\
        [--overwrite]     # replace existing dwg_file_path values
        [--range 22000-22999]  # only process drawings in this number range
"""

import argparse
import re
import sys
import time
from pathlib import Path


def extract_number(filename: str) -> int | None:
    """Extract leading integer from a drawing file name."""
    m = re.match(r'^(\d+)', filename.strip())
    if m:
        try:
            return int(m.group(1))
        except ValueError:
            return None
    return None


def fetch_existing_drawings(client, base_url: str, org_id: str) -> dict[str, dict]:
    """Returns dict keyed by dwg_number (string) → {id, dwg_number, dwg_file_path}."""
    url = (
        f"{base_url}/rest/v1/plant_drawings"
        f"?select=id,dwg_number,dwg_file_path"
        f"&organization_id=eq.{org_id}"
        f"&limit=5000"
    )
    resp = client.get(url)
    if resp.status_code != 200:
        sys.exit(f"ERROR fetching drawings: {resp.status_code} {resp.text[:200]}")
    return {r["dwg_number"]: r for r in resp.json()}


def load_file_map(excel_path: str, range_min: int | None, range_max: int | None) -> dict[int, str]:
    """
    Returns dict: drawing_number (int) → best UNC path (string).
    'Best' = most recent LastWriteTimeUtc among .dwg files for that number.
    """
    try:
        import openpyxl
    except ImportError:
        sys.exit("openpyxl not installed.  Run: pip install openpyxl")

    wb = openpyxl.load_workbook(excel_path, read_only=True, data_only=True)
    ws = wb["Files"]
    rows = ws.iter_rows(values_only=True)
    headers = [str(h).strip() if h is not None else f"F{i}" for i, h in enumerate(next(rows))]

    # Column indices
    try:
        fname_idx    = headers.index("FileName")
        path_idx     = headers.index("FullPath")
        date_idx     = headers.index("LastWriteTimeUtc")
    except ValueError as e:
        sys.exit(f"Expected column not found in Files sheet: {e}")

    # number → (date, path)
    best: dict[int, tuple[str, str]] = {}

    for raw_row in rows:
        fname = str(raw_row[fname_idx] or "").strip()
        fpath = str(raw_row[path_idx] or "").strip()
        date  = str(raw_row[date_idx] or "").strip()

        ext = fname.rsplit(".", 1)[-1].lower() if "." in fname else ""
        if ext != "dwg":
            continue

        num = extract_number(fname)
        if num is None:
            continue
        if range_min is not None and num < range_min:
            continue
        if range_max is not None and num > range_max:
            continue

        existing = best.get(num)
        if existing is None or date > existing[0]:
            best[num] = (date, fpath)

    wb.close()
    return {num: path for num, (_, path) in best.items()}


def main() -> None:
    parser = argparse.ArgumentParser(description="Import drawing file paths from directory scan Excel.")
    parser.add_argument("--excel",         required=True, help="Path to DrawingsDirListExtracted*.xlsx")
    parser.add_argument("--supabase-url",  required=True)
    parser.add_argument("--service-key",   required=True)
    parser.add_argument("--org-id",        required=True)
    parser.add_argument("--dry-run",       action="store_true", help="Show what would change, write nothing")
    parser.add_argument("--overwrite",     action="store_true", help="Replace existing dwg_file_path values")
    parser.add_argument("--range",         default="22000-22999",
                        help="Drawing number range to process, e.g. 22000-22999 (default). Use 0-99999 for all.")
    args = parser.parse_args()

    try:
        import httpx
    except ImportError:
        sys.exit("httpx not installed.  Run: pip install httpx")

    # Parse range
    range_min, range_max = None, None
    if args.range:
        parts = args.range.split("-")
        if len(parts) == 2:
            try:
                range_min, range_max = int(parts[0]), int(parts[1])
            except ValueError:
                sys.exit(f"Invalid --range value: {args.range}")

    base_url = args.supabase_url.rstrip("/")
    headers = {
        "apikey":        args.service_key,
        "Authorization": f"Bearer {args.service_key}",
        "Content-Type":  "application/json",
    }
    client = httpx.Client(headers=headers, timeout=30)

    print(f"Loading drawing file map from {args.excel} …")
    file_map = load_file_map(args.excel, range_min, range_max)
    print(f"  Found {len(file_map):,} drawing numbers with .dwg files")
    if range_min is not None:
        print(f"  Range filter: {range_min}–{range_max}")

    print("\nFetching existing drawings from Supabase …")
    drawings = fetch_existing_drawings(client, base_url, args.org_id)
    print(f"  {len(drawings):,} drawings in Supabase")

    # Match and build update list
    to_update: list[dict] = []
    matched = 0
    skipped_has_path = 0
    skipped_no_match = 0

    for num, unc_path in sorted(file_map.items()):
        dwg_str = str(num)
        if dwg_str not in drawings:
            skipped_no_match += 1
            continue
        row = drawings[dwg_str]
        existing_path = row.get("dwg_file_path")
        if existing_path and not args.overwrite:
            skipped_has_path += 1
            continue
        matched += 1
        to_update.append({"id": row["id"], "dwg_file_path": unc_path})

    print(f"\n--- Match summary ---")
    print(f"  Matched (will update): {matched:,}")
    print(f"  Skipped (no drawing record in Supabase): {skipped_no_match:,}")
    print(f"  Skipped (already has path, use --overwrite): {skipped_has_path:,}")

    if args.dry_run:
        print("\nDRY RUN — no changes written.")
        for u in to_update[:20]:
            drw = drawings[next(d for d in drawings if drawings[d]["id"] == u["id"])]
            print(f"  Would set dwg_file_path = {u['dwg_file_path'][:80]}")
        if len(to_update) > 20:
            print(f"  … and {len(to_update) - 20} more")
        return

    if not to_update:
        print("\nNothing to update.")
        return

    print(f"\nUpdating {matched:,} drawings …")
    table_url = f"{base_url}/rest/v1/plant_drawings"
    updated = 0
    for i, rec in enumerate(to_update):
        rec_id = rec["id"]
        resp = client.patch(
            f"{table_url}?id=eq.{rec_id}",
            json={"dwg_file_path": rec["dwg_file_path"], "updated_at": "now()"},
            headers={"Prefer": "return=minimal"},
        )
        if resp.status_code not in (200, 204):
            print(f"  PATCH ERROR {resp.status_code}: {resp.text[:200]}")
        else:
            updated += 1
        if i % 50 == 0:
            time.sleep(0.05)
        if i % 100 == 0:
            print(f"  {i:>4} / {matched}", end="\r")

    print(f"\n  {updated:,} / {matched:,} updated.")
    print("\nDone.")
    client.close()


if __name__ == "__main__":
    main()
