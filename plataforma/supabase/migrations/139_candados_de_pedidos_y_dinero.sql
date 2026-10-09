-- ============================================================
--  139 · Candados de pedidos y de dinero (SEC-05)
--  ------------------------------------------------------------
--  PLAN_ACCESO_Y_MONITOREO_2026-10-08. Segunda tanda después de la 136.
--  Con la 136 ya nadie se sube de rango; quedaban reglas viejas que dejan a
--  cualquiera con la clave pública —o a cualquier miembro del restaurante,
--  también al mesero que entró con PIN— escribir directo en tablas que la
--  app solo escribe desde el servidor, saltándose sus validaciones:
--
--    1. INSERCIONES PÚBLICAS que nadie usa: «anon insert orders»,
--       «anon insert order_items», «public can submit rating» y «public can
--       insert waiter_call». La app crea pedidos con `place_order` (cliente
--       de servicio, con precios calculados en el servidor), calificaciones
--       y llamadas al mesero con el cliente de servicio y CON límite por IP.
--       Por la clave pública cualquiera podía crear pedidos con precios
--       inventados, inundar de «llamar al mesero» a un local (suena en
--       cocina) o fabricar calificaciones.
--
--    2. PEDIDOS: «staff update own orders» tiene `with check (true)`: el
--       personal podía mover un pedido a OTRO restaurante o cambiarle el
--       total. El panel sí actualiza pedidos con la sesión (estado, horas,
--       método de pago, efectivo recibido), así que no se cierra la tabla:
--       un disparador protege las columnas de identidad y de dinero.
--
--    3. DINERO EN MANOS DE CUALQUIER MIEMBRO: tarjetas de regalo, cuentas y
--       movimientos de puntos, cortes de caja, cupones, pagos y cuentas
--       divididas, y las líneas del pedido tienen reglas `for all` a
--       miembros. La app los escribe SIEMPRE con el cliente de servicio o
--       con funciones `security definer` (verificado archivo por archivo el
--       2026-10-09). Un mesero con su token podía cargarle saldo a una
--       tarjeta de regalo o sumarle puntos a un cliente. Pasan a SOLO
--       LECTURA con la misma condición que tenían (las pantallas y Realtime
--       siguen leyendo igual).
--
--  Idempotente. Ejecutar DESPUÉS de 001..138.
-- ============================================================

-- ── 1. Inserciones públicas sin uso ───────────────────────────────────
drop policy if exists "anon insert orders" on public.orders;
drop policy if exists "anon insert order_items" on public.order_items;
drop policy if exists "public can submit rating" on public.order_ratings;
drop policy if exists "public can insert waiter_call" on public.waiter_calls;

-- ── 2. Columnas de identidad y de dinero del pedido ───────────────────
create or replace function public.leogin_candado_pedido()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  k text;
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    raise exception 'Los pedidos solo se crean desde el servidor.'
      using errcode = '42501';
  end if;

  foreach k in array array[
    'id', 'restaurant_id', 'order_number', 'public_token', 'customer_id', 'created_at', 'client_id',
    'subtotal', 'total', 'discount', 'tip', 'delivery_fee', 'loyalty_discount',
    'loyalty_points_redeemed', 'gift_card_id', 'gift_card_amount', 'coupon_id', 'coupon_code'
  ] loop
    if (to_jsonb(new) -> k) is distinct from (to_jsonb(old) -> k) then
      raise exception 'El campo % del pedido solo se cambia desde el servidor.', k
        using errcode = '42501';
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists candado_columnas_pedido on public.orders;
create trigger candado_columnas_pedido
  before insert or update on public.orders
  for each row execute function public.leogin_candado_pedido();

-- ── 3. Dinero: solo lectura para los miembros ─────────────────────────
--    Cada regla que daba escritura se rehace como de LECTURA con la MISMA
--    condición (se lee de pg_policy, así no hay que copiarla a mano), y las
--    que solo escribían se quitan.
do $$
declare
  t text;
  p record;
  nombre text;
begin
  foreach t in array array[
    'order_items', 'gift_cards', 'loyalty_accounts', 'loyalty_transactions',
    'cash_counts', 'coupons', 'order_payments', 'table_splits'
  ] loop
    if to_regclass('public.' || t) is null then
      continue;
    end if;

    for p in
      select pol.polname, pol.polcmd::text as cmd, pg_get_expr(pol.polqual, pol.polrelid) as qual,
             array(select r.rolname from pg_roles r where r.oid = any(pol.polroles)) as roles,
             0 = any(pol.polroles) as publica
        from pg_policy pol
       where pol.polrelid = ('public.' || t)::regclass
         and pol.polpermissive
         and pol.polcmd::text in ('*', 'a', 'w', 'd')
    loop
      if p.cmd = '*' and p.qual is not null then
        nombre := left(p.polname || ' (lectura)', 63);
        execute format('drop policy if exists %I on public.%I', nombre, t);
        execute format(
          'create policy %I on public.%I for select to %s using (%s)',
          nombre, t,
          case when p.publica then 'public' else array_to_string(array(select quote_ident(x) from unnest(p.roles) x), ', ') end,
          p.qual);
      end if;
      execute format('drop policy if exists %I on public.%I', p.polname, t);
    end loop;
  end loop;
end;
$$;

-- ── 4. Un pedido no se borra con la sesión ────────────────────────────
--    `orders_member` es `for all`: incluía BORRAR. Un mesero podía hacer
--    desaparecer un pedido —la prueba de una venta— por la API. La app no
--    borra pedidos nunca (anular es un estado + su registro en order_voids).
--    Regla RESTRICTIVA: se suma con AND a todas las demás, así que ninguna
--    regla futura la puede reabrir sin quitar esta.
drop policy if exists "pedidos_no_se_borran" on public.orders;
create policy "pedidos_no_se_borran" on public.orders
  as restrictive for delete to authenticated, anon
  using (false);
