/**
 * QUIÉN AUTORIZA UNA ANULACIÓN
 * ------------------------------------------------------------
 * La migración 079 creó `order_voids.approved_by` para que anular un plato
 * que YA salió a cocina necesitara la firma de alguien más. La columna
 * existía, el diálogo pedía un motivo de texto libre, y el código mandaba
 * `approvedBy = null` siempre: cualquiera con permiso de mesero podía
 * quitar de la cuenta un plato ya cocinado sin que nadie se enterara.
 *
 * La regla, en una frase: **lo que todavía no ha salido a cocina se anula
 * solo; lo que ya salió necesita a un encargado.**
 *
 * Y "encargado" no es un permiso nuevo —no hacía falta inventarlo—: es
 * cualquiera del restaurante que NO sea mesero puro, que es la línea que el
 * sistema ya traza entre quien solo toma pedidos y quien lleva el local
 * (`isMeseroOnly`). De ahí salen las dos mitades:
 *
 *   · si QUIEN ANULA ya es encargado, firma él y no hay PIN que pedir;
 *   · si es un mesero, tiene que pasarle la tablet a alguien de la lista.
 *
 * El PIN es el mismo de entrar al panel (`staff_pins`, migración 074), con
 * su mismo candado por intentos fallidos: no hay una segunda credencial que
 * aprender ni que administrar.
 */
import { isMeseroOnly } from '@/lib/permissions';
import type { OrderStatus } from '@/types';

/**
 * ¿Este pedido ya salió a cocina?
 *
 * `NEW` es lo único que todavía no se ha mandado —el mesero lo está
 * escribiendo o cocina no lo ha aceptado—. Quitar de ahí un plato es
 * corregirse a uno mismo, no descuadrar nada.
 */
export function necesitaAprobacion(status: OrderStatus | string): boolean {
  return status !== 'NEW';
}

/** ¿Puede esta persona firmar una anulación (la suya o la de otro)? */
export function puedeAprobar(
  role: string | null | undefined,
  permissions: string[] | null | undefined,
): boolean {
  return !isMeseroOnly(role, permissions);
}

/** Alguien de la lista de «¿quién autoriza?» del diálogo. */
export interface Aprobador {
  id: string;
  name: string;
  /** El cargo, para distinguir dos «Carlos» en la lista. */
  role: string;
}
