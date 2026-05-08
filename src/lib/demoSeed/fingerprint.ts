/**
 * Deterministic content fingerprinting for demo-seeded entities.
 *
 * Used by `populate.ts` to stamp every demo entity with a stable hash of its
 * original content, and by `strip.ts` to determine whether an entity is still
 * "unmodified" (current stable hash matches stamped fingerprint) versus
 * "user-modified" (hash drift). All hashing is sync, dependency-free, and
 * stable across browser sessions and Node-based tests.
 */

/** Seed schema version. Bump when seed shapes change in a way that would invalidate fingerprints. */
export const DEMO_SEED_VERSION = 'v1';

/** Field on every demo entity carrying the seed metadata. */
export const DEMO_SEED_FIELD = '__demoSeed' as const;

/**
 * Fields that we consider "transient" or runtime-mutated and therefore exclude
 * from fingerprint computation. Hitting any of these should NOT count as user
 * modification for the strip-unmodified path.
 */
const FINGERPRINT_EXCLUDE_FIELDS: ReadonlySet<string> = new Set([
  '__demoSeed',
  // Universal mutable timestamps — re-applied on every save by storage layers.
  'lastUpdated',
  'updatedAt',
]);

/**
 * Inventory-specific fields that are runtime-only side effects of save/load
 * pipelines and should not count as user edits. Any *value* change (qty,
 * notes, price, location, etc.) DOES count and breaks the fingerprint.
 */
const INVENTORY_TRANSIENT_FIELDS: ReadonlySet<string> = new Set([
  ...FINGERPRINT_EXCLUDE_FIELDS,
]);

/**
 * Production-specific fields excluded from fingerprint. We deliberately
 * INCLUDE `reservedQuantity` / `checkedOutQuantity` so that any checkout or
 * reserve activity on a demo production "promotes" it to user data and
 * protects it from strip-unmodified — per the agreed design.
 */
const PRODUCTION_TRANSIENT_FIELDS: ReadonlySet<string> = new Set([
  ...FINGERPRINT_EXCLUDE_FIELDS,
]);

const CREW_CONTACT_TRANSIENT_FIELDS: ReadonlySet<string> = new Set([
  ...FINGERPRINT_EXCLUDE_FIELDS,
  'createdAt',
]);

const POSITION_TEMPLATE_TRANSIENT_FIELDS: ReadonlySet<string> = new Set([
  ...FINGERPRINT_EXCLUDE_FIELDS,
]);

export type DemoEntityKind = 'inventory' | 'production' | 'crewContact' | 'positionTemplate';

const TRANSIENT_FIELDS_BY_KIND: Record<DemoEntityKind, ReadonlySet<string>> = {
  inventory: INVENTORY_TRANSIENT_FIELDS,
  production: PRODUCTION_TRANSIENT_FIELDS,
  crewContact: CREW_CONTACT_TRANSIENT_FIELDS,
  positionTemplate: POSITION_TEMPLATE_TRANSIENT_FIELDS,
};

/**
 * FNV-1a 32-bit hash. Sufficient as a tamper-detection fingerprint (we are
 * only guarding against accidental edits, not adversarial collisions).
 */
function fnv1a32(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/**
 * Recursively rebuild an object/array with sorted keys and excluded fields
 * removed, so that JSON.stringify produces a deterministic input for hashing.
 */
function canonicalize(value: unknown, excludedFields: ReadonlySet<string>): unknown {
  if (value === null || value === undefined) {
    return null;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => canonicalize(entry, excludedFields));
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === 'object') {
    const source = value as Record<string, unknown>;
    const sortedKeys = Object.keys(source)
      .filter((key) => !excludedFields.has(key))
      .sort();
    const out: Record<string, unknown> = {};
    for (const key of sortedKeys) {
      const child = source[key];
      if (child === undefined) continue;
      out[key] = canonicalize(child, excludedFields);
    }
    return out;
  }
  if (typeof value === 'number' && !Number.isFinite(value)) {
    return null;
  }
  return value;
}

/**
 * Compute a deterministic fingerprint string for the given entity content.
 * The same logical content always yields the same fingerprint regardless of
 * key ordering, transient timestamp values, or runtime mutations such as
 * `__demoSeed` itself.
 */
export function fingerprintEntity(entity: unknown, kind: DemoEntityKind): string {
  const excluded = TRANSIENT_FIELDS_BY_KIND[kind];
  const canonical = canonicalize(entity, excluded);
  return fnv1a32(JSON.stringify(canonical));
}

/**
 * Returns true when the entity is a demo entity AND the current stable
 * content still matches the stamped fingerprint (i.e. unmodified by the user).
 */
export function isDemoEntityUnmodified(entity: unknown, kind: DemoEntityKind): boolean {
  if (!entity || typeof entity !== 'object') return false;
  const stamp = (entity as Record<string, unknown>)[DEMO_SEED_FIELD] as
    | { version?: string; fingerprint?: string }
    | undefined;
  if (!stamp || typeof stamp.fingerprint !== 'string') return false;
  if (stamp.version !== DEMO_SEED_VERSION) {
    // Different seed schema — treat as modified to be safe (user could have
    // hand-edited or migrated). Strip-all still removes it via the version-agnostic flag.
    return false;
  }
  return fingerprintEntity(entity, kind) === stamp.fingerprint;
}

/**
 * Returns true if the entity carries any demo seed marker, regardless of
 * version or modification state. Used by strip-all.
 */
export function isDemoEntity(entity: unknown): boolean {
  if (!entity || typeof entity !== 'object') return false;
  return Boolean((entity as Record<string, unknown>)[DEMO_SEED_FIELD]);
}
