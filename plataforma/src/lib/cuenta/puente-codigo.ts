import { createHash, randomBytes } from 'node:crypto';

/* El código del puente de sesión (ver lib/cuenta/puente.ts). Solo servidor. */

/** Un código nuevo: 32 bytes al azar, en base64url (43 caracteres). */
export function nuevoCodigo(): string {
  return randomBytes(32).toString('base64url');
}

/** Lo único que se guarda en la base: el SHA-256 del código, en hex. */
export function hashCodigo(codigo: string): string {
  return createHash('sha256').update(codigo, 'utf8').digest('hex');
}
