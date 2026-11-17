'use client';

/* ============================================================
   TURNO DE PRÁCTICA (ficha 2.5 de la auditoría, A05)
   ------------------------------------------------------------
   Quien entra es un mesero o cajero nuevo, en su primer día, con el
   teléfono del local. Quiere atender una mesa completa sin miedo a
   equivocarse. Antes aprendía con pedidos de verdad que luego había que
   anular con PIN y que ensuciaban ventas, caja y existencias.

   Aquí atiende una «Mesa P» con la carta real y las MISMAS piezas de
   Tomar pedidos (la carta, la hoja de opciones, la comanda, la hoja del
   plato y el cobro), pero todo vive en la memoria del aparato: la mesa
   no existe en el salón, la comanda no sale a cocina ni a la impresora,
   el cobro no toca la caja y anular no pide PIN. Al salir, se olvida.
   Lo único que se guarda es que la terminó, para Personal.

   Se separó del panel en vivo a propósito: engancharla ahí obligaba a
   esquivar en cada envío, cobro, anulación e impresión del módulo de
   servicio (2.000 líneas) que nada se escribiera. Un descuido ahí cobra
   de verdad. Aquí no hay a dónde escribir.
   ============================================================ */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '@/components/icons';
import PanelLink from '@/components/admin/panel-link';
import Carta from '@/components/admin/servicio/carta';
import Comanda from '@/components/admin/servicio/comanda';
import HojaOpciones from '@/components/admin/servicio/hoja-opciones';
import HojaCobro from '@/components/admin/servicio/hoja-cobro';
import { HojaLinea } from '@/components/admin/servicio/hojas';
import { ChipEstado, Hoja, HojaHead, Toast, type Aviso } from '@/components/admin/servicio/pieces';
import { lineDetail, money as fmtMoney, newLineId, type CartLine } from '@/components/admin/waiter/cart';
import { esPersonalizable } from '@/lib/servicio/carta';
import { resumirComanda, unidadDeCarrito, type LineaServicio } from '@/lib/servicio/comanda';
import { ESTADO_LABEL, type EstadoServicio } from '@/lib/servicio/estado';
import { minutosDePractica, pasoActual, platoSugerido, TOTAL_PASOS } from '@/lib/turno-practica';
import { registrarTurnoPractica } from '@/lib/actions/turno-practica';
import type { PanelCurrency } from '@/lib/money';
import type { Category, Product } from '@/types';
import s from './turno-practica.module.css';

type Hojas =
  | { k: 'mods'; product: Product; qty: number; line?: CartLine }
  | { k: 'linea'; linea: LineaServicio }
  | { k: 'anular'; linea: LineaServicio }
  | { k: 'cobrar' }
  | null;

export interface TurnoPracticaProps {
  restaurantId: string;
  products: Product[];
  categories: Category[];
  puestos: (string | null)[];
  alias: Record<string, string>;
  currency: PanelCurrency;
}

/** Misma regla que el panel: mismo plato, mismas opciones y nota → una línea. */
const firma = (l: CartLine) => JSON.stringify([
  l.productId, l.name, [...l.options.map((o) => o.choiceId)].sort(), l.note ?? '', l.price,
]);

export default function TurnoPractica({ restaurantId, products, categories, puestos, alias, currency }: TurnoPracticaProps) {
  const money = useCallback((n: number) => fmtMoney(n, currency), [currency]);
  const redondear = useCallback((n: number) => fmtMoney(n, currency, 0), [currency]);

  /* ── Lo que pasó en la Mesa P ─────────────────────────────── */
  const [abierta, setAbierta] = useState(false);
  const [carrito, setCarrito] = useState<CartLine[]>([]);
  const [enviadas, setEnviadas] = useState<LineaServicio[]>([]);
  const [listo, setListo] = useState(false);
  const [corregido, setCorregido] = useState(false);
  const [cobrado, setCobrado] = useState(false);
  const [desde, setDesde] = useState<number | null>(null);
  const [minutos, setMinutos] = useState(1);

  const [vista, setVista] = useState<'servicio' | 'cocina' | 'fin'>('servicio');
  const [pantalla, setPantalla] = useState<'sala' | 'carta' | 'ticket'>('sala');
  const [hoja, setHoja] = useState<Hojas>(null);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<string | null>(null);

  /* ── El módulo se mide a sí mismo, como Tomar pedidos ─────── */
  const raiz = useRef<HTMLDivElement | null>(null);
  const [ancho, setAncho] = useState(Infinity);
  const [conTeclado, setConTeclado] = useState(false);
  useEffect(() => {
    const el = raiz.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setAncho(e.contentRect.width));
    ro.observe(el);
    setConTeclado(window.matchMedia('(pointer: fine)').matches);
    return () => ro.disconnect();
  }, []);
  const movil = ancho <= 680;

  /* ── Carta ────────────────────────────────────────────────── */
  const vivos = useMemo(() => products.filter((p) => p.is_active), [products]);
  const sugerido = useMemo(() => platoSugerido(products, esPersonalizable), [products]);
  const hayExtras = sugerido != null;
  const favs = useMemo(() => {
    const porId = new Map(vivos.map((p) => [p.id, p]));
    return puestos.map((id) => (id ? porId.get(id) ?? null : null));
  }, [vivos, puestos]);

  /* ── Comanda ──────────────────────────────────────────────── */
  const lineas = useMemo<LineaServicio[]>(() => [
    ...carrito.map((l) => ({
      id: l.lineId, fase: 'nuevo' as const, productId: l.productId, nombre: l.name,
      unidad: unidadDeCarrito(l), cantidad: l.quantity, detalle: lineDetail({ ...l, note: undefined }),
      nota: l.note ?? '', carrito: l, pagada: false, libre: false,
    })),
    ...enviadas,
  ], [carrito, enviadas]);
  const resumen = useMemo(() => resumirComanda(lineas), [lineas]);

  const unidadesApuntadas = carrito.reduce((n, l) => n + l.quantity, 0);
  const paso = pasoActual({
    abierta,
    apuntado: unidadesApuntadas >= 2,
    conExtra: carrito.some((l) => l.options.length > 0),
    enviado: enviadas.length > 0,
    listo, corregido, cobrado,
  }, hayExtras);

  const textoPaso = [
    '',
    'Toca la Mesa P para abrirla',
    hayExtras
      ? `Agrega dos platillos, uno con un extra${sugerido ? ` (prueba con ${sugerido.name})` : ''}`
      : 'Agrega dos platillos de tu carta',
    'Envía el pedido a cocina',
    'Márcalo listo, como lo hará la cocina',
    'Corrige: toca un plato de la comanda y anúlalo',
    `Cobra ${money(resumen.porCobrar)} en efectivo`,
  ][paso] ?? '';

  const estadoMesa: EstadoServicio = !abierta ? 'libre'
    : enviadas.length === 0 ? (carrito.length ? 'borrador' : 'sentada')
      : listo ? 'listo' : 'cocina';

  /* ── Acciones ─────────────────────────────────────────────── */
  function abrirMesa() {
    if (!abierta) { setAbierta(true); setDesde(Date.now()); }
    if (movil) setPantalla(lineas.length > 0 ? 'ticket' : 'carta');
  }

  const empujar = useCallback((linea: CartLine) => {
    setCarrito((prev) => {
      const ya = prev.find((l) => firma(l) === firma(linea));
      return ya
        ? prev.map((l) => (l === ya ? { ...l, quantity: l.quantity + linea.quantity } : l))
        : [...prev, linea];
    });
    setAviso({ text: `${linea.quantity}× ${linea.name} · sin enviar` });
  }, []);

  const agregar = useCallback((p: Product, qty: number) => {
    if (!abierta) { setAviso({ text: 'Toca la Mesa P primero', bad: true }); return; }
    if (!p.is_available) { setAviso({ text: `${p.name} está agotado.`, bad: true }); return; }
    if (esPersonalizable(p)) { setHoja({ k: 'mods', product: p, qty }); return; }
    empujar({ lineId: newLineId(p.id), productId: p.id, name: p.name, price: p.price, quantity: qty, options: [] });
  }, [abierta, empujar]);

  const quitarUno = useCallback((p: Product) => {
    setCarrito((prev) => {
      const i = prev.map((l) => l.productId).lastIndexOf(p.id);
      if (i < 0) return prev;
      return prev.map((l, j) => (j === i ? { ...l, quantity: l.quantity - 1 } : l)).filter((l) => l.quantity > 0);
    });
  }, []);

  function pasoLinea(l: LineaServicio, delta: number) {
    setCarrito((prev) => prev
      .map((x) => (x.lineId === l.id ? { ...x, quantity: x.quantity + delta } : x))
      .filter((x) => x.quantity > 0));
  }

  function enviar() {
    if (carrito.length === 0) return;
    setEnviadas((prev) => [...prev, ...carrito.map((l) => ({
      id: `p-${l.lineId}`, fase: 'cocina' as const, productId: l.productId, nombre: l.name,
      unidad: unidadDeCarrito(l), cantidad: l.quantity, detalle: lineDetail({ ...l, note: undefined }),
      nota: l.note ?? '', orderId: 'practica', estadoPedido: 'PREP' as const, pagada: false, libre: false,
    }))]);
    setCarrito([]);
    setVista('cocina');
  }

  function marcarListo() {
    setEnviadas((prev) => prev.map((l) => ({ ...l, fase: 'servido' as const, estadoPedido: 'SERVED' as const })));
    setListo(true);
    setVista('servicio');
    if (movil) setPantalla('ticket');
    setAviso({ text: 'Listo y en la mesa. En tu turno, al llevarlo tocas «Servido».' });
  }

  function servir(l: LineaServicio, fase: 'cocina' | 'servido') {
    setEnviadas((prev) => prev.map((x) => (x.id === l.id ? { ...x, fase } : x)));
    setHoja(null);
  }

  function anular(l: LineaServicio) {
    const quedan = resumen.platos - 1;
    if (quedan < 1) {
      setAviso({ text: 'Deja al menos un plato para practicar el cobro.', bad: true });
      setHoja(null);
      return;
    }
    setEnviadas((prev) => prev
      .map((x) => (x.id === l.id ? { ...x, cantidad: x.cantidad - 1 } : x))
      .filter((x) => x.cantidad > 0));
    setCorregido(true);
    setHoja(null);
    setAviso({ text: `Anulaste 1× ${l.nombre}. Ya no se cobra.` });
  }

  function cobrar() {
    const min = minutosDePractica(desde ?? Date.now(), Date.now());
    setMinutos(min);
    setCobrado(true);
    setHoja(null);
    setVista('fin');
    void registrarTurnoPractica(restaurantId, min);
  }

  function repetir() {
    setAbierta(false); setCarrito([]); setEnviadas([]); setListo(false);
    setCorregido(false); setCobrado(false); setDesde(null);
    setVista('servicio'); setPantalla('sala'); setQ(''); setCat(null);
  }

  /* ── Lo que se dibuja ─────────────────────────────────────── */
  if (vivos.length === 0) {
    return (
      <div className="sv" ref={raiz}>
        <div className={s.vacio}>
          <h1>Primero, tu carta</h1>
          <p>La práctica usa tus platillos de verdad. Agrega al menos uno y vuelve.</p>
          <PanelLink href="/admin/menu" className="sv-cta">Ir al menú</PanelLink>
        </div>
      </div>
    );
  }

  const cartaProps = {
    products, categories, favs, alias, q, setQ, cat, setCat,
    qtyOf: (id: string) => carrito.filter((l) => l.productId === id).reduce((n, l) => n + l.quantity, 0),
    onTurno: () => setAviso({ text: 'Los favoritos se preparan desde Tomar pedidos.' }),
    onAdd: agregar,
    onOpts: (p: Product, qty: number) => { if (abierta) setHoja({ k: 'mods', product: p, qty }); else agregar(p, qty); },
    onRemove: quitarUno,
    onOpenItem: () => setAviso({ text: 'En la práctica, usa platos de tu carta.' }),
    onVoz: () => {},
    conTeclado, aprendiz: false, hayVoz: false, money,
  };

  const comanda = (
    <Comanda
      resumen={resumen} money={money} pendientes={null}
      onAceptarQr={() => {}} onRechazarQr={() => {}} atencion={null} onAtender={() => {}}
      onStep={pasoLinea}
      onEditar={(l) => {
        const p = products.find((x) => x.id === l.productId);
        if (p && l.carrito) setHoja({ k: 'mods', product: p, qty: l.cantidad, line: l.carrito });
      }}
      onServir={(l) => servir(l, 'servido')}
      onLinea={(l) => setHoja({ k: 'linea', linea: l })}
      aprendiz={false} ocupado={false}
    />
  );

  const botonCobrar = paso === 6 && (
    <button type="button" className={movil ? 'sv-cta sv-m-cta' : 'sv-cta'} data-tone="ok" onClick={() => setHoja({ k: 'cobrar' })}>
      Cobrar {money(resumen.porCobrar)}
    </button>
  );
  /* En el paso 2 todavía no: con un solo plato enviado, el paso de
     corregir no tendría qué anular sin dejar la mesa vacía. */
  const botonEnviar = resumen.nNuevas > 0 && paso !== 2 && (
    <button type="button" className={movil ? 'sv-cta sv-m-cta' : 'sv-cta'} onClick={enviar}>
      Enviar a cocina · {resumen.nNuevas}
    </button>
  );

  const mesaP = movil ? (
    <div className="sv-grid">
      <button type="button" className="sv-card" data-st={estadoMesa} data-on={abierta ? '1' : '0'}
        aria-label={`Mesa P, de práctica · ${estadoMesa === 'libre' ? 'Libre' : 'Abierta'}`} onClick={abrirMesa}>
        <span className="sv-card-top">
          <span className="sv-card-n">P</span>
          <ChipEstado estado={estadoMesa} big />
        </span>
        <span style={{ display: 'block', textAlign: 'left' }}>
          <span className="sv-card-name">Mesa de práctica</span>
          <span className="sv-card-sub">{resumen.platos ? `${resumen.platos} platos` : 'Nada cuenta'}</span>
        </span>
        {resumen.total > 0 && <span className="sv-card-total">{redondear(resumen.total)}</span>}
      </button>
    </div>
  ) : (
    <button type="button" className="sv-mesa" data-st={estadoMesa} data-on={abierta ? '1' : '0'}
      aria-pressed={abierta} onClick={abrirMesa}>
      <span className="sv-mesa-n">P</span>
      <span className="sv-mesa-id">
        <span className="sv-mesa-row">
          <span className="sv-mesa-title">Mesa de práctica</span>
        </span>
        <span className="sv-mesa-row">
          <span className="sv-mesa-sub">
            {resumen.platos ? `${ESTADO_LABEL[estadoMesa]} · ${resumen.platos} platos` : 'Nada cuenta'}
          </span>
          {resumen.total > 0 && <span className="sv-mesa-total">{redondear(resumen.total)}</span>}
        </span>
      </span>
    </button>
  );

  const pie = (
    <>
      <div className="sv-foot-row">
        <span className="sv-foot-label">Total</span>
        <span className="sv-foot-total">{money(resumen.total)}</span>
      </div>
      {botonEnviar}
      {botonCobrar}
      {movil && (
        <div className="sv-mesa-acciones">
          <button type="button" className="sv-cta" data-tone="quiet" onClick={() => setPantalla('carta')}>
            <Icon name="plus" size={17} aria-hidden /> Agregar platos
          </button>
        </div>
      )}
    </>
  );

  return (
    <div className="sv" ref={raiz}>
      <div className="sv-frame">
        {vista !== 'fin' && (
          <div className={s.barra}>
            <div className={s.barraFila}>
              <span className={s.marca}>Práctica</span>
              <p className={s.texto} role="status" aria-live="polite">
                <span className={s.paso}>Paso {paso} de {TOTAL_PASOS}</span>
                <span aria-hidden> · </span>
                {vista === 'cocina' ? 'Márcalo listo, como lo hará la cocina' : textoPaso}
              </p>
              <PanelLink href="/admin/mesero" className={s.salir}>
                {movil ? 'Salir' : 'Salir de la práctica'}
              </PanelLink>
            </div>
            <div className={s.progreso} aria-hidden>
              {Array.from({ length: TOTAL_PASOS }, (_, i) => (
                <span key={i} data-on={i + 1 < paso ? 'hecho' : i + 1 === paso ? 'ahora' : undefined} />
              ))}
            </div>
          </div>
        )}

        {vista === 'fin' ? (
          <Fin minutos={minutos} conExtra={hayExtras} onRepetir={repetir} />
        ) : vista === 'cocina' ? (
          <div className={s.cocina}>
            <div className={s.cocinaHead}>
              <h1>Cocina</h1>
              <p>Así le llega el pedido a quien cocina. En tu turno, lo marca la cocina desde su pantalla; la comanda de práctica no se imprime.</p>
            </div>
            <article className={s.ticket} aria-label="Comanda de la Mesa P">
              <header>
                <strong>Mesa P</strong>
                <span className={s.chipPractica}>Práctica</span>
              </header>
              <ul>
                {enviadas.map((l) => (
                  <li key={l.id}>
                    <span className={s.cant}>{l.cantidad}×</span>
                    <span>
                      <b>{l.nombre}</b>
                      {l.detalle && <small>{l.detalle}</small>}
                      {l.nota && <small>Nota · {l.nota}</small>}
                    </span>
                  </li>
                ))}
              </ul>
              <button type="button" className="sv-cta" data-tone="ok" onClick={marcarListo}>
                <Icon name="check" size={18} aria-hidden /> Listo
              </button>
            </article>
          </div>
        ) : (
          <div className="sv-body">
            {/* ══ SALÓN ══ */}
            {(!movil || pantalla === 'sala') && (
              <div className={movil ? 'sv-pane' : 'sv-rail'}>
                <div className="sv-rail-head" data-movil={movil ? '1' : undefined}>
                  <h1 className="sv-rail-title">Salón</h1>
                  <div className="sv-rail-sub">Tus mesas reales no se tocan: la práctica pasa solo en este aparato.</div>
                </div>
                <div className={`sv-vs ${movil ? '' : 'sv-rail-list'}`} style={movil ? { padding: '0 16px 16px' } : undefined}>
                  {mesaP}
                </div>
              </div>
            )}

            {/* ══ CARTA ══ */}
            {(!movil || pantalla === 'carta') && (
              <div className="sv-carta">
                {movil && (
                  <div className="sv-m-head">
                    <button type="button" className="sv-m-back" aria-label={lineas.length ? 'Volver a la comanda' : 'Volver al salón'}
                      onClick={() => setPantalla(lineas.length ? 'ticket' : 'sala')}>
                      <Icon name="chevronLeft" size={20} />
                    </button>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="sv-m-title">Mesa P</div>
                      <div className="sv-m-sub">De práctica · nada cuenta</div>
                    </div>
                  </div>
                )}
                <Carta {...cartaProps} />
                {movil && lineas.length > 0 && (
                  <div className="sv-m-foot">
                    <button type="button" className="sv-m-resumen" onClick={() => setPantalla('ticket')}>
                      <span className="sv-m-resumen-label">
                        <span>Ver comanda</span>
                        <small>{`${resumen.nNuevas} por enviar · ${money(resumen.totalNuevo)}`}</small>
                      </span>
                      <span className="sv-m-resumen-total">{money(resumen.total)}</span>
                    </button>
                    {botonEnviar}
                    {botonCobrar}
                  </div>
                )}
              </div>
            )}

            {/* ══ COMANDA ══ */}
            {(!movil || pantalla === 'ticket') && (
              <div className={movil ? 'sv-pane' : 'sv-ticket'}>
                {!abierta ? (
                  <div className="sv-empty">
                    <div className="sv-empty-ico"><Icon name="list" size={24} /></div>
                    <div className="sv-empty-title">Toca la Mesa P para empezar</div>
                    <div className="sv-empty-text">Su comanda aparece aquí, igual que en un turno de verdad.</div>
                  </div>
                ) : (
                  <>
                    {movil ? (
                      <div className="sv-m-head">
                        <button type="button" className="sv-m-back" aria-label="Volver al salón" onClick={() => setPantalla('sala')}>
                          <Icon name="chevronLeft" size={20} />
                        </button>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className="sv-m-title">Pedido · Mesa P</div>
                          <div className="sv-m-sub">De práctica · nada cuenta</div>
                        </div>
                      </div>
                    ) : (
                      <div className="sv-ticket-head">
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className="sv-ticket-title">Mesa P</div>
                          <div className="sv-ticket-sub">De práctica · nada cuenta</div>
                        </div>
                        <ChipEstado estado={estadoMesa} />
                      </div>
                    )}
                    <section className="sv-vs" aria-label="Comanda de la Mesa P">{comanda}</section>
                    <div className="sv-foot">{pie}</div>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ══ HOJAS ══ (fuera del armazón, como en Tomar pedidos) */}
      {hoja?.k === 'mods' && (
        <HojaOpciones
          product={hoja.product}
          currency={currency}
          initialLine={hoja.line}
          initialQty={hoja.qty}
          onAdd={(linea) => { empujar(linea); setHoja(null); }}
          onSave={(lineId, linea) => {
            setCarrito((prev) => prev.map((l) => (l.lineId === lineId ? { ...linea, lineId } : l)));
            setHoja(null);
          }}
          onClose={() => setHoja(null)}
        />
      )}

      {hoja?.k === 'linea' && (
        <HojaLinea
          linea={hoja.linea}
          money={money}
          onClose={() => setHoja(null)}
          onServir={() => servir(hoja.linea, 'servido')}
          onDeshacerServir={() => servir(hoja.linea, 'cocina')}
          onAnular={() => setHoja({ k: 'anular', linea: hoja.linea })}
        />
      )}

      {hoja?.k === 'anular' && (
        <HojaAnular linea={hoja.linea} onClose={() => setHoja(null)} onAnular={() => anular(hoja.linea)} />
      )}

      {hoja?.k === 'cobrar' && (
        <HojaCobro
          titulo="Mesa P"
          resumen={resumen}
          desglose={null}
          porCobrar={resumen.porCobrar}
          yaCobrado={0}
          saldosPlatos={null}
          contexto={null}
          money={money}
          redondear={redondear}
          busy={false}
          onClose={() => setHoja(null)}
          onCobrarTodo={cobrar}
          onCobrarParte={() => {}}
          onAbonar={() => {}}
          onGuardarPartes={() => {}}
          mantieneMesa={false}
          nota="Cobro de práctica: no entra dinero a la caja."
        />
      )}

      {aviso && <Toast aviso={aviso} onClose={() => setAviso(null)} />}
    </div>
  );
}

/* ── Anular, sin PIN ─────────────────────────────────────────
   La anulación de verdad pide motivo y, a veces, el PIN de un encargado.
   En la práctica se pide el motivo, igual que siempre, y se dice que el
   PIN llegará en el turno real. */
function HojaAnular({ linea, onClose, onAnular }: { linea: LineaServicio; onClose: () => void; onAnular: () => void }) {
  const [motivo, setMotivo] = useState('');
  const sugerencias = ['El cliente cambió de opinión', 'Me equivoqué de plato'];
  return (
    <Hoja onClose={onClose} label={`Anular ${linea.nombre}`}>
      <div className="sv-sheet-pad">
        <HojaHead title={`Anular 1× ${linea.nombre}`} sub="Deja de cobrarse." onClose={onClose} />
        <label className={s.campo}>
          <span>Motivo</span>
          <input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="¿Por qué se anula?" />
        </label>
        <div className={s.sugerencias}>
          {sugerencias.map((t) => (
            <button key={t} type="button" className="sv-choice" data-on={motivo === t ? '1' : '0'} onClick={() => setMotivo(t)}>{t}</button>
          ))}
        </div>
        <p className="sv-foot-note">En la práctica no se pide el PIN del encargado ni queda escrito. En un turno real, sí.</p>
        <button type="button" className="sv-cta" data-tone="danger" disabled={!motivo.trim()} onClick={onAnular}>
          Anular el plato
        </button>
      </div>
    </Hoja>
  );
}

function Fin({ minutos, conExtra, onRepetir }: { minutos: number; conExtra: boolean; onRepetir: () => void }) {
  const hechos = [
    'Abriste una mesa',
    conExtra ? 'Pediste con un extra' : 'Pediste dos platillos',
    'Mandaste a cocina y quedó listo',
    'Corregiste un plato',
    'Cobraste y diste vuelto',
  ];
  return (
    <div className={s.fin}>
      <div className={s.finIco} aria-hidden><Icon name="check" size={28} /></div>
      <h1>¡Turno de práctica completo!</h1>
      <p className={s.finSub}>Lo hiciste en {minutos} {minutos === 1 ? 'minuto' : 'minutos'}.</p>
      <ul className={s.hechos}>
        {hechos.map((h) => (
          <li key={h}><Icon name="check" size={16} aria-hidden /> {h}</li>
        ))}
      </ul>
      <p className="sv-foot-note">La Mesa P y sus pedidos ya se borraron. Nada contó en ventas, caja ni existencias.</p>
      <div className={s.finAcciones}>
        <PanelLink href="/admin/mesero" className="sv-cta">Empezar el servicio</PanelLink>
        <button type="button" className="sv-cta" data-tone="quiet" onClick={onRepetir}>Repetir la práctica</button>
      </div>
    </div>
  );
}
