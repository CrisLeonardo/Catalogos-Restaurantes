'use client';

/* ReservacionesPanel — la agenda de recepción.
   Auditoría 1.8 (R17, O07; maqueta del 2026-11-09) y línea N «nada saturado»
   (maqueta aprobada el 2026-11-17: docs/diseno/MAQUETA_RECEPCION_NADA_SATURADO_2026-11-17.html).

   · Una fila de mandos: Hoy · Próximos · Revisar (solo si quedó algo de días
     anteriores) y «Nueva reserva», que abre una hoja.
   · Cada reserva lleva una sola acción, la que toca ahora; lo demás está en
     la hoja que se abre al tocar la fila.
   · La agenda es una línea en el teléfono (se abre al tocarla) y queda abierta
     en la PC. Reservar o cambiar la hora sigue comprobando la capacidad en el
     servidor, con horas sugeridas y «de todas formas» (decisión del 2026-11-09).
   · Cancelar pide confirmación, como «No asistió». */

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { HojaOperativa } from '@/components/ui/hoja-operativa';
import { useConfirm } from '@/components/ui/confirm-dialog';
import {
  createReservation, updateReservationStatus, preverMesaDeReserva, reprogramarReserva,
  setDuracionReserva, type ReservationResult, type Sobrecupo,
} from '@/lib/actions/reservaciones';
import type { Reservation, ReservationStatus } from '@/lib/db/reservaciones';
import type { MesaRecepcion } from '@/lib/db/table-sessions';
import { aHora, aMinutos, franjasDelDia, horasConLugar, mesaSugerida, ocupacionEn, type Aforo } from '@/lib/recepcion/agenda';
import { Aviso, Mandos, personas } from './recepcion-comun';
import s from './recepcion.module.css';

interface Props {
  restaurantId: string;
  hoy: string;
  etiquetaHoy: string;
  /** Minutos desde el inicio del día de negocio. */
  ahoraNegocio: number;
  /** Hora de corte del día (minutos): una reserva de las 01:00 va al final del día, no al principio. */
  corte: number;
  duracion: number;
  delDia: Reservation[];
  proximas: Reservation[];
  porRevisar: Reservation[];
  freeTables: MesaRecepcion[];
  configuredTables: MesaRecepcion[];
  aforo: Aforo;
  /** Puede cambiar la duración de una reserva. */
  puedeAjustar: boolean;
}

type Vista = 'hoy' | 'proximos' | 'revisar';
type Contexto = 'hoy' | 'revisar' | 'proxima';
type Accion = () => Promise<ReservationResult>;
type Abierta = { id: string; contexto: Contexto };

const VIVAS: ReservationStatus[] = ['PENDING', 'CONFIRMED', 'SEATED'];
const hora = (t: string) => t.slice(0, 5);
function fechaCorta(d: string) {
  return new Date(`${d}T12:00:00Z`).toLocaleDateString('es-GT', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' });
}
function diaSiguiente(d: string) {
  const f = new Date(`${d}T12:00:00Z`);
  f.setUTCDate(f.getUTCDate() + 1);
  return f.toISOString().slice(0, 10);
}
function duracionTexto(min: number): string {
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}`;
}

export default function ReservacionesPanel({
  restaurantId, hoy, etiquetaHoy, ahoraNegocio, corte, duracion, delDia, proximas, porRevisar,
  freeTables, configuredTables, aforo, puedeAjustar,
}: Props) {
  /* Todo se compara en minutos desde el inicio del día de negocio. */
  const ahoraMin = ahoraNegocio;
  const rel = (t: string) => (aMinutos(t) - corte + 1440) % 1440;
  const router = useRouter();
  const { confirm, dialog } = useConfirm();
  const [error, setError] = useState<string | null>(null);
  const [hecho, setHecho] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [vista, setVista] = useState<Vista>('hoy');
  const [abierta, setAbierta] = useState<Abierta | null>(null);
  const [anotando, setAnotando] = useState(false);
  const [agendaAbierta, setAgendaAbierta] = useState(false);

  function correr(id: string | null, accion: Accion, despues?: (r: ReservationResult) => void, exito?: string) {
    setBusyId(id);
    setError(null);
    setHecho(null);
    startTransition(async () => {
      const res = await accion();
      setBusyId(null);
      if (res.error) setError(res.error);
      else if (res.ok && exito) setHecho(exito);
      despues?.(res);
      router.refresh();
    });
  }

  const vivas = delDia.filter((r) => r.status === 'PENDING' || r.status === 'CONFIRMED');
  const franjas = useMemo(() => franjasDelDia(delDia, aforo.total, duracion), [delDia, aforo.total, duracion]);
  const atrasadas = vivas.filter((r) => rel(r.time) + 30 < ahoraMin);
  const pronto = vivas.filter((r) => { const t = rel(r.time); return t + 30 >= ahoraMin && t <= ahoraMin + 120; });
  const tarde = vivas.filter((r) => rel(r.time) > ahoraMin + 120);
  const enMesa = delDia.filter((r) => r.status === 'SEATED');
  const deHoy = vivas.length + enMesa.length;
  /* Hora que propone «Nueva reserva»: las 19:00, o la siguiente media hora si ya pasaron. */
  const ahoraReloj = (ahoraNegocio + corte) % 1440;
  const siguiente = Math.ceil((ahoraReloj + 1) / 30) * 30;
  const horaSugerida = siguiente > 19 * 60 && siguiente < 1440 ? aHora(siguiente) : '19:00';
  const vistaReal: Vista = vista === 'revisar' && porRevisar.length === 0 ? 'hoy' : vista;

  /** La mesa con la que se sienta: la prevista si sigue libre, si no la más justa. */
  function mesaPara(r: Reservation): number | null {
    const prevista = r.table_number != null && freeTables.some((m) => m.n === r.table_number) ? r.table_number : null;
    return prevista ?? mesaSugerida(freeTables, r.party_size)?.mesa ?? null;
  }

  const cambiar = (r: Reservation, status: ReservationStatus, conMesa: number | null = null, exito?: string) =>
    correr(r.id, () => updateReservationStatus(restaurantId, r.id, status, conMesa), undefined, exito);

  /** La única acción que lleva la fila: la que toca ahora. */
  function accionDe(r: Reservation, contexto: Contexto, mesa: number | null = mesaPara(r)) {
    if (contexto === 'revisar') {
      return { texto: 'Llegó', variante: 'secondary' as const, hacer: () => cambiar(r, 'COMPLETED', null, `${r.customer_name}: marcada como que llegó.`) };
    }
    if (r.status === 'SEATED') {
      return { texto: 'Terminó', variante: 'secondary' as const, hacer: () => cambiar(r, 'COMPLETED', null, `${r.customer_name} terminó.`) };
    }
    if (r.status === 'PENDING') {
      return { texto: 'Confirmar', variante: 'secondary' as const, hacer: () => cambiar(r, 'CONFIRMED', null, `Reserva de ${r.customer_name} confirmada.`) };
    }
    if (contexto === 'hoy' && r.status === 'CONFIRMED') {
      const atrasada = rel(r.time) + 30 < ahoraMin;
      return {
        texto: mesa ? `Sentar en ${mesa}` : 'Sentar',
        variante: (atrasada ? 'secondary' : 'primary') as 'secondary' | 'primary',
        hacer: () => cambiar(r, 'SEATED', mesa, mesa ? `${r.customer_name}, sentados en la mesa ${mesa}.` : `${r.customer_name}, sentados.`),
      };
    }
    return null;
  }

  const fila = (r: Reservation, contexto: Contexto) => (
    <FilaReserva key={r.id} r={r} contexto={contexto} ahoraMin={ahoraMin} rel={rel(r.time)}
      busy={busyId === r.id && isPending} ocupado={isPending} accion={accionDe(r, contexto)}
      onAbrir={() => { setError(null); setAbierta({ id: r.id, contexto }); }} />
  );
  const bloque = (titulo: string, lista: Reservation[], contexto: Contexto, aviso = false) => lista.length > 0 && (
    <>
      <h3 className={s.grupo} data-aviso={aviso ? '' : undefined}>{titulo}</h3>
      <div className={s.card}><ul className={s.lista}>{lista.map((r) => fila(r, contexto))}</ul></div>
    </>
  );

  const todas = [...delDia, ...proximas, ...porRevisar];
  const enHoja = abierta ? todas.find((r) => r.id === abierta.id) ?? null : null;
  const pico = franjas.reduce<(typeof franjas)[number] | null>((m, f) => (!m || f.personas > m.personas ? f : m), null);
  const alta = franjas.some((f) => f.alta);

  return (
    <div className={s.raiz}>
      {dialog}
      <Mandos
        valor={vistaReal}
        onCambio={setVista}
        etiqueta={`Reservaciones de hoy, ${etiquetaHoy}, y de otros días`}
        pestanas={[
          { valor: 'hoy', texto: 'Hoy', cuenta: deHoy },
          { valor: 'proximos', texto: 'Próximos', cuenta: proximas.length },
          ...(porRevisar.length > 0 ? [{ valor: 'revisar' as const, texto: 'Revisar', cuenta: porRevisar.length, aviso: true }] : []),
        ]}
        boton="Nueva reserva"
        botonCorto="Nueva"
        onBoton={() => { setError(null); setHecho(null); setAnotando(true); }}
      />

      <Aviso error={abierta || anotando ? null : error} hecho={hecho} />

      {vistaReal === 'hoy' && (
        <div className={s.hoyGrid}>
          {franjas.length > 0 && pico && (
            <section className={`${s.card} ${s.agendaCaja}`} data-abierta={agendaAbierta ? '' : undefined} aria-label="Agenda de hoy">
              <button type="button" className={s.agendaLinea} data-alta={alta ? '' : undefined}
                aria-expanded={agendaAbierta} onClick={() => setAgendaAbierta((v) => !v)}>
                <Icon name="calendar" size={16} />
                <span>
                  Agenda · máximo <b>{aforo.total != null ? `${pico.personas} de ${aforo.total}` : personas(pico.personas)}</b> a las {pico.hora}
                </span>
                <Icon name="chevronDown" size={16} />
              </button>
              <div className={s.agenda}>
                <div className={s.agendaHead}>
                  <h3>Agenda de hoy</h3>
                  <span className={s.duracion}>
                    {aforo.total != null && <span className={s.chip}>Aforo {aforo.total}</span>}
                    {puedeAjustar ? (
                      <select aria-label="Duración de cada reserva" value={duracion} disabled={isPending}
                        onChange={(e) => correr(null, () => setDuracionReserva(restaurantId, Number(e.target.value)))}>
                        {[60, 90, 120, 150, 180].map((m) => <option key={m} value={m}>Reservas de {m} min</option>)}
                      </select>
                    ) : <span className={s.chip}>Reservas de {duracion} min</span>}
                  </span>
                </div>
                {franjas.map((f) => (
                  <div key={f.hora} className={s.franja}>
                    <span>{f.hora}</span>
                    <span className={s.barra} role="img"
                      aria-label={f.aforo ? `${f.personas} de ${f.aforo} personas a las ${f.hora}` : `${f.personas} personas a las ${f.hora}`}>
                      <i data-alta={f.alta ? '' : undefined}
                        style={{ width: `${f.aforo ? Math.min(100, (f.personas / f.aforo) * 100) : Math.min(100, f.personas * 5)}%` }} />
                    </span>
                    <span>{f.aforo ? `${f.personas} / ${f.aforo}` : personas(f.personas)}</span>
                  </div>
                ))}
                <div className={s.leyenda}>
                  <span>Personas previstas a la vez</span>
                  {aforo.total == null
                    ? <span>Sin mesas configuradas: no se comprueba capacidad.</span>
                    : aforo.sinPlazas > 0
                      ? <span>{aforo.sinPlazas} {aforo.sinPlazas === 1 ? 'mesa sin plazas se cuenta' : 'mesas sin plazas se cuentan'} de 4</span>
                      : <span className={`${s.chip} ${s.warn}`}>80 % o más</span>}
                </div>
              </div>
            </section>
          )}

          <div className={s.columna}>
            {deHoy === 0 ? (
              <EmptyState icon="calendar" title="No hay reservas para hoy"
                desc="Anota la primera cuando alguien llame: la agenda calcula cuántas personas caben a cada hora."
                action={{ label: 'Nueva reserva', onClick: () => setAnotando(true) }} />
            ) : (
              <>
                {bloque('Pasó su hora', atrasadas, 'hoy', true)}
                {bloque('Llegan pronto', pronto, 'hoy')}
                {bloque('Más tarde', tarde, 'hoy')}
                {bloque('En mesa', enMesa, 'hoy')}
              </>
            )}
          </div>
        </div>
      )}

      {vistaReal === 'proximos' && (
        <div className={s.unaColumna}>
          {proximas.length === 0 ? (
            <EmptyState icon="calendar" title="No hay reservas para los próximos días"
              desc="Las que anotes para mañana o después aparecen aquí."
              action={{ label: 'Nueva reserva', onClick: () => setAnotando(true) }} />
          ) : <div className={s.card}><ul className={s.lista}>{proximas.map((r) => fila(r, 'proxima'))}</ul></div>}
        </div>
      )}

      {vistaReal === 'revisar' && (
        <div className={s.unaColumna}>
          <p className={s.resumen}>Reservas de días anteriores que nadie marcó. «No asistió» queda en el historial del cliente.</p>
          <div className={s.card}><ul className={s.lista}>{porRevisar.map((r) => fila(r, 'revisar'))}</ul></div>
        </div>
      )}

      {enHoja && abierta && (
        <HojaReserva
          r={enHoja} contexto={abierta.contexto} hoy={hoy} ahoraMin={ahoraMin} rel={rel(enHoja.time)}
          freeTables={freeTables} configuredTables={configuredTables} mesaPara={mesaPara} accionDe={accionDe}
          busy={busyId === enHoja.id && isPending} error={error} correr={correr} restaurantId={restaurantId}
          delDia={delDia} aforo={aforo.total} duracion={duracion} confirmar={confirm}
          onClose={() => setAbierta(null)}
        />
      )}

      {anotando && (
        <HojaNuevaReserva restaurantId={restaurantId} hoy={hoy} horaSugerida={horaSugerida} delDia={delDia} aforo={aforo.total} duracion={duracion}
          ocupado={isPending} error={error} correr={correr} onClose={() => setAnotando(false)} />
      )}
    </div>
  );
}

function FilaReserva({ r, contexto, ahoraMin, rel, busy, ocupado, accion, onAbrir }: {
  r: Reservation; contexto: Contexto; ahoraMin: number; rel: number; busy: boolean; ocupado: boolean;
  accion: { texto: string; variante: 'primary' | 'secondary'; hacer: () => void } | null;
  onAbrir: () => void;
}) {
  const cuando = contexto === 'hoy'
    ? (r.status === 'SEATED' ? (r.table_number ? `mesa ${r.table_number}` : 'en mesa') : rel < ahoraMin ? `hace ${duracionTexto(ahoraMin - rel)}` : rel === ahoraMin ? 'ahora' : `en ${duracionTexto(rel - ahoraMin)}`)
    : fechaCorta(r.date);
  const partes: React.ReactNode[] = [];
  if (r.status === 'PENDING') partes.push(<span key="p" data-tono="aviso">Sin confirmar</span>);
  partes.push(<span key="n">{personas(r.party_size)}</span>);
  if (r.table_number && r.status !== 'SEATED') partes.push(<span key="m">mesa {r.table_number} prevista</span>);
  if (r.customer_phone) partes.push(<span key="t" className={s.metaPc}>{r.customer_phone}</span>);
  if (r.notes) partes.push(<span key="o">{r.notes}</span>);

  return (
    <li>
      <div className={s.fila}>
        <button type="button" className={s.abrir} onClick={onAbrir} aria-haspopup="dialog">
          <span className={s.hora}>{hora(r.time)}<small>{cuando}</small></span>
          <span className={s.quien}>
            <span className={s.nombre}>{r.customer_name}</span>
            <span className={s.meta}>
              {partes}
            </span>
          </span>
        </button>
        {accion ? (
          <span className={s.accion}>
            <Button type="button" size="touch" variant={accion.variante} disabled={ocupado} onClick={accion.hacer}>
              {busy ? '…' : accion.texto}
            </Button>
          </span>
        ) : <Icon name="chevronRight" size={18} className={s.chevron} />}
      </div>
    </li>
  );
}

function AvisoSobrecupo({ sobre, horas, onHora, onForzar, forzarTexto }: {
  sobre: Sobrecupo; horas: { hora: string; libres: number }[]; onHora?: (h: string) => void; onForzar: () => void; forzarTexto: string;
}) {
  return (
    <div className={`${s.caja} ${s.alerta}`} role="status">
      <b>{sobre.libres === 0 ? 'No quedan lugares a esa hora' : `Quedan ${sobre.libres} ${sobre.libres === 1 ? 'lugar' : 'lugares'} a esa hora`}</b>
      Ya hay {sobre.ocupadas} personas a la vez de un aforo de {sobre.aforo} (reservas de {sobre.duracion} min).
      <div className={s.acciones}>
        {onHora && horas.map((h) => (
          <Button key={h.hora} type="button" size="touch" variant="secondary" onClick={() => onHora(h.hora)}>
            {h.hora} · quedan {h.libres}
          </Button>
        ))}
        <Button type="button" size="touch" variant="ghost" onClick={onForzar}>{forzarTexto}</Button>
      </div>
    </div>
  );
}

function HojaReserva({
  r, contexto, hoy, ahoraMin, rel, freeTables, configuredTables, mesaPara, accionDe, busy, error, correr, restaurantId,
  delDia, aforo, duracion, confirmar, onClose,
}: {
  r: Reservation; contexto: Contexto; hoy: string; ahoraMin: number; rel: number;
  freeTables: MesaRecepcion[]; configuredTables: MesaRecepcion[];
  mesaPara: (r: Reservation) => number | null;
  accionDe: (r: Reservation, c: Contexto, mesa?: number | null) => { texto: string; variante: 'primary' | 'secondary'; hacer: () => void } | null;
  busy: boolean; error: string | null; restaurantId: string;
  correr: (id: string | null, a: Accion, despues?: (r: ReservationResult) => void, exito?: string) => void;
  delDia: Reservation[]; aforo: number | null; duracion: number;
  confirmar: (o: { title: string; description?: string; confirmLabel?: string; cancelLabel?: string }) => Promise<boolean>;
  onClose: () => void;
}) {
  const [otra, setOtra] = useState('');
  const [cambiando, setCambiando] = useState(false);
  const [nueva, setNueva] = useState({ fecha: r.date, hora: hora(r.time) });
  const [sobre, setSobre] = useState<Sobrecupo | null>(null);
  const viva = r.status === 'PENDING' || r.status === 'CONFIRMED';
  const sentable = contexto === 'hoy' && r.status === 'CONFIRMED';
  const mesa = otra ? Number(otra) : mesaPara(r);
  const accion = accionDe(r, contexto, mesa);
  const compatibles = freeTables.filter((m) => m.capacidad == null || m.capacidad >= r.party_size);
  const puedeNoAsistio = contexto === 'revisar' || (contexto === 'hoy' && viva && rel < ahoraMin);

  const cuando = contexto === 'hoy' ? `Hoy ${hora(r.time)}` : `${fechaCorta(r.date)} ${hora(r.time)}`;
  const estado = r.status === 'PENDING' ? 'sin confirmar' : r.status === 'SEATED' ? 'en mesa' : null;

  async function noAsistio() {
    onClose();
    if (await confirmar({ title: `¿${r.customer_name} no asistió?`, description: 'Libera su lugar y queda en el historial del cliente; no se borra.', confirmLabel: 'No asistió' })) {
      correr(r.id, () => updateReservationStatus(restaurantId, r.id, 'NO_SHOW'), undefined, `${r.customer_name}: no asistió.`);
    }
  }
  async function cancelar() {
    onClose();
    if (await confirmar({
      title: `¿Cancelar la reserva de ${r.customer_name}?`,
      description: `${cuando} · ${personas(r.party_size)}. Libera su lugar en la agenda y no se puede deshacer.`,
      confirmLabel: 'Cancelar reserva', cancelLabel: 'No cancelar',
    })) {
      correr(r.id, () => updateReservationStatus(restaurantId, r.id, 'CANCELLED'), undefined, `Reserva de ${r.customer_name} cancelada.`);
    }
  }
  function reprogramar(forzar: boolean) {
    correr(r.id, () => reprogramarReserva(restaurantId, r.id, nueva.fecha, nueva.hora, r.party_size, forzar), (res) => {
      if (res.sobrecupo) { setSobre(res.sobrecupo); return; }
      if (res.ok) onClose();
    }, `Reserva de ${r.customer_name} movida a las ${nueva.hora}${nueva.fecha === hoy ? '' : ` del ${fechaCorta(nueva.fecha)}`}.`);
  }
  const horasLibres = sobre && aforo != null && nueva.fecha === hoy
    ? horasConLugar(delDia.filter((x) => VIVAS.includes(x.status)), r.party_size, aforo, duracion, aMinutos(nueva.hora), 2, r.id)
    : [];

  return (
    <HojaOperativa
      label={`Reserva de ${r.customer_name}`}
      title={r.customer_name}
      className="hoja-recepcion"
      resumen={<p className={s.hojaResumen}>{cuando} · {personas(r.party_size)}{estado ? ` · ${estado}` : ''}</p>}
      onClose={onClose}
      footer={accion ? (
        <div className={s.pie}>
          <Button type="button" size="action" variant="primary" disabled={busy}
            onClick={() => { accion.hacer(); onClose(); }}>
            {sentable ? (mesa ? `Llegó · sentar en ${mesa}` : 'Llegó · sentar sin mesa') : accion.texto}
          </Button>
        </div>
      ) : null}
    >
      <div className={s.hojaCuerpo}>
        {error && <div className={s.error} role="alert">{error}</div>}
        {r.notes && <div className={s.nota}>{r.notes}</div>}

        {(sentable && compatibles.length > 1) || (viva && contexto !== 'revisar') || r.customer_phone ? (
          <ul className={s.opciones}>
            {sentable && compatibles.length > 1 && (
              <li>
                <label className={s.opcion}>
                  <span>Otra mesa</span>
                  <select value={otra} onChange={(e) => setOtra(e.target.value)}>
                    <option value="">{mesa && !otra ? `Mesa ${mesa} (sugerida)` : 'La sugerida'}</option>
                    {compatibles.map(({ n, capacidad }) => <option key={n} value={n}>Mesa {n}{capacidad ? ` · ${capacidad} plazas` : ''}</option>)}
                  </select>
                </label>
              </li>
            )}
            {r.status === 'CONFIRMED' && contexto !== 'revisar' && configuredTables.length > 0 && (
              <li>
                <label className={s.opcion}>
                  <span>Mesa prevista</span>
                  <select value={r.table_number ?? ''} disabled={busy}
                    onChange={(e) => correr(r.id, () => preverMesaDeReserva(restaurantId, r.id, e.target.value ? Number(e.target.value) : null))}>
                    <option value="">Sin asignar</option>
                    {configuredTables.filter((m) => m.n === r.table_number || m.capacidad == null || m.capacidad >= r.party_size)
                      .map(({ n, capacidad }) => <option key={n} value={n}>Mesa {n}{capacidad ? ` · ${capacidad} plazas` : ''}</option>)}
                  </select>
                </label>
              </li>
            )}
            {viva && contexto !== 'revisar' && (
              <li>
                <button type="button" className={s.opcion} aria-expanded={cambiando}
                  onClick={() => { setCambiando((v) => !v); setSobre(null); }}>
                  <span>Cambiar día u hora</span>
                  <Icon name={cambiando ? 'chevronDown' : 'chevronRight'} size={16} />
                </button>
                {cambiando && (
                  <div className={s.cambio}>
                    <div className={s.campos}>
                      <div>
                        <label htmlFor={`fecha-${r.id}`}>Fecha</label>
                        <input id={`fecha-${r.id}`} type="date" className="adm-field" min={hoy} value={nueva.fecha}
                          onChange={(e) => { setNueva((n) => ({ ...n, fecha: e.target.value })); setSobre(null); }} />
                      </div>
                      <div>
                        <label htmlFor={`hora-${r.id}`}>Hora</label>
                        <input id={`hora-${r.id}`} type="time" className="adm-field" value={nueva.hora}
                          onChange={(e) => { setNueva((n) => ({ ...n, hora: e.target.value })); setSobre(null); }} />
                      </div>
                    </div>
                    {sobre && (
                      <AvisoSobrecupo sobre={sobre} horas={horasLibres} onHora={(h) => { setNueva((n) => ({ ...n, hora: h })); setSobre(null); }}
                        onForzar={() => reprogramar(true)} forzarTexto="Cambiar de todas formas" />
                    )}
                    <Button type="button" size="touch" variant="secondary" disabled={busy} onClick={() => reprogramar(false)}>
                      {busy ? 'Guardando…' : 'Guardar el cambio'}
                    </Button>
                  </div>
                )}
              </li>
            )}
            {r.customer_phone && (
              <li>
                <a className={s.opcion} href={`tel:${r.customer_phone.replace(/[^\d+]/g, '')}`}>
                  <Icon name="phone" size={16} /><span>Llamar</span><em>{r.customer_phone}</em>
                </a>
              </li>
            )}
          </ul>
        ) : null}

        {(puedeNoAsistio || viva) && (
          <ul className={s.opciones}>
            {puedeNoAsistio && (
              <li>
                <button type="button" className={s.opcion} disabled={busy} onClick={noAsistio}>
                  <span>No asistió</span><em>queda en el historial</em>
                </button>
              </li>
            )}
            <li>
              <button type="button" className={s.opcion} data-tono="peligro" disabled={busy} onClick={cancelar}>
                <span>Cancelar reserva</span>
              </button>
            </li>
          </ul>
        )}
        {r.status === 'PENDING' && contexto !== 'revisar' && (
          <p className={s.hojaResumen}>Confirmar aparta su lugar en la agenda; la mesa se elige al llegar.</p>
        )}
      </div>
    </HojaOperativa>
  );
}

function HojaNuevaReserva({ restaurantId, hoy, horaSugerida, delDia, aforo, duracion, ocupado, error, correr, onClose }: {
  restaurantId: string; hoy: string; horaSugerida: string; delDia: Reservation[]; aforo: number | null; duracion: number; ocupado: boolean;
  error: string | null;
  correr: (id: string | null, a: Accion, despues?: (r: ReservationResult) => void, exito?: string) => void;
  onClose: () => void;
}) {
  const manana = diaSiguiente(hoy);
  const [form, setForm] = useState({ customer_name: '', customer_phone: '', party_size: 2, date: hoy, time: horaSugerida, notes: '' });
  const [otraFecha, setOtraFecha] = useState(false);
  const [conNota, setConNota] = useState(false);
  const [sobre, setSobre] = useState<Sobrecupo | null>(null);
  const set = (k: keyof typeof form, v: string | number) => { setForm((f) => ({ ...f, [k]: v })); setSobre(null); };
  const vivasHoy = delDia.filter((r) => VIVAS.includes(r.status));
  const horas = sobre && aforo != null && form.date === hoy
    ? horasConLugar(vivasHoy, form.party_size, aforo, duracion, aMinutos(form.time))
    : [];
  const libres = aforo != null && form.date === hoy && form.time
    ? aforo - ocupacionEn(vivasHoy, aMinutos(form.time), duracion)
    : null;

  function enviar(forzar: boolean) {
    const cuando = form.date === hoy ? 'hoy' : form.date === manana ? 'mañana' : `el ${fechaCorta(form.date)}`;
    correr(null, () => createReservation(restaurantId, { ...form, forzar }), (res) => {
      if (res.sobrecupo) { setSobre(res.sobrecupo); return; }
      if (res.ok) onClose();
    }, `Reserva de ${form.customer_name.trim()} guardada para ${cuando} a las ${form.time}.`);
  }
  const elegirDia = (d: 'hoy' | 'manana' | 'otra') => {
    if (d === 'otra') { setOtraFecha(true); return; }
    setOtraFecha(false);
    set('date', d === 'hoy' ? hoy : manana);
  };
  const diaActual = otraFecha ? 'otra' : form.date === hoy ? 'hoy' : form.date === manana ? 'manana' : 'otra';

  return (
    <HojaOperativa
      label="Nueva reserva"
      className="hoja-recepcion"
      onClose={onClose}
      footer={(
        <div className={s.pie}>
          <Button type="submit" form="nueva-reserva" size="action" disabled={ocupado}>{ocupado ? 'Guardando…' : 'Guardar reserva'}</Button>
        </div>
      )}
    >
      <form id="nueva-reserva" className={s.hojaCuerpo} onSubmit={(e) => { e.preventDefault(); enviar(false); }}>
        {error && <div className={s.error} role="alert">{error}</div>}
        <div className={s.campos}>
          <div className={s.completo}>
            <label htmlFor="reserva-nombre">Nombre</label>
            <input id="reserva-nombre" autoComplete="off" className="adm-field" required placeholder="Juan García"
              value={form.customer_name} onChange={(e) => set('customer_name', e.target.value)} />
          </div>
          <div>
            <label htmlFor="reserva-personas">Personas</label>
            <input id="reserva-personas" className="adm-field" type="number" inputMode="numeric" min={1} max={100} required
              value={form.party_size} onChange={(e) => set('party_size', parseInt(e.target.value) || 1)} />
          </div>
          <div>
            <label htmlFor="reserva-telefono">Teléfono</label>
            <input id="reserva-telefono" type="tel" inputMode="tel" autoComplete="off" className="adm-field" placeholder="+502 0000 0000"
              value={form.customer_phone} onChange={(e) => set('customer_phone', e.target.value)} />
          </div>
          <div className={s.completo} role="group" aria-labelledby="reserva-dia-t">
            <span id="reserva-dia-t" className={s.campoTitulo}>Día</span>
            <div className={s.dias}>
              <button type="button" className={s.dia} aria-pressed={diaActual === 'hoy'} onClick={() => elegirDia('hoy')}>Hoy</button>
              <button type="button" className={s.dia} aria-pressed={diaActual === 'manana'} onClick={() => elegirDia('manana')}>Mañana</button>
              <button type="button" className={s.dia} aria-pressed={diaActual === 'otra'} onClick={() => elegirDia('otra')}>Otra fecha</button>
            </div>
          </div>
          {diaActual === 'otra' && (
            <div className={s.completo}>
              <label htmlFor="reserva-fecha">Fecha</label>
              <input id="reserva-fecha" className="adm-field" type="date" required min={hoy}
                value={form.date} onChange={(e) => set('date', e.target.value)} />
            </div>
          )}
          <div className={s.completo}>
            <label htmlFor="reserva-hora">Hora</label>
            <input id="reserva-hora" className="adm-field" type="time" required
              value={form.time} onChange={(e) => set('time', e.target.value)} />
          </div>
        </div>
        {libres != null && aforo != null && !sobre && (
          <p className={s.cupo} data-tono={libres < form.party_size ? 'aviso' : undefined} aria-live="polite">
            {libres < form.party_size
              ? `A las ${form.time} solo ${libres === 1 ? 'queda 1 lugar' : `quedan ${Math.max(0, libres)} lugares`} de ${aforo}`
              : `A las ${form.time} quedan ${libres} de ${aforo} lugares`}
          </p>
        )}
        {conNota ? (
          <div>
            <label htmlFor="reserva-notas" className={s.campoTitulo}>Nota</label>
            <textarea id="reserva-notas" className="adm-field" autoFocus style={{ resize: 'vertical', minHeight: 60 }} placeholder="Alergias, ocasión especial…"
              value={form.notes} onChange={(e) => set('notes', e.target.value)} />
          </div>
        ) : (
          <button type="button" className={s.agregarNota} onClick={() => setConNota(true)}>+ Agregar una nota</button>
        )}
        {sobre && (
          <AvisoSobrecupo sobre={sobre} horas={horas} onHora={(h) => { setForm((f) => ({ ...f, time: h })); setSobre(null); }}
            onForzar={() => enviar(true)} forzarTexto="Reservar de todas formas" />
        )}
        {aforo == null && <p className={s.hojaResumen}>Sin mesas configuradas no se comprueba la capacidad.</p>}
      </form>
    </HojaOperativa>
  );
}
