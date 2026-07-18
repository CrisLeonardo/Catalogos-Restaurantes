// Hash del PIN de operador (staff_pins). Mismo algoritmo/parámetros que el
// hub local (agente-impresion/src/staff-pin-cache.ts) debe replicar para
// poder validar el PIN sin conexión — ver PLAN_LOGIN_STAFF_PIN.md.
import crypto from 'node:crypto';

export const PIN_LENGTH = 4;
export const PIN_LOCK_AFTER_ATTEMPTS = 5;
export const PIN_LOCK_MS = 5 * 60_000;

const SCRYPT_KEYLEN = 64;

export function isValidPin(pin: string): boolean {
  return new RegExp(`^\\d{${PIN_LENGTH}}$`).test(pin);
}

export function newPinSalt(): string {
  return crypto.randomBytes(16).toString('hex');
}

export function hashPin(pin: string, salt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(pin, salt, SCRYPT_KEYLEN, (err, derivedKey) => {
      if (err) reject(err); else resolve(derivedKey.toString('hex'));
    });
  });
}

export async function verifyPin(pin: string, salt: string, expectedHash: string): Promise<boolean> {
  const candidate = await hashPin(pin, salt);
  const a = Buffer.from(candidate, 'hex');
  const b = Buffer.from(expectedHash, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
