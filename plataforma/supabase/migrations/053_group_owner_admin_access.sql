-- ============================================================
--  Migración 053 — Acceso del DUEÑO DE GRUPO al admin de cada sucursal
--  ------------------------------------------------------------
--  Hasta ahora el GROUP_OWNER solo veía el panel consolidado
--  (/central). Para que pueda ENTRAR al panel admin de cualquiera
--  de sus sucursales SIN volver a iniciar sesión (misma sesión, el
--  cookie ya es compartido en todos los subdominios), necesita
--  permisos RLS sobre los datos de SUS sucursales.
--
--  Diseño (seguro por construcción):
--   · Todas las políticas son ADITIVAS y permisivas (OR con las que
--     ya existen). No tocan ni borran políticas previas → un dueño /
--     staff de restaurante NO se ve afectado.
--   · El alcance está acotado por `is_my_group_branch(rid)`: solo
--     true cuando el usuario es GROUP_OWNER y la sucursal pertenece a
--     SU organización. Imposible cruzar a otra cadena.
--   · No se otorga acceso a `profiles` (gestión de personal/roles):
--     evita escalación de privilegios. El dueño de grupo administra
--     la operación de la sucursal, no su nómina de accesos (queda
--     como mejora futura, con su propia política acotada).
--
--  Ejecutar DESPUÉS de 001..052.
-- ============================================================

-- ── Helpers (SECURITY DEFINER para no recursar sobre RLS) ────
create or replace function public.get_my_org_id()
returns uuid language sql security definer stable
as $$ select organization_id from public.profiles where id = auth.uid() $$;

-- ¿La sucursal `rid` pertenece a la organización del usuario actual,
-- y el usuario es dueño de grupo? Único punto de verdad del alcance.
create or replace function public.is_my_group_branch(rid uuid)
returns boolean language sql security definer stable
as $$
  select
    public.get_my_role() = 'GROUP_OWNER'
    and public.get_my_org_id() is not null
    and exists (
      select 1 from public.restaurants r
      where r.id = rid
        and r.organization_id = public.get_my_org_id()
    );
$$;

-- ── Macro manual: una política permisiva "for all" por tabla con
--    columna restaurant_id directa. Se usa drop+create para que la
--    migración sea reaplicable sin error.
do $$
declare
  t text;
  direct_tables text[] := array[
    'categories', 'products', 'orders', 'customers',
    'ingredients', 'stock_movements', 'promotions', 'coupons',
    'suppliers', 'purchase_orders',
    'loyalty_accounts', 'loyalty_settings', 'loyalty_transactions',
    'reservations', 'order_ratings',
    'fel_documents', 'fel_settings', 'invoices', 'restaurant_billing',
    'print_agents', 'print_jobs', 'waiter_calls',
    'page_visits', 'activity_log', 'cash_counts', 'api_keys'
  ];
begin
  foreach t in array direct_tables loop
    execute format('drop policy if exists %I on %I', t || '_group_owner', t);
    execute format(
      'create policy %I on %I for all to authenticated '
      'using (public.is_my_group_branch(restaurant_id)) '
      'with check (public.is_my_group_branch(restaurant_id))',
      t || '_group_owner', t
    );
  end loop;
end $$;

-- ── restaurants: el dueño de grupo lee y actualiza SUS sucursales
--    (no se permite borrar una sucursal desde aquí).
drop policy if exists "restaurants_select_group_owner" on restaurants;
create policy "restaurants_select_group_owner"
  on restaurants for select to authenticated
  using (public.is_my_group_branch(id));

drop policy if exists "restaurants_update_group_owner" on restaurants;
create policy "restaurants_update_group_owner"
  on restaurants for update to authenticated
  using (public.is_my_group_branch(id))
  with check (public.is_my_group_branch(id));

-- ── restaurant_themes: personalización del sitio de la sucursal
--    (su clave primaria es restaurant_id).
drop policy if exists "themes_all_group_owner" on restaurant_themes;
create policy "themes_all_group_owner"
  on restaurant_themes for all to authenticated
  using (public.is_my_group_branch(restaurant_id))
  with check (public.is_my_group_branch(restaurant_id));

-- ── Tablas hijas (sin restaurant_id propio): se acotan vía su padre.
drop policy if exists "order_items_group_owner" on order_items;
create policy "order_items_group_owner"
  on order_items for all to authenticated
  using (exists (select 1 from orders o where o.id = order_items.order_id and public.is_my_group_branch(o.restaurant_id)))
  with check (exists (select 1 from orders o where o.id = order_items.order_id and public.is_my_group_branch(o.restaurant_id)));

drop policy if exists "recipe_items_group_owner" on recipe_items;
create policy "recipe_items_group_owner"
  on recipe_items for all to authenticated
  using (exists (select 1 from products p where p.id = recipe_items.product_id and public.is_my_group_branch(p.restaurant_id)))
  with check (exists (select 1 from products p where p.id = recipe_items.product_id and public.is_my_group_branch(p.restaurant_id)));

drop policy if exists "purchase_order_items_group_owner" on purchase_order_items;
create policy "purchase_order_items_group_owner"
  on purchase_order_items for all to authenticated
  using (exists (select 1 from purchase_orders po where po.id = purchase_order_items.purchase_order_id and public.is_my_group_branch(po.restaurant_id)))
  with check (exists (select 1 from purchase_orders po where po.id = purchase_order_items.purchase_order_id and public.is_my_group_branch(po.restaurant_id)));
