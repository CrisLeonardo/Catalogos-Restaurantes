'use client';

/* ============================================================
   INVENTARIO (auditoría 1.10: E11, N20, R11, O04)
   ------------------------------------------------------------
   Maqueta aprobada: docs/diseno/MAQUETA_INVENTARIO_2026-11-09.html.
     · Cobertura: «12 de 39 platillos con control», no tres ceros que
       parecían «todo bien» con nada controlado (N20).
     · Por revisar hoy: sin existencias, agotados (con cuándo vuelven),
       ingredientes que se acabaron y bajo mínimo.
     · Buscador, categorías y filtros; activar el control de varios a la
       vez con existencias iniciales y vista previa, todo o nada.
     · Ajustes con motivo (obligatorio al restar o fijar), en una sola
       operación bajo bloqueo; el historial dice motivo, nota y quién.
   ============================================================ */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { HojaOperativa } from '@/components/ui/hoja-operativa';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useToastManager } from '@/components/ui/toast';
import {
  activarControl, agotarIngrediente, ajustarExistencias, getProductMovements, saveInventory,
  type ModoAjuste, type MotivoAjuste,
} from '@/lib/actions/inventory';
import { toggleProductAvailability } from '@/lib/actions/products';
import { isOutOfStock, isUnavailable, razonDeAgotado } from '@/lib/product-availability';
import { normalizar } from '@/lib/servicio/comanda';
import type { Category, Product } from '@/types';
import type { StockMovement } from '@/lib/db/kardex';
import s from './inventario.module.css';

const REASON_LABEL: Record<string, string> = {
  purchase: 'Compra a proveedor', sale: 'Venta', cancel: 'Cancelación', adjust: 'Ajuste manual', set: 'Existencias fijadas',
  reposicion: 'Reposición', merma: 'Merma', conteo: 'Conteo físico', correccion: 'Corrección', consumo: 'Consumo del personal', otro: 'Otro',
};

const MOTIVOS: Record<ModoAjuste, { key: MotivoAjuste; label: string }[]> = {
  sumar: [{ key: 'reposicion', label: 'Reposición' }, { key: 'conteo', label: 'Conteo físico' }, { key: 'correccion', label: 'Corrección' }, { key: 'otro', label: 'Otro' }],
  restar: [{ key: 'merma', label: 'Merma' }, { key: 'consumo', label: 'Consumo del personal' }, { key: 'conteo', label: 'Conteo físico' }, { key: 'correccion', label: 'Corrección' }, { key: 'otro', label: 'Otro' }],
  fijar: [{ key: 'conteo', label: 'Conteo físico' }, { key: 'correccion', label: 'Corrección' }, { key: 'otro', label: 'Otro' }],
};

type Filtro = 'sin_control' | 'con_control' | 'bajo' | 'agotado';
const FILTROS: { key: Filtro; label: string }[] = [
  { key: 'sin_control', label: 'Sin control' },
  { key: 'con_control', label: 'Con control' },
  { key: 'bajo', label: 'Bajo mínimo' },
  { key: 'agotado', label: 'Agotado' },
];

export type IngredienteAgotado = { id: string; name: string; platillos: number };

interface Props {
  restaurantId: string;
  categories: Category[];
  products: Product[];
  ingredientesAgotados?: IngredienteAgotado[];
  timezone?: string;
}

const esBajo = (p: Product) => p.track_stock && Number(p.stock ?? 0) > 0 && Number(p.stock ?? 0) <= Number(p.low_stock_threshold ?? 0);

export default function InventoryPanel({ restaurantId, categories, products, ingredientesAgotados = [], timezone }: Props) {
  const router = useRouter();
  const { add: toast } = useToastManager();
  const [pendiente, start] = useTransition();
  const [query, setQuery] = useState('');
  const [cat, setCat] = useState('todos');
  const [filtro, setFiltro] = useState<Filtro | null>(null);
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [activacion, setActivacion] = useState<{ titulo: string; filas: { id: string; name: string; stock: string; minimo: string }[] } | null>(null);
  const [errorActivar, setErrorActivar] = useState<string | null>(null);
  const [ajuste, setAjuste] = useState<{ product: Product; modo: ModoAjuste } | null>(null);

  // La hora de esta lectura: decide qué «hasta mañana» ya volvió.
  // eslint-disable-next-line react-hooks/purity
  const ahora = Date.now();
  const activos = products.filter((p) => p.is_active);
  const controlados = activos.filter((p) => p.track_stock);
  const sinControl = activos.length - controlados.length;
  const agotado = (p: Product) => isUnavailable(p, ahora);

  /* ── Por revisar hoy ── */
  const sinExistencias = activos.filter((p) => isOutOfStock(p));
  const agotadosAMano = activos.filter((p) => !isOutOfStock(p) && agotado(p) && p.agotado_motivo !== 'ingrediente');
  const bajos = activos.filter(esBajo);
  const porRevisar = sinExistencias.length + agotadosAMano.length + ingredientesAgotados.length + bajos.length;

  /* ── Lista ── */
  const cuenta: Record<Filtro, number> = {
    sin_control: products.filter((p) => !p.track_stock).length,
    con_control: products.filter((p) => p.track_stock).length,
    bajo: products.filter(esBajo).length,
    agotado: products.filter((p) => p.is_active && agotado(p)).length,
  };
  const q = normalizar(query.trim());
  const lista = products.filter((p) => {
    if (cat !== 'todos' && p.category_id !== cat) return false;
    if (q && !normalizar(p.name).includes(q)) return false;
    switch (filtro) {
      case 'sin_control': return !p.track_stock;
      case 'con_control': return p.track_stock;
      case 'bajo': return esBajo(p);
      case 'agotado': return p.is_active && agotado(p);
      default: return true;
    }
  });

  function hecho(titulo: string, descripcion?: string) {
    toast({ title: titulo, description: descripcion, type: 'success' });
    router.refresh();
  }

  function yaHay(p: Product) {
    const fd = new FormData();
    fd.set('restaurantId', restaurantId);
    fd.set('id', p.id);
    fd.set('is_available', 'true');
    start(async () => {
      const r = await toggleProductAvailability(fd);
      if (r?.error) toast({ title: r.error, type: 'error' }); else hecho(`${p.name} vuelve a estar disponible`);
    });
  }

  function yaHayIngrediente(i: IngredienteAgotado) {
    start(async () => {
      const r = await agotarIngrediente(restaurantId, i.id, false);
      if (r.error) { toast({ title: r.error, type: 'error' }); return; }
      const n = r.platillos ?? 0;
      hecho(`Ya hay ${i.name}`, n > 0 ? `${n} ${n === 1 ? 'platillo vuelve' : 'platillos vuelven'} al menú.` : 'Sus platillos siguen esperando otro ingrediente o se agotaron aparte.');
    });
  }

  function sumarUno(p: Product) {
    start(async () => {
      const r = await ajustarExistencias(restaurantId, p.id, 'sumar', 1, 'reposicion');
      if (r.error) toast({ title: r.error, type: 'error' }); else router.refresh();
    });
  }

  /* ── Activar control ── */
  function abrirActivacion(ids?: string[]) {
    const elegidos = ids
      ? products.filter((p) => ids.includes(p.id))
      : seleccion.size > 0
        ? products.filter((p) => seleccion.has(p.id))
        : lista.filter((p) => !p.track_stock);
    const filas = elegidos.filter((p) => !p.track_stock).map((p) => ({ id: p.id, name: p.name, stock: '', minimo: '' }));
    if (filas.length === 0) return;
    const titulo = filas.length === 1 ? filas[0].name
      : seleccion.size > 0 || ids ? `${filas.length} platillos`
      : cat !== 'todos' ? categories.find((c) => c.id === cat)?.name ?? `${filas.length} platillos` : `${filas.length} platillos`;
    setErrorActivar(null);
    setActivacion({ titulo, filas });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  const [todosStock, setTodosStock] = useState('');
  const [todosMinimo, setTodosMinimo] = useState('');
  const filasValidas = activacion?.filas.every((f) => /^\d+$/.test(f.stock) && /^\d+$/.test(f.minimo || '0')) ?? false;
  const enCero = activacion?.filas.filter((f) => f.stock === '0') ?? [];

  function confirmarActivacion() {
    if (!activacion) return;
    setErrorActivar(null);
    start(async () => {
      const r = await activarControl(restaurantId, activacion.filas.map((f) => ({ id: f.id, stock: Number(f.stock), minimo: Number(f.minimo || 0) })));
      if (r.error) { setErrorActivar(r.error); return; }
      setActivacion(null);
      setSeleccion(new Set());
      hecho(`Control activado en ${r.activados} ${r.activados === 1 ? 'platillo' : 'platillos'}`);
    });
  }

  return (
    <div className={s.panel}>
      {/* Cobertura (N20, E11) */}
      <section className={`${s.tarjeta} ${s.cobertura}`} aria-label="Cobertura del inventario">
        <div className={s.cobFila}>
          <span className={s.cobGrande}>{controlados.length} de {activos.length}</span>
          <span>platillos con control de existencias</span>
        </div>
        <div className={s.barra} aria-hidden><i style={{ width: `${activos.length ? Math.round((controlados.length / activos.length) * 100) : 0}%` }} /></div>
        <p className={s.nota}>
          {sinControl === 0
            ? 'Cuentas las existencias de todos tus platillos visibles.'
            : `Los otros ${sinControl} se venden sin límite: no sabemos cuántos quedan.`}
        </p>
      </section>

      {/* Por revisar hoy (R11.1) */}
      <section className={s.tarjeta} aria-labelledby="inv-revisar">
        <h2 id="inv-revisar" className={s.revisarTitulo}>
          Por revisar hoy {porRevisar > 0 && <span className={`${s.chip} ${s.chipWarn}`}>{porRevisar}</span>}
        </h2>
        {porRevisar === 0 ? (
          <p className={s.vacio}>Nada por revisar: no hay agotados ni existencias bajo el mínimo.</p>
        ) : (
          <ul className={s.lista}>
            {sinExistencias.map((p) => (
              <li key={`se-${p.id}`} className={s.item}>
                <div className={s.itemTexto}><b>{p.name}</b><span>Sin existencias · vuelve al reponer</span></div>
                <Button type="button" size="sm" variant="secondary" onClick={() => setAjuste({ product: p, modo: 'sumar' })}>Reponer</Button>
              </li>
            ))}
            {agotadosAMano.map((p) => (
              <li key={`am-${p.id}`} className={s.item}>
                <div className={s.itemTexto}><b>{p.name}</b><span>{razonDeAgotado(p, timezone, ahora)}</span></div>
                <Button type="button" size="sm" variant="secondary" disabled={pendiente} onClick={() => yaHay(p)}>Ya hay</Button>
              </li>
            ))}
            {ingredientesAgotados.map((i) => (
              <li key={`ing-${i.id}`} className={s.item}>
                <div className={s.itemTexto}>
                  <b>Se acabó {i.name}</b>
                  <span>{i.platillos} {i.platillos === 1 ? 'platillo fuera' : 'platillos fuera'} del menú</span>
                </div>
                <Button type="button" size="sm" variant="secondary" disabled={pendiente} onClick={() => yaHayIngrediente(i)}>Ya hay</Button>
              </li>
            ))}
            {bajos.map((p) => (
              <li key={`bj-${p.id}`} className={s.item}>
                <div className={s.itemTexto}><b>{p.name}</b><span>Quedan {Number(p.stock ?? 0)} · mínimo {Number(p.low_stock_threshold ?? 0)}</span></div>
                <Button type="button" size="sm" variant="secondary" onClick={() => setAjuste({ product: p, modo: 'sumar' })}>Reponer</Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Activar control en lote, con vista previa (E11) */}
      {activacion && (
        <section className={`${s.tarjeta} ${s.activar}`} aria-labelledby="inv-activar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <h2 id="inv-activar" style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Activar control · {activacion.titulo}</h2>
            <Button type="button" variant="ghost" size="icon" className="ml-auto" aria-label="Cerrar" onClick={() => setActivacion(null)}>
              <Icon name="x" size={16} />
            </Button>
          </div>
          {activacion.filas.length > 1 && (
            <div className={s.todos}>
              <label>Existencias para todos
                <input className="adm-field adm-field-auto tabular-nums" inputMode="numeric" value={todosStock} onChange={(e) => setTodosStock(e.target.value.replace(/\D/g, ''))} />
              </label>
              <label>Avisar al llegar a
                <input className="adm-field adm-field-auto tabular-nums" inputMode="numeric" value={todosMinimo} onChange={(e) => setTodosMinimo(e.target.value.replace(/\D/g, ''))} />
              </label>
              <Button type="button" size="sm" variant="secondary" disabled={!todosStock && !todosMinimo}
                onClick={() => setActivacion({ ...activacion, filas: activacion.filas.map((f) => ({ ...f, stock: todosStock || f.stock, minimo: todosMinimo || f.minimo })) })}>
                Aplicar a las filas
              </Button>
            </div>
          )}
          <div className={s.scroll}>
            <table className={s.tabla}>
              <thead><tr><th>Platillo</th><th className={s.n}>Existencias</th><th className={s.n}>Avisar al llegar a</th></tr></thead>
              <tbody>
                {activacion.filas.map((f, i) => (
                  <tr key={f.id}>
                    <td>{f.name}</td>
                    <td className={s.n}>
                      <input className="adm-field adm-field-auto tabular-nums" inputMode="numeric" aria-label={`Existencias de ${f.name}`} value={f.stock} placeholder="0"
                        onChange={(e) => setActivacion({ ...activacion, filas: activacion.filas.map((x, j) => (j === i ? { ...x, stock: e.target.value.replace(/\D/g, '') } : x)) })} />
                    </td>
                    <td className={s.n}>
                      <input className="adm-field adm-field-auto tabular-nums" inputMode="numeric" aria-label={`Mínimo de ${f.name}`} value={f.minimo} placeholder="0"
                        onChange={(e) => setActivacion({ ...activacion, filas: activacion.filas.map((x, j) => (j === i ? { ...x, minimo: e.target.value.replace(/\D/g, '') } : x)) })} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className={s.nota} style={{ margin: 0 }}>
            {enCero.length > 0 && <><b>{enCero.map((f) => f.name).join(', ')}</b> {enCero.length === 1 ? 'empieza' : 'empiezan'} en 0: {enCero.length === 1 ? 'queda agotado' : 'quedan agotados'} hasta reponer. </>}
            {activacion.filas.length > 1 ? `Se activan los ${activacion.filas.length} juntos o ninguno.` : 'Desde ahora cada venta descuenta una unidad.'}
          </p>
          {!filasValidas && <p className={s.nota} style={{ margin: 0 }}>Escribe las existencias de cada platillo (0 si no hay).</p>}
          {errorActivar && <p role="alert" className={s.error}>{errorActivar}</p>}
          <div className={s.pie}>
            <Button type="button" size="touch" disabled={!filasValidas || pendiente} onClick={confirmarActivacion}>
              {pendiente ? 'Activando…' : `Activar ${activacion.filas.length} ${activacion.filas.length === 1 ? 'platillo' : 'platillos'}`}
            </Button>
            <Button type="button" size="touch" variant="ghost" onClick={() => setActivacion(null)}>Cancelar</Button>
          </div>
        </section>
      )}

      {/* Buscador, categorías y filtros */}
      <div className={s.herramientas}>
        <label className="adm-search" style={{ flex: '1 1 200px' }}>
          <Icon name="search" size={16} aria-hidden />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar platillo" aria-label="Buscar platillo" autoComplete="off" />
        </label>
        <Button type="button" variant="secondary" disabled={!lista.some((p) => !p.track_stock) && seleccion.size === 0} onClick={() => abrirActivacion()}>
          {seleccion.size > 0 ? `Activar control (${seleccion.size})…` : 'Activar control…'}
        </Button>
      </div>
      <div className="u-noscroll" style={{ display: 'flex', gap: 7, overflowX: 'auto' }}>
        {[{ id: 'todos', name: 'Todas' }, ...categories].map((c) => (
          <Button key={c.id} variant={c.id === cat ? 'primary' : 'secondary'} size="sm" className="shrink-0 rounded-adm-full"
            aria-pressed={c.id === cat} onClick={() => setCat(c.id)}>
            {c.name}
          </Button>
        ))}
      </div>
      <div className={s.filtros} role="group" aria-label="Filtros">
        {FILTROS.map((f) => (
          <button key={f.key} type="button" className={`${s.filtro} press`} aria-pressed={filtro === f.key} onClick={() => setFiltro(filtro === f.key ? null : f.key)}>
            {f.label} <span className={s.cuenta}>{cuenta[f.key]}</span>
          </button>
        ))}
      </div>

      {/* Lista */}
      {lista.length === 0 ? (
        <div className={s.tarjeta}><p className={s.vacio} style={{ padding: 24, textAlign: 'center' }}>No hay platillos con estos filtros.</p></div>
      ) : (
        <div className={s.tarjeta}>
          {lista.map((p) => (
            <Fila key={p.id} p={p} restaurantId={restaurantId} timezone={timezone} ahora={ahora}
              marcado={seleccion.has(p.id)}
              onMarcar={() => setSeleccion((prev) => { const n = new Set(prev); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); return n; })}
              onActivar={() => abrirActivacion([p.id])}
              onAjustar={(modo) => setAjuste({ product: p, modo })}
              onSumarUno={() => sumarUno(p)}
              pendiente={pendiente}
              onCambio={() => router.refresh()} />
          ))}
        </div>
      )}

      {seleccion.size > 0 && !activacion && (
        <div className="adm-savebar" role="region" aria-label="Activar en lote">
          <span className={s.loteCuenta}>{seleccion.size} {seleccion.size === 1 ? 'seleccionado' : 'seleccionados'}</span>
          <Button type="button" size="sm" onClick={() => abrirActivacion()}>Activar control…</Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setSeleccion(new Set())}>Quitar selección</Button>
        </div>
      )}

      {ajuste && (
        <HojaAjuste restaurantId={restaurantId} product={ajuste.product} modoInicial={ajuste.modo}
          onClose={() => setAjuste(null)}
          onHecho={(texto) => { setAjuste(null); hecho(texto); }} />
      )}
    </div>
  );
}

/* ── Una fila ─────────────────────────────────────────────── */

function Fila({ p, restaurantId, timezone, ahora, marcado, onMarcar, onActivar, onAjustar, onSumarUno, pendiente, onCambio }: {
  p: Product; restaurantId: string; timezone?: string; ahora: number; marcado: boolean;
  onMarcar: () => void; onActivar: () => void; onAjustar: (m: ModoAjuste) => void; onSumarUno: () => void;
  pendiente: boolean; onCambio: () => void;
}) {
  const { confirm, dialog } = useConfirm();
  const [detalle, setDetalle] = useState<'historial' | 'ajustes' | null>(null);
  const [movs, setMovs] = useState<StockMovement[] | null>(null);
  const [minimo, setMinimo] = useState(String(p.low_stock_threshold ?? 0));
  const [error, setError] = useState<string | null>(null);
  const [cargando, start] = useTransition();
  const stock = Number(p.stock ?? 0);
  const fuera = isOutOfStock(p);
  const bajo = esBajo(p);
  const agotadoAMano = !fuera && isUnavailable(p, ahora);

  function verHistorial() {
    if (detalle === 'historial') { setDetalle(null); return; }
    setDetalle('historial');
    start(async () => { setMovs(await getProductMovements(restaurantId, p.id)); });
  }

  function guardar(track: boolean) {
    const fd = new FormData();
    fd.set('restaurantId', restaurantId);
    fd.set('id', p.id);
    fd.set('track_stock', String(track));
    fd.set('low_stock_threshold', minimo);
    setError(null);
    start(async () => {
      const r = await saveInventory(null, fd);
      if (r && 'error' in r) { setError(r.error); return; }
      setDetalle(null);
      onCambio();
    });
  }

  async function desactivar() {
    if (!(await confirm({
      title: `¿Dejar de contar «${p.name}»?`,
      description: 'Se podrá vender sin límite y dejarás de ver cuántos quedan. El historial se conserva.',
      confirmLabel: 'Dejar de contar',
    }))) return;
    guardar(false);
  }

  return (
    <div className={s.fila}>
      {dialog}
      {!p.track_stock && (
        <label className={s.marcaZona}>
          <input type="checkbox" className={s.marca} checked={marcado} onChange={onMarcar} aria-label={`Seleccionar ${p.name}`} />
        </label>
      )}
      <div className={s.filaNombre}>
        <b>{p.name}</b>
        <div className={s.filaMeta}>
          {!p.track_stock && <span className={s.chip}>Sin control</span>}
          {fuera && <span className={`${s.chip} ${s.chipBad}`}>Sin existencias</span>}
          {bajo && <span className={`${s.chip} ${s.chipWarn}`}>Bajo mínimo</span>}
          {p.track_stock && !fuera && !bajo && <span className={`${s.chip} ${s.chipOk}`}>Bien</span>}
          {agotadoAMano && <span className={`${s.chip} ${s.chipWarn}`} title={razonDeAgotado(p, timezone, ahora)}>Agotado</span>}
          {!p.is_active && <span className={s.chip}>Oculto</span>}
          {p.track_stock && <span>mínimo {Number(p.low_stock_threshold ?? 0)}</span>}
        </div>
      </div>

      {p.track_stock ? (
        <div className={s.paso}>
          <Button type="button" variant="secondary" size="icon" className="size-10" aria-label={`Restar a ${p.name}`} title="Restar (pide motivo)"
            disabled={stock <= 0} onClick={() => onAjustar('restar')}>
            <Icon name="minus" size={16} />
          </Button>
          <button type="button" className={`${s.valor} press`} style={{ border: 'none', background: 'transparent', cursor: 'pointer', minHeight: 40 }}
            aria-label={`${p.name}: quedan ${stock}. Fijar el número exacto`} title="Fijar el número exacto" onClick={() => onAjustar('fijar')}>
            {stock}
          </button>
          <Button type="button" variant="secondary" size="icon" className="size-10" aria-label={`Sumar uno a ${p.name} (reposición)`} title="Sumar uno · Reposición"
            disabled={pendiente} onClick={onSumarUno}>
            <Icon name="plus" size={16} />
          </Button>
          <Button type="button" variant="ghost" size="icon" className="size-10" aria-label={`Historial de ${p.name}`} title="Historial" onClick={verHistorial}>
            <Icon name="clock" size={16} />
          </Button>
          <Button type="button" variant="ghost" size="icon" className="size-10" aria-label={`Ajustes de ${p.name}`} title="Mínimo y control"
            onClick={() => setDetalle(detalle === 'ajustes' ? null : 'ajustes')}>
            <Icon name="settings" size={16} />
          </Button>
        </div>
      ) : (
        <Button type="button" variant="secondary" size="sm" style={{ marginLeft: 'auto' }} onClick={onActivar}>Activar control</Button>
      )}

      {detalle === 'historial' && (
        <div className={s.detalle}>
          {cargando || movs === null ? <p className={s.nota} style={{ margin: 0 }}>Cargando…</p>
            : movs.length === 0 ? <p className={s.nota} style={{ margin: 0 }}>Sin movimientos todavía.</p>
            : movs.map((m) => (
              <div key={m.id} className={s.mov}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ color: 'var(--u-text)', fontWeight: 500 }}>{REASON_LABEL[m.reason] ?? m.reason}{m.nota ? ` · ${m.nota}` : ''}</div>
                  <div style={{ color: 'var(--u-text-3)', fontSize: 12 }}>
                    {new Date(m.created_at).toLocaleString('es-GT', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', ...(timezone ? { timeZone: timezone } : {}) })}
                    {m.quien ? ` · ${m.quien}` : ''}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }} className="tabular-nums">
                  <div style={{ fontWeight: 600, color: Number(m.delta) >= 0 ? 'var(--c-ok)' : 'var(--c-danger)' }}>{Number(m.delta) >= 0 ? '+' : '−'}{Math.abs(Number(m.delta))}</div>
                  {m.balance_after != null && <div style={{ color: 'var(--u-text-3)', fontSize: 12 }}>quedan {Number(m.balance_after)}</div>}
                </div>
              </div>
            ))}
        </div>
      )}

      {detalle === 'ajustes' && (
        <div className={s.detalle} style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, fontWeight: 600, color: 'var(--u-text-2)' }}>
            Avisar al llegar a
            <input className="adm-field adm-field-auto tabular-nums" inputMode="numeric" style={{ width: 96 }} value={minimo}
              onChange={(e) => setMinimo(e.target.value.replace(/\D/g, ''))} />
          </label>
          <Button type="button" size="sm" disabled={cargando} onClick={() => guardar(true)}>Guardar mínimo</Button>
          <Button type="button" size="sm" variant="outline" disabled={cargando} onClick={desactivar}>Dejar de contar</Button>
          {error && <p role="alert" className={s.error} style={{ flexBasis: '100%' }}>{error}</p>}
        </div>
      )}
    </div>
  );
}

/* ── Hoja de ajuste con motivo (R11.4) ────────────────────── */

function HojaAjuste({ restaurantId, product, modoInicial, onClose, onHecho }: {
  restaurantId: string; product: Product; modoInicial: ModoAjuste; onClose: () => void; onHecho: (texto: string) => void;
}) {
  const stock = Number(product.stock ?? 0);
  const [modo, setModo] = useState<ModoAjuste>(modoInicial);
  const [cantidad, setCantidad] = useState(modoInicial === 'fijar' ? String(stock) : '1');
  const [motivo, setMotivo] = useState<MotivoAjuste | null>(modoInicial === 'sumar' ? 'reposicion' : null);
  const [nota, setNota] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pendiente, start] = useTransition();

  const n = /^\d+$/.test(cantidad) ? Number(cantidad) : NaN;
  const quedan = modo === 'sumar' ? stock + n : modo === 'restar' ? stock - n : n;
  const motivoLabel = MOTIVOS[modo].find((m) => m.key === motivo)?.label;
  const valido = Number.isFinite(n) && (modo === 'fijar' ? n >= 0 && n !== stock : n > 0) && quedan >= 0
    && !!motivo && (motivo !== 'otro' || nota.trim() !== '');

  function cambiarModo(m: ModoAjuste) {
    setModo(m);
    setMotivo(m === 'sumar' ? 'reposicion' : null);
    setCantidad(m === 'fijar' ? String(stock) : '1');
    setError(null);
  }

  function confirmar() {
    if (!valido || !motivo) return;
    setError(null);
    start(async () => {
      const r = await ajustarExistencias(restaurantId, product.id, modo, n, motivo, nota.trim() || undefined);
      if (r.error) { setError(r.error); return; }
      onHecho(`${product.name}: quedan ${r.despues ?? quedan}`);
    });
  }

  const verbo = modo === 'sumar' ? `Sumar ${Number.isFinite(n) ? n : ''}` : modo === 'restar' ? `Restar ${Number.isFinite(n) ? n : ''}` : `Dejar en ${Number.isFinite(n) ? n : ''}`;

  return (
    <HojaOperativa
      label={`Ajustar existencias de ${product.name}`}
      title={`${product.name} · quedan ${stock}`}
      onClose={onClose}
      footer={(
        <div className={s.pie}>
          <Button type="button" size="touch" disabled={!valido || pendiente} onClick={confirmar}>
            {pendiente ? 'Guardando…' : `${verbo}${motivoLabel ? ` · ${motivoLabel}` : ''}`}
          </Button>
          <Button type="button" size="touch" variant="ghost" onClick={onClose}>Cancelar</Button>
        </div>
      )}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className={s.modos} role="group" aria-label="Tipo de ajuste">
          {(['sumar', 'restar', 'fijar'] as const).map((m) => (
            <button key={m} type="button" className={s.motivo} aria-pressed={modo === m} onClick={() => cambiarModo(m)}>
              {m === 'sumar' ? 'Sumar' : m === 'restar' ? 'Restar' : 'Número exacto'}
            </button>
          ))}
        </div>
        <div className={s.cantidad}>
          <label htmlFor="ajuste-cantidad" className="sr-only">Cantidad</label>
          <input id="ajuste-cantidad" className="adm-field adm-field-auto tabular-nums" inputMode="numeric" value={cantidad}
            onChange={(e) => setCantidad(e.target.value.replace(/\D/g, ''))} autoFocus />
          <span style={{ color: 'var(--u-text-2)', fontSize: 14 }}>
            {Number.isFinite(quedan) && quedan >= 0
              ? <>quedarían <b className="tabular-nums">{quedan}</b></>
              : <span style={{ color: 'var(--c-danger)' }}>Sólo quedan {stock}</span>}
          </span>
        </div>
        <div>
          <p style={{ margin: '0 0 8px', fontWeight: 600, fontSize: 14 }}>
            ¿Por qué?{modo === 'sumar' ? '' : <span style={{ fontWeight: 400, color: 'var(--u-text-3)' }}> · obligatorio</span>}
          </p>
          <div className={s.motivos} role="group" aria-label="Motivo">
            {MOTIVOS[modo].map((m) => (
              <button key={m.key} type="button" className={s.motivo} aria-pressed={motivo === m.key} onClick={() => setMotivo(m.key)}>{m.label}</button>
            ))}
          </div>
        </div>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, fontWeight: 600, color: 'var(--u-text-2)' }}>
          Nota {motivo === 'otro' ? '(obligatoria)' : '(opcional)'}
          <input className="adm-field" maxLength={200} value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Ej.: se quemó una olla" />
        </label>
        <p className={s.nota} style={{ margin: 0 }}>Queda en el historial con tu nombre y la hora.</p>
        {error && <p role="alert" className={s.error}>{error}</p>}
      </div>
    </HojaOperativa>
  );
}
