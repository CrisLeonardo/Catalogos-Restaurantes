-- ============================================================
--  177 · Permisos por trabajo (auditoría 1.7: E12, N18, N19, F14, C05, R35)
--  ------------------------------------------------------------
--  Plan: docs/planes/PLAN_PERMISOS_POR_TRABAJO_2026-11-08.md
--
--  Antes, una lista de permisos `null` en el personal significaba «todo», en
--  la app (`can()`) y aquí (`leogin_puede`). Y operar la Caja exigía la
--  sección `finanzas`, que también enseña las utilidades. Esta migración:
--
--    1. Añade el puesto (plantilla de trabajo), la marca de «acceso
--       heredado» y el interruptor de arqueo ciego.
--    2. Convierte cada `null` del personal en una lista EXPLÍCITA con todo
--       lo que hoy puede hacer: nadie pierde acceso a mitad de un turno.
--    3. Separa la Caja en capacidades (`caja.cobrar`, `caja.abrir`, …):
--       quien tenía `finanzas` recibe todas; quien tenía `mesero` conserva
--       el cobro (`caja.cobrar`); el gerente conserva administrar personal.
--    4. Deja constancia de cada cambio en `activity_log` (motivo
--       `migracion_177`), visible en Personal.
--    5. Impide que vuelva a guardarse un `null` en el personal: si llega
--       uno (código anterior desplegado), se convierte en la lista heredada.
--    6. `leogin_puede` y los receptores de Caja dejan de leer `null` como
--       todo y entienden las capacidades nuevas.
--
--  ORDEN: aplicar ANTES de desplegar el código de la 1.7, después de la 176.
--  Con el código nuevo y sin esta migración, el personal con `null` se
--  quedaría sin acceso. Idempotente.
-- ============================================================
begin;

-- ── 1. Columnas ─────────────────────────────────────────────────────────
alter table public.restaurant_members
  add column if not exists puesto text,
  add column if not exists acceso_heredado boolean not null default false;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'restaurant_members_puesto_check') then
    alter table public.restaurant_members add constraint restaurant_members_puesto_check
      check (puesto is null or puesto in ('mesero', 'cocina', 'caja', 'recepcion', 'reparto', 'encargado'));
  end if;
end;
$$;

comment on column public.restaurant_members.puesto is
  'Plantilla de trabajo de la persona en este restaurante (177). NULL = permisos a medida. '
  'Los permisos efectivos siguen siendo los de `permissions`; el puesto sólo explica de dónde salen.';
comment on column public.restaurant_members.acceso_heredado is
  'La 177 convirtió un `null` (antes «todo») en una lista explícita. Se apaga cuando el dueño revisa a la persona.';

alter table public.restaurants
  add column if not exists arqueo_ciego boolean not null default false;
comment on column public.restaurants.arqueo_ciego is
  'Arqueo ciego (177): quien no tiene `caja.ver_esperado` cuenta el efectivo sin ver lo esperado.';

-- ── 2. La conversión, en una sola función pura ─────────────────────────
create or replace function public.leogin_permisos_heredados(p_role text)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  -- Todo lo que `can()` concedía con `null`, salvo la suscripción, que pasa
  -- a ser sólo del dueño. Más la Caja completa y, al gerente, el personal.
  select '["mesero","pedidos","lista_espera","cocina","catalogo","categorias","inventario",
           "ingredientes","clientes","metricas","analitica","finanzas","respaldo","fel",
           "proveedores","loyalty","whatsapp","reparto","repartidores","modulos","personalizar",
           "perfil","ajustes","mesas","impresion","qr","ayuda",
           "caja.cobrar","caja.abrir","caja.salida","caja.cerrar","caja.ver_esperado",
           "caja.corregir","caja.devolver"]'::jsonb
         || case when p_role = 'MANAGER' then '["personal"]'::jsonb else '[]'::jsonb end
$$;

create or replace function public.leogin_permisos_por_trabajo(p_role text, p_perms jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v jsonb;
  extra text;
  todas_caja constant text[] := array['caja.cobrar','caja.abrir','caja.salida','caja.cerrar',
                                      'caja.ver_esperado','caja.corregir','caja.devolver'];
begin
  if p_perms is null or jsonb_typeof(p_perms) <> 'array' then
    return public.leogin_permisos_heredados(p_role);
  end if;

  v := p_perms - 'suscripcion';
  if v ? 'finanzas' then
    foreach extra in array todas_caja loop
      if not v ? extra then v := v || to_jsonb(extra); end if;
    end loop;
  end if;
  if v ? 'mesero' and not v ? 'caja.cobrar' then
    v := v || '["caja.cobrar"]'::jsonb;
  end if;
  if p_role = 'MANAGER' and not v ? 'personal' then
    v := v || '["personal"]'::jsonb;
  end if;
  return v;
end;
$$;

create or replace function public.leogin_puesto_inferido(p_perms jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_perms is null or jsonb_typeof(p_perms) <> 'array' then null
    when p_perms @> '["mesero","caja.cobrar"]' and '["mesero","caja.cobrar"]' @> p_perms then 'mesero'
    when p_perms @> '["cocina"]' and '["cocina"]' @> p_perms then 'cocina'
    when p_perms @> '["reparto"]' and '["reparto"]' @> p_perms then 'reparto'
    else null
  end
$$;

-- ── 3. Membresías: convertir y dejar constancia ────────────────────────
with calc as (
  select m.user_id, m.restaurant_id, m.permissions as antes,
         public.leogin_permisos_por_trabajo(m.role, m.permissions) as despues,
         (m.permissions is null or jsonb_typeof(m.permissions) <> 'array') as heredado
    from public.restaurant_members m
   where m.role in ('STAFF', 'MANAGER')
), upd as (
  update public.restaurant_members m
     set permissions = c.despues,
         acceso_heredado = m.acceso_heredado or c.heredado
    from calc c
   where m.user_id = c.user_id and m.restaurant_id = c.restaurant_id
     and c.antes is distinct from c.despues
  returning m.user_id, m.restaurant_id, c.antes, c.despues, c.heredado
)
insert into public.activity_log (restaurant_id, actor_id, action, entity, meta)
select u.restaurant_id, null, 'permisos', coalesce(nullif(btrim(p.full_name), ''), 'Sin nombre'),
       jsonb_build_object('motivo', 'migracion_177', 'user_id', u.user_id,
                          'antes', u.antes, 'despues', u.despues, 'heredado', u.heredado)
  from upd u left join public.profiles p on p.id = u.user_id;

update public.restaurant_members
   set puesto = public.leogin_puesto_inferido(permissions)
 where puesto is null and role in ('STAFF', 'MANAGER')
   and public.leogin_puesto_inferido(permissions) is not null;

-- ── 4. Perfiles (el modelo anterior) con la misma regla ────────────────
with calc as (
  select p.id, p.restaurant_id, p.full_name, p.permissions as antes,
         public.leogin_permisos_por_trabajo(
           case when exists (select 1 from public.restaurant_members m
                              where m.user_id = p.id and m.restaurant_id = p.restaurant_id
                                and m.role = 'MANAGER') then 'MANAGER' else 'STAFF' end,
           p.permissions) as despues,
         (p.permissions is null or jsonb_typeof(p.permissions) <> 'array') as heredado,
         exists (select 1 from public.restaurant_members m
                  where m.user_id = p.id and m.restaurant_id = p.restaurant_id) as con_membresia
    from public.profiles p
   where p.role = 'RESTAURANT_STAFF'
), upd as (
  update public.profiles p
     set permissions = c.despues
    from calc c
   where p.id = c.id and c.antes is distinct from c.despues
  returning c.*
)
insert into public.activity_log (restaurant_id, actor_id, action, entity, meta)
select u.restaurant_id, null, 'permisos', coalesce(nullif(btrim(u.full_name), ''), 'Sin nombre'),
       jsonb_build_object('motivo', 'migracion_177', 'user_id', u.id,
                          'antes', u.antes, 'despues', u.despues, 'heredado', u.heredado)
  from upd u
 where u.restaurant_id is not null and not u.con_membresia;

-- ── 5. Nunca más un `null` en el personal ──────────────────────────────
create or replace function public.leogin_miembro_sin_null()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.role in ('STAFF', 'MANAGER')
     and (new.permissions is null or jsonb_typeof(new.permissions) <> 'array') then
    new.permissions := public.leogin_permisos_heredados(new.role);
    new.acceso_heredado := true;
  end if;
  return new;
end;
$$;

drop trigger if exists leogin_miembro_sin_null on public.restaurant_members;
create trigger leogin_miembro_sin_null
  before insert or update of role, permissions on public.restaurant_members
  for each row execute function public.leogin_miembro_sin_null();

create or replace function public.leogin_perfil_sin_null()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.role = 'RESTAURANT_STAFF'
     and (new.permissions is null or jsonb_typeof(new.permissions) <> 'array') then
    new.permissions := public.leogin_permisos_heredados('STAFF');
  end if;
  return new;
end;
$$;

drop trigger if exists leogin_perfil_sin_null on public.profiles;
create trigger leogin_perfil_sin_null
  before insert or update of role, permissions on public.profiles
  for each row execute function public.leogin_perfil_sin_null();

-- ── 6. Las reglas de la base ya no leen `null` como todo ───────────────
create or replace function public.leogin_puede(p_restaurant uuid, variadic p_secciones text[])
returns boolean
language sql
stable
set search_path = public
as $$
  select
    exists (
      select 1 from restaurant_members m
       where m.user_id = auth.uid()
         and m.restaurant_id = p_restaurant
         and m.status = 'active'
         and (
           m.role = 'OWNER'
           or (m.role in ('MANAGER', 'STAFF')
               and jsonb_typeof(m.permissions) = 'array' and m.permissions ?| p_secciones)
           or (m.role = 'WAITER' and p_secciones && array['mesero', 'caja.cobrar'])
         )
    )
    or exists (
      select 1 from profiles p
       where p.id = auth.uid()
         and p.restaurant_id = p_restaurant
         and (
           p.role = 'RESTAURANT_OWNER'
           or (p.role = 'RESTAURANT_STAFF'
               and jsonb_typeof(p.permissions) = 'array' and p.permissions ?| p_secciones)
           or (p.role = 'RESTAURANT_WAITER' and p_secciones && array['mesero', 'caja.cobrar'])
         )
    )
    or public.is_my_group_branch(p_restaurant)
    or public.get_my_role() = 'SUPER_ADMIN';
$$;

-- Recibir una caja es abrir el turno siguiente: lo puede quien abre caja.
create or replace function public.leogin_receptores_caja(p_restaurant uuid)
returns table (id uuid, nombre text)
language sql stable security invoker set search_path='' as $$
  select p.id, coalesce(nullif(btrim(p.full_name), ''), 'Sin nombre')
  from public.restaurant_members m join public.profiles p on p.id=m.user_id
  where m.restaurant_id=p_restaurant and m.status='active'
    and (m.role='OWNER' or (m.role in ('MANAGER','STAFF')
      and jsonb_typeof(m.permissions)='array' and m.permissions ? 'caja.abrir'))
  union all
  select p.id, coalesce(nullif(btrim(p.full_name), ''), 'Sin nombre')
  from public.profiles p
  where p.restaurant_id=p_restaurant
    and (p.role='RESTAURANT_OWNER' or (p.role='RESTAURANT_STAFF'
      and jsonb_typeof(p.permissions)='array' and p.permissions ? 'caja.abrir'))
    and not exists (select 1 from public.restaurant_members m
      where m.restaurant_id=p_restaurant and m.user_id=p.id)
$$;

commit;
