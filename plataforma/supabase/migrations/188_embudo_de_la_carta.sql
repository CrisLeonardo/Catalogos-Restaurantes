-- ============================================================
--  188 · El embudo de la carta (auditoría «La carta que vende», CV-37)
--  ------------------------------------------------------------
--  Sin línea base, cualquier mejora de la carta es una opinión. Esta
--  tabla cuenta, por canal, cuántos comensales llegan a cada paso:
--
--    apertura → ficha → agregar → checkout → pedido
--
--  y por qué puerta entraron: el QR de la mesa, el enlace general o el
--  enlace de un platillo (`?platillo=`).
--
--  ANÓNIMO a propósito: el `visitor_id` es el mismo identificador al
--  azar del aparato que ya usa page_visits; nada de nombres, teléfonos,
--  platillos buscados ni texto escrito. Un comensal cuenta una vez por
--  paso y por día (índice único), así recargar no infla nada.
--
--  RLS sin políticas permisivas: la escribe el servidor (acción con
--  límite por IP) y la lee el servidor para el panel del dueño. Lleva la
--  regla restrictiva del segundo factor (migración 137), como toda tabla
--  con RLS.
--
--  Aplicar ANTES o DESPUÉS de desplegar: si falta, la carta funciona
--  igual y simplemente no se cuenta (la escritura falla en silencio).
--  Independiente de la 187.
-- ============================================================

begin;

create table if not exists public.menu_embudo (
  id             bigint generated always as identity primary key,
  restaurant_id  uuid        not null references public.restaurants(id) on delete cascade,
  visitor_id     uuid        not null,
  canal          text        not null check (canal in ('mesa', 'general', 'platillo')),
  paso           text        not null check (paso in ('apertura', 'ficha', 'agregar', 'checkout', 'pedido')),
  dia            date        not null default ((now() at time zone 'America/Guatemala')::date),
  created_at     timestamptz not null default now()
);

-- Una vez por comensal, paso y día: recargar o abrir diez fichas no infla.
create unique index if not exists menu_embudo_unico
  on public.menu_embudo (restaurant_id, visitor_id, paso, dia);
create index if not exists menu_embudo_por_restaurante
  on public.menu_embudo (restaurant_id, dia);

alter table public.menu_embudo enable row level security;
drop policy if exists super_admin_segundo_factor on public.menu_embudo;
create policy super_admin_segundo_factor on public.menu_embudo
  as restrictive for all to authenticated
  using ((select public.leogin_sesion_con_segundo_factor()))
  with check ((select public.leogin_sesion_con_segundo_factor()));
revoke all on public.menu_embudo from public, anon, authenticated, service_role;
grant select, insert on public.menu_embudo to service_role;
grant usage on sequence public.menu_embudo_id_seq to service_role;

commit;
