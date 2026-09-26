/* ============================================================
   FOTOS DEL RESTAURANTE → /img/<ancho>/<ruta-en-el-bucket>
   ------------------------------------------------------------
   Las fotos (platillos, logos, fondos, recompensas) viven en el bucket
   `restaurant-assets` de Supabase. Antes se servían con el optimizador
   de Next (`/_next/image?url=…&w=…`) y eso las hacía lentas por tres
   motivos, medidos en producción el 2026-09-25:

   · Cloudflare NO las guardaba (`cf-cache-status: DYNAMIC`): una URL sin
     extensión de imagen no es "estática" para él. Cada foto viajaba
     hasta Render en Oregón — ~250 ms aun cuando el servidor ya la tenía
     lista, y 0,3–1,3 s la primera vez (hay que reducirla con sharp en
     una CPU pequeña, y en ráfaga se hacen cola).
   · El disco de Render se vacía en cada despliegue, así que tras cada
     publicación TODAS las fotos de TODOS los restaurantes volvían a ser
     "primera vez" para el siguiente cliente.
   · El navegador solo podía guardarlas 4 h (`max-age=14400`).

   Ahora la foto se pide a una ruta propia que TERMINA en la extensión de
   la imagen (`/img/640/<id>/products/1788547833372.webp`). Cloudflare
   guarda ese tipo de ruta por defecto y la sirve desde su nodo más
   cercano (Guatemala/Miami) aunque Render se reinicie o se despliegue.
   Como cada subida lleva un nombre único (marca de tiempo), una URL
   nunca cambia de contenido: se guarda un año, `immutable`.

   Este módulo es isomorfo (servidor y navegador): decide QUÉ fuentes
   pasan por /img y qué anchos existen. La ruta vive en
   app/img/[w]/[...path]/route.ts y el componente en
   components/asset-image.tsx.
   ============================================================ */

/** Anchos de pantalla completa (srcset con `sizes`). Sin 2048/3840: las
    fotos se suben a 1600 px como máximo (compressImage), así que esos
    anchos solo producían más variantes de la misma imagen. */
export const IMG_DEVICE_SIZES = [640, 750, 828, 1080, 1200, 1920];
/** Anchos de piezas pequeñas (miniaturas, logos, tarjetas a media fila). */
export const IMG_IMAGE_SIZES = [32, 48, 64, 96, 128, 256, 384];
/** Únicos anchos que acepta /img — cualquier otro da 404, para que nadie
    pueda llenar la caché pidiendo w=1, w=2, w=3… */
export const IMG_WIDTHS: readonly number[] = [...IMG_IMAGE_SIZES, ...IMG_DEVICE_SIZES];

/** `sizes` de la foto de una tarjeta de la carta (2 columnas en el teléfono).
    La ficha del platillo lo repite para su capa de fondo: mismo `sizes` →
    mismo archivo elegido → sale de la caché del navegador al instante. */
export const PRODUCT_ART_SIZES = '(max-width: 440px) 50vw, 220px';
/** Tarjeta destacada: ocupa la fila entera. Con el `sizes` de media fila
    se pedía la mitad de píxeles de los que pinta y salía blanda. */
export const FEATURED_ART_SIZES = '(max-width: 640px) 100vw, 560px';

const BUCKET_PATH = '/storage/v1/object/public/restaurant-assets/';
/** Un segmento de ruta del bucket: `<uuid>`, `products`, `1788547833372.webp`. */
export const IMG_SEGMENT = /^[A-Za-z0-9_-][A-Za-z0-9._-]*$/;
/** Formatos que sharp reduce bien. GIF (animación) y SVG (vector) se sirven
    tal cual: reducirlos los rompería. En minúsculas a propósito: el proxy
    (matcher de proxy.ts) solo deja pasar sin tocar las rutas que acaban
    así, y una `.JPG` caería en él. */
const IMG_EXT = /\.(webp|png|jpe?g)$/;

let supabaseBase: string | null | undefined;
function bucketPrefix(): string | null {
  if (supabaseBase === undefined) {
    const raw = process.env.NEXT_PUBLIC_SUPABASE_URL;
    supabaseBase = raw ? raw.replace(/\/+$/, '') + BUCKET_PATH : null;
  }
  return supabaseBase;
}

/**
 * Ruta del objeto dentro del bucket si `src` es una foto NUESTRA que /img
 * sabe servir; null en cualquier otro caso (foto de Google, data:, blob:,
 * GIF, SVG, otro proyecto…), y entonces se usa la URL tal cual.
 */
export function assetPath(src: string | null | undefined): string | null {
  if (!src) return null;
  const prefix = bucketPrefix();
  if (!prefix || !src.startsWith(prefix)) return null;
  const path = src.slice(prefix.length).split(/[?#]/)[0];
  if (!IMG_EXT.test(path)) return null;
  const parts = path.split('/');
  if (parts.length < 2 || parts.length > 6 || !parts.every((s) => IMG_SEGMENT.test(s))) return null;
  return path;
}

/** El ancho permitido más cercano por arriba (o el mayor, si se pasa). */
export function nearestWidth(width: number): number {
  for (const w of [...IMG_WIDTHS].sort((a, b) => a - b)) if (w >= width) return w;
  return Math.max(...IMG_WIDTHS);
}

/**
 * URL para pintar `src` a `width` px. Para fondos CSS, marcas de agua y
 * `<img>` sueltos; en `<Image>` se usa el componente AssetImage.
 */
export function assetSrc(src: string, width: number): string;
export function assetSrc(src: string | null | undefined, width: number): string | null;
export function assetSrc(src: string | null | undefined, width: number): string | null {
  if (!src) return null;
  const path = assetPath(src);
  return path ? `/img/${nearestWidth(width)}/${path}` : src;
}

/** Cargador para next/image. Solo se usa con fuentes que assetPath() acepta. */
export function assetLoader({ src, width }: { src: string; width: number; quality?: number }): string {
  return assetSrc(src, width);
}

/**
 * Pide de antemano las variantes que el menú y el panel van a necesitar de
 * una foto recién subida, para que el PRIMER cliente no espere a que el
 * servidor la reduzca. Las peticiones pasan por Cloudflare desde el propio
 * aparato del dueño, que está en el mismo país que sus clientes: la foto
 * queda guardada en el nodo que les toca. Solo en el navegador; si falla
 * no pasa nada (se generará en la primera visita, como antes).
 */
export function warmAsset(src: string, widths: number[] = [96, 384, 640, 1080]): void {
  if (typeof window === 'undefined' || !assetPath(src)) return;
  for (const w of widths) {
    try {
      void fetch(assetSrc(src, w), { priority: 'low' } as RequestInit).catch(() => {});
    } catch {
      /* navegador sin fetch con prioridad → nada */
    }
  }
}
