-- ============================================================
--  FASE 5 — Hardening de RLS y auditoría
--  Refuerza las políticas de pedidos a nivel de base de datos
--  (defensa en profundidad, independiente del frontend).
-- ============================================================

-- ── Orders: INSERT más estricto ────────────────────────────────
-- La política actual permite cualquier INSERT anónimo.
-- La reemplazamos por una que verifica que el restaurante esté
-- activo Y tenga el módulo de pedidos habilitado, además de
-- imponer status='NEW' y payment_method='CASH' en la inserción.

drop policy if exists "anon insert orders" on orders;

create policy "anon insert orders"
  on orders for insert
  with check (
    status         = 'NEW'
    and payment_method = 'CASH'
    and exists (
      select 1
      from   restaurants r
      where  r.id     = restaurant_id
        and  r.status = 'active'
        and  (r.modules ->> 'orders') = 'true'
    )
  );

-- ── Order items: INSERT más estricto ───────────────────────────
-- Requiere precio y cantidad positivos, y que el pedido exista.

drop policy if exists "anon insert order_items" on order_items;

create policy "anon insert order_items"
  on order_items for insert
  with check (
    quantity       > 0
    and price_snapshot > 0
    and price_snapshot < 100000
    and exists (
      select 1 from orders o
      where  o.id = order_id
    )
  );

-- ── updated_at automático en orders ────────────────────────────
-- Útil para el panel Realtime y para auditoría.

alter table orders
  add column if not exists updated_at timestamptz;

create or replace function set_updated_at()
returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists orders_set_updated_at on orders;
create trigger orders_set_updated_at
  before update on orders
  for each row
  execute function set_updated_at();
