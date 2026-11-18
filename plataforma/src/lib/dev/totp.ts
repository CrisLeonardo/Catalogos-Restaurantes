/* ============================================================
   CÓDIGO DE 6 CIFRAS (TOTP, RFC 6238) — solo para desarrollo
   ------------------------------------------------------------
   Lo usa `/api/dev-login` para completar el segundo factor de una cuenta
   de prueba LOCAL sin que nadie teclee un código: inscribe una app con
   un secreto recién creado y calcula aquí el código de ese momento, igual
   que lo haría una app autenticadora. La sesión que resulta es `aal2` de
   verdad: las políticas de la base (migración 137) se siguen cumpliendo.

   No lo importa ningún código de producción: la ruta que lo usa responde
   404 fuera de un Supabase local con DEV_LOGIN=1.
   ============================================================ */

import { createHmac } from 'node:crypto';

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** Secreto en base32 (el que devuelve Supabase al inscribir) → bytes. */
export function base32ABytes(secreto: string): Buffer {
  const limpio = secreto.replace(/=+$/, '').replace(/\s+/g, '').toUpperCase();
  let bits = 0;
  let valor = 0;
  const salida: number[] = [];
  for (const letra of limpio) {
    const i = BASE32.indexOf(letra);
    if (i === -1) throw new Error('Secreto base32 inválido.');
    valor = (valor << 5) | i;
    bits += 5;
    if (bits >= 8) {
      salida.push((valor >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(salida);
}

/** Código TOTP (SHA-1, pasos de 30 s) de `clave` en el instante `ahoraMs`. */
export function codigoTotp(clave: Buffer, ahoraMs: number = Date.now(), cifras = 6, pasoS = 30): string {
  const contador = Math.floor(ahoraMs / 1000 / pasoS);
  const mensaje = Buffer.alloc(8);
  mensaje.writeBigUInt64BE(BigInt(contador));
  const hmac = createHmac('sha1', clave).update(mensaje).digest();
  const desfase = hmac[hmac.length - 1] & 0x0f;
  const numero = ((hmac[desfase] & 0x7f) << 24)
    | (hmac[desfase + 1] << 16)
    | (hmac[desfase + 2] << 8)
    | hmac[desfase + 3];
  return String(numero % 10 ** cifras).padStart(cifras, '0');
}
