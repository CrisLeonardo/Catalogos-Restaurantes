-- ============================================================
--  191 · Precio acordado por restaurante
--  ------------------------------------------------------------
--  Auditoría de lanzamiento 2026-11-23 (LZ-01). Hasta aquí, en modo
--  automático, `restaurant_billing.monthly_fee` se recalculaba con el
--  precio vigente del plan en tres momentos: al guardar precios en
--  /super/configuracion (leogin_apply_auto_price_all), en cada corte
--  mensual (leogin_generate_monthly_invoices) y al guardar la ficha de
--  cobro. Subir Estándar de Q150 a Q199 le subía la mensualidad, sin
--  aviso, a quien ya había aceptado Q150.
--
--  Desde aquí `monthly_fee` es el PRECIO ACORDADO con ese restaurante:
--
--   · Se fija al contratar un plan (alta o cambio de plan) con el precio
--     vigente en ese momento, y queda anotado con qué plan
--     (`plan_del_precio`) y cuándo (`precio_fijado_en`).
--   · Cambiar los precios globales solo afecta a altas y cambios de plan
--     posteriores.
--   · El corte mensual cobra el precio acordado; solo lo recalcula si el
--     plan cambió por un camino que no lo volvió a fijar.
--   · Pasar a un restaurante al precio vigente es una acción explícita del
--     super admin: leogin_fijar_precio_vigente.
--
--  El modo manual (auto_price = false) no cambia: el monto tecleado manda.
--
--  Arranque: cada fila automática se sincroniza UNA vez con el precio
--  vigente (exactamente lo que habría hecho el próximo corte) y ese monto
--  queda como acordado. Imprime en NOTICE cada mensualidad que cambie.
--
--  Orden: aplicar ANTES de desplegar el código. El código nuevo lee
--  `plan_del_precio` y llama a leogin_fijar_precio_vigente; el código
--  viejo funciona sin cambios sobre esta migración (solo deja de mover
--  precios al guardar la configuración global). Idempotente.
-- ============================================================

alter table public.restaurant_billing
  add column if not exists plan_del_precio  text,
  add column if not exists precio_fijado_en timestamptz;

comment on column public.restaurant_billing.plan_del_precio is
  'Plan con el que se fijó monthly_fee. Si difiere de restaurants.plan_actual, el precio automático se vuelve a fijar (mig. 191).';
comment on column public.restaurant_billing.precio_fijado_en is
  'Cuándo se acordó monthly_fee por última vez (mig. 191).';

-- ── 1. Arranque: el monto de hoy queda como acordado ────────
do $$
declare
  r     record;
  v_fee numeric;
begin
  for r in
    select b.restaurant_id, b.monthly_fee, b.auto_price, rs.plan_actual
      from public.restaurant_billing b
      join public.restaurants rs on rs.id = b.restaurant_id
     where b.plan_del_precio is null
  loop
    v_fee := r.monthly_fee;
    if r.auto_price then
      v_fee := coalesce(public.leogin_compute_monthly_fee(r.restaurant_id), r.monthly_fee);
      if v_fee is distinct from r.monthly_fee then
        raise notice 'Restaurante %: Q% -> Q% (precio vigente de %, queda acordado)',
          r.restaurant_id, r.monthly_fee, v_fee, r.plan_actual;
      end if;
    end if;
    update public.restaurant_billing
       set monthly_fee      = v_fee,
           plan_del_precio  = r.plan_actual,
           precio_fijado_en = now(),
           updated_at       = case when v_fee is distinct from r.monthly_fee then now() else updated_at end
     where restaurant_id = r.restaurant_id;
  end loop;
end $$;

-- ── 2. Fijar el precio vigente (acción explícita) ───────────
create or replace function public.leogin_fijar_precio_vigente(p_restaurant_id uuid)
returns numeric language plpgsql security definer set search_path = public as $$
declare
  v_plan text;
  v_fee  numeric;
begin
  select plan_actual into v_plan from restaurants where id = p_restaurant_id;
  v_fee := leogin_compute_monthly_fee(p_restaurant_id);
  update restaurant_billing
     set monthly_fee      = v_fee,
         plan_del_precio  = v_plan,
         precio_fijado_en = now(),
         updated_at       = now()
   where restaurant_id = p_restaurant_id and auto_price = true;
  return v_fee;
end;
$$;

-- ── 3. Precio automático: solo si cambió el plan ─────────────
--  Mismo nombre y firma que la 035 para no tocar a los llamadores (alta,
--  cambio de plan, edición del restaurante). Devuelve la mensualidad que
--  queda en efecto.
create or replace function public.leogin_apply_auto_price(p_restaurant_id uuid)
returns numeric language plpgsql security definer set search_path = public as $$
declare
  v_plan text;
  b      restaurant_billing%rowtype;
begin
  select plan_actual into v_plan from restaurants where id = p_restaurant_id;
  select * into b from restaurant_billing where restaurant_id = p_restaurant_id;
  if not found then
    return leogin_compute_monthly_fee(p_restaurant_id);
  end if;
  if b.auto_price and b.plan_del_precio is distinct from v_plan then
    return leogin_fijar_precio_vigente(p_restaurant_id);
  end if;
  return b.monthly_fee;
end;
$$;

--  Antes recalculaba a TODOS los automáticos; ahora solo a los que cambiaron
--  de plan sin volver a fijar su precio. Devuelve cuántos tocó.
create or replace function public.leogin_apply_auto_price_all()
returns int language plpgsql security definer set search_path = public as $$
declare
  v_count int := 0;
  r       record;
begin
  for r in
    select b.restaurant_id
      from restaurant_billing b
      join restaurants rs on rs.id = b.restaurant_id
     where b.auto_price = true
       and b.plan_del_precio is distinct from rs.plan_actual
  loop
    perform leogin_fijar_precio_vigente(r.restaurant_id);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- ── 4. Corte mensual: cobra el precio acordado ──────────────
--  Cuerpo de la 035 con un cambio: la rama automática ya no recalcula con
--  el precio vigente, pasa por leogin_apply_auto_price.
create or replace function public.leogin_generate_monthly_invoices()
returns int language plpgsql security definer set search_path = public as $$
declare
  v_period date := date_trunc('month', now() at time zone 'UTC')::date;
  v_count  int  := 0;
  c        record;
  v_fee    numeric;
  v_due    date;
begin
  for c in select * from restaurant_billing where active = true loop
    if c.auto_price then
      v_fee := leogin_apply_auto_price(c.restaurant_id);
    else
      v_fee := c.monthly_fee;
    end if;
    if v_fee is null or v_fee <= 0 then continue; end if;

    -- el índice único (restaurant_id, period) where MONTHLY garantiza no duplicar
    if exists (
      select 1 from invoices
      where restaurant_id = c.restaurant_id and concept = 'MONTHLY' and period = v_period
    ) then
      continue;
    end if;

    v_due := make_date(
      extract(year  from v_period)::int,
      extract(month from v_period)::int,
      least(28, greatest(1, coalesce(c.billing_day, 1)))
    );

    insert into invoices (restaurant_id, concept, description, period, amount, currency, status, due_date)
    values (
      c.restaurant_id, 'MONTHLY',
      'Mensualidad ' || to_char(v_period, 'YYYY-MM'),
      v_period, v_fee, coalesce(c.currency, 'GTQ'), 'PENDING', v_due
    );
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- ── 5. Permisos: solo el servidor (como la 084) ─────────────
revoke execute on function public.leogin_fijar_precio_vigente(uuid) from public, anon, authenticated;
grant  execute on function public.leogin_fijar_precio_vigente(uuid) to service_role;
revoke execute on function public.leogin_apply_auto_price(uuid) from public, anon, authenticated;
grant  execute on function public.leogin_apply_auto_price(uuid) to service_role;
revoke execute on function public.leogin_apply_auto_price_all() from public, anon, authenticated;
grant  execute on function public.leogin_apply_auto_price_all() to service_role;
revoke execute on function public.leogin_generate_monthly_invoices() from public, anon, authenticated;
grant  execute on function public.leogin_generate_monthly_invoices() to service_role;
