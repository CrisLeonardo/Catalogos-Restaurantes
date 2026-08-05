/* ============================================================
   CIFRADO DEL TOKEN DE WHATSAPP (migración 102)
   ------------------------------------------------------------
   El token de la Cloud API permite ENVIAR mensajes en nombre del negocio,
   así que no puede vivir en claro en la base. Aquí no sirve un hash como
   en staff_pins o api_keys: esos solo necesitan *verificar* un secreto que
   el usuario vuelve a escribir, mientras que aquí hay que *recuperar* el
   token para llamar a Meta. Por eso cifrado reversible (AES-256-GCM), con
   la clave fuera de la base (WHATSAPP_TOKEN_KEY).

   GCM y no CBC porque además de cifrar autentica: si alguien altera el
   texto cifrado en la base, el descifrado falla en vez de devolver basura
   silenciosamente.

   Formato guardado: iv.tag.ciphertext, los tres en base64url separados por
   punto (base64url no trae '/' ni '+', así que el valor viaja limpio en
   logs y URLs si alguna vez hiciera falta).
   ============================================================ */

import crypto from 'node:crypto';

const IV_BYTES = 12; // recomendado para GCM
const KEY_BYTES = 32; // AES-256

/**
 * Clave maestra desde el entorno. Acepta base64 o hex para no obligar a un
 * formato: lo que importa es que sean 32 bytes.
 */
function masterKey(): Buffer {
  const raw = process.env.WHATSAPP_TOKEN_KEY;
  if (!raw) {
    throw new Error(
      'WHATSAPP_TOKEN_KEY no está configurada: sin ella no se puede cifrar ni ' +
      'descifrar el token de WhatsApp. Genera una con: openssl rand -base64 32',
    );
  }

  const key = /^[0-9a-fA-F]{64}$/.test(raw)
    ? Buffer.from(raw, 'hex')
    : Buffer.from(raw, 'base64');

  if (key.length !== KEY_BYTES) {
    throw new Error(
      `WHATSAPP_TOKEN_KEY debe ser de ${KEY_BYTES} bytes (recibidos ${key.length}). ` +
      'Genera una con: openssl rand -base64 32',
    );
  }
  return key;
}

/** Cifra el token en claro. Devuelve el valor listo para access_token_cipher. */
export function encryptToken(plain: string): string {
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

/**
 * Descifra lo guardado en access_token_cipher.
 * Lanza si el valor fue alterado o si la clave no es la que lo cifró — que es
 * justo lo que se quiere: mejor fallar el envío que hablarle a Meta con un
 * token corrupto.
 */
export function decryptToken(stored: string): string {
  const parts = stored.split('.');
  if (parts.length !== 3) {
    throw new Error('access_token_cipher con formato inválido (se esperaba iv.tag.ciphertext).');
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

/** ¿Está el cifrado configurado? Para que la UI avise antes de intentar conectar. */
export function isTokenKeyConfigured(): boolean {
  try {
    masterKey();
    return true;
  } catch {
    return false;
  }
}
