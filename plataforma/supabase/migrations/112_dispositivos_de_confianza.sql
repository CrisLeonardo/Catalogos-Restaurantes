-- ============================================================
--  Migración 112 — Dispositivos de confianza del local
--  ------------------------------------------------------------
--  El PIN de 4 dígitos es la credencial correcta para el personal
--  DENTRO del local: se teclea quince veces por turno y una
--  contraseña ahí es un estorbo. El problema no es el PIN, es
--  DÓNDE se acepta: hoy la pantalla "¿Quién eres?" se abre desde
--  cualquier parte del mundo que conozca el subdominio, y con ella
--  se filtra además la lista de nombres de todo el personal a
--  quien no ha iniciado sesión (listStaffForPin es pública a
--  propósito: es una pantalla PRE-login).
--
--  Un número de 4 cifras está bien defendido (5 intentos y se
--  bloquea, más límites por IP y por persona), pero sigue siendo
--  un número de 4 cifras expuesto a internet abierto.
--
--  Esta migración añade la pieza que faltaba: la lista de aparatos
--  que el restaurante reconoce como SUYOS.
--
--    · restaurant_devices          → qué aparatos son del local.
--    · restaurants.pin_requires_trusted_device → si el PIN vale
--      SOLO en ellos.
--
--  DOS DECISIONES QUE EVITAN DEJAR A NADIE FUERA:
--
--  1) El interruptor nace APAGADO. Un restaurante que ya está
--     operando no cambia de comportamiento con esta migración:
--     sigue entrando por PIN desde donde sea. Encenderlo es una
--     decisión del dueño, tomada cuando ya ve su lista de
--     aparatos llena.
--
--  2) Mientras está apagado, cada PIN correcto REGISTRA el aparato
--     (confianza al primer uso). Así la lista se llena sola con
--     las tabletas y la computadora que de verdad se usan, sin que
--     el dueño tenga que dar de alta nada a mano — y el día que
--     encienda el interruptor, lo que ya funciona sigue
--     funcionando.
--
--  El id del aparato es el mismo anónimo y estable de
--  lib/device-id.ts (localStorage) que la migración 110 ya usa
--  para la PC principal. No identifica a una persona.
--
--  Ejecutar DESPUÉS de 001..111.
-- ============================================================

create table if not exists restaurant_devices (
  restaurant_id uuid        not null references restaurants(id) on delete cascade,
  device_id     text        not null,
  label         text,
  -- Quién lo autorizó. NULL = se registró solo al entrar con PIN.
  added_by      uuid        references profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  primary key (restaurant_id, device_id)
);

comment on table restaurant_devices is
  'Aparatos que el restaurante reconoce como suyos (tabletas de caja, la PC '
  'del local, el celular del dueño). Con pin_requires_trusted_device en true, '
  'el PIN del personal y la grilla "¿Quién eres?" solo funcionan en estos.';

comment on column restaurant_devices.device_id is
  'Id anónimo y estable del navegador (lib/device-id.ts, localStorage). No '
  'identifica a una persona. Es el mismo que usa la migración 110 para la PC '
  'principal.';

comment on column restaurant_devices.added_by is
  'Perfil que lo autorizó desde el panel. NULL = se registró solo tras un PIN '
  'correcto (confianza al primer uso, mientras el candado está apagado).';

-- Lectura típica: "los aparatos de MI restaurante, el más reciente arriba".
create index if not exists restaurant_devices_restaurant_idx
  on restaurant_devices(restaurant_id, last_seen_at desc);

alter table restaurant_devices enable row level security;

-- Sin políticas, igual que panel_access_log (migración 109): esta tabla la
-- escribe y la lee el servidor con la service role key. Una lista de
-- aparatos autorizados que el propio navegador pudiera editar no serviría
-- de nada; con RLS activada y sin políticas, cualquier intento desde el
-- cliente devuelve vacío en vez de datos.

-- ── El candado, apagado por defecto ─────────────────────────
alter table restaurants
  add column if not exists pin_requires_trusted_device boolean not null default false;

comment on column restaurants.pin_requires_trusted_device is
  'false (por defecto) = el PIN funciona desde cualquier aparato, como siempre, '
  'y cada PIN correcto registra el aparato en restaurant_devices. true = el PIN '
  'y la grilla "¿Quién eres?" solo funcionan en los aparatos ya registrados; '
  'desde cualquier otro hay que entrar con correo o con Google.';
