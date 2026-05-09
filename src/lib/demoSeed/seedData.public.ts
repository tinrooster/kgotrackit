/**
 * PUBLIC demo seed — same **structure** as `seedData.internal.ts` (productions,
 * inventory links, roles), but anonymized copy and **neutral contact IDs**
 * (`demo-person-NNN`, `demo-org-NNN`) so strings never echo internal name keys.
 * Resolved via `seedData.ts` when `VITE_DEMO_SEED_PROFILE` is unset or `public`.
 *
 * Everything in this module is intentionally
 * deterministic: stable IDs (`demo-…` namespace), stable values, no
 * `Date.now()` / `Math.random()` / `crypto.randomUUID()` usage. Determinism
 * lets `populateDemoData()` stamp consistent fingerprints, and lets
 * `stripDemoData('unmodified')` reliably detect untouched entities.
 *
 * To add a new demo entity:
 *  1. Append it to the relevant list below using a `demo-…` ID.
 *  2. If the change alters fingerprints of existing entities (rare),
 *     bump `DEMO_SEED_VERSION` in `fingerprint.ts`.
 */

import type {
  ChecklistGroup,
  ChecklistItem,
  CrewAssignmentShift,
  CrewScheduleEntry,
  PositionTemplate,
  Production,
  ProductionCrewMember,
  VehiclePacklist,
  VehiclePacklistSection,
} from '@/types/productions';
import type { CrewContact } from '@/types/crewContacts';
import { type InventoryItem, OrderStatus, type CategoryNode, type ItemWithSubcategories } from '@/types/inventory';
import type { DemoSeedSourceData } from './seedData.types';

// =============================================================================
// Lookup lists (Settings → categories / units / locations / suppliers / projects)
// =============================================================================

const DEMO_CATEGORIES: CategoryNode[] = [
  'Cable',
  'Connector',
  'Hardware',
  'Tool',
  'Software',
  'Expendable',
  'Fiber Optic',
  'Power',
  'Networking',
  'Audio',
  'Video',
  'Lighting',
  'RF / Wireless',
].map((name, index) => ({
  id: `demo-cat-${index + 1}`,
  name,
}));

const DEMO_UNITS: ItemWithSubcategories[] = [
  'each',
  'ft',
  'm',
  'box',
  'spool',
  'kit',
  'license',
  'pair',
  'case',
].map((name, index) => ({
  id: `demo-unit-${index + 1}`,
  name,
}));

const DEMO_LOCATIONS: ItemWithSubcategories[] = [
  { id: 'demo-loc-eng-store', name: 'Engineering Store' },
  { id: 'demo-loc-pcr1', name: 'PCR 1 Project Area' },
  { id: 'demo-loc-te-room', name: 'TE Room' },
  { id: 'demo-loc-lighting-rm', name: 'Lighting Rm' },
  { id: 'demo-loc-studio-a', name: 'Studio A' },
  { id: 'demo-loc-studio-b', name: 'Studio B' },
  { id: 'demo-loc-tech-bench', name: 'Tech Bench' },
  { id: 'demo-loc-remote-kit', name: 'Remote Kit Cage' },
  { id: 'demo-loc-warehouse-a', name: 'Warehouse A' },
  { id: 'demo-loc-sat-truck', name: 'Sat Truck Rack' },
];

const DEMO_SUPPLIERS: ItemWithSubcategories[] = [
  { id: 'demo-sup-joseph', name: 'Electronics Supplier A', website: 'https://example.com/demo-supplier-a' },
  { id: 'demo-sup-markertek', name: 'Broadcast Supply Co.', website: 'https://example.com/demo-supplier-b' },
  { id: 'demo-sup-bh', name: 'Photo / Video Retailer', website: 'https://example.com/demo-retailer' },
  { id: 'demo-sup-clark', name: 'Cable Manufacturer Co.', website: 'https://example.com/demo-cable-mfg' },
  { id: 'demo-sup-amazon', name: 'Business Marketplace', website: 'https://example.com/demo-marketplace' },
  { id: 'demo-sup-sweetwater', name: 'Pro Audio Retailer', website: 'https://example.com/demo-pro-audio' },
  { id: 'demo-sup-primed', name: 'Stage Rentals Co.', contactName: 'Vendor Contact A', contactPhone: '+1 555-0101' },
  { id: 'demo-sup-musco', name: 'Sports Lighting Vendor', website: 'https://example.com/demo-lighting' },
  { id: 'demo-sup-devastating', name: 'Effects / Pyro Vendor', contactName: 'Vendor Contact B' },
  { id: 'demo-sup-monkey-brains', name: 'ISP / Bonded Cellular Partner', website: 'https://example.com/demo-isp' },
];

const DEMO_PROJECTS: ItemWithSubcategories[] = [
  { id: 'demo-prj-cny-2026', name: 'DEMO:PARADE_A' },
  { id: 'demo-prj-pride-2026', name: 'DEMO:PARADE_B' },
  { id: 'demo-prj-sutro-2026', name: 'DEMO:TX_SITE' },
  { id: 'demo-prj-nab-2026', name: 'DEMO:TRADE_SHOW' },
  { id: 'demo-prj-studio-a', name: 'STUDIO_UPGRADE' },
  { id: 'demo-prj-maintenance', name: 'MAINTENANCE' },
];

// =============================================================================
// Inventory items (small curated set; linked from production checklists below)
// =============================================================================

const DEMO_INVENTORY_ITEMS: InventoryItem[] = [
  {
    id: 'demo-inv-belden-1855a',
    name: 'Belden 1855a Yellow',
    description: '1000ft Spool, Mini SDI Cable',
    quantity: 12,
    minQuantity: 5,
    unit: 'spool',
    costPerUnit: 340,
    price: 442,
    category: 'Cable',
    location: 'demo-loc-warehouse-a',
    reorderLevel: 5,
    barcode: 'DEMO-BELDEN-1855A-Y',
    notes: 'Demo seed: bulk SDI run for studio cabling.',
    supplier: 'Electronics Supplier A',
    supplierWebsite: 'example.com/demo-supplier-a',
    project: 'DEMO:TX_SITE',
    lastUpdated: new Date('2026-01-15T12:00:00.000Z'),
    orderStatus: OrderStatus.COMPLETED,
    deliveryPercentage: 100,
  },
  {
    id: 'demo-inv-canon-cn-e30-105',
    name: 'Canon CN-E 30-105 T2.8 EF Cinema Zoom',
    description: 'Cinema-style EF zoom, primary jib lens',
    quantity: 2,
    unit: 'each',
    costPerUnit: 22000,
    category: 'Video',
    location: 'demo-loc-studio-a',
    barcode: 'DEMO-CANON-CN-E-30-105',
    supplier: 'Photo / Video Retailer',
    project: 'DEMO:PARADE_B',
    lastUpdated: new Date('2026-02-01T12:00:00.000Z'),
  },
  {
    id: 'demo-inv-rf-tx-rx-pair',
    name: 'Bolt 6 LT 1500 TX/RX Set',
    description: 'Wireless 12G-SDI 1500ft TX/RX pair, used for parade roving cam.',
    quantity: 4,
    unit: 'pair',
    costPerUnit: 15999,
    category: 'RF / Wireless',
    location: 'demo-loc-remote-kit',
    barcode: 'DEMO-BOLT-6-LT-1500',
    supplier: 'Photo / Video Retailer',
    project: 'DEMO:PARADE_A',
    lastUpdated: new Date('2026-02-01T12:00:00.000Z'),
  },
  {
    id: 'demo-inv-comtek-pr216',
    name: 'Comtek PR-216 IFB Receiver',
    description: 'IFB receiver bodies for talent earpieces.',
    quantity: 24,
    unit: 'each',
    costPerUnit: 480,
    category: 'Audio',
    location: 'demo-loc-remote-kit',
    barcode: 'DEMO-COMTEK-PR216',
    supplier: 'Broadcast Supply Co.',
    project: 'DEMO:PARADE_B',
    lastUpdated: new Date('2026-02-01T12:00:00.000Z'),
  },
  {
    id: 'demo-inv-shure-axient-mics',
    name: 'Shure Axient AD2 / KSM9 Combo',
    description: 'Wireless handheld for talent on stage.',
    quantity: 8,
    unit: 'each',
    costPerUnit: 3850,
    category: 'Audio',
    location: 'demo-loc-studio-a',
    barcode: 'DEMO-SHURE-AXIENT',
    supplier: 'Pro Audio Retailer',
    project: 'DEMO:PARADE_A',
    lastUpdated: new Date('2026-02-01T12:00:00.000Z'),
  },
  {
    id: 'demo-inv-musco-lighting-truck',
    name: 'Lighting Truck (vendor rental)',
    description: 'Self-contained lighting truck rental for parade illumination.',
    quantity: 2,
    unit: 'each',
    costPerUnit: 12000,
    category: 'Lighting',
    location: 'demo-loc-warehouse-a',
    barcode: 'DEMO-MUSCO-LIGHT-TRUCK',
    supplier: 'Sports Lighting Vendor',
    project: 'DEMO:PARADE_A',
    lastUpdated: new Date('2026-02-01T12:00:00.000Z'),
  },
  {
    id: 'demo-inv-dejero-cellsat',
    name: 'Bonded Cellular Transmitter (demo)',
    description: 'Bonded cellular + satellite transmitter for parade signal redundancy.',
    quantity: 3,
    unit: 'each',
    costPerUnit: 18500,
    category: 'RF / Wireless',
    location: 'demo-loc-sat-truck',
    barcode: 'DEMO-DEJERO-CELLSAT',
    supplier: 'Photo / Video Retailer',
    project: 'DEMO:PARADE_B',
    lastUpdated: new Date('2026-02-01T12:00:00.000Z'),
  },
  {
    id: 'demo-inv-rf-headset-pair',
    name: 'RTS BTR-800 Wireless Intercom Beltpack + Headset',
    description: 'Crew comms beltpack with single-muff headset.',
    quantity: 16,
    unit: 'each',
    costPerUnit: 1100,
    category: 'Audio',
    location: 'demo-loc-remote-kit',
    barcode: 'DEMO-RTS-BTR800',
    supplier: 'Broadcast Supply Co.',
    project: 'MAINTENANCE',
    lastUpdated: new Date('2026-02-01T12:00:00.000Z'),
  },
  {
    id: 'demo-inv-honda-eu7000',
    name: 'Honda EU7000iS Generator',
    description: 'Quiet portable generator for remote broadcast power.',
    quantity: 4,
    unit: 'each',
    costPerUnit: 4499,
    category: 'Power',
    location: 'demo-loc-warehouse-a',
    barcode: 'DEMO-HONDA-EU7000',
    supplier: 'Amazon Business',
    project: 'MAINTENANCE',
    lastUpdated: new Date('2026-02-01T12:00:00.000Z'),
  },
  {
    id: 'demo-inv-fiber-armored-300',
    name: 'Tactical Fiber 300ft, SM, LC-LC Armored',
    description: 'Field-deployable single-mode fiber on reel.',
    quantity: 8,
    unit: 'spool',
    costPerUnit: 1850,
    category: 'Fiber Optic',
    location: 'demo-loc-warehouse-a',
    barcode: 'DEMO-FIBER-300-LC-SM',
    supplier: 'Cable Manufacturer Co.',
    project: 'DEMO:TRADE_SHOW',
    lastUpdated: new Date('2026-02-01T12:00:00.000Z'),
  },
  {
    id: 'demo-inv-canare-stagebox',
    name: 'Canare 24-pair Audio Stagebox',
    description: 'Multi-pair audio stage box with 100ft tail.',
    quantity: 6,
    unit: 'each',
    costPerUnit: 1850,
    category: 'Audio',
    location: 'demo-loc-warehouse-a',
    barcode: 'DEMO-CANARE-24P',
    supplier: 'Broadcast Supply Co.',
    project: 'DEMO:PARADE_A',
    lastUpdated: new Date('2026-02-01T12:00:00.000Z'),
  },
  // === demo seed: additional inventory (script-generated) ===
  {
    id: "demo-inv-bnc-12g-male-rg6",
    name: "Canare BCP-B5F BNC 12G/4K Compression",
    description: "Compression-style BNC for RG6 / Belden 1855a, 4K-rated.",
    quantity: 250,
    minQuantity: 50,
    unit: "each",
    costPerUnit: 4.5,
    category: "Connector",
    location: "demo-loc-eng-store",
    barcode: "DEMO-BNC-12G-RG6",
    supplier: "Electronics Supplier A",
    lastUpdated: new Date('2026-01-20T12:00:00.000Z'),
  },
  {
    id: "demo-inv-cat6a-spool",
    name: "Belden 10GX13 Cat6a 1000ft Spool",
    description: "23 AWG shielded Cat6a, plenum, blue.",
    quantity: 4,
    minQuantity: 2,
    unit: "spool",
    costPerUnit: 525,
    category: "Networking",
    location: "demo-loc-warehouse-a",
    barcode: "DEMO-CAT6A-1000FT",
    supplier: "Electronics Supplier A",
    project: "STUDIO_UPGRADE",
    lastUpdated: new Date('2026-01-22T12:00:00.000Z'),
  },
  {
    id: "demo-inv-cat6a-patch-3ft",
    name: "Cat6a Shielded Patch Cable 3ft",
    description: "Pre-terminated Cat6a patch cord.",
    quantity: 60,
    minQuantity: 24,
    unit: "each",
    costPerUnit: 8,
    category: "Networking",
    location: "demo-loc-eng-store",
    barcode: "DEMO-CAT6A-3FT",
    supplier: "Broadcast Supply Co.",
    lastUpdated: new Date('2026-01-22T12:00:00.000Z'),
  },
  {
    id: "demo-inv-fiber-lc-sm-3m",
    name: "LC-LC SM Fiber Patch 3m",
    description: "OS2 single-mode duplex patch cord.",
    quantity: 30,
    minQuantity: 10,
    unit: "each",
    costPerUnit: 14,
    category: "Fiber Optic",
    location: "demo-loc-eng-store",
    barcode: "DEMO-LC-SM-3M",
    supplier: "Cable Manufacturer Co.",
    lastUpdated: new Date('2026-01-25T12:00:00.000Z'),
  },
  {
    id: "demo-inv-fiber-mtp-trunk-12",
    name: "MTP/MPO 12-Fiber Trunk 25m",
    description: "OM4 multimode trunk for studio backbone.",
    quantity: 6,
    unit: "each",
    costPerUnit: 480,
    category: "Fiber Optic",
    location: "demo-loc-warehouse-a",
    barcode: "DEMO-MTP-12F-25M",
    supplier: "Cable Manufacturer Co.",
    project: "STUDIO_UPGRADE",
    lastUpdated: new Date('2026-01-25T12:00:00.000Z'),
  },
  {
    id: "demo-inv-fluke-otdr",
    name: "Fluke OptiFiber Pro OTDR",
    description: "Fiber tester for SM/MM with OTDR module.",
    quantity: 1,
    unit: "each",
    costPerUnit: 14500,
    category: "Tool",
    location: "demo-loc-tech-bench",
    barcode: "DEMO-FLUKE-OFP",
    supplier: "Photo / Video Retailer",
    lastUpdated: new Date('2026-02-01T12:00:00.000Z'),
  },
  {
    id: "demo-inv-cisco-sg350",
    name: "Cisco SG350-28 PoE+ Switch",
    description: "28-port managed Gigabit PoE+ switch.",
    quantity: 6,
    minQuantity: 2,
    unit: "each",
    costPerUnit: 1100,
    category: "Networking",
    location: "demo-loc-eng-store",
    barcode: "DEMO-CISCO-SG350",
    supplier: "Business Marketplace",
    project: "STUDIO_UPGRADE",
    lastUpdated: new Date('2026-02-05T12:00:00.000Z'),
  },
  {
    id: "demo-inv-ubiquiti-er-x",
    name: "Ubiquiti EdgeRouter X SFP",
    description: "Edge router with SFP for remote production kits.",
    quantity: 4,
    unit: "each",
    costPerUnit: 199,
    category: "Networking",
    location: "demo-loc-remote-kit",
    barcode: "DEMO-UBNT-ER-X-SFP",
    supplier: "Business Marketplace",
    lastUpdated: new Date('2026-02-05T12:00:00.000Z'),
  },
  {
    id: "demo-inv-power-distro-pd15",
    name: "Power Distro PD-1510 Stinger Box",
    description: "Field power distribution, 15A circuits.",
    quantity: 4,
    unit: "each",
    costPerUnit: 850,
    category: "Power",
    location: "demo-loc-remote-kit",
    barcode: "DEMO-PD-1510",
    supplier: "Broadcast Supply Co.",
    project: "DEMO:PARADE_B",
    lastUpdated: new Date('2026-02-08T12:00:00.000Z'),
  },
  {
    id: "demo-inv-stinger-12-3-100",
    name: "12/3 Stinger Cable 100ft",
    description: "Heavy-duty extension cord.",
    quantity: 12,
    minQuantity: 4,
    unit: "each",
    costPerUnit: 145,
    category: "Cable",
    location: "demo-loc-warehouse-a",
    barcode: "DEMO-STINGER-12-3-100",
    supplier: "Business Marketplace",
    lastUpdated: new Date('2026-02-08T12:00:00.000Z'),
  },
  {
    id: "demo-inv-edison-strip-15a",
    name: "Edison 15A Power Strip (Rack)",
    description: "Rack-mount 15A 8-outlet strip.",
    quantity: 20,
    minQuantity: 8,
    unit: "each",
    costPerUnit: 39,
    category: "Power",
    location: "demo-loc-eng-store",
    barcode: "DEMO-EDISON-15A-RACK",
    supplier: "Business Marketplace",
    lastUpdated: new Date('2026-02-08T12:00:00.000Z'),
  },
  {
    id: "demo-inv-canon-cn7-zoom",
    name: "Canon CN7 17-120 Cinema Servo Zoom",
    description: "PL-mount servo zoom for studio cameras.",
    quantity: 1,
    unit: "each",
    costPerUnit: 36000,
    category: "Video",
    location: "demo-loc-studio-a",
    barcode: "DEMO-CANON-CN7-17-120",
    supplier: "Photo / Video Retailer",
    project: "STUDIO_UPGRADE",
    lastUpdated: new Date('2026-02-12T12:00:00.000Z'),
  },
  {
    id: "demo-inv-sony-fs7",
    name: "Sony PXW-FS7 II Camera Body",
    description: "Super 35 4K camera body for ENG / docs.",
    quantity: 3,
    unit: "each",
    costPerUnit: 8500,
    category: "Video",
    location: "demo-loc-studio-a",
    barcode: "DEMO-SONY-FS7-II",
    supplier: "Photo / Video Retailer",
    lastUpdated: new Date('2026-02-12T12:00:00.000Z'),
  },
  {
    id: "demo-inv-sachtler-video-25",
    name: "Sachtler Video 25 Tripod System",
    description: "Heavy-duty fluid head + sticks for studio cameras.",
    quantity: 4,
    unit: "each",
    costPerUnit: 7500,
    category: "Hardware",
    location: "demo-loc-studio-a",
    barcode: "DEMO-SACHTLER-V25",
    supplier: "Photo / Video Retailer",
    lastUpdated: new Date('2026-02-12T12:00:00.000Z'),
  },
  {
    id: "demo-inv-monitor-7in",
    name: "SmallHD 702 7\" Production Monitor",
    description: "On-camera 7\" 1080p monitor.",
    quantity: 6,
    unit: "each",
    costPerUnit: 1499,
    category: "Video",
    location: "demo-loc-remote-kit",
    barcode: "DEMO-SHD-702",
    supplier: "Photo / Video Retailer",
    lastUpdated: new Date('2026-02-15T12:00:00.000Z'),
  },
  {
    id: "demo-inv-shure-sm58",
    name: "Shure SM58 Dynamic Microphone",
    description: "Industry-standard handheld vocal mic.",
    quantity: 24,
    minQuantity: 8,
    unit: "each",
    costPerUnit: 99,
    category: "Audio",
    location: "demo-loc-studio-a",
    barcode: "DEMO-SHURE-SM58",
    supplier: "Pro Audio Retailer",
    lastUpdated: new Date('2026-02-15T12:00:00.000Z'),
  },
  {
    id: "demo-inv-rode-ntg3",
    name: "Rode NTG3 Shotgun Microphone",
    description: "Field shotgun mic for ENG / docs.",
    quantity: 6,
    unit: "each",
    costPerUnit: 749,
    category: "Audio",
    location: "demo-loc-remote-kit",
    barcode: "DEMO-RODE-NTG3",
    supplier: "Pro Audio Retailer",
    lastUpdated: new Date('2026-02-15T12:00:00.000Z'),
  },
  {
    id: "demo-inv-yamaha-mg10xu",
    name: "Yamaha MG10XU Mixer",
    description: "10-channel analog mixer with effects + USB.",
    quantity: 2,
    unit: "each",
    costPerUnit: 299,
    category: "Audio",
    location: "demo-loc-studio-b",
    barcode: "DEMO-YAMAHA-MG10XU",
    supplier: "Pro Audio Retailer",
    lastUpdated: new Date('2026-02-18T12:00:00.000Z'),
  },
  {
    id: "demo-inv-jbl-eon715",
    name: "JBL EON715 Active PA Speaker",
    description: "Powered PA for talent monitoring on remotes.",
    quantity: 4,
    unit: "each",
    costPerUnit: 749,
    category: "Audio",
    location: "demo-loc-warehouse-a",
    barcode: "DEMO-JBL-EON715",
    supplier: "Pro Audio Retailer",
    lastUpdated: new Date('2026-02-18T12:00:00.000Z'),
  },
  {
    id: "demo-inv-quasar-rgb-tube",
    name: "Quasar Q-LED X RGB Tube 4ft",
    description: "RGB tube for set lighting.",
    quantity: 8,
    unit: "each",
    costPerUnit: 599,
    category: "Lighting",
    location: "demo-loc-lighting-rm",
    barcode: "DEMO-QUASAR-RGB-4",
    supplier: "Photo / Video Retailer",
    lastUpdated: new Date('2026-02-20T12:00:00.000Z'),
  },
  {
    id: "demo-inv-aputure-300d",
    name: "Aputure LS 300d Mark II",
    description: "300W daylight COB LED fixture.",
    quantity: 4,
    unit: "each",
    costPerUnit: 1099,
    category: "Lighting",
    location: "demo-loc-lighting-rm",
    barcode: "DEMO-APUTURE-300D",
    supplier: "Photo / Video Retailer",
    lastUpdated: new Date('2026-02-20T12:00:00.000Z'),
  },
  {
    id: "demo-inv-arri-skypanel-s60",
    name: "ARRI SkyPanel S60-C",
    description: "Color-tunable LED soft panel.",
    quantity: 2,
    unit: "each",
    costPerUnit: 8800,
    category: "Lighting",
    location: "demo-loc-lighting-rm",
    barcode: "DEMO-ARRI-S60C",
    supplier: "Photo / Video Retailer",
    lastUpdated: new Date('2026-02-22T12:00:00.000Z'),
  },
  {
    id: "demo-inv-tricaster-mini",
    name: "NewTek TriCaster Mini Advanced",
    description: "Compact live production switcher (8 in / 2 out).",
    quantity: 1,
    unit: "each",
    costPerUnit: 9995,
    category: "Video",
    location: "demo-loc-pcr1",
    barcode: "DEMO-TRICASTER-MINI",
    supplier: "Photo / Video Retailer",
    lastUpdated: new Date('2026-02-25T12:00:00.000Z'),
    orderStatus: OrderStatus.IN_PROGRESS,
    deliveryPercentage: 50,
  },
  {
    id: "demo-inv-gaffer-tape-2in",
    name: "Gaffer Tape 2\" Black 55yd",
    description: "Matte black gaffer tape, residue-free.",
    quantity: 36,
    minQuantity: 12,
    unit: "each",
    costPerUnit: 18,
    category: "Expendable",
    location: "demo-loc-eng-store",
    barcode: "DEMO-GAFFER-2IN",
    supplier: "Business Marketplace",
    lastUpdated: new Date('2026-02-25T12:00:00.000Z'),
  },
  {
    id: "demo-inv-aa-batteries-24",
    name: "AA Alkaline Batteries 24-Pack",
    description: "For wireless mics and IFB receivers.",
    quantity: 18,
    minQuantity: 6,
    unit: "box",
    costPerUnit: 14,
    category: "Expendable",
    location: "demo-loc-eng-store",
    barcode: "DEMO-AA-24PK",
    supplier: "Business Marketplace",
    lastUpdated: new Date('2026-02-25T12:00:00.000Z'),
    orderStatus: OrderStatus.PENDING,
  },
];

// =============================================================================
// Master crew + position templates
// =============================================================================

const POS = (label: string, defaultRoleTag?: string, defaultLocation?: string) => ({
  label,
  defaultRoleTag,
  defaultLocation,
});

const POSITION_DEFINITIONS = [
  POS('Executive Producer', 'producer'),
  POS('Line Producer', 'producer'),
  POS('Director', 'director'),
  POS('Assistant Director', 'director'),
  POS('Stage Manager', 'production'),
  POS('Audio Engineer (A1)', 'audio', 'Audio Booth'),
  POS('Audio Assistant (A2)', 'audio'),
  POS('Lighting Director', 'lighting'),
  POS('Lighting Assistant', 'lighting'),
  POS('Camera Operator', 'camera'),
  POS('Jib Operator', 'camera'),
  POS('Utility / Cable Puller', 'camera'),
  POS('Engineer in Charge (EIC)', 'engineering', 'TE Room'),
  POS('Maintenance Engineer', 'engineering'),
  POS('IT / Network', 'engineering'),
  POS('Transmission', 'engineering'),
  POS('Sat Truck Operator', 'engineering'),
  POS('Truck Driver', 'logistics'),
  POS('Production Coordinator', 'production'),
  POS('Creative Director', 'marketing'),
  POS('Graphics Operator (CG)', 'graphics'),
  POS('On-Air Talent / Anchor', 'talent'),
  POS('Field Reporter', 'talent'),
] as const;

const DEMO_POSITION_TEMPLATES_BASE: Omit<PositionTemplate, '__demoSeed'>[] = POSITION_DEFINITIONS.map((entry, index) => ({
  id: `demo-pos-${index + 1}`,
  label: entry.label,
  defaultRoleTag: entry.defaultRoleTag,
  defaultLocation: entry.defaultLocation,
  sortOrder: index,
}));

const positionIdByLabel = new Map<string, string>(
  DEMO_POSITION_TEMPLATES_BASE.map((tpl) => [tpl.label, tpl.id]),
);

const POS_ID = (label: string): string => {
  const id = positionIdByLabel.get(label);
  if (!id) throw new Error(`demoSeed: missing position template for label "${label}"`);
  return id;
};

/** Crew/vendor rows use systematic IDs (`demo-person-001`…`demo-org-005`); `fullName` values are fictional. */

const CREW_DEFINITIONS: ReadonlyArray<{
  id: string;
  fullName: string;
  contactType: 'crew' | 'vendor';
  roleTags: string[];
  positionLabel?: string;
  organizationName?: string;
  functionalArea?: string;
  email?: string;
  phone?: string;
  baseLocation?: string;
  notes?: string;
}> = [
  // Producers / direction
  { id: 'demo-person-001', fullName: 'Alex Mercer', contactType: 'crew', roleTags: ['producer', 'eic'], positionLabel: 'Executive Producer', email: 'demo.producer.a@example.com', phone: '+1 555-0102' },
  { id: 'demo-person-002', fullName: 'Blake Turner', contactType: 'crew', roleTags: ['producer', 'in-house-ep'], positionLabel: 'Executive Producer' },
  { id: 'demo-person-003', fullName: 'Casey Nguyen', contactType: 'crew', roleTags: ['producer', 'digital'], positionLabel: 'Executive Producer' },
  { id: 'demo-person-004', fullName: 'Drew Coleman', contactType: 'crew', roleTags: ['producer'], positionLabel: 'Line Producer' },
  { id: 'demo-person-005', fullName: 'Ethan Brooks', contactType: 'crew', roleTags: ['director'], positionLabel: 'Director' },
  { id: 'demo-person-006', fullName: 'Finley Ortiz', contactType: 'crew', roleTags: ['director'], positionLabel: 'Assistant Director' },
  { id: 'demo-person-007', fullName: 'Gray Patton', contactType: 'crew', roleTags: ['production'], positionLabel: 'Stage Manager' },
  { id: 'demo-person-008', fullName: 'Harper Quinn', contactType: 'crew', roleTags: ['marketing'], positionLabel: 'Creative Director' },
  // Audio / lighting
  { id: 'demo-person-009', fullName: 'Indigo Reyes', contactType: 'crew', roleTags: ['audio'], positionLabel: 'Audio Engineer (A1)' },
  { id: 'demo-person-010', fullName: 'Jordan Hale', contactType: 'crew', roleTags: ['audio'], positionLabel: 'Audio Engineer (A1)' },
  { id: 'demo-person-011', fullName: 'Kendall Avery', contactType: 'crew', roleTags: ['lighting'], positionLabel: 'Lighting Assistant' },
  // Engineering / transmission
  { id: 'demo-person-012', fullName: 'Logan Pierce', contactType: 'crew', roleTags: ['engineering', 'eng-lead'], positionLabel: 'Engineer in Charge (EIC)' },
  { id: 'demo-person-013', fullName: 'Morgan Ellis', contactType: 'crew', roleTags: ['engineering'], positionLabel: 'Maintenance Engineer', notes: 'Technology leadership (demo).' },
  { id: 'demo-person-014', fullName: 'Noel Ramsey', contactType: 'crew', roleTags: ['engineering'], positionLabel: 'Maintenance Engineer', notes: 'Assistant engineering lead (demo).' },
  { id: 'demo-person-015', fullName: 'Oakley Sanders', contactType: 'crew', roleTags: ['it'], positionLabel: 'IT / Network' },
  { id: 'demo-person-016', fullName: 'Parker Lowe', contactType: 'crew', roleTags: ['it'], positionLabel: 'IT / Network' },
  { id: 'demo-person-017', fullName: 'Quinn Marsh', contactType: 'crew', roleTags: ['transmission'], positionLabel: 'Transmission' },
  { id: 'demo-person-018', fullName: 'Reese Dalton', contactType: 'crew', roleTags: ['transmission', 'sat-truck'], positionLabel: 'Sat Truck Operator' },
  { id: 'demo-person-019', fullName: 'Sage Whitaker', contactType: 'crew', roleTags: ['transmission', 'sat-truck'], positionLabel: 'Sat Truck Operator' },
  // Cameras
  { id: 'demo-person-020', fullName: 'Tatum Rhodes', contactType: 'crew', roleTags: ['camera'], positionLabel: 'Camera Operator' },
  { id: 'demo-person-021', fullName: 'Urban Kane', contactType: 'crew', roleTags: ['camera'], positionLabel: 'Camera Operator' },
  { id: 'demo-person-022', fullName: 'Vesper Nolan', contactType: 'crew', roleTags: ['camera'], positionLabel: 'Camera Operator' },
  { id: 'demo-person-023', fullName: 'Rowan Vale', contactType: 'crew', roleTags: ['camera'], positionLabel: 'Camera Operator' },
  { id: 'demo-person-024', fullName: 'Xaden Price', contactType: 'crew', roleTags: ['camera', 'jib'], positionLabel: 'Jib Operator' },
  { id: 'demo-person-025', fullName: 'Yael Cortez', contactType: 'crew', roleTags: ['camera'], positionLabel: 'Camera Operator' },
  { id: 'demo-person-026', fullName: 'Zion Becker', contactType: 'crew', roleTags: ['camera'], positionLabel: 'Camera Operator' },
  // Talent
  { id: 'demo-person-027', fullName: 'Jordan Ellis', contactType: 'crew', roleTags: ['talent', 'anchor'], positionLabel: 'On-Air Talent / Anchor' },
  { id: 'demo-person-028', fullName: 'Sam Okonkwo', contactType: 'crew', roleTags: ['talent', 'reporter'], positionLabel: 'Field Reporter' },
  { id: 'demo-person-029', fullName: 'Riley Chen', contactType: 'crew', roleTags: ['talent', 'host'], positionLabel: 'On-Air Talent / Anchor', notes: 'Community host slot (demo).' },
  { id: 'demo-person-030', fullName: 'Taylor Brooks', contactType: 'crew', roleTags: ['talent', 'host'], positionLabel: 'On-Air Talent / Anchor', notes: 'Community host slot (demo).' },
  { id: 'demo-person-031', fullName: 'Morgan Patel', contactType: 'crew', roleTags: ['talent', 'host'], positionLabel: 'On-Air Talent / Anchor', notes: 'Community host slot (demo).' },
  { id: 'demo-person-032', fullName: 'Casey Flores', contactType: 'crew', roleTags: ['talent', 'reporter'], positionLabel: 'Field Reporter' },
  { id: 'demo-person-033', fullName: 'Jamie Winters', contactType: 'crew', roleTags: ['talent', 'reporter'], positionLabel: 'Field Reporter' },
  { id: 'demo-person-034', fullName: 'Quinn Harrell', contactType: 'crew', roleTags: ['talent', 'anchor'], positionLabel: 'On-Air Talent / Anchor' },
  { id: 'demo-person-035', fullName: 'Skylar Vaughn', contactType: 'crew', roleTags: ['talent', 'anchor'], positionLabel: 'On-Air Talent / Anchor' },
  // Graphics / marketing
  { id: 'demo-person-036', fullName: 'Alex Kim', contactType: 'crew', roleTags: ['graphics'], positionLabel: 'Graphics Operator (CG)' },
  { id: 'demo-person-037', fullName: 'Drew Patel', contactType: 'crew', roleTags: ['graphics'], positionLabel: 'Graphics Operator (CG)' },
  { id: 'demo-person-038', fullName: 'Lane Porter', contactType: 'crew', roleTags: ['marketing'], positionLabel: 'Production Coordinator' },
  { id: 'demo-person-039', fullName: 'Cameron Webb', contactType: 'crew', roleTags: ['marketing', 'digital'], positionLabel: 'Production Coordinator' },
  // Vendors
  {
    id: 'demo-org-001',
    fullName: 'Vendor Contact — Stage Rentals Co.',
    contactType: 'vendor',
    roleTags: ['stage', 'rental'],
    organizationName: 'Stage Rentals Co.',
    functionalArea: 'Stage rental (20\u2032 × 20\u2032 × 18″)',
    phone: '+1 555-0103',
  },
  {
    id: 'demo-org-002',
    fullName: 'Vendor Crew — Sports Lighting',
    contactType: 'vendor',
    roleTags: ['lighting', 'rental'],
    organizationName: 'Sports Lighting Vendor',
    functionalArea: 'Lighting truck rental + crew',
  },
  {
    id: 'demo-org-003',
    fullName: 'Vendor Contact — Effects / Pyro',
    contactType: 'vendor',
    roleTags: ['pyro'],
    organizationName: 'Effects / Pyro Vendor',
    functionalArea: 'Drone show + pyrotechnics (demo parade).',
    email: 'vendor.effects@example.com',
  },
  {
    id: 'demo-org-004',
    fullName: 'Partner Broadcaster — Feed Exchange',
    contactType: 'vendor',
    roleTags: ['broadcast-partner'],
    organizationName: 'Partner Broadcaster A',
    functionalArea: 'Sister station — feed exchange (demo).',
    email: 'partner.feed@example.com',
    phone: '+1 555-0104',
  },
  {
    id: 'demo-org-005',
    fullName: 'Vendor Contact — ISP / Bonded Cellular',
    contactType: 'vendor',
    roleTags: ['internet-isp'],
    organizationName: 'ISP / Bonded Cellular Partner',
    functionalArea: 'Bonded cellular / IP transmission.',
    email: 'vendor.isp@example.com',
  },
];

const DEMO_CREW_CONTACTS_BASE: Array<Omit<CrewContact, '__demoSeed'>> = CREW_DEFINITIONS.map((entry) => ({
  id: entry.id,
  fullName: entry.fullName,
  contactType: entry.contactType,
  roleTags: [...entry.roleTags],
  defaultEquipmentItemIds: [],
  organizationName: entry.organizationName,
  functionalArea: entry.functionalArea,
  preferredVehicle: undefined,
  vehicleNotes: undefined,
  phone: entry.phone,
  email: entry.email,
  notes: entry.notes,
  baseLocation: entry.baseLocation,
  unionStatus: undefined,
  isActive: true,
  createdAt: '2026-02-01T12:00:00.000Z',
  updatedAt: '2026-02-01T12:00:00.000Z',
}));

const positionLabelByContactId = new Map<string, string | undefined>(
  CREW_DEFINITIONS.map((entry) => [entry.id, entry.positionLabel]),
);

// =============================================================================
// Helpers for building production checklists / vehicle packlists / schedules
// =============================================================================

function makeChecklistItem(
  productionId: string,
  groupSlug: string,
  index: number,
  label: string,
  options: { quantity?: number; inventoryItemId?: string; notes?: string } = {},
): ChecklistItem {
  return {
    id: `${productionId}-cl-${groupSlug}-${index}`,
    label,
    completed: false,
    quantity: options.quantity ?? 1,
    reservedQuantity: 0,
    checkedOutQuantity: 0,
    notes: options.notes,
    inventoryItemId: options.inventoryItemId,
  };
}

function makeChecklistGroup(
  productionId: string,
  slug: string,
  title: string,
  items: ChecklistItem[],
): ChecklistGroup {
  return {
    id: `${productionId}-clg-${slug}`,
    title,
    items,
  };
}

function makeVehiclePacklist(
  productionId: string,
  slug: string,
  vehicleName: string,
  sections: VehiclePacklistSection[],
  items: ChecklistItem[] = [],
): VehiclePacklist {
  return {
    id: `${productionId}-veh-${slug}`,
    vehicleName,
    items,
    sections,
  };
}

function makeVehicleSection(
  productionId: string,
  slug: string,
  title: string,
  checklistGroupId: string | undefined,
  items: ChecklistItem[],
): VehiclePacklistSection {
  return {
    id: `${productionId}-vehsec-${slug}`,
    title,
    checklistGroupId,
    items,
  };
}

function makeShift(
  productionId: string,
  contactId: string,
  date: string,
  callTime?: string,
  startTime?: string,
  endTime?: string,
  location?: string,
  notes?: string,
): CrewAssignmentShift {
  const stableSuffix = `${contactId}-${date}-${callTime ?? startTime ?? 'na'}`;
  return {
    id: `${productionId}-shift-${stableSuffix}`,
    date,
    callTime,
    startTime,
    endTime,
    location,
    notes,
  };
}

function makeScheduleEntry(
  productionId: string,
  crewMemberId: string,
  contactId: string,
  date: string,
  startTime?: string,
  endTime?: string,
  role?: string,
  location?: string,
  notes?: string,
): CrewScheduleEntry {
  const stableSuffix = `${contactId}-${date}-${startTime ?? 'na'}`;
  return {
    id: `${productionId}-sched-${stableSuffix}`,
    crewMemberId,
    date,
    startTime,
    endTime,
    role,
    location,
    notes,
  };
}

function makeProductionCrewMember(
  productionId: string,
  contactId: string,
  role: string,
  options: {
    department?: string;
    location?: string;
    notes?: string;
    shifts?: CrewAssignmentShift[];
  } = {},
): ProductionCrewMember {
  const contact = DEMO_CREW_CONTACTS_BASE.find((c) => c.id === contactId);
  if (!contact) throw new Error(`demoSeed: missing crew contact ${contactId}`);
  const positionLabel = positionLabelByContactId.get(contactId);
  return {
    id: `${productionId}-crew-${contactId}`,
    name: contact.fullName,
    role,
    department: options.department,
    contactId,
    positionTemplateId: positionLabel ? POS_ID(positionLabel) : undefined,
    positionLabel,
    phone: contact.phone,
    email: contact.email,
    notes: options.notes,
    shifts: options.shifts,
  };
}

// =============================================================================
// Production 1 — TX site maintenance (May 2026)
// =============================================================================

const SUTRO_ID = 'demo-prod-sutro-2026';

const sutroChecklists: ChecklistGroup[] = [
  makeChecklistGroup(SUTRO_ID, 'tx', 'Transmitter Maintenance', [
    makeChecklistItem(SUTRO_ID, 'tx', 1, 'Spare TX combiner module on truck', { quantity: 1 }),
    makeChecklistItem(SUTRO_ID, 'tx', 2, '300ft armored fiber, SM, LC-LC', { quantity: 2, inventoryItemId: 'demo-inv-fiber-armored-300' }),
    makeChecklistItem(SUTRO_ID, 'tx', 3, 'Belden 1855a SDI spool', { quantity: 1, inventoryItemId: 'demo-inv-belden-1855a' }),
    makeChecklistItem(SUTRO_ID, 'tx', 4, 'Honda EU7000iS Generator (backup)', { quantity: 1, inventoryItemId: 'demo-inv-honda-eu7000' }),
  ]),
  makeChecklistGroup(SUTRO_ID, 'comms', 'Comms / Crew', [
    makeChecklistItem(SUTRO_ID, 'comms', 1, 'RTS BTR-800 beltpacks (8 active)', { quantity: 8, inventoryItemId: 'demo-inv-rf-headset-pair' }),
    makeChecklistItem(SUTRO_ID, 'comms', 2, 'Spare batteries / chargers'),
    makeChecklistItem(SUTRO_ID, 'comms', 3, 'Site safety gear (PPE)'),
  ]),
  makeChecklistGroup(SUTRO_ID, 'tools', 'Tools & Test Equipment', [
    makeChecklistItem(SUTRO_ID, 'tools', 1, 'Fluke OptiFiber Pro OTDR'),
    makeChecklistItem(SUTRO_ID, 'tools', 2, 'Phoenix LB-1 SDI rasterizer'),
    makeChecklistItem(SUTRO_ID, 'tools', 3, 'Climbing harnesses + rescue kit', { quantity: 4 }),
  ]),
];

const sutroVehicles: VehiclePacklist[] = [
  makeVehiclePacklist(
    SUTRO_ID,
    'service-truck',
    'Service Truck — Unit 12',
    [
      makeVehicleSection(SUTRO_ID, 'tx', 'Transmitter Pack', sutroChecklists[0].id, [
        makeChecklistItem(SUTRO_ID, 'tx-veh', 1, 'Spare TX combiner module', { quantity: 1 }),
        makeChecklistItem(SUTRO_ID, 'tx-veh', 2, 'Tactical fiber 300ft', { quantity: 2, inventoryItemId: 'demo-inv-fiber-armored-300' }),
      ]),
      makeVehicleSection(SUTRO_ID, 'comms', 'Comms Pack', sutroChecklists[1].id, [
        makeChecklistItem(SUTRO_ID, 'comms-veh', 1, 'BTR-800 beltpacks', { quantity: 8 }),
      ]),
    ],
  ),
];

const sutroCrew: ProductionCrewMember[] = [
  makeProductionCrewMember(SUTRO_ID, 'demo-person-012', 'EIC — site lead', {
    department: 'Engineering',
    shifts: [
      makeShift(SUTRO_ID, 'demo-person-012', '2026-05-12', '06:00', '06:30', '17:00', 'TX site compound'),
      makeShift(SUTRO_ID, 'demo-person-012', '2026-05-13', '06:30', '07:00', '17:30', 'TX site compound'),
    ],
  }),
  makeProductionCrewMember(SUTRO_ID, 'demo-person-013', 'Maintenance Engineer', {
    department: 'Engineering',
    shifts: [makeShift(SUTRO_ID, 'demo-person-013', '2026-05-12', '06:30', '07:00', '17:00')],
  }),
  makeProductionCrewMember(SUTRO_ID, 'demo-person-014', 'Maintenance Engineer', {
    department: 'Engineering',
    shifts: [makeShift(SUTRO_ID, 'demo-person-014', '2026-05-13', '06:30', '07:00', '17:00')],
  }),
];

const sutroSchedule: CrewScheduleEntry[] = [
  makeScheduleEntry(SUTRO_ID, sutroCrew[0].id, 'demo-person-012', '2026-05-12', '06:30', '17:00', 'EIC', 'TX site compound'),
  makeScheduleEntry(SUTRO_ID, sutroCrew[0].id, 'demo-person-012', '2026-05-13', '07:00', '17:30', 'EIC', 'TX site compound'),
  makeScheduleEntry(SUTRO_ID, sutroCrew[0].id, 'demo-person-012', '2026-05-14', '08:00', '12:00', 'Decommissioning closeout', 'TX site compound'),
];

const sutroProduction: Omit<Production, '__demoSeed'> = {
  id: SUTRO_ID,
  name: 'TX Site Maintenance — May 2026',
  client: 'Engineering (demo)',
  location: 'Broadcast tower site (metro area)',
  startDate: '2026-05-12',
  endDate: '2026-05-14',
  scheduleDefaultStartTime: '07:00',
  scheduleDefaultEndTime: '17:00',
  status: 'confirmed',
  description: 'Three-day transmitter site maintenance window: combiner swap, fiber recertification, generator load test.',
  checklistGroups: sutroChecklists,
  vehiclePacklists: sutroVehicles,
  crew: sutroCrew,
  crewSchedule: sutroSchedule,
  notes: 'Coordinate with master control before 06:00 each day for off-air windows.',
  createdAt: '2026-02-01T12:00:00.000Z',
  updatedAt: '2026-02-01T12:00:00.000Z',
};

// =============================================================================
// Production 2 — Trade show booth build (demo city)
// =============================================================================

const NAB_ID = 'demo-prod-nab-2026';

const nabChecklists: ChecklistGroup[] = [
  makeChecklistGroup(NAB_ID, 'cameras', 'Cameras & Optics', [
    makeChecklistItem(NAB_ID, 'cameras', 1, 'Canon CN-E 30-105 cinema zoom', { quantity: 2, inventoryItemId: 'demo-inv-canon-cn-e30-105' }),
    makeChecklistItem(NAB_ID, 'cameras', 2, 'Bolt 6 LT 1500 TX/RX kit', { quantity: 2, inventoryItemId: 'demo-inv-rf-tx-rx-pair' }),
    makeChecklistItem(NAB_ID, 'cameras', 3, 'Camera batteries (Gold mount)', { quantity: 12 }),
  ]),
  makeChecklistGroup(NAB_ID, 'cabling', 'Booth Cabling', [
    makeChecklistItem(NAB_ID, 'cabling', 1, 'Belden 1855a SDI spools', { quantity: 4, inventoryItemId: 'demo-inv-belden-1855a' }),
    makeChecklistItem(NAB_ID, 'cabling', 2, 'Tactical fiber 300ft', { quantity: 4, inventoryItemId: 'demo-inv-fiber-armored-300' }),
    makeChecklistItem(NAB_ID, 'cabling', 3, 'Power distros (PD-15)', { quantity: 2 }),
  ]),
  makeChecklistGroup(NAB_ID, 'audio', 'Audio Demo', [
    makeChecklistItem(NAB_ID, 'audio', 1, 'Shure Axient AD2 / KSM9', { quantity: 4, inventoryItemId: 'demo-inv-shure-axient-mics' }),
    makeChecklistItem(NAB_ID, 'audio', 2, 'Comtek PR-216 IFB receivers', { quantity: 6, inventoryItemId: 'demo-inv-comtek-pr216' }),
    makeChecklistItem(NAB_ID, 'audio', 3, 'Canare 24-pair stagebox', { quantity: 1, inventoryItemId: 'demo-inv-canare-stagebox' }),
  ]),
];

const nabVehicles: VehiclePacklist[] = [
  makeVehiclePacklist(
    NAB_ID,
    'shipping-1',
    'Shipping Crate 1 — Cameras',
    [
      makeVehicleSection(NAB_ID, 'cameras', 'Cameras & Optics', nabChecklists[0].id, [
        makeChecklistItem(NAB_ID, 'cameras-veh-1', 1, 'Canon CN-E 30-105 in foam', { quantity: 2, inventoryItemId: 'demo-inv-canon-cn-e30-105' }),
        makeChecklistItem(NAB_ID, 'cameras-veh-1', 2, 'Bolt 6 LT 1500 RF kit', { quantity: 2, inventoryItemId: 'demo-inv-rf-tx-rx-pair' }),
      ]),
    ],
  ),
  makeVehiclePacklist(
    NAB_ID,
    'shipping-2',
    'Shipping Crate 2 — Cable & Audio',
    [
      makeVehicleSection(NAB_ID, 'cabling', 'Booth Cabling', nabChecklists[1].id, [
        makeChecklistItem(NAB_ID, 'cabling-veh', 1, 'Belden 1855a spools', { quantity: 4, inventoryItemId: 'demo-inv-belden-1855a' }),
        makeChecklistItem(NAB_ID, 'cabling-veh', 2, 'Tactical fiber 300ft', { quantity: 4, inventoryItemId: 'demo-inv-fiber-armored-300' }),
      ]),
      makeVehicleSection(NAB_ID, 'audio', 'Audio Demo', nabChecklists[2].id, [
        makeChecklistItem(NAB_ID, 'audio-veh', 1, 'Shure Axient', { quantity: 4, inventoryItemId: 'demo-inv-shure-axient-mics' }),
        makeChecklistItem(NAB_ID, 'audio-veh', 2, 'Comtek PR-216', { quantity: 6, inventoryItemId: 'demo-inv-comtek-pr216' }),
        makeChecklistItem(NAB_ID, 'audio-veh', 3, 'Canare stagebox', { quantity: 1, inventoryItemId: 'demo-inv-canare-stagebox' }),
      ]),
    ],
  ),
];

const nabCrew: ProductionCrewMember[] = [
  makeProductionCrewMember(NAB_ID, 'demo-person-002', 'In-house EP', {
    department: 'Production',
    shifts: [makeShift(NAB_ID, 'demo-person-002', '2026-04-13', '08:00', '08:30', '18:00', 'Convention Hall B')],
  }),
  makeProductionCrewMember(NAB_ID, 'demo-person-015', 'IT / Network lead', {
    department: 'Engineering',
    shifts: [
      makeShift(NAB_ID, 'demo-person-015', '2026-04-13', '07:00', '07:30', '17:00', 'Convention Hall B'),
      makeShift(NAB_ID, 'demo-person-015', '2026-04-14', '07:00', '07:30', '17:00'),
      makeShift(NAB_ID, 'demo-person-015', '2026-04-15', '07:00', '07:30', '17:00'),
    ],
  }),
  makeProductionCrewMember(NAB_ID, 'demo-person-023', 'Camera demos', {
    department: 'Camera',
    shifts: [makeShift(NAB_ID, 'demo-person-023', '2026-04-14', '08:00', '08:30', '17:00')],
  }),
  makeProductionCrewMember(NAB_ID, 'demo-person-009', 'Audio demo', {
    department: 'Audio',
    shifts: [makeShift(NAB_ID, 'demo-person-009', '2026-04-14', '08:00', '08:30', '17:00')],
  }),
];

const nabSchedule: CrewScheduleEntry[] = [
  makeScheduleEntry(NAB_ID, nabCrew[0].id, 'demo-person-002', '2026-04-13', '08:30', '18:00', 'In-house EP', 'Convention Hall B'),
  makeScheduleEntry(NAB_ID, nabCrew[0].id, 'demo-person-002', '2026-04-14', '08:30', '18:00', 'In-house EP', 'Convention Hall B'),
  makeScheduleEntry(NAB_ID, nabCrew[1].id, 'demo-person-015', '2026-04-13', '07:30', '17:00', 'IT / Network', 'Convention Hall B'),
  makeScheduleEntry(NAB_ID, nabCrew[2].id, 'demo-person-023', '2026-04-14', '08:30', '17:00', 'Camera', 'Convention Hall B'),
  makeScheduleEntry(NAB_ID, nabCrew[3].id, 'demo-person-009', '2026-04-14', '08:30', '17:00', 'Audio', 'Convention Hall B'),
];

const nabProduction: Omit<Production, '__demoSeed'> = {
  id: NAB_ID,
  name: 'Trade Show 2026 Booth Build',
  client: 'Marketing (demo)',
  location: 'Convention Hall B, Demo Metro',
  startDate: '2026-04-13',
  endDate: '2026-04-17',
  scheduleDefaultStartTime: '08:00',
  scheduleDefaultEndTime: '17:00',
  status: 'planning',
  description: 'Industry trade show booth: technology showcase with live cameras, audio, fiber demo loop.',
  checklistGroups: nabChecklists,
  vehiclePacklists: nabVehicles,
  crew: nabCrew,
  crewSchedule: nabSchedule,
  notes: 'All gear ships via freight no later than 2026-04-08.',
  createdAt: '2026-02-01T12:00:00.000Z',
  updatedAt: '2026-02-01T12:00:00.000Z',
};

// =============================================================================
// Production 3 — Studio A Camera Upgrade (in-house)
// =============================================================================

const STUDIO_ID = 'demo-prod-studio-a-upgrade';

const studioChecklists: ChecklistGroup[] = [
  makeChecklistGroup(STUDIO_ID, 'cameras', 'Cameras & Lenses', [
    makeChecklistItem(STUDIO_ID, 'cameras', 1, 'Canon CN-E 30-105 zooms', { quantity: 2, inventoryItemId: 'demo-inv-canon-cn-e30-105' }),
    makeChecklistItem(STUDIO_ID, 'cameras', 2, 'New pedestal calibration', { quantity: 1 }),
  ]),
  makeChecklistGroup(STUDIO_ID, 'cabling', 'Cabling & Comms', [
    makeChecklistItem(STUDIO_ID, 'cabling', 1, 'Belden 1855a SDI runs', { quantity: 6, inventoryItemId: 'demo-inv-belden-1855a' }),
    makeChecklistItem(STUDIO_ID, 'cabling', 2, 'Comtek PR-216 IFB on talent', { quantity: 4, inventoryItemId: 'demo-inv-comtek-pr216' }),
  ]),
];

const studioVehicles: VehiclePacklist[] = [
  makeVehiclePacklist(
    STUDIO_ID,
    'in-house',
    'Studio A — On-Site Pack',
    [
      makeVehicleSection(STUDIO_ID, 'cameras', 'Cameras & Lenses', studioChecklists[0].id, [
        makeChecklistItem(STUDIO_ID, 'cameras-veh', 1, 'Canon CN-E 30-105', { quantity: 2, inventoryItemId: 'demo-inv-canon-cn-e30-105' }),
      ]),
    ],
  ),
];

const studioCrew: ProductionCrewMember[] = [
  makeProductionCrewMember(STUDIO_ID, 'demo-person-012', 'EIC', {
    department: 'Engineering',
    shifts: [makeShift(STUDIO_ID, 'demo-person-012', '2026-05-06', '08:00', '08:30', '17:00', 'Studio A')],
  }),
  makeProductionCrewMember(STUDIO_ID, 'demo-person-015', 'Network', {
    department: 'Engineering',
    shifts: [makeShift(STUDIO_ID, 'demo-person-015', '2026-05-06', '08:00', '08:30', '17:00', 'Studio A')],
  }),
];

const studioSchedule: CrewScheduleEntry[] = [
  makeScheduleEntry(STUDIO_ID, studioCrew[0].id, 'demo-person-012', '2026-05-06', '08:30', '17:00', 'EIC', 'Studio A'),
  makeScheduleEntry(STUDIO_ID, studioCrew[1].id, 'demo-person-015', '2026-05-06', '08:30', '17:00', 'Network', 'Studio A'),
];

const studioProduction: Omit<Production, '__demoSeed'> = {
  id: STUDIO_ID,
  name: 'Studio A Camera Upgrade',
  client: 'News dept (demo)',
  location: 'Studio A',
  startDate: '2026-05-06',
  endDate: '2026-05-09',
  scheduleDefaultStartTime: '08:00',
  scheduleDefaultEndTime: '17:00',
  status: 'in_progress',
  description: 'Replace pedestal cams + lens kit; recertify SDI runs to PCR1.',
  checklistGroups: studioChecklists,
  vehiclePacklists: studioVehicles,
  crew: studioCrew,
  crewSchedule: studioSchedule,
  createdAt: '2026-02-01T12:00:00.000Z',
  updatedAt: '2026-02-01T12:00:00.000Z',
};

// =============================================================================
// Production 4 — Night parade A (demo)
// =============================================================================

const CNY_ID = 'demo-prod-sf-cny-2026';

const cnyChecklists: ChecklistGroup[] = [
  makeChecklistGroup(CNY_ID, 'cameras', 'Cameras (8 + drone)', [
    makeChecklistItem(CNY_ID, 'cameras', 1, 'CAM 1 — Hosts — slot A', { quantity: 1 }),
    makeChecklistItem(CNY_ID, 'cameras', 2, 'CAM 2 — Unmanned Wide — slot B'),
    makeChecklistItem(CNY_ID, 'cameras', 3, 'CAM 3 — Street Host — slot C'),
    makeChecklistItem(CNY_ID, 'cameras', 4, 'CAM 4 — JIB — slot D', { inventoryItemId: 'demo-inv-canon-cn-e30-105', quantity: 1 }),
    makeChecklistItem(CNY_ID, 'cameras', 5, 'CAM 5 — Parade Handheld — slot E', { inventoryItemId: 'demo-inv-rf-tx-rx-pair', quantity: 1 }),
    makeChecklistItem(CNY_ID, 'cameras', 6, 'CAM 6 — Plaza palm tree — slot F'),
    makeChecklistItem(CNY_ID, 'cameras', 7, 'CAM 7 — Retail overview — slot G', { notes: 'Building security liaison on file (demo).' }),
    makeChecklistItem(CNY_ID, 'cameras', 8, 'CAM 8 — Tower / drone show', { notes: 'Evening window only.' }),
  ]),
  makeChecklistGroup(CNY_ID, 'audio', 'Audio Kit', [
    makeChecklistItem(CNY_ID, 'audio', 1, 'Shure Axient AD2 wireless handhelds (talent)', { quantity: 4, inventoryItemId: 'demo-inv-shure-axient-mics' }),
    makeChecklistItem(CNY_ID, 'audio', 2, 'Comtek PR-216 IFB receivers', { quantity: 6, inventoryItemId: 'demo-inv-comtek-pr216' }),
    makeChecklistItem(CNY_ID, 'audio', 3, 'Canare 24-pair stagebox (main stage)', { quantity: 1, inventoryItemId: 'demo-inv-canare-stagebox' }),
    makeChecklistItem(CNY_ID, 'audio', 4, 'RTS BTR-800 crew comms (10 active)', { quantity: 10, inventoryItemId: 'demo-inv-rf-headset-pair' }),
  ]),
  makeChecklistGroup(CNY_ID, 'transmission', 'Transmission & RF', [
    makeChecklistItem(CNY_ID, 'transmission', 1, 'Sat truck inventory check (lead operator)', { quantity: 1 }),
    makeChecklistItem(CNY_ID, 'transmission', 2, 'Bonded cellular (ISP partner) primary'),
    makeChecklistItem(CNY_ID, 'transmission', 3, 'Bonded cellular transmitter backup', { quantity: 1, inventoryItemId: 'demo-inv-dejero-cellsat' }),
    makeChecklistItem(CNY_ID, 'transmission', 4, 'Partner station feed (encoder channels 1–3)', { notes: 'Mix-minus + bailout cam.' }),
  ]),
  makeChecklistGroup(CNY_ID, 'cabling', 'Cabling & Power', [
    makeChecklistItem(CNY_ID, 'cabling', 1, 'Belden 1855a SDI spools', { quantity: 3, inventoryItemId: 'demo-inv-belden-1855a' }),
    makeChecklistItem(CNY_ID, 'cabling', 2, 'Tactical fiber 300ft (to retail overview)', { quantity: 1, inventoryItemId: 'demo-inv-fiber-armored-300' }),
    makeChecklistItem(CNY_ID, 'cabling', 3, 'Honda EU7000iS generators', { quantity: 2, inventoryItemId: 'demo-inv-honda-eu7000' }),
    makeChecklistItem(CNY_ID, 'cabling', 4, 'Lighting vendor trucks', { quantity: 2, inventoryItemId: 'demo-inv-musco-lighting-truck' }),
  ]),
];

const cnyVehicles: VehiclePacklist[] = [
  makeVehiclePacklist(
    CNY_ID,
    'sat-truck',
    'Sat Truck — Main corridor exit (downtown garage)',
    [
      makeVehicleSection(CNY_ID, 'tx', 'Transmission & RF', cnyChecklists[2].id, [
        makeChecklistItem(CNY_ID, 'tx-veh', 1, 'Sat truck inventory'),
        makeChecklistItem(CNY_ID, 'tx-veh', 2, 'Bonded cellular transmitter', { quantity: 1, inventoryItemId: 'demo-inv-dejero-cellsat' }),
      ]),
      makeVehicleSection(CNY_ID, 'audio-truck', 'Audio Kit', cnyChecklists[1].id, [
        makeChecklistItem(CNY_ID, 'audio-veh', 1, 'Shure Axient pack', { quantity: 1, inventoryItemId: 'demo-inv-shure-axient-mics' }),
        makeChecklistItem(CNY_ID, 'audio-veh', 2, 'Comtek pack', { quantity: 6, inventoryItemId: 'demo-inv-comtek-pr216' }),
      ]),
    ],
  ),
  makeVehiclePacklist(
    CNY_ID,
    'musco-1',
    'Lighting truck — corridor entrance A',
    [
      makeVehicleSection(CNY_ID, 'lighting-1', 'Lighting', undefined, [
        makeChecklistItem(CNY_ID, 'lighting-veh-1', 1, 'Lighting truck #1 heads', { quantity: 1, inventoryItemId: 'demo-inv-musco-lighting-truck' }),
      ]),
    ],
  ),
  makeVehiclePacklist(
    CNY_ID,
    'musco-2',
    'Lighting truck — corridor entrance B',
    [
      makeVehicleSection(CNY_ID, 'lighting-2', 'Lighting', undefined, [
        makeChecklistItem(CNY_ID, 'lighting-veh-2', 1, 'Lighting truck #2 heads', { quantity: 1, inventoryItemId: 'demo-inv-musco-lighting-truck' }),
      ]),
    ],
  ),
];

const cnyCrew: ProductionCrewMember[] = [
  makeProductionCrewMember(CNY_ID, 'demo-person-001', 'Executive Producer / Onsite EP', {
    department: 'Production',
    shifts: [
      makeShift(CNY_ID, 'demo-person-001', '2026-03-06', '03:00', '03:00', '20:00', 'downtown garage / corridor'),
      makeShift(CNY_ID, 'demo-person-001', '2026-03-07', '07:00', '07:00', '22:00', 'downtown garage / corridor'),
    ],
  }),
  makeProductionCrewMember(CNY_ID, 'demo-person-002', 'In-house EP', { department: 'Production' }),
  makeProductionCrewMember(CNY_ID, 'demo-person-005', 'Director', {
    department: 'Production',
    shifts: [makeShift(CNY_ID, 'demo-person-005', '2026-03-07', '06:00', '06:00', '22:00', 'main stage')],
  }),
  makeProductionCrewMember(CNY_ID, 'demo-person-006', 'Asst Director', { department: 'Production' }),
  makeProductionCrewMember(CNY_ID, 'demo-person-009', 'A1 — Audio', {
    department: 'Audio',
    shifts: [makeShift(CNY_ID, 'demo-person-009', '2026-03-07', '07:00', '07:00', '22:00', 'Audio booth')],
  }),
  makeProductionCrewMember(CNY_ID, 'demo-person-011', 'Lighting Asst', { department: 'Lighting' }),
  makeProductionCrewMember(CNY_ID, 'demo-person-012', 'ENG Lead', { department: 'Engineering' }),
  makeProductionCrewMember(CNY_ID, 'demo-person-018', 'Sat Truck', {
    department: 'Engineering',
    shifts: [
      makeShift(CNY_ID, 'demo-person-018', '2026-03-06', '03:00', '03:00', '20:00', 'corridor exit'),
      makeShift(CNY_ID, 'demo-person-018', '2026-03-07', '07:00', '07:00', '23:00', 'corridor exit'),
    ],
  }),
  makeProductionCrewMember(CNY_ID, 'demo-person-019', 'Sat Truck (relief)', { department: 'Engineering' }),
  makeProductionCrewMember(CNY_ID, 'demo-person-015', 'IT / Network', { department: 'Engineering' }),
  makeProductionCrewMember(CNY_ID, 'demo-person-020', 'CAM 1 — Hosts', {
    department: 'Camera',
    shifts: [makeShift(CNY_ID, 'demo-person-020', '2026-03-07', '12:00', '12:00', '21:00', 'main stage')],
  }),
  makeProductionCrewMember(CNY_ID, 'demo-person-024', 'CAM 4 — Jib', {
    department: 'Camera',
    shifts: [makeShift(CNY_ID, 'demo-person-024', '2026-03-07', '04:00', '04:00', '21:00', 'jib platform', 'Half-day prep prior week (Wed Mar 4).')],
  }),
  makeProductionCrewMember(CNY_ID, 'demo-person-023', 'CAM 5 — Parade Handheld', {
    department: 'Camera',
    shifts: [makeShift(CNY_ID, 'demo-person-023', '2026-03-07', '12:00', '12:00', '21:00', 'Parade route')],
  }),
  makeProductionCrewMember(CNY_ID, 'demo-person-025', 'CAM 6 — plaza palm tree', { department: 'Camera' }),
  makeProductionCrewMember(CNY_ID, 'demo-person-026', 'CAM 7 — retail overview', { department: 'Camera' }),
  makeProductionCrewMember(CNY_ID, 'demo-person-008', 'Creative Director', { department: 'Marketing' }),
  makeProductionCrewMember(CNY_ID, 'demo-person-039', 'Digital Marketing Producer', { department: 'Marketing' }),
  makeProductionCrewMember(CNY_ID, 'demo-person-036', 'Lead Graphic Designer', { department: 'Graphics' }),
  makeProductionCrewMember(CNY_ID, 'demo-person-037', 'CG / Lower-Thirds', { department: 'Graphics' }),
  makeProductionCrewMember(CNY_ID, 'demo-person-034', 'Anchor', {
    department: 'Talent',
    shifts: [makeShift(CNY_ID, 'demo-person-034', '2026-03-07', '13:00', '13:00', '21:00', 'main stage')],
  }),
  makeProductionCrewMember(CNY_ID, 'demo-person-035', 'Anchor', {
    department: 'Talent',
    shifts: [makeShift(CNY_ID, 'demo-person-035', '2026-03-07', '13:00', '13:00', '21:00', 'main stage')],
  }),
];

function pushCnySchedule(): CrewScheduleEntry[] {
  const entries: CrewScheduleEntry[] = [];
  // Friday Mar 6 — load-in / pre-set
  for (const memberContactId of ['demo-person-001', 'demo-person-018', 'demo-person-008'] as const) {
    const member = cnyCrew.find((c) => c.contactId === memberContactId);
    if (!member) continue;
    entries.push(
      makeScheduleEntry(CNY_ID, member.id, memberContactId, '2026-03-06', '03:00', '20:00', member.role, 'downtown garage / corridor', 'Sat truck arrival, stage set, cabling.'),
    );
  }
  // Saturday Mar 7 — show day
  const showDayCallTimes: Array<{ contactId: string; start: string; end: string; location?: string; notes?: string }> = [
    { contactId: 'demo-person-001', start: '07:00', end: '22:00', location: 'route segment A', notes: 'Onsite EP for the day.' },
    { contactId: 'demo-person-018', start: '07:00', end: '23:00', location: 'Sat truck', notes: 'Inspection 9 AM with fire marshal (demo).' },
    { contactId: 'demo-person-019', start: '07:00', end: '23:00', location: 'Sat truck (relief)' },
    { contactId: 'demo-person-009', start: '07:00', end: '22:00', location: 'Audio booth' },
    { contactId: 'demo-person-012', start: '08:00', end: '21:00', location: 'TE / Comms' },
    { contactId: 'demo-person-024', start: '04:00', end: '21:00', location: 'jib platform', notes: 'Half-day prep Wed Mar 4.' },
    { contactId: 'demo-person-020', start: '12:00', end: '21:00', location: 'main stage' },
    { contactId: 'demo-person-023', start: '12:00', end: '21:00', location: 'Parade route' },
    { contactId: 'demo-person-025', start: '12:00', end: '21:00', location: 'plaza palm tree' },
    { contactId: 'demo-person-026', start: '12:00', end: '21:00', location: 'retail overview' },
    { contactId: 'demo-person-005', start: '06:00', end: '22:00', location: 'Truck control' },
    { contactId: 'demo-person-006', start: '06:00', end: '22:00', location: 'Truck control' },
    { contactId: 'demo-person-008', start: '06:00', end: '22:00', location: 'Onsite' },
    { contactId: 'demo-person-034', start: '13:00', end: '21:00', location: 'main stage' },
    { contactId: 'demo-person-035', start: '13:00', end: '21:00', location: 'main stage' },
  ];
  for (const slot of showDayCallTimes) {
    const member = cnyCrew.find((c) => c.contactId === slot.contactId);
    if (!member) continue;
    entries.push(
      makeScheduleEntry(CNY_ID, member.id, slot.contactId, '2026-03-07', slot.start, slot.end, member.role, slot.location, slot.notes),
    );
  }
  return entries;
}

const cnyProduction: Omit<Production, '__demoSeed'> = {
  id: CNY_ID,
  name: 'Night Parade A — Lunar New Year (demo)',
  client: 'Chamber partner / Station 7 (demo)',
  location: 'Downtown plaza — main corridor (metro area)',
  startDate: '2026-03-06',
  endDate: '2026-03-07',
  scheduleDefaultStartTime: '07:00',
  scheduleDefaultEndTime: '22:00',
  status: 'confirmed',
  description:
    'Annual nighttime illuminated parade. Multi-platform broadcast with partner feed and waterfront drone finale. Stage: vendor rental 20\u00d720\u00d718.',
  checklistGroups: cnyChecklists,
  vehiclePacklists: cnyVehicles,
  crew: cnyCrew,
  crewSchedule: pushCnySchedule(),
  notes:
    'Permit window per city film office. Coordinate garage access with parking operator. Drone show vendor contact on file (waterfront pier area).',
  createdAt: '2026-02-01T12:00:00.000Z',
  updatedAt: '2026-02-01T12:00:00.000Z',
};

// =============================================================================
// Production 5 — Day parade B (demo)
// =============================================================================

const PRIDE_ID = 'demo-prod-sf-pride-2026';

const prideChecklists: ChecklistGroup[] = [
  makeChecklistGroup(PRIDE_ID, 'cameras', 'Cameras (10)', [
    makeChecklistItem(PRIDE_ID, 'cameras', 1, 'CAM 1 — Main talent A'),
    makeChecklistItem(PRIDE_ID, 'cameras', 2, 'CAM 2 — Main talent wide (unmanned backup)'),
    makeChecklistItem(PRIDE_ID, 'cameras', 3, 'CAM 3 — Parade interviews (dual operator)', { inventoryItemId: 'demo-inv-rf-tx-rx-pair', quantity: 1 }),
    makeChecklistItem(PRIDE_ID, 'cameras', 4, 'CAM 4 — Parade roving A'),
    makeChecklistItem(PRIDE_ID, 'cameras', 5, 'CAM 5 — Jib', { inventoryItemId: 'demo-inv-canon-cn-e30-105', quantity: 1 }),
    makeChecklistItem(PRIDE_ID, 'cameras', 6, 'CAM 6 — Sponsors (dual operator)'),
    makeChecklistItem(PRIDE_ID, 'cameras', 7, 'CAM 7 — Main stage (dual talent)'),
    makeChecklistItem(PRIDE_ID, 'cameras', 8, 'CAM 8 — Main stage ISO feed'),
    makeChecklistItem(PRIDE_ID, 'cameras', 9, 'CAM 9 — Aerial / pool chopper (weather permitting)'),
    makeChecklistItem(PRIDE_ID, 'cameras', 10, 'CAM 10 — City overview (high vantage)'),
  ]),
  makeChecklistGroup(PRIDE_ID, 'audio', 'Audio Kit', [
    makeChecklistItem(PRIDE_ID, 'audio', 1, 'Shure Axient AD2 wireless handhelds (hosts)', { quantity: 6, inventoryItemId: 'demo-inv-shure-axient-mics' }),
    makeChecklistItem(PRIDE_ID, 'audio', 2, 'Comtek PR-216 IFB receivers', { quantity: 6, inventoryItemId: 'demo-inv-comtek-pr216' }),
    makeChecklistItem(PRIDE_ID, 'audio', 3, 'Canare 24-pair stagebox', { quantity: 1, inventoryItemId: 'demo-inv-canare-stagebox' }),
    makeChecklistItem(PRIDE_ID, 'audio', 4, 'RTS BTR-800 crew comms', { quantity: 14, inventoryItemId: 'demo-inv-rf-headset-pair' }),
  ]),
  makeChecklistGroup(PRIDE_ID, 'transmission', 'Transmission & RF', [
    makeChecklistItem(PRIDE_ID, 'transmission', 1, 'Primary: bonded cellular via ISP partner', { quantity: 1, inventoryItemId: 'demo-inv-dejero-cellsat' }),
    makeChecklistItem(PRIDE_ID, 'transmission', 2, 'Redundancy: sat truck (dual operators)'),
    makeChecklistItem(PRIDE_ID, 'transmission', 3, 'Network affiliate liveshots (scheduled hits)'),
  ]),
  makeChecklistGroup(PRIDE_ID, 'cabling', 'Cabling & Power', [
    makeChecklistItem(PRIDE_ID, 'cabling', 1, 'Belden 1855a SDI spools', { quantity: 4, inventoryItemId: 'demo-inv-belden-1855a' }),
    makeChecklistItem(PRIDE_ID, 'cabling', 2, 'Tactical fiber 300ft (plaza return)', { quantity: 2, inventoryItemId: 'demo-inv-fiber-armored-300' }),
    makeChecklistItem(PRIDE_ID, 'cabling', 3, 'Honda EU7000iS generators', { quantity: 2, inventoryItemId: 'demo-inv-honda-eu7000' }),
  ]),
];

const prideVehicles: VehiclePacklist[] = [
  makeVehiclePacklist(
    PRIDE_ID,
    'sat-truck',
    'Sat Truck — route hub / staging',
    [
      makeVehicleSection(PRIDE_ID, 'tx', 'Transmission & RF', prideChecklists[2].id, [
        makeChecklistItem(PRIDE_ID, 'tx-veh', 1, 'Bonded cellular transmitter', { quantity: 1, inventoryItemId: 'demo-inv-dejero-cellsat' }),
      ]),
      makeVehicleSection(PRIDE_ID, 'audio-truck', 'Audio Kit', prideChecklists[1].id, [
        makeChecklistItem(PRIDE_ID, 'audio-veh', 1, 'Shure Axient', { quantity: 6, inventoryItemId: 'demo-inv-shure-axient-mics' }),
      ]),
    ],
  ),
  makeVehiclePacklist(
    PRIDE_ID,
    'sub-truck',
    'Sub Truck — secondary staging (CAM 6 + sponsors)',
    [
      makeVehicleSection(PRIDE_ID, 'cam6', 'Cam 6 / Sponsors', undefined, [
        makeChecklistItem(PRIDE_ID, 'cam6-veh', 1, 'Bolt 6 LT 1500 RF kit', { quantity: 1, inventoryItemId: 'demo-inv-rf-tx-rx-pair' }),
      ]),
    ],
  ),
];

const prideCrew: ProductionCrewMember[] = [
  makeProductionCrewMember(PRIDE_ID, 'demo-person-004', 'Line Producer', {
    department: 'Production',
    shifts: [makeShift(PRIDE_ID, 'demo-person-004', '2026-06-28', '06:00', '06:00', '16:00', 'route hub / staging')],
  }),
  makeProductionCrewMember(PRIDE_ID, 'demo-person-001', 'Onsite EP', {
    department: 'Production',
    shifts: [makeShift(PRIDE_ID, 'demo-person-001', '2026-06-28', '06:00', '06:00', '16:00', 'route hub / staging')],
  }),
  makeProductionCrewMember(PRIDE_ID, 'demo-person-002', 'In-house EP', { department: 'Production' }),
  makeProductionCrewMember(PRIDE_ID, 'demo-person-005', 'Director', {
    department: 'Production',
    shifts: [makeShift(PRIDE_ID, 'demo-person-005', '2026-06-28', '06:00', '06:00', '15:00', 'Truck control')],
  }),
  makeProductionCrewMember(PRIDE_ID, 'demo-person-006', 'Director 2 (commercials/snipes)', { department: 'Production' }),
  makeProductionCrewMember(PRIDE_ID, 'demo-person-007', 'Stage Manager', {
    department: 'Production',
    shifts: [makeShift(PRIDE_ID, 'demo-person-007', '2026-06-28', '06:00', '06:00', '15:00', 'route hub / staging')],
  }),
  makeProductionCrewMember(PRIDE_ID, 'demo-person-008', 'Creative Director', { department: 'Marketing' }),
  makeProductionCrewMember(PRIDE_ID, 'demo-person-009', 'A1 — Audio', { department: 'Audio' }),
  makeProductionCrewMember(PRIDE_ID, 'demo-person-010', 'A1 — Audio (relief)', { department: 'Audio' }),
  makeProductionCrewMember(PRIDE_ID, 'demo-person-011', 'Lighting / IT support', { department: 'Lighting' }),
  makeProductionCrewMember(PRIDE_ID, 'demo-person-015', 'IT / Network', { department: 'Engineering' }),
  makeProductionCrewMember(PRIDE_ID, 'demo-person-016', 'IT / Network (relief)', { department: 'Engineering' }),
  makeProductionCrewMember(PRIDE_ID, 'demo-person-017', 'Transmission', {
    department: 'Engineering',
    shifts: [makeShift(PRIDE_ID, 'demo-person-017', '2026-06-28', '05:00', '05:00', '16:00', 'Sat truck')],
  }),
  makeProductionCrewMember(PRIDE_ID, 'demo-person-018', 'Sat Truck', {
    department: 'Engineering',
    shifts: [makeShift(PRIDE_ID, 'demo-person-018', '2026-06-28', '04:00', '04:00', '16:00', 'Sat truck')],
  }),
  makeProductionCrewMember(PRIDE_ID, 'demo-person-019', 'Sat Truck (relief / roving)', { department: 'Engineering' }),
  makeProductionCrewMember(PRIDE_ID, 'demo-person-020', 'CAM 1 — Stage', {
    department: 'Camera',
    shifts: [makeShift(PRIDE_ID, 'demo-person-020', '2026-06-28', '08:00', '08:00', '16:00', 'main stage strip')],
  }),
  makeProductionCrewMember(PRIDE_ID, 'demo-person-021', 'CAM 4 — Roving', {
    department: 'Camera',
    shifts: [makeShift(PRIDE_ID, 'demo-person-021', '2026-06-28', '08:00', '08:00', '16:00', 'Parade route')],
  }),
  makeProductionCrewMember(PRIDE_ID, 'demo-person-022', 'Roving (relief)', {
    department: 'Camera',
    shifts: [makeShift(PRIDE_ID, 'demo-person-022', '2026-06-28', '08:00', '08:00', '16:00', 'Parade route')],
  }),
  makeProductionCrewMember(PRIDE_ID, 'demo-person-023', 'CAM 6 — Sponsors / Rotating', {
    department: 'Camera',
    shifts: [makeShift(PRIDE_ID, 'demo-person-023', '2026-06-28', '08:00', '08:00', '16:00', 'secondary staging lane', 'Backup operator swap per crew list.')],
  }),
  makeProductionCrewMember(PRIDE_ID, 'demo-person-024', 'CAM 5 — Jib', {
    department: 'Camera',
    shifts: [makeShift(PRIDE_ID, 'demo-person-024', '2026-06-28', '04:00', '04:00', '16:00', 'route hub', 'Half-day prep prior week (Wed Jun 24).')],
  }),
  makeProductionCrewMember(PRIDE_ID, 'demo-person-033', 'Civic Center Stage', {
    department: 'Talent',
    shifts: [makeShift(PRIDE_ID, 'demo-person-033', '2026-06-28', '09:00', '09:30', '15:00', 'Civic Center')],
  }),
  makeProductionCrewMember(PRIDE_ID, 'demo-person-027', 'Lead Anchor', {
    department: 'Talent',
    shifts: [makeShift(PRIDE_ID, 'demo-person-027', '2026-06-28', '09:15', '09:15', '15:00', 'main stage strip')],
  }),
  makeProductionCrewMember(PRIDE_ID, 'demo-person-028', 'Parade Reporter (street)', {
    department: 'Talent',
    shifts: [makeShift(PRIDE_ID, 'demo-person-028', '2026-06-28', '09:15', '09:15', '15:00', 'Parade route')],
  }),
  makeProductionCrewMember(PRIDE_ID, 'demo-person-029', 'Community Host', { department: 'Talent' }),
  makeProductionCrewMember(PRIDE_ID, 'demo-person-030', 'Community Host', { department: 'Talent' }),
  makeProductionCrewMember(PRIDE_ID, 'demo-person-031', 'Community Host', { department: 'Talent' }),
  makeProductionCrewMember(PRIDE_ID, 'demo-person-032', 'Sponsor Reporter / Anchor relief', { department: 'Talent' }),
];

function buildPrideSchedule(): CrewScheduleEntry[] {
  const entries: CrewScheduleEntry[] = [];
  // Pre-week prep (Wed Jun 24 — sat truck prep)
  for (const memberContactId of ['demo-person-019', 'demo-person-018'] as const) {
    const member = prideCrew.find((c) => c.contactId === memberContactId);
    if (!member) continue;
    entries.push(
      makeScheduleEntry(PRIDE_ID, member.id, memberContactId, '2026-06-24', '09:00', '17:00', 'Sat truck prep', 'facility yard', 'Wed–Fri prep with sat truck leads.'),
      makeScheduleEntry(PRIDE_ID, member.id, memberContactId, '2026-06-25', '09:00', '17:00', 'Sat truck prep', 'facility yard'),
      makeScheduleEntry(PRIDE_ID, member.id, memberContactId, '2026-06-26', '09:00', '17:00', 'Sat truck prep', 'facility yard'),
    );
  }
  // Show day Sun Jun 28
  const showDayCallTimes: Array<{ contactId: string; start: string; end: string; location?: string; notes?: string }> = [
    { contactId: 'demo-person-004', start: '06:00', end: '16:00', location: 'route hub / staging' },
    { contactId: 'demo-person-001', start: '06:00', end: '16:00', location: 'route hub / staging' },
    { contactId: 'demo-person-005', start: '06:00', end: '15:00', location: 'Truck control' },
    { contactId: 'demo-person-007', start: '06:00', end: '15:00', location: 'route hub / staging' },
    { contactId: 'demo-person-017', start: '05:00', end: '16:00', location: 'Sat truck' },
    { contactId: 'demo-person-018', start: '04:00', end: '16:00', location: 'Sat truck' },
    { contactId: 'demo-person-024', start: '04:00', end: '16:00', location: 'route hub' },
    { contactId: 'demo-person-020', start: '08:00', end: '16:00', location: 'main stage strip' },
    { contactId: 'demo-person-021', start: '08:00', end: '16:00', location: 'Parade route' },
    { contactId: 'demo-person-022', start: '08:00', end: '16:00', location: 'Parade route' },
    { contactId: 'demo-person-023', start: '08:00', end: '16:00', location: 'secondary staging lane' },
    { contactId: 'demo-person-033', start: '09:30', end: '15:00', location: 'Civic Center' },
    { contactId: 'demo-person-027', start: '09:15', end: '15:00', location: 'main stage strip' },
    { contactId: 'demo-person-028', start: '09:15', end: '15:00', location: 'Parade route' },
    { contactId: 'demo-person-029', start: '09:30', end: '14:30', location: 'main stage strip' },
    { contactId: 'demo-person-030', start: '09:30', end: '14:30', location: 'main stage strip' },
    { contactId: 'demo-person-031', start: '09:30', end: '14:30', location: 'main stage strip' },
    { contactId: 'demo-person-032', start: '09:00', end: '15:00', location: 'Staging area' },
  ];
  for (const slot of showDayCallTimes) {
    const member = prideCrew.find((c) => c.contactId === slot.contactId);
    if (!member) continue;
    entries.push(
      makeScheduleEntry(PRIDE_ID, member.id, slot.contactId, '2026-06-28', slot.start, slot.end, member.role, slot.location, slot.notes),
    );
  }
  return entries;
}

const prideProduction: Omit<Production, '__demoSeed'> = {
  id: PRIDE_ID,
  name: 'Day Parade B — Community celebration (demo)',
  client: 'Festival partner / Station 7 (demo)',
  location: 'Route hub — civic plaza (metro area)',
  startDate: '2026-06-24',
  endDate: '2026-06-28',
  scheduleDefaultStartTime: '08:00',
  scheduleDefaultEndTime: '15:00',
  status: 'planning',
  description:
    'Annual daytime parade and plaza celebration. Multi-hour linear coverage with internal breaks. Lead anchor + community hosts; plaza camera; aerial pool weather permitting; sat truck redundancy; bonded cellular primary.',
  checklistGroups: prideChecklists,
  vehiclePacklists: prideVehicles,
  crew: prideCrew,
  crewSchedule: buildPrideSchedule(),
  notes:
    'Onsite evac route coordinated with city OEM. Emergency anchor backup roster on file; master control retains program feed; backup path via production switcher.',
  createdAt: '2026-02-01T12:00:00.000Z',
  updatedAt: '2026-02-01T12:00:00.000Z',
};

// =============================================================================
// Exports
// =============================================================================

export const DEMO_SEED_SOURCE_PUBLIC: DemoSeedSourceData = {
  inventory: DEMO_INVENTORY_ITEMS,
  productions: [sutroProduction, nabProduction, studioProduction, cnyProduction, prideProduction],
  crewContacts: DEMO_CREW_CONTACTS_BASE,
  positionTemplates: DEMO_POSITION_TEMPLATES_BASE,
  lookups: {
    categories: DEMO_CATEGORIES,
    units: DEMO_UNITS,
    locations: DEMO_LOCATIONS,
    suppliers: DEMO_SUPPLIERS,
    projects: DEMO_PROJECTS,
  },
};
