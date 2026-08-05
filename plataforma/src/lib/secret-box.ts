/* ============================================================
   CAJA FUERTE DE SECRETOS DE TERCEROS
   ------------------------------------------------------------
   Cifrado reversible para los secretos que Leogin guarda POR CUENTA de
   cada restaurante y necesita recuperar para usarlos: el token de la Cloud
   API de WhatsApp (migración 102) y las credenciales del certificador FEL
   (migración 106).

   Es lo contrario de api-keys.ts y staff-pin-crypto.ts, que guardan HASH:
   esos solo verifican un secreto que el usuario vuelve a escribir. Aquí hay
   que recuperar el valor para llamar a un tercero, así que hace falta
   cifrado, no hash.

   AES-256-GCM porque además de cifrar autentica: si alguien altera el texto
   cifrado en la base, el descifrado falla en vez de devolver basura en
   silencio — y en la ruta de una factura fiscal, fallar ruidosamente es
   mucho mejor que firmar con un valor corrupto.

   La clave vive en el entorno (LEOGIN_SECRET_KEY), nunca en la base: quien
   consiga una copia del backup no puede usar los secretos.

   Formato: iv.tag.ciphertext, en base64url separado por puntos.
   ============================================================ */

import crypto from 'node:crypto';

const IV_BYTES = 12;  // recomendado para GCM
const KEY_BYTES = 32; // AES-256

/**
 * Clave maestra. Acepta base64 o hex para no imponer un formato: lo que
 * importa es que sean 32 bytes.
 *
 * WHATSAPP_TOKEN_KEY se sigue aceptando como nombre alterno porque fue la
 * primera en existir (Fase 1A) y ya puede estar puesta en producción;
 * renombrarla a la fuerza dejaría el canal mudo tras un deploy.
 */
function masterKey(): Buffer {
  const raw = process.env.LEOGIN_SECRET_KEY || process.env.WHATSAPP_TOKEN_KEY;
  if (!raw) {
    throw new Error(
      'LEOGIN_SECRET_KEY no está configurada: sin ella no se pueden guardar ni ' +
      'leer los secretos de terceros. Genera una con: openssl rand -base64 32',
    );
  }

  const key = /^[0-9a-fA-F]{64}$/.test(raw)
    ? Buffer.from(raw, 'hex')
    : Buffer.from(raw, 'base64');

  if (key.length !== KEY_BYTES) {
    throw new Error(
      `LEOGIN_SECRET_KEY debe ser de ${KEY_BYTES} bytes (recibidos ${key.length}). ` +
      'Genera una con: openssl rand -base64 32',
    );
  }
  return key;
}

/** Cifra un secreto en claro. */
export function sealSecret(plain: string): string {
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv('aes-256-gcm', masterKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    iv.toString('base64url'),
    tag.toString('base64url'),
    ciphertext.toString('base64url'),
  ].join('.');
}

/** Descifra. Lanza si el valor fue alterado o la clave no es la que cifró. */
export function openSecret(stored: string): string {
  const parts = stored.split('.');
  if (parts.length !== 3) {
    throw new Error('Secreto con formato inválido (se esperaba iv.tag.ciphertext).');
  }
  const [ivB64, tagB64, dataB64] = parts;

  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    masterKey(),
    Buffer.from(ivB64, 'base64url'),
  );
  decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));

  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

/** ¿Está configurada la clave? Para avisar en la UI antes de intentar guardar. */
export function isSecretKeyConfigured(): boolean {
  try {
    masterKey();
    return true;
  } catch {
    return false;
  }
}
