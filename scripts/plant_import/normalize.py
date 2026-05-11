#!/usr/bin/env python3
"""
Plant module — cable database import and normalisation script.

Reads the KGO cable Access DB Excel export and produces four JSON files
ready for Supabase upsert:

    out/plant_locations.json   — one row per unique location-code prefix
    out/plant_drawings.json    — one row per unique DWG number
    out/plant_systems.json     — seed rows for known decommissioned systems
    out/plant_cables.json      — all cable records (batched into chunks)

Usage:
    pip install openpyxl
    python normalize.py --excel "F:\\KGO_Cablle Database\\afcables_06102025.xlsx" \\
                        --org-id <supabase-organization-uuid>

After reviewing the JSON output, run upload.py to POST to Supabase.

Output files are written to ./out/ relative to this script.
"""

import argparse
import csv
import json
import os
import re
import sys
import uuid
from collections import defaultdict
from pathlib import Path

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

CABLE_CHUNK_SIZE = 1000   # rows per output JSON chunk (keeps files manageable)
OUT_DIR = Path(__file__).parent / "out"

# ---------------------------------------------------------------------------
# Wire Type → (cable_family, jacket_color)
#
# Rules are checked in order; first match wins.
# Each rule is (compiled_regex, cable_family).
# Color is extracted separately by COLOUR_PATTERNS.
# ---------------------------------------------------------------------------

FAMILY_RULES: list[tuple[re.Pattern, str]] = [
    # ---- Belden coax families ----
    (re.compile(r'1855A?', re.I),   'belden_1855'),   # catch 1855A first
    (re.compile(r'1505A?', re.I),   'belden_1505'),
    (re.compile(r'1694A?', re.I),   'belden_1694'),
    (re.compile(r'9451',   re.I),   'belden_9451'),
    (re.compile(r'1504A?', re.I),   'belden_1504a'),
    (re.compile(r'1800',   re.I),   'belden_1800'),
    (re.compile(r'9451',   re.I),   'belden_9451'),   # 9451 twin etc.
    (re.compile(r'8723',   re.I),   'belden_9451'),   # similar analog coax
    (re.compile(r'1800[A-F]',re.I), 'belden_1800'),
    (re.compile(r'1700A?', re.I),   'belden_1800'),   # 1700-series (similar)
    (re.compile(r'9116',   re.I),   'rg6'),
    (re.compile(r'9451',   re.I),   'belden_9451'),
    # ---- Ethernet ----
    (re.compile(r'CAT\s*6',  re.I), 'cat6'),
    (re.compile(r'CAT\s*5E', re.I), 'cat5e'),
    (re.compile(r'CAT\s*5',  re.I), 'cat5'),
    (re.compile(r'ETHERNET', re.I), 'cat5e'),
    (re.compile(r'NETWORK',  re.I), 'cat5e'),
    (re.compile(r'LAN\b',    re.I), 'cat5e'),
    # ---- Fiber ----
    (re.compile(r'SM\s*FIBER|SINGLEMODE|SMF|SM\s+LC', re.I), 'fiber_sm'),
    (re.compile(r'MM\s*FIBER|MULTIMODE|MMF|MM\s+LC',  re.I), 'fiber_mm'),
    (re.compile(r'FIBER|FIBRE|LC[/\s]LC|LC[/\s]DPX|SC\s+FIBER', re.I), 'fiber_mm'),
    # ---- RF ----
    (re.compile(r'LMR.?400', re.I), 'lmr400'),
    (re.compile(r'HELIAX',   re.I), 'lmr400'),
    (re.compile(r'RG.?6',    re.I), 'rg6'),
    (re.compile(r'RG.?59',   re.I), 'rg6'),
    (re.compile(r'THINNET',  re.I), 'rg6'),
    (re.compile(r'\bRF\b',   re.I), 'rg6'),
    # ---- Camera triax ----
    (re.compile(r'TRIAX',    re.I), 'triax'),
    # ---- Serial / control ----
    (re.compile(r'RS.?422',  re.I), 'rs422'),
    (re.compile(r'RS.?232',  re.I), 'rs232'),
    (re.compile(r'SERIAL',   re.I), 'rs422'),
    # ---- Display ----
    (re.compile(r'\bHDMI\b', re.I), 'hdmi'),
    (re.compile(r'\bDVI\b',  re.I), 'dvi'),
    (re.compile(r'\bVGA\b',  re.I), 'vga'),
    # ---- Computer peripherals ----
    (re.compile(r'\bUSB\b',  re.I), 'usb'),
    (re.compile(r'\bKVM\b',  re.I), 'kvm'),
    # ---- Telephone / flat satin ----
    (re.compile(r'SATIN|FLAT\s*PHONE|PHONE|TELCO|RJ', re.I), 'phone'),
    (re.compile(r'TEL\b',    re.I), 'phone'),
]

# Distinguishes 1855 vs 1855A (plenum) — applied after the base family match
PLENUM_PATTERN = re.compile(r'1855\s*A|1505\s*A|1694\s*A', re.I)

COLOUR_PATTERNS: list[tuple[re.Pattern, str]] = [
    (re.compile(r'\bBLU\b|\bBLUE\b',        re.I), 'blue'),
    (re.compile(r'\bYEL\b|\bYELLO?W\b|YLW', re.I), 'yellow'),
    (re.compile(r'\bBLK\b|\bBLACK\b',       re.I), 'black'),
    (re.compile(r'\bGR[EY]{1,2}N?\b|GRN\b', re.I), 'green'),
    (re.compile(r'\bGR[AE]Y\b|\bGRY\b',     re.I), 'gray'),
    (re.compile(r'\bORN\b|\bORAN?GE?\b|ORG\b', re.I), 'orange'),
    (re.compile(r'\bRED\b',                  re.I), 'red'),
    (re.compile(r'\bPURP\b|\bPURPLE\b|PRP\b', re.I), 'purple'),
    (re.compile(r'\bBROWN\b',                re.I), 'brown'),
    (re.compile(r'\bWHIT?E?\b|\bWHT\b',     re.I), 'white'),
    (re.compile(r'\bAQUA\b',                 re.I), 'aqua'),
    (re.compile(r'\bVIOLET\b',               re.I), 'violet'),
    (re.compile(r'\bNAT\b|\bNATURAL\b|BEIGE', re.I), 'natural'),
]

# signal_type inferred from cable_family
FAMILY_TO_SIGNAL: dict[str, str] = {
    'belden_1855':  'hd_sdi',
    'belden_1855a': 'hd_sdi',
    'belden_1694':  'hd_sdi',
    'belden_1694a': 'hd_sdi',
    'belden_1505':  'sdi',
    'belden_1505a': 'sdi',
    'belden_9451':  'analog_video',
    'belden_1504a': 'audio_analog',
    'belden_1800':  'audio_analog',
    'cat5':         'data_ethernet',
    'cat5e':        'data_ethernet',
    'cat6':         'data_ethernet',
    'fiber_mm':     'fiber',
    'fiber_sm':     'fiber',
    'rg6':          'rf',
    'lmr400':       'rf',
    'triax':        'hd_sdi',
    'rs422':        'control_serial',
    'rs232':        'control_serial',
    'hdmi':         'display',
    'dvi':          'display',
    'vga':          'display',
    'usb':          'other',
    'kvm':          'other',
    'phone':        'other',
    'other':        'other',
    'unknown':      'other',
}

# DWG suffix overrides for signal_type
DWG_SUFFIX_TO_SIGNAL: dict[str, str] = {
    'VID': 'hd_sdi',
    'AUD': 'audio_analog',
    'CTL': 'control_serial',
    'RF':  'rf',
}

# Port-label keywords that suggest the remaining tokens are a port descriptor.
# Used to split "DEVICE PORT-DESCRIPTION" in ORIGIN/DEST strings.
PORT_START_WORDS = frozenset([
    'INPUT', 'OUTPUT', 'IN', 'OUT', 'AUD', 'VID', 'SDI',
    'ANALOG', 'DIGITAL', 'LOOP', 'MON', 'PGM', 'PRI', 'BUP',
    'CH', 'CHAN', 'PORT', 'LINE', 'MIC', 'SIG', 'BAL', 'UNB',
])

# Length extraction — capture first number (integer or decimal)
LENGTH_RE = re.compile(r'(\d+(?:\.\d+)?)')


# ---------------------------------------------------------------------------
# Normalisation helpers
# ---------------------------------------------------------------------------

def normalize_wire_type(raw: str | None) -> tuple[str, str | None]:
    """Return (cable_family, jacket_color) from a raw Wire Type string."""
    if not raw or not str(raw).strip():
        return 'unknown', None

    text = str(raw).strip()
    family = 'other'

    for pattern, fam in FAMILY_RULES:
        if pattern.search(text):
            family = fam
            # Upgrade to plenum variant if "A" suffix present
            if fam in ('belden_1855', 'belden_1505', 'belden_1694'):
                if PLENUM_PATTERN.search(text):
                    family = fam + 'a'
            break

    color = None
    for pattern, col in COLOUR_PATTERNS:
        if pattern.search(text):
            color = col
            break

    return family, color


def infer_signal_type(
    cable_family: str,
    dwg_number: str | None,
    origin_raw: str,
    dest_raw: str,
) -> str:
    # 1. DWG suffix override (most reliable)
    if dwg_number:
        dwg_upper = str(dwg_number).upper()
        for suffix, sig in DWG_SUFFIX_TO_SIGNAL.items():
            if dwg_upper.endswith(suffix):
                return sig

    # 2. Port-label keyword scan
    combined = f"{origin_raw} {dest_raw}".upper()
    if ' AUD' in combined or 'AUDIO' in combined:
        return 'audio_analog'
    if 'SDI' in combined or ' VID' in combined:
        # Prefer hd_sdi if 1855/1694 family
        if cable_family in ('belden_1855', 'belden_1855a',
                             'belden_1694', 'belden_1694a'):
            return 'hd_sdi'
        return 'sdi'

    # 3. Family lookup
    return FAMILY_TO_SIGNAL.get(cable_family, 'other')


def parse_origin_dest(raw: str | None) -> tuple[str | None, str | None, str | None]:
    """
    Return (location_code, device, port) from a raw ORIGIN or DEST string.

    Strategy:
      - First token  → location_code (most reliable)
      - Remaining tokens: scan right-to-left for the first port-boundary
        keyword; everything from that point onward is port, the rest is device.
      - If no boundary found: first 1-2 remaining tokens are device, rest is port.
    """
    if not raw or not str(raw).strip():
        return None, None, None

    tokens = str(raw).strip().split()
    if not tokens:
        return None, None, None

    location_code = tokens[0]
    if len(tokens) == 1:
        return location_code, None, None

    rest = tokens[1:]
    if len(rest) == 1:
        return location_code, rest[0], None

    # Scan right-to-left for port boundary
    boundary = None
    for i in range(len(rest) - 1, 0, -1):
        if rest[i].upper() in PORT_START_WORDS or rest[i].upper().startswith(('AUD', 'VID', 'SDI')):
            boundary = i
            break

    if boundary is not None and boundary > 0:
        device = ' '.join(rest[:boundary])
        port = ' '.join(rest[boundary:])
    else:
        # Fallback: first 1 token = device, rest = port
        device = rest[0]
        port = ' '.join(rest[1:]) if len(rest) > 1 else None

    return location_code, device or None, port or None


def parse_length_ft(raw: str | None) -> float | None:
    if not raw or not str(raw).strip():
        return None
    m = LENGTH_RE.search(str(raw))
    if m:
        return float(m.group(1))
    return None


def infer_drawing_signal_category(dwg_number: str) -> str | None:
    upper = str(dwg_number).upper()
    if upper.endswith('VID'):
        return 'video'
    if upper.endswith('AUD'):
        return 'audio'
    if upper.endswith('CTL'):
        return 'control'
    if upper.endswith('RF'):
        return 'rf'
    return None  # 'mixed' / unknown for pure numeric DWGs


# ---------------------------------------------------------------------------
# Known decommissioned systems seed data
# (extend this list as more systems are identified)
# ---------------------------------------------------------------------------

KNOWN_SYSTEMS: list[dict] = [
    {
        'name': 'Grass Valley Trinix',
        'vendor': 'Grass Valley',
        'product_family': 'Trinix',
        'match_terms': ['TRINIX', 'Trinix', 'GV TRINIX'],
        'status': 'decommissioned',
    },
    {
        'name': 'Grass Valley APEX',
        'vendor': 'Grass Valley',
        'product_family': 'APEX',
        'match_terms': ['APEX', 'GV APEX'],
        'status': 'decommissioned',
    },
    {
        'name': 'Grass Valley K2',
        'vendor': 'Grass Valley',
        'product_family': 'K2',
        'match_terms': ['K2', 'GV K2', 'K2 Server'],
        'status': 'decommissioned',
    },
    {
        'name': 'Grass Valley Kalypso',
        'vendor': 'Grass Valley',
        'product_family': 'Kalypso',
        'match_terms': ['KALYPSO', 'Kalypso'],
        'status': 'decommissioned',
    },
    {
        'name': 'Grass Valley Kayenne',
        'vendor': 'Grass Valley',
        'product_family': 'Kayenne',
        'match_terms': ['KAYENNE', 'Kayenne'],
        'status': 'decommissioned',
    },
    {
        'name': 'Miranda / Grass Valley',
        'vendor': 'Miranda Technologies',
        'product_family': 'Miranda',
        'match_terms': ['MIRANDA', 'Miranda'],
        'status': 'decommissioned',
    },
]


# ---------------------------------------------------------------------------
# Location code → room_type heuristic
# ---------------------------------------------------------------------------

def infer_room_type(code: str) -> str:
    upper = code.upper()
    if upper in ('TRINIX', 'APEX'):
        return 'frame'
    if upper.startswith('VDA'):
        return 'rack_room'
    if upper.startswith('VJF'):
        return 'jackfield'
    if upper in ('XMSN', 'XMSN2'):
        return 'transmission'
    if upper.startswith('JR'):
        return 'mtr'
    if upper.startswith('RTR'):
        return 'frame'
    return 'rack_room'


# Regex patterns that identify a first-token as a real room/area code
# rather than a device name. Only matching codes go into plant_locations.
# Pattern: optional letter prefix + 2-digit number (TK03, TJ06, TD09…)
# or known named frames (TRINIX, APEX, XMSN, VJF, RTR01, JR).
import re as _re
_ROOM_CODE_RE = _re.compile(
    r'^(T[A-Z]\d{2}|TC-\d+|TD-\d+|TG-\d+|TE-\d+|TJ-\d+|TF-\d+|TK-\d+'
    r'|TRINIX|APEX|XMSN\d*|VJF\d*|VDA\d*|RTR\d+|JR\d*)',
    _re.IGNORECASE,
)

def is_room_code(code: str) -> bool:
    """Return True if this first-token looks like a real facility location code."""
    return bool(_ROOM_CODE_RE.match(code))


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description='Normalise KGO cable DB Excel export.')
    parser.add_argument('--excel', required=True,
                        help='Path to afcables_*.xlsx')
    parser.add_argument('--org-id', required=True,
                        help='Supabase organization UUID to stamp on all rows')
    parser.add_argument('--sheet', default=0,
                        help='Sheet name or 0-based index (default: 0)')
    parser.add_argument('--limit', type=int, default=None,
                        help='Process only first N data rows (for testing)')
    args = parser.parse_args()

    try:
        import openpyxl
    except ImportError:
        sys.exit('openpyxl not installed.  Run: pip install openpyxl')

    org_id = args.org_id
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    print(f'Opening {args.excel} …')
    wb = openpyxl.load_workbook(args.excel, read_only=True, data_only=True)

    sheet_arg = args.sheet
    if isinstance(sheet_arg, str) and not sheet_arg.isdigit():
        ws = wb[sheet_arg]
    else:
        ws = wb.worksheets[int(sheet_arg)]

    print(f'Sheet: {ws.title}')

    # ---- Read header row ----
    rows = ws.iter_rows(values_only=True)
    headers = [str(h).strip() if h is not None else f'F{i}' for i, h in enumerate(next(rows))]
    print(f'Columns ({len(headers)}): {headers}')

    def col(row_dict: dict, *names: str) -> str | None:
        for n in names:
            v = row_dict.get(n)
            if v is not None and str(v).strip():
                return str(v).strip()
        return None

    # ---- Accumulators ----
    location_codes: dict[str, dict] = {}   # code → location row
    drawing_numbers: dict[str, dict] = {}  # dwg_number → drawing row
    cable_rows: list[dict] = []

    stats = defaultdict(int)

    print('Processing rows …')
    for i, raw_row in enumerate(rows):
        if args.limit and i >= args.limit:
            break
        if i % 5000 == 0 and i > 0:
            print(f'  {i:,} rows processed …')

        row = dict(zip(headers, raw_row))

        origin_raw = col(row, 'ORIGIN', 'SOURCE') or ''
        dest_raw   = col(row, 'DEST')             or ''

        if not origin_raw and not dest_raw:
            stats['skipped_empty'] += 1
            continue

        # -- Wire type normalisation --
        wire_type_raw = col(row, 'Wire Type', 'WireType')
        cable_family, jacket_color = normalize_wire_type(wire_type_raw)
        if wire_type_raw and cable_family == 'other':
            stats['wire_type_unmatched'] += 1

        # -- Drawing --
        dwg_number = col(row, 'DWG')
        drawing_id = None
        if dwg_number:
            if dwg_number not in drawing_numbers:
                drawing_numbers[dwg_number] = {
                    'id': str(uuid.uuid4()),
                    'organization_id': org_id,
                    'dwg_number': dwg_number,
                    'signal_category': infer_drawing_signal_category(dwg_number),
                    'status': 'active',
                }
            drawing_id = drawing_numbers[dwg_number]['id']

        # -- Signal type --
        signal_type = infer_signal_type(cable_family, dwg_number, origin_raw, dest_raw)

        # -- Origin / dest parsing --
        o_loc, o_dev, o_port = parse_origin_dest(origin_raw)
        d_loc, d_dev, d_port = parse_origin_dest(dest_raw)

        # -- Collect location codes (room/area codes only, not device names) --
        for code in [o_loc, d_loc]:
            if code and code not in location_codes and is_room_code(code):
                location_codes[code] = {
                    'id': str(uuid.uuid4()),
                    'organization_id': org_id,
                    'code': code,
                    'name': code,                   # placeholder; engineer fills in full name
                    'room_type': infer_room_type(code),
                    'status': 'active',
                }

        # -- Length --
        length_raw = col(row, 'Length')
        length_ft  = parse_length_ft(length_raw)

        # -- Build cable row --
        legacy_id_raw = row.get('ID')
        legacy_id = int(legacy_id_raw) if legacy_id_raw is not None else None

        cable_rows.append({
            'id':                  str(uuid.uuid4()),
            'organization_id':     org_id,
            'legacy_id':           legacy_id,
            'cable_number':        col(row, 'NUMBER'),
            'numc':                col(row, 'NUMC'),
            'legacy_project_id':   col(row, 'Project ID', 'ProjectID'),
            'alt_dwg':             col(row, 'Alternate Dwg', 'AltDwg'),
            'drawing_id':          drawing_id,
            'origin_raw':          origin_raw,
            'origin_location_code': o_loc,
            'origin_device':       o_dev,
            'origin_port':         o_port,
            'dest_raw':            dest_raw,
            'dest_location_code':  d_loc,
            'dest_device':         d_dev,
            'dest_port':           d_port,
            'cable_family':        cable_family,
            'jacket_color':        jacket_color,
            'wire_type_raw':       wire_type_raw,
            'signal_type':         signal_type,
            'length_raw':          length_raw,
            'length_ft':           length_ft,
            'status':              'unknown',
            'notes':               col(row, 'Note', 'Notes'),
        })
        stats['cables_written'] += 1

    wb.close()
    print(f'\nDone.  {stats["cables_written"]:,} cables, '
          f'{len(location_codes):,} locations, '
          f'{len(drawing_numbers):,} drawings.')
    if stats['wire_type_unmatched']:
        print(f'  Wire type unmatched (fell through to "other"): '
              f'{stats["wire_type_unmatched"]:,} — see out/unmatched_wire_types.csv')
    if stats['skipped_empty']:
        print(f'  Skipped (no origin or dest): {stats["skipped_empty"]:,}')

    # ---- Collect unmatched wire types for review ----
    unmatched_wire_types: dict[str, int] = defaultdict(int)
    for c in cable_rows:
        if c['cable_family'] == 'other' and c['wire_type_raw']:
            unmatched_wire_types[c['wire_type_raw']] += 1

    if unmatched_wire_types:
        unmatched_path = OUT_DIR / 'unmatched_wire_types.csv'
        with open(unmatched_path, 'w', newline='', encoding='utf-8') as f:
            w = csv.writer(f)
            w.writerow(['wire_type_raw', 'count'])
            for wt, cnt in sorted(unmatched_wire_types.items(), key=lambda x: -x[1]):
                w.writerow([wt, cnt])
        print(f'  Unmatched wire types written to {unmatched_path}')

    # ---- Write plant_locations.json ----
    locations_out = list(location_codes.values())
    loc_path = OUT_DIR / 'plant_locations.json'
    with open(loc_path, 'w', encoding='utf-8') as f:
        json.dump(locations_out, f, indent=2)
    print(f'\nWrote {len(locations_out):,} locations -> {loc_path}')

    # ---- Write plant_drawings.json ----
    drawings_out = list(drawing_numbers.values())
    drw_path = OUT_DIR / 'plant_drawings.json'
    with open(drw_path, 'w', encoding='utf-8') as f:
        json.dump(drawings_out, f, indent=2)
    print(f'Wrote {len(drawings_out):,} drawings  -> {drw_path}')

    # ---- Write plant_systems.json (seed) ----
    systems_out = [
        {
            'id':             str(uuid.uuid4()),
            'organization_id': org_id,
            'name':           s['name'],
            'vendor':         s.get('vendor'),
            'product_family': s.get('product_family'),
            'match_terms':    s['match_terms'],
            'status':         s['status'],
        }
        for s in KNOWN_SYSTEMS
    ]
    sys_path = OUT_DIR / 'plant_systems.json'
    with open(sys_path, 'w', encoding='utf-8') as f:
        json.dump(systems_out, f, indent=2)
    print(f'Wrote {len(systems_out):,} systems   -> {sys_path}')

    # ---- Write plant_cables.json (chunked) ----
    chunk_paths = []
    for chunk_num, start in enumerate(range(0, len(cable_rows), CABLE_CHUNK_SIZE)):
        chunk = cable_rows[start:start + CABLE_CHUNK_SIZE]
        chunk_path = OUT_DIR / f'plant_cables_{chunk_num:04d}.json'
        with open(chunk_path, 'w', encoding='utf-8') as f:
            json.dump(chunk, f, indent=2)
        chunk_paths.append(chunk_path)
    print(f'Wrote {len(cable_rows):,} cables    -> {len(chunk_paths)} chunk files in {OUT_DIR}/')

    # ---- Summary report ----
    family_counts: dict[str, int] = defaultdict(int)
    signal_counts: dict[str, int] = defaultdict(int)
    status_counts: dict[str, int] = defaultdict(int)
    for c in cable_rows:
        family_counts[c['cable_family']] += 1
        signal_counts[c['signal_type']] += 1
        status_counts[c['status']] += 1

    summary = {
        'total_cables': len(cable_rows),
        'total_locations': len(location_codes),
        'total_drawings': len(drawing_numbers),
        'cable_family_distribution': dict(sorted(family_counts.items(), key=lambda x: -x[1])),
        'signal_type_distribution': dict(sorted(signal_counts.items(), key=lambda x: -x[1])),
        'unmatched_wire_type_count': stats['wire_type_unmatched'],
    }
    summary_path = OUT_DIR / 'import_summary.json'
    with open(summary_path, 'w', encoding='utf-8') as f:
        json.dump(summary, f, indent=2)
    print(f'\nSummary written to {summary_path}')
    print('\nNext step: review out/plant_locations.json to fill in full location names,')
    print('then run: python upload.py --org-id <uuid> --supabase-url <url> --service-key <key>')


if __name__ == '__main__':
    main()
