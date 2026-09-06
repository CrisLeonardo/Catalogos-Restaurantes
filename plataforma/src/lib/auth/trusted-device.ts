import 'server-only';

import { cookies } from 'next/headers';
import { createServiceClient } from '@/lib/supabase/service';
import { decidePinAccess, isValidDeviceId, type PinAccess } from '@/lib/auth/pin-policy';

export type { PinAccess };

/* ============================================================
   DISPOSITIVOS DE CONFIANZA DEL LOCAL (migración 112)
   ------------------------------------------------------------
   El PIN es la credencial correcta DENTRO del local y una mala
   credencial en internet abierto. Esto es lo que distingue una
   cosa de la otra: la lista de aparatos que el restaurante
   reconoce como suyos.

   El id del aparato viaja en una cookie (DEVICE_COOKIE) que
   espeja el localStorage de lib/device-id.ts. Va en cookie —y no
   solo como parámetro del cliente— para que la página de login
   pueda decidir EN EL SERVIDOR, antes de pintar nada, si este
   aparato abre directo en la grilla de PIN o no. Sin eso, la
   pantalla parpadearía entre los dos estados en cada visita.

   HASTA DÓNDE LLEGA ESTA PROTECCIÓN (honestamente):
   el id es un UUID aleatorio que el propio navegador guarda, así
   que un atacante que ya CONOZCA el id de un aparato autorizado
   podría copiarlo. Lo que no puede es adivinarlo: son 128 bits al
   azar que nunca se muestran en público (solo en la lista de
   aparatos del dueño). Es el mismo grado de protección que el
   "código de dispositivo" de un TPV de caja — sube muchísimo el
   listón, no es una atestación de hardware. Por eso el PIN
   conserva TODAS sus defensas de antes (bloqueo por intentos y
   límites por IP y por persona): esto se suma, no las sustituye.
   ============================================================ */

/** Espejo en cookie del id de lib/device-id.ts (localStorage). */
export const DEVICE_COOKIE = 'leogin_device';

/** Id de este aparato según su cookie, o null si no la trae / es basura. */
export async function readDeviceId(): Promise<string | null> {
  const raw = (await cookies()).get(DEVICE_COOKIE)?.value?.trim();
  return raw && isValidDeviceId(raw) ? raw : null;
}

/**
 * Qué puede hacer ESTE aparato con el PIN de ESTE restaurante.
 *
 * Único punto donde se decide, para que la página de login, la grilla de
 * nombres y la verificación del PIN no puedan desincronizarse (que es como
 * nacen los agujeros: la pantalla se esconde pero la acción sigue abierta).
 */
export async function getPinAccess(restaurantId: string): Promise<PinAccess> {
  const db = createServiceClient();

  const { data: rest } = await db
    .from('restaurants')
    .select('pin_requires_trusted_device')
    .eq('id', restaurantId)
    .maybeSingle();

  // Sin restaurante legible no se afirma que el candado esté puesto: el PIN
  // conserva sus otras defensas y el dueño no se queda fuera por un fallo de
  // lectura. (La columna no existe hasta aplicar la migración 112: hasta
  // entonces esto vale `false` y todo se comporta como siempre.)
  const requiresTrusted = rest?.pin_requires_trusted_device === true;

  const deviceId = await readDeviceId();
  const trusted = deviceId ? await isDeviceTrusted(restaurantId, deviceId) : false;

  return decidePinAccess({ requiresTrusted, trusted });
}

/**
 * ¿A qué restaurante pertenece ESTE aparato, sin saber de antemano cuál es?
 *
 * Para qué sirve: `/admin/login` en seco (dominio raíz, sin slug en la ruta
 * ni en el host) es exactamente lo que queda tras cerrar sesión desde un
 * favorito/ícono que apunta ahí, o tras semanas sin abrir el panel — no hay
 * ninguna URL con el restaurante puesto de la que partir. `restaurant_devices`
 * ya es justo esa lista (se llena sola al primer PIN correcto, ver
 * `rememberDevice`) y no depende de ninguna sesión ni cookie de actividad:
 * sigue ahí aunque pasen días o semanas, que es lo que hace falta para que el
 * mostrador siga reconociendo su propio aparato.
 *
 * Si el mismo aparato quedó registrado en más de un restaurante (un tablet de
 * pruebas, por ejemplo) se toma el que se usó más recientemente — el error
 * prudente cuando hay que elegir uno solo.
 */
export async function restaurantIdForDevice(deviceId: string): Promise<string | null> {
  if (!isValidDeviceId(deviceId)) return null;
  try {
    const db = createServiceClient();
    const { data } = await db
      .from('restaurant_devices')
      .select('restaurant_id')
      .eq('device_id', deviceId)
      .order('last_seen_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    return (data?.restaurant_id as string | null) ?? null;
  } catch {
    return null; // migración sin aplicar, o tabla caída: sin pista, login genérico
  }
}

/** ¿Está este aparato en la lista del restaurante? */
export async function isDeviceTrusted(restaurantId: string, deviceId: string): Promise<boolean> {
  if (!isValidDeviceId(deviceId)) return false;
  const db = createServiceClient();
  const { data } = await db
    .from('restaurant_devices')
    .select('device_id')
    .eq('restaurant_id', restaurantId)
    .eq('device_id', deviceId)
    .maybeSingle();
  return !!data;
}

/**
 * Registra (o refresca) este aparato como del local.
 *
 * `addedBy` null = se registró solo tras un PIN correcto (confianza al primer
 * uso); con id de perfil = lo autorizó alguien desde el panel.
 *
 * Fire-and-forget como la bitácora: que no se pueda anotar el aparato nunca
 * puede impedir que alguien entre a trabajar.
 */
export async function rememberDevice(input: {
  restaurantId: string;
  deviceId: string;
  label?: string | null;
  addedBy?: string | null;
}): Promise<void> {
  if (!isValidDeviceId(input.deviceId)) return;
  try {
    const db = createServiceClient();
    const now = new Date().toISOString();

    // Un aparato ya conocido solo refresca su última visita: no se le pisa la
    // etiqueta que el dueño le puso a mano ni se le cambia quién lo autorizó.
    const { data: existing } = await db
      .from('restaurant_devices')
      .select('device_id')
      .eq('restaurant_id', input.restaurantId)
      .eq('device_id', input.deviceId)
      .maybeSingle();

    if (existing) {
      await db
        .from('restaurant_devices')
        .update({ last_seen_at: now, ...(input.label ? { label: input.label } : {}) })
        .eq('restaurant_id', input.restaurantId)
        .eq('device_id', input.deviceId);
      return;
    }

    await db.from('restaurant_devices').insert({
      restaurant_id: input.restaurantId,
      device_id: input.deviceId,
      label: input.label?.slice(0, 60) || null,
      added_by: input.addedBy ?? null,
      created_at: now,
      last_seen_at: now,
    });
  } catch {
    // Sin la migración 112 aplicada, o con la tabla caída: no se anota nada y
    // el login sigue su curso.
  }
}

export type TrustedDevice = {
  device_id: string;
  label: string | null;
  created_at: string;
  last_seen_at: string;
  /** Se dio de alta solo al entrar con PIN (no lo autorizó nadie a mano). */
  auto: boolean;
};

/** Aparatos del restaurante, el más reciente primero. */
export async function listTrustedDevices(restaurantId: string): Promise<TrustedDevice[]> {
  try {
    const db = createServiceClient();
    const { data } = await db
      .from('restaurant_devices')
      .select('device_id, label, created_at, last_seen_at, added_by')
      .eq('restaurant_id', restaurantId)
      .order('last_seen_at', { ascending: false })
      .limit(50);

    return (data ?? []).map((d) => ({
      device_id: d.device_id as string,
      label: (d.label as string | null) ?? null,
      created_at: d.created_at as string,
      last_seen_at: d.last_seen_at as string,
      auto: d.added_by == null,
    }));
  } catch {
    return []; // migración sin aplicar → la tarjeta se muestra vacía
  }
}
