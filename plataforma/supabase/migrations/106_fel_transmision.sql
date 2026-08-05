-- ============================================================
--  Migración 106 — FEL: transmisión real y cola de reintentos (Fase 3)
--  ------------------------------------------------------------
--  El cálculo del DTE está completo desde la migración 039, pero la
--  transmisión al certificador nunca se conectó: actions/fel.ts devuelve
--  "aún no está conectada" y solo funciona el modo MANUAL, que numera
--  internamente y NO tiene validez ante el SAT.
--
--  Esta migración prepara la base para transmitir de verdad. Dos cosas:
--
--  1. CREDENCIALES CIFRADAS.
--     fel_settings guarda hoy api_clave y api_llave_firma en TEXTO PLANO.
--     Son las llaves con las que se firma y se emite factura fiscal a
--     nombre del restaurante: quien las lea puede facturar por él. Se
--     agregan columnas cifradas (AES-256-GCM, misma caja fuerte que el
--     token de WhatsApp) y las viejas quedan como respaldo de lectura
--     mientras haya cuentas sin re-guardar.
--
--     No se migran los valores aquí: cifrar requiere la clave de la
--     aplicación, que no vive en la base (ese es justamente el punto). La
--     app lee la columna cifrada y, si está vacía, cae a la de texto plano
--     y la cifra en el siguiente guardado. Sin datos que perder.
--
--  2. COLA DE REINTENTOS.
--     Un certificador caído no puede dejar una venta sin factura ni
--     bloquear la caja. El documento se guarda como PENDIENTE y se
--     reintenta; `proximo_intento` con backoff evita martillar un servicio
--     que ya está caído, y `intentos` permite rendirse y avisar en vez de
--     reintentar para siempre.
--
--  3. DIRECCIÓN FISCAL COMPLETA.
--     El esquema del SAT (dte:GTDocumento) exige municipio, departamento,
--     código postal y país en la dirección del emisor. fel_settings solo
--     tenía `direccion` como texto libre, que basta para el modo MANUAL
--     pero hace que el certificador rechace el DTE.
--
--  4. EVIDENCIA DE LA ANULACIÓN.
--     Anular ante el SAT es transmitir un documento aparte, no borrar una
--     fila. Se guarda cuándo y por qué, más el XML certificado que
--     devuelve el certificador: ese XML es el documento con validez legal
--     y hay que poder reimprimirlo aunque el certificador cambie.
--
--  Idempotente; seguro de re-ejecutar. Ejecutar tras 001..105.
-- ============================================================

alter table fel_settings
  add column if not exists api_clave_cipher       text,
  add column if not exists api_llave_firma_cipher text;

comment on column fel_settings.api_clave_cipher is
  'Clave del certificador cifrada (AES-256-GCM). Sustituye a api_clave, que '
  'queda como respaldo de lectura hasta que la cuenta se vuelva a guardar.';
comment on column fel_settings.api_clave is
  'HISTÓRICO: texto plano. No escribir aquí en código nuevo — usar '
  'api_clave_cipher.';

alter table fel_documents
  add column if not exists intentos        int not null default 0,
  add column if not exists ultimo_error    text,
  add column if not exists proximo_intento timestamptz;

comment on column fel_documents.proximo_intento is
  'Cuándo volver a intentar la certificación. NULL = no hay reintento '
  'pendiente (ya certificó, o se agotaron los intentos).';

-- Cola de trabajo: los pendientes que ya toca reintentar.
create index if not exists fel_documents_pendientes_idx
  on fel_documents(proximo_intento)
  where estado = 'PENDIENTE';

comment on column fel_documents.estado is
  'PENDIENTE = esperando o reintentando certificación; CERTIFICADO = el SAT '
  'lo aceptó (o numeración interna en modo MANUAL); ERROR = se agotaron los '
  'reintentos y necesita intervención; ANULADO = anulado ante el certificador.';

-- ── 3. Dirección fiscal completa del emisor ─────────────────
-- Guatemala/Guatemala y 01001 como defaults: es el caso más común y evita
-- que una cuenta ya configurada quede sin poder emitir tras la migración.
alter table fel_settings
  add column if not exists codigo_postal text not null default '01001',
  add column if not exists municipio     text not null default 'Guatemala',
  add column if not exists departamento  text not null default 'Guatemala',
  add column if not exists pais          text not null default 'GT';

comment on column fel_settings.municipio is
  'Exigido por el esquema dte:GTDocumento. El certificador rechaza el DTE '
  'si no coincide con el domicilio fiscal registrado del NIT emisor.';

-- ── 4. Evidencia de certificación y anulación ───────────────
alter table fel_documents
  add column if not exists xml_certificado  text,
  add column if not exists fecha_anulacion  timestamptz,
  add column if not exists motivo_anulacion text;

comment on column fel_documents.xml_certificado is
  'DTE firmado y certificado tal como lo devolvió el certificador. Es el '
  'documento con validez legal: se conserva para reimprimir y para auditoría '
  'aunque el restaurante cambie de certificador.';
