import 'server-only';

import { cookies } from 'next/headers';
import { createServiceClient } from '@/lib/supabase/service';
import { hashPin, verifyPin, newPinSalt, isValidPin } from '@/lib/staff-pin-crypto';

/* ============================================================
   PIN DE ENTRADA AL RESTAURANTE (migración 112)
   ------------------------------------------------------------
   El candado que se pide al abrir un restaurante desde Mi cuenta.

   NO es la credencial principal: para llegar aquí ya iniciaste sesión con tu
   correo o con Google. Es el segundo paso que evita que una sesión abierta y
   desatendida —el celular sobre la barra, la laptop de la oficina— se pasee
   por todas las sucursales. Es lo mismo que hace un TPV de caja al pedir un
   código para entrar a la administración aunque el equipo ya esté encendido.

   TRES DECISIONES QUE LO HACEN USABLE:

   1) Es OPCIONAL por restaurante. Sin PIN puesto se entra directo, que es lo
      que le conviene a quien tiene un solo local: la seguridad del que tiene
      tres no puede cobrársele a él.

   2) Se recuerda por navegador durante ENTRY_PIN_TTL_MS. Pedirlo en cada
      navegación lo convertiría en un peaje, y un peaje se contesta poniendo
      1234 — se pide al entrar, no todo el día.

   3) La marca de "ya desbloqueado" es una cookie FIRMADA por el servidor.
      Sin firma, cualquiera podría escribir a mano la lista de restaurantes
      que tiene desbloqueados, que es exactamente lo que este candado impide.
   ============================================================ */

const ENTRY_COOKIE = 'leogin_entry';
/** 12 horas: cubre un turno entero sin volver a preguntar, y no más. */
export const ENTRY_PIN_TTL_MS = 12 * 60 * 60_000;

const rootDomainRaw = process.env.NEXT_PUBLIC_ROOT_DOMAIN?.split(',')[0].trim() ?? '';
const isLocalEnv = !rootDomainRaw || rootDomainRaw.includes('localhost');
/** Mismo alcance que la sesión del personal: vale en todos los subdominios. */
const COOKIE_DOMAIN = isLocalEnv ? undefined : `.${rootDomainRaw.split(':')[0]}`;

/**
 * Secreto de firma. Se reusa la service role key —que ya es el secreto más
 * fuerte del servidor y nunca sale de él— para no añadir una variable de
 * entorno más que alguien tenga que acordarse de poner en Render.
 */
function signingSecret(): string {
  return process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
}

async function sign(payload: string): Promise<string> {
  const { createHmac } = await import('node:crypto');
  return createHmac('sha256', signingSecret()).update(payload).digest('base64url');
}

/** Restaurantes desbloqueados en este navegador, ya verificada la firma. */
async function readUnlocked(): Promise<Set<string>> {
  const raw = (await cookies()).get(ENTRY_COOKIE)?.value;
  if (!raw) return new Set();

  const sep = raw.lastIndexOf('.');
  if (sep < 0) return new Set();

  const payload = raw.slice(0, sep);
  const signature = raw.slice(sep + 1);
  if ((await sign(payload)) !== signature) return new Set(); // manipulada

  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      ids?: string[];
      exp?: number;
    };
    if (!parsed.exp || parsed.exp < Date.now()) return new Set();
    return new Set(parsed.ids ?? []);
  } catch {
    return new Set();
  }
}

/** Añade un restaurante a la lista de desbloqueados y reescribe la cookie. */
async function writeUnlocked(restaurantId: string): Promise<void> {
  const ids = await readUnlocked();
  ids.add(restaurantId);

  const payload = Buffer.from(
    JSON.stringify({ ids: [...ids], exp: Date.now() + ENTRY_PIN_TTL_MS }),
  ).toString('base64url');

  const store = await cookies();
  store.set(ENTRY_COOKIE, `${payload}.${await sign(payload)}`, {
    httpOnly: true,
    sameSite: 'lax',
    secure: !!COOKIE_DOMAIN,
    path: '/',
    maxAge: ENTRY_PIN_TTL_MS / 1000,
    ...(COOKIE_DOMAIN ? { domain: COOKIE_DOMAIN } : {}),
  });
}

export type EntryGate =
  /** Sin PIN puesto, o ya desbloqueado en este navegador: pasa. */
  | { locked: false }
  /** Hay que pedir el PIN antes de dejar entrar. */
  | { locked: true };

/**
 * ¿Hace falta pedir el PIN para abrir este restaurante?
 *
 * Lectura pura (no escribe cookies): se puede llamar desde un layout.
 */
export async function checkEntryGate(restaurantId: string): Promise<EntryGate> {
  try {
    const db = createServiceClient();
    const { data } = await db
      .from('restaurants')
      .select('entry_pin_hash')
      .eq('id', restaurantId)
      .maybeSingle();

    // Sin PIN configurado no hay nada que pedir. También es el estado de
    // TODOS los restaurantes de hoy: la migración no cambia cómo entra nadie
    // hasta que su dueño decide poner uno.
    if (!data?.entry_pin_hash) return { locked: false };

    const unlocked = await readUnlocked();
    return unlocked.has(restaurantId) ? { locked: false } : { locked: true };
  } catch {
    // Migración 112 sin aplicar → sin candado, como siempre.
    return { locked: false };
  }
}

/** Comprueba el PIN y, si es correcto, desbloquea el restaurante. */
export async function unlockWithEntryPin(restaurantId: string, pin: string): Promise<boolean> {
  if (!isValidPin(pin)) return false;

  const db = createServiceClient();
  const { data } = await db
    .from('restaurants')
    .select('entry_pin_hash, entry_pin_salt')
    .eq('id', restaurantId)
    .maybeSingle();

  const hash = data?.entry_pin_hash as string | null;
  const salt = data?.entry_pin_salt as string | null;
  if (!hash || !salt) return false;

  if (!(await verifyPin(pin, salt, hash))) return false;

  await writeUnlocked(restaurantId);
  return true;
}

/** Pone o quita el PIN de entrada. `pin` vacío o null lo quita. */
export async function setEntryPin(restaurantId: string, pin: string | null): Promise<void> {
  const db = createServiceClient();

  if (!pin) {
    await db
      .from('restaurants')
      .update({ entry_pin_hash: null, entry_pin_salt: null })
      .eq('id', restaurantId);
    return;
  }

  const salt = newPinSalt();
  await db
    .from('restaurants')
    .update({ entry_pin_hash: await hashPin(pin, salt), entry_pin_salt: salt })
    .eq('id', restaurantId);
}
