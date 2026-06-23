-- ============================================================
--  Migración 039 — FEL (Factura Electrónica en Línea, Guatemala)
--  ------------------------------------------------------------
--  Módulo activable en 2 niveles (ver 038). Estas tablas guardan
--  la configuración fiscal del emisor y el registro de documentos
--  emitidos. La transmisión real al SAT requiere un certificador
--  (INFILE, G4S, Digifact…). El "modo MANUAL" genera un registro
--  interno con numeración secuencial sin transmitir (para quienes
--  aún no contratan certificador).
--  RLS: solo service role (igual que el resto de tablas operativas).
--  Ejecutar DESPUÉS de 001..038.
-- ============================================================

-- ── Configuración fiscal del emisor (1 por restaurante) ─────
create table if not exists fel_settings (
  restaurant_id          uuid        primary key references restaurants(id) on delete cascade,
  -- Certificador: MANUAL = registro interno sin transmisión; otros = pasarela.
  provider               text        not null default 'MANUAL',  -- MANUAL | INFILE | G4S | DIGIFACT | OTRO
  ambiente               text        not null default 'PRUEBAS', -- PRUEBAS | PRODUCCION
  -- Datos del emisor (SAT)
  nit_emisor             text        not null default '',
  nombre_emisor          text        not null default '',
  nombre_comercial       text        not null default '',
  direccion              text        not null default '',
  codigo_establecimiento text        not null default '1',
  afiliacion_iva         text        not null default 'GEN',     -- GEN | PEQ (pequeño contribuyente)
  moneda                 text        not null default 'GTQ',
  iva_incluido           boolean     not null default true,      -- el precio ya incluye IVA (12%)
  serie_prefijo          text        not null default '',        -- prefijo de serie en modo MANUAL
  -- Credenciales del certificador (solo se usan con provider ≠ MANUAL)
  api_usuario            text        not null default '',
  api_clave              text        not null default '',
  api_llave_firma        text        not null default '',
  -- Estado
  next_correlativo       integer     not null default 1,         -- contador en modo MANUAL
  updated_at             timestamptz not null default now()
);

alter table fel_settings enable row level security;

-- ── Documentos emitidos ─────────────────────────────────────
create table if not exists fel_documents (
  id                  uuid          primary key default gen_random_uuid(),
  restaurant_id       uuid          not null references restaurants(id) on delete cascade,
  order_id            uuid          references orders(id) on delete set null,
  tipo                text          not null default 'FACT',     -- tipo de DTE
  receptor_nit        text          not null default 'CF',       -- CF = consumidor final
  receptor_nombre     text          not null default 'Consumidor Final',
  receptor_direccion  text          not null default 'Ciudad',
  moneda              text          not null default 'GTQ',
  monto_total         numeric(12,2) not null default 0,
  monto_iva           numeric(12,2) not null default 0,
  estado              text          not null default 'PENDIENTE', -- PENDIENTE | CERTIFICADO | ANULADO | ERROR
  uuid_sat            text,                                       -- UUID que devuelve el certificador
  serie               text,
  numero              text,
  numero_autorizacion text,
  fecha_certificacion timestamptz,
  error_mensaje       text,
  dte_json            jsonb,                                      -- snapshot del DTE generado
  created_at          timestamptz   not null default now()
);

create index if not exists fel_documents_restaurant_idx on fel_documents(restaurant_id, created_at desc);
create index if not exists fel_documents_order_idx       on fel_documents(order_id);

alter table fel_documents enable row level security;
