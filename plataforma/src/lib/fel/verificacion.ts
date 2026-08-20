/* ============================================================
   VERIFICACIÓN DEL DTE · el enlace que va en el ticket
   ------------------------------------------------------------
   Un DTE que el cliente no puede comprobar no le sirve de mucho. El SAT
   publica un verificador donde cualquiera consulta un documento con su
   número de autorización, y acepta los datos por la URL, así que se puede
   dejar impreso un enlace que abre la factura ya cargada — o un QR que la
   abre de un escaneo.

   Esto es lo que convierte el ticket térmico en el comprobante que el
   cliente se lleva: hasta ahora el ticket no mencionaba la factura por
   ningún lado, aunque el DTE existiera.

   Sin dependencias: entra un documento, sale una cadena.
   ============================================================ */

/** Verificador público de DTE del SAT. */
const VERIFICADOR = 'https://felpub.c.sat.gob.gt/verificador-web/publico/vistas/verificacionDte.jsf';

/** Lo que hace falta para armar el enlace. Son los datos que el SAT pide. */
export interface DatosVerificacion {
  /** Número de autorización (UUID) que devolvió el certificador. */
  numeroAutorizacion: string;
  nitEmisor: string;
  /** NIT, CUI o 'CF' del receptor. */
  idReceptor: string;
  montoTotal: number;
}

/**
 * Enlace al verificador del SAT con el documento ya cargado.
 *
 * Devuelve null cuando falta cualquier dato: un enlace a medias lleva al
 * cliente a un formulario vacío y parece que la factura no existe, que es
 * peor que no imprimir enlace.
 */
export function urlVerificacion(d: DatosVerificacion): string | null {
  if (!d.numeroAutorizacion || !d.nitEmisor || !d.idReceptor) return null;
  // Un registro interno no está en el SAT: enlazarlo sería mentir.
  if (d.numeroAutorizacion.startsWith('INT-')) return null;

  const q = new URLSearchParams({
    tipo: 'autorizacion',
    numero: d.numeroAutorizacion,
    emisor: d.nitEmisor,
    receptor: d.idReceptor,
    monto: Number(d.montoTotal || 0).toFixed(6),
  });
  return `${VERIFICADOR}?${q.toString()}`;
}

/** Dirección corta y legible, para imprimirla donde el QR no cabe. */
export const VERIFICADOR_CORTO = 'felpub.c.sat.gob.gt';
