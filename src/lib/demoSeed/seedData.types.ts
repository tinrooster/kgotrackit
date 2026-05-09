import type { CategoryNode, InventoryItem, ItemWithSubcategories } from '@/types/inventory';
import type { PositionTemplate, Production } from '@/types/productions';
import type { CrewContact } from '@/types/crewContacts';

/** Shape shared by `seedData.internal.ts` and `seedData.public.ts`. */
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

/** Which static bundle `seedData.ts` resolves to (via `VITE_DEMO_SEED_PROFILE`). */
export type DemoSeedProfile = 'internal' | 'public';
