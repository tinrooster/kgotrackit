export {
  DEMO_SEED_VERSION,
  DEMO_SEED_FIELD,
  fingerprintEntity,
  isDemoEntity,
  isDemoEntityUnmodified,
  type DemoEntityKind,
} from './fingerprint';

export {
  DEMO_SEED_MANIFEST_STORAGE_KEY,
  type DemoSeedLookupSnapshot,
  type DemoSeedManifest,
  clearDemoSeedManifest,
  getDemoSeedManifest,
  recordManifestForWorkspace,
  saveDemoSeedManifest,
} from './manifest';

export {
  DEMO_SEED_PROFILE,
  DEMO_SEED_SOURCE,
  DEMO_SEED_SOURCE_INTERNAL,
  DEMO_SEED_SOURCE_PUBLIC,
  type DemoSeedProfile,
  type DemoSeedSourceData,
} from './seedData';

export {
  populateDemoData,
  replaceProductionsWithInternalDemoSeed,
  type PopulateDemoDataOptions,
  type PopulateDemoDataResult,
} from './populate';

export {
  stripDemoData,
  summarizeDemoPresence,
  type StripDemoMode,
  type StripDemoDataResult,
  type DemoPresenceSummary,
} from './strip';
