'use client';

import { useEffect, useId, useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { fmtMoney } from '@/lib/money';
import {
  confirmarTraspasoCaja, getTraspasoDeCorte, solicitarTraspasoCaja,
  type RecepcionCaja, type TraspasoCaja,
} from '@/lib/actions/caja-traspasos';
import type { CajaReceipt } from '@/lib/actions/finanzas';

type Cuadre = Pick<CajaReceipt, 'counted' | 'expectedDrawer' | 'difference' | 'closedAt'>;

function Importes({ recibo }: { recibo: Cuadre }) {
  return (
    <dl className="caja-traspaso-importes">
      <div><dt>Efectivo esperado</dt><dd>{fmtMoney(recibo.expectedDrawer)}</dd></div>
      <div><dt>Efectivo contado</dt><dd>{fmtMoney(recibo.counted)}</dd></div>
      <div><dt>Diferencia</dt><dd>{fmtMoney(recibo.difference)}</dd></div>
    </dl>
  );
}

function EstadoTraspaso({ registro, puedeRecibir, vigente = true, restaurantId, timezone }: {
  registro: TraspasoCaja;
  puedeRecibir: boolean;
  vigente?: boolean;
  restaurantId: string;
  timezone: string;
}) {
  const [confirmado, setConfirmado] = useState(registro.confirmado_at);
  const [error, setError] = useState('');
  const [ocupado, iniciar] = useTransition();
  return (
    <div className="caja-traspaso-detalle">
      <strong role="status">{confirmado ? 'Recepción confirmada' : vigente ? 'Pendiente de recepción' : 'Corte anulado'}</strong>
      <dl>
        <div><dt>Entrega</dt><dd>{registro.entrega_nombre}</dd></div>
        <div><dt>Recibe</dt><dd>{registro.recibe_nombre}</dd></div>
      </dl>
      {registro.observacion && <p>{registro.observacion}</p>}
      {!confirmado && vigente && !puedeRecibir && <p>{registro.recibe_nombre} confirma desde su propia sesión.</p>}
      {confirmado && <p>{new Date(confirmado).toLocaleString('es-GT', { dateStyle: 'short', timeStyle: 'short', timeZone: timezone })}</p>}
      {confirmado && !vigente && <p>El corte se anuló después de la recepción.</p>}
      {puedeRecibir && vigente && !confirmado && (
        <Button type="button" size="touch" disabled={ocupado} onClick={() => iniciar(async () => {
          setError('');
          try {
            const res = await confirmarTraspasoCaja(restaurantId, registro.corte_id);
            if (res.registro?.confirmado_at) setConfirmado(res.registro.confirmado_at);
            else setError(res.error ?? 'No se pudo confirmar la recepción.');
          } catch { setError('No se pudo confirmar la recepción. Inténtalo de nuevo.'); }
        })}>{ocupado ? 'Confirmando…' : 'Confirmar recepción'}</Button>
      )}
      {error && <p role="alert" className="caja-traspaso-error">{error}</p>}
    </div>
  );
}

export function RecepcionesPendientes({ restaurantId, timezone, pendientes, error }: {
  restaurantId: string;
  timezone: string;
  pendientes: RecepcionCaja[];
  error?: string;
}) {
  if (error) return <p role="alert" className="caja-traspaso-error">{error}</p>;
  if (!pendientes.length) return null;
  return (
    <section className="caja-tarjeta caja-traspaso" aria-label="Recepciones de Caja">
      <h2>Recepciones de Caja</h2>
      {pendientes.map(({ recibo, ...registro }) => (
        <div key={registro.corte_id} className="caja-traspaso-detalle">
          <p>Cierre del {new Date(recibo.closedAt).toLocaleString('es-GT', { dateStyle: 'short', timeStyle: 'short', timeZone: timezone })}</p>
          <Importes recibo={recibo} />
          <EstadoTraspaso {...{ registro, restaurantId, timezone }} puedeRecibir />
        </div>
      ))}
    </section>
  );
}

export function TraspasoDeRecibo({ restaurantId, timezone, recibo }: {
  restaurantId: string;
  timezone: string;
  recibo: Pick<CajaReceipt, 'id' | 'cashierName'> & Cuadre;
}) {
  const titulo = useId();
  const idReceptor = useId();
  const [lectura, setLectura] = useState<Awaited<ReturnType<typeof getTraspasoDeCorte>> | null>(null);
  const [receptor, setReceptor] = useState('');
  const [nota, setNota] = useState('');
  const [error, setError] = useState('');
  const [ocupado, iniciar] = useTransition();
  const [recarga, setRecarga] = useState(0);
  useEffect(() => {
    let vigente = true;
    getTraspasoDeCorte(restaurantId, recibo.id)
      .then((res) => { if (vigente) setLectura(res); })
      .catch(() => { if (vigente) setLectura({ error: 'No se pudo leer el traspaso.' }); });
    return () => { vigente = false; };
  }, [restaurantId, recibo.id, recarga]);

  if (!lectura) return <p role="status">Consultando traspaso…</p>;
  if (!lectura.error && !lectura.registro && !lectura.receptores) return null;

  return (
    <section className="caja-tarjeta caja-traspaso" aria-labelledby={titulo}>
      <h2 id={titulo}>Traspaso de turno</h2>
      {lectura.error ? (
        <div className="caja-traspaso-detalle">
          <p role="alert" className="caja-traspaso-error">{lectura.error}</p>
          <Button type="button" variant="outline" size="touch" onClick={() => { setLectura(null); setRecarga((n) => n + 1); }}>Reintentar lectura</Button>
        </div>
      ) : lectura.registro ? (
        <EstadoTraspaso registro={lectura.registro} puedeRecibir={!!lectura.puedeRecibir} vigente={lectura.vigente}
          restaurantId={restaurantId} timezone={timezone} />
      ) : (
        <>
          <Importes recibo={recibo} />
          {lectura.receptores?.length ? (
            <form className="caja-traspaso-detalle" onSubmit={(event) => {
              event.preventDefault();
              iniciar(async () => {
                setError('');
                try {
                  const res = await solicitarTraspasoCaja(restaurantId, recibo.id, receptor, nota);
                  if (res.registro) setLectura({ registro: res.registro, vigente: true });
                  else setError(res.error ?? 'No se pudo registrar la entrega.');
                } catch { setError('No se pudo registrar la entrega. Inténtalo de nuevo.'); }
              });
            }}>
              <div className="caja-traspaso-personas">
                <p>Entrega <strong>{recibo.cashierName ?? 'Caja'}</strong></p>
                <div className="caja-traspaso-receptor">
                  <label htmlFor={idReceptor}>Recibe</label>
                  <select id={idReceptor} className="adm-field adm-field-lg" value={receptor} onChange={(e) => setReceptor(e.target.value)} required>
                    <option value="">Selecciona a la persona</option>
                    {lectura.receptores.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                  </select>
                </div>
              </div>
              <label>{recibo.difference !== 0 ? 'Observación de la diferencia' : 'Observación (opcional)'}
                <textarea className="adm-field adm-field-lg" rows={2} maxLength={500} required={recibo.difference !== 0}
                  value={nota} onChange={(e) => setNota(e.target.value)} />
              </label>
              {error && <p role="alert" className="caja-traspaso-error">{error}</p>}
              <Button type="submit" size="touch" disabled={ocupado || !receptor || (recibo.difference !== 0 && !nota.trim())}>
                {ocupado ? 'Registrando…' : 'Solicitar recepción'}
              </Button>
            </form>
          ) : <p>No hay otra persona con acceso a Caja en este restaurante.</p>}
        </>
      )}
    </section>
  );
}
