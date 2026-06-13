-- ============================================================
-- 015 · Cierra la RLS de push_subscriptions
-- ------------------------------------------------------------
-- La migración 014 creó la política:
--     create policy "service_role_only" ... using (true) with check (true);
-- Sin cláusula `to`, una política aplica a `public` (anon + authenticated),
-- NO al service_role. El resultado real era lo contrario de la intención:
-- cualquiera con la anon key (que es pública, viaja al navegador) podía
-- LEER los endpoints/claves push de TODOS los restaurantes, insertarlos o
-- borrarlos (spoofing de notificaciones / DoS de avisos).
--
-- El acceso legítimo a esta tabla SIEMPRE pasa por el service role
-- (route handler /api/push/subscribe y lib/push.ts), que ignora RLS.
-- Por tanto, el patrón correcto —idéntico a `customers` y `page_visits`—
-- es: RLS activada + SIN políticas (deny-by-default para anon/authenticated).
-- ============================================================

drop policy if exists "service_role_only" on push_subscriptions;

-- RLS queda activada (lo hizo 014). Sin políticas, ningún rol que pase por
-- RLS (anon/authenticated) puede tocar la tabla; el service role sí, como
-- siempre, porque la bypasea.
alter table push_subscriptions enable row level security;
