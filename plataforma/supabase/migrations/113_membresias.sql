-- ============================================================
--  Migración 113 — Membresías: una persona, varios restaurantes
--  ------------------------------------------------------------
--  Hasta ahora una cuenta era un restaurante y punto: `profiles.id`
--  ES `auth.users.id` (clave primaria) y tiene UN `restaurant_id`.
--  Con eso, un cliente con tres locales necesitaba tres cuentas —y
--  con el acceso por Google, tres correos de Gmail distintos, que
--  es donde el modelo se rompe del todo.
--
--  Esta migración separa las dos preguntas que estaban pegadas:
--    · QUIÉN ERES     → tu usuario de Auth (uno, para siempre).
--    · QUÉ ERES AQUÍ  → tu fila en restaurant_members, una por
--                       restaurante, con su rol y sus permisos.
--
--  Ver PLAN_ACCESO_MULTICUENTA.md para el porqué y las fases.
--
--  ── CÓMO NO ROMPER NADA (la parte importante) ───────────────
--
--  1) RELLENO: cada perfil de hoy nace con su membresía equivalente.
--     Nadie tiene que hacer nada y nadie pierde acceso.
--
--  2) `profiles.restaurant_id` SE QUEDA. Sigue siendo "el
--     restaurante de casa" de cada quien y lo siguen usando las
--     políticas de siempre. Esta migración solo AÑADE una segunda
--     vía; retirar la primera es trabajo de otro día, cuando las
--     membresías lleven meses en producción.
--
--  3) POLÍTICAS ADITIVAS, nunca sustitutivas: cada una se combina
--     con OR contra las que ya existen (mismo patrón probado de la
--     migración 053 para el dueño de grupo). No se borra ni se
--     altera una sola política previa, así que es imposible que un
--     dueño o un cajero de hoy se quede fuera por este cambio.
--
--  Ejecutar DESPUÉS de 001..112.
-- ============================================================

-- ── La tabla ────────────────────────────────────────────────
create table if not exists restaurant_members (
  user_id       uuid        not null references auth.users(id)  on delete cascade,
  restaurant_id uuid        not null references restaurants(id) on delete cascade,
  -- OWNER   → dueño: todo, incluido el cobro y borrar el restaurante.
  -- MANAGER → gerente de la sucursal: la operación, nunca el cobro.
  -- STAFF   → cajero/cocina, por secciones.
  -- WAITER  → mesero (compatibilidad con el rol deprecado).
  role          text        not null
                  check (role in ('OWNER', 'MANAGER', 'STAFF', 'WAITER')),
  -- Mismas secciones que lib/permissions.ts. NULL = sin restringir
  -- (lo que ya significaba en profiles.permissions).
  permissions   text[],
  status        text        not null default 'active'
                  check (status in ('active', 'invited', 'suspended')),
  invited_by    uuid        references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  primary key (user_id, restaurant_id)
);

comment on table restaurant_members is
  'Quién puede entrar a qué restaurante y con qué rol. Una persona puede '
  'tener varias filas: es lo que permite un solo correo (o una sola cuenta '
  'de Google) para varios restaurantes o sucursales.';

comment on column restaurant_members.role is
  'OWNER (dueño, incluye cobro), MANAGER (gerente de sucursal, sin cobro), '
  'STAFF (por secciones), WAITER (mesero). El rol manda sobre permissions '
  'para lo que no es una sección del panel.';

comment on column restaurant_members.status is
  'active = puede entrar. invited = se le mandó invitación y no la ha '
  'aceptado. suspended = se le quitó el acceso sin borrar su historial '
  '(pedidos, propinas y bitácora siguen atribuidos a esta persona).';

-- Lectura típica #1: "los restaurantes de esta persona" (pantalla Mi cuenta).
create index if not exists restaurant_members_user_idx
  on restaurant_members(user_id);

-- Lectura típica #2: "el equipo de este restaurante" (pantalla Personal).
create index if not exists restaurant_members_restaurant_idx
  on restaurant_members(restaurant_id);

alter table restaurant_members enable row level security;

-- Cada quien puede LEER sus propias membresías (lo necesita Mi cuenta con el
-- cliente normal). Escribir es siempre del servidor con la service role key:
-- una tabla de permisos que el propio navegador pudiera editar no sirve de
-- nada — quien puede darse una membresía puede darse cualquier restaurante.
drop policy if exists "members_select_own" on restaurant_members;
create policy "members_select_own"
  on restaurant_members for select to authenticated
  using (user_id = auth.uid());

-- ── Relleno desde los perfiles de hoy ───────────────────────
-- Un perfil = una membresía equivalente. Idempotente: se puede reaplicar.
insert into restaurant_members (user_id, restaurant_id, role, permissions, status, created_at)
select
  p.id,
  p.restaurant_id,
  case p.role
    when 'RESTAURANT_OWNER' then 'OWNER'
    when 'RESTAURANT_WAITER' then 'WAITER'
    else 'STAFF'
  end,
  -- El mesero del rol deprecado nunca tuvo permissions; su sección es 'mesero'.
  coalesce(p.permissions, case when p.role = 'RESTAURANT_WAITER' then array['mesero'] else null end),
  'active',
  now()
from profiles p
where p.restaurant_id is not null
  and p.role in ('RESTAURANT_OWNER', 'RESTAURANT_STAFF', 'RESTAURANT_WAITER')
on conflict (user_id, restaurant_id) do nothing;

-- El dueño de grupo (migración 024) pasa a ser OWNER de cada sucursal de su
-- organización: es exactamente lo que ya podía hacer vía is_my_group_branch,
-- ahora dicho en el modelo nuevo. Las políticas de la 053 siguen vivas, así
-- que esto no le quita nada — le da el mismo acceso por la vía nueva.
insert into restaurant_members (user_id, restaurant_id, role, permissions, status, created_at)
select p.id, r.id, 'OWNER', null, 'active', now()
from profiles p
join restaurants r on r.organization_id = p.organization_id
where p.role = 'GROUP_OWNER'
  and p.organization_id is not null
on conflict (user_id, restaurant_id) do nothing;

-- ── Helpers (SECURITY DEFINER para no recursar sobre RLS) ────
create or replace function public.is_member_of(rid uuid)
returns boolean language sql security definer stable
as $$
  select exists (
    select 1 from public.restaurant_members m
    where m.user_id = auth.uid()
      and m.restaurant_id = rid
      and m.status = 'active'
  );
$$;

comment on function public.is_member_of(uuid) is
  'Único punto de verdad del alcance de las membresías: ¿puede el usuario '
  'actual operar este restaurante? Lo usan todas las políticas aditivas de '
  'esta migración.';

create or replace function public.my_role_in(rid uuid)
returns text language sql security definer stable
as $$
  select m.role from public.restaurant_members m
  where m.user_id = auth.uid()
    and m.restaurant_id = rid
    and m.status = 'active';
$$;

-- Se revoca a los roles anónimos: son funciones de apoyo de las políticas,
-- no una API pública (mismo criterio que la migración 084/092).
revoke execute on function public.is_member_of(uuid) from public, anon;
revoke execute on function public.my_role_in(uuid) from public, anon;
grant execute on function public.is_member_of(uuid) to authenticated;
grant execute on function public.my_role_in(uuid) to authenticated;

-- ── Políticas aditivas por tabla ────────────────────────────
-- Mismo mecanismo que la migración 053, con dos diferencias:
--  · comprueba la existencia de cada tabla (`to_regclass`), porque el
--    catálogo cambia entre versiones — `promotions` se eliminó en la 093 y
--    una lista escrita a mano deja de poder reaplicarse en cuanto eso pasa;
--  · se acota a las tablas con `restaurant_id` propio; las hijas van abajo.
do $$
declare
  t text;
  direct_tables text[] := array[
    'categories', 'products', 'orders', 'customers',
    'ingredients', 'stock_movements', 'coupons',
    'suppliers', 'purchase_orders',
    'loyalty_accounts', 'loyalty_settings', 'loyalty_transactions',
    'reservations', 'order_ratings', 'waitlist_entries',
    'fel_documents', 'fel_settings', 'invoices', 'restaurant_billing',
    'print_agents', 'print_jobs', 'waiter_calls',
    'page_visits', 'activity_log', 'cash_counts', 'api_keys',
    'staff_pins', 'restaurant_devices', 'delivery_zones', 'gift_cards'
  ];
begin
  foreach t in array direct_tables loop
    if to_regclass('public.' || t) is null then
      continue;
    end if;
    execute format('drop policy if exists %I on %I', t || '_member', t);
    execute format(
      'create policy %I on %I for all to authenticated '
      'using (public.is_member_of(restaurant_id)) '
      'with check (public.is_member_of(restaurant_id))',
      t || '_member', t
    );
  end loop;
end $$;

-- ── restaurants: leer y actualizar los propios ──────────────
-- No se permite BORRAR desde aquí: dar de baja un restaurante toca el cobro
-- y se hace por su propio camino, no por una política genérica.
drop policy if exists "restaurants_select_member" on restaurants;
create policy "restaurants_select_member"
  on restaurants for select to authenticated
  using (public.is_member_of(id));

drop policy if exists "restaurants_update_member" on restaurants;
create policy "restaurants_update_member"
  on restaurants for update to authenticated
  using (public.is_member_of(id))
  with check (public.is_member_of(id));

-- ── restaurant_themes: su clave primaria es restaurant_id ────
drop policy if exists "themes_all_member" on restaurant_themes;
create policy "themes_all_member"
  on restaurant_themes for all to authenticated
  using (public.is_member_of(restaurant_id))
  with check (public.is_member_of(restaurant_id));

-- ── Tablas hijas (sin restaurant_id propio): vía su padre ────
do $$
begin
  if to_regclass('public.order_items') is not null then
    drop policy if exists "order_items_member" on order_items;
    create policy "order_items_member"
      on order_items for all to authenticated
      using (exists (select 1 from orders o where o.id = order_items.order_id and public.is_member_of(o.restaurant_id)))
      with check (exists (select 1 from orders o where o.id = order_items.order_id and public.is_member_of(o.restaurant_id)));
  end if;

  if to_regclass('public.recipe_items') is not null then
    drop policy if exists "recipe_items_member" on recipe_items;
    create policy "recipe_items_member"
      on recipe_items for all to authenticated
      using (exists (select 1 from products p where p.id = recipe_items.product_id and public.is_member_of(p.restaurant_id)))
      with check (exists (select 1 from products p where p.id = recipe_items.product_id and public.is_member_of(p.restaurant_id)));
  end if;

  if to_regclass('public.purchase_order_items') is not null then
    drop policy if exists "purchase_order_items_member" on purchase_order_items;
    create policy "purchase_order_items_member"
      on purchase_order_items for all to authenticated
      using (exists (select 1 from purchase_orders po where po.id = purchase_order_items.purchase_order_id and public.is_member_of(po.restaurant_id)))
      with check (exists (select 1 from purchase_orders po where po.id = purchase_order_items.purchase_order_id and public.is_member_of(po.restaurant_id)));
  end if;
end $$;

-- ── PIN de entrada al restaurante ───────────────────────────
-- La "credencial del restaurante" que se pide al abrirlo desde Mi cuenta.
-- NO es la credencial principal —para llegar aquí ya iniciaste sesión— sino
-- el candado que evita que una sesión abierta y desatendida se pasee por
-- todas las sucursales. Es opcional: sin PIN puesto, se entra directo, que
-- es lo que le conviene a quien tiene un solo restaurante.
alter table restaurants
  add column if not exists entry_pin_hash text,
  add column if not exists entry_pin_salt text;

comment on column restaurants.entry_pin_hash is
  'PIN que se pide al abrir este restaurante desde Mi cuenta. NULL = sin '
  'candado, se entra directo. Mismo cifrado que los PIN del personal '
  '(lib/staff-pin-crypto.ts): nunca se guarda en claro.';
