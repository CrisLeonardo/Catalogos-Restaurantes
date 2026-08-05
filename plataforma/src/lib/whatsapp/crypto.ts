/* ============================================================
   CIFRADO DEL TOKEN DE WHATSAPP (migración 102)
   ------------------------------------------------------------
   Este archivo ya no implementa cifrado: delega en la caja fuerte
   compartida (src/lib/secret-box.ts), que nació en la Fase 3 al aparecer
   el segundo secreto de tercero que hay que guardar y recuperar (las
   credenciales del certificador FEL). Dos implementaciones idénticas de
   AES-256-GCM eran una de más.

   El cambio es compatible con lo ya guardado: mismo algoritmo, mismo
   formato (iv.tag.ciphertext en base64url) y secret-box sigue aceptando
   WHATSAPP_TOKEN_KEY como nombre de la clave. Los tokens cifrados antes de
   este cambio se descifran igual, y un deploy sin renombrar la variable de
   entorno no deja el canal mudo.

   Se conservan los nombres encryptToken/decryptToken/isTokenKeyConfigured
   para no tocar los llamadores de la Fase 1A.
   ============================================================ */

import { sealSecret, openSecret, isSecretKeyConfigured } from '@/lib/secret-box';

/** Cifra el token en claro. Devuelve el valor listo para access_token_cipher. */
export function encryptToken(plain: string): string {
  return sealSecret(plain);
}

/**
 * Descifra lo guardado en access_token_cipher.
 * Lanza si el valor fue alterado o si la clave no es la que lo cifró — que es
 * justo lo que se quiere: mejor fallar el envío que hablarle a Meta con un
 * token corrupto.
 */
export function decryptToken(stored: string): string {
  return openSecret(stored);
}

/** ¿Está el cifrado configurado? Para que la UI avise antes de intentar conectar. */
export function isTokenKeyConfigured(): boolean {
  return isSecretKeyConfigured();
}
