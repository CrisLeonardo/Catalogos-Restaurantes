import type { PaymentMethod } from '@/lib/payment-method';

export interface ResultadoCobro {
  error?: string;
  needsMigration?: boolean;
  /** Mantener identidad y solicitud: aún no sabemos si hubo commit. */
  incierto?: boolean;
  intentoId?: string;
  cobrado?: number;
  paymentIds?: string[];
  orderIds?: string[];
}

export interface SolicitudCobro {
  mesa: number;
  operacion: 'parte' | 'cierre';
  items: string[];
  pagos: { method: PaymentMethod; amount: number; cashReceived?: number | null }[];
}
export interface IntentoCobro { id: string; solicitud: SolicitudCobro }
export const identidadCobroValida = (id: unknown): id is string =>
  typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

const clave = (restaurantId: string, actorId: string) => `leogin:cobro-pendiente:${restaurantId}:${actorId}`;

/** Sin TTL. Una respuesta incierta se resuelve con la solicitud ORIGINAL,
 * incluso tras recargar. Si el almacenamiento falla no se envía dinero. */
export function leerIntento(storage: Storage, restaurantId: string, actorId: string): IntentoCobro | null {
  const raw = storage.getItem(clave(restaurantId, actorId));
  if (!raw) return null;
  const intento = JSON.parse(raw) as IntentoCobro;
  if (!identidadCobroValida(intento.id) || !intento.solicitud) throw new Error('No se pudo leer el cobro pendiente. Revisa la cuenta.');
  return intento;
}
export function prepararIntento(storage: Storage, restaurantId: string, actorId: string, solicitud: SolicitudCobro): IntentoCobro {
  const previo = leerIntento(storage, restaurantId, actorId);
  if (previo) return previo;
  const intento = { id: crypto.randomUUID(), solicitud };
  storage.setItem(clave(restaurantId, actorId), JSON.stringify(intento));
  return intento;
}
export function resolverIntento(storage: Storage, restaurantId: string, actorId: string, id: string) {
  if (leerIntento(storage, restaurantId, actorId)?.id === id) storage.removeItem(clave(restaurantId, actorId));
}
