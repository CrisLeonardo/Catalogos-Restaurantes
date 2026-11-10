'use client';

/* WaitlistPanel — la cola de quien llega sin reservar (recepción, 1.8).
   Maqueta aprobada: docs/diseno/MAQUETA_RECEPCION_2026-11-09.html

   · La cola es la de HOY (día de negocio del local); lo que quedó de días
     anteriores pasa a «Por revisar» y el historial es el de hoy (X13, PA-T19).
   · Abrir WhatsApp no es avisar: la fila pregunta «¿se envió?» y sólo la
     confirmación del host cuenta (R18.2, PA-T20).
   · Sugiere la mesa más justa y estima la espera como rango con evidencia. */

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import {
  addToWaitlist, markWaitlistAvisoAbierto, markWaitlistNotified, retirarAvisoAbierto,
  markWaitlistSeated, markWaitlistNoShow, cancelWaitlistEntry, type WaitlistResult,
} from '@/lib/actions/waitlist';
import type { WaitlistEntry } from '@/lib/db/waitlist';
import type { MesaRecepcion } from '@/lib/db/table-sessions';
import { estadoDeAviso, mesaSugerida, rangoDeEspera } from '@/lib/recepcion/agenda';
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
  if (mins < 1) return 'recién llegó';
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)} h ${mins % 60} min`;
}

function whatsappHref(phone: string, restaurantName: string): string {
  const digits = phone.replace(/[^\d]/g, '');
  const msg = encodeURIComponent(`¡Hola! Ya tenemos mesa lista para ustedes en ${restaurantName || 'el restaurante'}. Te esperamos.`);
  return `https://wa.me/${digits}?text=${msg}`;
}

const personas = (n: number) => `${n} ${n === 1 ? 'persona' : 'personas'}`;

export default function WaitlistPanel({
  restaurantId, restaurantName, timezone, etiquetaHoy, cola, porRevisar, historial, esperasDeHoy, freeTables,
}: Props) {
  const router = useRouter();
  const [agregando, setAgregando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [otraMesa, setOtraMesa] = useState<Record<string, string>>({});
  const [form, setForm] = useState({ customer_name: '', party_size: 2, phone: '', notes: '' });

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const rango = useMemo(() => rangoDeEspera(esperasDeHoy), [esperasDeHoy]);
  const personasEnCola = cola.reduce((n, w) => n + w.party_size, 0);

  /** Corre una acción, muestra su error y vuelve a pedir la página (la ruta reescrita no siempre se repinta sola). */
  function correr(id: string | null, accion: () => Promise<WaitlistResult>, despues?: () => void) {
    setBusyId(id);
    setError(null);
    startTransition(async () => {
      const res = await accion();
      setBusyId(null);
      if (res.error) setError(res.error);
      else despues?.();
      router.refresh();
    });
  }

  function agregar(e: React.FormEvent) {
    e.preventDefault();
    correr(null, () => addToWaitlist(restaurantId, form), () => {
      setForm({ customer_name: '', party_size: 2, phone: '', notes: '' });
      setAgregando(false);
    });
  }

  return (
    <div className={s.raiz}>
      <div className={s.cabecera}>
        <div>
          <h2>Lista de espera</h2>
          <p>Hoy, {etiquetaHoy}</p>
        </div>
        {!agregando && (
          <Button type="button" size="touch" onClick={() => setAgregando(true)}>
            <Icon name="plus" size={16} /> Agregar grupo
          </Button>
        )}
      </div>

      <div className={s.stats}>
        <div className={`${s.card} ${s.stat}`}>
          <span>Esperando</span>
          <strong>{cola.length}</strong>
          <small>{personas(personasEnCola)}</small>
        </div>
        <div className={`${s.card} ${s.stat}`}>
          <span>Espera estimada</span>
          <strong>{rango ? `${rango.desde}–${rango.hasta} min` : '—'}</strong>
          <small>{rango ? `según ${rango.grupos} grupos de hoy` : 'Se estima con 3 grupos sentados hoy'}</small>
        </div>
      </div>

      {error && <div className={s.error} role="alert">{error}</div>}

      {agregando && (
        <form className={`${s.card} ${s.form}`} onSubmit={agregar} aria-labelledby="espera-form-t">
          <h3 id="espera-form-t">Agregar a la lista</h3>
          <div className={s.campos}>
            <div className={s.completo}>
              <label htmlFor="espera-nombre">Nombre del grupo *</label>
              <input id="espera-nombre" autoComplete="off" className="adm-field" required autoFocus placeholder="Familia Pérez"
                value={form.customer_name} onChange={(e) => setForm((f) => ({ ...f, customer_name: e.target.value }))} />
            </div>
            <div>
              <label htmlFor="espera-personas">Personas *</label>
              <input id="espera-personas" className="adm-field" type="number" inputMode="numeric" min={1} max={100} required
                value={form.party_size} onChange={(e) => setForm((f) => ({ ...f, party_size: parseInt(e.target.value) || 1 }))} />
            </div>
            <div>
              <label htmlFor="espera-telefono">Teléfono</label>
              <input id="espera-telefono" type="tel" inputMode="tel" autoComplete="off" className="adm-field" placeholder="Para avisar por WhatsApp"
                value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
            </div>
            <div className={s.completo}>
              <label htmlFor="espera-notas">Notas</label>
              <textarea id="espera-notas" className="adm-field" style={{ resize: 'vertical', minHeight: 60 }} placeholder="Silla para bebé, terraza…"
                value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
          <div className={s.acciones} style={{ marginTop: 14 }}>
            <Button type="submit" size="touch" disabled={isPending}>{isPending && busyId === null ? 'Agregando…' : 'Agregar a la lista'}</Button>
            <Button type="button" size="touch" variant="ghost" onClick={() => setAgregando(false)}>Cancelar</Button>
          </div>
        </form>
      )}

      <div className={s.columnas}>
        <section className={s.seccion} aria-labelledby="cola-t">
          <h3 id="cola-t">En la cola</h3>
          {cola.length === 0 ? (
            <EmptyState
              icon="users"
              title="Nadie está esperando mesa"
              desc="Cuando el local se llene, anota aquí a cada grupo y avísales en cuanto su mesa esté lista."
              action={{ label: 'Agregar un grupo', onClick: () => setAgregando(true) }}
            />
          ) : (
            <div className={s.card}>
              <ul className={s.lista}>
                {cola.map((w) => {
                  const busy = busyId === w.id && isPending;
                  const aviso = estadoDeAviso(w);
                  const sugerida = mesaSugerida(freeTables, w.party_size);
                  const elegida = otraMesa[w.id] ?? '';
                  const compatibles = freeTables.filter((m) => m.capacidad == null || m.capacidad >= w.party_size);
                  return (
                    <li key={w.id}>
                      <div className={s.fila}>
                        <div className={s.hora}>{horaLocal(w.created_at, timezone)}<small>{esperando(w.created_at, now)}</small></div>
                        <div className={s.quien}>
                          <div className={s.nombre}>
                            <b>{w.customer_name}</b>
                            {aviso === 'avisado' && (
                              <span className={`${s.chip} ${s.ok}`}>
                                Avisados por ti · {horaLocal(w.notified_at, timezone)}
                              </span>
                            )}
                            {aviso === 'abierto' && <span className={`${s.chip} ${s.warn}`}>WhatsApp abierto · ¿se envió?</span>}
                            {aviso === 'sin_avisar' && <span className={s.chip}>Sin avisar</span>}
                          </div>
                          <div className={s.meta}>
                            {personas(w.party_size)}{w.phone ? ` · ${w.phone}` : ' · sin teléfono'}
                            {aviso === 'avisado' && w.notified_via ? ` · ${w.notified_via === 'whatsapp' ? 'por WhatsApp' : 'en persona'}` : ''}
                          </div>
                          {w.notes && <div className={s.notas}>{w.notes}</div>}

                          {/* Mesa: la sugerida con su porqué, o elegir otra. */}
                          {freeTables.length > 0 && (
                            <div className={`${s.caja} ${s.neutra} ${s.sugerida}`}>
                              <div>
                                {sugerida && !elegida
                                  ? <><b>Mesa {sugerida.mesa} está libre</b>{sugerida.motivo}</>
                                  : elegida ? <b>Mesa {elegida}</b>
                                    : <><b>Ninguna mesa libre para {w.party_size}</b>Puedes sentarlos sin mesa o esperar a que se libere una.</>}
                              </div>
                              {(sugerida || elegida) && (
                                <Button type="button" size="sm" disabled={busy}
                                  onClick={() => correr(w.id, () => markWaitlistSeated(restaurantId, w.id, Number(elegida || sugerida!.mesa)))}>
                                  Sentar en {elegida || sugerida!.mesa}
                                </Button>
                              )}
                              {compatibles.length > 1 && (
                                <select className={s.mesaSelect} aria-label={`Otra mesa para ${w.customer_name}`} value={elegida}
                                  onChange={(e) => setOtraMesa((p) => ({ ...p, [w.id]: e.target.value }))}>
                                  <option value="">Otra mesa…</option>
                                  {compatibles.map(({ n, capacidad }) => (
                                    <option key={n} value={n}>Mesa {n}{capacidad ? ` · ${capacidad} plazas` : ''}</option>
                                  ))}
                                </select>
                              )}
                            </div>
                          )}

                          {aviso === 'abierto' ? (
                            <div className={`${s.caja} ${s.alerta}`} role="status">
                              <b>¿Se envió el mensaje?</b>
                              Abrir WhatsApp no confirma que lo recibieron.
                              <div className={s.acciones}>
                                <Button type="button" size="sm" variant="secondary" disabled={busy}
                                  onClick={() => correr(w.id, () => markWaitlistNotified(restaurantId, w.id, 'whatsapp'))}>Sí, les avisé</Button>
                                <Button type="button" size="sm" variant="ghost" disabled={busy}
                                  onClick={() => correr(w.id, () => retirarAvisoAbierto(restaurantId, w.id))}>No se envió</Button>
                              </div>
                            </div>
                          ) : (
                            <div className={s.acciones}>
                              {aviso === 'sin_avisar' && w.phone && (
                                <a className={s.wa} href={whatsappHref(w.phone, restaurantName)} target="_blank" rel="noopener noreferrer"
                                  onClick={() => correr(w.id, () => markWaitlistAvisoAbierto(restaurantId, w.id))}>
                                  <Icon name="whatsapp" size={14} /> Abrir WhatsApp
                                </a>
                              )}
                              {aviso === 'sin_avisar' && (
                                <Button type="button" size="sm" variant="ghost" disabled={busy}
                                  onClick={() => correr(w.id, () => markWaitlistNotified(restaurantId, w.id, 'en_persona'))}>Avisé en persona</Button>
                              )}
                              {freeTables.length === 0 && (
                                <Button type="button" size="sm" variant="secondary" disabled={busy}
                                  onClick={() => correr(w.id, () => markWaitlistSeated(restaurantId, w.id, null))}>Sentar</Button>
                              )}
                              <Button type="button" size="sm" variant="ghost" disabled={busy}
                                onClick={() => correr(w.id, () => markWaitlistNoShow(restaurantId, w.id))}>No llegó</Button>
                              <Button type="button" size="sm" variant="ghost" disabled={busy}
                                onClick={() => correr(w.id, () => cancelWaitlistEntry(restaurantId, w.id))}>Quitar</Button>
                            </div>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          {cola.length > 1 && (
            <p className={s.efecto}>Un grupo posterior puede sentarse antes si su mesa se libera primero: el orden lo decides tú.</p>
          )}
        </section>

        <div className={s.columna}>
          {porRevisar.length > 0 && (
            <section className={s.seccion} aria-labelledby="revisar-t">
              <h3 id="revisar-t">Por revisar <small>· días anteriores</small> <span className={`${s.chip} ${s.warn}`}>{porRevisar.length}</span></h3>
              <div className={s.card}>
                <ul className={s.lista}>
                  {porRevisar.map((w) => (
                    <li key={w.id}>
                      <div className={s.fila}>
                        <div className={s.hora}>{horaLocal(w.created_at, timezone)}<small>{fechaCorta(w.created_at, timezone)}</small></div>
                        <div className={s.quien}>
                          <div className={s.nombre}><b>{w.customer_name}</b></div>
                          <div className={s.meta}>{personas(w.party_size)} · {w.status === 'NOTIFIED' ? 'avisado, nunca se sentó' : 'quedó esperando'}</div>
                          <div className={s.acciones}>
                            <Button type="button" size="sm" variant="secondary" disabled={busyId === w.id && isPending}
                              onClick={() => correr(w.id, () => markWaitlistNoShow(restaurantId, w.id))}>No llegó</Button>
                            <Button type="button" size="sm" variant="ghost" disabled={busyId === w.id && isPending}
                              onClick={() => correr(w.id, () => cancelWaitlistEntry(restaurantId, w.id))}>Quitar de la lista</Button>
                          </div>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          )}

          <section className={s.seccion} aria-labelledby="historial-t">
            <h3 id="historial-t">Hoy <small>· ya atendidos</small></h3>
            <div className={s.card}>
              {historial.length === 0 ? (
                <p className={s.vacio}>Todavía nadie de la lista se ha sentado ni ido hoy.</p>
              ) : (
                <ul className={s.lista}>
                  {historial.slice(0, 20).map((w) => (
                    <li key={w.id}>
                      <div className={s.fila}>
                        <div className={s.hora}>{horaLocal(w.created_at, timezone)}</div>
                        <div className={s.quien}>
                          <div className={s.nombre}>
                            <b>{w.customer_name}</b>
                            {w.status === 'SEATED' && <span className={`${s.chip} ${s.ok}`}>Sentados{w.table_number ? ` en la ${w.table_number}` : ''}</span>}
                            {w.status === 'NO_SHOW' && <span className={s.chip}>No llegó</span>}
                            {w.status === 'CANCELLED' && <span className={s.chip}>Quitado</span>}
                          </div>
                          <div className={s.meta}>
                            {personas(w.party_size)}
                            {w.status === 'SEATED' && w.seated_at
                              ? ` · esperó ${Math.max(0, Math.round((new Date(w.seated_at).getTime() - new Date(w.created_at).getTime()) / 60000))} min`
                              : ''}
                          </div>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
