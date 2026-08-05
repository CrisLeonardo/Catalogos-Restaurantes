/* ============================================================
   REGISTRO DE CERTIFICADORES
   ------------------------------------------------------------
   Qué certificadores saben transmitir de verdad. INFILE es el único
   implementado (Fase 3): es el más usado en Guatemala y el que se
   contrató primero.

   G4S, Digifact y OTRO siguen declarados en PROVIDER_META con
   `transmits: true` porque el SAT los reconoce y el restaurante los puede
   tener contratados — pero aquí no hay adaptador todavía. El resultado
   debe ser un mensaje honesto ("no está conectado"), nunca un intento
   silencioso contra un endpoint que no existe: en la ruta de una factura
   fiscal, fallar claro vale más que fallar tarde.

   Agregar un certificador es escribir su adaptador contra el contrato de
   types.ts y sumarlo a este mapa. Nada más cambia.
   ============================================================ */

import type { FelProvider } from '@/lib/fel';
import type { FelProviderAdapter } from './types';
import { infileAdapter } from './infile';

const ADAPTERS: Partial<Record<FelProvider, FelProviderAdapter>> = {
  INFILE: infileAdapter,
};

/** Adaptador del certificador, o null si aún no está implementado. */
export function getAdapter(provider: FelProvider): FelProviderAdapter | null {
  return ADAPTERS[provider] ?? null;
}

/** ¿Este certificador puede transmitir hoy desde Leogin? */
export function puedeTransmitir(provider: FelProvider): boolean {
  return getAdapter(provider) !== null;
}
