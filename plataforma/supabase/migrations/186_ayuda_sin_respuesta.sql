-- ============================================================
--  186 · Lo que se busca en Ayuda y no tiene respuesta (ficha 2.9)
--  ------------------------------------------------------------
--  El Centro de ayuda ahora busca por lo que la persona necesita hacer
--  («no me entran pedidos», «cerrar por hoy»). Cuando una búsqueda no
--  encuentra respuesta ni guía, se anota aquí SOLO la frase y el
--  restaurante, sin quién la escribió: sirve para que Leogin agregue
--  respuestas (Superadmin › Configuración › Soporte), no para vigilar.
--
--  RLS sin políticas permisivas: la escribe y la lee el servidor con la
--  service role, como activity_log. Lleva la regla restrictiva del segundo
--  factor del Super Admin (migración 137), como toda tabla con RLS.
--
--  Aplicar ANTES o DESPUÉS de desplegar: si falta, la búsqueda funciona
--  igual y simplemente no se anota. Independiente de la 184 y la 185.
-- ============================================================

begin;

create table if not exists public.ayuda_sin_respuesta (
  id            uuid        primary key default gen_random_uuid(),
  restaurant_id uuid        references public.restaurants(id) on delete set null,
  frase         text        not null check (char_length(frase) between 3 and 120),
  created_at    timestamptz not null default now()
);

create index if not exists ayuda_sin_respuesta_fecha_idx on public.ayuda_sin_respuesta (created_at desc);

alter table public.ayuda_sin_respuesta enable row level security;
drop policy if exists super_admin_segundo_factor on public.ayuda_sin_respuesta;
create policy super_admin_segundo_factor on public.ayuda_sin_respuesta
  as restrictive for all to authenticated
  using ((select public.leogin_sesion_con_segundo_factor()))
  with check ((select public.leogin_sesion_con_segundo_factor()));
revoke all on public.ayuda_sin_respuesta from public, anon, authenticated, service_role;
grant select, insert on public.ayuda_sin_respuesta to service_role;

comment on table public.ayuda_sin_respuesta is
  'Búsquedas del Centro de ayuda sin respuesta (ficha 2.9). Solo la frase y el '
  'restaurante; nunca quién la escribió. La lee el superadmin para agregar respuestas.';

commit;
