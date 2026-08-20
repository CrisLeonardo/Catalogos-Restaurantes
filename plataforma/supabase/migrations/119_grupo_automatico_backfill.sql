/* ============================================================
   119 — Grupo automático para quien YA tenía 2+ restaurantes propios
   ------------------------------------------------------------
   Desde hoy, crear el segundo restaurante propio en Mi cuenta arma el
   grupo solo (ver mi-cuenta.ts, createAnotherRestaurant): nace la
   organización, y con ella el panel consolidado en Mi cuenta y el aviso
   "volver al grupo" dentro de cada sucursal — la pieza que le faltaba al
   modelo de membresías (PLAN_ACCESO_MULTICUENTA.md §1 y §2: antes, "dueño
   de 2+ locales" solo existía si Leogin le armaba el grupo a mano).

   Esta migración hace lo mismo, una sola vez, para quien YA tenía 2+
   restaurantes de antes de ese cambio: sin esto se quedarían sin el panel
   para siempre, porque nada dispara la creación del grupo si no crean un
   restaurante nuevo.

   Un dueño "elegible" es quien tiene 2+ membresías OWNER activas en
   restaurantes que hoy no pertenecen a ningún grupo, y él mismo tampoco.
   Si alguno de sus restaurantes YA está en un grupo (organization_id no
   nulo), se deja tal cual: es una asignación que Leogin hizo a mano y no
   hay que tocarla.
   ============================================================ */

do $$
declare
  r record;
  v_org_id uuid;
  v_slug text;
  v_base text;
  v_n int;
  v_owners int := 0;
begin
  for r in
    select p.id as user_id, p.full_name, u.email,
           array_agg(m.restaurant_id) as restaurant_ids
      from profiles p
      join auth.users u on u.id = p.id
      join restaurant_members m on m.user_id = p.id and m.role = 'OWNER' and m.status = 'active'
      join restaurants rr on rr.id = m.restaurant_id
     where p.organization_id is null
     group by p.id, p.full_name, u.email
    having count(*) >= 2
       and bool_and(rr.organization_id is null)
  loop
    v_base := lower(regexp_replace(coalesce(r.full_name, 'grupo'), '[^a-zA-Z0-9]+', '-', 'g'));
    v_base := trim(both '-' from v_base);
    if v_base = '' then v_base := 'grupo'; end if;
    v_base := left(v_base, 56);

    v_slug := v_base;
    v_n := 1;
    while exists (select 1 from organizations where slug = v_slug)
       or exists (select 1 from restaurants where slug = v_slug) loop
      v_n := v_n + 1;
      v_slug := left(v_base, 52) || '-' || v_n;
    end loop;

    insert into organizations (name, slug, contact_email)
    values (
      case when r.full_name is not null then 'Restaurantes de ' || r.full_name else 'Mis restaurantes' end,
      v_slug,
      r.email
    )
    returning id into v_org_id;

    update restaurants set organization_id = v_org_id where id = any(r.restaurant_ids);
    update profiles set organization_id = v_org_id where id = r.user_id;

    v_owners := v_owners + 1;
  end loop;

  raise notice 'Grupos creados automaticamente para % dueños con 2+ restaurantes sueltos.', v_owners;
end $$;
