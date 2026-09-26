import sharp from 'sharp';
import { IMG_SEGMENT, IMG_WIDTHS } from '@/lib/asset-image';

/* ============================================================
   GET /img/<ancho>/<ruta-en-el-bucket>
   ------------------------------------------------------------
   Reduce una foto del bucket `restaurant-assets` al ancho pedido y la
   devuelve en WebP con caché de un año. Por qué existe en vez del
   optimizador de Next: ver lib/asset-image.ts.

   · Sin proxy: el matcher de proxy.ts excluye las rutas que terminan
     en .webp/.png/.jpg/.jpeg, así que esto no paga el refresco de sesión
     de Supabase ni reescrituras de subdominio. Es a propósito.
   · Sin SSRF: solo se leen objetos del bucket del proyecto configurado,
     con cada segmento de ruta validado; nunca una URL que mande el
     cliente.
   · Anchos cerrados (IMG_WIDTHS): un ancho que no está en la lista da
     404, para que nadie llene la caché pidiendo w=1, w=2, w=3…
   · WebP siempre, sin mirar `Accept`: lo pinta todo navegador en uso
     (Safari desde iOS 14) y así Cloudflare —que no distingue por
     `Accept` en el plan gratuito— nunca guarda un formato distinto para
     el mismo enlace.
   ============================================================ */

const ANCHOS = new Set(IMG_WIDTHS);
const MAX_ORIGINAL_BYTES = 15 * 1024 * 1024;
const UN_ANO = 'public, max-age=31536000, immutable';

/* Memoria corta dentro del proceso. Cloudflare guarda por nodo: dos
   clientes que entran por nodos distintos en el mismo minuto harían dos
   veces el mismo trabajo de sharp sin esto. Se limita por BYTES (no por
   número de fotos) porque el servidor gratuito de Render tiene 512 MB. */
const MEMORIA_MAX_BYTES = 32 * 1024 * 1024;
const memoria = new Map<string, Uint8Array>();
let memoriaBytes = 0;
/* Peticiones en curso: si llegan diez pedidos de la misma foto antes de
   que sharp termine (la ráfaga típica al abrir un menú), se hace el
   trabajo una vez y las diez esperan el mismo resultado. */
const enCurso = new Map<string, Promise<Resultado>>();

type Resultado =
  | { kind: 'ok'; body: Uint8Array }
  | { kind: 'missing' }
  | { kind: 'original'; url: string };

function recordar(key: string, body: Uint8Array) {
  if (body.byteLength > MEMORIA_MAX_BYTES / 8) return;
  const previo = memoria.get(key);
  if (previo) {
    memoriaBytes -= previo.byteLength;
    memoria.delete(key);
  }
  memoria.set(key, body);
  memoriaBytes += body.byteLength;
  // Map conserva el orden de inserción: el primero es el menos reciente.
  for (const [k, v] of memoria) {
    if (memoriaBytes <= MEMORIA_MAX_BYTES) break;
    memoria.delete(k);
    memoriaBytes -= v.byteLength;
  }
}

function leerMemoria(key: string): Uint8Array | null {
  const body = memoria.get(key);
  if (!body) return null;
  // Tocada → pasa al final (más reciente).
  memoria.delete(key);
  memoria.set(key, body);
  return body;
}

async function producir(width: number, objectPath: string): Promise<Resultado> {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, '');
  if (!base) return { kind: 'missing' };
  const url = `${base}/storage/v1/object/public/restaurant-assets/${objectPath}`;

  let res: Response;
  try {
    res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(10_000) });
  } catch {
    // Supabase no contestó: que el navegador lo intente directo.
    return { kind: 'original', url };
  }
  if (res.status === 404 || res.status === 400) return { kind: 'missing' };
  if (!res.ok) return { kind: 'original', url };

  const tipo = res.headers.get('content-type') ?? '';
  const largo = Number(res.headers.get('content-length') ?? 0);
  if (!tipo.startsWith('image/') || largo > MAX_ORIGINAL_BYTES) return { kind: 'original', url };

  const original = new Uint8Array(await res.arrayBuffer());
  if (original.byteLength > MAX_ORIGINAL_BYTES) return { kind: 'original', url };

  try {
    const img = sharp(original, { failOn: 'none', limitInputPixels: 50_000_000 });
    const meta = await img.metadata();
    /* Ya es WebP, ya cabe y no hay que girarla: se sirve tal cual. Volver
       a comprimir un WebP solo pierde calidad y gasta CPU (es el caso de
       casi todas las fotos: compressImage las sube en WebP a ≤1600 px). */
    if (meta.format === 'webp' && (meta.width ?? Infinity) <= width && (meta.orientation ?? 1) === 1) {
      return { kind: 'ok', body: original };
    }
    const out = await img
      .rotate() // respeta la orientación EXIF de las fotos de celular
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: 75 })
      .toBuffer();
    return { kind: 'ok', body: new Uint8Array(out) };
  } catch {
    // Imagen que sharp no entiende: la del bucket, sin tocar.
    return { kind: 'original', url };
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ w: string; path: string[] }> },
) {
  const { w, path } = await params;
  const width = Number(w);
  const valido =
    ANCHOS.has(width) &&
    Array.isArray(path) &&
    path.length >= 2 &&
    path.length <= 6 &&
    path.every((s) => IMG_SEGMENT.test(s)) &&
    /\.(webp|png|jpe?g)$/.test(path[path.length - 1]);
  if (!valido) {
    return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'public, max-age=300' } });
  }

  const objectPath = path.join('/');
  const key = `${width}/${objectPath}`;

  let body = leerMemoria(key);
  if (!body) {
    let trabajo = enCurso.get(key);
    if (!trabajo) {
      trabajo = producir(width, objectPath).finally(() => enCurso.delete(key));
      enCurso.set(key, trabajo);
    }
    const r = await trabajo;
    if (r.kind === 'missing') {
      return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'public, max-age=300' } });
    }
    if (r.kind === 'original') {
      // Caché corta: que un fallo pasajero no quede grabado un año.
      return new Response(null, {
        status: 302,
        headers: { Location: r.url, 'Cache-Control': 'public, max-age=300' },
      });
    }
    body = r.body;
    recordar(key, body);
  }

  return new Response(body as BodyInit, {
    headers: {
      'Content-Type': 'image/webp',
      'Content-Length': String(body.byteLength),
      'Cache-Control': UN_ANO,
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
