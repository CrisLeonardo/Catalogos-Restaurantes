/* ============================================================
   116 — Se retira el rol GROUP_OWNER
   ------------------------------------------------------------
   Venía de la 024, cuando "dueño de una cadena" no tenía otra forma de
   expresarse. Desde la 113 sí la tiene: `restaurant_members` dice quién
   entra a qué y con qué papel, y a cada GROUP_OWNER ya se le sembró una
   membresía OWNER en cada sucursal de su grupo.

   Desde entonces conviven dos formas de decir lo mismo, y eso siempre
   acaba igual: alguien arregla una y se olvida de la otra.

   QUÉ CAMBIA Y QUÉ NO
   El vínculo con el grupo NO se toca: sigue siendo
   `profiles.organization_id`. Lo que se retira es el ROL. Hoy las dos
   cosas van siempre juntas —el único sitio que pone `organization_id` es
   el alta de jefe de grupo del super admin, que pone las dos a la vez—,
   así que mirar solo la organización es exactamente equivalente y no
   cambia el alcance de nadie.

   ORDEN IMPORTANTE: primero se afloja la comprobación de RLS y después se
   convierten los roles. Al revés, y entre una sentencia y otra los jefes
   de grupo se quedarían sin acceso a sus sucursales.
   ============================================================ */

-- ── 1. El candado de RLS deja de mirar el rol ───────────────
-- Único punto de verdad del alcance de un grupo (viene de la 053). Ahora
-- se apoya solo en la organización del perfil.
create or replace function public.is_my_group_branch(rid uuid)
returns boolean language sql security definer stable
as $$
  select
    public.get_my_org_id() is not null
    and exists (
      select 1 from public.restaurants r
      where r.id = rid
        and r.organization_id = public.get_my_org_id()
    );
$$;

comment on function public.is_my_group_branch(uuid) is
  'True si la sucursal pertenece a la organización del perfil actual. Desde la 116 no mira el rol: quien administra un grupo se reconoce por profiles.organization_id.';

-- ── 2. Membresías de las sucursales que se hayan añadido después ─
-- La 113 sembró las de entonces; una sucursal asignada al grupo más tarde
-- no tendría la suya. Se rellenan antes de tocar el rol, que es lo que
-- todavía permite reconocerlos.
insert into restaurant_members (user_id, restaurant_id, role, permissions, status, created_at)
select p.id, r.id, 'OWNER', null, 'active', now()
from profiles p
join restaurants r on r.organization_id = p.organization_id
where p.role = 'GROUP_OWNER'
  and p.organization_id is not null
on conflict (user_id, restaurant_id) do nothing;

-- ── 3. El rol se convierte en dueño normal ──────────────────
-- Conservan `organization_id`, que es lo que les da el panel del grupo.
update profiles
   set role = 'RESTAURANT_OWNER'
 where role = 'GROUP_OWNER';

-- ── 4. Fuera de la lista de roles válidos ───────────────────
do $$
declare v_con text;
begin
  select conname into v_con
    from pg_constraint
   where conrelid = 'public.profiles'::regclass
     and contype = 'c'
     and pg_get_constraintdef(oid) like '%GROUP_OWNER%';
  if v_con is not null then
    execute format('alter table public.profiles drop constraint %I', v_con);
    alter table public.profiles
      add constraint profiles_role_check
      check (role in ('SUPER_ADMIN', 'RESTAURANT_OWNER', 'RESTAURANT_STAFF', 'RESTAURANT_WAITER'));
  end if;
end $$;

comment on column public.profiles.organization_id is
  'Grupo que administra esta persona: ve el panel consolidado y entra a cualquiera de sus sucursales. Desde la 116 esto —y no un rol— es lo que define a un jefe de grupo.';

-- ── 5. Comprobación ─────────────────────────────────────────
do $$
declare v_quedan int; v_jefes int; v_sin_membresia int;
begin
  select count(*) into v_quedan from profiles where role = 'GROUP_OWNER';
  if v_quedan > 0 then
    raise exception 'Quedan % perfiles con GROUP_OWNER: la conversion no se completo.', v_quedan;
  end if;

  select count(*) into v_jefes from profiles where organization_id is not null;

  select count(*) into v_sin_membresia
    from profiles p
    join restaurants r on r.organization_id = p.organization_id
   where p.organization_id is not null
     and not exists (
       select 1 from restaurant_members m
       where m.user_id = p.id and m.restaurant_id = r.id
     );
  if v_sin_membresia > 0 then
    raise exception 'Hay % sucursales de grupo sin membresia de su jefe.', v_sin_membresia;
  end if;

  raise notice 'GROUP_OWNER retirado. % jefes de grupo conservan su acceso por organization_id.', v_jefes;
end $$;
