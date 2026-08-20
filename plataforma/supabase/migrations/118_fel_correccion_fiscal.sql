-- ============================================================
--  Migración 118 — FEL: corrección fiscal y emisión desde la caja
--  ------------------------------------------------------------
--  Las migraciones 039 y 106 dejaron el módulo capaz de transmitir, pero
--  con tres problemas que solo se ven contra la documentación del SAT:
--
--  1. EL RÉGIMEN DEL EMISOR NO SE PODÍA DECLARAR.
--     El XML fijaba TipoFrase=1/Escenario=1 para el régimen general y
--     TipoFrase=2 para el pequeño contribuyente. Verificado contra el
--     catálogo oficial FEL-CATALOGO-FRASES v0.6.0 (SAT, 25/03/2025):
--     la frase 2 es "Es Agente de Retención del IVA" — el pequeño
--     contribuyente lleva la 3 — y el escenario 1 del ISR corresponde al
--     Régimen Sobre las Utilidades, mientras que la mayoría de
--     restaurantes están en Opcional Simplificado (escenario 2).
--
--     El certificador acepta esas frases porque son válidas; lo que pasa
--     es que describen a otro contribuyente. El error no aparece al
--     emitir, sino cuando a alguien le retienen (o no le retienen) lo que
--     no correspondía. Por eso el régimen ahora se declara, no se supone.
--
--  2. LA FACTURA NO COBRABA LO MISMO QUE LA CAJA.
--     El DTE se armaba con los ítems más el envío, ignorando el descuento
--     y la propina, cuando el pedido se cobra como
--     subtotal + envío − descuento + propina. Se facturaba de más el
--     descuento: el restaurante declaraba y pagaba IVA sobre dinero que
--     nunca entró, todos los meses. Ahora el descuento se prorratea entre
--     las líneas (campo Descuento del DTE) y la propina queda fuera de la
--     base salvo que el restaurante la facture como cargo por servicio.
--
--  3. NO SE PODÍA IDENTIFICAR AL COMPRADOR.
--     Desde enero 2023 no se puede facturar como Consumidor Final arriba
--     de Q2,500: hay que poner NIT o CUI (DPI), con multa de Q100 por
--     documento. No existía ni el tope ni el campo para el DPI.
--
--  Además: un pedido podía terminar con dos facturas vivas (la
--  comprobación era un conteo antes del insert, que dos cajas simultáneas
--  pasan las dos), y el correlativo del modo interno se incrementaba sin
--  atomicidad, así que dos cobros a la vez tomaban el mismo número.
--
--  Idempotente; seguro de re-ejecutar. Ejecutar tras 001..117.
-- ============================================================

-- ── 1. Régimen fiscal declarado ─────────────────────────────
alter table fel_settings
  add column if not exists regimen_iva          text    not null default 'GENERAL',
  add column if not exists regimen_isr          text    not null default 'SIMPLIFICADO',
  add column if not exists agente_retencion_iva boolean not null default false,
  add column if not exists numero_resolucion    text,
  add column if not exists fecha_resolucion     date,
  add column if not exists correo_emisor        text;

comment on column fel_settings.regimen_iva is
  'GENERAL | PEQUENO | PEQUENO_ELECTRONICO. Determina el tipo de DTE '
  '(FACT/FPEQ), si se desglosa IVA y qué frases lleva el documento.';
comment on column fel_settings.regimen_isr is
  'UTILIDADES | SIMPLIFICADO | SIMPLIFICADO_PAGO_DIRECTO | EXENTO | '
  'NO_APLICA. Es la frase que le dice al receptor si debe retener ISR.';
comment on column fel_settings.numero_resolucion is
  'Resolución de la SAT. La exigen el pago directo de ISR (frase 1.3) y '
  'el régimen electrónico de pequeño contribuyente (frase 7.1).';
comment on column fel_settings.afiliacion_iva is
  'HISTÓRICO: sustituido por regimen_iva, que distingue además el régimen '
  'electrónico. Se conserva para no romper filas viejas.';

-- Traducción de lo ya configurado. Un pequeño contribuyente no lleva
-- frase de ISR, así que se le pone NO_APLICA en vez del default.
update fel_settings
   set regimen_iva = case when afiliacion_iva = 'PEQ' then 'PEQUENO' else 'GENERAL' end,
       regimen_isr = case when afiliacion_iva = 'PEQ' then 'NO_APLICA' else regimen_isr end
 where regimen_iva = 'GENERAL' and afiliacion_iva = 'PEQ';

alter table fel_settings
  drop constraint if exists fel_settings_regimen_iva_check;
alter table fel_settings
  add constraint fel_settings_regimen_iva_check
  check (regimen_iva in ('GENERAL', 'PEQUENO', 'PEQUENO_ELECTRONICO'));

alter table fel_settings
  drop constraint if exists fel_settings_regimen_isr_check;
alter table fel_settings
  add constraint fel_settings_regimen_isr_check
  check (regimen_isr in ('UTILIDADES', 'SIMPLIFICADO', 'SIMPLIFICADO_PAGO_DIRECTO', 'EXENTO', 'NO_APLICA'));

-- ── 2. Comportamiento de la caja ────────────────────────────
alter table fel_settings
  add column if not exists emision_automatica    boolean       not null default true,
  add column if not exists facturar_propina      boolean       not null default false,
  add column if not exists tope_consumidor_final numeric(12,2) not null default 2500,
  add column if not exists horas_para_anular     int           not null default 24;

comment on column fel_settings.emision_automatica is
  'La caja factura sola al cerrar el pedido. Arranca en true, pero no '
  'dispara nada mientras falten los datos fiscales: un restaurante recién '
  'creado no puede emitir por accidente.';
comment on column fel_settings.facturar_propina is
  'Falso = la propina queda fuera de la base gravable (propina voluntaria, '
  'que no es parte del precio de venta). Verdadero = se factura como cargo '
  'por servicio. Lo decide cada restaurante con su contador.';
comment on column fel_settings.tope_consumidor_final is
  'Arriba de este monto el SAT exige identificar al comprador con NIT o '
  'CUI. Q2,500 desde enero 2023; es columna y no constante porque el tope '
  'lo fija una resolución y ha cambiado.';
comment on column fel_settings.horas_para_anular is
  'Ventana para anular ante el SAT. Pasada, la corrección es una nota de '
  'crédito, no una anulación.';

-- ── 3. Identificación del receptor y trazabilidad ───────────
alter table fel_documents
  add column if not exists receptor_tipo_id    text          not null default 'CF',
  add column if not exists receptor_correo     text,
  add column if not exists provider            text,
  add column if not exists es_fiscal           boolean       not null default false,
  add column if not exists origen              text          not null default 'PANEL',
  add column if not exists emitido_por         uuid,
  add column if not exists anulado_por         uuid,
  add column if not exists documento_origen_id uuid          references fel_documents(id) on delete set null,
  add column if not exists xml_enviado         text,
  add column if not exists propina_excluida    numeric(12,2) not null default 0;

comment on column fel_documents.receptor_tipo_id is
  'CF | NIT | CUI | EXT. Decide el atributo TipoEspecial del DTE: un DPI '
  'sin TipoEspecial="CUI" lo rechaza el certificador.';
comment on column fel_documents.es_fiscal is
  'Falso = registro interno sin validez ante el SAT (modo manual). Se '
  'guarda en el documento y no se deduce del proveedor actual, porque el '
  'restaurante puede cambiar de certificador después y el historial debe '
  'seguir diciendo la verdad sobre cada documento.';
comment on column fel_documents.origen is
  'PANEL | CAJA | API. Para saber si un documento lo emitió una persona o '
  'la emisión automática cuando haya que investigar algo.';
comment on column fel_documents.documento_origen_id is
  'Para una nota de crédito: la factura que corrige.';
comment on column fel_documents.xml_enviado is
  'El XML tal como se mandó a firmar. Sin esto, un rechazo del SAT se '
  'diagnostica adivinando.';
comment on column fel_documents.propina_excluida is
  'Propina cobrada que quedó fuera del DTE. Explica por qué el total de '
  'la factura es menor que el del ticket.';

-- Los documentos que ya existen: los del modo interno llevan uuid INT-.
update fel_documents
   set es_fiscal = (uuid_sat is not null and uuid_sat not like 'INT-%')
 where es_fiscal = false;

-- ── 4. Un pedido, una factura viva ──────────────────────────
-- La comprobación vivía en TypeScript como un conteo previo al insert, y
-- dos cobros simultáneos del mismo pedido lo pasaban los dos. Aquí no hay
-- carrera posible. Se limita a facturas: una nota de crédito referencia el
-- mismo pedido a propósito y no debe chocar.
create unique index if not exists fel_documents_una_factura_por_pedido
  on fel_documents(order_id)
  where order_id is not null and estado <> 'ANULADO' and tipo in ('FACT', 'FPEQ');

create index if not exists fel_documents_origen_idx
  on fel_documents(documento_origen_id)
  where documento_origen_id is not null;

-- ── 5. Correlativo interno atómico ──────────────────────────
-- El código hacía SELECT y luego UPDATE con el valor leído: dos cobros a
-- la vez tomaban el mismo número. UPDATE ... RETURNING bloquea la fila y
-- serializa a los dos, así que cada uno recibe el suyo.
create or replace function fel_siguiente_correlativo(p_restaurant_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_numero integer;
begin
  update fel_settings
     set next_correlativo = next_correlativo + 1
   where restaurant_id = p_restaurant_id
  returning next_correlativo - 1 into v_numero;

  if v_numero is null then
    raise exception 'No hay configuración FEL para el restaurante %', p_restaurant_id;
  end if;

  return v_numero;
end;
$$;

-- Misma política que el resto de funciones del proyecto (migración 084):
-- solo se llama desde server actions con la clave de servicio.
revoke execute on function public.fel_siguiente_correlativo(uuid) from public, anon, authenticated;

-- ── 6. Estados ──────────────────────────────────────────────
comment on column fel_documents.estado is
  'PENDIENTE = esperando o reintentando certificación; CERTIFICADO = el '
  'certificador lo aceptó (o numeración interna si es_fiscal = false); '
  'ERROR = se agotaron los reintentos y necesita intervención; ANULADO = '
  'anulado ante el certificador.';
