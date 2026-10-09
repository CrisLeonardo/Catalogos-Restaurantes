-- ============================================================
--  137 · El Super Admin solo ve datos con el segundo factor puesto
--  ------------------------------------------------------------
--  PLAN_ACCESO_Y_MONITOREO_2026-10-08, ACC-02.
--
--  La app ya exige el segundo factor (TOTP) al Super Admin antes de abrir
--  /super, de devolver el cliente de servicio (`currentSuperAdmin`) y de
--  entrar al panel de un restaurante. Pero eso vive en el SITIO: con la
--  contraseña robada, alguien puede pedirle el token directo a Supabase
--  (`/auth/v1/token`, con la clave anon que es pública) y consultar
--  PostgREST sin pasar nunca por esas pantallas. Y ~50 reglas de RLS le
--  abren todo a `role = 'SUPER_ADMIN'`.
--
--  Por eso el candado se repite aquí: una regla RESTRICTIVA en cada tabla
--  (las restrictivas se suman con AND a las demás; no abren nada, solo
--  cierran) que deja pasar a cualquiera que NO sea Super Admin, y al Super
--  Admin solo si su sesión es `aal2` —es decir, si en esta sesión ya
--  escribió el código de su app autenticadora—.
--
--    · Dueños, gerentes, personal de PIN y comensales: sin ningún cambio.
--    · Sin excepciones, ni siquiera su propio perfil: la app no lo necesita
--      (a la pantalla del código se le manda por la marca de abajo, que
--      viaja en el usuario de Auth, no en `profiles`).
--    · El cliente de servicio, el editor SQL y las funciones `security
--      definer` no pasan por RLS: no cambian.
--
--  Y una MARCA en la cuenta de Auth (`app_metadata.requiere_segundo_factor`):
--  `getStaffUser()` la lee para tratar como «sin sesión» a un Super Admin
--  que aún no verificó el código —también ANTES de haberse inscrito, que es
--  cuando todavía no tiene factor que lo delate—. `app_metadata` solo lo
--  puede escribir el servidor; el usuario no se la puede quitar.
--
--  Una tabla NUEVA con RLS no lleva esta regla sola: hay que volver a
--  correr el bloque de abajo (es idempotente) o añadirla en su migración.
--
--  Idempotente. Ejecutar DESPUÉS de 001..136.
-- ============================================================

-- ¿Esta sesión puede leer datos? Todos sí; el Super Admin, solo con el
-- segundo factor ya verificado. `get_my_role()` es security definer
-- (migración 003), así que leer el rol aquí no vuelve a pasar por RLS.
create or replace function public.leogin_sesion_con_segundo_factor()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
      or public.get_my_role() is distinct from 'SUPER_ADMIN';
$$;

do $$
declare
  t text;
begin
  for t in
    select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind in ('r', 'p')
       and c.relrowsecurity
  loop
    execute format('drop policy if exists %I on public.%I', 'super_admin_segundo_factor', t);

    -- `(select …)` hace que Postgres la evalúe UNA vez por consulta, no
    -- una vez por fila.
    execute format(
      'create policy %I on public.%I as restrictive for all to authenticated
         using ((select public.leogin_sesion_con_segundo_factor()))
         with check ((select public.leogin_sesion_con_segundo_factor()))',
      'super_admin_segundo_factor', t);
  end loop;
end;
$$;

-- ── La marca en la cuenta de Auth ─────────────────────────────────────
--    Los Super Admin de hoy, y cualquiera que llegue a serlo mañana (se
--    nombran a mano, por SQL: el disparador cubre ese camino). Al dejar de
--    serlo se le quita.
update auth.users u
   set raw_app_meta_data = coalesce(u.raw_app_meta_data, '{}'::jsonb)
                           || jsonb_build_object('requiere_segundo_factor', true)
 where exists (select 1 from public.profiles p where p.id = u.id and p.role = 'SUPER_ADMIN');

create or replace function public.leogin_marcar_segundo_factor()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.role = 'SUPER_ADMIN' then
    update auth.users
       set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
                               || jsonb_build_object('requiere_segundo_factor', true)
     where id = new.id;
  elsif tg_op = 'UPDATE' and old.role = 'SUPER_ADMIN' then
    update auth.users
       set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) - 'requiere_segundo_factor'
     where id = new.id;
  end if;
  return new;
end;
$$;

-- Es de disparador: nadie la llama por RPC (scripts/audit-security-definer.mjs).
revoke execute on function public.leogin_marcar_segundo_factor() from public, anon, authenticated;

drop trigger if exists marcar_segundo_factor on public.profiles;
create trigger marcar_segundo_factor
  after insert or update of role on public.profiles
  for each row execute function public.leogin_marcar_segundo_factor();
