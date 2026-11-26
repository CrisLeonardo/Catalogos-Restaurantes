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
import { DEMO_CATEGORIES, DEMO_PRODUCTS, DEMO_THEME, type DemoCategory, type DemoProduct } from '@/lib/demo-menu';
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

/** La carta del alta (ficha 2.3): sus platillos en «Platillos», sin foto.
    `null` es la portada (sin alta): la carta de Rincón 502. Una lista vacía
    es un alta que todavía no escribe platillos: la carta va vacía, nunca con
    platos que no son suyos. */
export function cartaMuestra(platos: { nombre: string; precio: number }[] | null):
  { categories: DemoCategory[]; products: DemoProduct[] } {
  if (!platos) return { categories: DEMO_CATEGORIES, products: DEMO_PRODUCTS };
  if (platos.length === 0) return { categories: [], products: [] };
  return {
    categories: [{ id: 'alta', name: 'Platillos', icon: 'utensils' }],
    products: platos.map((p, i) => ({
      id: `alta-${i}`, category_id: 'alta', name: p.nombre.slice(0, 120), description: null,
      price: p.precio, image_url: null, icon: null, tags: null, dietary_tags: null, options: null,
    })),
  };
}

function avisar(msg: MuestraAviso) {
  if (window.parent !== window) window.parent.postMessage(msg, window.location.origin);
}

export default function MuestraClient({ estiloInicial, nombreInicial, alta = false }: { estiloInicial: string | null; nombreInicial: string; alta?: boolean }) {
  const inicial = useMemo(() => estadoMuestra(estiloInicial, nombreInicial), [estiloInicial, nombreInicial]);
  const [pedido, setPedido] = useState<{ estilo: string | null; nombre: string; platos: { nombre: string; precio: number }[] | null; pedidos: boolean } | null>(null);
  /* Con los platillos del alta, la carta abre directo en ellos —como al
     escanear el QR de una mesa—: la portada a pantalla completa los dejaba
     fuera de la vista del teléfono de muestra. */
  const estado = useMemo(() => {
    if (!pedido) return undefined;
    const e = estadoMuestra(pedido.estilo, pedido.nombre);
    return pedido.platos?.length ? { ...e, config: { ...e.config, portadaVariant: 'none' as const } } : e;
  }, [pedido]);
  const carta = useMemo(() => cartaMuestra(pedido?.platos ?? (alta ? [] : null)), [pedido, alta]);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || !esMuestraPedido(e.data)) return;
      setPedido({ estilo: e.data.estilo, nombre: e.data.nombre, platos: e.data.platos ?? null, pedidos: e.data.pedidos ?? true });
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
      categories={carta.categories}
      products={carta.products}
      ordersEnabled={pedido?.pedidos ?? true}
      estado={estado}
      muestra
    />
  );
}
