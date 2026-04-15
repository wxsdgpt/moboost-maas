/**
 * Supabase client singletons.
 *
 * Two flavors:
 *   - `supabaseService` — uses SUPABASE_SERVICE_ROLE_KEY, bypasses RLS.
 *     Server-only.  NEVER import this from a client component.
 *   - `supabaseAnon`    — uses NEXT_PUBLIC_SUPABASE_ANON_KEY.  Safe in
 *     the browser, subject to RLS policies.
 *
 * Phase 1 only uses the service client (all DB writes happen in route
 * handlers or server components), so `supabaseAnon` is exported for
 * future use but not wired in yet.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

let _service: SupabaseClient | null = null
let _anon: SupabaseClient | null = null

/** Server-only admin client.  Throws if env is missing. */
export function supabaseService(): SupabaseClient {
  if (_service) return _service
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    throw new Error(
      '[db] Missing Supabase env: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY',
    )
  }
  _service = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { 'x-moboost-client': 'server-service' } },
  })
  return _service
}

/** Public anon client.  Safe to use in browser (respects RLS). */
export function supabaseAnon(): SupabaseClient {
  if (_anon) return _anon
  if (!SUPABASE_URL || !ANON_KEY) {
    throw new Error(
      '[db] Missing Supabase env: NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY',
    )
  }
  _anon = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { 'x-moboost-client': 'anon' } },
  })
  return _anon
}
