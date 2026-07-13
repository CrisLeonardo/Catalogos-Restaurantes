'use client';

/* ============================================================
   OPERACIÓN — horarios de apertura + pausa de pedidos
   ------------------------------------------------------------
   · Horario semanal con múltiples turnos por día.
   · Toggle "pausar pedidos" con mensaje personalizable.
   · Zona horaria del restaurante.
   ============================================================ */

import { useActionState, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Select } from '@/components/ui/select';
import { updateRestaurantOps, type RestaurantState } from '@/lib/actions/restaurant';
import { DAY_LABELS, DAY_ORDER, type DayKey, type HourInterval, type WeeklyHours } from '@/lib/hours';
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

type Interval = { open: string; close: string };
type DayState = { on: boolean; intervals: Interval[] };

function initDays(hours: WeeklyHours | null): Record<DayKey, DayState> {
  const out = {} as Record<DayKey, DayState>;
  for (const day of DAY_ORDER) {
    const dayIntervals = hours?.[day] ?? [];
    if (dayIntervals.length > 0) {
      out[day] = {
        on: true,
        intervals: dayIntervals.map(([open, close]) => ({ open, close })),
      };
    } else {
      out[day] = { on: false, intervals: [{ open: '08:00', close: '21:00' }] };
    }
  }
  return out;
}

function buildHoursJson(days: Record<DayKey, DayState>): string {
  const out: WeeklyHours = {};
  for (const day of DAY_ORDER) {
    const d = days[day];
    if (d.on && d.intervals.length > 0) {
      const valid = d.intervals
        .filter((iv) => iv.open && iv.close)
        .map((iv) => [iv.open, iv.close] as HourInterval);
      if (valid.length > 0) out[day] = valid;
    }
  }
  return Object.keys(out).length > 0 ? JSON.stringify(out) : '';
}

const empty: RestaurantState = null;

export default function HoursEditor({ restaurant }: { restaurant: Restaurant }) {
  const [state, formAction, isPending] = useActionState(updateRestaurantOps, empty);
  const [days, setDays] = useState<Record<DayKey, DayState>>(() => initDays(restaurant.hours));
  const [paused, setPaused] = useState(restaurant.orders_paused === true);
  const [timezone, setTimezone] = useState(restaurant.timezone || 'America/Guatemala');

  const toggleDay = (day: DayKey) =>
    setDays((prev) => ({ ...prev, [day]: { ...prev[day], on: !prev[day].on } }));

  const setInterval = (day: DayKey, idx: number, patch: Partial<Interval>) =>
    setDays((prev) => ({
      ...prev,
      [day]: {
        ...prev[day],
        intervals: prev[day].intervals.map((iv, i) => (i === idx ? { ...iv, ...patch } : iv)),
      },
    }));

  const addInterval = (day: DayKey) =>
    setDays((prev) => ({
      ...prev,
      [day]: {
        ...prev[day],
        intervals: [...prev[day].intervals, { open: '12:00', close: '21:00' }],
      },
    }));

  const removeInterval = (day: DayKey, idx: number) =>
    setDays((prev) => ({
      ...prev,
      [day]: {
        ...prev[day],
        intervals: prev[day].intervals.filter((_, i) => i !== idx),
      },
    }));

  const inputStyle: React.CSSProperties = {
    background: 'color-mix(in srgb, var(--u-text) 4%, transparent)',
    border: '1px solid var(--u-hair-2)',
    borderRadius: 'var(--radius-md)',
    padding: '8px 10px',
    color: 'var(--u-text)',
    fontSize: 14,
    outline: 'none',
    fontFamily: 'var(--ui-font-mono)',
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
      <Card
        data-tour-step="perfil-pausa"
        className="p-4"
        style={{ border: paused ? '1px solid rgba(245,158,11,0.4)' : undefined }}
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
          <Switch
            checked={paused}
            onCheckedChange={setPaused}
            aria-label="Pausar pedidos"
            className="data-[checked]:bg-[#f59e0b] data-[checked]:border-[#f59e0b]"
          />
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
      </Card>

      {/* ── Horario semanal ── */}
      <Card className="p-4">
        <label style={labelStyle}>Horario de apertura</label>
        <p style={{ fontSize: 12, color: 'var(--u-text-4)', marginBottom: 12 }}>
          El badge “Abierto/Cerrado” y el checkout se rigen por este horario.
          Sin días activos = siempre abierto. Puedes agregar varios turnos por día
          (p. ej. 7:00–10:00 y 13:00–21:00). Un cierre de madrugada (p. ej.
          20:00 a 02:00) cruza la medianoche sin problema.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {DAY_ORDER.map((day) => {
            const d = days[day];
            return (
              <div key={day} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                {/* Botón día */}
                <button
                  type="button"
                  onClick={() => toggleDay(day)}
                  className="press"
                  style={{
                    width: 110, textAlign: 'left', display: 'flex', alignItems: 'center', gap: 8,
                    padding: '8px 10px', borderRadius: 'var(--radius-md)', cursor: 'pointer',
                    background: d.on ? 'color-mix(in srgb, var(--u-text) 8%, transparent)' : 'transparent',
                    border: `1px solid ${d.on ? 'var(--u-hair-2)' : 'var(--u-hair)'}`,
                    color: d.on ? 'var(--u-text)' : 'var(--u-text-4)',
                    fontSize: 13, fontWeight: 600, transition: 'all 150ms', flexShrink: 0,
                    marginTop: 0,
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

                {/* Turnos */}
                {d.on ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1, minWidth: 0 }}>
                    {d.intervals.map((iv, idx) => (
                      <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <input
                          type="time"
                          value={iv.open}
                          onChange={(e) => setInterval(day, idx, { open: e.target.value })}
                          style={inputStyle}
                          aria-label={`Apertura turno ${idx + 1} ${DAY_LABELS[day]}`}
                        />
                        <span style={{ color: 'var(--u-text-4)', fontSize: 13 }}>a</span>
                        <input
                          type="time"
                          value={iv.close}
                          onChange={(e) => setInterval(day, idx, { close: e.target.value })}
                          style={inputStyle}
                          aria-label={`Cierre turno ${idx + 1} ${DAY_LABELS[day]}`}
                        />
                        {d.intervals.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeInterval(day, idx)}
                            className="press"
                            aria-label="Eliminar turno"
                            style={{
                              width: 26, height: 26, borderRadius: 99, border: 'none',
                              background: 'rgba(239,68,68,0.14)', color: '#f87171',
                              cursor: 'pointer', fontSize: 15, lineHeight: 1,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}
                          >
                            ×
                          </button>
                        )}
                      </div>
                    ))}
                    {d.intervals.length < 4 && (
                      <button
                        type="button"
                        onClick={() => addInterval(day)}
                        className="press"
                        style={{
                          alignSelf: 'flex-start', padding: '4px 10px', borderRadius: 'var(--radius-md)',
                          border: '1px dashed var(--u-hair-2)', background: 'transparent',
                          color: 'var(--u-text-4)', fontSize: 12, cursor: 'pointer',
                          display: 'flex', alignItems: 'center', gap: 5,
                        }}
                      >
                        + Turno
                      </button>
                    )}
                  </div>
                ) : (
                  <span style={{ fontSize: 13, color: 'var(--u-text-4)', marginTop: 8 }}>Cerrado</span>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      {/* ── Zona horaria ── */}
      <Card className="p-4">
        <label htmlFor="timezone" style={labelStyle}>Zona horaria</label>
        <input type="hidden" name="timezone" value={timezone} />
        <Select
          options={TIMEZONES.map((tz) => ({ value: tz, label: tz.replace('America/', '').replace(/_/g, ' ') }))}
          value={timezone}
          onValueChange={setTimezone}
        />
      </Card>

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

      <Button type="submit" disabled={isPending} size="lg" className="w-full rounded-adm-full">
        {isPending ? 'Guardando…' : 'Guardar operación'}
      </Button>
    </form>
  );
}
