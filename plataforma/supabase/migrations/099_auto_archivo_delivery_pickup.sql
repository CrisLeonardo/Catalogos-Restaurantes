-- ============================================================
--  Migración 099 — Auto-archivo de DELIVERY/PICKUP abandonados
--  ------------------------------------------------------------
--  HALLAZGO (CHECKLIST_CORRECCIONES.md): la migración 080 solo cierra
--  DINE_IN (>24h) — ligado al botón manual "Archivar mesas abandonadas"
--  del panel de mesero (waiter-panel.tsx). DELIVERY/PICKUP nunca tuvo
--  ningún cierre automático.
--
--  Función PARALELA a leogin_archive_abandoned_orders (no se le mete en
--  el where): un mesero que aprieta "Archivar mesas abandonadas" espera
--  que eso toque mesas, no que de paso cancele un pedido a domicilio de
--  otro cliente. Umbral propio y más corto (6h, decisión de Leonardo
--  2026-08-03): un DELIVERY/PICKUP debe resolverse el mismo día, no es
--  una mesa que puede quedar "ocupada" horas — 24h sería demasiado.
--
--  Ejecutar DESPUÉS de 001..098.
-- ============================================================

create or replace function leogin_archive_abandoned_delivery_orders(p_restaurant_id uuid default null)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int := 0;
  r record;
begin
  for r in
    select id from orders
     where order_type in ('DELIVERY', 'PICKUP')
       and status not in ('CANCEL', 'DELIVERED')
       and created_at < now() - interval '6 hours'
       and (p_restaurant_id is null or restaurant_id = p_restaurant_id)
     for update skip locked
  loop
    perform restock_order(r.id);
    update orders set
      status           = 'CANCEL',
      cancelled_at     = now(),
      auto_archived_at = now()
    where id = r.id;
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

comment on function leogin_archive_abandoned_delivery_orders is
  'Cancela pedidos DELIVERY/PICKUP activos con más de 6h sin cerrar '
  '(repone stock) y marca auto_archived_at. Umbral propio y más corto que '
  'el de DINE_IN (24h, leogin_archive_abandoned_orders / mig. 080): un '
  'pedido para llevar o a domicilio debe resolverse el mismo día. '
  'p_restaurant_id NULL = todos los restaurantes (uso del cron); con '
  'valor = alcance de un restaurante concreto.';

revoke execute on function leogin_archive_abandoned_delivery_orders(uuid) from public, anon, authenticated;
grant execute on function leogin_archive_abandoned_delivery_orders(uuid) to service_role;

-- Mismo patrón de cron que la 080: cada hora, si pg_cron está disponible;
-- si no, queda documentado que este tipo de pedido no se autoarchiva aún.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    begin
      create extension if not exists pg_cron;
      if exists (select 1 from cron.job where jobname = 'leogin-archive-abandoned-delivery-hourly') then
        perform cron.unschedule('leogin-archive-abandoned-delivery-hourly');
      end if;
      perform cron.schedule(
        'leogin-archive-abandoned-delivery-hourly',
        '0 * * * *',
        'select leogin_archive_abandoned_delivery_orders(null);'
      );
      raise notice 'pg_cron: job "leogin-archive-abandoned-delivery-hourly" programado (cada hora).';
    exception when others then
      raise notice 'pg_cron disponible pero no se pudo programar (%): actívalo en el dashboard y re-ejecuta este bloque.', sqlerrm;
    end;
  else
    raise notice 'pg_cron no disponible: usa el botón manual (aún no existe uno para DELIVERY/PICKUP) o activa pg_cron y re-ejecuta este bloque.';
  end if;
end $$;
