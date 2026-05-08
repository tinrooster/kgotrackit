/**
 * Canonical demo seed content. Everything in this module is intentionally
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
  { id: 'demo-sup-joseph', name: 'Joseph Electronics', website: 'https://www.josephelectronics.com' },
  { id: 'demo-sup-markertek', name: 'Markertek', website: 'https://www.markertek.com' },
  { id: 'demo-sup-bh', name: 'B&H Photo', website: 'https://www.bhphotovideo.com' },
  { id: 'demo-sup-clark', name: 'Clark Wire & Cable', website: 'https://www.clarkwc.com' },
  { id: 'demo-sup-amazon', name: 'Amazon Business', website: 'https://www.amazon.com/business' },
  { id: 'demo-sup-sweetwater', name: 'Sweetwater', website: 'https://www.sweetwater.com' },
  { id: 'demo-sup-primed', name: 'Primed Productions Inc.', contactName: 'Dax Pascua', contactPhone: '+1 626-216-5822' },
  { id: 'demo-sup-musco', name: 'Musco Lighting', website: 'https://www.musco.com' },
  { id: 'demo-sup-devastating', name: 'Devastating Pyro', contactName: 'Kenny Chee' },
  { id: 'demo-sup-monkey-brains', name: 'Monkey Brains', website: 'https://www.monkeybrains.net' },
];

const DEMO_PROJECTS: ItemWithSubcategories[] = [
  { id: 'demo-prj-cny-2026', name: '2026:CNY_PARADE' },
  { id: 'demo-prj-pride-2026', name: '2026:PRIDE_PARADE' },
  { id: 'demo-prj-sutro-2026', name: '2026:SUTRO' },
  { id: 'demo-prj-nab-2026', name: '2026:NAB' },
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
    supplier: 'Joseph Electronics',
    supplierWebsite: 'www.josephelectronics.com',
    project: '2026:SUTRO',
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
    supplier: 'B&H Photo',
    project: '2026:PRIDE_PARADE',
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
    supplier: 'B&H Photo',
    project: '2026:CNY_PARADE',
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
    supplier: 'Markertek',
    project: '2026:PRIDE_PARADE',
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
    supplier: 'Sweetwater',
    project: '2026:CNY_PARADE',
    lastUpdated: new Date('2026-02-01T12:00:00.000Z'),
  },
  {
    id: 'demo-inv-musco-lighting-truck',
    name: 'Musco Lighting Truck',
    description: 'Self-contained lighting truck rental for parade illumination.',
    quantity: 2,
    unit: 'each',
    costPerUnit: 12000,
    category: 'Lighting',
    location: 'demo-loc-warehouse-a',
    barcode: 'DEMO-MUSCO-LIGHT-TRUCK',
    supplier: 'Musco Lighting',
    project: '2026:CNY_PARADE',
    lastUpdated: new Date('2026-02-01T12:00:00.000Z'),
  },
  {
    id: 'demo-inv-dejero-cellsat',
    name: 'Dejero CellSat Bonded Transmitter',
    description: 'Bonded cellular + satellite transmitter for parade signal redundancy.',
    quantity: 3,
    unit: 'each',
    costPerUnit: 18500,
    category: 'RF / Wireless',
    location: 'demo-loc-sat-truck',
    barcode: 'DEMO-DEJERO-CELLSAT',
    supplier: 'B&H Photo',
    project: '2026:PRIDE_PARADE',
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
    supplier: 'Markertek',
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
    supplier: 'Clark Wire & Cable',
    project: '2026:NAB',
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
    supplier: 'Markertek',
    project: '2026:CNY_PARADE',
    lastUpdated: new Date('2026-02-01T12:00:00.000Z'),
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
  { id: 'demo-crew-ken-miguel', fullName: 'Ken Miguel', contactType: 'crew', roleTags: ['producer', 'eic'], positionLabel: 'Executive Producer', email: 'ken.miguel@example.com', phone: '+1 415-412-3058' },
  { id: 'demo-crew-mark-stephens', fullName: 'Mark Stephens', contactType: 'crew', roleTags: ['producer', 'in-house-ep'], positionLabel: 'Executive Producer' },
  { id: 'demo-crew-brandon-behle', fullName: 'Brandon Behle', contactType: 'crew', roleTags: ['producer', 'digital'], positionLabel: 'Executive Producer' },
  { id: 'demo-crew-justin-prochaska', fullName: 'Justin Prochaska', contactType: 'crew', roleTags: ['producer'], positionLabel: 'Line Producer' },
  { id: 'demo-crew-kurt-stoneburner', fullName: 'Kurt Stoneburner', contactType: 'crew', roleTags: ['director'], positionLabel: 'Director' },
  { id: 'demo-crew-chris-johnson', fullName: 'Chris Johnson', contactType: 'crew', roleTags: ['director'], positionLabel: 'Assistant Director' },
  { id: 'demo-crew-kathryn-fischer', fullName: 'Kathryn Fischer', contactType: 'crew', roleTags: ['production'], positionLabel: 'Stage Manager' },
  { id: 'demo-crew-paula-marcheschi', fullName: 'Paula Marcheschi', contactType: 'crew', roleTags: ['marketing'], positionLabel: 'Creative Director' },
  // Audio / lighting
  { id: 'demo-crew-fred-tetzner', fullName: 'Fred Tetzner', contactType: 'crew', roleTags: ['audio'], positionLabel: 'Audio Engineer (A1)' },
  { id: 'demo-crew-richard-healy', fullName: 'Richard Healy', contactType: 'crew', roleTags: ['audio'], positionLabel: 'Audio Engineer (A1)' },
  { id: 'demo-crew-ac-hay', fullName: 'AC Hay', contactType: 'crew', roleTags: ['lighting'], positionLabel: 'Lighting Assistant' },
  // Engineering / transmission
  { id: 'demo-crew-david-fortin', fullName: 'David Fortin', contactType: 'crew', roleTags: ['engineering', 'eng-lead'], positionLabel: 'Engineer in Charge (EIC)' },
  { id: 'demo-crew-rosendo-pena', fullName: 'Rosendo Pena', contactType: 'crew', roleTags: ['engineering'], positionLabel: 'Maintenance Engineer', notes: 'Executive Technology Director.' },
  { id: 'demo-crew-jack-fraser', fullName: 'Jack Fraser', contactType: 'crew', roleTags: ['engineering'], positionLabel: 'Maintenance Engineer', notes: 'Assistant Engineering Director.' },
  { id: 'demo-crew-eric-lanyon', fullName: 'Eric Lanyon', contactType: 'crew', roleTags: ['it'], positionLabel: 'IT / Network' },
  { id: 'demo-crew-david-figura', fullName: 'David Figura', contactType: 'crew', roleTags: ['it'], positionLabel: 'IT / Network' },
  { id: 'demo-crew-felice-gandolfo', fullName: 'Felice Gandolfo', contactType: 'crew', roleTags: ['transmission'], positionLabel: 'Transmission' },
  { id: 'demo-crew-dick-epting', fullName: 'Dick Epting', contactType: 'crew', roleTags: ['transmission', 'sat-truck'], positionLabel: 'Sat Truck Operator' },
  { id: 'demo-crew-ido-bartana', fullName: 'Ido Bartana', contactType: 'crew', roleTags: ['transmission', 'sat-truck'], positionLabel: 'Sat Truck Operator' },
  // Cameras
  { id: 'demo-crew-cathy-cavey', fullName: 'Cathy Cavey', contactType: 'crew', roleTags: ['camera'], positionLabel: 'Camera Operator' },
  { id: 'demo-crew-edward-gonzalez', fullName: 'Edward Gonzalez', contactType: 'crew', roleTags: ['camera'], positionLabel: 'Camera Operator' },
  { id: 'demo-crew-scott-arthur', fullName: 'Scott Arthur', contactType: 'crew', roleTags: ['camera'], positionLabel: 'Camera Operator' },
  { id: 'demo-crew-stefan-stifter', fullName: 'Stefan Stifter', contactType: 'crew', roleTags: ['camera'], positionLabel: 'Camera Operator' },
  { id: 'demo-crew-khash-naraghi', fullName: 'Khash Naraghi', contactType: 'crew', roleTags: ['camera', 'jib'], positionLabel: 'Jib Operator' },
  { id: 'demo-crew-ric-dupont', fullName: 'Ric Dupont', contactType: 'crew', roleTags: ['camera'], positionLabel: 'Camera Operator' },
  { id: 'demo-crew-mackenzie-stock', fullName: 'Mackenzie Stock', contactType: 'crew', roleTags: ['camera'], positionLabel: 'Camera Operator' },
  // Talent
  { id: 'demo-crew-reggie-aqui', fullName: 'Reggie Aqui', contactType: 'crew', roleTags: ['talent', 'anchor'], positionLabel: 'On-Air Talent / Anchor' },
  { id: 'demo-crew-drew-tuma', fullName: 'Drew Tuma', contactType: 'crew', roleTags: ['talent', 'reporter'], positionLabel: 'Field Reporter' },
  { id: 'demo-crew-pearl-teese', fullName: 'Pearl Teese', contactType: 'crew', roleTags: ['talent', 'host'], positionLabel: 'On-Air Talent / Anchor', notes: 'Community Host (Pride).' },
  { id: 'demo-crew-carolyn-wysinger', fullName: 'Carolyn Wysinger', contactType: 'crew', roleTags: ['talent', 'host'], positionLabel: 'On-Air Talent / Anchor', notes: 'Community Host (Pride).' },
  { id: 'demo-crew-ngyuen-pham', fullName: 'Ngyuen Pham', contactType: 'crew', roleTags: ['talent', 'host'], positionLabel: 'On-Air Talent / Anchor', notes: 'Community Host (Pride).' },
  { id: 'demo-crew-zach-fuentes', fullName: 'Zach Fuentes', contactType: 'crew', roleTags: ['talent', 'reporter'], positionLabel: 'Field Reporter' },
  { id: 'demo-crew-stephanie-sierra', fullName: 'Stephanie Sierra', contactType: 'crew', roleTags: ['talent', 'reporter'], positionLabel: 'Field Reporter' },
  { id: 'demo-crew-dan-ashley', fullName: 'Dan Ashley', contactType: 'crew', roleTags: ['talent', 'anchor'], positionLabel: 'On-Air Talent / Anchor' },
  { id: 'demo-crew-kristen-sze', fullName: 'Kristen Sze', contactType: 'crew', roleTags: ['talent', 'anchor'], positionLabel: 'On-Air Talent / Anchor' },
  // Graphics / marketing
  { id: 'demo-crew-jeremy-stepp', fullName: 'Jeremy Stepp', contactType: 'crew', roleTags: ['graphics'], positionLabel: 'Graphics Operator (CG)' },
  { id: 'demo-crew-rick-rubin', fullName: 'Rick Rubin', contactType: 'crew', roleTags: ['graphics'], positionLabel: 'Graphics Operator (CG)' },
  { id: 'demo-crew-mollie-wagner', fullName: 'Mollie Wagner', contactType: 'crew', roleTags: ['marketing'], positionLabel: 'Production Coordinator' },
  { id: 'demo-crew-leonard-torres', fullName: 'Leonard Torres', contactType: 'crew', roleTags: ['marketing', 'digital'], positionLabel: 'Production Coordinator' },
  // Vendors
  {
    id: 'demo-vendor-primed',
    fullName: 'Dax Pascua — Primed Productions',
    contactType: 'vendor',
    roleTags: ['stage', 'rental'],
    organizationName: 'Primed Productions Inc.',
    functionalArea: 'Stage rental (20\u2032 × 20\u2032 × 18″)',
    phone: '+1 626-216-5822',
  },
  {
    id: 'demo-vendor-musco',
    fullName: 'Musco Lighting — Crew Lead',
    contactType: 'vendor',
    roleTags: ['lighting', 'rental'],
    organizationName: 'Musco Lighting',
    functionalArea: 'Lighting truck rental + crew',
  },
  {
    id: 'demo-vendor-devastating',
    fullName: 'Kenny Chee — Devastating Pyro',
    contactType: 'vendor',
    roleTags: ['pyro'],
    organizationName: 'Devastating Pyro',
    functionalArea: 'Drone show + pyro (CNY).',
    email: 'kenny@devastatingpyro.com',
  },
  {
    id: 'demo-vendor-ktsf',
    fullName: 'Victor Marino — KTSF',
    contactType: 'vendor',
    roleTags: ['broadcast-partner'],
    organizationName: 'KTSF-TV',
    functionalArea: 'Sister broadcaster — feed exchange (CNY).',
    email: 'vmarino@ktsftv.com',
    phone: '+1 415-577-8569',
  },
  {
    id: 'demo-vendor-monkey-brains',
    fullName: 'Rudy — Monkey Brains',
    contactType: 'vendor',
    roleTags: ['internet-isp'],
    organizationName: 'Monkey Brains',
    functionalArea: 'Bonded cellular / IP transmission.',
    email: 'rudy@monkeybrains.net',
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
// Production 1 — Sutro Tower Maintenance (May 2026)
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
  makeProductionCrewMember(SUTRO_ID, 'demo-crew-david-fortin', 'EIC — site lead', {
    department: 'Engineering',
    shifts: [
      makeShift(SUTRO_ID, 'demo-crew-david-fortin', '2026-05-12', '06:00', '06:30', '17:00', 'Sutro Tower base'),
      makeShift(SUTRO_ID, 'demo-crew-david-fortin', '2026-05-13', '06:30', '07:00', '17:30', 'Sutro Tower base'),
    ],
  }),
  makeProductionCrewMember(SUTRO_ID, 'demo-crew-rosendo-pena', 'Maintenance Engineer', {
    department: 'Engineering',
    shifts: [makeShift(SUTRO_ID, 'demo-crew-rosendo-pena', '2026-05-12', '06:30', '07:00', '17:00')],
  }),
  makeProductionCrewMember(SUTRO_ID, 'demo-crew-jack-fraser', 'Maintenance Engineer', {
    department: 'Engineering',
    shifts: [makeShift(SUTRO_ID, 'demo-crew-jack-fraser', '2026-05-13', '06:30', '07:00', '17:00')],
  }),
];

const sutroSchedule: CrewScheduleEntry[] = [
  makeScheduleEntry(SUTRO_ID, sutroCrew[0].id, 'demo-crew-david-fortin', '2026-05-12', '06:30', '17:00', 'EIC', 'Sutro Tower base'),
  makeScheduleEntry(SUTRO_ID, sutroCrew[0].id, 'demo-crew-david-fortin', '2026-05-13', '07:00', '17:30', 'EIC', 'Sutro Tower base'),
  makeScheduleEntry(SUTRO_ID, sutroCrew[0].id, 'demo-crew-david-fortin', '2026-05-14', '08:00', '12:00', 'Decommissioning closeout', 'Sutro Tower base'),
];

const sutroProduction: Omit<Production, '__demoSeed'> = {
  id: SUTRO_ID,
  name: 'Sutro Tower Maintenance — May 2026',
  client: 'Internal Engineering',
  location: 'Sutro Tower, San Francisco',
  startDate: '2026-05-12',
  endDate: '2026-05-14',
  scheduleDefaultStartTime: '07:00',
  scheduleDefaultEndTime: '17:00',
  status: 'confirmed',
  description: 'Three-day TX site maintenance window: combiner swap, fiber recertification, generator load test.',
  checklistGroups: sutroChecklists,
  vehiclePacklists: sutroVehicles,
  crew: sutroCrew,
  crewSchedule: sutroSchedule,
  notes: 'Coordinate with master control before 06:00 each day for off-air windows.',
  createdAt: '2026-02-01T12:00:00.000Z',
  updatedAt: '2026-02-01T12:00:00.000Z',
};

// =============================================================================
// Production 2 — NAB 2026 Booth Build (Las Vegas)
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
  makeProductionCrewMember(NAB_ID, 'demo-crew-mark-stephens', 'In-house EP', {
    department: 'Production',
    shifts: [makeShift(NAB_ID, 'demo-crew-mark-stephens', '2026-04-13', '08:00', '08:30', '18:00', 'LVCC South Hall')],
  }),
  makeProductionCrewMember(NAB_ID, 'demo-crew-eric-lanyon', 'IT / Network lead', {
    department: 'Engineering',
    shifts: [
      makeShift(NAB_ID, 'demo-crew-eric-lanyon', '2026-04-13', '07:00', '07:30', '17:00', 'LVCC South Hall'),
      makeShift(NAB_ID, 'demo-crew-eric-lanyon', '2026-04-14', '07:00', '07:30', '17:00'),
      makeShift(NAB_ID, 'demo-crew-eric-lanyon', '2026-04-15', '07:00', '07:30', '17:00'),
    ],
  }),
  makeProductionCrewMember(NAB_ID, 'demo-crew-stefan-stifter', 'Camera demos', {
    department: 'Camera',
    shifts: [makeShift(NAB_ID, 'demo-crew-stefan-stifter', '2026-04-14', '08:00', '08:30', '17:00')],
  }),
  makeProductionCrewMember(NAB_ID, 'demo-crew-fred-tetzner', 'Audio demo', {
    department: 'Audio',
    shifts: [makeShift(NAB_ID, 'demo-crew-fred-tetzner', '2026-04-14', '08:00', '08:30', '17:00')],
  }),
];

const nabSchedule: CrewScheduleEntry[] = [
  makeScheduleEntry(NAB_ID, nabCrew[0].id, 'demo-crew-mark-stephens', '2026-04-13', '08:30', '18:00', 'In-house EP', 'LVCC South Hall'),
  makeScheduleEntry(NAB_ID, nabCrew[0].id, 'demo-crew-mark-stephens', '2026-04-14', '08:30', '18:00', 'In-house EP', 'LVCC South Hall'),
  makeScheduleEntry(NAB_ID, nabCrew[1].id, 'demo-crew-eric-lanyon', '2026-04-13', '07:30', '17:00', 'IT / Network', 'LVCC South Hall'),
  makeScheduleEntry(NAB_ID, nabCrew[2].id, 'demo-crew-stefan-stifter', '2026-04-14', '08:30', '17:00', 'Camera', 'LVCC South Hall'),
  makeScheduleEntry(NAB_ID, nabCrew[3].id, 'demo-crew-fred-tetzner', '2026-04-14', '08:30', '17:00', 'Audio', 'LVCC South Hall'),
];

const nabProduction: Omit<Production, '__demoSeed'> = {
  id: NAB_ID,
  name: 'NAB 2026 Booth Build',
  client: 'Marketing',
  location: 'LVCC South Hall, Las Vegas',
  startDate: '2026-04-13',
  endDate: '2026-04-17',
  scheduleDefaultStartTime: '08:00',
  scheduleDefaultEndTime: '17:00',
  status: 'planning',
  description: 'NAB Show 2026 booth: technology showcase with live cameras, audio, fiber demo loop.',
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
  makeProductionCrewMember(STUDIO_ID, 'demo-crew-david-fortin', 'EIC', {
    department: 'Engineering',
    shifts: [makeShift(STUDIO_ID, 'demo-crew-david-fortin', '2026-05-06', '08:00', '08:30', '17:00', 'Studio A')],
  }),
  makeProductionCrewMember(STUDIO_ID, 'demo-crew-eric-lanyon', 'Network', {
    department: 'Engineering',
    shifts: [makeShift(STUDIO_ID, 'demo-crew-eric-lanyon', '2026-05-06', '08:00', '08:30', '17:00', 'Studio A')],
  }),
];

const studioSchedule: CrewScheduleEntry[] = [
  makeScheduleEntry(STUDIO_ID, studioCrew[0].id, 'demo-crew-david-fortin', '2026-05-06', '08:30', '17:00', 'EIC', 'Studio A'),
  makeScheduleEntry(STUDIO_ID, studioCrew[1].id, 'demo-crew-eric-lanyon', '2026-05-06', '08:30', '17:00', 'Network', 'Studio A'),
];

const studioProduction: Omit<Production, '__demoSeed'> = {
  id: STUDIO_ID,
  name: 'Studio A Camera Upgrade',
  client: 'Internal — News',
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
// Production 4 — SF Chinese New Year Parade 2026
// =============================================================================

const CNY_ID = 'demo-prod-sf-cny-2026';

const cnyChecklists: ChecklistGroup[] = [
  makeChecklistGroup(CNY_ID, 'cameras', 'Cameras (8 + drone)', [
    makeChecklistItem(CNY_ID, 'cameras', 1, 'CAM 1 — Hosts (CAVEY) — Nemo 6', { quantity: 1 }),
    makeChecklistItem(CNY_ID, 'cameras', 2, 'CAM 2 — Unmanned Wide — Nemo 7'),
    makeChecklistItem(CNY_ID, 'cameras', 3, 'CAM 3 — Street Host — Nemo 8'),
    makeChecklistItem(CNY_ID, 'cameras', 4, 'CAM 4 — JIB (KHASHI) — Nemo 9', { inventoryItemId: 'demo-inv-canon-cn-e30-105', quantity: 1 }),
    makeChecklistItem(CNY_ID, 'cameras', 5, 'CAM 5 — Parade Handheld (STIFTER) — Nemo 10', { inventoryItemId: 'demo-inv-rf-tx-rx-pair', quantity: 1 }),
    makeChecklistItem(CNY_ID, 'cameras', 6, 'CAM 6 — Union Sq Palm Tree (DUPONT) — Nemo 11'),
    makeChecklistItem(CNY_ID, 'cameras', 7, 'CAM 7 — Macy\u2019s / Overview (Mackenzie Stock)', { notes: 'Onsite contact: Asset Protection Mgr Nikolas Patel.' }),
    makeChecklistItem(CNY_ID, 'cameras', 8, 'CAM 8 — Watermark Tower / Drone Show', { notes: '7:45 PM \u2013 8:30 PM only.' }),
  ]),
  makeChecklistGroup(CNY_ID, 'audio', 'Audio Kit', [
    makeChecklistItem(CNY_ID, 'audio', 1, 'Shure Axient AD2 wireless handhelds (talent)', { quantity: 4, inventoryItemId: 'demo-inv-shure-axient-mics' }),
    makeChecklistItem(CNY_ID, 'audio', 2, 'Comtek PR-216 IFB receivers', { quantity: 6, inventoryItemId: 'demo-inv-comtek-pr216' }),
    makeChecklistItem(CNY_ID, 'audio', 3, 'Canare 24-pair stagebox (Geary stage)', { quantity: 1, inventoryItemId: 'demo-inv-canare-stagebox' }),
    makeChecklistItem(CNY_ID, 'audio', 4, 'RTS BTR-800 crew comms (10 active)', { quantity: 10, inventoryItemId: 'demo-inv-rf-headset-pair' }),
  ]),
  makeChecklistGroup(CNY_ID, 'transmission', 'Transmission & RF', [
    makeChecklistItem(CNY_ID, 'transmission', 1, 'Sat truck inventory check (Epting)', { quantity: 1 }),
    makeChecklistItem(CNY_ID, 'transmission', 2, 'Bonded cellular (Monkey Brains IP) primary'),
    makeChecklistItem(CNY_ID, 'transmission', 3, 'Dejero CellSat backup', { quantity: 1, inventoryItemId: 'demo-inv-dejero-cellsat' }),
    makeChecklistItem(CNY_ID, 'transmission', 4, 'KTSF feed (LiveU Ch1\u20133)', { notes: 'Mix-minus + bailout cam.' }),
  ]),
  makeChecklistGroup(CNY_ID, 'cabling', 'Cabling & Power', [
    makeChecklistItem(CNY_ID, 'cabling', 1, 'Belden 1855a SDI spools', { quantity: 3, inventoryItemId: 'demo-inv-belden-1855a' }),
    makeChecklistItem(CNY_ID, 'cabling', 2, 'Tactical fiber 300ft (to Macy\u2019s overview)', { quantity: 1, inventoryItemId: 'demo-inv-fiber-armored-300' }),
    makeChecklistItem(CNY_ID, 'cabling', 3, 'Honda EU7000iS generators', { quantity: 2, inventoryItemId: 'demo-inv-honda-eu7000' }),
    makeChecklistItem(CNY_ID, 'cabling', 4, 'Musco Lighting trucks', { quantity: 2, inventoryItemId: 'demo-inv-musco-lighting-truck' }),
  ]),
];

const cnyVehicles: VehiclePacklist[] = [
  makeVehiclePacklist(
    CNY_ID,
    'sat-truck',
    'Sat Truck — Geary Exit (Union Sq Garage)',
    [
      makeVehicleSection(CNY_ID, 'tx', 'Transmission & RF', cnyChecklists[2].id, [
        makeChecklistItem(CNY_ID, 'tx-veh', 1, 'Sat truck inventory'),
        makeChecklistItem(CNY_ID, 'tx-veh', 2, 'Dejero CellSat', { quantity: 1, inventoryItemId: 'demo-inv-dejero-cellsat' }),
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
    'Musco Lighting Truck — Geary Entrance',
    [
      makeVehicleSection(CNY_ID, 'lighting-1', 'Lighting', undefined, [
        makeChecklistItem(CNY_ID, 'lighting-veh-1', 1, 'Musco truck #1 lighting heads', { quantity: 1, inventoryItemId: 'demo-inv-musco-lighting-truck' }),
      ]),
    ],
  ),
  makeVehiclePacklist(
    CNY_ID,
    'musco-2',
    'Musco Lighting Truck — Geary @ Powell (Lefty\u2019s)',
    [
      makeVehicleSection(CNY_ID, 'lighting-2', 'Lighting', undefined, [
        makeChecklistItem(CNY_ID, 'lighting-veh-2', 1, 'Musco truck #2 lighting heads', { quantity: 1, inventoryItemId: 'demo-inv-musco-lighting-truck' }),
      ]),
    ],
  ),
];

const cnyCrew: ProductionCrewMember[] = [
  makeProductionCrewMember(CNY_ID, 'demo-crew-ken-miguel', 'Executive Producer / Onsite EP', {
    department: 'Production',
    shifts: [
      makeShift(CNY_ID, 'demo-crew-ken-miguel', '2026-03-06', '03:00', '03:00', '20:00', 'Union Sq Garage / Geary'),
      makeShift(CNY_ID, 'demo-crew-ken-miguel', '2026-03-07', '07:00', '07:00', '22:00', 'Union Sq Garage / Geary'),
    ],
  }),
  makeProductionCrewMember(CNY_ID, 'demo-crew-mark-stephens', 'In-house EP', { department: 'Production' }),
  makeProductionCrewMember(CNY_ID, 'demo-crew-kurt-stoneburner', 'Director', {
    department: 'Production',
    shifts: [makeShift(CNY_ID, 'demo-crew-kurt-stoneburner', '2026-03-07', '06:00', '06:00', '22:00', 'Geary stage')],
  }),
  makeProductionCrewMember(CNY_ID, 'demo-crew-chris-johnson', 'Asst Director', { department: 'Production' }),
  makeProductionCrewMember(CNY_ID, 'demo-crew-fred-tetzner', 'A1 — Audio', {
    department: 'Audio',
    shifts: [makeShift(CNY_ID, 'demo-crew-fred-tetzner', '2026-03-07', '07:00', '07:00', '22:00', 'Audio booth')],
  }),
  makeProductionCrewMember(CNY_ID, 'demo-crew-ac-hay', 'Lighting Asst', { department: 'Lighting' }),
  makeProductionCrewMember(CNY_ID, 'demo-crew-david-fortin', 'ENG Lead', { department: 'Engineering' }),
  makeProductionCrewMember(CNY_ID, 'demo-crew-dick-epting', 'Sat Truck', {
    department: 'Engineering',
    shifts: [
      makeShift(CNY_ID, 'demo-crew-dick-epting', '2026-03-06', '03:00', '03:00', '20:00', 'Geary exit'),
      makeShift(CNY_ID, 'demo-crew-dick-epting', '2026-03-07', '07:00', '07:00', '23:00', 'Geary exit'),
    ],
  }),
  makeProductionCrewMember(CNY_ID, 'demo-crew-ido-bartana', 'Sat Truck (relief)', { department: 'Engineering' }),
  makeProductionCrewMember(CNY_ID, 'demo-crew-eric-lanyon', 'IT / Network', { department: 'Engineering' }),
  makeProductionCrewMember(CNY_ID, 'demo-crew-cathy-cavey', 'CAM 1 — Hosts', {
    department: 'Camera',
    shifts: [makeShift(CNY_ID, 'demo-crew-cathy-cavey', '2026-03-07', '12:00', '12:00', '21:00', 'Geary stage')],
  }),
  makeProductionCrewMember(CNY_ID, 'demo-crew-khash-naraghi', 'CAM 4 — Jib', {
    department: 'Camera',
    shifts: [makeShift(CNY_ID, 'demo-crew-khash-naraghi', '2026-03-07', '04:00', '04:00', '21:00', 'Geary jib platform', 'Half-day prep prior week (Wed Mar 4).')],
  }),
  makeProductionCrewMember(CNY_ID, 'demo-crew-stefan-stifter', 'CAM 5 — Parade Handheld', {
    department: 'Camera',
    shifts: [makeShift(CNY_ID, 'demo-crew-stefan-stifter', '2026-03-07', '12:00', '12:00', '21:00', 'Parade route')],
  }),
  makeProductionCrewMember(CNY_ID, 'demo-crew-ric-dupont', 'CAM 6 — Union Sq Palm Tree', { department: 'Camera' }),
  makeProductionCrewMember(CNY_ID, 'demo-crew-mackenzie-stock', 'CAM 7 — Macy\u2019s', { department: 'Camera' }),
  makeProductionCrewMember(CNY_ID, 'demo-crew-paula-marcheschi', 'Creative Director', { department: 'Marketing' }),
  makeProductionCrewMember(CNY_ID, 'demo-crew-leonard-torres', 'Digital Marketing Producer', { department: 'Marketing' }),
  makeProductionCrewMember(CNY_ID, 'demo-crew-jeremy-stepp', 'Lead Graphic Designer', { department: 'Graphics' }),
  makeProductionCrewMember(CNY_ID, 'demo-crew-rick-rubin', 'CG / Lower-Thirds', { department: 'Graphics' }),
  makeProductionCrewMember(CNY_ID, 'demo-crew-dan-ashley', 'Anchor', {
    department: 'Talent',
    shifts: [makeShift(CNY_ID, 'demo-crew-dan-ashley', '2026-03-07', '13:00', '13:00', '21:00', 'Geary stage')],
  }),
  makeProductionCrewMember(CNY_ID, 'demo-crew-kristen-sze', 'Anchor', {
    department: 'Talent',
    shifts: [makeShift(CNY_ID, 'demo-crew-kristen-sze', '2026-03-07', '13:00', '13:00', '21:00', 'Geary stage')],
  }),
];

function pushCnySchedule(): CrewScheduleEntry[] {
  const entries: CrewScheduleEntry[] = [];
  // Friday Mar 6 — load-in / pre-set
  for (const memberContactId of ['demo-crew-ken-miguel', 'demo-crew-dick-epting', 'demo-crew-paula-marcheschi'] as const) {
    const member = cnyCrew.find((c) => c.contactId === memberContactId);
    if (!member) continue;
    entries.push(
      makeScheduleEntry(CNY_ID, member.id, memberContactId, '2026-03-06', '03:00', '20:00', member.role, 'Union Sq Garage / Geary', 'Sat truck arrival, stage set, cabling.'),
    );
  }
  // Saturday Mar 7 — show day
  const showDayCallTimes: Array<{ contactId: string; start: string; end: string; location?: string; notes?: string }> = [
    { contactId: 'demo-crew-ken-miguel', start: '07:00', end: '22:00', location: 'Geary site', notes: 'Onsite EP for the day.' },
    { contactId: 'demo-crew-dick-epting', start: '07:00', end: '23:00', location: 'Sat truck', notes: 'Inspection 9 AM with SFFD.' },
    { contactId: 'demo-crew-ido-bartana', start: '07:00', end: '23:00', location: 'Sat truck (relief)' },
    { contactId: 'demo-crew-fred-tetzner', start: '07:00', end: '22:00', location: 'Audio booth' },
    { contactId: 'demo-crew-david-fortin', start: '08:00', end: '21:00', location: 'TE / Comms' },
    { contactId: 'demo-crew-khash-naraghi', start: '04:00', end: '21:00', location: 'Geary jib', notes: 'Half-day prep Wed Mar 4.' },
    { contactId: 'demo-crew-cathy-cavey', start: '12:00', end: '21:00', location: 'Geary stage' },
    { contactId: 'demo-crew-stefan-stifter', start: '12:00', end: '21:00', location: 'Parade route' },
    { contactId: 'demo-crew-ric-dupont', start: '12:00', end: '21:00', location: 'Union Sq palm tree' },
    { contactId: 'demo-crew-mackenzie-stock', start: '12:00', end: '21:00', location: 'Macy\u2019s overview' },
    { contactId: 'demo-crew-kurt-stoneburner', start: '06:00', end: '22:00', location: 'Truck control' },
    { contactId: 'demo-crew-chris-johnson', start: '06:00', end: '22:00', location: 'Truck control' },
    { contactId: 'demo-crew-paula-marcheschi', start: '06:00', end: '22:00', location: 'Onsite' },
    { contactId: 'demo-crew-dan-ashley', start: '13:00', end: '21:00', location: 'Geary stage' },
    { contactId: 'demo-crew-kristen-sze', start: '13:00', end: '21:00', location: 'Geary stage' },
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
  name: 'SF Chinese New Year Parade 2026 — Year of the Horse',
  client: 'Chinese Chamber of Commerce / KGO-TV',
  location: 'Union Square — Geary @ Powell, San Francisco',
  startDate: '2026-03-06',
  endDate: '2026-03-07',
  scheduleDefaultStartTime: '07:00',
  scheduleDefaultEndTime: '22:00',
  status: 'confirmed',
  description:
    'Annual nighttime illuminated parade. Live broadcast 5\u20136 PM (digital), 6\u20138 PM (linear 7.1), with KTSF feed and Pier 32 drone show finale. Stage: Primed Productions 20\u00d720\u00d718.',
  checklistGroups: cnyChecklists,
  vehiclePacklists: cnyVehicles,
  crew: cnyCrew,
  crewSchedule: pushCnySchedule(),
  notes:
    'Permit window: 5 AM Fri 3/6 \u2192 11 PM Sat 3/7. Coordinate with Union Sq Alliance + LAZ Parking on garage closure. Drone show contact: Devastating Pyro (Pier 32 lock combo on file).',
  createdAt: '2026-02-01T12:00:00.000Z',
  updatedAt: '2026-02-01T12:00:00.000Z',
};

// =============================================================================
// Production 5 — SF Pride Parade 2026 ("Resistance in Action")
// =============================================================================

const PRIDE_ID = 'demo-prod-sf-pride-2026';

const prideChecklists: ChecklistGroup[] = [
  makeChecklistGroup(PRIDE_ID, 'cameras', 'Cameras (10)', [
    makeChecklistItem(PRIDE_ID, 'cameras', 1, 'CAM 1 — Main Talent (Cathy Cavey)'),
    makeChecklistItem(PRIDE_ID, 'cameras', 2, 'CAM 2 — Main Talent Wide (unmanned backup)'),
    makeChecklistItem(PRIDE_ID, 'cameras', 3, 'CAM 3 — Parade Interviews (Drew Tuma / Jackie Sissel)', { inventoryItemId: 'demo-inv-rf-tx-rx-pair', quantity: 1 }),
    makeChecklistItem(PRIDE_ID, 'cameras', 4, 'CAM 4 — Parade (Edward Gonzalez)'),
    makeChecklistItem(PRIDE_ID, 'cameras', 5, 'CAM 5 — Jib (Khash Naraghi)', { inventoryItemId: 'demo-inv-canon-cn-e30-105', quantity: 1 }),
    makeChecklistItem(PRIDE_ID, 'cameras', 6, 'CAM 6 — Sponsors (Zach Fuentes / Stefan Stifter)'),
    makeChecklistItem(PRIDE_ID, 'cameras', 7, 'CAM 7 — Main Stage (Stephanie Sierra / Alex Gray)'),
    makeChecklistItem(PRIDE_ID, 'cameras', 8, 'CAM 8 — Main Stage Feed'),
    makeChecklistItem(PRIDE_ID, 'cameras', 9, 'CAM 9 — Sky 7 (weather permitting, pool 10:15\u201311:50 AM)'),
    makeChecklistItem(PRIDE_ID, 'cameras', 10, 'CAM 10 — Overview (525 Market Street)'),
  ]),
  makeChecklistGroup(PRIDE_ID, 'audio', 'Audio Kit', [
    makeChecklistItem(PRIDE_ID, 'audio', 1, 'Shure Axient AD2 wireless handhelds (hosts)', { quantity: 6, inventoryItemId: 'demo-inv-shure-axient-mics' }),
    makeChecklistItem(PRIDE_ID, 'audio', 2, 'Comtek PR-216 IFB receivers', { quantity: 6, inventoryItemId: 'demo-inv-comtek-pr216' }),
    makeChecklistItem(PRIDE_ID, 'audio', 3, 'Canare 24-pair stagebox', { quantity: 1, inventoryItemId: 'demo-inv-canare-stagebox' }),
    makeChecklistItem(PRIDE_ID, 'audio', 4, 'RTS BTR-800 crew comms', { quantity: 14, inventoryItemId: 'demo-inv-rf-headset-pair' }),
  ]),
  makeChecklistGroup(PRIDE_ID, 'transmission', 'Transmission & RF', [
    makeChecklistItem(PRIDE_ID, 'transmission', 1, 'Primary: Dejero via Monkey Brains IP', { quantity: 1, inventoryItemId: 'demo-inv-dejero-cellsat' }),
    makeChecklistItem(PRIDE_ID, 'transmission', 2, 'Redundancy: Sat Truck (Epting / Bartana)'),
    makeChecklistItem(PRIDE_ID, 'transmission', 3, 'ABCNL liveshots feed (11:25, 12:25 hits)'),
  ]),
  makeChecklistGroup(PRIDE_ID, 'cabling', 'Cabling & Power', [
    makeChecklistItem(PRIDE_ID, 'cabling', 1, 'Belden 1855a SDI spools', { quantity: 4, inventoryItemId: 'demo-inv-belden-1855a' }),
    makeChecklistItem(PRIDE_ID, 'cabling', 2, 'Tactical fiber 300ft (Civic Center return)', { quantity: 2, inventoryItemId: 'demo-inv-fiber-armored-300' }),
    makeChecklistItem(PRIDE_ID, 'cabling', 3, 'Honda EU7000iS generators', { quantity: 2, inventoryItemId: 'demo-inv-honda-eu7000' }),
  ]),
];

const prideVehicles: VehiclePacklist[] = [
  makeVehiclePacklist(
    PRIDE_ID,
    'sat-truck',
    'Sat Truck — Market / Sansome Homebase',
    [
      makeVehicleSection(PRIDE_ID, 'tx', 'Transmission & RF', prideChecklists[2].id, [
        makeChecklistItem(PRIDE_ID, 'tx-veh', 1, 'Dejero CellSat', { quantity: 1, inventoryItemId: 'demo-inv-dejero-cellsat' }),
      ]),
      makeVehicleSection(PRIDE_ID, 'audio-truck', 'Audio Kit', prideChecklists[1].id, [
        makeChecklistItem(PRIDE_ID, 'audio-veh', 1, 'Shure Axient', { quantity: 6, inventoryItemId: 'demo-inv-shure-axient-mics' }),
      ]),
    ],
  ),
  makeVehiclePacklist(
    PRIDE_ID,
    'sub-truck',
    'Sub Truck — Howard / Spear (Cam 6 + sponsors)',
    [
      makeVehicleSection(PRIDE_ID, 'cam6', 'Cam 6 / Sponsors', undefined, [
        makeChecklistItem(PRIDE_ID, 'cam6-veh', 1, 'Bolt 6 LT 1500 RF kit', { quantity: 1, inventoryItemId: 'demo-inv-rf-tx-rx-pair' }),
      ]),
    ],
  ),
];

const prideCrew: ProductionCrewMember[] = [
  makeProductionCrewMember(PRIDE_ID, 'demo-crew-justin-prochaska', 'Line Producer', {
    department: 'Production',
    shifts: [makeShift(PRIDE_ID, 'demo-crew-justin-prochaska', '2026-06-28', '06:00', '06:00', '16:00', 'Market/Sansome homebase')],
  }),
  makeProductionCrewMember(PRIDE_ID, 'demo-crew-ken-miguel', 'Onsite EP', {
    department: 'Production',
    shifts: [makeShift(PRIDE_ID, 'demo-crew-ken-miguel', '2026-06-28', '06:00', '06:00', '16:00', 'Market/Sansome homebase')],
  }),
  makeProductionCrewMember(PRIDE_ID, 'demo-crew-mark-stephens', 'In-house EP', { department: 'Production' }),
  makeProductionCrewMember(PRIDE_ID, 'demo-crew-kurt-stoneburner', 'Director', {
    department: 'Production',
    shifts: [makeShift(PRIDE_ID, 'demo-crew-kurt-stoneburner', '2026-06-28', '06:00', '06:00', '15:00', 'Truck control')],
  }),
  makeProductionCrewMember(PRIDE_ID, 'demo-crew-chris-johnson', 'Director 2 (commercials/snipes)', { department: 'Production' }),
  makeProductionCrewMember(PRIDE_ID, 'demo-crew-kathryn-fischer', 'Stage Manager', {
    department: 'Production',
    shifts: [makeShift(PRIDE_ID, 'demo-crew-kathryn-fischer', '2026-06-28', '06:00', '06:00', '15:00', 'Market/Sansome homebase')],
  }),
  makeProductionCrewMember(PRIDE_ID, 'demo-crew-paula-marcheschi', 'Creative Director', { department: 'Marketing' }),
  makeProductionCrewMember(PRIDE_ID, 'demo-crew-fred-tetzner', 'A1 — Audio', { department: 'Audio' }),
  makeProductionCrewMember(PRIDE_ID, 'demo-crew-richard-healy', 'A1 — Audio (relief)', { department: 'Audio' }),
  makeProductionCrewMember(PRIDE_ID, 'demo-crew-ac-hay', 'Lighting / IT support', { department: 'Lighting' }),
  makeProductionCrewMember(PRIDE_ID, 'demo-crew-eric-lanyon', 'IT / Network', { department: 'Engineering' }),
  makeProductionCrewMember(PRIDE_ID, 'demo-crew-david-figura', 'IT / Network (relief)', { department: 'Engineering' }),
  makeProductionCrewMember(PRIDE_ID, 'demo-crew-felice-gandolfo', 'Transmission', {
    department: 'Engineering',
    shifts: [makeShift(PRIDE_ID, 'demo-crew-felice-gandolfo', '2026-06-28', '05:00', '05:00', '16:00', 'Sat truck')],
  }),
  makeProductionCrewMember(PRIDE_ID, 'demo-crew-dick-epting', 'Sat Truck', {
    department: 'Engineering',
    shifts: [makeShift(PRIDE_ID, 'demo-crew-dick-epting', '2026-06-28', '04:00', '04:00', '16:00', 'Sat truck')],
  }),
  makeProductionCrewMember(PRIDE_ID, 'demo-crew-ido-bartana', 'Sat Truck (relief / roving)', { department: 'Engineering' }),
  makeProductionCrewMember(PRIDE_ID, 'demo-crew-cathy-cavey', 'CAM 1 — Stage', {
    department: 'Camera',
    shifts: [makeShift(PRIDE_ID, 'demo-crew-cathy-cavey', '2026-06-28', '08:00', '08:00', '16:00', 'Market/Sansome stage')],
  }),
  makeProductionCrewMember(PRIDE_ID, 'demo-crew-edward-gonzalez', 'CAM 4 — Roving', {
    department: 'Camera',
    shifts: [makeShift(PRIDE_ID, 'demo-crew-edward-gonzalez', '2026-06-28', '08:00', '08:00', '16:00', 'Parade route')],
  }),
  makeProductionCrewMember(PRIDE_ID, 'demo-crew-scott-arthur', 'Roving (relief)', {
    department: 'Camera',
    shifts: [makeShift(PRIDE_ID, 'demo-crew-scott-arthur', '2026-06-28', '08:00', '08:00', '16:00', 'Parade route')],
  }),
  makeProductionCrewMember(PRIDE_ID, 'demo-crew-stefan-stifter', 'CAM 6 — Sponsors / Rotating', {
    department: 'Camera',
    shifts: [makeShift(PRIDE_ID, 'demo-crew-stefan-stifter', '2026-06-28', '08:00', '08:00', '16:00', 'Howard/Spear (SOMA)', 'If Stifter cannot work, Ric Dupont swaps in.')],
  }),
  makeProductionCrewMember(PRIDE_ID, 'demo-crew-khash-naraghi', 'CAM 5 — Jib', {
    department: 'Camera',
    shifts: [makeShift(PRIDE_ID, 'demo-crew-khash-naraghi', '2026-06-28', '04:00', '04:00', '16:00', 'Market/Sansome', 'Half-day prep prior week (Wed Jun 24).')],
  }),
  makeProductionCrewMember(PRIDE_ID, 'demo-crew-stephanie-sierra', 'Civic Center Stage', {
    department: 'Talent',
    shifts: [makeShift(PRIDE_ID, 'demo-crew-stephanie-sierra', '2026-06-28', '09:00', '09:30', '15:00', 'Civic Center')],
  }),
  makeProductionCrewMember(PRIDE_ID, 'demo-crew-reggie-aqui', 'Lead Anchor', {
    department: 'Talent',
    shifts: [makeShift(PRIDE_ID, 'demo-crew-reggie-aqui', '2026-06-28', '09:15', '09:15', '15:00', 'Market/Sansome stage')],
  }),
  makeProductionCrewMember(PRIDE_ID, 'demo-crew-drew-tuma', 'Parade Reporter (street)', {
    department: 'Talent',
    shifts: [makeShift(PRIDE_ID, 'demo-crew-drew-tuma', '2026-06-28', '09:15', '09:15', '15:00', 'Parade route')],
  }),
  makeProductionCrewMember(PRIDE_ID, 'demo-crew-pearl-teese', 'Community Host', { department: 'Talent' }),
  makeProductionCrewMember(PRIDE_ID, 'demo-crew-carolyn-wysinger', 'Community Host', { department: 'Talent' }),
  makeProductionCrewMember(PRIDE_ID, 'demo-crew-ngyuen-pham', 'Community Host', { department: 'Talent' }),
  makeProductionCrewMember(PRIDE_ID, 'demo-crew-zach-fuentes', 'Sponsor Reporter / Anchor relief', { department: 'Talent' }),
];

function buildPrideSchedule(): CrewScheduleEntry[] {
  const entries: CrewScheduleEntry[] = [];
  // Pre-week prep (Wed Jun 24 — sat truck prep)
  for (const memberContactId of ['demo-crew-ido-bartana', 'demo-crew-dick-epting'] as const) {
    const member = prideCrew.find((c) => c.contactId === memberContactId);
    if (!member) continue;
    entries.push(
      makeScheduleEntry(PRIDE_ID, member.id, memberContactId, '2026-06-24', '09:00', '17:00', 'Sat truck prep', 'KGO yard', 'Wed-Fri prep with Dick.'),
      makeScheduleEntry(PRIDE_ID, member.id, memberContactId, '2026-06-25', '09:00', '17:00', 'Sat truck prep', 'KGO yard'),
      makeScheduleEntry(PRIDE_ID, member.id, memberContactId, '2026-06-26', '09:00', '17:00', 'Sat truck prep', 'KGO yard'),
    );
  }
  // Show day Sun Jun 28
  const showDayCallTimes: Array<{ contactId: string; start: string; end: string; location?: string; notes?: string }> = [
    { contactId: 'demo-crew-justin-prochaska', start: '06:00', end: '16:00', location: 'Market/Sansome homebase' },
    { contactId: 'demo-crew-ken-miguel', start: '06:00', end: '16:00', location: 'Market/Sansome homebase' },
    { contactId: 'demo-crew-kurt-stoneburner', start: '06:00', end: '15:00', location: 'Truck control' },
    { contactId: 'demo-crew-kathryn-fischer', start: '06:00', end: '15:00', location: 'Market/Sansome homebase' },
    { contactId: 'demo-crew-felice-gandolfo', start: '05:00', end: '16:00', location: 'Sat truck' },
    { contactId: 'demo-crew-dick-epting', start: '04:00', end: '16:00', location: 'Sat truck' },
    { contactId: 'demo-crew-khash-naraghi', start: '04:00', end: '16:00', location: 'Market/Sansome' },
    { contactId: 'demo-crew-cathy-cavey', start: '08:00', end: '16:00', location: 'Market/Sansome stage' },
    { contactId: 'demo-crew-edward-gonzalez', start: '08:00', end: '16:00', location: 'Parade route' },
    { contactId: 'demo-crew-scott-arthur', start: '08:00', end: '16:00', location: 'Parade route' },
    { contactId: 'demo-crew-stefan-stifter', start: '08:00', end: '16:00', location: 'Howard/Spear (SOMA)' },
    { contactId: 'demo-crew-stephanie-sierra', start: '09:30', end: '15:00', location: 'Civic Center' },
    { contactId: 'demo-crew-reggie-aqui', start: '09:15', end: '15:00', location: 'Market/Sansome stage' },
    { contactId: 'demo-crew-drew-tuma', start: '09:15', end: '15:00', location: 'Parade route' },
    { contactId: 'demo-crew-pearl-teese', start: '09:30', end: '14:30', location: 'Market/Sansome stage' },
    { contactId: 'demo-crew-carolyn-wysinger', start: '09:30', end: '14:30', location: 'Market/Sansome stage' },
    { contactId: 'demo-crew-ngyuen-pham', start: '09:30', end: '14:30', location: 'Market/Sansome stage' },
    { contactId: 'demo-crew-zach-fuentes', start: '09:00', end: '15:00', location: 'Staging area' },
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
  name: 'SF Pride Parade 2026 — "Resistance in Action"',
  client: 'SF Pride / KGO-TV',
  location: 'Market & Sansome — Civic Center Plaza, San Francisco',
  startDate: '2026-06-24',
  endDate: '2026-06-28',
  scheduleDefaultStartTime: '08:00',
  scheduleDefaultEndTime: '15:00',
  status: 'planning',
  description:
    '56th Annual SF Pride Parade & Celebration. Live coverage on 7.1 from 10:30 AM \u2013 2:30 PM with 4 internal breaks. Anchors: Reggie Aqui + 3 community hosts. Civic Center cam, sky 7 weather permitting, sat truck redundancy, Dejero via Monkey Brains primary.',
  checklistGroups: prideChecklists,
  vehiclePacklists: prideVehicles,
  crew: prideCrew,
  crewSchedule: buildPrideSchedule(),
  notes:
    'Onsite evac route: Sutter & Montgomery (police command center). Emergency anchor plan: Gloria Rodriguez + JR Stone on standby; PC2 retains broadcast. Backup anchor from Tricaster if needed.',
  createdAt: '2026-02-01T12:00:00.000Z',
  updatedAt: '2026-02-01T12:00:00.000Z',
};

// =============================================================================
// Public exports
// =============================================================================

export interface DemoSeedSourceData {
  inventory: InventoryItem[];
  productions: Array<Omit<Production, '__demoSeed'>>;
  crewContacts: Array<Omit<CrewContact, '__demoSeed'>>;
  positionTemplates: Array<Omit<PositionTemplate, '__demoSeed'>>;
  lookups: {
    categories: CategoryNode[];
    units: ItemWithSubcategories[];
    locations: ItemWithSubcategories[];
    suppliers: ItemWithSubcategories[];
    projects: ItemWithSubcategories[];
  };
}

export const DEMO_SEED_SOURCE: DemoSeedSourceData = {
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
