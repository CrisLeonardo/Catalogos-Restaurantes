-- ============================================================
--  136 · Candados de escritura: nadie se sube de rango por su cuenta
--  ------------------------------------------------------------
--  Encontrado el 2026-10-08 (PLAN_ACCESO_Y_MONITOREO, SEC-01/02) y
--  REPRODUCIDO contra la base local con una cuenta desechable, usando solo
--  la clave anon —la que va en el JS del navegador—:
--
--    · `profiles_insert_own` y `profiles_update_own` (migración 003) no
--      miraban COLUMNAS. Cualquier sesión podía hacer
--      `PATCH /rest/v1/profiles?id=eq.<yo> {"role":"SUPER_ADMIN"}` —o
--      crearse el perfil así si no tenía uno, que es el caso de un COMENSAL
--      que entró con Google— y desde ese momento las ~50 reglas que dicen
--      «role = 'SUPER_ADMIN'» le abrían todos los restaurantes. Lo mismo
--      con `restaurant_id` (meterse en el local de otro) y `permissions`.
--    · `restaurants_update_member` deja escribir la fila del restaurante a
--      cualquier miembro (también al mesero de PIN): un dueño en Básico se
--      podía poner `plan_actual = 'PREMIUM'`, y el disparador de la 095 le
--      encendía los módulos solo.
--    · `restaurant_billing`, `staff_pins`, `restaurant_devices`, `api_keys`,
--      `print_agents` y `activity_log` daban TODO (`for all`) a cualquier
--      miembro: marcarse cobros, leer los hashes de PIN de los compañeros
--      (4 cifras: se rompen sin conexión en segundos), meter su celular como
--      aparato de confianza, crear llaves de API o borrar la bitácora.
--
--  La app NO escribe ninguna de esas cosas con la sesión del usuario:
--  todas pasan por el cliente de servicio después de su propia
--  comprobación (verificado archivo por archivo). La única excepción es
--  `restaurants`, donde el dueño guarda nombre, horario, zona, etc. con su
--  sesión — por eso ahí no se cierra la tabla: se cierran COLUMNAS.
--
--  Los candados de columnas son DISPARADORES, no reglas, a propósito: una
--  regla nueva escrita mañana (`for update using (...)`) no puede volver a
--  abrir el hueco sin que nadie lo note. El disparador mira `current_user`:
--  por PostgREST con una sesión normal vale `authenticated`/`anon`; el
--  cliente de servicio, el editor SQL y las funciones `security definer`
--  (place_order y compañía) no se tocan.
--
--  Idempotente. Ejecutar DESPUÉS de 001..135. URGENTE en producción.
-- ============================================================

-- ── 1. PROFILES: el perfil lo escribe solo el servidor ────────────────
drop policy if exists "profiles_insert_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;

create or replace function public.leogin_candado_perfil()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    raise exception 'Los perfiles solo se crean desde el servidor.'
      using errcode = '42501';
  end if;

  -- Lo único que una sesión podría cambiar de su perfil es su nombre. Hoy
  -- no queda ninguna regla que se lo deje hacer; esto es la red debajo.
  if (to_jsonb(new) - 'full_name') is distinct from (to_jsonb(old) - 'full_name') then
    raise exception 'Ese dato del perfil solo se cambia desde el servidor.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists candado_perfil on public.profiles;
create trigger candado_perfil
  before insert or update on public.profiles
  for each row execute function public.leogin_candado_perfil();

-- ── 2. RESTAURANTS: el dueño edita su ficha, no su plan ───────────────
--    El nombre del disparador empieza por «c» para correr ANTES que
--    `trg_restaurant_plan_floor` (los BEFORE se disparan por orden
--    alfabético): ese reescribe `modules` en cada UPDATE y, si corriera
--    primero, cualquier guardado del horario parecería tocar los módulos.
create or replace function public.leogin_candado_restaurante()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  k text;
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    raise exception 'Los restaurantes solo se crean desde el servidor.'
      using errcode = '42501';
  end if;

  -- Por clave de jsonb y no por columna: si una columna no existe todavía
  -- en esta base (migración sin aplicar), la comparación da igual y no
  -- revienta el UPDATE.
  foreach k in array array[
    'id', 'slug', 'plan_actual', 'modules', 'status', 'organization_id',
    'entry_pin_hash', 'entry_pin_salt', 'pin_requires_trusted_device'
  ] loop
    if (to_jsonb(new) -> k) is distinct from (to_jsonb(old) -> k) then
      raise exception 'El campo % solo se cambia desde el servidor.', k
        using errcode = '42501';
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists candado_columnas_restaurante on public.restaurants;
create trigger candado_columnas_restaurante
  before insert or update on public.restaurants
  for each row execute function public.leogin_candado_restaurante();

-- ── 3. STAFF_PINS: ni leer ni escribir con sesión ─────────────────────
--    Toda la app (alta, cambio, verificación, bloqueo por intentos, la
--    lista para el hub) usa el cliente de servicio.
drop policy if exists "staff_pins_member" on public.staff_pins;

-- ── 4. Solo lectura para los miembros ─────────────────────────────────
--    Se mantiene la LECTURA (no se rompe ninguna pantalla que algún día la
--    lea con la sesión); la escritura queda para el servidor.
do $$
declare
  t text;
begin
  foreach t in array array[
    'restaurant_billing', 'restaurant_devices', 'api_keys', 'print_agents', 'activity_log'
  ] loop
    if to_regclass('public.' || t) is null then
      continue;
    end if;

    execute format('drop policy if exists %I on public.%I', t || '_member', t);
    execute format('drop policy if exists %I on public.%I', t || '_group_owner', t);
    execute format('drop policy if exists %I on public.%I', t || '_member_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_group_owner_select', t);

    execute format(
      'create policy %I on public.%I for select to authenticated using (public.is_member_of(restaurant_id))',
      t || '_member_select', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.is_my_group_branch(restaurant_id))',
      t || '_group_owner_select', t);
  end loop;
end;
$$;

-- `restaurant_devices` nunca tuvo regla de dueño de grupo; la de arriba le
-- añade solo LECTURA, igual que a las demás. Sin cambio de comportamiento
-- para la app (todo va por el cliente de servicio).
