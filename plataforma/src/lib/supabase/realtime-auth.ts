import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Mantiene el JWT del socket de Realtime sincronizado con la sesión.
 *
 * `realtime.setAuth()` fija el token que Realtime usa para evaluar las
 * policies RLS de `postgres_changes`. Si solo se llama una vez al montar
 * (como se hacía antes), el token queda caduco a la hora (jwt_expiry=3600
 * en supabase/config.toml): supabase-js refresca la sesión en segundo
 * plano, pero eso NO reautentica el socket de Realtime solo. El canal
 * sigue "SUBSCRIBED" pero las policies dejan de autorizar filas — no
 * llega nada más, sin error visible, hasta recargar la página.
 *
 * onAuthStateChange entrega el token inicial (evento INITIAL_SESSION) y
 * cada refresco posterior (TOKEN_REFRESHED), así que también reemplaza
 * el getSession() manual que se hacía antes de suscribirse.
 */
export function syncRealtimeAuth(supabase: SupabaseClient): {
  ready: Promise<void>;
  stop: () => void;
} {
  let resolveReady: () => void;
  const ready = new Promise<void>((res) => { resolveReady = res; });
  const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
    supabase.realtime.setAuth(session?.access_token ?? null);
    resolveReady();
  });
  return { ready, stop: () => subscription.unsubscribe() };
}
