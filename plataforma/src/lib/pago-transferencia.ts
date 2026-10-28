/* ============================================================
   PAGO POR TRANSFERENCIA DEL COMENSAL — reglas puras (mig. 149)
   ------------------------------------------------------------
   docs/planes/PLAN_NECESIDAD_Y_PLAN_EN_LINEA_2026-10-28.md (N4).

   El comensal elige «Transferencia» al pedir, ve la cuenta del
   restaurante en el seguimiento y sube ahí su comprobante; el
   restaurante lo confirma con un toque desde el pedido. Es el mismo
   bucket privado que el cobro de Leogin (`payment-proofs`), bajo
   `pedidos/{restaurant_id}/`.
   ============================================================ */

import { COMPROBANTE_TIPOS, hayCuenta, type DatosBancarios } from '@/lib/pago-plan';
import type { ThemeConfig } from '@/lib/theme/defaults';

export type EstadoTransferencia = 'ESPERANDO' | 'POR_CONFIRMAR' | 'CONFIRMADO' | 'RECHAZADO';

export const TRANSFERENCIA_ETIQUETA: Record<EstadoTransferencia, string> = {
  ESPERANDO: 'Esperando comprobante',
  POR_CONFIRMAR: 'Comprobante por confirmar',
  CONFIRMADO: 'Transferencia confirmada',
  RECHAZADO: 'Transferencia no recibida',
};

type ConfigTransferencia = Pick<ThemeConfig,
  'acceptsTransfer' | 'transferBank' | 'transferAccountType' | 'transferAccountNumber' | 'transferAccountHolder'>;

export function cuentaDelRestaurante(c: Partial<ConfigTransferencia>): DatosBancarios {
  return {
    banco: c.transferBank ?? '',
    tipoCuenta: c.transferAccountType ?? '',
    numeroCuenta: c.transferAccountNumber ?? '',
    titular: c.transferAccountHolder ?? '',
  };
}

/** Se ofrece transferencia solo si está encendida Y hay a dónde transferir. */
export function aceptaTransferencia(c: Partial<ConfigTransferencia>): boolean {
  return !!c.acceptsTransfer && hayCuenta(cuentaDelRestaurante(c));
}

/** Limpia lo que el dueño escribe en Ajustes antes de guardarlo en el tema. */
export function limpiarCuenta(c: Partial<ConfigTransferencia>): ConfigTransferencia {
  const corto = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, 80);
  return {
    acceptsTransfer: !!c.acceptsTransfer,
    transferBank: corto(c.transferBank),
    transferAccountType: corto(c.transferAccountType),
    transferAccountNumber: corto(c.transferAccountNumber).replace(/[^\d\s-]/g, ''),
    transferAccountHolder: corto(c.transferAccountHolder),
  };
}

/** `pedidos/{restaurant_id}/{uuid}.{ext}`: la única forma que se acepta al registrar. */
export function rutaComprobantePedidoValida(restaurantId: string, ruta: string): boolean {
  const exts = Object.values(COMPROBANTE_TIPOS).join('|');
  return new RegExp(`^pedidos/${restaurantId}/[0-9a-f-]{36}\\.(${exts})$`, 'i').test(ruta);
}
