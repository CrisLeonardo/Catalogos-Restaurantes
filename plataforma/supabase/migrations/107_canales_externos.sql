-- ============================================================
--  Migración 107 — Ingesta de pedidos externos (Fase 5A)
--  ------------------------------------------------------------
--  Un restaurante que ya vende por PedidosYa, Rappi o UberEats hoy
--  atiende esas apps en pantallas aparte. Esto deja que esos pedidos
--  entren a Leogin y aparezcan en el KDS con los demás.
--
--  Se construye SIN depender de acuerdos con las plataformas: cualquier
--  middleware (n8n, Zapier, un integrador local) puede empujar pedidos a
--  POST /api/v1/orders con una API key. Las integraciones oficiales de
--  la 5B, cuando existan, traducen su webhook a este mismo formato.
--
--  ── Por qué hace falta un mapa de productos ──
--  El canal externo manda SU identificador ("burger-clasica", "SKU-4471"),
--  no el uuid de Leogin. Sin traducción no hay forma de saber qué se
--  pidió. El mapa es también donde el dueño ve qué productos suyos están
--  publicados en cada app.
--
--  ── Lo que el canal externo NO decide ──
--  El precio. El mapa guarda a qué producto de Leogin corresponde cada
--  sku, y el precio sale de products — nunca del payload. Si la app
--  externa manda un monto distinto, se ignora. Aceptar precios de afuera
--  convertiría una API key filtrada en una forma de facturarle al
--  restaurante lo que a uno se le ocurra.
--
--  Idempotente; seguro de re-ejecutar. Ejecutar tras 001..106.
-- ============================================================

create table if not exists channel_product_map (
  id            uuid        primary key default gen_random_uuid(),
  restaurant_id uuid        not null references restaurants(id) on delete cascade,
  -- Debe coincidir con el CHECK de orders.source (migración 101).
  channel       text        not null check (channel in ('PEDIDOSYA','RAPPI','UBEREATS','OTRO')),
  -- El identificador tal como lo manda la plataforma externa.
  external_sku  text        not null,
  product_id    uuid        not null references products(id) on delete cascade,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Un sku de un canal apunta a un solo producto dentro del restaurante.
-- Sin esto, dos filas contradictorias harían que el mismo pedido entre
-- distinto según cuál gane la carrera.
create unique index if not exists channel_product_map_unico_idx
  on channel_product_map(restaurant_id, channel, external_sku);

-- Búsqueda por producto: "¿en qué apps está publicado este plato?"
create index if not exists channel_product_map_producto_idx
  on channel_product_map(product_id);

alter table channel_product_map enable row level security;

comment on table channel_product_map is
  'Traduce el identificador de producto de una plataforma externa al uuid '
  'de Leogin. El precio NO se guarda aquí: sale de products, para que un '
  'canal externo no pueda fijarlo.';

-- ── Scope de escritura de pedidos ───────────────────────────
-- Las API keys ya existen (formato lk_live_..., hash SHA-256, scopes).
-- Una llave solo puede crear pedidos si lleva 'orders:write'. Las llaves
-- ya emitidas NO lo tienen, así que este endpoint nace cerrado para
-- todas ellas: hay que dárselo a mano a la que lo necesite.
comment on column api_keys.scopes is
  'Permisos de la llave. orders:write habilita POST /api/v1/orders '
  '(ingesta de pedidos externos, Fase 5A). Una llave sin scopes no puede '
  'escribir nada.';
