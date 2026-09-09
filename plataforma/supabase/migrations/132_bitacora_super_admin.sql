-- ============================================================
--  132 · La bitácora del Super Admin (fase 3 de
--        PLAN_ADMINISTRACION_DE_CUENTAS.md)
--  ------------------------------------------------------------
--  Hallazgo M-11: lo que hace el Super Admin no deja rastro en
--  ninguna parte. `activity_log` (migración 023) EXIGE un
--  `restaurant_id` y se enseña en /admin/personal: es la bitácora
--  DEL LOCAL, para que el dueño vigile a su personal. No sirve aquí
--  por dos motivos —la mitad de estas acciones no tienen restaurante
--  (una cuenta sin local, por ejemplo) y ninguna debería aparecer en
--  la pantalla del cliente—.
--
--  Se volvió obligatorio con la fase 2: desde la ficha de una cuenta
--  se le puede cambiar la contraseña y el CORREO a un cliente que
--  paga. El día que alguien pregunte «¿quién tocó mi cuenta?», o hay
--  algo que enseñar o no lo hay.
--
--  ── POR QUÉ NO HAY CLAVES FORÁNEAS A LOS OBJETIVOS ──────────
--
--  Es la decisión importante de esta tabla, y es deliberada.
--
--  `target_user_id` y `target_restaurant_id` son uuid PELADOS, sin
--  `references`. Con una FK en cascada, borrar un restaurante
--  borraría el registro de que lo borraste; y con `set null` se
--  perdería a quién se le hizo. Justo las acciones más graves —las
--  irreversibles— son las que se llevarían su propia prueba por
--  delante. Una bitácora que desaparece con lo que registra no es
--  una bitácora.
--
--  Por lo mismo se congela el TEXTO: `actor_email` y `target_label`
--  guardan el correo y el nombre tal como eran en ese momento. Si la
--  cuenta se borra, la fila sigue diciendo a quién y quién.
--
--  El actor SÍ lleva FK con `set null`: es una cuenta de Leogin, no
--  el objeto de la acción, y su correo ya queda congelado al lado.
--
--  ── EL CANDADO ──────────────────────────────────────────────
--
--  Igual que la vista de la 131: Supabase reparte por defecto los
--  permisos de todo lo nuevo en `public` a `anon` y `authenticated`,
--  y esta tabla lleva correos de clientes y direcciones IP. Se quita
--  a todo el mundo y solo la lee `service_role`. Además RLS activo
--  SIN políticas, que es «nadie», por si algún día alguien devuelve
--  los permisos sin pensarlo.
--
--  Ejecutar DESPUÉS de 001..131.
-- ============================================================

create table if not exists super_admin_log (
  id            bigserial   primary key,

  -- Quién. La FK es a la cuenta, pero el correo se congela al lado
  -- para que la fila siga siendo legible si esa cuenta desaparece.
  actor_id      uuid        references auth.users(id) on delete set null,
  actor_email   text,

  -- Qué. Texto con forma `objeto.verbo` — 'cuenta.contrasena',
  -- 'restaurante.borrar'… Sin enum a propósito: añadir una acción no
  -- puede exigir una migración, o se acaba no registrando la nueva.
  action        text        not null,

  -- Sobre quién / sobre qué. SIN claves foráneas (ver arriba).
  target_user_id       uuid,
  target_restaurant_id uuid,
  -- El correo o el nombre, tal como eran en ese momento.
  target_label  text,

  -- Lo que haga falta de cada acción (el correo viejo y el nuevo, el
  -- plan de antes…). Nunca contraseñas ni tokens.
  meta          jsonb,

  ip            text,
  created_at    timestamptz not null default now()
);

comment on table super_admin_log is
  'Lo que hace el Super Admin. Sin FK a los objetivos a propósito: borrar algo no puede borrar el registro de que lo borraste.';

-- La pantalla lee «lo último, de todo» y «lo de esta persona».
create index if not exists super_admin_log_created_idx
  on super_admin_log (created_at desc);
create index if not exists super_admin_log_target_user_idx
  on super_admin_log (target_user_id, created_at desc);
create index if not exists super_admin_log_target_restaurant_idx
  on super_admin_log (target_restaurant_id, created_at desc);

-- ── El candado ──────────────────────────────────────────────
alter table super_admin_log enable row level security;
-- Sin políticas: RLS activo y ninguna política = nadie pasa.
-- `service_role` no las necesita (las salta), que es como lee el panel.

revoke all on super_admin_log from public;
revoke all on super_admin_log from anon;
revoke all on super_admin_log from authenticated;
revoke all on sequence super_admin_log_id_seq from public;
revoke all on sequence super_admin_log_id_seq from anon;
revoke all on sequence super_admin_log_id_seq from authenticated;

grant select, insert on super_admin_log to service_role;
grant usage on sequence super_admin_log_id_seq to service_role;

-- Y SOLO eso: nada de UPDATE ni DELETE, tampoco para `service_role`.
--
-- El GRANT de arriba no basta para conseguirlo: Supabase ya reparte ALL
-- sobre todo lo nuevo en `public` a `service_role`, así que sumar
-- «select, insert» no quita el resto — comprobado contra la base, podía
-- borrar filas. Estos REVOKE son lo que de verdad deja la tabla en solo
-- añadir. Una bitácora que el propio panel puede editar no prueba nada.
--
-- Si algún día hay que podarla, se hace con SQL directo desde el editor,
-- que es una decisión consciente y no un `delete` perdido en el código.
revoke update, delete, truncate on super_admin_log from service_role;
