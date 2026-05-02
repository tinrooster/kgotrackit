import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let browserClient: SupabaseClient | null = null;

/** Supabase-js requires http(s) URL; env is often pasted as `xxxx.supabase.co` without a scheme. */
export function normalizeSupabaseUrl(raw: string | undefined): string | null {
  const t = raw?.trim();
  if (!t) return null;
  const candidate = /^https?:\/\//i.test(t) ? t : `https://${t}`;
  try {
    const u = new URL(candidate);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.origin;
  } catch {
    return null;
  }
}

export function isSupabaseConfigured(): boolean {
  const url = normalizeSupabaseUrl(import.meta.env.VITE_SUPABASE_URL);
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();
  return Boolean(url && key);
}

export function getSupabase(): SupabaseClient | null {
  const url = normalizeSupabaseUrl(import.meta.env.VITE_SUPABASE_URL);
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();
  if (!url || !key) {
    return null;
  }
  if (!browserClient) {
    browserClient = createClient(url, key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }
  return browserClient;
}
