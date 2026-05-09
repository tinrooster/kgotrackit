/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  /** Demo seed bundle: `internal` (full detail) or default `public` (anonymized). */
  readonly VITE_DEMO_SEED_PROFILE?: 'internal' | 'public';
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare const __APP_VERSION__: string;
