import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let browserClient: SupabaseClient | null = null;
let warnedInvalidSupabaseHost = false;

function warnInvalidSupabaseHostOnce(message: string) {
  if (warnedInvalidSupabaseHost) return;
  warnedInvalidSupabaseHost = true;
  console.error(message);
}

/** Supabase-js requires http(s) URL; env is often pasted as `xxxx.supabase.co` without a scheme. */
export function normalizeSupabaseUrl(raw: string | undefined): string | null {
  const t = raw?.trim();
  if (!t) return null;
  const unquoted = t.replace(/^['"]+|['"]+$/g, '').trim();
  const candidate = /^https?:\/\//i.test(unquoted) ? unquoted : `https://${unquoted}`;
  try {
    const u = new URL(candidate);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    const host = u.hostname.toLowerCase();
    // Common Vercel mistake: put publishable/anon key in VITE_SUPABASE_URL → requests to https://sb_publishable_.../ which cannot resolve.
    if (host.startsWith('sb_publishable_') || host.startsWith('sb_secret_')) {
      warnInvalidSupabaseHostOnce(
        '[trackIT] VITE_SUPABASE_URL must be the Project URL (e.g. https://YOUR_REF.supabase.co from Supabase → Project Settings → API), not the publishable or secret key. Fix Vercel env vars and redeploy.'
      );
      return null;
    }
    if (!host.includes('.')) {
      warnInvalidSupabaseHostOnce(
        '[trackIT] VITE_SUPABASE_URL hostname is not a real domain. Use https://YOUR_REF.supabase.co'
      );
      return null;
    }
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

export function getSupabaseConfigDiagnostics(): {
  isConfigured: boolean;
  rawUrlPresent: boolean;
  normalizedUrl: string | null;
  anonKeyPresent: boolean;
} {
  const rawUrl = import.meta.env.VITE_SUPABASE_URL;
  const normalizedUrl = normalizeSupabaseUrl(rawUrl);
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();
  return {
    isConfigured: Boolean(normalizedUrl && anonKey),
    rawUrlPresent: Boolean(rawUrl?.trim()),
    normalizedUrl,
    anonKeyPresent: Boolean(anonKey),
  };
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
