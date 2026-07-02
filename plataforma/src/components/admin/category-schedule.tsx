'use client';

/* ============================================================
   CategorySchedule — horario de disponibilidad de una categoría
   ------------------------------------------------------------
   Permite que un menú/categoría solo aparezca en ciertas franjas
   (desayuno / almuerzo / cena) según la hora y la zona horaria del
   restaurante. Reutiliza el formato WeeklyHours (lib/hours.ts), el
   mismo que el horario de apertura del local.

   Es autocontenido: renderiza su propio <input name="availability">
   con el JSON (o "" = disponible siempre), para soltarlo dentro de
   cualquier <form> de categoría sin cablear estado en el padre.
   ============================================================ */

import { useMemo, useState } from 'react';
import { Icon } from '@/components/icons';
import {
  DAY_LABELS,
  DAY_ORDER,
  scheduleSummary,
  type DayKey,
  type HourInterval,
  type WeeklyHours,
} from '@/lib/hours';

type Interval = { open: string; close: string };
type DayState = { on: boolean; intervals: Interval[] };

/* Presets de franja: se aplican a los 7 días. */
const PRESETS: { key: string; label: string; icon: string; open: string; close: string }[] = [
  { key: 'desayuno', label: 'Desayuno', icon: 'coffee', open: '07:00', close: '11:00' },
  { key: 'almuerzo', label: 'Almuerzo', icon: 'utensils', open: '12:00', close: '16:00' },
  { key: 'cena',     label: 'Cena',     icon: 'flame',  open: '18:00', close: '22:00' },
];

function initDays(hours: WeeklyHours | null): Record<DayKey, DayState> {
  const out = {} as Record<DayKey, DayState>;
  for (const day of DAY_ORDER) {
    const dayIntervals = hours?.[day] ?? [];
    out[day] = dayIntervals.length > 0
      ? { on: true, intervals: dayIntervals.map(([open, close]) => ({ open, close })) }
      : { on: false, intervals: [{ open: '12:00', close: '16:00' }] };
  }
  return out;
}

function buildHours(days: Record<DayKey, DayState>): WeeklyHours {
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
  return out;
}

/** ¿El horario actual coincide con un preset (mismos 7 días, misma franja)? */
function matchedPreset(days: Record<DayKey, DayState>): string | null {
  const allOn = DAY_ORDER.every((d) => days[d].on && days[d].intervals.length === 1);
  if (!allOn) return null;
  const first = days[DAY_ORDER[0]].intervals[0];
  const same = DAY_ORDER.every((d) => {
    const iv = days[d].intervals[0];
    return iv.open === first.open && iv.close === first.close;
  });
  if (!same) return null;
  return PRESETS.find((p) => p.open === first.open && p.close === first.close)?.key ?? null;
}

const inputStyle: React.CSSProperties = {
  background: 'color-mix(in srgb, var(--u-text) 5%, transparent)',
  border: '1px solid var(--u-hair-2)',
  borderRadius: 10,
  padding: '7px 9px',
  color: 'var(--u-text)',
  fontSize: 13.5,
  outline: 'none',
  fontFamily: 'var(--ui-font-mono)',
};

export default function CategorySchedule({ defaultValue }: { defaultValue: WeeklyHours | null }) {
  const hasInitial = !!defaultValue && Object.keys(defaultValue).length > 0;
  const [enabled, setEnabled] = useState(hasInitial);
  const [expanded, setExpanded] = useState(false);
  const [days, setDays] = useState<Record<DayKey, DayState>>(() => initDays(defaultValue));

  const hours = useMemo(() => buildHours(days), [days]);
  const summary = scheduleSummary(hours);
  const preset = matchedPreset(days);
  const value = enabled && Object.keys(hours).length > 0 ? JSON.stringify(hours) : '';

  function applyPreset(p: typeof PRESETS[number]) {
    const next = {} as Record<DayKey, DayState>;
    for (const day of DAY_ORDER) next[day] = { on: true, intervals: [{ open: p.open, close: p.close }] };
    setDays(next);
    setEnabled(true);
  }

  function setAllDay() {
    setEnabled(false);
    setExpanded(false);
  }

  const toggleDay = (day: DayKey) =>
    setDays((prev) => ({ ...prev, [day]: { ...prev[day], on: !prev[day].on } }));
  const setIv = (day: DayKey, idx: number, patch: Partial<Interval>) =>
    setDays((prev) => ({
      ...prev,
      [day]: { ...prev[day], intervals: prev[day].intervals.map((iv, i) => (i === idx ? { ...iv, ...patch } : iv)) },
    }));

  const chip = (active: boolean): React.CSSProperties => ({
    display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 99,
    cursor: 'pointer', fontSize: 12.5, fontWeight: 600,
    border: `1px solid ${active ? 'transparent' : 'var(--u-hair-2)'}`,
    background: active ? 'var(--u-text)' : 'transparent',
    color: active ? 'var(--brand-bg)' : 'var(--u-text-2)',
  });

  return (
    <div style={{ border: '1px solid var(--u-hair)', borderRadius: 12, padding: 12, background: 'color-mix(in srgb, var(--u-text) 2%, transparent)' }}>
      <input type="hidden" name="availability" value={value} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <Icon name="clock" size={15} style={{ color: 'var(--u-text-3)', flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--u-text)' }}>Disponibilidad por horario</div>
          <div style={{ fontSize: 11, color: 'var(--u-text-4)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {enabled && summary ? summary : 'Disponible todo el día'}
          </div>
        </div>
      </div>

      {/* Presets rápidos */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        <button type="button" className="press" onClick={setAllDay} style={chip(!enabled)}>
          Todo el día
        </button>
        {PRESETS.map((p) => (
          <button key={p.key} type="button" className="press" onClick={() => applyPreset(p)} style={chip(enabled && preset === p.key)}>
            <Icon name={p.icon} size={13} /> {p.label}
          </button>
        ))}
        <button
          type="button"
          className="press"
          onClick={() => { setEnabled(true); setExpanded((e) => !e); }}
          style={{ ...chip(enabled && !preset && expanded), borderStyle: 'dashed' }}
        >
          <Icon name="settings" size={13} /> Personalizar
        </button>
      </div>

      {/* Editor por día */}
      {enabled && expanded && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
          <p style={{ fontSize: 11, color: 'var(--u-text-4)', margin: 0, lineHeight: 1.5 }}>
            Activa los días y ajusta la franja. Una franja que cruza la medianoche
            (p. ej. 20:00 a 02:00) se entiende sin problema.
          </p>
          {DAY_ORDER.map((day) => {
            const d = days[day];
            return (
              <div key={day} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => toggleDay(day)}
                  className="press"
                  style={{
                    width: 92, textAlign: 'left', display: 'flex', alignItems: 'center', gap: 7,
                    padding: '6px 9px', borderRadius: 9, cursor: 'pointer', flexShrink: 0,
                    background: d.on ? 'color-mix(in srgb, var(--u-text) 7%, transparent)' : 'transparent',
                    border: `1px solid ${d.on ? 'var(--u-hair-2)' : 'var(--u-hair)'}`,
                    color: d.on ? 'var(--u-text)' : 'var(--u-text-4)', fontSize: 12.5, fontWeight: 600,
                  }}
                >
                  <span style={{ width: 7, height: 7, borderRadius: 99, flexShrink: 0, background: d.on ? '#4ade80' : 'var(--u-hair-2)' }} />
                  {DAY_LABELS[day]}
                </button>
                {d.on ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <input type="time" value={d.intervals[0].open} onChange={(e) => setIv(day, 0, { open: e.target.value })} style={inputStyle} aria-label={`Inicio ${DAY_LABELS[day]}`} />
                    <span style={{ color: 'var(--u-text-4)', fontSize: 12.5 }}>a</span>
                    <input type="time" value={d.intervals[0].close} onChange={(e) => setIv(day, 0, { close: e.target.value })} style={inputStyle} aria-label={`Fin ${DAY_LABELS[day]}`} />
                  </div>
                ) : (
                  <span style={{ fontSize: 12.5, color: 'var(--u-text-4)' }}>No disponible</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
