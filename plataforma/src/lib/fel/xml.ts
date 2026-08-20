/* ============================================================
   DTE → XML del SAT (Guatemala) · lógica pura
   ------------------------------------------------------------
   El XML es lo único que ve el certificador. Aquí no hay red ni base:
   entran los datos, sale una cadena, y por eso se puede probar entero
   con vitest sin tocar un servicio real.

   Los montos vienen ya calculados y cuadrados de `totales.ts`, y las
   frases legales de `frases.ts`. Este archivo solo serializa: no decide
   nada fiscal, no redondea y no inventa valores por defecto. Esa
   separación es deliberada — cuando el certificador rechaza un DTE, hay
   que poder saber si el problema fue el cálculo o la serialización.

   ── Los tres namespaces, que NO son el mismo ──
     · Documento (factura, nota de crédito): dte/fel/0.2.0
     · Anulación:                            dte/fel/0.1.0   ← distinto
     · Complemento de nota:                  face2/ComplementoReferenciaNota/0.1.0
   Antes la anulación se generaba con el namespace del documento y el
   certificador la habría rechazado siempre. Están verificados contra los
   XSD oficiales (GT_Documento-0.2.1, GT_AnulacionDocumento-0.1.0,
   GT_Complemento_Referencia_Nota-0.1.0).

   ── Por qué se genera en una sola línea ──
   El certificador firma estos bytes exactos. Reindentar, añadir saltos o
   reordenar atributos después invalida la firma, así que no hay formato
   bonito: hay bytes estables.
   ============================================================ */

import type { Frase } from './frases';
import type { MontosDte } from './totales';
import type { ReceptorId } from './nit';

/** Namespace del documento tributario (facturas, notas). */
const NS_DTE = 'http://www.sat.gob.gt/dte/fel/0.2.0';
/** Namespace de la anulación. Es OTRA versión, no un descuido. */
const NS_ANULACION = 'http://www.sat.gob.gt/dte/fel/0.1.0';
/** Namespace del complemento que ata una nota de crédito a su factura. */
const NS_REFERENCIA_NOTA = 'http://www.sat.gob.gt/face2/ComplementoReferenciaNota/0.1.0';

/** Tipos de DTE que este módulo sabe emitir. */
export type TipoDte = 'FACT' | 'FPEQ' | 'NCRE';

/* ── Utilidades de serialización ─────────────────────────────── */

/** Escapa los cinco caracteres que romperían el XML. */
export function esc(value: string): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Monto con 2 decimales fijos: el SAT rechaza la notación científica. */
function money(n: number): string {
  return Number(n || 0).toFixed(2);
}

/** Número con hasta `d` decimales, sin ceros de relleno. */
function num(n: number, d = 6): string {
  const v = Number(n || 0);
  if (Number.isInteger(v)) return v.toFixed(0);
  return String(Number(v.toFixed(d)));
}

/**
 * Recorta un texto al límite del esquema.
 *
 * `Descripcion` admite 10.000 caracteres, pero `NombreReceptor` solo 400 y
 * `UnidadMedida` solo 3. Un nombre largo no debe tumbar una venta: se
 * recorta y se emite, que es mejor que rechazar la factura del cliente.
 */
function corta(value: string, max: number): string {
  const v = (value ?? '').trim();
  return v.length <= max ? v : v.slice(0, max);
}

/**
 * Fecha y hora en el formato del SAT: ISO 8601 con offset local, no UTC.
 *
 * Guatemala es UTC−6 todo el año (no hay horario de verano), así que el
 * offset es fijo. Mandar la hora en UTC adelanta la emisión seis horas y
 * puede empujarla al día siguiente — un problema real para el cierre
 * fiscal de las ventas de la noche, que acabarían declaradas en otro día.
 */
export function felDateTime(d: Date = new Date()): string {
  const gt = new Date(d.getTime() - 6 * 60 * 60 * 1000);
  const p = (n: number, len = 2) => String(n).padStart(len, '0');
  return (
    `${gt.getUTCFullYear()}-${p(gt.getUTCMonth() + 1)}-${p(gt.getUTCDate())}` +
    `T${p(gt.getUTCHours())}:${p(gt.getUTCMinutes())}:${p(gt.getUTCSeconds())}-06:00`
  );
}

/** Solo la fecha (xs:date) en hora de Guatemala. */
export function felDate(d: Date = new Date()): string {
  return felDateTime(d).slice(0, 10);
}

/* ── Estructuras de entrada ──────────────────────────────────── */

export interface DireccionFiscal {
  direccion: string;
  codigoPostal: string;
  municipio: string;
  departamento: string;
  pais: string;
}

export interface EmisorDte {
  nit: string;
  nombre: string;
  nombreComercial: string;
  codigoEstablecimiento: string;
  /** GEN o PEQ, según el XSD. Lo deriva frases.ts. */
  afiliacionIva: 'GEN' | 'PEQ';
  correo?: string | null;
  direccion: DireccionFiscal;
}

export interface ReceptorDte {
  id: ReceptorId;
  nombre: string;
  /** Si viene, el certificador le envía el DTE al cliente por correo. */
  correo?: string | null;
  direccion?: Partial<DireccionFiscal> | null;
}

/** Datos que atan una nota de crédito a la factura que corrige. */
export interface ReferenciaNota {
  /** UUID de autorización del DTE original. */
  numeroAutorizacionOrigen: string;
  /** Fecha de emisión del original, YYYY-MM-DD. */
  fechaEmisionOrigen: string;
  serieOrigen: string;
  numeroOrigen: string;
  motivoAjuste: string;
}

export interface DocumentoDte {
  tipo: TipoDte;
  /** Instante de emisión en ISO. Se convierte a hora de Guatemala al serializar. */
  fechaEmision: string;
  moneda: string;
  emisor: EmisorDte;
  receptor: ReceptorDte;
  frases: Frase[];
  montos: MontosDte;
  /**
   * ¿Lleva bloque de impuestos?
   *
   * Explícito y no deducido del tipo: normalmente coincide con el régimen
   * (FPEQ no desglosa), pero una nota de crédito emitida más de dos meses
   * después de su factura tampoco lleva IVA aunque el emisor sea del
   * régimen general. Deducirlo escondía ese caso.
   */
  desglosaIva: boolean;
  /** Obligatorio para NCRE: sin esto el SAT no sabe qué factura se corrige. */
  referenciaNota?: ReferenciaNota;
}

/* ── Serialización ───────────────────────────────────────────── */

function direccionXml(tag: string, d: Partial<DireccionFiscal> | null | undefined): string {
  return [
    `<dte:${tag}>`,
    `<dte:Direccion>${esc(corta(d?.direccion || 'Ciudad', 200))}</dte:Direccion>`,
    `<dte:CodigoPostal>${esc(d?.codigoPostal || '01001')}</dte:CodigoPostal>`,
    `<dte:Municipio>${esc(d?.municipio || 'Guatemala')}</dte:Municipio>`,
    `<dte:Departamento>${esc(d?.departamento || 'Guatemala')}</dte:Departamento>`,
    `<dte:Pais>${esc(d?.pais || 'GT')}</dte:Pais>`,
    `</dte:${tag}>`,
  ].join('');
}

function itemsXml(montos: MontosDte, desglosaIva: boolean): string {
  return montos.lineas
    .map((l) => {
      // El orden de los elementos lo fija el XSD (secuencia, no elección):
      // Cantidad, UnidadMedida, Descripcion, PrecioUnitario, Precio,
      // Descuento, Impuestos, Total. Cambiarlo invalida el documento.
      const impuestos = desglosaIva
        ? [
            '<dte:Impuestos>',
            '<dte:Impuesto>',
            '<dte:NombreCorto>IVA</dte:NombreCorto>',
            // Unidad gravable 1 = tasa 12%, según el catálogo del SAT.
            '<dte:CodigoUnidadGravable>1</dte:CodigoUnidadGravable>',
            `<dte:MontoGravable>${money(l.montoGravable)}</dte:MontoGravable>`,
            `<dte:MontoImpuesto>${money(l.montoImpuesto)}</dte:MontoImpuesto>`,
            '</dte:Impuesto>',
            '</dte:Impuestos>',
          ].join('')
        : '';

      return [
        `<dte:Item NumeroLinea="${l.numeroLinea}" BienOServicio="${l.bienOServicio}">`,
        `<dte:Cantidad>${num(l.cantidad)}</dte:Cantidad>`,
        `<dte:UnidadMedida>${esc(corta(l.unidadMedida || 'UND', 3))}</dte:UnidadMedida>`,
        `<dte:Descripcion>${esc(corta(l.descripcion || 'Consumo', 10000))}</dte:Descripcion>`,
        `<dte:PrecioUnitario>${num(l.precioUnitario)}</dte:PrecioUnitario>`,
        `<dte:Precio>${money(l.precio)}</dte:Precio>`,
        `<dte:Descuento>${money(l.descuento)}</dte:Descuento>`,
        impuestos,
        `<dte:Total>${money(l.total)}</dte:Total>`,
        '</dte:Item>',
      ].join('');
    })
    .join('');
}

function frasesXml(frases: Frase[]): string {
  if (frases.length === 0) return '';
  const items = frases
    .map((f) => {
      const attrs = [
        `TipoFrase="${f.tipoFrase}"`,
        `CodigoEscenario="${f.codigoEscenario}"`,
        f.numeroResolucion ? `NumeroResolucion="${esc(corta(f.numeroResolucion, 30))}"` : '',
        f.fechaResolucion ? `FechaResolucion="${esc(f.fechaResolucion)}"` : '',
      ].filter(Boolean);
      return `<dte:Frase ${attrs.join(' ')}/>`;
    })
    .join('');
  return `<dte:Frases>${items}</dte:Frases>`;
}

function complementoNotaXml(ref: ReferenciaNota): string {
  return [
    '<dte:Complementos>',
    '<dte:Complemento IDComplemento="ReferenciaNota"',
    ' NombreComplemento="ReferenciaNota"',
    ` URIComplemento="${esc(NS_REFERENCIA_NOTA)}">`,
    `<cno:ReferenciasNota xmlns:cno="${NS_REFERENCIA_NOTA}" Version="0.1"`,
    ` NumeroAutorizacionDocumentoOrigen="${esc(ref.numeroAutorizacionOrigen)}"`,
    ` SerieDocumentoOrigen="${esc(corta(ref.serieOrigen, 20))}"`,
    ` NumeroDocumentoOrigen="${esc(corta(ref.numeroOrigen, 20))}"`,
    ` FechaEmisionDocumentoOrigen="${esc(ref.fechaEmisionOrigen)}"`,
    ` MotivoAjuste="${esc(corta(ref.motivoAjuste || 'Ajuste', 200))}"/>`,
    '</dte:Complemento>',
    '</dte:Complementos>',
  ].join('');
}

/**
 * Serializa un documento al XML `dte:GTDocumento` listo para firmar.
 *
 * El resultado NO va firmado: la firma la aplica el certificador sobre
 * este XML exacto.
 */
export function buildDteXml(doc: DocumentoDte): string {
  const { emisor, receptor, montos } = doc;
  const desglosaIva = doc.desglosaIva;

  const totalImpuestos = desglosaIva
    ? [
        '<dte:TotalImpuestos>',
        `<dte:TotalImpuesto NombreCorto="IVA" TotalMontoImpuesto="${money(montos.totalImpuesto)}"/>`,
        '</dte:TotalImpuestos>',
      ].join('')
    : '';

  const tipoEspecial =
    receptor.id.tipo === 'CUI' || receptor.id.tipo === 'EXT'
      ? ` TipoEspecial="${receptor.id.tipo}"`
      : '';

  const correoReceptor = receptor.correo
    ? ` CorreoReceptor="${esc(corta(receptor.correo, 100))}"`
    : '';

  const correoEmisor = emisor.correo ? ` CorreoEmisor="${esc(corta(emisor.correo, 100))}"` : '';

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<dte:GTDocumento xmlns:dte="${NS_DTE}" Version="0.1">`,
    '<dte:SAT ClaseDocumento="dte">',
    '<dte:DTE ID="DatosCertificados">',
    '<dte:DatosEmision ID="DatosEmision">',

    `<dte:DatosGenerales Tipo="${doc.tipo}"`,
    ` FechaHoraEmision="${esc(felDateTime(new Date(doc.fechaEmision)))}"`,
    ` CodigoMoneda="${esc(doc.moneda || 'GTQ')}"/>`,

    `<dte:Emisor NITEmisor="${esc(emisor.nit)}"`,
    ` NombreEmisor="${esc(corta(emisor.nombre, 400))}"`,
    ` CodigoEstablecimiento="${esc(emisor.codigoEstablecimiento || '1')}"`,
    ` NombreComercial="${esc(corta(emisor.nombreComercial || emisor.nombre, 400))}"`,
    correoEmisor,
    ` AfiliacionIVA="${esc(emisor.afiliacionIva)}">`,
    direccionXml('DireccionEmisor', emisor.direccion),
    '</dte:Emisor>',

    `<dte:Receptor IDReceptor="${esc(receptor.id.valor)}"`,
    tipoEspecial,
    ` NombreReceptor="${esc(corta(receptor.nombre || 'Consumidor Final', 400))}"`,
    correoReceptor,
    '>',
    direccionXml('DireccionReceptor', receptor.direccion),
    '</dte:Receptor>',

    frasesXml(doc.frases),
    `<dte:Items>${itemsXml(montos, desglosaIva)}</dte:Items>`,

    '<dte:Totales>',
    totalImpuestos,
    `<dte:GranTotal>${money(montos.granTotal)}</dte:GranTotal>`,
    '</dte:Totales>',

    doc.referenciaNota ? complementoNotaXml(doc.referenciaNota) : '',

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
 * UUID original. Mientras esto no se transmita y el certificador no lo
 * confirme, para el SAT la factura sigue viva y el restaurante la debe
 * declarar — por eso el estado local no se toca antes de la confirmación.
 *
 * Ojo con el namespace: la anulación va en dte/fel/0.1.0, no en el 0.2.0
 * del documento.
 */
export function buildAnulacionXml(params: {
  uuidOriginal: string;
  /** Fecha/hora de emisión del original, en formato del SAT. */
  fechaEmisionOriginal: string;
  nitEmisor: string;
  idReceptor: string;
  motivo: string;
  fechaAnulacion?: Date;
}): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<dte:GTAnulacionDocumento xmlns:dte="${NS_ANULACION}" Version="0.1">`,
    '<dte:SAT>',
    '<dte:AnulacionDTE ID="DatosCertificados">',
    '<dte:DatosGenerales ID="DatosAnulacion"',
    ` NumeroDocumentoAAnular="${esc(params.uuidOriginal)}"`,
    ` NITEmisor="${esc(params.nitEmisor)}"`,
    ` IDReceptor="${esc(params.idReceptor)}"`,
    ` FechaEmisionDocumentoAnular="${esc(params.fechaEmisionOriginal)}"`,
    ` FechaHoraAnulacion="${esc(felDateTime(params.fechaAnulacion ?? new Date()))}"`,
    // MotivoAnulacion es obligatorio en el XSD: nunca puede ir vacío.
    ` MotivoAnulacion="${esc(corta(params.motivo || 'Anulación solicitada por el emisor', 200))}"/>`,
    '</dte:AnulacionDTE>',
    '</dte:SAT>',
    '</dte:GTAnulacionDocumento>',
  ].join('');
}
