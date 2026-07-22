-- ============================================================
--  Migración 080 — Auto-archivo de mesas/pedidos DINE_IN abandonados
--  (Fase 1 auditoría de lanzamiento: anti-fraude y operación de mesero)
--  · orders.auto_archived_at: marca que el cierre fue automático, no manual.
--  · leogin_archive_abandoned_orders(): cancela (con reposición de stock)
--    los pedidos DINE_IN activos con más de 24h sin cerrar. Parametrizable
--    por restaurante (botón manual del panel) o global (cron).
--  · pg_cron cada hora, si la extensión está disponible (mismo patrón que
--    035_billing_automation.sql: si no está disponible, avisa y queda el
--    botón manual como respaldo).
--  Ejecutar DESPUÉS de 001..079.
-- ============================================================

alter table orders
  add column if not exists auto_archived_at timestamptz;

comment on column orders.auto_archived_at is
  'Si no es NULL: este pedido se cerró solo por abandono (>24h sin cerrar '
  'desde que se creó), no por acción manual del mesero/dueño.';

create or replace function leogin_archive_abandoned_orders(p_restaurant_id uuid default null)
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
     where order_type = 'DINE_IN'
       and status not in ('CANCEL', 'DELIVERED')
       and created_at < now() - interval '24 hours'
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

comment on function leogin_archive_abandoned_orders is
  'Cancela pedidos DINE_IN activos con más de 24h (repone stock, libera la '
  'mesa) y marca auto_archived_at. p_restaurant_id NULL = todos los '
  'restaurantes (uso del cron); con valor = botón manual de un restaurante '
  'concreto (ver archiveAbandonedTables en lib/actions/orders.ts).';

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    begin
      create extension if not exists pg_cron;
      if exists (select 1 from cron.job where jobname = 'leogin-archive-abandoned-hourly') then
        perform cron.unschedule('leogin-archive-abandoned-hourly');
      end if;
      perform cron.schedule(
        'leogin-archive-abandoned-hourly',
        '0 * * * *',
        'select leogin_archive_abandoned_orders(null);'
      );
      raise notice 'pg_cron: job "leogin-archive-abandoned-hourly" programado (cada hora).';
    exception when others then
      raise notice 'pg_cron disponible pero no se pudo programar (%): actívalo en el dashboard y re-ejecuta este bloque.', sqlerrm;
    end;
  else
    raise notice 'pg_cron no disponible: usa el botón "Archivar mesas abandonadas" del panel (respaldo manual, ver waiter-panel.tsx/orders-panel.tsx).';
  end if;
end $$;
