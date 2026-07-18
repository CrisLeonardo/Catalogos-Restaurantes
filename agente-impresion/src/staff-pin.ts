// Verificación LOCAL de PIN de operador — login sin conexión
// (PLAN_LOGIN_STAFF_PIN.md). Mismo algoritmo (crypto.scrypt) que el lado
// nube (plataforma/src/lib/staff-pin-crypto.ts) para poder comparar contra
// el mismo hash cacheado. El bloqueo por intentos fallidos es en memoria
// (se reinicia si el agente reinicia) — el PIN offline nunca es la única
// barrera: la PC ya está vinculada a este restaurante (ver plan, §6).

import crypto from 'node:crypto';
import { getStaffPins, type CachedStaffPin } from './store.ts';

const SCRYPT_KEYLEN = 64;
const LOCK_AFTER_ATTEMPTS = 5;
const LOCK_MS = 5 * 60_000;

const failedAttempts = new Map<string, { count: number; lockedUntil: number }>();

function hashPin(pin: string, salt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(pin, salt, SCRYPT_KEYLEN, (err, key) => {
      if (err) reject(err); else resolve(key.toString('hex'));
    });
  });
}

export interface PinVerifyResult {
  ok: boolean;
  error?: string;
  profileId?: string;
  fullName?: string | null;
  permissions?: string[] | null;
}

export function listCachedStaff(): { profileId: string; fullName: string | null }[] {
  return getStaffPins().map((p: CachedStaffPin) => ({ profileId: p.profileId, fullName: p.fullName }));
}

export async function verifyPinOffline(profileId: string, pin: string): Promise<PinVerifyResult> {
  const entry = getStaffPins().find((p) => p.profileId === profileId);
  if (!entry) return { ok: false, error: 'PIN incorrecto.' };

  const lock = failedAttempts.get(profileId);
  if (lock && lock.lockedUntil > Date.now()) {
    return { ok: false, error: 'Demasiados intentos fallidos. Espera unos minutos.' };
  }

  const candidate = await hashPin(pin, entry.pinSalt);
  const a = Buffer.from(candidate, 'hex');
  const b = Buffer.from(entry.pinHash, 'hex');
  const match = a.length === b.length && crypto.timingSafeEqual(a, b);

  if (!match) {
    const attempts = (lock?.count ?? 0) + 1;
    if (attempts >= LOCK_AFTER_ATTEMPTS) {
      failedAttempts.set(profileId, { count: 0, lockedUntil: Date.now() + LOCK_MS });
      return { ok: false, error: 'Demasiados intentos fallidos. Espera unos minutos.' };
    }
    failedAttempts.set(profileId, { count: attempts, lockedUntil: 0 });
    return { ok: false, error: 'PIN incorrecto.' };
  }

  failedAttempts.delete(profileId);
  return { ok: true, profileId: entry.profileId, fullName: entry.fullName, permissions: entry.permissions };
}
