import { ImageResponse } from 'next/og';
import { getEffectivePlanPricing } from '@/lib/db/billing';
import { planPriceLabel, type PlanPricing } from '@/lib/plans';
import { esPaginaWeb, type PaginaWeb } from '@/lib/og-web';
import {
  COMANDA_NORMAL, COMANDA_VIEWBOX, NOMBRE_D, NOMBRE_VIEWBOX, NOMBRE_PROPORCION,
  LEOGIN_CORAL, LEOGIN_TINTA,
} from '@/lib/marca/trazos.mjs';

/**
 * TARJETA AL COMPARTIR LA WEB PÚBLICA (WEB-UX-11, ver lib/og-web.ts)
 * GET /api/og-web/{portada|planes|vende-en-linea|registro|descargas}
 *
 * La promesa de cada página y, donde aplica, su precio vigente (el de
 * /super/configuracion, igual que la página). Si la lectura de precios
 * falla, la tarjeta sale sin la píldora del precio en vez de inventarlo.
 */

const CREMA = '#F7F3EE';

/** Geist con el peso pedido, solo con las letras de la tarjeta (la API de
 *  Google Fonts entrega TrueType a quien no se presenta como navegador, y
 *  next/og no lee woff2). La fuente por omisión de next/og no trae negrita:
 *  el titular salía delgado. Si Google no responde, null y se usa la de
 *  siempre; la tarjeta no se cae por la letra. */
async function geist(peso: 400 | 700, texto: string): Promise<ArrayBuffer | null> {
  try {
    const css = await fetch(
      `https://fonts.googleapis.com/css2?family=Geist:wght@${peso}&text=${encodeURIComponent(texto)}`,
      { signal: AbortSignal.timeout(4000), next: { revalidate: 86400 } },
    ).then((res) => (res.ok ? res.text() : ''));
    const url = css.match(/src: url\((.+?)\) format\('(?:opentype|truetype)'\)/)?.[1];
    if (!url) return null;
    const res = await fetch(url, { signal: AbortSignal.timeout(4000), next: { revalidate: 86400 } });
    return res.ok ? await res.arrayBuffer() : null;
  } catch {
    return null;
  }
}

interface Tarjeta { etiqueta: string; titulo: string; pie: string; pildora?: string }

function tarjeta(pagina: PaginaWeb, precios: PlanPricing | null): Tarjeta {
  const enLinea = precios ? planPriceLabel(precios, 'EN_LINEA') : undefined;
  switch (pagina) {
    case 'portada':
      return { etiqueta: 'Sistema para restaurantes · Guatemala', titulo: 'Tu restaurante, bajo control.', pie: 'Carta con QR, pedidos, cocina y caja en tu celular', pildora: 'Carta con QR gratis' };
    case 'planes':
      return { etiqueta: 'Planes y precios', titulo: 'Precio fijo. Nunca un % de tus ventas.', pie: 'Cuatro planes, sin comisión por pedido', pildora: enLinea ? `Pedidos desde ${enLinea}` : undefined };
    case 'vende-en-linea':
      return { etiqueta: 'Para vender en línea', titulo: 'Tu menú en un link. Tus pedidos, en orden.', pie: 'Sin comisión por pedido', pildora: enLinea };
    case 'registro':
      return { etiqueta: 'Crea tu cuenta', titulo: 'Tu menú en línea, en vivo hoy mismo.', pie: 'Sin instalar nada', pildora: 'Empieza gratis' };
    case 'descargas':
      return { etiqueta: 'Leogin Escritorio', titulo: 'Tu restaurante, instalado en tu PC.', pie: 'Lo instalamos contigo', pildora: 'Windows 10 y 11' };
  }
}

export async function GET(_req: Request, { params }: { params: Promise<{ pagina: string }> }) {
  const { pagina } = await params;
  if (!esPaginaWeb(pagina)) return new Response('No encontrado', { status: 404 });

  const precios = await getEffectivePlanPricing().catch(() => null);
  const t = tarjeta(pagina, precios);
  const altoNombre = 44;
  const textoTodo = `${t.etiqueta}${t.titulo}${t.pie}${t.pildora ?? ''}`;
  const [regular, negrita] = await Promise.all([geist(400, textoTodo), geist(700, textoTodo)]);
  const fonts = [
    ...(regular ? [{ name: 'Geist', data: regular, weight: 400 as const, style: 'normal' as const }] : []),
    ...(negrita ? [{ name: 'Geist', data: negrita, weight: 700 as const, style: 'normal' as const }] : []),
  ];

  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '64px 76px', background: CREMA, color: LEOGIN_TINTA, fontFamily: fonts.length ? 'Geist' : undefined }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <svg width={56} height={61.6} viewBox={COMANDA_VIEWBOX}>
            <path d={COMANDA_NORMAL} fill={LEOGIN_CORAL} fillRule="evenodd" />
          </svg>
          <svg width={altoNombre * NOMBRE_PROPORCION} height={altoNombre} viewBox={NOMBRE_VIEWBOX}>
            <path d={NOMBRE_D} fill={LEOGIN_TINTA} />
          </svg>
          <div style={{ marginLeft: 14, fontSize: 28, color: LEOGIN_CORAL, fontWeight: 700 }}>{t.etiqueta}</div>
        </div>

        <div style={{ display: 'flex', fontSize: t.titulo.length > 34 ? 76 : 88, fontWeight: 700, lineHeight: 1.02, letterSpacing: -2.5, maxWidth: 960 }}>
          {t.titulo}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 30 }}>
          <div style={{ display: 'flex', color: 'rgba(23, 22, 26, 0.72)' }}>{t.pie}</div>
          {t.pildora && (
            <div style={{ display: 'flex', background: LEOGIN_CORAL, color: '#ffffff', fontWeight: 700, padding: '14px 26px', borderRadius: 999 }}>
              {t.pildora}
            </div>
          )}
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      ...(fonts.length ? { fonts } : {}),
      headers: { 'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400' },
    },
  );
}
