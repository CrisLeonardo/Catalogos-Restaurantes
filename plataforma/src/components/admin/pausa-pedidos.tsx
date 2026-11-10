'use client';

/* ============================================================
   PAUSA DE PEDIDOS — acción inmediata (auditoría 2026-11-03, 0.4)
   ------------------------------------------------------------
   Antes era un interruptor dentro del formulario de horario: decía
   «Pedidos en pausa» en cuanto se tocaba y no pausaba nada hasta que
   alguien guardaba el horario (X01). Ahora:
     · la tarjeta SOLO cambia cuando el servidor confirma;
     · mientras guarda dice «Pausando…» y sigue diciendo «Recibiendo»;
     · si falla, lo dice y recuerda que los clientes siguen pidiendo;
     · la pausa puede tener fin (15 / 30 / 60 min) y termina sola.
   Maqueta aprobada: https://claude.ai/artifact/EPL6nSoti8abF1My1YiN8p
   ============================================================ */

import { useEffect, useState, useTransition } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FIELD_LABEL } from '@/components/admin/field-label';
import { pausarPedidos, extenderPausaPedidos, reanudarPedidos, type PausaResult } from '@/lib/actions/restaurant';
import {
  DURACIONES_PAUSA, EXTENSION_PAUSA_MIN, conPunto, estadoDePausa, finDePausa, fraseDeRegreso, horaDePausa,
  minutosRestantes, type DuracionPausa,
} from '@/lib/pausa-pedidos';

interface Guardada {
  orders_paused: boolean;
  orders_paused_until: string | null;
  pause_message: string | null;
}

interface Props {
  restaurantId: string;
  timezone: string;
  inicial: Guardada;
  /** Hora del servidor al pintar: el primer render del cliente usa la misma
      y no hay diferencia de hidratación en «faltan N min». */
  pintadoEn: number;
}

type Accion = 'pausar' | 'extender' | 'reanudar';

const NOMBRE_DURACION: Record<DuracionPausa, string> = { 15: '15 min', 30: '30 min', 60: '1 hora', 0: 'Hasta reactivar' };
const VERBO_PENDIENTE: Record<Accion, string> = { pausar: 'Pausando…', extender: 'Extendiendo…', reanudar: 'Reanudando…' };
const FALLO: Record<Accion, string> = {
  pausar: 'No se pudo pausar',
  extender: 'No se pudo extender la pausa',
  reanudar: 'No se pudo reanudar',
};

export default function PausaPedidos({ restaurantId, timezone, inicial, pintadoEn }: Props) {
  const [guardada, setGuardada] = useState<Guardada>(inicial);
  const [ahora, setAhora] = useState(pintadoEn);
  const [eligiendo, setEligiendo] = useState(false);
  const [duracion, setDuracion] = useState<DuracionPausa>(30);
  const [mensaje, setMensaje] = useState(inicial.pause_message ?? '');
  const [error, setError] = useState<{ accion: Accion; texto: string } | null>(null);
  const [enCurso, setEnCurso] = useState<Accion | null>(null);
  const [, startTransition] = useTransition();

  // Reloj vivo: la cuenta regresiva y el fin automático sin recargar.
  useEffect(() => {
    setAhora(Date.now());
    const id = setInterval(() => setAhora(Date.now()), 15_000);
    return () => clearInterval(id);
  }, []);

  const estado = estadoDePausa(guardada, ahora);
  const enPausa = estado.tipo === 'pausa';

  function ejecutar(accion: Accion, llamada: () => Promise<PausaResult>) {
    setError(null);
    setEnCurso(accion);
    startTransition(async () => {
      let res: PausaResult;
      try {
        res = await llamada();
      } catch {
        res = { error: 'Revisa tu conexión.' };
      }
      setEnCurso(null);
      if ('error' in res) {
        setError({ accion, texto: res.error });
        return;
      }
      setGuardada({ orders_paused: res.orders_paused, orders_paused_until: res.orders_paused_until, pause_message: res.pause_message });
      setAhora(Date.now());
      setEligiendo(false);
    });
  }

  const pausar = () => ejecutar('pausar', () => pausarPedidos(restaurantId, duracion, mensaje));
  const extender = () => ejecutar('extender', () => extenderPausaPedidos(restaurantId));
  const reanudar = () => ejecutar('reanudar', () => reanudarPedidos(restaurantId));

  // Lo que verá el comensal, calculado igual que el checkout.
  const finPrevisto = finDePausa(duracion, ahora);
  const textoComensal = [
    mensaje.trim() ? `«${conPunto(mensaje)}»` : null,
    fraseDeRegreso(finPrevisto, timezone) ?? (mensaje.trim() ? null : 'Los pedidos están en pausa por el momento.'),
  ].filter(Boolean).join(' ');

  const ctaPausar = duracion === 0 ? 'Pausar hasta reactivar' : `Pausar ${NOMBRE_DURACION[duracion]}`;
  const ocupado = enCurso !== null;

  return (
    <Card
      data-tour-step="perfil-pausa"
      className="p-4"
      style={{ display: 'flex', flexDirection: 'column', gap: 12, border: enPausa ? '1px solid var(--c-warn-line)' : undefined }}
      aria-live="polite"
    >
      {/* ── Estado confirmado ── */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 600, color: 'var(--u-text)' }}>
          <span aria-hidden style={{ width: 9, height: 9, borderRadius: 'var(--radius-full)', flexShrink: 0, background: enPausa ? 'var(--c-warn)' : 'var(--c-ok)' }} />
          {estado.tipo === 'pausa'
            ? estado.hasta
              ? <span>Pedidos en pausa hasta las <span style={{ fontVariantNumeric: 'tabular-nums' }}>{horaDePausa(estado.hasta, timezone)}</span></span>
              : 'Pedidos en pausa'
            : 'Recibiendo pedidos'}
        </div>
        <div style={{ fontSize: 12, color: 'var(--u-text-3)', marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
          {estado.tipo === 'pausa'
            ? estado.hasta
              ? `Faltan ${minutosRestantes(estado.hasta, ahora)} min. Después vuelven a entrar solos.`
              : 'Tus clientes no pueden pedir hasta que la reanudes.'
            : 'terminoEn' in estado
              ? conPunto(`La pausa terminó a las ${horaDePausa(estado.terminoEn, timezone)}`)
              : '¿Cocina saturada? Pausa sin tocar tu horario.'}
        </div>
      </div>

      {enPausa && guardada.pause_message && (
        <div style={{ fontSize: 13, color: 'var(--u-text-3)' }}>
          Mensaje: <strong style={{ color: 'var(--u-text)', fontWeight: 600 }}>«{guardada.pause_message}»</strong>
        </div>
      )}

      {/* ── Elegir duración (solo antes de pausar) ── */}
      {!enPausa && eligiendo && (
        <>
          <div role="group" aria-label="Duración de la pausa" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
            {DURACIONES_PAUSA.map((m) => {
              const sel = duracion === m;
              return (
                <Button
                  key={m}
                  type="button"
                  variant="outline"
                  aria-pressed={sel}
                  disabled={ocupado}
                  onClick={() => setDuracion(m)}
                  style={sel ? {
                    borderColor: 'var(--brand-accent)',
                    background: 'color-mix(in srgb, var(--brand-accent) 12%, transparent)',
                  } : undefined}
                >
                  {NOMBRE_DURACION[m]}
                </Button>
              );
            })}
          </div>
          <div>
            <label htmlFor="pause_message" style={FIELD_LABEL}>Mensaje para tus clientes (opcional)</label>
            <input
              id="pause_message"
              type="text"
              value={mensaje}
              maxLength={160}
              disabled={ocupado}
              onChange={(e) => setMensaje(e.target.value)}
              placeholder="Estamos a tope en cocina."
              className="adm-field adm-field-sm adm-field-auto"
              style={{ width: '100%', fontFamily: 'var(--ui-font-sans)' }}
            />
          </div>
          <div style={{ fontSize: 13, color: 'var(--u-text-3)', lineHeight: 1.45 }}>
            Tus clientes verán: <strong style={{ color: 'var(--u-text)', fontWeight: 600 }}>{textoComensal}</strong>
          </div>
        </>
      )}

      {/* ── Error: nunca parece una pausa aplicada ── */}
      {error && (
        <div role="alert" style={{ fontSize: 13, lineHeight: 1.45, padding: '10px 12px', borderRadius: 'var(--radius-md)', background: 'var(--c-danger-bg)', border: '1px solid var(--c-danger-line)', color: 'var(--c-danger)' }}>
          {FALLO[error.accion]}: {error.texto}{' '}
          {enPausa
            ? <strong>Tus clientes siguen sin poder pedir.</strong>
            : <strong>Tus clientes siguen pudiendo pedir.</strong>}
        </div>
      )}

      {/* ── Acciones ── */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {enPausa ? (
          <>
            <Button type="button" onClick={reanudar} disabled={ocupado}>
              {enCurso === 'reanudar' ? VERBO_PENDIENTE.reanudar : error?.accion === 'reanudar' ? 'Reintentar' : 'Reanudar ahora'}
            </Button>
            {estado.tipo === 'pausa' && estado.hasta && (
              <Button type="button" variant="outline" onClick={extender} disabled={ocupado}>
                {enCurso === 'extender' ? VERBO_PENDIENTE.extender : `+${EXTENSION_PAUSA_MIN} min`}
              </Button>
            )}
          </>
        ) : eligiendo ? (
          <>
            <Button type="button" onClick={pausar} disabled={ocupado}>
              {enCurso === 'pausar' ? VERBO_PENDIENTE.pausar : error?.accion === 'pausar' ? 'Reintentar' : ctaPausar}
            </Button>
            <Button type="button" variant="outline" onClick={() => { setEligiendo(false); setError(null); }} disabled={ocupado}>
              Cancelar
            </Button>
          </>
        ) : (
          <Button type="button" onClick={() => { setEligiendo(true); setError(null); }}>
            Pausar pedidos
          </Button>
        )}
      </div>
    </Card>
  );
}
