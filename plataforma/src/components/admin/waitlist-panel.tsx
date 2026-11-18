'use client';

/* WaitlistPanel — la cola de quien llega sin reservar.
   Auditoría 1.8 (maqueta del 2026-11-09) y línea N «nada saturado»
   (maqueta aprobada el 2026-11-17: docs/diseno/MAQUETA_RECEPCION_NADA_SATURADO_2026-11-17.html).

   · Una fila de mandos: Esperan · Atendidos · Revisar (solo si quedó algo de
     días anteriores) y «Agregar grupo», que abre una hoja.
   · Cada grupo lleva avisar por WhatsApp (si tiene teléfono y aún no se le
     avisó) y sentar en la mesa sugerida. Lo demás, en la hoja del grupo.
   · Abrir WhatsApp no es avisar: la fila pregunta «¿se envió?» y solo la
     confirmación de quien recibe cuenta (R18.2, PA-T20).
   · La cola y el historial son los del día de negocio (X13, PA-T19). */

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { HojaOperativa } from '@/components/ui/hoja-operativa';
import {
  addToWaitlist, markWaitlistAvisoAbierto, markWaitlistNotified, retirarAvisoAbierto,
  markWaitlistSeated, markWaitlistNoShow, cancelWaitlistEntry, type WaitlistResult,
} from '@/lib/actions/waitlist';
import type { WaitlistEntry } from '@/lib/db/waitlist';
import type { MesaRecepcion } from '@/lib/db/table-sessions';
import { estadoDeAviso, mesaSugerida, rangoDeEspera } from '@/lib/recepcion/agenda';
import { Aviso, Mandos, personas } from './recepcion-comun';
import s from './recepcion.module.css';

interface Props {
  restaurantId: string;
  restaurantName: string;
  timezone: string;
  /** «domingo 9 de noviembre», el día de negocio. */
  etiquetaHoy: string;
  cola: WaitlistEntry[];
  porRevisar: WaitlistEntry[];
  historial: WaitlistEntry[];
  esperasDeHoy: number[];
  /** Mesas sin gente ni turno abierto. Vacío = el local no usa mesas numeradas o no queda ninguna. */
  freeTables: MesaRecepcion[];
}

type Vista = 'cola' | 'atendidos' | 'revisar';

function horaLocal(iso: string | null | undefined, tz: string): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleTimeString('es-GT', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  } catch {
    return new Date(iso).toLocaleTimeString('es-GT', { hour: '2-digit', minute: '2-digit' });
  }
}

function fechaCorta(iso: string, tz: string): string {
  try {
    return new Date(iso).toLocaleDateString('es-GT', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short' });
  } catch {
    return iso.slice(0, 10);
  }
}

function esperando(from: string, now: number): string {
  const mins = Math.max(0, Math.round((now - new Date(from).getTime()) / 60000));
  if (mins < 1) return 'recién';
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)} h ${mins % 60}`;
}

function whatsappHref(phone: string, restaurantName: string): string {
  const digits = phone.replace(/[^\d]/g, '');
  const msg = encodeURIComponent(`¡Hola! Ya tenemos mesa lista para ustedes en ${restaurantName || 'el restaurante'}. Te esperamos.`);
  return `https://wa.me/${digits}?text=${msg}`;
}

export default function WaitlistPanel({
  restaurantId, restaurantName, timezone, etiquetaHoy, cola, porRevisar, historial, esperasDeHoy, freeTables,
}: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [hecho, setHecho] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [vista, setVista] = useState<Vista>('cola');
  const [abierto, setAbierto] = useState<{ id: string; revisar: boolean } | null>(null);
  const [agregando, setAgregando] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const rango = useMemo(() => rangoDeEspera(esperasDeHoy), [esperasDeHoy]);
  const personasEnCola = cola.reduce((n, w) => n + w.party_size, 0);
  const vistaReal: Vista = vista === 'revisar' && porRevisar.length === 0 ? 'cola' : vista;

  /** Corre una acción, muestra su error y vuelve a pedir la página (la ruta reescrita no siempre se repinta sola). */
  function correr(id: string | null, accion: () => Promise<WaitlistResult>, despues?: () => void, exito?: string) {
    setBusyId(id);
    setError(null);
    setHecho(null);
    startTransition(async () => {
      const res = await accion();
      setBusyId(null);
      if (res.error) setError(res.error);
      else {
        if (exito) setHecho(exito);
        despues?.();
      }
      router.refresh();
    });
  }

  const sentar = (w: WaitlistEntry, mesa: number | null) =>
    correr(w.id, () => markWaitlistSeated(restaurantId, w.id, mesa), undefined,
      mesa ? `${w.customer_name}, sentados en la mesa ${mesa}.` : `${w.customer_name}, sentados.`);

  const todas = [...cola, ...porRevisar];
  const enHoja = abierto ? todas.find((w) => w.id === abierto.id) ?? null : null;

  return (
    <div className={s.raiz} data-angosta="">
      <Mandos
        valor={vistaReal}
        onCambio={setVista}
        etiqueta={`Lista de espera de hoy, ${etiquetaHoy}`}
        pestanas={[
          { valor: 'cola', texto: 'Esperan', cuenta: cola.length },
          { valor: 'atendidos', texto: 'Atendidos', cuenta: historial.length },
          ...(porRevisar.length > 0 ? [{ valor: 'revisar' as const, texto: 'Revisar', cuenta: porRevisar.length, aviso: true }] : []),
        ]}
        boton="Agregar grupo"
        botonCorto="Grupo"
        onBoton={() => { setError(null); setHecho(null); setAgregando(true); }}
      />

      <Aviso error={abierto || agregando ? null : error} hecho={hecho} />

      {vistaReal === 'cola' && (
        <div className={s.unaColumna}>
          {cola.length === 0 ? (
            <EmptyState
              icon="users"
              title="Nadie está esperando mesa"
              desc="Cuando el local se llene, anota aquí a cada grupo y avísales en cuanto su mesa esté lista."
              action={{ label: 'Agregar un grupo', onClick: () => setAgregando(true) }}
            />
          ) : (
            <>
              <p className={s.resumen}>
                <b>{personas(personasEnCola)}</b> esperando
                {rango ? <> · espera estimada <b>{rango.desde}–{rango.hasta} min</b></> : ' · el orden lo decides tú'}
              </p>
              <div className={s.card}>
                <ul className={s.lista}>
                  {cola.map((w) => (
                    <FilaGrupo key={w.id} w={w} now={now} timezone={timezone} restaurantName={restaurantName}
                      freeTables={freeTables} busy={busyId === w.id && isPending} ocupado={isPending}
                      onAbrir={() => { setError(null); setAbierto({ id: w.id, revisar: false }); }}
                      onSentar={sentar}
                      onAbrirWhatsapp={() => correr(w.id, () => markWaitlistAvisoAbierto(restaurantId, w.id))}
                      onSeEnvio={(si) => si
                        ? correr(w.id, () => markWaitlistNotified(restaurantId, w.id, 'whatsapp'), undefined, `${w.customer_name}: avisados por WhatsApp.`)
                        : correr(w.id, () => retirarAvisoAbierto(restaurantId, w.id))}
                    />
                  ))}
                </ul>
              </div>
            </>
          )}
        </div>
      )}

      {vistaReal === 'atendidos' && (
        <div className={s.unaColumna}>
          {historial.length === 0 ? (
            <div className={s.card}><p className={s.vacio}>Todavía nadie de la lista se ha sentado ni ido hoy.</p></div>
          ) : (
            <div className={s.card}>
              <ul className={s.lista}>
                {historial.slice(0, 40).map((w) => {
                  const espero = w.status === 'SEATED' && w.seated_at
                    ? Math.max(0, Math.round((new Date(w.seated_at).getTime() - new Date(w.created_at).getTime()) / 60000))
                    : null;
                  return (
                    <li key={w.id}>
                      <div className={s.fila} style={{ paddingLeft: 14 }}>
                        <span className={s.hora}>{horaLocal(w.created_at, timezone)}</span>
                        <span className={s.quien}>
                          <span className={s.nombre}>{w.customer_name}</span>
                          <span className={s.meta}>
                            {w.status === 'SEATED' && <span data-tono="bien">Sentados{w.table_number ? ` en la ${w.table_number}` : ''}</span>}
                            {w.status === 'NO_SHOW' && 'No llegó'}
                            {w.status === 'CANCELLED' && 'Quitado'}
                            {' · '}{personas(w.party_size)}
                            {espero != null ? ` · esperó ${espero} min` : ''}
                          </span>
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      )}

      {vistaReal === 'revisar' && (
        <div className={s.unaColumna}>
          <p className={s.resumen}>Grupos de días anteriores que nadie marcó.</p>
          <div className={s.card}>
            <ul className={s.lista}>
              {porRevisar.map((w) => (
                <li key={w.id}>
                  <div className={s.fila}>
                    <button type="button" className={s.abrir} aria-haspopup="dialog"
                      onClick={() => { setError(null); setAbierto({ id: w.id, revisar: true }); }}>
                      <span className={s.hora}>{horaLocal(w.created_at, timezone)}<small>{fechaCorta(w.created_at, timezone)}</small></span>
                      <span className={s.quien}>
                        <span className={s.nombre}>{w.customer_name}</span>
                        <span className={s.meta}>{personas(w.party_size)} · {w.status === 'NOTIFIED' ? 'avisado, nunca se sentó' : 'quedó esperando'}</span>
                      </span>
                    </button>
                    <span className={s.accion}>
                      <Button type="button" size="touch" variant="secondary" disabled={isPending}
                        onClick={() => correr(w.id, () => markWaitlistNoShow(restaurantId, w.id), undefined, `${w.customer_name}: no llegó.`)}>
                        No llegó
                      </Button>
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {enHoja && abierto && (
        <HojaGrupo
          w={enHoja} revisar={abierto.revisar} now={now} timezone={timezone} restaurantName={restaurantName}
          freeTables={freeTables} busy={busyId === enHoja.id && isPending} error={error}
          onClose={() => setAbierto(null)}
          onSentar={(mesa) => { sentar(enHoja, mesa); setAbierto(null); }}
          onAbrirWhatsapp={() => correr(enHoja.id, () => markWaitlistAvisoAbierto(restaurantId, enHoja.id), () => setAbierto(null))}
          onEnPersona={() => correr(enHoja.id, () => markWaitlistNotified(restaurantId, enHoja.id, 'en_persona'), () => setAbierto(null), `${enHoja.customer_name}: avisados en persona.`)}
          onNoLlego={() => correr(enHoja.id, () => markWaitlistNoShow(restaurantId, enHoja.id), () => setAbierto(null), `${enHoja.customer_name}: no llegó.`)}
          onQuitar={() => correr(enHoja.id, () => cancelWaitlistEntry(restaurantId, enHoja.id), () => setAbierto(null), `${enHoja.customer_name}: quitados de la lista.`)}
        />
      )}

      {agregando && (
        <HojaAgregarGrupo ocupado={isPending} error={error} onClose={() => setAgregando(false)}
          onAgregar={(form) => correr(null, () => addToWaitlist(restaurantId, form), () => setAgregando(false),
            `${form.customer_name.trim()} está en la lista.`)} />
      )}
    </div>
  );
}

function FilaGrupo({ w, now, timezone, restaurantName, freeTables, busy, ocupado, onAbrir, onSentar, onAbrirWhatsapp, onSeEnvio }: {
  w: WaitlistEntry; now: number; timezone: string; restaurantName: string; freeTables: MesaRecepcion[];
  busy: boolean; ocupado: boolean;
  onAbrir: () => void; onSentar: (w: WaitlistEntry, mesa: number | null) => void;
  onAbrirWhatsapp: () => void; onSeEnvio: (si: boolean) => void;
}) {
  const aviso = estadoDeAviso(w);
  const sugerida = mesaSugerida(freeTables, w.party_size);
  const partes: React.ReactNode[] = [];
  if (aviso === 'avisado') partes.push(<span key="a" data-tono="bien">Avisados {horaLocal(w.notified_at, timezone)}</span>);
  if (!sugerida && freeTables.length > 0) partes.push(<span key="m" data-tono="aviso">Sin mesa para {w.party_size}</span>);
  partes.push(<span key="n">{personas(w.party_size)}</span>);
  if (!w.phone) partes.push(<span key="t">sin teléfono</span>);
  else partes.push(<span key="t" className={s.metaPc}>{w.phone}</span>);
  if (w.notes) partes.push(<span key="o">{w.notes}</span>);

  return (
    <li>
      <div className={s.fila}>
        <button type="button" className={s.abrir} onClick={onAbrir} aria-haspopup="dialog">
          <span className={s.hora}>{esperando(w.created_at, now)}<small>{horaLocal(w.created_at, timezone)}</small></span>
          <span className={s.quien}>
            <span className={s.nombre}>{w.customer_name}</span>
            <span className={s.meta}>{partes}</span>
          </span>
        </button>
        <span className={s.accion}>
          {aviso === 'sin_avisar' && w.phone && (
            <a className={s.wa} data-solo="" href={whatsappHref(w.phone, restaurantName)} target="_blank" rel="noopener noreferrer"
              aria-label={`Avisar a ${w.customer_name} por WhatsApp`} title="Avisar por WhatsApp" onClick={onAbrirWhatsapp}>
              <Icon name="whatsapp" size={20} />
            </a>
          )}
          <Button type="button" size="touch" variant={sugerida ? 'primary' : 'secondary'} disabled={ocupado}
            onClick={() => onSentar(w, sugerida?.mesa ?? null)}>
            {busy ? '…' : sugerida ? `Sentar en ${sugerida.mesa}` : 'Sentar'}
          </Button>
        </span>
      </div>
      {aviso === 'abierto' && (
        <div className={s.pregunta} role="status">
          <span>¿Se envió el WhatsApp?</span>
          <Button type="button" size="sm" variant="secondary" disabled={ocupado} onClick={() => onSeEnvio(true)}>Sí, les avisé</Button>
          <Button type="button" size="sm" variant="ghost" disabled={ocupado} onClick={() => onSeEnvio(false)}>No</Button>
        </div>
      )}
    </li>
  );
}

function HojaGrupo({
  w, revisar, now, timezone, restaurantName, freeTables, busy, error, onClose, onSentar, onAbrirWhatsapp, onEnPersona, onNoLlego, onQuitar,
}: {
  w: WaitlistEntry; revisar: boolean; now: number; timezone: string; restaurantName: string; freeTables: MesaRecepcion[];
  busy: boolean; error: string | null;
  onClose: () => void; onSentar: (mesa: number | null) => void; onAbrirWhatsapp: () => void;
  onEnPersona: () => void; onNoLlego: () => void; onQuitar: () => void;
}) {
  const [otra, setOtra] = useState('');
  const aviso = estadoDeAviso(w);
  const sugerida = mesaSugerida(freeTables, w.party_size);
  const compatibles = freeTables.filter((m) => m.capacidad == null || m.capacidad >= w.party_size);
  const mesa = otra ? Number(otra) : sugerida?.mesa ?? null;
  const cuando = revisar ? fechaCorta(w.created_at, timezone) : `espera ${esperando(w.created_at, now)}`;

  return (
    <HojaOperativa
      label={`Grupo ${w.customer_name}`}
      title={w.customer_name}
      className="hoja-recepcion"
      resumen={<p className={s.hojaResumen}>{personas(w.party_size)} · {cuando}{aviso === 'avisado' ? ` · avisados ${horaLocal(w.notified_at, timezone)}` : ''}</p>}
      onClose={onClose}
      footer={revisar ? null : (
        <div className={s.pie}>
          <Button type="button" size="action" disabled={busy} onClick={() => onSentar(mesa)}>
            {mesa ? `Sentar en ${mesa}` : 'Sentar sin mesa'}
          </Button>
        </div>
      )}
    >
      <div className={s.hojaCuerpo}>
        {error && <div className={s.error} role="alert">{error}</div>}
        {w.notes && <div className={s.nota}>{w.notes}</div>}
        {!revisar && sugerida && !otra && <p className={s.hojaResumen}>Mesa {sugerida.mesa}: {sugerida.motivo.replace(/\.$/, '').toLowerCase()}.</p>}

        {!revisar && (compatibles.length > 1 || w.phone) && (
          <ul className={s.opciones}>
            {compatibles.length > 1 && (
              <li>
                <label className={s.opcion}>
                  <span>Otra mesa</span>
                  <select value={otra} onChange={(e) => setOtra(e.target.value)}>
                    <option value="">{sugerida ? `Mesa ${sugerida.mesa} (sugerida)` : 'Elegir…'}</option>
                    {compatibles.map(({ n, capacidad }) => <option key={n} value={n}>Mesa {n}{capacidad ? ` · ${capacidad} plazas` : ''}</option>)}
                  </select>
                </label>
              </li>
            )}
            {w.phone && aviso !== 'avisado' && (
              <li>
                <a className={s.opcion} href={whatsappHref(w.phone, restaurantName)} target="_blank" rel="noopener noreferrer" onClick={onAbrirWhatsapp}>
                  <Icon name="whatsapp" size={16} /><span>Avisar por WhatsApp</span><em>{w.phone}</em>
                </a>
              </li>
            )}
            {w.phone && (
              <li>
                <a className={s.opcion} href={`tel:${w.phone.replace(/[^\d+]/g, '')}`}>
                  <Icon name="phone" size={16} /><span>Llamar</span>{aviso === 'avisado' && <em>{w.phone}</em>}
                </a>
              </li>
            )}
          </ul>
        )}

        <ul className={s.opciones}>
          {!revisar && aviso === 'sin_avisar' && (
            <li><button type="button" className={s.opcion} disabled={busy} onClick={onEnPersona}><span>Avisé en persona</span></button></li>
          )}
          <li><button type="button" className={s.opcion} disabled={busy} onClick={onNoLlego}><span>No llegó</span><em>queda en el historial</em></button></li>
          <li><button type="button" className={s.opcion} data-tono="peligro" disabled={busy} onClick={onQuitar}><span>Quitar de la lista</span></button></li>
        </ul>
        {!revisar && <p className={s.hojaResumen}>Un grupo posterior puede sentarse antes si su mesa se libera primero: el orden lo decides tú.</p>}
      </div>
    </HojaOperativa>
  );
}

type FormGrupo = { customer_name: string; party_size: number; phone: string; notes: string };

function HojaAgregarGrupo({ ocupado, error, onClose, onAgregar }: {
  ocupado: boolean; error: string | null; onClose: () => void; onAgregar: (f: FormGrupo) => void;
}) {
  const [form, setForm] = useState<FormGrupo>({ customer_name: '', party_size: 2, phone: '', notes: '' });
  const [conNota, setConNota] = useState(false);
  return (
    <HojaOperativa
      label="Agregar a la lista"
      className="hoja-recepcion"
      onClose={onClose}
      footer={(
        <div className={s.pie}>
          <Button type="submit" form="agregar-grupo" size="action" disabled={ocupado}>{ocupado ? 'Agregando…' : 'Agregar a la lista'}</Button>
        </div>
      )}
    >
      <form id="agregar-grupo" className={s.hojaCuerpo} onSubmit={(e) => { e.preventDefault(); onAgregar(form); }}>
        {error && <div className={s.error} role="alert">{error}</div>}
        <div className={s.campos}>
          <div className={s.completo}>
            <label htmlFor="espera-nombre">Nombre del grupo</label>
            <input id="espera-nombre" autoComplete="off" className="adm-field" required placeholder="Familia Pérez"
              value={form.customer_name} onChange={(e) => setForm((f) => ({ ...f, customer_name: e.target.value }))} />
          </div>
          <div>
            <label htmlFor="espera-personas">Personas</label>
            <input id="espera-personas" className="adm-field" type="number" inputMode="numeric" min={1} max={100} required
              value={form.party_size} onChange={(e) => setForm((f) => ({ ...f, party_size: parseInt(e.target.value) || 1 }))} />
          </div>
          <div>
            <label htmlFor="espera-telefono">Teléfono</label>
            <input id="espera-telefono" type="tel" inputMode="tel" autoComplete="off" className="adm-field" placeholder="Para avisar"
              value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
          </div>
        </div>
        {conNota ? (
          <div>
            <label htmlFor="espera-notas" className={s.campoTitulo}>Nota</label>
            <textarea id="espera-notas" className="adm-field" autoFocus style={{ resize: 'vertical', minHeight: 60 }} placeholder="Silla para bebé, terraza…"
              value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
          </div>
        ) : (
          <button type="button" className={s.agregarNota} onClick={() => setConNota(true)}>+ Agregar una nota</button>
        )}
      </form>
    </HojaOperativa>
  );
}
