'use client';

/* ReservacionesPanel — la agenda de recepción (auditoría 1.8: R17, O07).
   Maqueta aprobada: docs/diseno/MAQUETA_RECEPCION_2026-11-09.html

   · Agenda del día de negocio con las personas previstas a la vez frente al
     aforo, y las llegadas ordenadas por cercanía.
   · Reservar o cambiar la hora comprueba la capacidad en el servidor; si no
     cabe, dice cuántos lugares quedan, sugiere horas y permite «Reservar de
     todas formas» (decisión del dueño, 2026-11-09).
   · Lo que nunca se resolvió en días anteriores pasa a «Por revisar»: ya no
     desaparece. «No asistió» queda en el historial. */

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { useConfirm } from '@/components/ui/confirm-dialog';
import {
  createReservation, updateReservationStatus, preverMesaDeReserva, reprogramarReserva,
  setDuracionReserva, type ReservationResult, type Sobrecupo,
} from '@/lib/actions/reservaciones';
import type { Reservation, ReservationStatus } from '@/lib/db/reservaciones';
import type { MesaRecepcion } from '@/lib/db/table-sessions';
import { aMinutos, franjasDelDia, horasConLugar, mesaSugerida, type Aforo } from '@/lib/recepcion/agenda';
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

const ESTADO: Record<ReservationStatus, { texto: string; clase: string }> = {
  PENDING: { texto: 'Pendiente', clase: s.warn },
  CONFIRMED: { texto: 'Confirmada', clase: s.info },
  SEATED: { texto: 'En mesa', clase: s.ok },
  COMPLETED: { texto: 'Completada', clase: '' },
  CANCELLED: { texto: 'Cancelada', clase: '' },
  NO_SHOW: { texto: 'No asistió', clase: '' },
};

const hora = (t: string) => t.slice(0, 5);
const personas = (n: number) => `${n} ${n === 1 ? 'persona' : 'personas'}`;
function fechaCorta(d: string) {
  return new Date(`${d}T12:00:00Z`).toLocaleDateString('es-GT', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' });
}
function duracionTexto(min: number): string {
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}`;
}
function enCuanto(min: number): string {
  return min <= 0 ? 'ahora' : `en ${duracionTexto(min)}`;
}

type Accion = () => Promise<ReservationResult>;

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
  const [isPending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);

  function correr(id: string | null, accion: Accion, despues?: (r: ReservationResult) => void) {
    setBusyId(id);
    setError(null);
    startTransition(async () => {
      const res = await accion();
      setBusyId(null);
      if (res.error) setError(res.error);
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

  const fila = (r: Reservation, contexto: 'hoy' | 'revisar' | 'proxima') => (
    <FilaReserva key={r.id} r={r} contexto={contexto} ahoraMin={ahoraMin} corte={corte} hoy={hoy}
      freeTables={freeTables} configuredTables={configuredTables} busy={busyId === r.id && isPending}
      correr={correr} restaurantId={restaurantId} delDia={delDia} aforo={aforo.total} duracion={duracion}
      confirmar={confirm} />
  );

  return (
    <div className={s.raiz}>
      {dialog}
      <div className={s.cabecera}>
        <div>
          <h2>Reservaciones</h2>
          <p>Hoy, {etiquetaHoy}</p>
        </div>
      </div>

      {error && <div className={s.error} role="alert">{error}</div>}

      <div className={s.columnas}>
        <div className={s.columna}>
          <section className={`${s.card} ${s.agenda}`} aria-labelledby="agenda-t">
            <div className={s.agendaHead}>
              <h3 id="agenda-t">Agenda de hoy</h3>
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
            {franjas.length === 0 ? (
              <p className={s.efecto} style={{ margin: 0 }}>No hay reservas para hoy.</p>
            ) : (
              franjas.map((f) => (
                <div key={f.hora} className={s.franja}>
                  <span>{f.hora}</span>
                  <span className={s.barra} role="img"
                    aria-label={f.aforo ? `${f.personas} de ${f.aforo} personas a las ${f.hora}` : `${f.personas} personas a las ${f.hora}`}>
                    <i data-alta={f.alta ? '' : undefined}
                      style={{ width: `${f.aforo ? Math.min(100, (f.personas / f.aforo) * 100) : Math.min(100, f.personas * 5)}%` }} />
                  </span>
                  <span>{f.aforo ? `${f.personas} / ${f.aforo}` : personas(f.personas)}</span>
                </div>
              ))
            )}
            <div className={s.leyenda}>
              <span>Personas previstas a la vez</span>
              {aforo.total == null
                ? <span>Sin mesas configuradas: no se comprueba capacidad.</span>
                : aforo.sinPlazas > 0
                  ? <span>{aforo.sinPlazas} {aforo.sinPlazas === 1 ? 'mesa sin plazas se cuenta' : 'mesas sin plazas se cuentan'} de 4</span>
                  : <span className={`${s.chip} ${s.warn}`}>80 % o más</span>}
            </div>
          </section>

          {atrasadas.length > 0 && (
            <section className={s.seccion} aria-labelledby="atrasadas-t">
              <h3 id="atrasadas-t">Pasó su hora <small>· sin marcar llegada</small></h3>
              <div className={s.card}><ul className={s.lista}>{atrasadas.map((r) => fila(r, 'hoy'))}</ul></div>
            </section>
          )}

          <section className={s.seccion} aria-labelledby="pronto-t">
            <h3 id="pronto-t">Llegan pronto <small>· próximas 2 horas</small></h3>
            {pronto.length === 0 ? (
              <div className={s.card}><p className={s.vacio}>Nadie llega en las próximas dos horas.</p></div>
            ) : (
              <div className={s.card}><ul className={s.lista}>{pronto.map((r) => fila(r, 'hoy'))}</ul></div>
            )}
          </section>

          {tarde.length > 0 && (
            <section className={s.seccion} aria-labelledby="tarde-t">
              <h3 id="tarde-t">Más tarde hoy</h3>
              <div className={s.card}><ul className={s.lista}>{tarde.map((r) => fila(r, 'hoy'))}</ul></div>
            </section>
          )}

          {enMesa.length > 0 && (
            <section className={s.seccion} aria-labelledby="enmesa-t">
              <h3 id="enmesa-t">En mesa</h3>
              <div className={s.card}><ul className={s.lista}>{enMesa.map((r) => fila(r, 'hoy'))}</ul></div>
            </section>
          )}
        </div>

        <div className={s.columna}>
          {porRevisar.length > 0 && (
            <section className={s.seccion} aria-labelledby="revisar-r-t">
              <h3 id="revisar-r-t">Por revisar <small>· días anteriores</small> <span className={`${s.chip} ${s.warn}`}>{porRevisar.length}</span></h3>
              <div className={s.card}><ul className={s.lista}>{porRevisar.map((r) => fila(r, 'revisar'))}</ul></div>
            </section>
          )}

          <NuevaReserva restaurantId={restaurantId} hoy={hoy} delDia={delDia} aforo={aforo.total} duracion={duracion}
            ocupado={isPending} correr={correr} />

          <section className={s.seccion} aria-labelledby="proximas-t">
            <h3 id="proximas-t">Próximos días</h3>
            {proximas.length === 0 ? (
              vivas.length === 0 && porRevisar.length === 0 ? (
                <EmptyState icon="calendar" title="No hay reservaciones próximas"
                  desc="Agrega la primera con el formulario: la agenda calcula cuántas personas caben a cada hora."
                  action={{ label: 'Escribir la primera', onClick: () => document.getElementById('reserva-nombre')?.focus() }} />
              ) : <div className={s.card}><p className={s.vacio}>No hay reservas para los próximos días.</p></div>
            ) : (
              <div className={s.card}><ul className={s.lista}>{proximas.map((r) => fila(r, 'proxima'))}</ul></div>
            )}
          </section>
        </div>
      </div>
    </div>
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
          <Button key={h.hora} type="button" size="sm" variant="secondary" onClick={() => onHora(h.hora)}>
            {h.hora} · quedan {h.libres}
          </Button>
        ))}
        <Button type="button" size="sm" variant="ghost" onClick={onForzar}>{forzarTexto}</Button>
      </div>
    </div>
  );
}

function NuevaReserva({ restaurantId, hoy, delDia, aforo, duracion, ocupado, correr }: {
  restaurantId: string; hoy: string; delDia: Reservation[]; aforo: number | null; duracion: number; ocupado: boolean;
  correr: (id: string | null, a: Accion, despues?: (r: ReservationResult) => void) => void;
}) {
  const vacio = { customer_name: '', customer_phone: '', party_size: 2, date: hoy, time: '19:00', notes: '' };
  const [form, setForm] = useState(vacio);
  const [sobre, setSobre] = useState<Sobrecupo | null>(null);
  const [guardada, setGuardada] = useState(false);
  const set = (k: keyof typeof vacio, v: string | number) => { setForm((f) => ({ ...f, [k]: v })); setSobre(null); setGuardada(false); };
  const horas = sobre && aforo != null && form.date === hoy
    ? horasConLugar(delDia.filter((r) => ['PENDING', 'CONFIRMED', 'SEATED'].includes(r.status)), form.party_size, aforo, duracion, aMinutos(form.time))
    : [];

  function enviar(forzar: boolean) {
    correr(null, () => createReservation(restaurantId, { ...form, forzar }), (res) => {
      if (res.sobrecupo) { setSobre(res.sobrecupo); return; }
      if (res.ok) { setForm(vacio); setSobre(null); setGuardada(true); }
    });
  }

  return (
    <form className={`${s.card} ${s.form}`} aria-labelledby="nueva-t" onSubmit={(e) => { e.preventDefault(); enviar(false); }}>
      <h3 id="nueva-t">Nueva reserva</h3>
      <div className={s.campos}>
        <div className={s.completo}>
          <label htmlFor="reserva-nombre">Nombre *</label>
          <input id="reserva-nombre" autoComplete="off" className="adm-field" required placeholder="Juan García"
            value={form.customer_name} onChange={(e) => set('customer_name', e.target.value)} />
        </div>
        <div>
          <label htmlFor="reserva-personas">Personas *</label>
          <input id="reserva-personas" className="adm-field" type="number" inputMode="numeric" min={1} max={100} required
            value={form.party_size} onChange={(e) => set('party_size', parseInt(e.target.value) || 1)} />
        </div>
        <div>
          <label htmlFor="reserva-telefono">Teléfono</label>
          <input id="reserva-telefono" type="tel" inputMode="tel" autoComplete="off" className="adm-field" placeholder="+502 0000 0000"
            value={form.customer_phone} onChange={(e) => set('customer_phone', e.target.value)} />
        </div>
        <div>
          <label htmlFor="reserva-fecha">Fecha *</label>
          <input id="reserva-fecha" className="adm-field" type="date" required min={hoy}
            value={form.date} onChange={(e) => set('date', e.target.value)} />
        </div>
        <div>
          <label htmlFor="reserva-hora">Hora *</label>
          <input id="reserva-hora" className="adm-field" type="time" required
            value={form.time} onChange={(e) => set('time', e.target.value)} />
        </div>
        <div className={s.completo}>
          <label htmlFor="reserva-notas">Notas</label>
          <textarea id="reserva-notas" className="adm-field" style={{ resize: 'vertical', minHeight: 60 }} placeholder="Alergias, ocasión especial…"
            value={form.notes} onChange={(e) => set('notes', e.target.value)} />
        </div>
      </div>
      {sobre && (
        <AvisoSobrecupo sobre={sobre} horas={horas} onHora={(h) => { setForm((f) => ({ ...f, time: h })); setSobre(null); }}
          onForzar={() => enviar(true)} forzarTexto="Reservar de todas formas" />
      )}
      {guardada && <div className={`${s.caja} ${s.bien}`} role="status"><b>Reserva guardada.</b> Ya aparece en la agenda.</div>}
      <div className={s.acciones} style={{ marginTop: 14 }}>
        <Button type="submit" size="touch" disabled={ocupado}>{ocupado ? 'Guardando…' : 'Guardar reserva'}</Button>
      </div>
      {aforo == null && <p className={s.efecto}>Sin mesas configuradas no se comprueba la capacidad.</p>}
    </form>
  );
}

function FilaReserva({
  r, contexto, ahoraMin, corte, hoy, freeTables, configuredTables, busy, correr, restaurantId, delDia, aforo, duracion, confirmar,
}: {
  r: Reservation; contexto: 'hoy' | 'revisar' | 'proxima'; ahoraMin: number; corte: number; hoy: string;
  freeTables: MesaRecepcion[]; configuredTables: MesaRecepcion[]; busy: boolean; restaurantId: string;
  correr: (id: string | null, a: Accion, despues?: (r: ReservationResult) => void) => void;
  delDia: Reservation[]; aforo: number | null; duracion: number;
  confirmar: (o: { title: string; description?: string; confirmLabel?: string }) => Promise<boolean>;
}) {
  const [otra, setOtra] = useState('');
  const [cambiando, setCambiando] = useState(false);
  const [nueva, setNueva] = useState({ fecha: r.date, hora: hora(r.time) });
  const [sobre, setSobre] = useState<Sobrecupo | null>(null);
  const estado = ESTADO[r.status];
  const t = (aMinutos(r.time) - corte + 1440) % 1440;

  const prevista = r.table_number != null && freeTables.some((m) => m.n === r.table_number) ? r.table_number : null;
  const sugerida = prevista ?? mesaSugerida(freeTables, r.party_size)?.mesa ?? null;
  const mesa = otra ? Number(otra) : sugerida;
  const compatibles = freeTables.filter((m) => m.capacidad == null || m.capacidad >= r.party_size);

  const cambiar = (status: ReservationStatus, conMesa: number | null = null) =>
    correr(r.id, () => updateReservationStatus(restaurantId, r.id, status, conMesa));

  async function noAsistio() {
    if (await confirmar({ title: `¿${r.customer_name} no asistió?`, description: 'Libera su lugar y queda en el historial; no se borra.', confirmLabel: 'No asistió' })) {
      cambiar('NO_SHOW');
    }
  }

  function reprogramar(forzar: boolean) {
    correr(r.id, () => reprogramarReserva(restaurantId, r.id, nueva.fecha, nueva.hora, r.party_size, forzar), (res) => {
      if (res.sobrecupo) { setSobre(res.sobrecupo); return; }
      if (res.ok) { setCambiando(false); setSobre(null); }
    });
  }

  const horasLibres = sobre && aforo != null && nueva.fecha === hoy
    ? horasConLugar(delDia.filter((x) => ['PENDING', 'CONFIRMED', 'SEATED'].includes(x.status)), r.party_size, aforo, duracion, aMinutos(nueva.hora), 2, r.id)
    : [];

  return (
    <li>
      <div className={s.fila}>
        <div className={s.hora}>
          {hora(r.time)}
          <small>{contexto === 'hoy' ? (r.status === 'SEATED' ? 'en mesa' : t < ahoraMin ? `hace ${duracionTexto(ahoraMin - t)}` : enCuanto(t - ahoraMin)) : fechaCorta(r.date)}</small>
        </div>
        <div className={s.quien}>
          <div className={s.nombre}>
            <b>{r.customer_name}</b>
            <span className={`${s.chip} ${estado.clase}`}>{estado.texto}</span>
          </div>
          <div className={s.meta}>
            {personas(r.party_size)}
            {r.table_number ? ` · mesa ${r.table_number} ${r.status === 'SEATED' ? '' : 'prevista'}` : ''}
            {r.customer_phone ? ` · ${r.customer_phone}` : ''}
          </div>
          {r.notes && <div className={s.notas}>{r.notes}</div>}

          {contexto === 'revisar' && (
            <>
              <div className={s.acciones}>
                <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => cambiar('COMPLETED')}>Llegó</Button>
                <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={noAsistio}>No asistió</Button>
                <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => cambiar('CANCELLED')}>Cancelar</Button>
              </div>
              <p className={s.efecto}>«No asistió» queda en el historial del cliente; no se borra.</p>
            </>
          )}

          {contexto !== 'revisar' && r.status === 'SEATED' && (
            <div className={s.acciones}>
              <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => cambiar('COMPLETED')}>Completar</Button>
            </div>
          )}

          {contexto !== 'revisar' && (r.status === 'PENDING' || r.status === 'CONFIRMED') && (
            <>
              <div className={s.acciones}>
                {contexto === 'hoy' && r.status === 'CONFIRMED' && (
                  <Button type="button" size="sm" variant={t + 30 < ahoraMin ? 'secondary' : 'primary'} disabled={busy}
                    onClick={() => cambiar('SEATED', mesa)}>
                    {mesa ? `Llegó · sentar en ${mesa}` : 'Llegó · sin mesa'}
                  </Button>
                )}
                {contexto === 'hoy' && r.status === 'CONFIRMED' && compatibles.length > 1 && (
                  <select className={s.mesaSelect} aria-label={`Otra mesa para ${r.customer_name}`} value={otra}
                    onChange={(e) => setOtra(e.target.value)}>
                    <option value="">Otra mesa…</option>
                    {compatibles.map(({ n, capacidad }) => <option key={n} value={n}>Mesa {n}{capacidad ? ` · ${capacidad} plazas` : ''}</option>)}
                  </select>
                )}
                {r.status === 'PENDING' && (
                  <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => cambiar('CONFIRMED')}>Confirmar</Button>
                )}
                <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => { setCambiando((v) => !v); setSobre(null); }}>
                  Cambiar hora
                </Button>
                {contexto === 'hoy' && t < ahoraMin && (
                  <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={noAsistio}>No asistió</Button>
                )}
                <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => cambiar('CANCELLED')}>Cancelar</Button>
              </div>
              {r.status === 'PENDING' && <p className={s.efecto}>Confirmar aparta su lugar en la agenda; la mesa se elige al llegar.</p>}

              {r.status === 'CONFIRMED' && configuredTables.length > 0 && (
                <label className={s.efecto} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  Mesa prevista
                  <select className={s.mesaSelect} value={r.table_number ?? ''} disabled={busy}
                    onChange={(e) => correr(r.id, () => preverMesaDeReserva(restaurantId, r.id, e.target.value ? Number(e.target.value) : null))}>
                    <option value="">Sin asignar</option>
                    {configuredTables.filter((m) => m.n === r.table_number || m.capacidad == null || m.capacidad >= r.party_size)
                      .map(({ n, capacidad }) => <option key={n} value={n}>Mesa {n}{capacidad ? ` · ${capacidad} plazas` : ''}</option>)}
                  </select>
                </label>
              )}

              {cambiando && (
                <div className={`${s.caja} ${s.neutra}`}>
                  <div className={s.campos} style={{ marginTop: 0 }}>
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
                  <div className={s.acciones}>
                    <Button type="button" size="sm" disabled={busy} onClick={() => reprogramar(false)}>Guardar el cambio</Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setCambiando(false)}>Cerrar</Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
        {contexto === 'proxima' && <Icon name="calendar" size={16} style={{ flexShrink: 0, color: 'var(--u-text-3)' }} />}
      </div>
    </li>
  );
}
