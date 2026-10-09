/* ============================================================
   ERRORES A SENTRY — la parte pura (sin red, sin entorno)
   ------------------------------------------------------------
   PLAN_ACCESO_Y_MONITOREO_2026-10-08, MON-01. Se habla con Sentry por su
   API HTTP de «envelopes» en vez de instalar @sentry/nextjs: así no se suma
   ni un byte al JS del navegador (el menú del comensal se abre en celulares
   de gama baja) ni una dependencia que envejezca con cada versión de Next.

   Lo que NUNCA sale de aquí: cookies, cabeceras, cuerpo de la petición ni
   la ruta real. Se manda la ruta PLANTILLA (`/pedido/[token]`, no el token)
   porque varias rutas llevan en la dirección algo que da acceso.
   ============================================================ */

export type Dsn = { endpoint: string; publicKey: string; dsn: string };

/** `https://<clave>@<host>/<proyecto>` → a dónde mandar y con qué clave. */
export function parseDsn(dsn: string | undefined | null): Dsn | null {
  if (!dsn) return null;
  try {
    const u = new URL(dsn.trim());
    const proyecto = u.pathname.replace(/^\/+|\/+$/g, '');
    if (!u.username || !proyecto || !/^\d+$/.test(proyecto.split('/').pop() ?? '')) return null;
    const prefijo = proyecto.includes('/') ? `/${proyecto.slice(0, proyecto.lastIndexOf('/'))}` : '';
    const id = proyecto.split('/').pop();
    return {
      endpoint: `${u.protocol}//${u.host}${prefijo}/api/${id}/envelope/`,
      publicKey: decodeURIComponent(u.username),
      dsn: dsn.trim(),
    };
  } catch {
    return null;
  }
}

export type Frame = { filename: string; function: string; lineno?: number; colno?: number; in_app: boolean };

/** Las líneas `at fn (archivo:l:c)` de un stack de V8, en el orden que pide
    Sentry (la llamada más reciente AL FINAL). */
export function framesDelStack(stack: string | undefined): Frame[] {
  if (!stack) return [];
  const frames: Frame[] = [];
  for (const linea of stack.split('\n').slice(1, 40)) {
    const m = linea.trim().match(/^at (?:(.+?) \()?(.+?):(\d+):(\d+)\)?$/);
    if (!m) continue;
    const filename = m[2];
    frames.push({
      function: m[1] ?? '?',
      filename,
      lineno: Number(m[3]),
      colno: Number(m[4]),
      in_app: !filename.includes('node_modules') && !filename.startsWith('node:'),
    });
  }
  return frames.reverse();
}

export type DatosError = {
  tipo: string;
  mensaje: string;
  stack?: string;
  /** Dónde: 'render' | 'route' | 'action' | 'proxy' | 'navegador'. */
  origen: string;
  /** Ruta PLANTILLA, nunca la real. */
  ruta?: string;
  metodo?: string;
  digest?: string;
  entorno?: string;
  version?: string;
};

/** Un id de evento de Sentry: 32 caracteres hex. */
export function idDeEvento(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** El cuerpo del envelope: tres líneas de JSON. */
export function armarEnvelope(dsn: Dsn, datos: DatosError, ahora = new Date(), eventId = idDeEvento()): string {
  const frames = framesDelStack(datos.stack);
  const evento = {
    event_id: eventId,
    timestamp: ahora.getTime() / 1000,
    platform: datos.origen === 'navegador' ? 'javascript' : 'node',
    level: 'error',
    logger: 'leogin',
    environment: datos.entorno ?? 'production',
    ...(datos.version ? { release: datos.version } : {}),
    transaction: datos.ruta,
    tags: {
      origen: datos.origen,
      ...(datos.ruta ? { ruta: datos.ruta } : {}),
      ...(datos.digest ? { digest: datos.digest } : {}),
    },
    ...(datos.metodo ? { request: { method: datos.metodo, url: datos.ruta } } : {}),
    exception: {
      values: [{
        type: datos.tipo || 'Error',
        value: datos.mensaje.slice(0, 2000),
        ...(frames.length ? { stacktrace: { frames } } : {}),
      }],
    },
  };
  return [
    JSON.stringify({ event_id: eventId, sent_at: ahora.toISOString(), dsn: dsn.dsn }),
    JSON.stringify({ type: 'event' }),
    JSON.stringify(evento),
  ].join('\n');
}

/** Ruta real → sin consulta. Para los errores del navegador, que no traen
    la plantilla: se cortan además los segmentos largos (tokens, uuids). */
export function rutaSegura(ruta: string | undefined | null): string | undefined {
  if (!ruta) return undefined;
  const sinConsulta = ruta.split(/[?#]/)[0];
  return sinConsulta
    .split('/')
    .map((seg) => (seg.length >= 16 || /^[0-9a-f-]{8,}$/i.test(seg) ? ':id' : seg))
    .join('/')
    .slice(0, 200);
}
