-- ============================================================
--  187 · La cola de trabajo del superadmin (ficha 4.9, línea N)
--  ------------------------------------------------------------
--  El inicio del superadmin era una lista de avisos sin estado: si ya
--  le escribiste al restaurante, mañana el aviso salía igual y no
--  quedaba rastro de lo que hiciste. Ahora cada asunto (servicio
--  afectado, cobranza, activación, seguimiento) se puede posponer con
--  motivo y fecha, marcar resuelto y anotar, y queda la historia.
--
--  · super_asuntos: el estado VIGENTE de un asunto, por su clave estable
--    (`tipo:id`). Guarda la evidencia con la que se resolvió o pospuso:
--    si la evidencia cambia (otra caída, otro cobro), el asunto vuelve.
--  · super_eventos: lo que pasó (pospuso, resolvió, reabrió, nota), con
--    autor. Las notas de soporte de la ficha también viven aquí.
--
--  RLS sin políticas permisivas: las escribe y las lee el servidor con la
--  service role, después de comprobar que es un SUPER_ADMIN. Llevan la
--  regla restrictiva del segundo factor (migración 137), como toda tabla
--  con RLS.
--
--  Aplicar ANTES de desplegar. Si falta, la cola se ve igual pero sin
--  estados ni notas (la pantalla lo dice). Independiente de la 184–186.
-- ============================================================

begin;

create table if not exists public.super_asuntos (
  clave           text        primary key check (char_length(clave) between 3 and 120),
  restaurant_id   uuid        references public.restaurants(id) on delete cascade,
  estado          text        not null check (estado in ('pospuesto', 'resuelto')),
  hasta           timestamptz,
  motivo          text        check (motivo is null or char_length(motivo) <= 200),
  evidencia       text        not null default '' check (char_length(evidencia) <= 200),
  actualizado_por uuid        references auth.users(id) on delete set null,
  actualizado_en  timestamptz not null default now(),
  check (estado <> 'pospuesto' or hasta is not null)
);

create index if not exists super_asuntos_restaurante_idx on public.super_asuntos (restaurant_id);

create table if not exists public.super_eventos (
  id             uuid        primary key default gen_random_uuid(),
  clave          text        check (clave is null or char_length(clave) <= 120),
  restaurant_id  uuid        references public.restaurants(id) on delete cascade,
  tipo           text        not null check (tipo in ('pospuso', 'resolvio', 'reabrio', 'nota')),
  texto          text        check (texto is null or char_length(texto) <= 600),
  autor          uuid        references auth.users(id) on delete set null,
  autor_nombre   text        check (autor_nombre is null or char_length(autor_nombre) <= 120),
  creado_en      timestamptz not null default now()
);

create index if not exists super_eventos_restaurante_idx on public.super_eventos (restaurant_id, creado_en desc);
create index if not exists super_eventos_clave_idx on public.super_eventos (clave, creado_en desc);

alter table public.super_asuntos enable row level security;
drop policy if exists super_admin_segundo_factor on public.super_asuntos;
create policy super_admin_segundo_factor on public.super_asuntos
  as restrictive for all to authenticated
  using ((select public.leogin_sesion_con_segundo_factor()))
  with check ((select public.leogin_sesion_con_segundo_factor()));
revoke all on public.super_asuntos from public, anon, authenticated, service_role;
grant select, insert, update, delete on public.super_asuntos to service_role;

alter table public.super_eventos enable row level security;
drop policy if exists super_admin_segundo_factor on public.super_eventos;
create policy super_admin_segundo_factor on public.super_eventos
  as restrictive for all to authenticated
  using ((select public.leogin_sesion_con_segundo_factor()))
  with check ((select public.leogin_sesion_con_segundo_factor()));
revoke all on public.super_eventos from public, anon, authenticated, service_role;
grant select, insert on public.super_eventos to service_role;

comment on table public.super_asuntos is
  'Estado vigente de cada asunto de la cola del superadmin (ficha 4.9): pospuesto '
  'hasta una fecha o resuelto, con la evidencia de ese momento. Si la evidencia '
  'cambia, el asunto vuelve a la cola.';
comment on table public.super_eventos is
  'Historia de la cola del superadmin y notas de soporte por restaurante, con autor.';

commit;
