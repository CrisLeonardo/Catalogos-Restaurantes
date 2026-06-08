import { createBrowserClient } from "@supabase/ssr";

/**
 * Cliente Supabase para el NAVEGADOR (Client Components, Realtime).
 * Usa solo la clave pública `anon` — protegida por RLS.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
