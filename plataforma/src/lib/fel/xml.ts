/* ============================================================
   DTE → XML del SAT (Guatemala) · lógica pura
   ------------------------------------------------------------
   src/lib/fel.ts calcula la factura y produce un objeto `FacturaDte`
   propio de Leogin. El SAT no recibe eso: recibe un XML con el esquema
   `dte:GTDocumento` (namespace http://www.sat.gob.gt/dte/fel/0.2.0), que
   es el formato que TODOS los certificadores firman y transmiten. Este
   archivo es el puente entre los dos, y por eso vive fuera de
   providers/: el XML es del SAT, no de INFILE.

   Sin dependencias de red ni de base: entra un DTE, sale una cadena. Así
   se puede probar con vitest sin tocar un certificador.

   ── Dos tipos de documento según la afiliación al IVA ──
   GEN (contribuyente normal) → tipo FACT, frase 1: el IVA va desglosado.
   PEQ (pequeño contribuyente) → tipo FPEQ, frase 2: no factura IVA, y el
   SAT exige la leyenda de retención. Emitir un FACT desde una cuenta PEQ
   lo rechaza el certificador, así que la distinción no es cosmética.

   ⚠️ VERIFICAR CONTRA EL SAT ANTES DE PRODUCCIÓN: los códigos de escenario
   de las frases y el catálogo de unidades de medida cambian con las
   resoluciones del SAT. Lo que está aquí cubre el caso de un restaurante
   (venta de bienes y servicios, IVA general o pequeño contribuyente); un
   caso con exenciones, retenciones o exportación necesita más frases.
   ============================================================ */

import type { FacturaDte, FelSettings } from '@/lib/fel';

/** Namespace del esquema FEL vigente. */
const DTE_NS = 'http://www.sat.gob.gt/dte/fel/0.2.0';

/** Escapa los cinco caracteres que romperían el XML. */
function esc(value: string): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Monto con 2 decimales fijos: el SAT rechaza notación científica. */
function money(n: number): string {
  return Number(n || 0).toFixed(2);
}

/** Cantidad: hasta 6 decimales, sin ceros de relleno innecesarios. */
function qty(n: number): string {
  const v = Number(n || 0);
  return Number.isInteger(v) ? v.toFixed(0) : String(Number(v.toFixed(6)));
}

/**
 * Fecha en el formato que pide el SAT: ISO 8601 CON offset local, no en UTC
 * con Z. Guatemala es UTC-6 todo el año (no hay horario de verano), así que
 * el offset es fijo. Mandar la hora en UTC adelanta la emisión 6 horas y
 * puede caer en el día siguiente — un problema real para el cierre fiscal
 * de las ventas de la noche.
 */
export function felDateTime(d: Date = new Date()): string {
  const gt = new Date(d.getTime() - 6 * 60 * 60 * 1000);
  const p = (n: number, len = 2) => String(n).padStart(len, '0');
  return (
    `${gt.getUTCFullYear()}-${p(gt.getUTCMonth() + 1)}-${p(gt.getUTCDate())}` +
    `T${p(gt.getUTCHours())}:${p(gt.getUTCMinutes())}:${p(gt.getUTCSeconds())}-06:00`
  );
}

/** Tipo de DTE que corresponde a la afiliación IVA del emisor. */
export function dteTipo(settings: Pick<FelSettings, 'afiliacion_iva'>): 'FACT' | 'FPEQ' {
  return settings.afiliacion_iva === 'PEQ' ? 'FPEQ' : 'FACT';
}

/** Datos de dirección que el esquema exige y que fel_settings no tenía. */
export interface DireccionFiscal {
  direccion: string;
  codigoPostal: string;
  municipio: string;
  departamento: string;
  pais: string;
}

function direccionXml(tag: string, d: DireccionFiscal): string {
  return [
    `<dte:${tag}>`,
    `<dte:Direccion>${esc(d.direccion || 'Ciudad')}</dte:Direccion>`,
    `<dte:CodigoPostal>${esc(d.codigoPostal || '01001')}</dte:CodigoPostal>`,
    `<dte:Municipio>${esc(d.municipio || 'Guatemala')}</dte:Municipio>`,
    `<dte:Departamento>${esc(d.departamento || 'Guatemala')}</dte:Departamento>`,
    `<dte:Pais>${esc(d.pais || 'GT')}</dte:Pais>`,
    `</dte:${tag}>`,
  ].join('');
}

export interface BuildXmlOptions {
  /** Dirección fiscal del emisor (de fel_settings, migración 106). */
  emisor: DireccionFiscal;
  /**
   * Dirección del receptor. El SAT la acepta genérica para consumidor final,
   * que es el 99% de los tickets de un restaurante.
   */
  receptor?: Partial<DireccionFiscal>;
}

/**
 * Serializa un `FacturaDte` al XML `dte:GTDocumento` listo para firmar.
 *
 * El resultado NO va firmado: la firma la aplica el certificador (o su
 * servicio de firma) sobre este XML exacto, así que no se puede reformatear
 * ni reindentar después — cualquier byte que cambie invalida la firma. Por
 * eso se genera en una sola línea, sin saltos ni espacios decorativos.
 */
export function buildDteXml(
  dte: FacturaDte,
  settings: FelSettings,
  opts: BuildXmlOptions,
): string {
  const tipo = dteTipo(settings);
  const esPequeno = tipo === 'FPEQ';

  const items = dte.items
    .map((it, i) => {
      // "B" = bien, "S" = servicio. El envío es servicio; lo demás, bien.
      const bienOServicio = /entrega|servicio|domicilio|propina/i.test(it.descripcion) ? 'S' : 'B';

      // El pequeño contribuyente no desglosa IVA: todo el monto es gravable
      // sin impuesto asociado, y el bloque <dte:Impuestos> se omite.
      const impuestos = esPequeno
        ? ''
        : [
            '<dte:Impuestos>',
            '<dte:Impuesto>',
            '<dte:NombreCorto>IVA</dte:NombreCorto>',
            '<dte:CodigoUnidadGravable>1</dte:CodigoUnidadGravable>',
            `<dte:MontoGravable>${money(it.montoGravable)}</dte:MontoGravable>`,
            `<dte:MontoImpuesto>${money(it.montoImpuesto)}</dte:MontoImpuesto>`,
            '</dte:Impuesto>',
            '</dte:Impuestos>',
          ].join('');

      return [
        `<dte:Item NumeroLinea="${i + 1}" BienOServicio="${bienOServicio}">`,
        `<dte:Cantidad>${qty(it.cantidad)}</dte:Cantidad>`,
        `<dte:UnidadMedida>UND</dte:UnidadMedida>`,
        `<dte:Descripcion>${esc(it.descripcion)}</dte:Descripcion>`,
        `<dte:PrecioUnitario>${money(it.precioUnitario)}</dte:PrecioUnitario>`,
        `<dte:Precio>${money(it.total)}</dte:Precio>`,
        `<dte:Descuento>0.00</dte:Descuento>`,
        impuestos,
        `<dte:Total>${money(it.total)}</dte:Total>`,
        '</dte:Item>',
      ].join('');
    })
    .join('');

  // Frases obligatorias. Sin la frase correcta el certificador rechaza el DTE.
  const frases = esPequeno
    ? '<dte:Frase TipoFrase="2" CodigoEscenario="1"/>'
    : '<dte:Frase TipoFrase="1" CodigoEscenario="1"/>';

  const totalImpuestos = esPequeno
    ? ''
    : [
        '<dte:TotalImpuestos>',
        `<dte:TotalImpuesto NombreCorto="IVA" TotalMontoImpuesto="${money(dte.totalImpuesto)}"/>`,
        '</dte:TotalImpuestos>',
      ].join('');

  const receptorDir: DireccionFiscal = {
    direccion: opts.receptor?.direccion || dte.receptor.direccion || 'Ciudad',
    codigoPostal: opts.receptor?.codigoPostal || '01001',
    municipio: opts.receptor?.municipio || 'Guatemala',
    departamento: opts.receptor?.departamento || 'Guatemala',
    pais: opts.receptor?.pais || 'GT',
  };

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<dte:GTDocumento xmlns:dte="${DTE_NS}" Version="0.1">`,
    '<dte:SAT ClaseDocumento="dte">',
    '<dte:DTE ID="DatosCertificados">',
    '<dte:DatosEmision ID="DatosEmision">',

    // La fecha se normaliza aquí, no en fel.ts: ese archivo guarda el
    // instante en ISO/UTC (lo correcto para la base) y el SAT quiere la hora
    // de pared guatemalteca con su offset. Convertir en el borde evita que
    // fel.ts tenga que importar este módulo y cerrar un ciclo.
    `<dte:DatosGenerales Tipo="${tipo}"`,
    ` FechaHoraEmision="${esc(felDateTime(new Date(dte.fechaEmision)))}"`,
    ` CodigoMoneda="${esc(dte.moneda || 'GTQ')}"/>`,

    `<dte:Emisor NITEmisor="${esc(dte.emisor.nit)}"`,
    ` NombreEmisor="${esc(dte.emisor.nombre)}"`,
    ` CodigoEstablecimiento="${esc(dte.emisor.codigoEstablecimiento)}"`,
    ` NombreComercial="${esc(dte.emisor.nombreComercial)}"`,
    ` AfiliacionIVA="${esc(dte.emisor.afiliacionIVA)}">`,
    direccionXml('DireccionEmisor', opts.emisor),
    '</dte:Emisor>',

    `<dte:Receptor IDReceptor="${esc(dte.receptor.nit)}"`,
    ` NombreReceptor="${esc(dte.receptor.nombre)}">`,
    direccionXml('DireccionReceptor', receptorDir),
    '</dte:Receptor>',

    `<dte:Frases>${frases}</dte:Frases>`,
    `<dte:Items>${items}</dte:Items>`,

    '<dte:Totales>',
    totalImpuestos,
    `<dte:GranTotal>${money(dte.granTotal)}</dte:GranTotal>`,
    '</dte:Totales>',

    '</dte:DatosEmision>',
    '</dte:DTE>',
    '</dte:SAT>',
    '</dte:GTDocumento>',
  ].join('');
}

/**
 * XML de anulación de un DTE ya certificado.
 *
 * Anular no es borrar: el SAT exige un documento propio que referencia el
 * UUID original. Por eso `anularInvoice` no puede limitarse a marcar la fila
 * como ANULADO — mientras esto no se transmita, para el SAT la factura sigue
 * viva y el restaurante la debe pagar.
 */
export function buildAnulacionXml(params: {
  uuidOriginal: string;
  fechaEmisionOriginal: string;
  nitEmisor: string;
  idReceptor: string;
  motivo: string;
}): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<dte:GTAnulacionDocumento xmlns:dte="${DTE_NS}" Version="0.1">`,
    '<dte:SAT>',
    '<dte:AnulacionDTE ID="DatosCertificados">',
    `<dte:DatosGenerales ID="DatosAnulacion"`,
    ` NumeroDocumentoAAnular="${esc(params.uuidOriginal)}"`,
    ` NITEmisor="${esc(params.nitEmisor)}"`,
    ` IDReceptor="${esc(params.idReceptor)}"`,
    ` FechaEmisionDocumentoAnular="${esc(params.fechaEmisionOriginal)}"`,
    ` FechaHoraAnulacion="${felDateTime()}"`,
    ` MotivoAnulacion="${esc(params.motivo || 'Anulación solicitada por el emisor')}"/>`,
    '</dte:AnulacionDTE>',
    '</dte:SAT>',
    '</dte:GTAnulacionDocumento>',
  ].join('');
}
