'use client';

/* ============================================================
   INVENTARIO
   ------------------------------------------------------------
   Auditoría 1.10 (E11, N20, R11, O04; maqueta del 2026-11-09) y línea N
   «nada saturado» (maqueta aprobada el 2026-11-17:
   docs/diseno/MAQUETA_INVENTARIO_NADA_SATURADO_2026-11-17.html).

     · Arriba, el buscador y una fila de píldoras: Contados · Sin contar ·
       categorías. La lista enseña solo lo que cuentas.
     · «Por revisar» es el primer grupo de la lista: sin existencias, bajo
       el mínimo, agotados a mano e ingredientes que se acabaron.
     · Cada fila dice cuántos quedan y lleva «+1». Al tocarla se abre la
       hoja del platillo, que empieza en «Sumar · Reposición»; ahí están
       restar, el número exacto, el mínimo, el historial y dejar de contar.
     · «Sin contar» es la configuración: la fila marca la casilla y
       «Contar existencias…» abre la hoja con existencias iniciales y mínimo,
       todo o nada.
     · Ajustes con motivo (obligatorio al restar o fijar), en una sola
       operación bajo bloqueo; el historial dice motivo, nota y quién.
   ============================================================ */

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
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

export type IngredienteAgotado = { id: string; name: string; platillos: number };

interface Props {
  restaurantId: string;
  categories: Category[];
  products: Product[];
  ingredientesAgotados?: IngredienteAgotado[];
  timezone?: string;
}

type Vista = 'contados' | 'sin_contar';

const esBajo = (p: Product) => p.track_stock && Number(p.stock ?? 0) > 0 && Number(p.stock ?? 0) <= Number(p.low_stock_threshold ?? 0);
const platillos = (n: number) => `${n} ${n === 1 ? 'platillo' : 'platillos'}`;

export default function InventoryPanel({ restaurantId, categories, products, ingredientesAgotados = [], timezone }: Props) {
  const router = useRouter();
  const { add: toast } = useToastManager();
  const { confirm, dialog } = useConfirm();
  const [pendiente, start] = useTransition();
  const [query, setQuery] = useState('');
  const [cat, setCat] = useState<string | null>(null);
  const contadosTodos = products.filter((p) => p.track_stock);
  const [vista, setVista] = useState<Vista>(contadosTodos.length > 0 ? 'contados' : 'sin_contar');
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [activacion, setActivacion] = useState<{ titulo: string; filas: { id: string; name: string; stock: string; minimo: string }[] } | null>(null);
  const [abierto, setAbierto] = useState<{ id: string; modo: ModoAjuste } | null>(null);
  const pildoras = useRef<HTMLDivElement>(null);

  // La hora de esta lectura: decide qué «hasta mañana» ya volvió.
  // eslint-disable-next-line react-hooks/purity
  const ahora = Date.now();
  const activos = products.filter((p) => p.is_active);
  const agotado = (p: Product) => isUnavailable(p, ahora);

  const q = normalizar(query.trim());
  const pasa = (p: Product) => (!cat || p.category_id === cat) && (!q || normalizar(p.name).includes(q));

  /* ── Contados: primero lo que hay que revisar ── */
  const sinExistencias = activos.filter((p) => isOutOfStock(p) && pasa(p));
  const bajos = activos.filter((p) => esBajo(p) && pasa(p));
  const agotadosAMano = activos.filter((p) => !isOutOfStock(p) && agotado(p) && p.agotado_motivo !== 'ingrediente' && pasa(p));
  const ingredientes = cat ? [] : ingredientesAgotados.filter((i) => !q || normalizar(i.name).includes(q));
  const enRevision = new Set([...sinExistencias, ...bajos, ...agotadosAMano].map((p) => p.id));
  const contados = contadosTodos.filter((p) => pasa(p) && !enRevision.has(p.id));
  const porRevisar = sinExistencias.length + bajos.length + agotadosAMano.length + ingredientes.length;

  /* ── Sin contar ── */
  const sinContarTodos = products.filter((p) => !p.track_stock);
  const sinContar = sinContarTodos.filter(pasa);
  const enVista = vista === 'contados' ? contadosTodos : sinContarTodos;
  const categoriasConAlgo = categories.filter((c) => enVista.some((p) => p.category_id === c.id));

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

  async function dejarDeContar(p: Product) {
    setAbierto(null);
    if (!(await confirm({
      title: `¿Dejar de contar «${p.name}»?`,
      description: 'Se podrá vender sin límite y dejarás de ver cuántos quedan. El historial se conserva.',
      confirmLabel: 'Dejar de contar',
    }))) return;
    const fd = new FormData();
    fd.set('restaurantId', restaurantId);
    fd.set('id', p.id);
    fd.set('track_stock', 'false');
    fd.set('low_stock_threshold', String(p.low_stock_threshold ?? 0));
    start(async () => {
      const r = await saveInventory(null, fd);
      if (r && 'error' in r) toast({ title: r.error, type: 'error' }); else hecho(`Ya no cuentas ${p.name}`);
    });
  }

  /* ── Contar existencias (antes «Activar control») ── */
  function abrirActivacion() {
    const filas = products.filter((p) => seleccion.has(p.id) && !p.track_stock).map((p) => ({ id: p.id, name: p.name, stock: '', minimo: '' }));
    if (filas.length === 0) return;
    setActivacion({ titulo: filas.length === 1 ? filas[0].name : platillos(filas.length), filas });
  }
  function confirmarActivacion(filas: { id: string; stock: string; minimo: string }[], onError: (e: string) => void) {
    start(async () => {
      const r = await activarControl(restaurantId, filas.map((f) => ({ id: f.id, stock: Number(f.stock), minimo: Number(f.minimo || 0) })));
      if (r.error) { onError(r.error); return; }
      setActivacion(null);
      setSeleccion(new Set());
      cambiarVista('contados');
      hecho(`Ahora cuentas ${platillos(r.activados ?? filas.length)} más`);
    });
  }
  const marcar = (id: string) => setSeleccion((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const sinMarcar = sinContar.filter((p) => !seleccion.has(p.id));

  const enHoja = abierto ? products.find((p) => p.id === abierto.id) ?? null : null;
  /* Al cambiar de vista, la fila de píldoras vuelve al inicio: se ve cuál está elegida. */
  const cambiarVista = (v: Vista) => { setVista(v); setCat(null); pildoras.current?.scrollTo({ left: 0 }); };

  return (
    <div className={s.panel}>
      {dialog}

      {/* Buscador y una fila de píldoras */}
      <div className={s.mandos}>
        <label className={`adm-search ${s.buscar}`}>
          <Icon name="search" size={16} aria-hidden />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar platillo" aria-label="Buscar platillo" autoComplete="off" />
        </label>
        <div ref={pildoras} className={`u-noscroll ${s.pildoras}`} role="group" aria-label="Qué platillos ver">
          <button type="button" className={s.pildora} aria-pressed={vista === 'contados'} onClick={() => cambiarVista('contados')}>
            Contados <span className={s.cuenta}>{contadosTodos.length}</span>
          </button>
          <button type="button" className={s.pildora} aria-pressed={vista === 'sin_contar'} onClick={() => cambiarVista('sin_contar')}>
            Sin contar <span className={s.cuenta}>{sinContarTodos.length}</span>
          </button>
          {categoriasConAlgo.length > 1 && categoriasConAlgo.map((c) => (
            <button key={c.id} type="button" className={s.pildora} data-categoria="" aria-pressed={cat === c.id}
              onClick={() => setCat(cat === c.id ? null : c.id)}>
              {c.name}
            </button>
          ))}
        </div>
      </div>

      {vista === 'contados' && (
        contadosTodos.length === 0 && porRevisar === 0 ? (
          <EmptyState icon="box" title="Todavía no cuentas ningún platillo"
            desc="Elige los que se acaban, como postres del día o bebidas embotelladas. Leogin los descuenta al vender."
            action={{ label: 'Elegir qué contar', onClick: () => cambiarVista('sin_contar') }} />
        ) : porRevisar === 0 && contados.length === 0 ? (
          <div className={s.tarjeta}><p className={s.vacio}>No hay platillos contados con este filtro.</p></div>
        ) : (
          <>
            {porRevisar > 0 && (
              <>
                <h2 className={s.grupo} data-aviso="">Por revisar</h2>
                <ul className={`${s.tarjeta} ${s.lista}`}>
                  {sinExistencias.map((p) => (
                    <FilaContada key={`se-${p.id}`} p={p} tono="se-acabo" meta={<><span data-tono="mal">Se acabó</span> · vuelve al reponer</>}
                      onAbrir={() => setAbierto({ id: p.id, modo: 'sumar' })}
                      accion={<Button type="button" size="touch" variant="secondary" onClick={() => setAbierto({ id: p.id, modo: 'sumar' })}>Reponer</Button>} />
                  ))}
                  {bajos.map((p) => (
                    <FilaContada key={`bj-${p.id}`} p={p} tono="bajo"
                      meta={<><span data-tono="aviso">Bajo el mínimo</span> · avisa en {Number(p.low_stock_threshold ?? 0)}</>}
                      onAbrir={() => setAbierto({ id: p.id, modo: 'sumar' })}
                      accion={<Button type="button" size="touch" variant="secondary" onClick={() => setAbierto({ id: p.id, modo: 'sumar' })}>Reponer</Button>} />
                  ))}
                  {agotadosAMano.map((p) => (
                    <FilaContada key={`am-${p.id}`} p={p} meta={razonDeAgotado(p, timezone, ahora)}
                      onAbrir={p.track_stock ? () => setAbierto({ id: p.id, modo: 'sumar' }) : undefined} sinCifra={!p.track_stock}
                      accion={<Button type="button" size="touch" variant="secondary" disabled={pendiente} onClick={() => yaHay(p)}>Ya hay</Button>} />
                  ))}
                  {ingredientes.map((i) => (
                    <li key={`ing-${i.id}`} className={s.fila}>
                      <div className={s.filaTexto}>
                        <b>Se acabó {i.name}</b>
                        <span>{platillos(i.platillos)} fuera del menú</span>
                      </div>
                      <Button type="button" size="touch" variant="secondary" disabled={pendiente} onClick={() => yaHayIngrediente(i)}>Ya hay</Button>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {contados.length > 0 && (
              <>
                {porRevisar > 0 && <h2 className={s.grupo}>Contados</h2>}
                <ul className={`${s.tarjeta} ${s.lista}`}>
                  {contados.map((p) => (
                    <FilaContada key={p.id} p={p} meta={!p.is_active ? 'Oculto en la carta' : null}
                      onAbrir={() => setAbierto({ id: p.id, modo: 'sumar' })}
                      accion={(
                        <>
                          <button type="button" className={`${s.paso} ${s.soloPc}`} aria-label={`Restar a ${p.name} (pide motivo)`} title="Restar (pide motivo)"
                            disabled={Number(p.stock ?? 0) <= 0} onClick={() => setAbierto({ id: p.id, modo: 'restar' })}>
                            <Icon name="minus" size={18} />
                          </button>
                          <button type="button" className={s.paso} aria-label={`Sumar uno a ${p.name} (reposición)`} title="Sumar uno · Reposición"
                            disabled={pendiente} onClick={() => sumarUno(p)}>
                            <Icon name="plus" size={18} />
                          </button>
                        </>
                      )} />
                  ))}
                </ul>
              </>
            )}
          </>
        )
      )}

      {vista === 'sin_contar' && (
        <>
          <p className={s.linea}>
            Cuentas <b>{contadosTodos.length} de {products.length}</b> platillos. Los demás se venden sin límite.
            {sinContarTodos.length > 0 && ' Toca los que quieras contar: los que se acaban, como postres del día o bebidas embotelladas.'}
          </p>
          {sinContar.length === 0 ? (
            <div className={s.tarjeta}><p className={s.vacio}>{sinContarTodos.length === 0 ? 'Ya cuentas todos tus platillos.' : 'No hay platillos sin contar con este filtro.'}</p></div>
          ) : (
            <>
              <ul className={`${s.tarjeta} ${s.lista}`}>
                {sinContar.map((p) => (
                  <li key={p.id}>
                    <label className={s.elegir}>
                      <input type="checkbox" className={s.marca} checked={seleccion.has(p.id)} onChange={() => marcar(p.id)} />
                      <span className={s.filaTexto}>
                        <b>{p.name}</b>
                        {!p.is_active && <span>Oculto en la carta</span>}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
              {(cat || q) && sinMarcar.length > 1 && (
                <button type="button" className={s.enlace} onClick={() => setSeleccion((prev) => new Set([...prev, ...sinMarcar.map((p) => p.id)]))}>
                  Elegir los {sinMarcar.length}{cat ? ` de ${categories.find((c) => c.id === cat)?.name ?? 'esta categoría'}` : ''}
                </button>
              )}
            </>
          )}
        </>
      )}

      {seleccion.size > 0 && !activacion && (
        <div className="adm-savebar" role="region" aria-label="Contar existencias">
          <span className={s.loteCuenta}>{seleccion.size} {seleccion.size === 1 ? 'elegido' : 'elegidos'}</span>
          <Button type="button" size="touch" variant="ghost" onClick={() => setSeleccion(new Set())}>Quitar</Button>
          <Button type="button" size="touch" onClick={abrirActivacion}>Contar existencias…</Button>
        </div>
      )}

      {activacion && (
        <HojaContar titulo={activacion.titulo} filasIniciales={activacion.filas} pendiente={pendiente}
          onClose={() => setActivacion(null)} onConfirmar={confirmarActivacion} />
      )}

      {enHoja && abierto && (
        <HojaPlatillo key={`${enHoja.id}-${abierto.modo}`} restaurantId={restaurantId} product={enHoja} modoInicial={abierto.modo} timezone={timezone}
          onClose={() => setAbierto(null)}
          onHecho={(texto) => { setAbierto(null); hecho(texto); }}
          onDejarDeContar={() => dejarDeContar(enHoja)} />
      )}
    </div>
  );
}

/* ── Una fila contada: nombre, cuántos quedan y su acción ───── */

function FilaContada({ p, meta, tono, sinCifra, onAbrir, accion }: {
  p: Product; meta?: React.ReactNode; tono?: 'se-acabo' | 'bajo'; sinCifra?: boolean;
  onAbrir?: () => void; accion: React.ReactNode;
}) {
  const texto = (
    <>
      <span className={s.filaTexto}>
        <b>{p.name}</b>
        {meta && <span>{meta}</span>}
      </span>
      {!sinCifra && <span className={s.cifra} data-tono={tono}>{Number(p.stock ?? 0)}</span>}
    </>
  );
  return (
    <li className={s.fila}>
      {onAbrir ? (
        <button type="button" className={s.abrir} onClick={onAbrir} aria-haspopup="dialog"
          aria-label={`${p.name}: quedan ${Number(p.stock ?? 0)}. Ajustar existencias`}>
          {texto}
        </button>
      ) : <div className={s.abrir}>{texto}</div>}
      <span className={s.accion}>{accion}</span>
    </li>
  );
}

/* ── Hoja del platillo: ajuste con motivo (R11.4) y lo demás ─── */

function HojaPlatillo({ restaurantId, product, modoInicial, timezone, onClose, onHecho, onDejarDeContar }: {
  restaurantId: string; product: Product; modoInicial: ModoAjuste; timezone?: string;
  onClose: () => void; onHecho: (texto: string) => void; onDejarDeContar: () => void;
}) {
  const router = useRouter();
  const stock = Number(product.stock ?? 0);
  const minimoActual = Number(product.low_stock_threshold ?? 0);
  const [modo, setModo] = useState<ModoAjuste>(modoInicial);
  const [cantidad, setCantidad] = useState(modoInicial === 'fijar' ? String(stock) : '1');
  const [motivo, setMotivo] = useState<MotivoAjuste | null>(modoInicial === 'sumar' ? 'reposicion' : null);
  const [nota, setNota] = useState('');
  const [minimo, setMinimo] = useState(String(minimoActual));
  const [movs, setMovs] = useState<StockMovement[] | null>(null);
  const [verHistorial, setVerHistorial] = useState(false);
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

  function guardarMinimo() {
    const fd = new FormData();
    fd.set('restaurantId', restaurantId);
    fd.set('id', product.id);
    fd.set('track_stock', 'true');
    fd.set('low_stock_threshold', minimo);
    setError(null);
    start(async () => {
      const r = await saveInventory(null, fd);
      if (r && 'error' in r) { setError(r.error); return; }
      router.refresh();
    });
  }

  function abrirHistorial() {
    setVerHistorial((v) => !v);
    if (movs === null) start(async () => { setMovs(await getProductMovements(restaurantId, product.id)); });
  }

  const verbo = modo === 'sumar' ? `Sumar ${Number.isFinite(n) ? n : ''}` : modo === 'restar' ? `Restar ${Number.isFinite(n) ? n : ''}` : `Dejar en ${Number.isFinite(n) ? n : ''}`;
  const hora = (iso: string) => new Date(iso).toLocaleString('es-GT', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', ...(timezone ? { timeZone: timezone } : {}) });

  return (
    <HojaOperativa
      label={`Existencias de ${product.name}`}
      title={product.name}
      className="hoja-inventario"
      resumen={<p className={s.hojaResumen}>Quedan <b>{stock}</b>{minimoActual > 0 ? ` · avisa al llegar a ${minimoActual}` : ''}</p>}
      onClose={onClose}
      footer={(
        <Button type="button" size="action" className="w-full" disabled={!valido || pendiente} onClick={confirmar}>
          {pendiente ? 'Guardando…' : `${verbo}${motivoLabel ? ` · ${motivoLabel}` : ''}`}
        </Button>
      )}
    >
      <div className={s.hojaCuerpo}>
        <div className={s.modos} role="group" aria-label="Tipo de ajuste">
          {(['sumar', 'restar', 'fijar'] as const).map((m) => (
            <button key={m} type="button" className={s.modo} aria-pressed={modo === m} disabled={m === 'restar' && stock <= 0} onClick={() => cambiarModo(m)}>
              {m === 'sumar' ? 'Sumar' : m === 'restar' ? 'Restar' : 'Número exacto'}
            </button>
          ))}
        </div>
        <div className={s.cantidad}>
          <label htmlFor="ajuste-cantidad" className="sr-only">Cantidad</label>
          <input id="ajuste-cantidad" className="adm-field adm-field-auto tabular-nums" inputMode="numeric" value={cantidad}
            onChange={(e) => setCantidad(e.target.value.replace(/\D/g, ''))} onFocus={(e) => e.currentTarget.select()} />
          <span className={s.quedarian}>
            {Number.isFinite(quedan) && quedan >= 0
              ? <>quedarían <b className="tabular-nums">{quedan}</b></>
              : <span style={{ color: 'var(--c-danger)' }}>Solo quedan {stock}</span>}
          </span>
        </div>
        <div>
          <p className={s.pregunta}>¿Por qué?{modo === 'sumar' ? '' : <span> · obligatorio</span>}</p>
          <div className={s.motivos} role="group" aria-label="Motivo">
            {MOTIVOS[modo].map((m) => (
              <button key={m.key} type="button" className={s.motivo} aria-pressed={motivo === m.key} onClick={() => setMotivo(m.key)}>{m.label}</button>
            ))}
          </div>
        </div>
        {(motivo === 'otro' || modo !== 'sumar') && (
          <label className={s.campo}>
            Nota {motivo === 'otro' ? '(obligatoria)' : '(opcional)'}
            <input className="adm-field" maxLength={200} value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Ej.: se quemó una olla" />
          </label>
        )}
        {error && <p role="alert" className={s.error}>{error}</p>}

        <ul className={s.opciones}>
          <li className={s.opcion}>
            <label htmlFor="inv-minimo">Avisar al llegar a</label>
            <input id="inv-minimo" className="adm-field adm-field-auto tabular-nums" inputMode="numeric" value={minimo}
              onChange={(e) => setMinimo(e.target.value.replace(/\D/g, ''))} />
            {minimo !== String(minimoActual) && minimo !== '' && (
              <Button type="button" size="sm" variant="secondary" disabled={pendiente} onClick={guardarMinimo}>Guardar</Button>
            )}
          </li>
          <li>
            <button type="button" className={s.opcion} aria-expanded={verHistorial} onClick={abrirHistorial}>
              <Icon name="clock" size={16} /><span>Historial</span><Icon name={verHistorial ? 'chevronDown' : 'chevronRight'} size={16} />
            </button>
            {verHistorial && (
              <div className={s.historial}>
                {movs === null ? <p className={s.hojaResumen}>Cargando…</p>
                  : movs.length === 0 ? <p className={s.hojaResumen}>Sin movimientos todavía.</p>
                  : movs.map((m) => (
                    <div key={m.id} className={s.mov}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ color: 'var(--u-text)', fontWeight: 500 }}>{REASON_LABEL[m.reason] ?? m.reason}{m.nota ? ` · ${m.nota}` : ''}</div>
                        <div style={{ color: 'var(--u-text-3)', fontSize: 12 }}>{hora(m.created_at)}{m.quien ? ` · ${m.quien}` : ''}</div>
                      </div>
                      <div style={{ textAlign: 'right' }} className="tabular-nums">
                        <div style={{ fontWeight: 600, color: Number(m.delta) >= 0 ? 'var(--c-ok)' : 'var(--c-danger)' }}>{Number(m.delta) >= 0 ? '+' : '−'}{Math.abs(Number(m.delta))}</div>
                        {m.balance_after != null && <div style={{ color: 'var(--u-text-3)', fontSize: 12 }}>quedan {Number(m.balance_after)}</div>}
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </li>
          <li>
            <button type="button" className={s.opcion} data-tono="peligro" disabled={pendiente} onClick={onDejarDeContar}>
              <span>Dejar de contar</span>
            </button>
          </li>
        </ul>
        <p className={s.hojaResumen}>Cada ajuste queda en el historial con tu nombre y la hora.</p>
      </div>
    </HojaOperativa>
  );
}

/* ── Hoja «Contar existencias»: existencias iniciales y mínimo (E11) ── */

function HojaContar({ titulo, filasIniciales, pendiente, onClose, onConfirmar }: {
  titulo: string; filasIniciales: { id: string; name: string; stock: string; minimo: string }[]; pendiente: boolean;
  onClose: () => void; onConfirmar: (filas: { id: string; stock: string; minimo: string }[], onError: (e: string) => void) => void;
}) {
  const [filas, setFilas] = useState(filasIniciales);
  const [todosStock, setTodosStock] = useState('');
  const [todosMinimo, setTodosMinimo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const validas = filas.every((f) => /^\d+$/.test(f.stock) && /^\d+$/.test(f.minimo || '0'));
  const enCero = filas.filter((f) => f.stock === '0');
  const cambiar = (i: number, k: 'stock' | 'minimo', v: string) => setFilas((fs) => fs.map((x, j) => (j === i ? { ...x, [k]: v.replace(/\D/g, '') } : x)));

  return (
    <HojaOperativa
      label={`Contar existencias de ${titulo}`}
      title={`Contar existencias · ${titulo}`}
      className="hoja-inventario"
      resumen={<p className={s.hojaResumen}>{filas.length > 1 ? `Se empiezan a contar los ${filas.length} juntos o ninguno.` : 'Desde ahora cada venta descuenta una unidad.'}</p>}
      onClose={onClose}
      footer={(
        <Button type="button" size="action" className="w-full" disabled={!validas || pendiente}
          onClick={() => { setError(null); onConfirmar(filas, setError); }}>
          {pendiente ? 'Guardando…' : `Contar ${platillos(filas.length)}`}
        </Button>
      )}
    >
      <div className={s.hojaCuerpo}>
        {filas.length > 1 && (
          <div className={s.todos}>
            <label>Existencias para todos
              <input className="adm-field adm-field-auto tabular-nums" inputMode="numeric" value={todosStock} onChange={(e) => setTodosStock(e.target.value.replace(/\D/g, ''))} />
            </label>
            <label>Avisar al llegar a
              <input className="adm-field adm-field-auto tabular-nums" inputMode="numeric" value={todosMinimo} onChange={(e) => setTodosMinimo(e.target.value.replace(/\D/g, ''))} />
            </label>
            <Button type="button" size="touch" variant="secondary" disabled={!todosStock && !todosMinimo}
              onClick={() => setFilas((fs) => fs.map((f) => ({ ...f, stock: todosStock || f.stock, minimo: todosMinimo || f.minimo })))}>
              Aplicar a todos
            </Button>
          </div>
        )}
        <table className={s.tabla}>
          <thead><tr><th>Platillo</th><th className={s.n}>Hay</th><th className={s.n}>Avisar en</th></tr></thead>
          <tbody>
            {filas.map((f, i) => (
              <tr key={f.id}>
                <td>{f.name}</td>
                <td className={s.n}>
                  <input className="adm-field adm-field-auto tabular-nums" inputMode="numeric" aria-label={`Existencias de ${f.name}`} value={f.stock} placeholder="0"
                    onChange={(e) => cambiar(i, 'stock', e.target.value)} />
                </td>
                <td className={s.n}>
                  <input className="adm-field adm-field-auto tabular-nums" inputMode="numeric" aria-label={`Mínimo de ${f.name}`} value={f.minimo} placeholder="0"
                    onChange={(e) => cambiar(i, 'minimo', e.target.value)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {enCero.length > 0 && (
          <p className={s.hojaResumen}><b>{enCero.map((f) => f.name).join(', ')}</b> {enCero.length === 1 ? 'empieza' : 'empiezan'} en 0: {enCero.length === 1 ? 'queda agotado' : 'quedan agotados'} hasta reponer.</p>
        )}
        {!validas && <p className={s.hojaResumen}>Escribe cuántos hay de cada platillo (0 si no hay).</p>}
        {error && <p role="alert" className={s.error}>{error}</p>}
      </div>
    </HojaOperativa>
  );
}
