'use client';

/* CatalogPanel — tabla de catálogo estilo prototipo.
   Reemplaza CategoryManager en /admin/menu. Crear/editar un platillo vive en
   una página propia (/admin/menu/productos/new y /admin/menu/productos/[id],
   components/admin/product-form.tsx) — antes había además un modal aquí
   mismo que duplicaba todos los campos del editor; se quitó porque los dos
   se desincronizaban (un campo nuevo se agregaba en uno y se olvidaba en el
   otro) y el formulario de página completa es el que queda como único. */

import { useState, useTransition } from 'react';
/* `Link` es aqui `PanelLink`: traduce las rutas del panel al origen desde el
   que se sirve la pagina. Lo que no es del panel pasa de largo sin tocarse.
   Ver components/admin/panel-link.tsx. */
import Link from '@/components/admin/panel-link';
import AssetImage from '@/components/asset-image';
import { Icon } from '@/components/icons';
import { BrandPattern, seedFromString } from '@/components/brand-pattern';
import { toggleProductAvailability } from '@/lib/actions/products';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { useToastManager } from '@/components/ui/toast';
import { Switch } from '@/components/ui/switch';
import { isOutOfStock } from '@/lib/product-availability';
import type { Category, Product } from '@/types';
import { usePathname as useRutaNavegador } from 'next/navigation';
import { panelBaseFrom, panelHref } from '@/lib/panel-links';

/* ── constantes ───────────────────────────────────────────── */

function calcProductPrice(p: Product): { total: number; hasCombo: boolean; hasSizes: boolean; hasExtras: boolean } {
  const opts = Array.isArray(p.options) ? p.options : [];
  const hasCombo   = opts.some((g) => g.type === 'combo');
  const hasSizes   = opts.some((g) => g.type === 'single' && g.choices.some((c) => (c.priceDelta || 0) !== 0));
  const hasExtras  = opts.some((g) => g.type === 'multi');
  const comboDelta = opts
    .filter((g) => g.type === 'combo')
    .reduce((sum, g) => sum + g.choices.reduce((s, c) => s + (Number(c.priceDelta) || 0), 0), 0);
  return { total: p.price + comboDelta, hasCombo, hasSizes, hasExtras };
}

function pickIcon(icon: string | null | undefined): string {
  return icon?.trim() || 'utensils';
}

/* ── CatalogPanel ─────────────────────────────────────────── */

interface Props {
  restaurantId: string;
  categories: Category[];
  products: Product[];
  /** Tope de productos del plan (solo el plan gratuito lo trae, ver PLANS.BASICO.maxProducts). */
  maxProducts?: number;
}

export default function CatalogPanel({ restaurantId, categories, products, maxProducts }: Props) {
  /* Prefijo del origen unico ('' en el subdominio de hoy). Ver lib/panel-links.ts. */
  const base = panelBaseFrom(useRutaNavegador());
  const [activeCat, setActiveCat] = useState<string>('todos');
  const { add: toast } = useToastManager();
  const [, startAvail] = useTransition();

  /**
   * Marcar agotado / disponible, con DESHACER.
   *
   * Antes era un <form> que se enviaba solo al mover el interruptor: la acción
   * ocurría en silencio y, si se tocaba el platillo equivocado —fácil, son
   * filas juntas y el pulgar es ancho—, había que buscarlo y volver a moverlo.
   * Ahora avisa qué pasó y ofrece revertirlo ahí mismo. Es el patrón que
   * sustituye a preguntar "¿estás seguro?" antes de cada cosa: la operación es
   * reversible, así que se hace y se deja deshacer.
   *
   * `silent` corta la cadena: el deshacer no lanza otro deshacer.
   */
  function setAvailability(id: string, name: string, next: boolean, silent = false) {
    const fd = new FormData();
    fd.set('restaurantId', restaurantId);
    fd.set('id', id);
    fd.set('is_available', String(next));
    startAvail(async () => {
      await toggleProductAvailability(fd);
      if (silent) return;
      toast({
        title: next ? `${name} vuelve a estar disponible` : `${name} quedó marcado como agotado`,
        description: next ? undefined : 'Tus clientes lo ven agotado y no lo pueden pedir. Vuelve solo en 12 h.',
        type: 'success',
        actionProps: {
          children: 'Deshacer',
          onClick: () => setAvailability(id, name, !next, true),
        },
      });
    });
  }


  const atProductLimit = maxProducts != null && products.length >= maxProducts;
  const nearProductLimit = maxProducts != null && !atProductLimit && products.length >= maxProducts * 0.8;

  const catIconMap = new Map(categories.map((c) => [c.id, pickIcon(c.icon)]));
  const list = products.filter(
    (p) => activeCat === 'todos' || p.category_id === activeCat,
  );

  // El editor de platillo vive en su propia página (product-form.tsx); si hay
  // un filtro de categoría activo, se preselecciona ahí mismo por query param.
  const newProductHref = activeCat === 'todos'
    ? panelHref(base, '/admin/menu/productos/new')
    : panelHref(base, `/admin/menu/productos/new?cat=${activeCat}`);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Chips + botón nuevo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div className="u-noscroll" style={{ display: 'flex', gap: 7, overflowX: 'auto', flex: 1 }}>
          {[{ id: 'todos', name: 'Todas' }, ...categories].map((c) => {
            const on = c.id === activeCat;
            return (
              <Button
                key={c.id}
                variant={on ? 'primary' : 'secondary'}
                size="sm"
                className="shrink-0 rounded-adm-full"
                onClick={() => setActiveCat(c.id)}
              >
                {c.name}
              </Button>
            );
          })}
        </div>
        {maxProducts != null && (
          <span
            className="shrink-0"
            style={{
              fontSize: 11.5, fontWeight: 600,
              color: atProductLimit ? 'var(--c-danger)' : nearProductLimit ? '#fb923c' : 'var(--u-text-4)',
            }}
          >
            {products.length}/{maxProducts} productos
          </span>
        )}
        {atProductLimit ? (
          <Link href="/admin/suscripcion" className="shrink-0">
            <Button variant="secondary" className="rounded-adm-full">
              <Icon name="key" size={15} /> Sube de plan para más
            </Button>
          </Link>
        ) : (
          <Link href={newProductHref} className="shrink-0">
            <Button data-tour-step="catalogo-nuevo" className="rounded-adm-full">
              <Icon name="plus" size={15} /> Nuevo platillo
            </Button>
          </Link>
        )}
      </div>

      {/* Tabla */}
      {list.length === 0 ? (
        products.length === 0 ? (
          // Catálogo vacío de verdad: es la primera vez del dueño, así que la
          // pantalla enseña qué falta y trae el botón para hacerlo. Antes
          // decía "No hay platillos aún. ¡Crea el primero!" y ahí terminaba.
          <EmptyState
            icon="bag"
            title="Todavía no tienes platillos"
            desc="Agrega el primero y tu menú queda publicado al instante: la gente ya puede verlo escaneando tu código QR."
            action={
              atProductLimit
                ? { href: '/admin/suscripcion', label: 'Sube de plan para agregar' }
                : { href: newProductHref, label: 'Agregar el primero' }
            }
          />
        ) : (
          // Vacío por el filtro, no por falta de datos: aquí la salida es
          // cambiar de categoría, no crear un platillo.
          <Card className="p-10 text-center" style={{ color: 'var(--u-text-3)', fontSize: 14 }}>
            No hay platillos en esta categoría.
          </Card>
        )
      ) : (
        <Card className="overflow-hidden p-0">
          {/* Header */}
          <div
            className="catalog-head"
            style={{ padding: '10px 18px', borderBottom: '1px solid var(--u-hair)' }}
          >
            {(['Platillo', 'Precio', 'Disponible', ''] as const).map((h, i) => (
              <div
                key={i}
                className="adm-label"
                style={{ textAlign: i === 1 ? 'right' : 'left' }}
              >
                {h}
              </div>
            ))}
          </div>

          {/* Filas */}
          {list.map((p, i) => {
            const icon = catIconMap.get(p.category_id ?? '') ?? 'utensils';
            const { total, hasCombo, hasSizes, hasExtras } = calcProductPrice(p);
            const tags = p.tags ?? [];
            const hasBadges = hasCombo || hasSizes || hasExtras || tags.length > 0;
            /* Se apaga lo que DESCRIBE el plato, no la fila entera: con la
               fila a 0.58 el propio «Agotado», el interruptor para volver a
               activarlo y «Editar» se quedaban a 2.4:1 — justo lo que hay
               que tocar para arreglar un plato agotado. */
            const apagado = p.is_active ? (p.is_available ? 1 : 0.58) : 0.42;
            return (
              <div
                key={p.id}
                className="catalog-row"
                style={{
                  padding: '12px 18px',
                  borderBottom: i < list.length - 1 ? '1px solid var(--u-hair)' : 'none',
                }}
              >
                {/* Platillo */}
                <div className="catalog-cell-dish" style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, opacity: apagado, transition: 'opacity 160ms' }}>
                  <div
                    style={{
                      width: 44, height: 44, borderRadius: 11, overflow: 'hidden',
                      background: 'color-mix(in srgb, var(--u-text) 4%, transparent)', flexShrink: 0,
                    }}
                  >
                    {p.image_url ? (
                      <AssetImage
                        src={p.image_url}
                        alt={p.name}
                        width={44}
                        height={44}
                        style={{ objectFit: 'cover', width: '100%', height: '100%' }}
                      />
                    ) : (
                      <BrandPattern icon={icon} seed={seedFromString(p.id)} iconScale={0.85} />
                    )}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontWeight: 600, fontSize: 14.5,
                        color: 'var(--u-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }}
                    >
                      {p.name}
                    </div>
                    <div
                      style={{
                        fontSize: 11.5, color: 'var(--u-text-4)', whiteSpace: 'nowrap',
                        overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 300,
                      }}
                    >
                      {p.description ?? '—'}
                    </div>
                    {hasBadges && (
                      <div style={{ display: 'flex', gap: 4, marginTop: 5, flexWrap: 'wrap' }}>
                        {hasCombo  && <RowBadge label="Combo"   color="var(--c-ok)" bg="var(--c-ok-bg)" />}
                        {hasSizes  && <RowBadge label="Tamaños" color="var(--u-text-3)" bg="color-mix(in srgb, var(--u-text) 6%, transparent)" />}
                        {hasExtras && <RowBadge label="Extras"  color="var(--u-text-3)" bg="color-mix(in srgb, var(--u-text) 6%, transparent)" />}
                        {tags.map((t) => <RowBadge key={t} label={t} color="var(--u-text-3)" bg="color-mix(in srgb, var(--u-text) 6%, transparent)" />)}
                      </div>
                    )}
                  </div>
                </div>

                {/* Precio */}
                <div
                  className="catalog-cell-price"
                  style={{ textAlign: 'right', opacity: apagado, transition: 'opacity 160ms' }}
                >
                  {hasSizes && (
                    <div style={{ fontSize: 9.5, color: 'var(--u-text-4)', fontWeight: 600, letterSpacing: '0.04em', marginBottom: 1 }}>
                      DESDE
                    </div>
                  )}
                  <div style={{ fontFamily: 'var(--ui-font-mono)', fontWeight: 600, fontSize: 14, color: 'var(--u-text)' }}>
                    Q{total.toFixed(2)}
                  </div>
                  {hasCombo && total !== p.price && (
                    <div style={{ fontSize: 9.5, color: 'var(--u-text-4)', marginTop: 1 }}>
                      base Q{p.price.toFixed(2)}
                    </div>
                  )}
                </div>

                {/* Toggle disponibilidad */}
                <div className="catalog-cell-avail" style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  {!p.is_active ? (
                    <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--c-danger)', padding: '3px 8px', borderRadius: 99, background: 'var(--c-danger-bg)', border: '1px solid var(--c-danger-line)' }}>
                      Desactivado
                    </span>
                  ) : isOutOfStock(p) ? (
                    /* Sin existencias no se arregla con el interruptor: encenderlo
                       no repone nada y `place_order` lo seguiría rechazando. Se
                       dice qué pasa y dónde se arregla. */
                    <Link
                      href={panelHref(base, '/admin/inventario')}
                      title="Repón existencias en Inventario"
                      style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--c-warn)', padding: '3px 8px', borderRadius: 99, background: 'var(--c-warn-bg)', border: '1px solid var(--c-warn-line)', textDecoration: 'none' }}
                    >
                      Sin existencias
                    </Link>
                  ) : (
                    <>
                      <Switch
                        checked={p.is_available}
                        onCheckedChange={(next) => setAvailability(p.id, p.name, next)}
                        aria-label={p.is_available ? 'Marcar agotado' : 'Marcar disponible'}
                      />
                      <span style={{ fontSize: 12, fontWeight: p.is_available ? 400 : 600, color: p.is_available ? 'var(--u-text-2)' : 'var(--c-warn)' }}>
                        {/* «Activo» se confundía con «Mostrar en el menú» (MEN-03). */}
                        {p.is_available ? 'Disponible' : 'Agotado'}
                      </span>
                    </>
                  )}
                </div>

                {/* Acciones */}
                <div className="catalog-cell-actions" style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                  <Link href={panelHref(base, `/admin/menu/productos/${p.id}`)}>
                    <Button variant="secondary" size="sm">
                      <Icon name="edit" size={13} /> Editar
                    </Button>
                  </Link>
                </div>
              </div>
            );
          })}
        </Card>
      )}
    </div>
  );
}

function RowBadge({ label, color, bg }: { label: string; color: string; bg: string }) {
  return (
    <span style={{
      display: 'inline-block', padding: '2px 7px', borderRadius: 99,
      fontSize: 10, fontWeight: 600, background: bg, color,
      letterSpacing: '0.02em', whiteSpace: 'nowrap',
    }}>
      {label}
    </span>
  );
}
