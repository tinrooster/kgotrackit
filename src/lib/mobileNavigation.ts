export const MOBILE_NAV_ITEM_IDS = [
  'home',
  'inventory',
  'checkout',
  'fieldChecklist',
  'fleet',
  'productions',
  'plant',
  'reports',
  'settings',
  'help',
  'about',
  'dev',
] as const;

export type MobileNavItemId = (typeof MOBILE_NAV_ITEM_IDS)[number];

export interface MobileNavItemConfig {
  id: MobileNavItemId;
  label: string;
  shortLabel: string;
  path: string;
  activeBasePath?: string;
  adminOnly?: boolean;
}

export const DEFAULT_MOBILE_BOTTOM_NAV_IDS: MobileNavItemId[] = [
  'home',
  'inventory',
  'checkout',
  'fieldChecklist',
  'fleet',
];

export const MOBILE_NAV_ITEMS: MobileNavItemConfig[] = [
  { id: 'home', label: 'Dashboard', shortLabel: 'Home', path: '/' },
  { id: 'inventory', label: 'Inventory', shortLabel: 'Inventory', path: '/inventory' },
  { id: 'checkout', label: 'Check-In/Out', shortLabel: 'Checkout', path: '/checkout' },
  { id: 'fieldChecklist', label: 'Field Checklist', shortLabel: 'Field', path: '/field-checklist' },
  { id: 'fleet', label: 'Fleet', shortLabel: 'Fleet', path: '/fleet', activeBasePath: '/fleet' },
  { id: 'productions', label: 'Productions', shortLabel: 'Productions', path: '/productions', activeBasePath: '/productions' },
  { id: 'plant', label: 'Plant', shortLabel: 'Plant', path: '/plant', activeBasePath: '/plant' },
  { id: 'reports', label: 'Reports', shortLabel: 'Reports', path: '/reports' },
  { id: 'settings', label: 'Settings', shortLabel: 'Settings', path: '/settings', activeBasePath: '/settings' },
  { id: 'help', label: 'Help', shortLabel: 'Help', path: '/help' },
  { id: 'about', label: 'About', shortLabel: 'About', path: '/about' },
  { id: 'dev', label: 'Dev', shortLabel: 'Dev', path: '/dev', adminOnly: true },
];

const mobileNavItemIds = new Set<string>(MOBILE_NAV_ITEM_IDS);

export function normalizeMobileBottomNavIds(value: unknown): MobileNavItemId[] {
  if (!Array.isArray(value)) {
    return [...DEFAULT_MOBILE_BOTTOM_NAV_IDS];
  }

  const ids: MobileNavItemId[] = [];
  for (const item of value) {
    if (typeof item !== 'string' || !mobileNavItemIds.has(item) || ids.includes(item as MobileNavItemId)) {
      continue;
    }
    ids.push(item as MobileNavItemId);
    if (ids.length === 5) {
      break;
    }
  }

  return ids.length > 0 ? ids : [...DEFAULT_MOBILE_BOTTOM_NAV_IDS];
}

export function getMobileNavItems(ids: MobileNavItemId[]): MobileNavItemConfig[] {
  return ids
    .map((id) => MOBILE_NAV_ITEMS.find((item) => item.id === id))
    .filter((item): item is MobileNavItemConfig => Boolean(item));
}
