/* ============================================================
   ESTADOS DE UNA ORDEN DE COMPRA
   ------------------------------------------------------------
   Auditoría 2026-11-03, ficha 0.8 (X10). El estado cambiaba sin mirar
   el anterior: una compra RECIBIDA podía volver a BORRADOR y recibirse
   otra vez, sumando el stock dos veces. La base lo impide desde la
   migración 159; aquí vive la misma regla para que la acción la
   aplique aunque la 159 no haya corrido y para dar mensajes claros.

        BORRADOR → ENVIADA → RECIBIDA
        BORRADOR → RECIBIDA
        BORRADOR | ENVIADA → CANCELADA

   RECIBIDA y CANCELADA son finales. Corregir lo recibido será una
   devolución (ficha 4.2), no reabrir la orden.
   ============================================================ */

export type EstadoCompra = 'BORRADOR' | 'ENVIADA' | 'RECIBIDA' | 'CANCELADA';

/** Desde qué estados se puede llegar a cada uno. */
export const DESDE: Record<EstadoCompra, readonly EstadoCompra[]> = {
  BORRADOR: [],
  ENVIADA: ['BORRADOR'],
  RECIBIDA: ['BORRADOR', 'ENVIADA'],
  CANCELADA: ['BORRADOR', 'ENVIADA'],
};

const NOMBRE: Record<EstadoCompra, string> = {
  BORRADOR: 'borrador',
  ENVIADA: 'enviada',
  RECIBIDA: 'recibida',
  CANCELADA: 'cancelada',
};

export function nombreDeEstado(estado: string): string {
  return NOMBRE[estado as EstadoCompra] ?? estado.toLowerCase();
}

export function puedePasar(desde: string, hacia: EstadoCompra): boolean {
  return (DESDE[hacia] as readonly string[]).includes(desde);
}

/** Por qué no se pudo: el mismo texto que da la base (migración 159). */
export function motivoDeRechazo(desde: string, hacia: EstadoCompra): string {
  if (desde === 'RECIBIDA') {
    return `Esta orden ya se recibió y su mercadería está en el inventario: no puede pasar a ${nombreDeEstado(hacia)}.`;
  }
  if (desde === 'CANCELADA') {
    return `Esta orden está cancelada: no puede pasar a ${nombreDeEstado(hacia)}.`;
  }
  return `Una orden ${nombreDeEstado(desde)} no puede pasar a ${nombreDeEstado(hacia)}.`;
}

type ErrorDeBase = { code?: string | null; message?: string | null } | null | undefined;

/**
 * Mensaje para la persona. Los errores que la base lanza a propósito
 * (validaciones, candados entre restaurantes, estados) ya vienen en
 * español y se muestran tal cual; cualquier otro se cambia por uno
 * genérico en vez de enseñar el texto técnico.
 */
export function mensajeDeCompra(error: ErrorDeBase, generico: string): string {
  const code = error?.code ?? '';
  const propios = ['P0001', 'LGC03', '23514', '22023', 'P0002'];
  if (propios.includes(code) && error?.message) return error.message;
  return generico;
}
