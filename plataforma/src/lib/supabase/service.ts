import { createClient } from '@supabase/supabase-js';

/**
 * Cliente Supabase con service_role — bypasa RLS.
 * SOLO usar en Server Actions / Route Handlers del servidor.
 * Nunca exponer al cliente.
 */
export function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { autoRefreshToken: false, persistSession: false },
      // Next.js 16 cachea los GET de PostgREST en el Data Cache, lo que hacía
      // que el panel del Super Admin leyera datos viejos (p.ej. el editor de
      // tema mostraba defaults tras guardar). El admin debe leer SIEMPRE fresco.
      global: {
        fetch: (input: RequestInfo | URL, init?: RequestInit) =>
          fetch(input, { ...init, cache: 'no-store' }),
      },
    },
  );
}
