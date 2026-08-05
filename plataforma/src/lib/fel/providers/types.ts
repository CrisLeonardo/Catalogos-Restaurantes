/* ============================================================
   CONTRATO DE CERTIFICADOR FEL
   ------------------------------------------------------------
   Un adaptador por certificador (INFILE, G4S, Digifact…). Todos reciben el
   mismo XML del SAT y devuelven el mismo resultado normalizado; lo que
   cambia entre ellos es el transporte y el dialecto de sus respuestas.

   ── La decisión que sostiene la cola de reintentos ──
   `reintentable` separa dos fracasos que se ven igual desde afuera y que
   NO se deben tratar igual:

     · El certificador no contestó, dio 500 o se cortó la red → reintentar.
       La venta ya ocurrió y la factura se le debe al cliente; rendirse
       aquí es perder un documento fiscal por un problema pasajero.

     · El DTE fue rechazado (NIT inválido, frase incorrecta, credenciales
       malas) → NO reintentar. Reenviar exactamente lo mismo mil veces da
       exactamente el mismo rechazo, gasta cuota contra el certificador y
       esconde el problema real detrás de un contador que sube. Ese caso
       necesita que alguien corrija algo.

   Cuando hay duda, se marca reintentable: un reintento de más cuesta una
   llamada HTTP; un reintento de menos cuesta una factura.
   ============================================================ */

import type { FelCredentials } from '@/lib/fel/credentials';
import type { FelProvider } from '@/lib/fel';

export type FelAmbiente = 'PRUEBAS' | 'PRODUCCION';

export interface CertificarInput {
  /** DTE en XML del SAT, sin firmar. La firma es responsabilidad del adaptador. */
  xml: string;
  credentials: FelCredentials;
  ambiente: FelAmbiente;
  nitEmisor: string;
}

export interface CertificarOk {
  ok: true;
  /** UUID de autorización que asigna el SAT. Es la identidad fiscal del documento. */
  uuid: string;
  serie: string;
  numero: string;
  numeroAutorizacion: string;
  fechaCertificacion: string;
  /** DTE firmado y certificado. Se archiva: es el documento con validez legal. */
  xmlCertificado: string;
}

export interface CertificarFail {
  ok: false;
  /** Mensaje para el dueño del restaurante, no un volcado del certificador. */
  error: string;
  /** Ver la nota de arriba: distingue "está caído" de "lo rechazó". */
  reintentable: boolean;
  /** Respuesta cruda, para diagnosticar sin adivinar. Nunca se muestra en la UI. */
  detalle?: string;
}

export type CertificarResult = CertificarOk | CertificarFail;

export interface AnularInput {
  uuidOriginal: string;
  fechaEmisionOriginal: string;
  nitEmisor: string;
  idReceptor: string;
  motivo: string;
  credentials: FelCredentials;
  ambiente: FelAmbiente;
}

export type AnularResult =
  | { ok: true; fechaAnulacion: string; xmlCertificado?: string }
  | { ok: false; error: string; reintentable: boolean; detalle?: string };

export interface FelProviderAdapter {
  key: FelProvider;
  label: string;
  certificar(input: CertificarInput): Promise<CertificarResult>;
  anular(input: AnularInput): Promise<AnularResult>;
}

/**
 * Corta una llamada que se quedó colgada.
 *
 * Sin esto, un certificador que acepta la conexión y nunca responde deja la
 * server action esperando y bloquea la caja — exactamente lo que la cola de
 * reintentos existe para evitar. 20s es holgado para una API de facturación
 * y sigue siendo tolerable para el cajero que espera el ticket.
 */
export const FEL_TIMEOUT_MS = 20_000;

export async function fetchConTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = FEL_TIMEOUT_MS,
): Promise<Response> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ac.signal, cache: 'no-store' });
  } finally {
    clearTimeout(t);
  }
}

/** Un error de red/timeout siempre es reintentable; distinguirlo del rechazo. */
export function errorDeRed(e: unknown): CertificarFail {
  const msg = e instanceof Error ? e.message : String(e);
  const esTimeout = /abort|timeout/i.test(msg);
  return {
    ok: false,
    reintentable: true,
    error: esTimeout
      ? 'El certificador no respondió a tiempo. La factura quedó en cola y se reintenta sola.'
      : 'No se pudo contactar al certificador. La factura quedó en cola y se reintenta sola.',
    detalle: msg,
  };
}
