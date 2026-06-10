'use client';

/* ============================================================
   VISTA PREVIA EN VIVO — lado del "sitio" (se carga en /preview/[id])
   ------------------------------------------------------------
   Renderiza el menú real del restaurante con su tema resuelto y
   escucha cambios del editor por BroadcastChannel: cada ajuste
   (color, fuente, fondo, textos, CSS…) se aplica AL INSTANTE,
   sin guardar en la base de datos.

   Funciona igual dentro del iframe del editor que en una ventana
   aparte (misma origin → mismo canal), para enseñarle al cliente
   cómo va quedando en otra pantalla.
   ============================================================ */

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import MenuShell from '@/components/menu-shell';
import ThemeBackground from '@/components/theme-background';
import { buildThemeVars, buildFontsHref } from '@/lib/theme/resolve';
import type { ThemeConfig, ThemeContent } from '@/lib/theme/defaults';
import type { Category, Product } from '@/types';

/** Oculta el ThemeBackground estático renderizado por layout.tsx (server-side)
 *  para que la capa dinámica actualizada por BroadcastChannel sea la única visible. */
function hideStaticBackground() {
  document.querySelectorAll<HTMLElement>(
    'body > .asphalt, body > .bg-layer, body > .asphalt-grain, body > .asphalt-mark',
  ).forEach((el) => { el.style.display = 'none'; });
}

type CatItem = Pick<Category, 'id' | 'name' | 'icon'>;
type ProdItem = Pick<Product, 'id' | 'category_id' | 'name' | 'description' | 'price' | 'image_url' | 'icon' | 'tags' | 'options'>;

export interface ThemePreviewState {
  config: ThemeConfig;
  content: ThemeContent;
  customCss: string;
}

export function previewChannelName(previewId: string): string {
  return `leogin-preview:${previewId}`;
}

interface Props {
  previewId: string;
  initialConfig: ThemeConfig;
  initialContent: ThemeContent;
  initialCss: string;
  categories: CatItem[];
  products: ProdItem[];
  ordersEnabled: boolean;
  /** true cuando el restaurante aún no tiene productos y se muestra el menú de ejemplo. */
  sampleData?: boolean;
}

export default function PreviewClient({
  previewId,
  initialConfig,
  initialContent,
  initialCss,
  categories,
  products,
  ordersEnabled,
  sampleData = false,
}: Props) {
  const [state, setState] = useState<ThemePreviewState>({
    config: initialConfig,
    content: initialContent,
    customCss: initialCss,
  });

  /* Al montar: ocultar el ThemeBackground estático de layout.tsx para que
     el dinámico (actualizado por BroadcastChannel) sea el único visible. */
  useEffect(() => { hideStaticBackground(); }, []);

  /* Canal con el editor: pedimos el estado actual al conectar ("hello")
     y aplicamos cada estado que llegue. */
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    const ch = new BroadcastChannel(previewChannelName(previewId));
    ch.onmessage = (e: MessageEvent) => {
      const msg = e.data as { type?: string } & Partial<ThemePreviewState>;
      if (msg?.type === 'state' && msg.config && msg.content) {
        setState({ config: msg.config, content: msg.content, customCss: msg.customCss ?? '' });
      }
    };
    ch.postMessage({ type: 'hello' });
    return () => ch.close();
  }, [previewId]);

  /* Sincronizar data-glass, data-scheme y CSS vars en <html> con cada
     cambio de config, para que los selectores CSS de globals.css reflejen
     el estado del editor (glass intensity, color scheme, etc.). */
  useEffect(() => {
    const html = document.documentElement;
    html.setAttribute('data-glass', state.config.glassIntensity);
    html.setAttribute('data-scheme', state.config.scheme);
    const vars = buildThemeVars(state.config);
    Object.entries(vars).forEach(([k, v]) => html.style.setProperty(k, v));
  }, [state.config]);

  /* La vista previa es solo para mirar: bloquear navegación interna
     (p.ej. "Ir a pagar" → /checkout no existe fuera del subdominio). */
  const wrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest?.('a');
      const href = a?.getAttribute('href');
      if (href && (href.startsWith('/') || href.startsWith('#'))) e.preventDefault();
    };
    el.addEventListener('click', onClick, true);
    return () => el.removeEventListener('click', onClick, true);
  }, []);

  const { config, content, customCss } = state;
  const vars = useMemo(() => buildThemeVars(config), [config]);
  const fontsHref = useMemo(() => buildFontsHref(config), [config]);

  return (
    <div
      ref={wrapRef}
      data-glass={config.glassIntensity}
      data-scheme={config.scheme}
      style={{
        ...(vars as CSSProperties),
        // `isolation` crea un stacking context propio: las capas de fondo
        // (z-index -1) quedan SOBRE este fondo sólido pero bajo el contenido.
        isolation: 'isolate',
        position: 'relative',
        minHeight: '100svh',
        background: 'var(--brand-bg)',
        color: 'var(--u-text)',
        fontFamily: 'var(--ui-font-sans)',
      }}
    >
      {/* Fuentes del tema (React iza los <link> al <head>) */}
      {fontsHref && (
        <>
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
          <link rel="stylesheet" href={fontsHref} />
        </>
      )}

      <ThemeBackground config={config} />

      {sampleData && (
        <div
          style={{
            position: 'fixed', top: 10, left: '50%', transform: 'translateX(-50%)', zIndex: 80,
            padding: '5px 12px', borderRadius: 999, fontSize: 11, fontWeight: 600,
            background: 'rgba(0,0,0,0.55)', border: '1px solid rgba(255,255,255,0.18)',
            color: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
            whiteSpace: 'nowrap', pointerEvents: 'none',
          }}
        >
          Menú de ejemplo · carga productos para ver los reales
        </div>
      )}

      <MenuShell
        config={config}
        content={content}
        categories={categories}
        products={products}
        restaurantId={`preview-${previewId}`}
        ordersEnabled={ordersEnabled}
      />

      {/* CSS propio del restaurante: al final del documento → gana sobre todo. */}
      {customCss ? <style dangerouslySetInnerHTML={{ __html: customCss }} /> : null}
    </div>
  );
}
