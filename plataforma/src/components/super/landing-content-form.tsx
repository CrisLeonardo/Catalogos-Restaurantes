'use client';

import { useState, useTransition } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Icon } from '@/components/icons';
import SaveBar, { type SaveStatus } from '@/components/admin/save-bar';
import { FIELD_LABEL } from '@/components/admin/field-label';
import { useValueDirty } from '@/lib/use-form-dirty';
import { saveLandingContent } from '@/lib/actions/landing';
import {
  MAX_TESTIMONIALS,
  SHOWCASE_ITEMS,
  TESTIMONIAL_NAME_MAX,
  TESTIMONIAL_QUOTE_MAX,
  type LandingSettings,
} from '@/lib/landing-content';
import type { ShowcaseOption } from '@/lib/db/landing';

/* Super › Configuración › Portada: qué restaurante sale en el teléfono de
   la web de ventas y qué dicen los que ya lo usan (WEB-02/03). Cambiar
   de restaurante vuelve a pedir el permiso: lo marcado era para el otro. */

interface Row {
  key: number;
  restaurantId: string;
  person: string;
  role: string;
  quote: string;
  permiso: boolean;
}

export default function LandingContentForm({
  initial,
  options,
}: {
  initial: LandingSettings;
  options: ShowcaseOption[];
}) {
  const [showcaseId, setShowcaseId] = useState(initial.showcaseId ?? '');
  const [showcasePermiso, setShowcasePermiso] = useState(!!initial.showcaseId);
  const [rows, setRows] = useState<Row[]>(() =>
    initial.testimonials.map((t, i) => ({ key: i, ...t, permiso: true })),
  );
  const [nextKey, setNextKey] = useState(initial.testimonials.length);
  const [pending, start] = useTransition();
  const [status, setStatus] = useState<SaveStatus>(null);

  const plain = rows.map(({ restaurantId, person, role, quote, permiso }) => ({ restaurantId, person, role, quote, permiso }));
  const value = { showcaseId, showcasePermiso, rows: plain };
  const { dirty, markSaved } = useValueDirty(value);

  const byId = new Map(options.map((o) => [o.id, o]));
  const elegido = showcaseId ? byId.get(showcaseId) : undefined;
  const restaurantOptions = options.map((o) => ({
    value: o.id,
    label: `${o.name} · ${o.withPhoto} con foto`,
  }));

  function patch(key: number, p: Partial<Row>) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...p } : r)));
  }

  function save() {
    setStatus(null);
    const fd = new FormData();
    fd.set('payload', JSON.stringify({
      showcaseId: showcaseId || null,
      showcasePermiso,
      testimonials: plain,
    }));
    start(async () => {
      const res = await saveLandingContent(null, fd);
      if (res && 'error' in res) { setStatus({ error: res.error }); return; }
      markSaved();
      setStatus({ saved: true });
    });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Card style={{ padding: '20px 22px' }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--u-text)', margin: 0 }}>Teléfono de la portada</h3>
        <p style={{ fontSize: 13, color: 'var(--u-text-3)', margin: '6px 0 0', lineHeight: 1.55 }}>
          Elige un restaurante y la portada enseña <strong>su menú de verdad</strong>: nombre, logo,
          colores y sus platillos con foto (los más pedidos primero). Sin elegir, sale un ejemplo.
        </p>

        <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <span style={FIELD_LABEL}>Restaurante en vitrina</span>
            <Select
              aria-label="Restaurante en vitrina"
              value={showcaseId}
              onValueChange={(v) => { setShowcaseId(v); setShowcasePermiso(false); }}
              options={[{ value: '', label: 'Ninguno — el ejemplo' }, ...restaurantOptions]}
            />
          </div>

          {elegido && elegido.withPhoto < SHOWCASE_ITEMS && (
            <p style={{ fontSize: 13, color: 'var(--c-warn)', margin: 0, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <Icon name="alertCircle" size={15} style={{ flexShrink: 0, marginTop: 2 }} />
              {elegido.withPhoto === 0
                ? 'No tiene platillos con foto: saldrán con el icono de su categoría.'
                : `Solo ${elegido.withPhoto === 1 ? 'tiene 1 platillo' : `tiene ${elegido.withPhoto} platillos`} con foto; el resto sale con icono.`}
            </p>
          )}

          {showcaseId && (
            <Permiso
              checked={showcasePermiso}
              onChange={setShowcasePermiso}
              label={`Tengo permiso de ${elegido?.name ?? 'este restaurante'} para enseñar su menú en la portada de Leogin.`}
            />
          )}
        </div>
      </Card>

      <Card style={{ padding: '20px 22px' }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--u-text)', margin: 0 }}>Ya lo usan</h3>
        <p style={{ fontSize: 13, color: 'var(--u-text-3)', margin: '6px 0 0', lineHeight: 1.55 }}>
          Hasta {MAX_TESTIMONIALS} testimonios de clientes. Cada uno lleva el logo y el nombre del
          restaurante y enlaza a su menú. La sección solo aparece en la portada si hay al menos uno.
        </p>

        <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {rows.map((r, i) => (
            <fieldset
              key={r.key}
              style={{
                border: '1px solid var(--u-hair)', borderRadius: 'var(--radius-lg)', padding: '14px 14px 12px',
                display: 'flex', flexDirection: 'column', gap: 12, margin: 0, minWidth: 0,
              }}
            >
              <legend style={{ fontSize: 13, fontWeight: 600, color: 'var(--u-text-2)', padding: '0 6px' }}>
                Testimonio {i + 1}
              </legend>
              <div>
                <span style={FIELD_LABEL}>Restaurante</span>
                <Select
                  aria-label={`Restaurante del testimonio ${i + 1}`}
                  value={r.restaurantId}
                  onValueChange={(v) => patch(r.key, { restaurantId: v, permiso: false })}
                  placeholder="Elige el restaurante"
                  options={restaurantOptions}
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: 12 }}>
                <label>
                  <span style={FIELD_LABEL}>Quién lo dice</span>
                  <Input
                    value={r.person}
                    maxLength={TESTIMONIAL_NAME_MAX}
                    placeholder="Ana López"
                    onChange={(e) => patch(r.key, { person: e.target.value })}
                  />
                </label>
                <label>
                  <span style={FIELD_LABEL}>Cargo (opcional)</span>
                  <Input
                    value={r.role}
                    maxLength={TESTIMONIAL_NAME_MAX}
                    placeholder="Dueña"
                    onChange={(e) => patch(r.key, { role: e.target.value })}
                  />
                </label>
              </div>
              <label>
                <span style={{ ...FIELD_LABEL, display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  Lo que dijo
                  <span className="t-mono" style={{ fontWeight: 500, color: 'var(--u-text-4)' }}>
                    {r.quote.length}/{TESTIMONIAL_QUOTE_MAX}
                  </span>
                </span>
                <Textarea
                  rows={3}
                  value={r.quote}
                  maxLength={TESTIMONIAL_QUOTE_MAX}
                  placeholder="Desde que usamos Leogin ya no se nos pierde ningún pedido de WhatsApp."
                  onChange={(e) => patch(r.key, { quote: e.target.value })}
                />
              </label>
              <Permiso
                checked={r.permiso}
                onChange={(v) => patch(r.key, { permiso: v })}
                label="Tengo su permiso para publicar esta frase con su nombre y el de su restaurante."
              />
              <div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                >
                  <Icon name="trash" size={14} /> Quitar
                </Button>
              </div>
            </fieldset>
          ))}

          {rows.length < MAX_TESTIMONIALS && (
            <div>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setRows((rs) => [...rs, { key: nextKey, restaurantId: '', person: '', role: '', quote: '', permiso: false }]);
                  setNextKey((k) => k + 1);
                }}
              >
                <Icon name="plus" size={15} /> Agregar testimonio
              </Button>
            </div>
          )}
        </div>
      </Card>

      <SaveBar dirty={dirty} pending={pending} status={status} onSave={save} />
    </div>
  );
}

function Permiso({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13, color: 'var(--u-text-2)', lineHeight: 1.45, cursor: 'pointer' }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ width: 16, height: 16, marginTop: 2, flexShrink: 0, accentColor: 'var(--adm-accent-500)' }}
      />
      {label}
    </label>
  );
}
