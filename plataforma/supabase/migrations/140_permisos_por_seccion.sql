-- ============================================================
--  140 · Los permisos por sección también en la base (SEC-06)
--  ------------------------------------------------------------
--  PLAN_ACCESO_Y_MONITOREO_2026-10-08. El dueño reparte SECCIONES a su
--  personal (Pedidos, Catálogo, Finanzas…), pero eso solo vivía en la app:
--  la base dejaba a CUALQUIER miembro del restaurante —también al mesero que
--  entró con PIN— escribir directo, con su token y la clave pública, en
--  platillos, categorías, clientes, reservaciones, proveedores… Un mesero
--  con solo «Pedidos» podía cambiar el precio de un platillo.
--
--  Dos casos, según cómo escribe la app (escaneado archivo por archivo el
--  2026-10-09):
--
--    1. Lo que el panel escribe CON LA SESIÓN (platillos, categorías, zonas
--       de entrega, diseño del menú, la ficha del restaurante): se deja
--       escribir, pero solo a quien tiene la sección. Regla RESTRICTIVA con
--       `leogin_puede()`, que es el `can()` de la app en SQL.
--    2. Lo que la app escribe SIEMPRE desde el servidor: queda en solo
--       lectura para los miembros (mismo patrón que la 139).
--
--  `leogin_puede` NO es security definer: lee la membresía y el perfil de
--  quien llama, que RLS ya le deja leer (members_select_own,
--  profiles_select_own). Las funciones que llama (is_my_group_branch,
--  get_my_role) sí lo son, como siempre.
--
--  Idempotente. Ejecutar DESPUÉS de 001..139.
-- ============================================================

create or replace function public.leogin_puede(p_restaurant uuid, variadic p_secciones text[])
returns boolean
language sql
stable
set search_path = public
as $$
  select
    -- Por membresía (migración 113): el dueño todo; gerente y personal, sus
    -- secciones (sin lista = todas, como `can()`); mesero, solo «mesero».
    exists (
      select 1 from restaurant_members m
       where m.user_id = auth.uid()
         and m.restaurant_id = p_restaurant
         and m.status = 'active'
         and (
           m.role = 'OWNER'
           or (m.role in ('MANAGER', 'STAFF') and (
                 m.permissions is null
                 or jsonb_typeof(m.permissions) = 'null'
                 or m.permissions ?| p_secciones))
           or (m.role = 'WAITER' and 'mesero' = any(p_secciones))
         )
    )
    -- Por el perfil (el camino de antes de las membresías).
    or exists (
      select 1 from profiles p
       where p.id = auth.uid()
         and p.restaurant_id = p_restaurant
         and (
           p.role = 'RESTAURANT_OWNER'
           or (p.role = 'RESTAURANT_STAFF' and (
                 p.permissions is null
                 or jsonb_typeof(p.permissions) = 'null'
                 or p.permissions ?| p_secciones))
           or (p.role = 'RESTAURANT_WAITER' and 'mesero' = any(p_secciones))
         )
    )
    -- El dueño de grupo administra sus sucursales como dueño.
    or public.is_my_group_branch(p_restaurant)
    -- El Super Admin (la 137 ya le exige el segundo factor).
    or public.get_my_role() = 'SUPER_ADMIN';
$$;

-- ── 1. Escritura con la sesión, solo con la sección ───────────────────
do $$
declare
  r record;
  cmd text;
  cond text;
begin
  for r in
    select * from (values
      ('products',         'restaurant_id', array['catalogo']),
      ('categories',       'restaurant_id', array['categorias']),
      ('delivery_zones',   'restaurant_id', array['ajustes']),
      ('restaurant_themes','restaurant_id', array['personalizar']),
      ('restaurants',      'id',            array['perfil', 'ajustes', 'personalizar', 'mesas', 'modulos'])
    ) as t(tabla, columna, secciones)
  loop
    if to_regclass('public.' || r.tabla) is null then
      continue;
    end if;
    cond := format('public.leogin_puede(%I, variadic %L::text[])', r.columna, r.secciones);

    foreach cmd in array array['insert', 'update', 'delete'] loop
      execute format('drop policy if exists %I on public.%I', 'seccion_' || cmd, r.tabla);
      if cmd = 'insert' then
        execute format('create policy %I on public.%I as restrictive for insert to authenticated with check (%s)',
          'seccion_' || cmd, r.tabla, cond);
      elsif cmd = 'update' then
        execute format('create policy %I on public.%I as restrictive for update to authenticated using (%s) with check (%s)',
          'seccion_' || cmd, r.tabla, cond, cond);
      else
        execute format('create policy %I on public.%I as restrictive for delete to authenticated using (%s)',
          'seccion_' || cmd, r.tabla, cond);
      end if;
    end loop;
  end loop;
end;
$$;

-- ── 2. Solo lectura para los miembros: lo escribe el servidor ─────────
do $$
declare
  t text;
  p record;
  nombre text;
begin
  foreach t in array array[
    'customers', 'fel_documents', 'fel_settings', 'ingredients', 'invoices',
    'loyalty_settings', 'order_ratings', 'page_visits', 'print_jobs',
    'purchase_order_items', 'purchase_orders', 'recipe_items', 'reservations',
    'stock_movements', 'suppliers', 'table_sessions', 'waiter_calls',
    'waitlist_entries', 'restaurant_theme_templates'
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
