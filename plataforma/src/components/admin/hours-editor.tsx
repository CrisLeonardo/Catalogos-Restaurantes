'use client';

/* ============================================================
   OPERACIÓN — horarios de apertura + pausa de pedidos
   ------------------------------------------------------------
   · Horario semanal (un intervalo por día; cierre <= apertura
     cruza la medianoche, p. ej. 18:00–01:00).
   · Toggle "pausar pedidos" con mensaje personalizable.
   · Zona horaria del restaurante (KPIs y horario usan esta).
   El badge "Abierto/Cerrado" de la portada y el bloqueo del
   checkout salen de estos datos.
   ============================================================ */

import { useActionState, useState } from 'react';
import { Glass } from '@/components/glass';
import { updateRestaurantOps, type RestaurantState } from '@/lib/actions/restaurant';
import { DAY_LABELS, DAY_ORDER, type DayKey, type WeeklyHours } from '@/lib/hours';
import type { Restaurant } from '@/types';

const TIMEZONES = [
  'America/Guatemala',
  'America/Mexico_City',
  'America/El_Salvador',
  'America/Tegucigalpa',
  'America/Costa_Rica',
  'America/Panama',
  'America/Bogota',
  'America/Lima',
  'America/Santiago',
  'America/Argentina/Buenos_Aires',
  'America/New_York',
  'America/Los_Angeles',
  'Europe/Madrid',
];

type DayState = { on: boolean; open: string; close: string };

function initDays(hours: WeeklyHours | null): Record<DayKey, DayState> {
  const out = {} as Record<DayKey, DayState>;
  for (const day of DAY_ORDER) {
    const interval = hours?.[day]?.[0];
    out[day] = interval
      ? { on: true, open: interval[0], close: interval[1] }
      : { on: false, open: '08:00', close: '21:00' };
  }
  return out;
}

function buildHoursJson(days: Record<DayKey, DayState>): string {
  const out: WeeklyHours = {};
  for (const day of DAY_ORDER) {
    const d = days[day];
    if (d.on && d.open && d.close) out[day] = [[d.open, d.close]];
  }
  return Object.keys(out).length > 0 ? JSON.stringify(out) : '';
}

const empty: RestaurantState = null;

export default function HoursEditor({ restaurant }: { restaurant: Restaurant }) {
  const [state, formAction, isPending] = useActionState(updateRestaurantOps, empty);
  const [days, setDays] = useState<Record<DayKey, DayState>>(() => initDays(restaurant.hours));
  const [paused, setPaused] = useState(restaurant.orders_paused === true);

  const setDay = (day: DayKey, patch: Partial<DayState>) =>
    setDays((prev) => ({ ...prev, [day]: { ...prev[day], ...patch } }));

  const inputStyle: React.CSSProperties = {
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid var(--u-hair-2)',
    borderRadius: 'var(--radius-md)',
    padding: '8px 10px',
    color: 'var(--u-text)',
    fontSize: 14,
    outline: 'none',
    fontFamily: 'var(--ui-font-mono)',
    colorScheme: 'dark',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 12,
    color: 'var(--u-text-3)',
    fontWeight: 500,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    marginBottom: 6,
    display: 'block',
  };

  return (
    <form action={formAction} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <input type="hidden" name="restaurantId" value={restaurant.id} />
      <input type="hidden" name="hours" value={buildHoursJson(days)} />
      <input type="hidden" name="orders_paused" value={String(paused)} />

      {/* ── Pausa de pedidos ── */}
      <Glass
        variant="quiet"
        style={{
          padding: 16,
          border: paused ? '1px solid rgba(245,158,11,0.4)' : undefined,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--u-text)' }}>
              {paused ? 'Pedidos en pausa' : 'Recibiendo pedidos'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--u-text-3)', marginTop: 2 }}>
              {paused
                ? 'El checkout está bloqueado hasta que reanudes.'
                : '¿Cocina saturada? Pausa sin tocar tus horarios.'}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setPaused(!paused)}
            className="press"
            aria-label="Pausar pedidos"
            style={{
              width: 46, height: 27, borderRadius: 99, border: 'none', cursor: 'pointer', padding: 3,
              background: paused ? '#f59e0b' : 'rgba(255,255,255,0.12)',
              display: 'flex', justifyContent: paused ? 'flex-end' : 'flex-start',
              transition: 'background 180ms', flexShrink: 0,
            }}
          >
            <span style={{ width: 21, height: 21, borderRadius: 99, background: '#fff' }} />
          </button>
        </div>
        {paused && (
          <div style={{ marginTop: 12 }}>
            <label htmlFor="pause_message" style={labelStyle}>Mensaje para tus clientes</label>
            <input
              id="pause_message"
              name="pause_message"
              type="text"
              defaultValue={restaurant.pause_message ?? ''}
              placeholder="Estamos a tope. ¡Volvemos en 30 minutos!"
              style={{ ...inputStyle, width: '100%', fontFamily: 'var(--ui-font-sans)' }}
            />
          </div>
        )}
        {!paused && (
          <input type="hidden" name="pause_message" value={restaurant.pause_message ?? ''} />
        )}
      </Glass>

      {/* ── Horario semanal ── */}
      <Glass variant="quiet" style={{ padding: 16 }}>
        <label style={labelStyle}>Horario de apertura</label>
        <p style={{ fontSize: 12, color: 'var(--u-text-4)', marginBottom: 12 }}>
          El badge “Abierto/Cerrado” y el checkout se rigen por este horario.
          Sin días activos = siempre abierto. Un cierre de madrugada (p. ej.
          18:00 a 01:00) cruza la medianoche sin problema.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {DAY_ORDER.map((day) => {
            const d = days[day];
            return (
              <div key={day} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => setDay(day, { on: !d.on })}
                  className="press"
                  style={{
                    width: 110, textAlign: 'left', display: 'flex', alignItems: 'center', gap: 8,
                    padding: '8px 10px', borderRadius: 'var(--radius-md)', cursor: 'pointer',
                    background: d.on ? 'rgba(255,255,255,0.08)' : 'transparent',
                    border: `1px solid ${d.on ? 'var(--u-hair-2)' : 'var(--u-hair)'}`,
                    color: d.on ? 'var(--u-text)' : 'var(--u-text-4)',
                    fontSize: 13, fontWeight: 600, transition: 'all 150ms',
                  }}
                >
                  <span
                    style={{
                      width: 8, height: 8, borderRadius: 99, flexShrink: 0,
                      background: d.on ? '#4ade80' : 'var(--u-hair-2)',
                    }}
                  />
                  {DAY_LABELS[day]}
                </button>
                {d.on ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input
                      type="time"
                      value={d.open}
                      onChange={(e) => setDay(day, { open: e.target.value })}
                      style={inputStyle}
                      aria-label={`Apertura ${DAY_LABELS[day]}`}
                    />
                    <span style={{ color: 'var(--u-text-4)', fontSize: 13 }}>a</span>
                    <input
                      type="time"
                      value={d.close}
                      onChange={(e) => setDay(day, { close: e.target.value })}
                      style={inputStyle}
                      aria-label={`Cierre ${DAY_LABELS[day]}`}
                    />
                  </div>
                ) : (
                  <span style={{ fontSize: 13, color: 'var(--u-text-4)' }}>Cerrado</span>
                )}
              </div>
            );
          })}
        </div>
      </Glass>

      {/* ── Zona horaria ── */}
      <Glass variant="quiet" style={{ padding: 16 }}>
        <label htmlFor="timezone" style={labelStyle}>Zona horaria</label>
        <select
          id="timezone"
          name="timezone"
          defaultValue={restaurant.timezone || 'America/Guatemala'}
          style={{ ...inputStyle, width: '100%', fontFamily: 'var(--ui-font-sans)', cursor: 'pointer' }}
        >
          {TIMEZONES.map((tz) => (
            <option key={tz} value={tz}>{tz.replace('America/', '').replace(/_/g, ' ')}</option>
          ))}
        </select>
      </Glass>

      {state?.error && (
        <div
          style={{
            padding: '10px 14px',
            borderRadius: 'var(--radius-md)',
            background: 'rgba(220,50,50,0.12)',
            border: '1px solid rgba(220,50,50,0.25)',
            color: '#f87171',
            fontSize: 14,
          }}
        >
          {state.error}
        </div>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="press btn-accent"
        style={{
          width: '100%',
          padding: '14px',
          borderRadius: 'var(--radius-full)',
          fontWeight: 600,
          fontSize: 15,
          border: 'none',
          cursor: isPending ? 'not-allowed' : 'pointer',
          opacity: isPending ? 0.7 : 1,
        }}
      >
        {isPending ? 'Guardando…' : 'Guardar operación'}
      </button>
    </form>
  );
}
