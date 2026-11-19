import { ImageResponse } from 'next/og';
import { getRestaurantBySlugCached } from '@/lib/db/restaurants';
import { buildThemeVars } from '@/lib/theme/resolve';

/**
 * IMAGEN DE VISTA PREVIA DE LA CARTA (auditoría «La carta que vende», CV-04)
 * ------------------------------------------------------------
 * Un enlace a la carta compartido en WhatsApp o Facebook salía como texto
 * pelado cuando el restaurante no tenía logo: la metadata solo ponía el logo
 * como `og:image`. Esta ruta dibuja una tarjeta de 1200 × 630 con el nombre,
 * la frase del restaurante y su paleta, para que todo enlace tenga cara.
 *
 * Sin fotos de platillos a propósito: next/og de este proyecto no decodifica
 * WebP (ver api/icon/[slug]) y las fotos lo son. El plato estrella en la
 * tarjeta queda para el enlace por platillo (CV-30).
 *
 * GET /api/og/[slug]
 */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
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
  const frase = data.restaurant.tagline ?? '';
  const largo = nombre.length;
  const tamNombre = largo > 28 ? 64 : largo > 18 ? 80 : 104;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
          justifyContent: 'space-between', padding: '72px 80px',
          background: fondo, color: tinta,
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
    ),
    {
      width: 1200,
      height: 630,
      headers: { 'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400' },
    },
  );
}
