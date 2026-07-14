-- ============================================================
--  Migración 074 — Login de staff por PIN
--  · staff_pins: PIN operativo de 4 dígitos por miembro de personal,
--    separado de auth.users/profiles a propósito: NO es una credencial
--    de Supabase Auth, es la identificación rápida que dispara una
--    sesión real (vía admin.generateLink + verifyOtp, ver
--    src/lib/actions/staff-pin.ts). Nunca se guarda el PIN en claro.
-- ============================================================

create table if not exists staff_pins (
  profile_id      uuid primary key references profiles(id) on delete cascade,
  restaurant_id   uuid not null references restaurants(id) on delete cascade,
  pin_hash        text not null,
  pin_salt        text not null,
  failed_attempts int  not null default 0,
  locked_until    timestamptz,
  updated_at      timestamptz not null default now()
);

comment on table staff_pins is
  'PIN de 4 dígitos por miembro de personal (login rápido en dispositivo '
  'compartido). pin_hash/pin_salt via crypto.scrypt, nunca el PIN en claro.';

create index if not exists staff_pins_restaurant_idx
  on staff_pins(restaurant_id);

-- RLS sin políticas públicas: solo se toca vía server actions con service
-- role (mismo patrón que activity_log en 023_personal.sql) y desde el hub
-- local vía /api/agent/staff-pins (autenticado con el token del agente).
alter table staff_pins enable row level security;
