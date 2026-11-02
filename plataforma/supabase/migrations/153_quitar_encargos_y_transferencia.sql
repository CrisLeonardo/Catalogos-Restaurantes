-- ============================================================
--  153 · Se retiran los encargos y la transferencia del comensal
--  ------------------------------------------------------------
--  El dueño decidió el 2026-11-02 quitar del todo lo que trajo la
--  migración 149 (encargos con cupo y pago por transferencia del
--  comensal, pensados para el plan En línea). «Paga tu plan» (148) NO
--  se toca: es cómo el restaurante le paga a Leogin.
--
--  La 149 se conserva en el historial porque pudo haberse aplicado ya en
--  alguna base. Esta migración deja la base como si no hubiera corrido:
--    1. el archivador de pedidos de llevar/domicilio vuelve a ser el de
--       la 099 (cancela a las 6 h). Hay que hacerlo ANTES de borrar la
--       tabla: la versión de la 149 hace JOIN con encargo_fechas;
--    2. fuera las columnas de orders (encargo_id, transfer_status,
--       transfer_proof_path), su restricción y su índice;
--    3. fuera la tabla encargo_fechas.
--  Los comprobantes que algún comensal haya subido viven en el bucket
--  privado `payment-proofs` bajo `pedidos/…`; no se borran desde SQL
--  (los objetos de Storage se limpian desde el panel de Supabase).
--
--  Idempotente: en una base donde la 149 nunca corrió, todo es «if
--  exists» y no hace nada más que dejar el archivador como en la 099.
--  Aplicar DESPUÉS de desplegar el código que ya no usa estas columnas
--  (o en el mismo momento): el código viejo las lee y fallaría.
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

revoke execute on function leogin_archive_abandoned_delivery_orders(uuid) from public, anon, authenticated;
grant execute on function leogin_archive_abandoned_delivery_orders(uuid) to service_role;

drop index if exists public.orders_encargo_idx;
alter table public.orders drop constraint if exists orders_transfer_status_check;
alter table public.orders
  drop column if exists encargo_id,
  drop column if exists transfer_status,
  drop column if exists transfer_proof_path;

drop table if exists public.encargo_fechas;
