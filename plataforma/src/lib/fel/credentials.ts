/* ============================================================
   CREDENCIALES DEL CERTIFICADOR · lectura y escritura cifradas
   ------------------------------------------------------------
   Son las llaves con las que se emite factura fiscal a nombre del
   restaurante: quien las lea puede facturar por él. Hasta la migración 106
   vivían en texto plano en fel_settings.

   Multi-tenant: cada restaurante tiene su propia cuenta con el
   certificador, así que esto NO puede resolverse con variables de entorno
   como en api-keys.ts (que documenta el patrón para llaves *de Leogin*,
   una sola cuenta para toda la plataforma). Van cifradas en la base, con
   la clave maestra fuera de ella.

   ── Transición sin downtime ──
   La migración agregó las columnas *_cipher pero NO migró los valores:
   cifrar necesita la clave de la aplicación, que a propósito no vive en la
   base. Así que la lectura cae a la columna vieja cuando la cifrada está
   vacía, y el siguiente guardado la deja cifrada. Nadie pierde su
   configuración ni tiene que volver a escribir sus llaves.
   ============================================================ */

import { sealSecret, openSecret, isSecretKeyConfigured } from '@/lib/secret-box';

export { isSecretKeyConfigured };

/** Lo que fel_settings guarda de credenciales, en cualquiera de los dos formatos. */
export interface StoredCredentials {
  api_usuario?: string | null;
  api_clave?: string | null;
  api_llave_firma?: string | null;
  api_clave_cipher?: string | null;
  api_llave_firma_cipher?: string | null;
}

export interface FelCredentials {
  usuario: string;
  clave: string;
  llaveFirma: string;
}

/**
 * Descifra un valor guardado, cayendo al texto plano heredado.
 *
 * Un fallo de descifrado NO cae a texto plano: si la columna cifrada tiene
 * contenido y no abre, algo está mal (clave rotada, dato alterado) y usar
 * el respaldo viejo enmascararía el problema justo en la ruta donde peor
 * viene — emitir una factura fiscal con credenciales equivocadas.
 */
function readSecret(cipher: string | null | undefined, legacy: string | null | undefined): string {
  if (cipher) return openSecret(cipher);
  return legacy ?? '';
}

/** Credenciales listas para llamar al certificador. Lanza si el cifrado está roto. */
export function readCredentials(row: StoredCredentials): FelCredentials {
  return {
    usuario: row.api_usuario ?? '',
    clave: readSecret(row.api_clave_cipher, row.api_clave),
    llaveFirma: readSecret(row.api_llave_firma_cipher, row.api_llave_firma),
  };
}

/**
 * Prepara las columnas a guardar a partir de credenciales en claro.
 *
 * Las columnas viejas se vacían en el mismo guardado: dejar el texto plano
 * "por si acaso" convertiría la migración en un adorno — el secreto seguiría
 * legible para cualquiera con acceso a la base.
 *
 * Campo vacío = "no lo cambies". La UI nunca devuelve la clave guardada al
 * navegador (se muestra como campo en blanco con placeholder), así que un
 * guardado normal de los demás datos llegaría aquí con la clave vacía y la
 * borraría. Por eso `previous` decide qué conservar.
 */
export function writeCredentials(
  input: { usuario: string; clave: string; llaveFirma: string },
  previous?: StoredCredentials | null,
): Record<string, string | null> {
  const keepClave = input.clave.trim() === '';
  const keepFirma = input.llaveFirma.trim() === '';

  return {
    api_usuario: input.usuario.trim(),

    api_clave_cipher: keepClave
      ? (previous?.api_clave_cipher ?? (previous?.api_clave ? sealSecret(previous.api_clave) : null))
      : sealSecret(input.clave),

    api_llave_firma_cipher: keepFirma
      ? (previous?.api_llave_firma_cipher ??
         (previous?.api_llave_firma ? sealSecret(previous.api_llave_firma) : null))
      : sealSecret(input.llaveFirma),

    // El texto plano se retira en cuanto hay versión cifrada equivalente.
    api_clave: '',
    api_llave_firma: '',
  };
}

/** ¿Hay credenciales suficientes para intentar transmitir? Para avisar antes de emitir. */
export function hasCredentials(row: StoredCredentials): boolean {
  const tieneClave = Boolean(row.api_clave_cipher || row.api_clave);
  const tieneFirma = Boolean(row.api_llave_firma_cipher || row.api_llave_firma);
  return Boolean(row.api_usuario) && tieneClave && tieneFirma;
}
