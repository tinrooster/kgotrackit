#!/usr/bin/env python3
"""
Plant module — Supabase upload script.

Reads the JSON files produced by normalize.py and upserts them into
Supabase via the REST API in this order:

    1. plant_locations
    2. plant_systems
    3. plant_drawings
    4. plant_cables  (chunked, with progress)

Usage:
    pip install httpx
    python upload.py \\
        --supabase-url  https://<project>.supabase.co \\
        --service-key   <service_role_key> \\
        --org-id        <organization_uuid>

Options:
    --dry-run     Print request counts but do not POST anything.
    --batch-size  Rows per POST request (default: 200).
    --only        Comma-separated subset: locations,systems,drawings,cables
"""

import argparse
import json
import sys
import time
from pathlib import Path

OUT_DIR = Path(__file__).parent / 'out'


def post_batch(
    client,
    url: str,
    table: str,
    rows: list[dict],
    dry_run: bool,
) -> None:
    if dry_run:
        print(f'  [dry-run] would POST {len(rows)} rows to {table}')
        return

    endpoint = f'{url}/rest/v1/{table}'
    resp = client.post(
        endpoint,
        json=rows,
        headers={'Prefer': 'resolution=merge-duplicates,return=minimal'},
    )
    if resp.status_code not in (200, 201):
        print(f'  ERROR {resp.status_code}: {resp.text[:300]}')
        sys.exit(1)


def upload_table(
    client,
    base_url: str,
    table: str,
    rows: list[dict],
    batch_size: int,
    dry_run: bool,
    label: str | None = None,
) -> None:
    label = label or table
    total = len(rows)
    print(f'\nUploading {total:,} {label} rows (batch size {batch_size}) …')

    for start in range(0, total, batch_size):
        batch = rows[start:start + batch_size]
        post_batch(client, base_url, table, batch, dry_run)
        done = min(start + batch_size, total)
        pct = done / total * 100
        print(f'  {done:>6,} / {total:,}  ({pct:.0f}%)', end='\r')
        if not dry_run:
            time.sleep(0.05)   # gentle rate-limit headroom

    print(f'  {total:,} / {total:,}  (100%)   ')
    print(f'  OK {label} done.')


def main() -> None:
    parser = argparse.ArgumentParser(description='Upload normalised plant data to Supabase.')
    parser.add_argument('--supabase-url', required=True)
    parser.add_argument('--service-key',  required=True)
    parser.add_argument('--org-id',       required=True,
                        help='Must match the org-id used in normalize.py')
    parser.add_argument('--batch-size',   type=int, default=200)
    parser.add_argument('--dry-run',      action='store_true')
    parser.add_argument('--only',         default='',
                        help='Comma-separated: locations,systems,drawings,cables')
    args = parser.parse_args()

    try:
        import httpx
    except ImportError:
        sys.exit('httpx not installed.  Run: pip install httpx')

    base_url = args.supabase_url.rstrip('/')
    only = set(args.only.split(',')) if args.only else None

    headers = {
        'apikey':        args.service_key,
        'Authorization': f'Bearer {args.service_key}',
        'Content-Type':  'application/json',
    }

    client = httpx.Client(headers=headers, timeout=30)

    def should_run(step: str) -> bool:
        return only is None or step in only

    org_id = args.org_id

    def remap(rows: list[dict]) -> list[dict]:
        """Stamp every row with the target org_id, overriding whatever normalize.py baked in."""
        for r in rows:
            r['organization_id'] = org_id
        return rows

    # 1. Locations
    if should_run('locations'):
        loc_path = OUT_DIR / 'plant_locations.json'
        if not loc_path.exists():
            print(f'WARNING: {loc_path} not found — skipping locations.')
        else:
            rows = remap(json.loads(loc_path.read_text(encoding='utf-8')))
            upload_table(client, base_url, 'plant_locations', rows,
                         args.batch_size, args.dry_run, 'locations')

    # 2. Systems
    if should_run('systems'):
        sys_path = OUT_DIR / 'plant_systems.json'
        if not sys_path.exists():
            print(f'WARNING: {sys_path} not found — skipping systems.')
        else:
            rows = remap(json.loads(sys_path.read_text(encoding='utf-8')))
            upload_table(client, base_url, 'plant_systems', rows,
                         args.batch_size, args.dry_run, 'systems')

    # 3. Drawings (must come before cables due to FK)
    if should_run('drawings'):
        drw_path = OUT_DIR / 'plant_drawings.json'
        if not drw_path.exists():
            print(f'WARNING: {drw_path} not found — skipping drawings.')
        else:
            rows = remap(json.loads(drw_path.read_text(encoding='utf-8')))
            upload_table(client, base_url, 'plant_drawings', rows,
                         args.batch_size, args.dry_run, 'drawings')

    # 4. Cables (chunked files)
    if should_run('cables'):
        chunk_files = sorted(OUT_DIR.glob('plant_cables_*.json'))
        if not chunk_files:
            print('WARNING: no plant_cables_*.json files found — skipping cables.')
        else:
            all_cables: list[dict] = []
            for cf in chunk_files:
                all_cables.extend(json.loads(cf.read_text(encoding='utf-8')))
            upload_table(client, base_url, 'plant_cables', remap(all_cables),
                         args.batch_size, args.dry_run, 'cables')

    client.close()
    print('\nAll done.')


if __name__ == '__main__':
    main()
