-- ============================================================
--  Migración 102 — Canal de WhatsApp (Fase 1A)
--  ------------------------------------------------------------
--  Primera pieza del plan de competencia contra OlaClick
--  (PLAN_COMPETENCIA_OLACLICK_FASES.md, Fase 1A): conectar el número de
--  WhatsApp del restaurante para AVISARLE al cliente cómo va su pedido.
--  Todavía sin bot y sin IA — eso es 1B y 1C. Aquí solo el canal.
--
--  Hasta hoy "WhatsApp" en Leogin era un enlace wa.me con texto
--  prellenado (src/lib/reminder.ts): abre la app del cliente y ahí muere.
--  No había forma de recibir nada ni de saber si el mensaje llegó.
--
--  TRES TABLAS:
--   · whatsapp_accounts       — un número conectado por restaurante.
--   · whatsapp_conversations  — un hilo por (restaurante, teléfono).
--   · whatsapp_messages       — bitácora de cada mensaje, en ambos sentidos.
--
--  SEGURIDAD — access_token_cipher, no access_token:
--  el token de la Cloud API permite ENVIAR mensajes en nombre del negocio,
--  así que no se guarda en claro. Se cifra con AES-256-GCM (clave en
--  WHATSAPP_TOKEN_KEY, fuera de la base) — ver src/lib/whatsapp/crypto.ts.
--  Quien lea la base sin la clave no puede usar el token. Es distinto de
--  api_keys/staff_pins, que guardan HASH porque solo necesitan verificar;
--  aquí hay que recuperar el valor para llamar a Meta, así que hace falta
--  cifrado reversible, no hash.
--
--  RLS habilitado y SIN políticas, igual que staff_pins (migración 074):
--  estas tablas solo se tocan con service role desde el servidor. El
--  comensal nunca las consulta y el panel las lee vía server actions.
--
--  Idempotente; seguro de re-ejecutar. Ejecutar tras 001..101.
-- ============================================================

-- ── Cuenta conectada ────────────────────────────────────────
create table if not exists whatsapp_accounts (
  restaurant_id       uuid primary key references restaurants(id) on delete cascade,
  -- Identificador del número que da Meta. Es la LLAVE DE RUTEO: el webhook
  -- es uno solo para todos los restaurantes, y este campo es lo que dice a
  -- cuál pertenece cada mensaje entrante. Único para que dos restaurantes
  -- no puedan reclamar el mismo número.
  phone_number_id     text not null unique,
  waba_id             text,
  display_phone       text,
  access_token_cipher text not null,
  activo              boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

comment on table whatsapp_accounts is
  'Número de WhatsApp Cloud API conectado por restaurante. phone_number_id '
  'es la llave con la que el webhook único resuelve a qué restaurante '
  'pertenece un mensaje entrante.';
comment on column whatsapp_accounts.access_token_cipher is
  'Token de la Cloud API cifrado con AES-256-GCM (formato iv:tag:ciphertext '
  'en base64url). NUNCA en claro: permite enviar mensajes como el negocio.';

-- ── Hilo de conversación ────────────────────────────────────
create table if not exists whatsapp_conversations (
  id              uuid primary key default gen_random_uuid(),
  restaurant_id   uuid not null references restaurants(id) on delete cascade,
  -- Teléfono del cliente como lo manda Meta: E.164 sin '+' (ej. 50255551234).
  wa_id           text not null,
  customer_id     uuid references customers(id) on delete set null,
  -- Estado de la máquina del bot. Vacío en 1A (todavía no hay bot); lo
  -- llena la Fase 1B. Se crea ya para no migrar la tabla otra vez.
  estado          jsonb,
  -- Último mensaje ENTRANTE. Meta solo permite texto libre dentro de las 24h
  -- siguientes a este momento; pasado ese plazo hay que usar una plantilla
  -- aprobada. Sin este dato no se puede decidir cuál de los dos mandar.
  last_inbound_at timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (restaurant_id, wa_id)
);

comment on column whatsapp_conversations.last_inbound_at is
  'Momento del último mensaje del cliente. Define la ventana de servicio de '
  '24h de Meta: dentro de ella se puede enviar texto libre, fuera hay que '
  'usar plantilla aprobada.';

-- ── Bitácora de mensajes ────────────────────────────────────
create table if not exists whatsapp_messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references whatsapp_conversations(id) on delete cascade,
  restaurant_id   uuid not null references restaurants(id) on delete cascade,
  direction       text not null check (direction in ('IN', 'OUT')),
  -- id que asigna Meta. Único para los salientes (idempotencia de reintentos)
  -- y para los entrantes evita duplicar si Meta reintenta el webhook.
  wa_message_id   text unique,
  kind            text,
  payload         jsonb,
  -- Solo OUT: sent → delivered → read, o failed. Lo actualiza el webhook con
  -- los acuses de recibo que manda Meta.
  status          text,
  error           text,
  -- Si el mensaje se disparó por un cambio de estado de pedido, cuál.
  order_id        uuid references orders(id) on delete set null,
  created_at      timestamptz not null default now()
);

create index if not exists whatsapp_messages_conversation_idx
  on whatsapp_messages(conversation_id, created_at desc);
create index if not exists whatsapp_messages_restaurant_idx
  on whatsapp_messages(restaurant_id, created_at desc);
create index if not exists whatsapp_conversations_restaurant_idx
  on whatsapp_conversations(restaurant_id, updated_at desc);

alter table whatsapp_accounts      enable row level security;
alter table whatsapp_conversations enable row level security;
alter table whatsapp_messages      enable row level security;
