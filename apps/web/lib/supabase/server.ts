import { createServerClient } from '@supabase/ssr';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { requireSupabaseConfig, supabaseConfig } from './config';

/**
 * Supabase as the signed-in user, from their session cookies. Everything it
 * does goes through row-level security as that person.
 */
export async function supabaseServer(): Promise<SupabaseClient> {
  const { url, publishableKey } = requireSupabaseConfig();
  const store = await cookies();
  return createServerClient(url, publishableKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          // Server components can't set cookies; the middleware refreshes the session instead.
        }
      },
    },
  });
}

/**
 * Supabase with the server's secret key, which bypasses row-level security.
 * Used only to send staff invitations (Supabase Auth's admin API). Never
 * import this into a client component, and never use it to read data.
 */
export function supabaseAdmin(): SupabaseClient | null {
  const config = supabaseConfig();
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!config || !secret) return null;
  return createClient(config.url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** This site's address, for links in emails (invitations, password resets). */
export function siteUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return configured.replace(/\/$/, '');
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return 'http://localhost:3000';
}
