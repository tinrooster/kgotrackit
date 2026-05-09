import type { DemoSeedProfile, DemoSeedSourceData } from './seedData.types';

import { DEMO_SEED_SOURCE_INTERNAL } from './seedData.internal';
import { DEMO_SEED_SOURCE_PUBLIC } from './seedData.public';

export type { DemoSeedProfile, DemoSeedSourceData } from './seedData.types';

/** Resolved from `import.meta.env.VITE_DEMO_SEED_PROFILE`. Defaults to `public` (safe for customer builds). */
export const DEMO_SEED_PROFILE: DemoSeedProfile =
  import.meta.env.VITE_DEMO_SEED_PROFILE === 'internal' ? 'internal' : 'public';

/** Single resolved bundle — use this everywhere demo seed content is consumed. */
export const DEMO_SEED_SOURCE: DemoSeedSourceData =
  DEMO_SEED_PROFILE === 'internal' ? DEMO_SEED_SOURCE_INTERNAL : DEMO_SEED_SOURCE_PUBLIC;

export { DEMO_SEED_SOURCE_INTERNAL, DEMO_SEED_SOURCE_PUBLIC };
