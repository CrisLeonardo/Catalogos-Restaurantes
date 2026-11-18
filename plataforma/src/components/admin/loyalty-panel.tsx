'use client';

/* Lealtad. Línea N «nada saturado» (maqueta aprobada el 2026-11-18:
   docs/diseno/MAQUETA_PROMOCIONES_NADA_SATURADO_2026-11-18.html).

   Arriba, el programa en una frase y cuánto hay que gastar para el premio
   más barato; «Reglas» abre las tasas, el doble del primer pedido y la
   sorpresa con un solo «Guardar». Debajo, Miembros y Recompensas: cada
   fila abre su hoja. El ajuste a mano de puntos pide siempre el motivo. */

import { useId, useMemo, useState, useTransition } from 'react';
import { Tabs } from '@base-ui/react/tabs';
import { Icon } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { EmptyState } from '@/components/ui/empty-state';
import { HojaOperativa } from '@/components/ui/hoja-operativa';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useToastManager } from '@/components/ui/toast';
import {
  saveLoyaltySettings, adjustPoints, saveReward, deleteReward, toggleReward, saveLealtadExtras, movimientosDePuntos,
  type RewardPatch, type MovimientoPuntos,
} from '@/lib/actions/loyalty';
import type { AjustesExtraLealtad, LoyaltySettings, LoyaltyAccount, LoyaltySummary, RewardRow } from '@/lib/db/loyalty';
import { fmtMoney } from '@/lib/money';
import s from './fidelidad.module.css';

interface RewardProduct { id: string; name: string; price: number; image_url: string | null; cost: number | null }
type Cliente = { id: string; name: string; phone: string };

interface Props {
  restaurantId: string;
  settings: LoyaltySettings;
  accounts: LoyaltyAccount[];
  customers: Cliente[];
  summary: LoyaltySummary;
  hasSettings: boolean;
  rewards: RewardRow[];
  products: RewardProduct[];
  extras: AjustesExtraLealtad;
}

type Vista = 'miembros' | 'recompensas';

const num = (n: number) => n.toLocaleString('es-GT');
const q = (n: number) => fmtMoney(n, 'GTQ', Number.isInteger(n) ? 0 : 2);
const pts = (n: number) => `${num(n)} ${n === 1 ? 'punto' : 'puntos'}`;

/** Lo que tiene que gastar un cliente para juntar `puntos`, con las tasas dadas. */
function gastoPara(puntos: number, tasa: number, monto: number): number | null {
  if (!(tasa > 0) || !(monto > 0)) return null;
  return Math.ceil((puntos * monto) / tasa);
}

export default function LoyaltyPanel({ restaurantId, settings, accounts, customers, summary, hasSettings, rewards, products, extras }: Props) {
  const { add: toast } = useToastManager();
  const { confirm, dialog } = useConfirm();
  const [vista, setVista] = useState<Vista>('miembros');
  const [verReglas, setVerReglas] = useState(false);
  const [ajuste, setAjuste] = useState<{ cuenta: LoyaltyAccount | null } | null>(null);
  const [premio, setPremio] = useState<RewardRow | 'nuevo' | null>(null);
  const [buscar, setBuscar] = useState('');

  const hecho = (t: string) => toast({ title: t, type: 'success' });
  const activas = rewards.filter((r) => r.active);
  const masBarata = [...activas].sort((a, b) => a.points_cost - b.points_cost)[0];
  const gasto = masBarata ? gastoPara(masBarata.points_cost, settings.earn_rate, settings.earn_amount) : null;

  const miembros = useMemo(() => {
    const t = buscar.trim().toLowerCase();
    if (!t) return accounts;
    return accounts.filter((a) => (a.customer_name ?? '').toLowerCase().includes(t) || (a.customer_phone ?? '').includes(t));
  }, [accounts, buscar]);

  async function borrarPremio(r: RewardRow) {
    setPremio(null);
    if (!(await confirm({ title: `¿Borrar «${r.title}»?`, description: 'Tus clientes ya no la verán en la carta. No se puede deshacer.', confirmLabel: 'Borrar' }))) return;
    let res: { error?: string } = {};
    try { res = await deleteReward(restaurantId, r.id); } catch { res = { error: 'sin conexión' }; }
    if (res.error) toast({ title: `No se pudo borrar «${r.title}». Sigue en la lista; inténtalo de nuevo.`, type: 'error' });
    else hecho(`«${r.title}» borrada`);
  }

  const frase = `${pts(Number(settings.earn_rate))} por cada ${q(Number(settings.earn_amount))}`
    + (settings.signup_bonus > 0 ? ` · ${num(settings.signup_bonus)} de bienvenida` : '');

  /* Sin programa guardado, la pantalla es una sola tarjeta: los valores de
     muestra también hay que guardarlos para empezar a dar puntos. */
  if (!hasSettings) {
    return (
      <div className={s.panel}>
        <section className={`${s.tarjeta} ${s.programaNuevo}`}>
          <h2>Tu programa de puntos todavía no está activo</h2>
          <p>Con las tasas de muestra, tus clientes ganan <b>{frase}</b> y los canjean por los premios que tú elijas.</p>
          <Button type="button" size="touch" className="self-start" onClick={() => setVerReglas(true)}>Revisar y activar</Button>
        </section>
        {verReglas && (
          <HojaReglas restaurantId={restaurantId} settings={settings} extras={extras} nuevo
            onClose={() => setVerReglas(false)} onHecho={(t) => { setVerReglas(false); hecho(t); }} />
        )}
      </div>
    );
  }

  return (
    <div className={s.panel}>
      {dialog}
      <section className={`${s.tarjeta} ${s.programa}`} aria-label="Tu programa de puntos">
        <div>
          {frase}
          <span>
            {settings.earn_rate <= 0 ? 'Con esta tasa nadie gana puntos.'
              : masBarata && gasto != null ? `Para ${masBarata.title} (${num(masBarata.points_cost)} pts) se gastan ${q(gasto)}`
              : 'Todavía no ofreces premios para canjear.'}
          </span>
        </div>
        <Button type="button" variant="outline" size="touch" onClick={() => setVerReglas(true)}>Reglas</Button>
      </section>

      <div className={s.mandos}>
        <Tabs.Root value={vista} onValueChange={(v) => setVista(v as Vista)} className={s.pestanasRaiz}>
          <Tabs.List className={s.pestanas} aria-label="Lealtad">
            <Tabs.Tab value="miembros" className={s.pestana}>Miembros{summary.members > 0 && <em>{num(summary.members)}</em>}</Tabs.Tab>
            <Tabs.Tab value="recompensas" className={s.pestana}>Recompensas{rewards.length > 0 && <em>{rewards.length}</em>}</Tabs.Tab>
          </Tabs.List>
        </Tabs.Root>
      </div>

      {vista === 'miembros' && (
        <>
          {accounts.length > 0 && (
            <div className={s.mandos}>
              <input type="search" className={`adm-field ${s.buscar}`} placeholder="Buscar cliente" aria-label="Buscar cliente por nombre o teléfono"
                value={buscar} onChange={(e) => setBuscar(e.target.value)} />
              <button type="button" className={s.cuadrado} aria-label="Sumar o restar puntos a un cliente" title="Sumar o restar puntos a un cliente"
                onClick={() => setAjuste({ cuenta: null })}>
                <Icon name="plus" size={18} />
              </button>
            </div>
          )}
          {accounts.length === 0 ? (
            <EmptyState
              icon="gift"
              title="Todavía nadie tiene puntos"
              desc="Se suman cuando un cliente que pidió con su cuenta de Google recibe su pedido."
              action={{ label: 'Sumar puntos a un cliente', onClick: () => setAjuste({ cuenta: null }) }}
            />
          ) : miembros.length === 0 ? (
            <p className={`${s.tarjeta} ${s.vacio}`}>Nadie coincide con «{buscar}».</p>
          ) : (
            <ul className={`${s.tarjeta} ${s.lista}`}>
              {miembros.map((a) => (
                <li key={a.id}>
                  <button type="button" className={s.abrir} onClick={() => setAjuste({ cuenta: a })}>
                    <span className={s.filaTexto}>
                      <b>{a.customer_name || 'Cliente sin nombre'}</b>
                      <span>{[a.customer_phone, a.lifetime_points > a.points_balance ? `ganó ${num(a.lifetime_points)} en total` : null].filter(Boolean).join(' · ') || 'Sin teléfono'}</span>
                    </span>
                    <span className={s.puntos}>{num(a.points_balance)}<small>pts</small></span>
                    <Icon name="chevronRight" size={16} className={s.chevron} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {vista === 'recompensas' && (
        rewards.length === 0 ? (
          <EmptyState
            icon="gift"
            title="Todavía no ofreces premios"
            desc="Un premio es un platillo que tus clientes canjean con sus puntos."
            action={{ label: 'Crear el primero', onClick: () => setPremio('nuevo') }}
          />
        ) : (
          <>
            <div className={s.mandos}>
              <p className={s.linea}>
                {settings.rewards_enabled ? 'Tus clientes las ven en la carta.' : 'El catálogo está apagado en Reglas: tus clientes no lo ven.'}
              </p>
              <button type="button" className={s.anotar} onClick={() => setPremio('nuevo')}><Icon name="plus" size={18} /> Nueva</button>
            </div>
            <ul className={`${s.tarjeta} ${s.lista}`}>
              {rewards.map((r) => {
                const g = gastoPara(r.points_cost, settings.earn_rate, settings.earn_amount);
                const meta = [
                  r.active ? null : 'Oculta',
                  g != null ? `se gastan ${q(g)}` : null,
                  r.per_customer_limit != null ? `${r.per_customer_limit} por cliente` : null,
                  r.stock != null ? `quedan ${r.stock}` : null,
                ].filter(Boolean).join(' · ');
                return (
                  <li key={r.id} className={r.active ? undefined : s.apagada}>
                    <button type="button" className={s.abrir} onClick={() => setPremio(r)}>
                      <span className={s.filaTexto}><b>{r.title}</b>{meta && <span>{meta}</span>}</span>
                      <span className={s.puntos}>{num(r.points_cost)}<small>pts</small></span>
                      <Icon name="chevronRight" size={16} className={s.chevron} />
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )
      )}

      {verReglas && (
        <HojaReglas restaurantId={restaurantId} settings={settings} extras={extras}
          onClose={() => setVerReglas(false)} onHecho={(t) => { setVerReglas(false); hecho(t); }} />
      )}
      {ajuste && (
        <HojaAjuste restaurantId={restaurantId} cuenta={ajuste.cuenta} accounts={accounts} customers={customers}
          onClose={() => setAjuste(null)} onHecho={(t) => { setAjuste(null); hecho(t); }} />
      )}
      {premio && (
        <HojaPremio restaurantId={restaurantId} premio={premio === 'nuevo' ? null : premio} products={products} settings={settings}
          onClose={() => setPremio(null)} onHecho={(t) => { setPremio(null); hecho(t); }}
          onBorrar={premio === 'nuevo' ? undefined : () => borrarPremio(premio)} />
      )}
    </div>
  );
}

/* ── Reglas del programa: tasas, premios en la carta, doble y sorpresa ── */
function HojaReglas({ restaurantId, settings, extras, nuevo, onClose, onHecho }: {
  restaurantId: string; settings: LoyaltySettings; extras: AjustesExtraLealtad; nuevo?: boolean;
  onClose: () => void; onHecho: (t: string) => void;
}) {
  const [tasa, setTasa] = useState(String(settings.earn_rate));
  const [monto, setMonto] = useState(String(settings.earn_amount));
  const [bienvenida, setBienvenida] = useState(String(settings.signup_bonus));
  const [enCarta, setEnCarta] = useState(settings.rewards_enabled);
  const [doble, setDoble] = useState(extras.primerPedidoDoble);
  const [sorpresa, setSorpresa] = useState(!!extras.sorpresaTexto);
  const [sorpresaTexto, setSorpresaTexto] = useState(extras.sorpresaTexto ?? '');
  const [sorpresaCada, setSorpresaCada] = useState(String(extras.sorpresaCada ?? 20));
  const [error, setError] = useState<string | null>(null);
  const [pendiente, start] = useTransition();

  const t = parseFloat(tasa);
  const m = parseFloat(monto);
  const valido = t >= 0 && m > 0 && (!sorpresa || (sorpresaTexto.trim() !== '' && parseInt(sorpresaCada, 10) >= 2));

  function guardar() {
    setError(null);
    start(async () => {
      const r1 = await saveLoyaltySettings(restaurantId, {
        earn_rate: t, earn_amount: m, min_redeem: settings.min_redeem,
        signup_bonus: parseInt(bienvenida, 10) || 0, rewards_enabled: enCarta,
      });
      if (r1.error) { setError(r1.error); return; }
      const r2 = await saveLealtadExtras(restaurantId, {
        primer_pedido_doble: doble,
        sorpresa_texto: sorpresa ? sorpresaTexto : null,
        sorpresa_cada: sorpresa ? parseInt(sorpresaCada, 10) || null : null,
      });
      if (r2.error) { setError(`Las tasas se guardaron, pero el resto no: ${r2.error}`); return; }
      onHecho(nuevo ? 'Programa de puntos activo' : 'Reglas guardadas');
    });
  }

  return (
    <HojaOperativa
      label="Reglas del programa de puntos"
      title="Reglas del programa"
      className="hoja-fidelidad"
      onClose={onClose}
      footer={(
        <Button type="button" size="action" className="w-full" disabled={!valido || pendiente} onClick={guardar}>
          {pendiente ? 'Guardando…' : nuevo ? 'Activar el programa' : 'Guardar'}
        </Button>
      )}
    >
      <div className={s.hojaCuerpo}>
        <div className={s.dos}>
          <label className={s.campo}>Puntos que gana
            <input className="adm-field tabular-nums" inputMode="decimal" value={tasa} onChange={(e) => setTasa(e.target.value.replace(/[^\d.]/g, ''))} />
          </label>
          <label className={s.campo}>Por cada (Q)
            <input className="adm-field tabular-nums" inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value.replace(/[^\d.]/g, ''))} />
          </label>
        </div>
        <label className={s.campo}><span>Puntos de bienvenida <small>· al pedir por primera vez con su cuenta</small></span>
          <input className="adm-field tabular-nums" inputMode="numeric" value={bienvenida} onChange={(e) => setBienvenida(e.target.value.replace(/\D/g, ''))} />
        </label>
        <p className={s.hojaResumen}>
          Los puntos se suman cuando el pedido se marca entregado. Un platillo puede tener sus propios puntos en su ficha del menú.
        </p>

        <label className={s.interruptor}>
          <Switch checked={enCarta} onCheckedChange={setEnCarta} />
          <span><b>Mostrar los premios en la carta.</b> Tus clientes ven qué pueden canjear con sus puntos.</span>
        </label>
        <label className={s.interruptor}>
          <Switch checked={doble} onCheckedChange={setDoble} />
          <span><b>Doble de puntos en el primer pedido</b> que un cliente hace desde su celular, con su cuenta.</span>
        </label>
        <label className={s.interruptor}>
          <Switch checked={sorpresa} onCheckedChange={setSorpresa} />
          <span><b>Sorpresa de la casa.</b> De vez en cuando, al azar, un pedido se lleva un regalo. Tú decides cuál; no se descuenta solo.</span>
        </label>
        {sorpresa && (
          <div className={s.dos}>
            <label className={s.campo}>La sorpresa
              <input className="adm-field" maxLength={80} placeholder="Hoy el postre va por la casa" value={sorpresaTexto} onChange={(e) => setSorpresaTexto(e.target.value)} />
            </label>
            <label className={s.campo}>Sale en 1 de cada…
              <input className="adm-field tabular-nums" inputMode="numeric" value={sorpresaCada} onChange={(e) => setSorpresaCada(e.target.value.replace(/\D/g, ''))} />
            </label>
          </div>
        )}
        <details className={s.privacidad}>
          <summary>¿Quién acumula puntos?</summary>
          <p>
            Solo quien pide con su cuenta de Google. Los pedidos sin sesión quedan como pedido normal, pero no suman puntos
            ni reciben los de bienvenida. Si esa persona inicia sesión después, sus pedidos anteriores no ganan puntos:
            puedes sumárselos a mano en Miembros.
          </p>
        </details>
        {error && <p role="alert" className={s.error}>{error}</p>}
      </div>
    </HojaOperativa>
  );
}

/* ── Sumar o restar puntos, siempre con motivo ──────────────────── */
const MOTIVOS = {
  sumar: ['Pedido sin sesión', 'Cortesía', 'Corrección', 'Otro'],
  restar: ['Canje en caja', 'Corrección', 'Otro'],
} as const;

function HojaAjuste({ restaurantId, cuenta, accounts, customers, onClose, onHecho }: {
  restaurantId: string; cuenta: LoyaltyAccount | null; accounts: LoyaltyAccount[]; customers: Cliente[];
  onClose: () => void; onHecho: (t: string) => void;
}) {
  const [clienteId, setClienteId] = useState(cuenta?.customer_id ?? '');
  const [modo, setModo] = useState<'sumar' | 'restar'>('sumar');
  const [cantidad, setCantidad] = useState('');
  const [motivo, setMotivo] = useState<string | null>(null);
  const [nota, setNota] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [movs, setMovs] = useState<MovimientoPuntos[] | null>(null);
  const [verMovs, setVerMovs] = useState(false);
  const [pendiente, start] = useTransition();

  const actual = cuenta ?? accounts.find((a) => a.customer_id === clienteId) ?? null;
  const cliente = customers.find((c) => c.id === clienteId);
  const nombre = actual?.customer_name || cliente?.name || 'Cliente';
  const saldo = actual?.points_balance ?? 0;
  const n = parseInt(cantidad, 10);
  const quedaria = modo === 'sumar' ? saldo + (n || 0) : saldo - (n || 0);
  const valido = !!clienteId && n > 0 && quedaria >= 0 && !!motivo && (motivo !== 'Otro' || nota.trim() !== '');

  function cambiarModo(m: 'sumar' | 'restar') { setModo(m); setMotivo(null); setError(null); }

  function guardar() {
    if (!valido || !motivo) return;
    setError(null);
    const texto = motivo === 'Otro' ? nota.trim() : nota.trim() ? `${motivo}: ${nota.trim()}` : motivo;
    start(async () => {
      const r = await adjustPoints(restaurantId, clienteId, n, modo === 'sumar' ? 'ADJUST' : 'REDEEM', texto);
      if (r.error) { setError(r.error); return; }
      onHecho(`${nombre}: ${num(r.balance ?? quedaria)} pts`);
    });
  }

  function abrirMovimientos() {
    setVerMovs((v) => !v);
    if (movs === null && actual) {
      start(async () => {
        const r = await movimientosDePuntos(restaurantId, actual.customer_id);
        if (r.error) { setError(r.error); setMovs([]); return; }
        setMovs(r.movimientos ?? []);
      });
    }
  }

  const fecha = (iso: string) => new Date(iso).toLocaleString('es-GT', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

  return (
    <HojaOperativa
      label={cuenta ? `Puntos de ${nombre}` : 'Sumar o restar puntos'}
      title={cuenta ? nombre : 'Sumar o restar puntos'}
      className="hoja-fidelidad"
      resumen={actual ? <p className={s.hojaResumen}>Tiene <b>{num(saldo)} pts</b>{actual.lifetime_points > saldo ? ` · ganó ${num(actual.lifetime_points)} en total` : ''}</p> : undefined}
      onClose={onClose}
      footer={(
        <Button type="button" size="action" className="w-full" disabled={!valido || pendiente} onClick={guardar}>
          {pendiente ? 'Guardando…' : `${modo === 'sumar' ? 'Sumar' : 'Restar'} ${n > 0 ? pts(n) : 'puntos'}`}
        </Button>
      )}
    >
      <div className={s.hojaCuerpo}>
        {!cuenta && (
          <Elegir
            etiqueta="Cliente"
            buscarTexto="Buscar por nombre o teléfono"
            opciones={customers.map((c) => ({ id: c.id, texto: c.name, detalle: c.phone }))}
            valor={clienteId}
            onCambio={(v) => { setClienteId(v); setMovs(null); setModo('sumar'); setMotivo(null); }}
          />
        )}
        <div className={s.modos} role="group" aria-label="Sumar o restar">
          <button type="button" className={s.modo} aria-pressed={modo === 'sumar'} onClick={() => cambiarModo('sumar')}>Sumar</button>
          <button type="button" className={s.modo} aria-pressed={modo === 'restar'} disabled={saldo <= 0} onClick={() => cambiarModo('restar')}>Restar</button>
        </div>
        <div className={s.cantidad}>
          <label htmlFor="ajuste-puntos" className="sr-only">Puntos</label>
          <input id="ajuste-puntos" className="adm-field adm-field-auto tabular-nums" inputMode="numeric" placeholder="0" value={cantidad}
            onChange={(e) => setCantidad(e.target.value.replace(/\D/g, ''))} />
          {clienteId && n > 0 && (
            <span className={s.quedaria}>
              {quedaria >= 0 ? <>Quedaría en <b className="tabular-nums">{num(quedaria)} pts</b></> : <span style={{ color: 'var(--c-danger)' }}>Solo tiene {num(saldo)} pts</span>}
            </span>
          )}
        </div>
        <div>
          <p className={s.pregunta}>¿Por qué? <span>· obligatorio</span></p>
          <div className={s.motivos} role="group" aria-label="Motivo">
            {MOTIVOS[modo].map((m) => (
              <button key={m} type="button" className={s.motivo} aria-pressed={motivo === m} onClick={() => setMotivo(m)}>{m}</button>
            ))}
          </div>
        </div>
        {motivo && (
          <label className={s.campo}><span>Nota <small>· {motivo === 'Otro' ? 'obligatoria' : 'opcional'}</small></span>
            <input className="adm-field" maxLength={160} value={nota} placeholder="Ej.: pedido del martes en la noche" onChange={(e) => setNota(e.target.value)} />
          </label>
        )}
        {error && <p role="alert" className={s.error}>{error}</p>}
        {actual && (
          <ul className={s.opciones}>
            <li>
              <button type="button" className={s.opcion} aria-expanded={verMovs} onClick={abrirMovimientos}>
                <Icon name="clock" size={16} /><span>Movimientos de puntos</span><Icon name={verMovs ? 'chevronDown' : 'chevronRight'} size={16} />
              </button>
              {verMovs && (
                <div className={s.historial}>
                  {movs === null ? <p className={s.hojaResumen}>Cargando…</p>
                    : movs.length === 0 ? <p className={s.hojaResumen}>Sin movimientos todavía.</p>
                    : movs.map((m) => (
                      <div key={m.id} className={s.mov}>
                        <div>
                          {m.note || (m.order_id ? 'Pedido' : m.tipo === 'REDEEM' ? 'Canje' : 'Ajuste')}
                          <small>{fecha(m.created_at)}{m.order_id ? ' · por un pedido' : ''}</small>
                        </div>
                        <b data-signo={m.points >= 0 ? 'mas' : 'menos'}>{m.points >= 0 ? '+' : '−'}{num(Math.abs(m.points))}</b>
                      </div>
                    ))}
                </div>
              )}
            </li>
          </ul>
        )}
      </div>
    </HojaOperativa>
  );
}

/* ── Elegir de una lista larga dentro de una hoja ─────────────────
   Un buscador con hasta 6 resultados. El Select de Base UI abre su lista
   fuera del <dialog> de la hoja y quedaría tapado por la capa superior. */
type OpcionElegir = { id: string; texto: string; detalle?: string };

function Elegir({ etiqueta, buscarTexto, opciones, valor, onCambio, opcional }: {
  etiqueta: string; buscarTexto: string; opciones: OpcionElegir[]; valor: string;
  onCambio: (id: string) => void; opcional?: string;
}) {
  const id = useId();
  const [texto, setTexto] = useState('');
  const elegida = opciones.find((o) => o.id === valor);
  const t = texto.trim().toLowerCase();
  const encontradas = t ? opciones.filter((o) => o.texto.toLowerCase().includes(t) || (o.detalle ?? '').toLowerCase().includes(t)).slice(0, 6) : [];

  if (elegida) {
    return (
      <div className={s.campo}>
        {etiqueta}
        <ul className={s.opciones}>
          <li>
            <button type="button" className={s.opcion} onClick={() => { onCambio(''); setTexto(''); }} aria-label={`${elegida.texto}. Cambiar ${etiqueta.toLowerCase()}`}>
              <span><b>{elegida.texto}</b>{elegida.detalle ? ` · ${elegida.detalle}` : ''}</span>
              <em>Cambiar</em>
            </button>
          </li>
        </ul>
      </div>
    );
  }

  return (
    <div className={s.campo}>
      <label htmlFor={id}>{etiqueta}{opcional ? <small> · opcional</small> : null}</label>
      <input id={id} type="search" className="adm-field" placeholder={buscarTexto} value={texto} onChange={(e) => setTexto(e.target.value)} />
      {t && (
        encontradas.length === 0 ? <small>Nada coincide con «{texto}».</small> : (
          <ul className={s.opciones}>
            {encontradas.map((o) => (
              <li key={o.id}>
                <button type="button" className={s.opcion} onClick={() => onCambio(o.id)}>
                  <span>{o.texto}</span>{o.detalle && <em>{o.detalle}</em>}
                </button>
              </li>
            ))}
          </ul>
        )
      )}
    </div>
  );
}

/* ── Nueva recompensa o cambiarla ──────────────────────────────── */
function HojaPremio({ restaurantId, premio, products, settings, onClose, onHecho, onBorrar }: {
  restaurantId: string; premio: RewardRow | null; products: RewardProduct[]; settings: LoyaltySettings;
  onClose: () => void; onHecho: (t: string) => void; onBorrar?: () => void;
}) {
  const [form, setForm] = useState<RewardPatch>(premio ? {
    id: premio.id, product_id: premio.product_id ?? '', title: premio.title, description: premio.description ?? '',
    image_url: premio.image_url ?? '', points_cost: premio.points_cost, active: premio.active,
    stock: premio.stock, per_customer_limit: premio.per_customer_limit, sort_order: premio.sort_order,
  } : { product_id: '', title: '', description: '', image_url: '', points_cost: 100, active: true, stock: null, per_customer_limit: null, sort_order: 0 });
  const [verMas, setVerMas] = useState(!!(premio?.description || premio?.stock != null || premio?.per_customer_limit != null));
  const [error, setError] = useState<string | null>(null);
  const [pendiente, start] = useTransition();

  function set<K extends keyof RewardPatch>(k: K, v: RewardPatch[K]) { setForm((f) => ({ ...f, [k]: v })); }
  function elegirPlatillo(id: string) {
    const p = products.find((x) => x.id === id);
    setForm((f) => ({
      ...f,
      product_id: id || null,
      title: f.title?.trim() ? f.title : (p?.name ?? ''),
      image_url: f.image_url?.trim() ? f.image_url : (p?.image_url ?? ''),
    }));
  }

  const gasto = gastoPara(form.points_cost, settings.earn_rate, settings.earn_amount);
  const valido = form.title.trim() !== '' && form.points_cost > 0;

  function guardar() {
    setError(null);
    start(async () => {
      const r = await saveReward(restaurantId, form);
      if (r.error) { setError(r.error); return; }
      onHecho(premio ? `«${form.title}» guardada` : `«${form.title}» agregada`);
    });
  }

  function alternar() {
    if (!premio) return;
    setError(null);
    const mostrar = !premio.active;
    start(async () => {
      let r: { error?: string } = {};
      try { r = await toggleReward(restaurantId, premio.id, mostrar); } catch { r = { error: 'sin conexión' }; }
      if (r.error) {
        setError(mostrar
          ? `No se pudo mostrar «${premio.title}». Sigue oculta para tus clientes; inténtalo de nuevo.`
          : `No se pudo ocultar «${premio.title}». Tus clientes la siguen viendo; inténtalo de nuevo.`);
        return;
      }
      onHecho(mostrar ? `«${premio.title}» visible en la carta` : `«${premio.title}» oculta`);
    });
  }

  return (
    <HojaOperativa
      label={premio ? `Recompensa ${premio.title}` : 'Nueva recompensa'}
      title={premio ? premio.title : 'Nueva recompensa'}
      className="hoja-fidelidad"
      onClose={onClose}
      footer={(
        <Button type="button" size="action" className="w-full" disabled={!valido || pendiente} onClick={guardar}>
          {pendiente ? 'Guardando…' : premio ? 'Guardar cambios' : 'Agregar recompensa'}
        </Button>
      )}
    >
      <div className={s.hojaCuerpo}>
        <Elegir
          etiqueta="Platillo del menú"
          buscarTexto="Buscar platillo"
          opcional="Sin platillo"
          opciones={products.map((p) => ({ id: p.id, texto: p.name, detalle: fmtMoney(Number(p.price)) }))}
          valor={form.product_id ?? ''}
          onCambio={elegirPlatillo}
        />
        <label className={s.campo}>Nombre que ven tus clientes
          <input className="adm-field" maxLength={120} value={form.title} placeholder="Ej.: Postre gratis" onChange={(e) => set('title', e.target.value)} />
        </label>
        <div className={s.cantidad}>
          <label className={s.campo}>Cuesta (puntos)
            <input className="adm-field adm-field-auto tabular-nums" inputMode="numeric" value={form.points_cost || ''}
              onChange={(e) => set('points_cost', parseInt(e.target.value.replace(/\D/g, ''), 10) || 0)} />
          </label>
          {gasto != null && form.points_cost > 0 && <span className={s.quedaria}>Un cliente gasta <b>{q(gasto)}</b> para ganarla</span>}
        </div>
        {verMas ? (
          <>
            <label className={s.campo}><span>Descripción <small>· opcional</small></span>
              <input className="adm-field" maxLength={400} value={form.description ?? ''} placeholder="Detalle breve" onChange={(e) => set('description', e.target.value)} />
            </label>
            <div className={s.dos}>
              <label className={s.campo}>Máximo por cliente
                <input className="adm-field tabular-nums" inputMode="numeric" placeholder="Sin límite" value={form.per_customer_limit ?? ''}
                  onChange={(e) => set('per_customer_limit', e.target.value === '' ? null : parseInt(e.target.value.replace(/\D/g, ''), 10) || null)} />
              </label>
              <label className={s.campo}>Cuántas hay
                <input className="adm-field tabular-nums" inputMode="numeric" placeholder="Sin límite" value={form.stock ?? ''}
                  onChange={(e) => set('stock', e.target.value === '' ? null : parseInt(e.target.value.replace(/\D/g, ''), 10))} />
              </label>
            </div>
          </>
        ) : (
          <button type="button" className={s.agregar} onClick={() => setVerMas(true)}>+ Descripción, límite por cliente o cuántas hay</button>
        )}
        {error && <p role="alert" className={s.error}>{error}</p>}
        {premio && (
          <ul className={s.opciones}>
            <li>
              <button type="button" className={s.opcion} disabled={pendiente} onClick={alternar}>
                <span>{premio.active ? 'Ocultarla de la carta' : 'Mostrarla en la carta'}</span>
                <em>{premio.active ? 'visible' : 'oculta'}</em>
              </button>
            </li>
            {onBorrar && (
              <li><button type="button" className={s.opcion} data-tono="peligro" disabled={pendiente} onClick={onBorrar}><Icon name="trash" size={16} /><span>Borrar</span></button></li>
            )}
          </ul>
        )}
      </div>
    </HojaOperativa>
  );
}
