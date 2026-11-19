-- ============================================================
--  189 · Estados del día (auditoría «La carta que vende», CV-32)
--  ------------------------------------------------------------
--  El dueño sube una foto desde el teléfono («Salió la lasaña»,
--  «Malteadas 2 × Q45 de 3 a 6») y aparece arriba de la carta como un
--  círculo, igual que un estado de WhatsApp. Caduca sola a las 24 h.
--  Tocarlo abre la foto a pantalla completa y, si va ligado a un
--  platillo, «Ver y pedir».
--
--  · imagen_url: la foto ya subida al bucket del restaurante (carpeta
--    `estados/`), como las de los platillos.
--  · platillo_id: opcional; si el platillo se borra, el estado queda sin
--    enlace (no se borra).
--  · expira_at: 24 h después de publicarse. La carta solo lee los vigentes.
--
--  RLS sin políticas permisivas: lo escribe el servidor después de
--  comprobar el permiso «catalogo» (lib/actions/estados.ts) y lo lee el
--  servidor para la carta pública. Lleva la regla restrictiva del segundo
--  factor (migración 137), como toda tabla con RLS.
--
--  Aplicar ANTES de desplegar: sin la tabla, el panel dice que falta y la
--  carta simplemente no pinta estados. Independiente de la 188.
-- ============================================================

begin;

create table if not exists public.menu_estados (
  id             uuid        primary key default gen_random_uuid(),
  restaurant_id  uuid        not null references public.restaurants(id) on delete cascade,
  imagen_url     text        not null check (char_length(imagen_url) between 1 and 600),
  texto          text        check (texto is null or char_length(texto) <= 80),
  platillo_id    uuid        references public.products(id) on delete set null,
  creado_por     uuid,
  created_at     timestamptz not null default now(),
  expira_at      timestamptz not null default (now() + interval '24 hours')
);

create index if not exists menu_estados_vigentes
  on public.menu_estados (restaurant_id, expira_at desc);

alter table public.menu_estados enable row level security;
drop policy if exists super_admin_segundo_factor on public.menu_estados;
create policy super_admin_segundo_factor on public.menu_estados
  as restrictive for all to authenticated
  using ((select public.leogin_sesion_con_segundo_factor()))
  with check ((select public.leogin_sesion_con_segundo_factor()));
revoke all on public.menu_estados from public, anon, authenticated, service_role;
grant select, insert, delete on public.menu_estados to service_role;

commit;
