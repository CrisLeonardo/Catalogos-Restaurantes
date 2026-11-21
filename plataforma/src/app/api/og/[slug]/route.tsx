import { ImageResponse } from 'next/og';
import sharp from 'sharp';
import { getRestaurantBySlugCached } from '@/lib/db/restaurants';
import { getMenuDataCached } from '@/lib/db/menu';
import { isAllowedAssetUrl } from '@/lib/asset-url';
import { buildThemeVars, formatPriceCarta } from '@/lib/theme/resolve';
import { resolverPlatillo, valorPlatillo } from '@/lib/menu/enlace-platillo';
import { platilloEstrella } from '@/lib/menu/estrella';

/**
 * IMAGEN DE VISTA PREVIA DE LA CARTA (auditoría «La carta que vende»)
 * ------------------------------------------------------------
 * CV-04: un enlace a la carta compartido en WhatsApp o Facebook salía como
 * texto pelado cuando el restaurante no tenía logo. Esta ruta dibuja una
 * tarjeta de 1200 × 630 con el nombre, la frase y la paleta.
 *
 * CV-30: con `?platillo=<id>` dibuja ESE platillo —su foto, nombre y precio—
 * para que cada estado o publicación sea un anuncio que lleva a «Agregar».
 * next/og no decodifica WebP (las fotos lo son), así que la foto se pasa
 * antes por sharp a JPEG.
 *
 * GET /api/og/[slug][?platillo=<id>]
 */

/** La foto como data URL JPEG, o null si no se pudo leer. */
async function fotoJpeg(src: string, origen: string): Promise<string | null> {
  try {
    let url: string;
    if (/^\/(demo|muestra)\/[\w./-]+\.(webp|png|jpe?g)$/.test(src) && !src.includes('..')) {
      // Fotos de la demo y de muestra: archivos estáticos de este mismo servidor.
      url = new URL(src, origen).toString();
    } else {
      if (!isAllowedAssetUrl(src)) return null;
      url = src;
    }
    const res = await fetch(url, { signal: AbortSignal.timeout(6000), next: { revalidate: 3600 } });
    if (!res.ok) return null;
    const bytes = Buffer.from(await res.arrayBuffer());
    const jpg = await sharp(bytes).rotate().resize(630, 630, { fit: 'cover' }).jpeg({ quality: 82 }).toBuffer();
    return `data:image/jpeg;base64,${jpg.toString('base64')}`;
  } catch {
    return null;
  }
}

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await getRestaurantBySlugCached(slug).catch(() => null);
  if (!data) return new Response('No encontrado', { status: 404 });

  const cfg = data.resolved.config;
  const vars = buildThemeVars(cfg);
  const fondo = cfg.colorBg;
  const tinta = vars['--brand-text'] ?? '#ffffff';
  const acento = cfg.colorAccent;
  const sobreAcento = cfg.onAccent;
  const nombre = data.restaurant.name;
  const headers = { 'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400' };

  /* ── Un platillo ── */
  const platoId = valorPlatillo(new URL(req.url).searchParams.get('platillo'));
  if (platoId) {
    const menu = await getMenuDataCached(data.restaurant.id).catch(() => null);
    const plato = resolverPlatillo(platoId, menu?.products ?? []);
    if (plato) {
      const foto = plato.image_url ? await fotoJpeg(plato.image_url, req.url) : null;
      const precio = formatPriceCarta(Number(plato.price), cfg);
      const tam = plato.name.length > 30 ? 56 : plato.name.length > 18 ? 68 : 84;
      return new ImageResponse(
        (
          <div style={{ width: '100%', height: '100%', display: 'flex', background: fondo, color: tinta }}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '64px 56px 64px 72px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 28, opacity: 0.72 }}>
                <div style={{ width: 14, height: 14, borderRadius: 999, background: acento }} />
                {nombre}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                <div style={{ fontSize: tam, fontWeight: 700, lineHeight: 1.04, letterSpacing: -1.5 }}>{plato.name}</div>
                <div style={{ fontSize: 44, fontWeight: 700 }}>{precio}</div>
              </div>
              <div style={{ display: 'flex' }}>
                <div style={{ display: 'flex', alignItems: 'center', padding: '16px 30px', borderRadius: 999, background: acento, color: sobreAcento, fontSize: 30, fontWeight: 700 }}>
                  Pídelo aquí →
                </div>
              </div>
            </div>
            {foto && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={foto} width={630} height={630} alt="" style={{ width: 530, height: 630, objectFit: 'cover' }} />
            )}
          </div>
        ),
        { width: 1200, height: 630, headers },
      );
    }
  }

  /* ── La carta en general ── */
  const frase = data.restaurant.tagline ?? '';
  const largo = nombre.length;
  // Con foto del platillo estrella (F4-9) el texto ocupa la mitad izquierda.
  const estrella = await platilloEstrella(data.restaurant.id).catch(() => null);
  const fotoEstrella = estrella ? await fotoJpeg(estrella.image_url, req.url) : null;
  const tamNombre = fotoEstrella
    ? (largo > 22 ? 56 : largo > 14 ? 68 : 84)
    : (largo > 28 ? 64 : largo > 18 ? 80 : 104);

  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', background: fondo, color: tinta }}>
      <div
        style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          justifyContent: 'space-between', padding: fotoEstrella ? '64px 56px 64px 72px' : '72px 80px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 28, opacity: 0.72 }}>
          <div style={{ width: 14, height: 14, borderRadius: 999, background: acento }} />
          Menú en línea
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ fontSize: tamNombre, fontWeight: 700, lineHeight: 1.02, letterSpacing: -2 }}>{nombre}</div>
          {frase && <div style={{ fontSize: 36, lineHeight: 1.3, opacity: 0.78, maxWidth: 960 }}>{frase}</div>}
        </div>
        <div style={{ display: 'flex' }}>
          <div
            style={{
              display: 'flex', alignItems: 'center', padding: '18px 34px', borderRadius: 999,
              background: acento, color: sobreAcento, fontSize: 32, fontWeight: 700,
            }}
          >
            Ver el menú →
          </div>
        </div>
      </div>
      {fotoEstrella && estrella && (
        <div style={{ width: 520, height: 630, display: 'flex', position: 'relative' }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- next/og dibuja <img>, no next/image */}
          <img src={fotoEstrella} alt="" width={520} height={630} style={{ width: 520, height: 630, objectFit: 'cover' }} />
          <div style={{
            position: 'absolute', left: 24, bottom: 24, display: 'flex', padding: '10px 18px', borderRadius: 999,
            background: fondo, color: tinta, fontSize: 24, fontWeight: 700, maxWidth: 472,
          }}>
            {estrella.name}
          </div>
        </div>
      )}
      </div>
    ),
    { width: 1200, height: 630, headers },
  );
}
