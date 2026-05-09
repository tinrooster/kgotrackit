/**
 * One-shot script: append a curated set of additional inventory items to
 * `seedData.internal.ts` and `seedData.public.ts` so both files stay in
 * lockstep on `id`, `quantity`, `category`, `unit`, etc., differing only
 * in supplier strings and project codes.
 *
 * Run with: `node scripts/demoSeed/expand-inventory.cjs`
 * Idempotent: if the marker comment is already present, it skips insertion.
 */

const fs = require('fs');
const path = require('path');

const INSERTION_MARKER = '// === demo seed: additional inventory (script-generated) ===';

const ROOT = path.resolve(__dirname, '..', '..');
const INTERNAL_PATH = path.join(ROOT, 'src', 'lib', 'demoSeed', 'seedData.internal.ts');
const PUBLIC_PATH = path.join(ROOT, 'src', 'lib', 'demoSeed', 'seedData.public.ts');

const SUPPLIER_PUBLIC_MAP = {
  'Joseph Electronics': 'Electronics Supplier A',
  Markertek: 'Broadcast Supply Co.',
  'B&H Photo': 'Photo / Video Retailer',
  'Clark Wire & Cable': 'Cable Manufacturer Co.',
  'Amazon Business': 'Business Marketplace',
  Sweetwater: 'Pro Audio Retailer',
  'Musco Lighting': 'Sports Lighting Vendor',
};

const PROJECT_PUBLIC_MAP = {
  '2026:SUTRO': 'DEMO:TX_SITE',
  '2026:NAB': 'DEMO:TRADE_SHOW',
  '2026:CNY_PARADE': 'DEMO:PARADE_A',
  '2026:PRIDE_PARADE': 'DEMO:PARADE_B',
};

/** Canonical inventory rows added to both seeds. */
const ADDITIONS = [
  {
    id: 'demo-inv-bnc-12g-male-rg6',
    name: 'Canare BCP-B5F BNC 12G/4K Compression',
    description: 'Compression-style BNC for RG6 / Belden 1855a, 4K-rated.',
    quantity: 250,
    minQuantity: 50,
    unit: 'each',
    costPerUnit: 4.5,
    category: 'Connector',
    location: 'demo-loc-eng-store',
    barcode: 'DEMO-BNC-12G-RG6',
    supplier: 'Joseph Electronics',
    lastUpdated: '2026-01-20T12:00:00.000Z',
  },
  {
    id: 'demo-inv-cat6a-spool',
    name: 'Belden 10GX13 Cat6a 1000ft Spool',
    description: '23 AWG shielded Cat6a, plenum, blue.',
    quantity: 4,
    minQuantity: 2,
    unit: 'spool',
    costPerUnit: 525,
    category: 'Networking',
    location: 'demo-loc-warehouse-a',
    barcode: 'DEMO-CAT6A-1000FT',
    supplier: 'Joseph Electronics',
    project: 'STUDIO_UPGRADE',
    lastUpdated: '2026-01-22T12:00:00.000Z',
  },
  {
    id: 'demo-inv-cat6a-patch-3ft',
    name: 'Cat6a Shielded Patch Cable 3ft',
    description: 'Pre-terminated Cat6a patch cord.',
    quantity: 60,
    minQuantity: 24,
    unit: 'each',
    costPerUnit: 8,
    category: 'Networking',
    location: 'demo-loc-eng-store',
    barcode: 'DEMO-CAT6A-3FT',
    supplier: 'Markertek',
    lastUpdated: '2026-01-22T12:00:00.000Z',
  },
  {
    id: 'demo-inv-fiber-lc-sm-3m',
    name: 'LC-LC SM Fiber Patch 3m',
    description: 'OS2 single-mode duplex patch cord.',
    quantity: 30,
    minQuantity: 10,
    unit: 'each',
    costPerUnit: 14,
    category: 'Fiber Optic',
    location: 'demo-loc-eng-store',
    barcode: 'DEMO-LC-SM-3M',
    supplier: 'Clark Wire & Cable',
    lastUpdated: '2026-01-25T12:00:00.000Z',
  },
  {
    id: 'demo-inv-fiber-mtp-trunk-12',
    name: 'MTP/MPO 12-Fiber Trunk 25m',
    description: 'OM4 multimode trunk for studio backbone.',
    quantity: 6,
    unit: 'each',
    costPerUnit: 480,
    category: 'Fiber Optic',
    location: 'demo-loc-warehouse-a',
    barcode: 'DEMO-MTP-12F-25M',
    supplier: 'Clark Wire & Cable',
    project: 'STUDIO_UPGRADE',
    lastUpdated: '2026-01-25T12:00:00.000Z',
  },
  {
    id: 'demo-inv-fluke-otdr',
    name: 'Fluke OptiFiber Pro OTDR',
    description: 'Fiber tester for SM/MM with OTDR module.',
    quantity: 1,
    unit: 'each',
    costPerUnit: 14500,
    category: 'Tool',
    location: 'demo-loc-tech-bench',
    barcode: 'DEMO-FLUKE-OFP',
    supplier: 'B&H Photo',
    lastUpdated: '2026-02-01T12:00:00.000Z',
  },
  {
    id: 'demo-inv-cisco-sg350',
    name: 'Cisco SG350-28 PoE+ Switch',
    description: '28-port managed Gigabit PoE+ switch.',
    quantity: 6,
    minQuantity: 2,
    unit: 'each',
    costPerUnit: 1100,
    category: 'Networking',
    location: 'demo-loc-eng-store',
    barcode: 'DEMO-CISCO-SG350',
    supplier: 'Amazon Business',
    project: 'STUDIO_UPGRADE',
    lastUpdated: '2026-02-05T12:00:00.000Z',
  },
  {
    id: 'demo-inv-ubiquiti-er-x',
    name: 'Ubiquiti EdgeRouter X SFP',
    description: 'Edge router with SFP for remote production kits.',
    quantity: 4,
    unit: 'each',
    costPerUnit: 199,
    category: 'Networking',
    location: 'demo-loc-remote-kit',
    barcode: 'DEMO-UBNT-ER-X-SFP',
    supplier: 'Amazon Business',
    lastUpdated: '2026-02-05T12:00:00.000Z',
  },
  {
    id: 'demo-inv-power-distro-pd15',
    name: 'Power Distro PD-1510 Stinger Box',
    description: 'Field power distribution, 15A circuits.',
    quantity: 4,
    unit: 'each',
    costPerUnit: 850,
    category: 'Power',
    location: 'demo-loc-remote-kit',
    barcode: 'DEMO-PD-1510',
    supplier: 'Markertek',
    project: '2026:PRIDE_PARADE',
    lastUpdated: '2026-02-08T12:00:00.000Z',
  },
  {
    id: 'demo-inv-stinger-12-3-100',
    name: '12/3 Stinger Cable 100ft',
    description: 'Heavy-duty extension cord.',
    quantity: 12,
    minQuantity: 4,
    unit: 'each',
    costPerUnit: 145,
    category: 'Cable',
    location: 'demo-loc-warehouse-a',
    barcode: 'DEMO-STINGER-12-3-100',
    supplier: 'Amazon Business',
    lastUpdated: '2026-02-08T12:00:00.000Z',
  },
  {
    id: 'demo-inv-edison-strip-15a',
    name: 'Edison 15A Power Strip (Rack)',
    description: 'Rack-mount 15A 8-outlet strip.',
    quantity: 20,
    minQuantity: 8,
    unit: 'each',
    costPerUnit: 39,
    category: 'Power',
    location: 'demo-loc-eng-store',
    barcode: 'DEMO-EDISON-15A-RACK',
    supplier: 'Amazon Business',
    lastUpdated: '2026-02-08T12:00:00.000Z',
  },
  {
    id: 'demo-inv-canon-cn7-zoom',
    name: 'Canon CN7 17-120 Cinema Servo Zoom',
    description: 'PL-mount servo zoom for studio cameras.',
    quantity: 1,
    unit: 'each',
    costPerUnit: 36000,
    category: 'Video',
    location: 'demo-loc-studio-a',
    barcode: 'DEMO-CANON-CN7-17-120',
    supplier: 'B&H Photo',
    project: 'STUDIO_UPGRADE',
    lastUpdated: '2026-02-12T12:00:00.000Z',
  },
  {
    id: 'demo-inv-sony-fs7',
    name: 'Sony PXW-FS7 II Camera Body',
    description: 'Super 35 4K camera body for ENG / docs.',
    quantity: 3,
    unit: 'each',
    costPerUnit: 8500,
    category: 'Video',
    location: 'demo-loc-studio-a',
    barcode: 'DEMO-SONY-FS7-II',
    supplier: 'B&H Photo',
    lastUpdated: '2026-02-12T12:00:00.000Z',
  },
  {
    id: 'demo-inv-sachtler-video-25',
    name: 'Sachtler Video 25 Tripod System',
    description: 'Heavy-duty fluid head + sticks for studio cameras.',
    quantity: 4,
    unit: 'each',
    costPerUnit: 7500,
    category: 'Hardware',
    location: 'demo-loc-studio-a',
    barcode: 'DEMO-SACHTLER-V25',
    supplier: 'B&H Photo',
    lastUpdated: '2026-02-12T12:00:00.000Z',
  },
  {
    id: 'demo-inv-monitor-7in',
    name: 'SmallHD 702 7" Production Monitor',
    description: 'On-camera 7" 1080p monitor.',
    quantity: 6,
    unit: 'each',
    costPerUnit: 1499,
    category: 'Video',
    location: 'demo-loc-remote-kit',
    barcode: 'DEMO-SHD-702',
    supplier: 'B&H Photo',
    lastUpdated: '2026-02-15T12:00:00.000Z',
  },
  {
    id: 'demo-inv-shure-sm58',
    name: 'Shure SM58 Dynamic Microphone',
    description: 'Industry-standard handheld vocal mic.',
    quantity: 24,
    minQuantity: 8,
    unit: 'each',
    costPerUnit: 99,
    category: 'Audio',
    location: 'demo-loc-studio-a',
    barcode: 'DEMO-SHURE-SM58',
    supplier: 'Sweetwater',
    lastUpdated: '2026-02-15T12:00:00.000Z',
  },
  {
    id: 'demo-inv-rode-ntg3',
    name: 'Rode NTG3 Shotgun Microphone',
    description: 'Field shotgun mic for ENG / docs.',
    quantity: 6,
    unit: 'each',
    costPerUnit: 749,
    category: 'Audio',
    location: 'demo-loc-remote-kit',
    barcode: 'DEMO-RODE-NTG3',
    supplier: 'Sweetwater',
    lastUpdated: '2026-02-15T12:00:00.000Z',
  },
  {
    id: 'demo-inv-yamaha-mg10xu',
    name: 'Yamaha MG10XU Mixer',
    description: '10-channel analog mixer with effects + USB.',
    quantity: 2,
    unit: 'each',
    costPerUnit: 299,
    category: 'Audio',
    location: 'demo-loc-studio-b',
    barcode: 'DEMO-YAMAHA-MG10XU',
    supplier: 'Sweetwater',
    lastUpdated: '2026-02-18T12:00:00.000Z',
  },
  {
    id: 'demo-inv-jbl-eon715',
    name: 'JBL EON715 Active PA Speaker',
    description: 'Powered PA for talent monitoring on remotes.',
    quantity: 4,
    unit: 'each',
    costPerUnit: 749,
    category: 'Audio',
    location: 'demo-loc-warehouse-a',
    barcode: 'DEMO-JBL-EON715',
    supplier: 'Sweetwater',
    lastUpdated: '2026-02-18T12:00:00.000Z',
  },
  {
    id: 'demo-inv-quasar-rgb-tube',
    name: 'Quasar Q-LED X RGB Tube 4ft',
    description: 'RGB tube for set lighting.',
    quantity: 8,
    unit: 'each',
    costPerUnit: 599,
    category: 'Lighting',
    location: 'demo-loc-lighting-rm',
    barcode: 'DEMO-QUASAR-RGB-4',
    supplier: 'B&H Photo',
    lastUpdated: '2026-02-20T12:00:00.000Z',
  },
  {
    id: 'demo-inv-aputure-300d',
    name: 'Aputure LS 300d Mark II',
    description: '300W daylight COB LED fixture.',
    quantity: 4,
    unit: 'each',
    costPerUnit: 1099,
    category: 'Lighting',
    location: 'demo-loc-lighting-rm',
    barcode: 'DEMO-APUTURE-300D',
    supplier: 'B&H Photo',
    lastUpdated: '2026-02-20T12:00:00.000Z',
  },
  {
    id: 'demo-inv-arri-skypanel-s60',
    name: 'ARRI SkyPanel S60-C',
    description: 'Color-tunable LED soft panel.',
    quantity: 2,
    unit: 'each',
    costPerUnit: 8800,
    category: 'Lighting',
    location: 'demo-loc-lighting-rm',
    barcode: 'DEMO-ARRI-S60C',
    supplier: 'B&H Photo',
    lastUpdated: '2026-02-22T12:00:00.000Z',
  },
  {
    id: 'demo-inv-tricaster-mini',
    name: 'NewTek TriCaster Mini Advanced',
    description: 'Compact live production switcher (8 in / 2 out).',
    quantity: 1,
    unit: 'each',
    costPerUnit: 9995,
    category: 'Video',
    location: 'demo-loc-pcr1',
    barcode: 'DEMO-TRICASTER-MINI',
    supplier: 'B&H Photo',
    lastUpdated: '2026-02-25T12:00:00.000Z',
    orderStatus: 'IN_PROGRESS',
    deliveryPercentage: 50,
  },
  {
    id: 'demo-inv-gaffer-tape-2in',
    name: 'Gaffer Tape 2" Black 55yd',
    description: 'Matte black gaffer tape, residue-free.',
    quantity: 36,
    minQuantity: 12,
    unit: 'each',
    costPerUnit: 18,
    category: 'Expendable',
    location: 'demo-loc-eng-store',
    barcode: 'DEMO-GAFFER-2IN',
    supplier: 'Amazon Business',
    lastUpdated: '2026-02-25T12:00:00.000Z',
  },
  {
    id: 'demo-inv-aa-batteries-24',
    name: 'AA Alkaline Batteries 24-Pack',
    description: 'For wireless mics and IFB receivers.',
    quantity: 18,
    minQuantity: 6,
    unit: 'box',
    costPerUnit: 14,
    category: 'Expendable',
    location: 'demo-loc-eng-store',
    barcode: 'DEMO-AA-24PK',
    supplier: 'Amazon Business',
    lastUpdated: '2026-02-25T12:00:00.000Z',
    orderStatus: 'PENDING',
  },
];

const FIELD_ORDER = [
  'id',
  'name',
  'description',
  'quantity',
  'minQuantity',
  'unit',
  'costPerUnit',
  'category',
  'location',
  'barcode',
  'supplier',
  'project',
  'lastUpdated',
  'orderStatus',
  'deliveryPercentage',
];

function escape(str) {
  return JSON.stringify(String(str));
}

function renderItem(row, profile) {
  const supplierMapped =
    profile === 'public' && SUPPLIER_PUBLIC_MAP[row.supplier]
      ? SUPPLIER_PUBLIC_MAP[row.supplier]
      : row.supplier;
  const projectMapped =
    profile === 'public' && row.project && PROJECT_PUBLIC_MAP[row.project]
      ? PROJECT_PUBLIC_MAP[row.project]
      : row.project;

  const lines = ['  {'];
  for (const key of FIELD_ORDER) {
    if (row[key] === undefined) continue;
    if (key === 'supplier') {
      lines.push(`    supplier: ${escape(supplierMapped)},`);
      continue;
    }
    if (key === 'project') {
      lines.push(`    project: ${escape(projectMapped)},`);
      continue;
    }
    if (key === 'lastUpdated') {
      lines.push(`    lastUpdated: new Date('${row.lastUpdated}'),`);
      continue;
    }
    if (key === 'orderStatus') {
      lines.push(`    orderStatus: OrderStatus.${row.orderStatus},`);
      continue;
    }
    if (typeof row[key] === 'number') {
      lines.push(`    ${key}: ${row[key]},`);
    } else {
      lines.push(`    ${key}: ${escape(row[key])},`);
    }
  }
  lines.push('  },');
  return lines.join('\n');
}

function buildBlock(profile) {
  const itemsTs = ADDITIONS.map((row) => renderItem(row, profile)).join('\n');
  return `  ${INSERTION_MARKER}\n${itemsTs}\n`;
}

function insertIntoFile(filePath, profile) {
  const original = fs.readFileSync(filePath, 'utf8');
  if (original.includes(INSERTION_MARKER)) {
    console.log(`[skip] ${path.basename(filePath)} already contains additions.`);
    return;
  }
  const closingPattern = /(\n)(\];\s*\n+\/\/ =+\n\/\/ Master crew \+ position templates)/;
  const match = original.match(closingPattern);
  if (!match) {
    throw new Error(`Insertion anchor not found in ${filePath}`);
  }
  const block = buildBlock(profile);
  const updated = original.replace(closingPattern, `\n${block}$2`);
  fs.writeFileSync(filePath, updated);
  console.log(
    `[ok] ${path.basename(filePath)}: appended ${ADDITIONS.length} inventory rows (profile=${profile}).`,
  );
}

insertIntoFile(INTERNAL_PATH, 'internal');
insertIntoFile(PUBLIC_PATH, 'public');
