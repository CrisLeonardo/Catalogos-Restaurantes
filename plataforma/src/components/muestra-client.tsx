'use client';

/* El menú de muestra que va dentro de la vitrina de diseños de la portada
   (/preview/muestra). Es el catálogo de verdad —el mismo MenuShell que abre
   el comensal— con la carta de Rincón 502; la portada le manda por
   postMessage el estilo y el nombre, y aquí se recalcula el tema sin
   recargar. Solo se aceptan mensajes del mismo origen. */

import { useEffect, useMemo, useState } from 'react';
import PreviewClient, { type ThemePreviewState } from '@/components/super/preview-client';
import { resolveTheme } from '@/lib/theme/resolve';
import { applyTemplateToConfig, findTemplate } from '@/lib/theme/templates';
import { DEMO_CATEGORIES, DEMO_PRODUCTS, DEMO_THEME } from '@/lib/demo-menu';
import { esMuestraPedido, type MuestraAviso } from '@/lib/muestra-mensajes';

export function estadoMuestra(estilo: string | null, nombre: string): ThemePreviewState {
  const base = resolveTheme(DEMO_THEME);
  const tpl = estilo ? findTemplate(estilo) : undefined;
  let config = tpl ? applyTemplateToConfig(base.config, tpl) : base.config;
  const propio = nombre.trim().slice(0, 40);
  // Con el nombre de otro restaurante, «Hamburguesas, pizzas y pastas» y «El
  // Progreso» ya no son suyos: la portada queda solo con su nombre.
  if (propio) config = { ...config, brandName: propio, tagline: '', zone: '' };
  return { config, content: base.content, customCss: '' };
}

function avisar(msg: MuestraAviso) {
  if (window.parent !== window) window.parent.postMessage(msg, window.location.origin);
}

export default function MuestraClient({ estiloInicial, nombreInicial }: { estiloInicial: string | null; nombreInicial: string }) {
  const inicial = useMemo(() => estadoMuestra(estiloInicial, nombreInicial), [estiloInicial, nombreInicial]);
  const [pedido, setPedido] = useState<{ estilo: string | null; nombre: string } | null>(null);
  const estado = useMemo(() => (pedido ? estadoMuestra(pedido.estilo, pedido.nombre) : undefined), [pedido]);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || !esMuestraPedido(e.data)) return;
      setPedido({ estilo: e.data.estilo, nombre: e.data.nombre });
    };
    window.addEventListener('message', onMessage);
    avisar({ type: 'leogin-muestra-lista' });
    return () => window.removeEventListener('message', onMessage);
  }, []);

  // Ya pintado: la portada puede recorrerlo desde arriba.
  useEffect(() => {
    if (!pedido) return;
    const id = requestAnimationFrame(() => avisar({ type: 'leogin-muestra-aplicada', estilo: pedido.estilo ?? '' }));
    return () => cancelAnimationFrame(id);
  }, [pedido]);

  return (
    <PreviewClient
      previewId="muestra"
      initialConfig={inicial.config}
      initialContent={inicial.content}
      initialCss=""
      categories={DEMO_CATEGORIES}
      products={DEMO_PRODUCTS}
      ordersEnabled
      estado={estado}
      muestra
    />
  );
}
