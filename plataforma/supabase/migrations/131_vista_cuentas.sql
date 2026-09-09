-- ============================================================
--  131 · La vista de cuentas (fase 1 de PLAN_ADMINISTRACION_DE_CUENTAS.md)
--  ------------------------------------------------------------
--  El Super Admin sabe administrar restaurantes; no sabe que existen
--  las personas. No hay una sola consulta en el proyecto que lea
--  `profiles` sin un `restaurant_id` de entrada, así que una cuenta
--  que todavía no ha creado su restaurante —o cuyo restaurante se
--  borró— no aparece en ninguna pantalla. Está atascada y es invisible
--  a la vez.
--
--  Lo que falta para poder listarlas es un dato que no está en
--  `profiles`: EL CORREO. Vive en `auth.users`, que PostgREST no
--  expone. Las dos salidas eran copiar el correo a `profiles` —dos
--  verdades, uno se desincroniza— o esta vista. Esta vista.
--
--  ── POR QUÉ NO ES UNA FUGA ──────────────────────────────────
--
--  Supabase reparte por defecto los permisos de todo lo nuevo en
--  `public` a `anon` y `authenticated` (ALTER DEFAULT PRIVILEGES).
--  Crear esta vista y no decir nada más publicaría el correo de todo
--  el personal de todos los restaurantes a cualquiera que tenga la
--  clave anónima, que va escrita en el navegador. Por eso el REVOKE
--  de abajo no es higiene: es la mitad importante de la migración.
--
--  Solo `service_role` la lee, que es como leen ya todas las
--  pantallas del Super Admin (`createServiceClient`).
--
--  ── QUÉ NO CUENTA LA VISTA ──────────────────────────────────
--
--  No trae el número de locales de cada quien, a propósito. Se puede
--  pertenecer a un restaurante por DOS caminos —`restaurant_members`
--  (el modelo nuevo) y `profiles.restaurant_id` (el de siempre, que
--  es el que sigue escribiendo el alta del Super Admin)— y contar
--  solo el primero marcaría como «sin ningún local» justo a las
--  cuentas que creaste tú. Ese cruce se hace arriba, en
--  `lib/db/accounts.ts`, donde se ven los dos.
--
--  Los COMENSALES no salen aquí y no hace falta excluirlos: son
--  `auth.users` pero no tienen fila en `profiles` (viven en
--  `customers`), y no hay ningún disparador que se la cree. El JOIN
--  ya es el filtro.
--
--  Ejecutar DESPUÉS de 001..130.
-- ============================================================

create or replace view public.admin_accounts as
select
  p.id,
  p.full_name,
  p.role,
  p.restaurant_id,
  p.organization_id,
  -- Cuándo confirmó SU correo abriendo nuestro enlace (migración 109).
  -- No confundir con `email_confirmed_at` de Auth: el alta lo pone en
  -- verdadero desde el primer segundo (`email_confirm: true`) para que
  -- la persona pueda entrar de una vez, así que ahí siempre hay fecha y
  -- no distingue nada. La única señal real de que el buzón existe es
  -- esta columna.
  p.email_verified_at,
  u.email,
  u.created_at,
  u.last_sign_in_at,
  -- Cuenta suspendida desde el panel de Supabase (o desde la fase 5).
  u.banned_until,
  -- Cómo entra: 'email' (correo y contraseña), 'google', o las dos.
  -- Sale de `auth.identities`, que es la verdad; `raw_app_meta_data`
  -- guarda una copia que puede quedarse vieja.
  coalesce(
    (
      select array_agg(i.provider order by i.provider)
      from auth.identities i
      where i.user_id = p.id
    ),
    array[]::text[]
  ) as providers
from public.profiles p
join auth.users u on u.id = p.id;

comment on view public.admin_accounts is
  'Cuentas de Leogin (perfil + identidad de Auth) para el Super Admin. Solo service_role.';

-- ── El candado ──────────────────────────────────────────────
-- `public` quita el permiso implícito que tiene todo el mundo; los dos
-- siguientes quitan los que Supabase reparte por defecto a los roles
-- del navegador. Son tres revokes porque son tres caminos distintos, y
-- dejar cualquiera de ellos abre el correo de todo el personal.
revoke all on public.admin_accounts from public;
revoke all on public.admin_accounts from anon;
revoke all on public.admin_accounts from authenticated;

grant select on public.admin_accounts to service_role;
