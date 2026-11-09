'use client';

/* ============================================================
   CATÁLOGO · lista de platillos (auditoría 1.9: R06, E10)
   ------------------------------------------------------------
   Maqueta aprobada: docs/diseno/MAQUETA_CATALOGO_2026-11-09.html.
     · Lo agotado en UNA línea («3 agotados ahora · Ver»), no tres
       tarjetas antes de la lista.
     · Filtros combinables con contador (Agotado, Oculto, Sin foto,
       Sin costo, Sin categoría) + «Limpiar», y orden elegido.
     · Búsqueda, categoría, filtros y orden viven en la dirección: al
       volver de un platillo se conservan.
     · Cambios en lote: disponible/agotado, mostrar/ocultar, mover de
       categoría y precio con vista previa antes → después. Todo o nada
       (`leogin_aplicar_lote_catalogo`, migración 179).
   Crear/editar un platillo vive en su página (product-form.tsx).
   ============================================================ */

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
/* `Link` es aqui `PanelLink`: traduce las rutas del panel al origen desde el
   que se sirve la pagina. Ver components/admin/panel-link.tsx. */
import Link from '@/components/admin/panel-link';
import AssetImage from '@/components/asset-image';
import { Icon } from '@/components/icons';
import { BrandPattern, seedFromString } from '@/components/brand-pattern';
import { aplicarLoteCatalogo, toggleProductAvailability, type LoteCambio } from '@/lib/actions/products';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { useToastManager } from '@/components/ui/toast';
import { Switch } from '@/components/ui/switch';
import { isOutOfStock } from '@/lib/product-availability';
import { normalizar } from '@/lib/servicio/comanda';
import { fmtMoney } from '@/lib/money';
import {
  FILTROS, contarFiltros, filtrar, ordenar, previaDePrecios,
  type CambioDePrecio, type FiltroCatalogo, type OrdenCatalogo,
} from '@/lib/catalogo/reglas';
import type { Category, Product } from '@/types';
import { usePathname as useRutaNavegador } from 'next/navigation';
import { panelBaseFrom, panelHref } from '@/lib/panel-links';
import s from './catalogo.module.css';

/* ── constantes ───────────────────────────────────────────── */

function calcProductPrice(p: Product): { total: number; hasCombo: boolean; hasSizes: boolean; hasExtras: boolean } {
  const opts = Array.isArray(p.options) ? p.options : [];
  const hasCombo   = opts.some((g) => g.type === 'combo');
  const hasSizes   = opts.some((g) => g.type === 'single' && g.choices.some((c) => (c.priceDelta || 0) !== 0));
  const hasExtras  = opts.some((g) => g.type === 'multi');
  const comboDelta = opts
    .filter((g) => g.type === 'combo')
    .reduce((sum, g) => sum + g.choices.reduce((acc, c) => acc + (Number(c.priceDelta) || 0), 0), 0);
  return { total: p.price + comboDelta, hasCombo, hasSizes, hasExtras };
}

function pickIcon(icon: string | null | undefined): string {
  return icon?.trim() || 'utensils';
}

/* Los sellos sugeridos se guardan con su clave; aquí se dicen con su nombre. */
const SELLO: Record<string, string> = { new: 'Nuevo', fav: 'Favorito', hot: 'Picante', veg: 'Vegano' };

/* `?filtro=sin-foto` (aviso de Hoy) y los nombres anteriores siguen sirviendo. */
const FILTRO_VIEJO: Record<string, FiltroCatalogo> = { 'sin-foto': 'sin_foto', agotados: 'agotado', ocultos: 'oculto' };
const ORDENES: { key: OrdenCatalogo; label: string }[] = [
  { key: 'carta', label: 'Como en la carta' },
  { key: 'nombre', label: 'Por nombre' },
  { key: 'edicion', label: 'Última edición' },
];

export interface EstadoInicial { q?: string; cat?: string; f?: string; orden?: string; filtro?: string }

function leerInicial(i: EstadoInicial, categorias: Category[]) {
  const validos = new Set(FILTROS.map((f) => f.key));
  const filtros = (i.f ?? '').split(',').filter((x): x is FiltroCatalogo => validos.has(x as FiltroCatalogo));
  const viejo = i.filtro ? FILTRO_VIEJO[i.filtro] ?? (validos.has(i.filtro as FiltroCatalogo) ? (i.filtro as FiltroCatalogo) : null) : null;
  if (viejo && !filtros.includes(viejo)) filtros.push(viejo);
  return {
    q: (i.q ?? '').slice(0, 80),
    cat: i.cat && categorias.some((c) => c.id === i.cat) ? i.cat : 'todos',
    filtros,
    orden: (ORDENES.some((o) => o.key === i.orden) ? i.orden : 'carta') as OrdenCatalogo,
  };
}

/* ── CatalogPanel ─────────────────────────────────────────── */

interface Props {
  restaurantId: string;
  categories: Category[];
  products: Product[];
  /** Tope de productos del plan (solo el plan gratuito lo trae, ver PLANS.BASICO.maxProducts). */
  maxProducts?: number;
  /** Búsqueda, categoría, filtros y orden con los que abre (vienen en la dirección). */
  inicial?: EstadoInicial;
  /** «Exportar» (lo arma la página): va en la fila de herramientas (MEN-11). */
  exportSlot?: React.ReactNode;
}

export default function CatalogPanel({ restaurantId, categories, products, maxProducts, inicial = {}, exportSlot }: Props) {
  /* Prefijo del origen unico ('' en el subdominio de hoy). Ver lib/panel-links.ts. */
  const base = panelBaseFrom(useRutaNavegador());
  const router = useRouter();
  const [arranque] = useState(() => leerInicial(inicial, categories));
  const [activeCat, setActiveCatState] = useState<string>(arranque.cat);
  const [query, setQueryState] = useState(arranque.q);
  const [filtros, setFiltrosState] = useState<FiltroCatalogo[]>(arranque.filtros);
  const [orden, setOrdenState] = useState<OrdenCatalogo>(arranque.orden);
  const { add: toast } = useToastManager();
  const [, startAvail] = useTransition();
  const [aplicando, startLote] = useTransition();

  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [previa, setPrevia] = useState<{ sentido: 1 | -1; modo: CambioDePrecio['modo']; valor: string } | null>(null);
  const [errorLote, setErrorLote] = useState<string | null>(null);

  /* La dirección guarda lo elegido: al volver de un platillo, la lista sigue igual. */
  function cadena(next: { q?: string; cat?: string; filtros?: FiltroCatalogo[]; orden?: OrdenCatalogo }) {
    const sp = new URLSearchParams();
    const qq = next.q ?? query;
    const cc = next.cat ?? activeCat;
    const ff = next.filtros ?? filtros;
    const oo = next.orden ?? orden;
    if (qq.trim()) sp.set('q', qq.trim());
    if (cc !== 'todos') sp.set('cat', cc);
    if (ff.length) sp.set('f', ff.join(','));
    if (oo !== 'carta') sp.set('orden', oo);
    return sp.toString();
  }
  function guardar(next: Parameters<typeof cadena>[0]) {
    const qs = cadena(next);
    try {
      window.history.replaceState(window.history.state, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`);
    } catch { /* sin historial (vista previa): la lista funciona igual */ }
  }
  /* Al refrescar tras un lote, el router reescribe la dirección sin lo
     elegido: se vuelve a poner cuando llegan los datos nuevos. */
  useEffect(() => { guardar({}); }, [products]); // eslint-disable-line react-hooks/exhaustive-deps
  const setQuery = (v: string) => { setQueryState(v); guardar({ q: v }); };
  const setActiveCat = (v: string) => { setActiveCatState(v); guardar({ cat: v }); };
  const setFiltros = (v: FiltroCatalogo[]) => { setFiltrosState(v); guardar({ filtros: v }); };
  const setOrden = (v: OrdenCatalogo) => { setOrdenState(v); guardar({ orden: v }); };

  /**
   * Marcar agotado / disponible, con DESHACER: la operación es reversible,
   * así que se hace y se deja deshacer. `silent` corta la cadena.
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
        actionProps: { children: 'Deshacer', onClick: () => setAvailability(id, name, !next, true) },
      });
    });
  }

  const atProductLimit = maxProducts != null && products.length >= maxProducts;
  const nearProductLimit = maxProducts != null && !atProductLimit && products.length >= maxProducts * 0.8;

  const catIconMap = new Map(categories.map((c) => [c.id, pickIcon(c.icon)]));
  const ordenCategoria = useMemo(() => new Map(categories.map((c, i) => [c.id, i])), [categories]);

  /* «Agotado» con la misma regla del menú: lo apagado a mano (ya resuelto por
     la página) o sin existencias. Sólo cuenta lo visible: lo oculto es una
     decisión tomada, no algo que se esté dejando de vender. */
  const conDisponibilidad = useMemo(
    () => products.map((p) => (p.is_active && isOutOfStock(p) ? { ...p, is_available: false } : p)),
    [products],
  );
  const agotadosAhora = conDisponibilidad.filter((p) => p.is_active && !p.is_available);
  const porInventario = agotadosAhora.filter((p) => isOutOfStock(p)).length;
  const cuentas = contarFiltros(conDisponibilidad);

  const q = normalizar(query.trim());
  const list = ordenar(
    filtrar(conDisponibilidad, filtros).filter((p) => {
      if (activeCat !== 'todos' && p.category_id !== activeCat) return false;
      if (!q) return true;
      return normalizar([p.name, p.description ?? '', ...(p.tags ?? [])].join(' ')).includes(q);
    }),
    orden,
    ordenCategoria,
  );
  const filtering = q !== '' || filtros.length > 0 || activeCat !== 'todos';
  const clearFilters = () => {
    setQueryState(''); setFiltrosState([]); setActiveCatState('todos');
    guardar({ q: '', filtros: [], cat: 'todos' });
  };
  const toggleFiltro = (f: FiltroCatalogo) => setFiltros(filtros.includes(f) ? filtros.filter((x) => x !== f) : [...filtros, f]);

  // Al abrir un platillo se lleva lo elegido para que «Volver» lo devuelva.
  const desde = cadena({});
  const fichaHref = (id: string) => panelHref(base, `/admin/menu/productos/${id}${desde ? `?desde=${encodeURIComponent(desde)}` : ''}`);
  const newProductHref = activeCat === 'todos'
    ? panelHref(base, '/admin/menu/productos/new')
    : panelHref(base, `/admin/menu/productos/new?cat=${activeCat}`);

  /* ── Selección y lote ── */
  const visibles = list.map((p) => p.id);
  const todosMarcados = visibles.length > 0 && visibles.every((id) => seleccion.has(id));
  const elegidos = conDisponibilidad.filter((p) => seleccion.has(p.id));
  function marcar(id: string) {
    setSeleccion((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function marcarTodos() {
    setSeleccion((prev) => {
      const next = new Set(prev);
      if (todosMarcados) visibles.forEach((id) => next.delete(id)); else visibles.forEach((id) => next.add(id));
      return next;
    });
  }
  function quitarSeleccion() { setSeleccion(new Set()); setPrevia(null); setErrorLote(null); }

  const cambioDePrecio: CambioDePrecio | null = previa && previa.valor.trim() !== '' && Number.isFinite(Number(previa.valor)) && Number(previa.valor) > 0
    ? { modo: previa.modo, valor: previa.sentido * Number(previa.valor) }
    : null;
  const filasPrevia = cambioDePrecio ? previaDePrecios(elegidos, cambioDePrecio) : [];
  const negativo = filasPrevia.find((f) => f.negativo);

  function aplicar(cambio: LoteCambio, exito: string) {
    const ids = [...seleccion];
    setErrorLote(null);
    startLote(async () => {
      const r = await aplicarLoteCatalogo(restaurantId, ids, cambio);
      if (r.error) { setErrorLote(r.error); return; }
      toast({ title: exito, type: 'success' });
      setSeleccion(new Set());
      setPrevia(null);
      router.refresh();
    });
  }
  const n = seleccion.size;
  const nPlatillos = `${n} ${n === 1 ? 'platillo' : 'platillos'}`;
  /** «1 platillo agotado» / «3 platillos agotados». */
  const dicho = (uno: string, varios: string) => `${nPlatillos} ${n === 1 ? uno : varios}`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Lo que no se puede pedir ahora, en una línea (R06.1). */}
      {agotadosAhora.length > 0 && !filtros.includes('agotado') && (
        <div className={s.agotados} role="status">
          <Icon name="alertCircle" size={18} />
          <span>
            <strong>{agotadosAhora.length} {agotadosAhora.length === 1 ? 'agotado' : 'agotados'} ahora</strong>
            {porInventario > 0 && <> · {porInventario} sin existencias en inventario</>}
          </span>
          <button type="button" className={s.enlace} onClick={() => setFiltros([...filtros, 'agotado'])}>Ver</button>
        </div>
      )}

      {/* Buscador + botón nuevo */}
      <div className={s.herramientas}>
        {products.length > 0 && (
          <label className="adm-search" style={{ flex: '1 1 160px' }}>
            <Icon name="search" size={16} aria-hidden />
            <input
              type="search" value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar platillo" aria-label="Buscar platillo" autoComplete="off" enterKeyHint="search"
            />
          </label>
        )}
        {maxProducts != null && (
          <span className="shrink-0" style={{
            fontSize: 12, fontWeight: 600,
            color: atProductLimit ? 'var(--c-danger)' : nearProductLimit ? 'var(--c-warn)' : 'var(--u-text-4)',
          }}>
            {products.length}/{maxProducts} productos
          </span>
        )}
        {products.length > 0 && exportSlot && <div style={{ marginLeft: 'auto' }}>{exportSlot}</div>}
        {atProductLimit ? (
          <Link href="/admin/suscripcion" className="shrink-0">
            <Button variant="secondary" className="rounded-adm-full">
              <Icon name="key" size={15} /> Sube de plan para más
            </Button>
          </Link>
        ) : (
          <Link href={newProductHref} className="shrink-0" style={{ marginLeft: 'auto' }}>
            <Button data-tour-step="catalogo-nuevo" className="rounded-adm-full">
              <Icon name="plus" size={15} /> Nuevo platillo
            </Button>
          </Link>
        )}
      </div>

      {/* Categorías */}
      {products.length > 0 && (
        <div className="u-noscroll" style={{ display: 'flex', gap: 7, overflowX: 'auto', alignItems: 'center' }}>
          {[{ id: 'todos', name: 'Todas' }, ...categories].map((c) => {
            const on = c.id === activeCat;
            return (
              <Button key={c.id} variant={on ? 'primary' : 'secondary'} size="sm" className="shrink-0 rounded-adm-full"
                aria-pressed={on} onClick={() => setActiveCat(c.id)}>
                {c.name}
              </Button>
            );
          })}
        </div>
      )}

      {/* Filtros combinables + orden (R06.2–3) */}
      {products.length > 0 && (
        <div className={s.herramientas}>
          <div className={s.filtros} role="group" aria-label="Filtros">
            {FILTROS.filter((f) => cuentas[f.key] > 0 || filtros.includes(f.key)).map((f) => (
              <button key={f.key} type="button" className={`${s.filtro} press`} aria-pressed={filtros.includes(f.key)} onClick={() => toggleFiltro(f.key)}>
                {f.label} <span className={s.cuenta}>{cuentas[f.key]}</span>
              </button>
            ))}
            {filtering && (
              <button type="button" className={s.enlace} onClick={clearFilters}>Limpiar</button>
            )}
          </div>
          <label className={s.orden}>
            Orden
            <select value={orden} onChange={(e) => setOrden(e.target.value as OrdenCatalogo)} className="adm-field adm-field-sm adm-field-auto">
              {ORDENES.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
          </label>
        </div>
      )}

      {filtering && list.length > 0 && (
        <p style={{ fontSize: 13, color: 'var(--u-text-3)', margin: '-4px 0 0' }}>
          {list.length === 1 ? '1 platillo' : `${list.length} platillos`} de {products.length}
        </p>
      )}

      {/* Vista previa del precio en lote: antes → después, todo o nada. */}
      {previa && n > 0 && (
        <section className={s.previa} aria-labelledby="previa-titulo">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <h2 id="previa-titulo" style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Cambiar precio de {nPlatillos}</h2>
            <Button type="button" variant="ghost" size="icon" className="ml-auto" aria-label="Cerrar vista previa" onClick={() => { setPrevia(null); setErrorLote(null); }}>
              <Icon name="x" size={16} />
            </Button>
          </div>
          <div className={s.previaControles}>
            <select aria-label="Subir o bajar" value={previa.sentido} className="adm-field adm-field-auto"
              onChange={(e) => setPrevia({ ...previa, sentido: Number(e.target.value) as 1 | -1 })}>
              <option value={1}>Subir</option>
              <option value={-1}>Bajar</option>
            </select>
            <input type="number" inputMode="decimal" min="0" step="0.01" aria-label="Cuánto" placeholder="10"
              value={previa.valor} onChange={(e) => setPrevia({ ...previa, valor: e.target.value })} className="adm-field adm-field-auto tabular-nums" />
            <select aria-label="Unidad" value={previa.modo} className="adm-field adm-field-auto"
              onChange={(e) => setPrevia({ ...previa, modo: e.target.value as CambioDePrecio['modo'] })}>
              <option value="porcentaje">%</option>
              <option value="monto">quetzales</option>
            </select>
          </div>
          {filasPrevia.length > 0 ? (
            <div className={s.scroll}>
              <table className={s.tabla}>
                <thead><tr><th>Platillo</th><th className={s.n}>Antes</th><th className={s.n}>Después</th></tr></thead>
                <tbody>
                  {filasPrevia.map((f) => (
                    <tr key={f.id} className={f.negativo ? s.negativo : undefined}>
                      <td>{f.nombre}</td>
                      <td className={`${s.n} ${s.antes}`}>{fmtMoney(f.antes)}</td>
                      <td className={s.n}><strong>{f.negativo ? `−${fmtMoney(-f.despues)}` : fmtMoney(f.despues)}</strong>{f.negativo && ' · negativo'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p style={{ fontSize: 13, color: 'var(--u-text-3)', margin: 0 }}>Escribe cuánto subir o bajar para ver cada precio antes de aplicarlo.</p>
          )}
          {negativo && (
            <p role="alert" style={{ fontSize: 13, color: 'var(--c-danger)', margin: 0 }}>
              El precio de «{negativo.nombre}» quedaría negativo. Ajusta el cambio: se aplica a todos o a ninguno.
            </p>
          )}
          {errorLote && <p role="alert" style={{ fontSize: 13, color: 'var(--c-danger)', margin: 0 }}>{errorLote}</p>}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Button type="button" size="touch" disabled={!cambioDePrecio || !!negativo || aplicando}
              onClick={() => cambioDePrecio && aplicar({ precio: cambioDePrecio }, `Precio cambiado en ${nPlatillos}`)}>
              {aplicando ? 'Aplicando…' : `Aplicar a ${nPlatillos}`}
            </Button>
            <Button type="button" size="touch" variant="ghost" onClick={() => { setPrevia(null); setErrorLote(null); }}>Cancelar</Button>
          </div>
        </section>
      )}

      {/* Tabla */}
      {list.length === 0 ? (
        products.length === 0 ? (
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
          <Card className="flex flex-col items-center gap-3 p-10 text-center" style={{ color: 'var(--u-text-3)', fontSize: 14 }}>
            {q ? `Ningún platillo coincide con «${query.trim()}».` : 'No hay platillos con estos filtros.'}
            <Button type="button" variant="secondary" size="sm" className="rounded-adm-full" onClick={clearFilters}>
              Limpiar filtros
            </Button>
          </Card>
        )
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="catalog-head" style={{ padding: '10px 18px', borderBottom: '1px solid var(--u-hair)' }}>
            <div className="adm-label" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <label className={s.marcaZona}>
                <input type="checkbox" className={s.marca} checked={todosMarcados} onChange={marcarTodos}
                  aria-label={todosMarcados ? 'Quitar la selección de la lista' : 'Seleccionar toda la lista'} />
              </label>
              Platillo
            </div>
            <div className="adm-label" style={{ textAlign: 'right' }}>Precio</div>
            <div className="adm-label">Disponible</div>
            <div />
          </div>

          {list.map((p, i) => {
            const icon = catIconMap.get(p.category_id ?? '') ?? 'utensils';
            const { total, hasCombo, hasSizes, hasExtras } = calcProductPrice(p);
            const tags = p.tags ?? [];
            const hasBadges = hasCombo || hasSizes || hasExtras || tags.length > 0;
            /* Se apaga lo que DESCRIBE el plato, no la fila entera. */
            const apagado = p.is_active ? (p.is_available ? 1 : 0.58) : 0.42;
            const marcado = seleccion.has(p.id);
            return (
              <div key={p.id} className="catalog-row" style={{
                padding: '12px 18px',
                borderBottom: i < list.length - 1 ? '1px solid var(--u-hair)' : 'none',
                background: marcado ? 'var(--adm-card-hover)' : undefined,
              }}>
                <div className="catalog-cell-dish" style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                  <label className={s.marcaZona}>
                    <input type="checkbox" className={s.marca} checked={marcado} onChange={() => marcar(p.id)} aria-label={`Seleccionar ${p.name}`} />
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, opacity: apagado, transition: 'opacity 160ms' }}>
                    <div style={{ width: 44, height: 44, borderRadius: 'var(--radius-md)', overflow: 'hidden', background: 'var(--adm-bg-2)', flexShrink: 0 }}>
                      {p.image_url ? (
                        <AssetImage src={p.image_url} alt={p.name} width={44} height={44} style={{ objectFit: 'cover', width: '100%', height: '100%' }} />
                      ) : (
                        <BrandPattern icon={icon} seed={seedFromString(p.id)} iconScale={0.85} />
                      )}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--u-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {p.name}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--u-text-4)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 300 }}>
                        {p.description ?? '—'}
                      </div>
                      {hasBadges && (
                        <div style={{ display: 'flex', gap: 4, marginTop: 5, flexWrap: 'wrap' }}>
                          {hasCombo  && <RowBadge label="Combo" color="var(--c-ok)" bg="var(--c-ok-bg)" />}
                          {hasSizes  && <RowBadge label="Tamaños" color="var(--u-text-3)" bg="var(--adm-bg-2)" />}
                          {hasExtras && <RowBadge label="Extras" color="var(--u-text-3)" bg="var(--adm-bg-2)" />}
                          {tags.map((t) => <RowBadge key={t} label={SELLO[t] ?? t} color="var(--u-text-3)" bg="var(--adm-bg-2)" />)}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="catalog-cell-price" style={{ textAlign: 'right', opacity: apagado, transition: 'opacity 160ms' }}>
                  {hasSizes && (
                    <div style={{ fontSize: 11, color: 'var(--u-text-4)', fontWeight: 600, letterSpacing: '0.04em', marginBottom: 1 }}>DESDE</div>
                  )}
                  <div className="tabular-nums" style={{ fontWeight: 600, fontSize: 14, color: 'var(--u-text)' }}>{fmtMoney(total)}</div>
                  {hasCombo && total !== p.price && (
                    <div style={{ fontSize: 11, color: 'var(--u-text-4)', marginTop: 1 }}>base {fmtMoney(p.price)}</div>
                  )}
                </div>

                <div className="catalog-cell-avail" style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  {!p.is_active ? (
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--c-danger)', padding: '3px 8px', borderRadius: 'var(--radius-full)', background: 'var(--c-danger-bg)', border: '1px solid var(--c-danger-line)' }}>
                      Oculto
                    </span>
                  ) : isOutOfStock(p) ? (
                    <Link href={panelHref(base, '/admin/inventario')} title="Repón existencias en Inventario"
                      style={{ fontSize: 12, fontWeight: 600, color: 'var(--c-warn)', padding: '3px 8px', borderRadius: 'var(--radius-full)', background: 'var(--c-warn-bg)', border: '1px solid var(--c-warn-line)', textDecoration: 'none' }}>
                      Sin existencias
                    </Link>
                  ) : (
                    <>
                      <Switch checked={p.is_available} onCheckedChange={(next) => setAvailability(p.id, p.name, next)}
                        aria-label={p.is_available ? `Marcar ${p.name} agotado` : `Marcar ${p.name} disponible`} />
                      <span style={{ fontSize: 12, fontWeight: p.is_available ? 400 : 600, color: p.is_available ? 'var(--u-text-2)' : 'var(--c-warn)' }}>
                        {p.is_available ? 'Disponible' : 'Agotado'}
                      </span>
                    </>
                  )}
                </div>

                <div className="catalog-cell-actions" style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                  <Link href={fichaHref(p.id)}>
                    <Button variant="secondary" size="sm"><Icon name="edit" size={13} /> Editar</Button>
                  </Link>
                </div>
              </div>
            );
          })}
        </Card>
      )}

      {/* Barra del lote: aparece al seleccionar (R06.4). */}
      {n > 0 && !previa && (
        <div className={`adm-savebar ${s.lote}`} role="region" aria-label="Cambios en lote">
          <span className={s.loteCuenta}>{n} {n === 1 ? 'seleccionado' : 'seleccionados'}</span>
          <div className={s.loteAcciones}>
            <Button type="button" size="sm" onClick={() => { setPrevia({ sentido: 1, modo: 'porcentaje', valor: '' }); setErrorLote(null); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
              Precio…
            </Button>
            <Button type="button" size="sm" variant="secondary" disabled={aplicando} onClick={() => aplicar({ disponible: false }, dicho('marcado como agotado', 'marcados como agotados'))}>Agotar</Button>
            <Button type="button" size="sm" variant="secondary" disabled={aplicando} onClick={() => aplicar({ disponible: true }, dicho('disponible', 'disponibles'))}>Disponible</Button>
            <Button type="button" size="sm" variant="secondary" disabled={aplicando} onClick={() => aplicar({ visible: false }, dicho('oculto del menú', 'ocultos del menú'))}>Ocultar</Button>
            <Button type="button" size="sm" variant="secondary" disabled={aplicando} onClick={() => aplicar({ visible: true }, dicho('visible en el menú', 'visibles en el menú'))}>Mostrar</Button>
            {categories.length > 0 && (
              <select aria-label="Mover a la categoría" value="" disabled={aplicando} className="adm-field adm-field-sm adm-field-auto"
                onChange={(e) => {
                  const destino = categories.find((c) => c.id === e.target.value);
                  if (destino) aplicar({ categoria: destino.id }, `${dicho('movido', 'movidos')} a ${destino.name}`);
                }}>
                <option value="" disabled>Mover a…</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            )}
            <Button type="button" size="sm" variant="ghost" onClick={quitarSeleccion}>Quitar selección</Button>
          </div>
          {errorLote && <p role="alert" style={{ flexBasis: '100%', fontSize: 13, color: 'var(--c-danger)', margin: 0 }}>{errorLote}</p>}
        </div>
      )}
    </div>
  );
}

function RowBadge({ label, color, bg }: { label: string; color: string; bg: string }) {
  return (
    <span style={{
      display: 'inline-block', padding: '2px 7px', borderRadius: 'var(--radius-full)',
      fontSize: 11, fontWeight: 600, background: bg, color, letterSpacing: '0.02em', whiteSpace: 'nowrap',
    }}>
      {label}
    </span>
  );
}
