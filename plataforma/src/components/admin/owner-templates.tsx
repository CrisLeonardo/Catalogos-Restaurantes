'use client';

/* Plantillas PROPIAS del restaurante — el dueño guarda su diseño actual
   (paleta/tipografía/fondo/portada/catálogo, mismas claves que una plantilla
   builtin) como plantilla reutilizable, hasta un máximo. Reutiliza el mismo
   mini-preview (`Thumb`) y el mismo `applyTemplateToConfig` que las 16
   plantillas prediseñadas — para el editor, una plantilla propia es
   estructuralmente idéntica a una builtin, solo cambia de dónde sale. */

import { useState, useTransition } from 'react';
import { Icon } from '@/components/icons';
import { Thumb } from '@/components/admin/template-gallery';
import {
  saveRestaurantThemeTemplate,
  deleteRestaurantThemeTemplate,
  type RestaurantThemeTemplate,
} from '@/lib/actions/restaurant';
import type { BuiltinTemplate } from '@/lib/theme/templates';
import type { ThemeConfig } from '@/lib/theme/defaults';

const MAX_TEMPLATES = 5;

/** Adapta la fila de BD a la misma forma que consume el resto del editor
    (Thumb, applyTemplateToConfig) — una plantilla propia SE VE Y SE APLICA
    exactamente igual que una builtin. */
function toBuiltinShape(row: RestaurantThemeTemplate): BuiltinTemplate {
  return {
    id: row.id,
    name: row.name,
    desc: 'Tu plantilla guardada',
    mode: row.config.scheme === 'light' ? 'Claro' : 'Oscuro',
    config: row.config,
  };
}

export default function OwnerTemplates({
  restaurantId,
  currentConfig,
  templates,
  onTemplatesChange,
  onApply,
  appliedId,
}: {
  restaurantId: string;
  /** Config actual del editor (con lo no guardado): lo que se snapshotea al guardar. */
  currentConfig: ThemeConfig;
  templates: RestaurantThemeTemplate[];
  onTemplatesChange: (next: RestaurantThemeTemplate[]) => void;
  onApply: (tpl: BuiltinTemplate) => void;
  appliedId?: string | null;
}) {
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [isPending, start] = useTransition();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const atLimit = templates.length >= MAX_TEMPLATES;

  function handleSave() {
    setErr(null);
    const trimmed = name.trim();
    if (!trimmed) { setErr('Ponle un nombre a tu plantilla.'); return; }
    start(async () => {
      const res = await saveRestaurantThemeTemplate({ restaurantId, name: trimmed, config: currentConfig });
      if (res.error) { setErr(res.error); return; }
      if (res.template) onTemplatesChange([res.template, ...templates]);
      setNaming(false);
      setName('');
    });
  }

  function handleDelete(id: string) {
    setDeletingId(id);
    start(async () => {
      const res = await deleteRestaurantThemeTemplate({ restaurantId, id });
      setDeletingId(null);
      if (!res.error) onTemplatesChange(templates.filter((t) => t.id !== id));
    });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--u-text)' }}>Tus plantillas</div>
          <p style={{ fontSize: 11.5, color: 'var(--u-text-4)', marginTop: 2 }}>
            Guarda tu propio diseño y vuelve a aplicarlo cuando quieras · {templates.length}/{MAX_TEMPLATES}
          </p>
        </div>
        {!naming && (
          <button
            type="button"
            onClick={() => setNaming(true)}
            disabled={atLimit}
            title={atLimit ? `Ya tienes el máximo de ${MAX_TEMPLATES} plantillas propias` : 'Guardar el diseño actual como plantilla'}
            className="press"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 'var(--radius-full)',
              fontSize: 12.5, fontWeight: 700, border: 'none', cursor: atLimit ? 'not-allowed' : 'pointer',
              background: atLimit ? 'color-mix(in srgb, var(--u-text) 8%, transparent)' : 'var(--brand-accent)',
              color: atLimit ? 'var(--u-text-4)' : 'var(--brand-on-accent, #fff)', flexShrink: 0,
            }}
          >
            <Icon name="plus" size={14} /> Guardar diseño actual
          </button>
        )}
      </div>

      {naming && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nombre de tu plantilla (ej. Verano 2026)"
            maxLength={60}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') { setNaming(false); setName(''); setErr(null); } }}
            style={{
              flex: '1 1 220px', padding: '9px 13px', borderRadius: 12, border: '1px solid var(--u-hair)',
              background: 'color-mix(in srgb, var(--u-text) 4%, transparent)', color: 'var(--u-text)', fontSize: 13, outline: 'none',
            }}
          />
          <button type="button" onClick={handleSave} disabled={isPending} className="press btn-accent" style={{ padding: '9px 16px', borderRadius: 'var(--radius-full)', fontWeight: 700, fontSize: 12.5, cursor: 'pointer', opacity: isPending ? 0.6 : 1 }}>
            {isPending ? 'Guardando…' : 'Guardar'}
          </button>
          <button type="button" onClick={() => { setNaming(false); setName(''); setErr(null); }} className="press" style={{ padding: '9px 14px', borderRadius: 'var(--radius-full)', fontWeight: 600, fontSize: 12.5, border: '1px solid var(--u-hair)', background: 'transparent', color: 'var(--u-text-2)', cursor: 'pointer' }}>
            Cancelar
          </button>
        </div>
      )}
      {err && <p style={{ fontSize: 12, color: 'var(--c-danger)', margin: 0 }}>{err}</p>}

      {templates.length === 0 && !naming ? (
        <p style={{ fontSize: 12.5, color: 'var(--u-text-4)', margin: 0, lineHeight: 1.5 }}>
          Aún no tienes plantillas propias. Ajusta el diseño en las demás pestañas (o parte de una de las plantillas incluidas) y guárdalo aquí para reutilizarlo.
        </p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(148px, 1fr))', gap: 12 }}>
          {templates.map((row) => {
            const tpl = toBuiltinShape(row);
            const applied = appliedId === tpl.id;
            const deleting = deletingId === row.id;
            return (
              <div key={row.id} style={{ position: 'relative' }}>
                <button
                  type="button"
                  onClick={() => onApply(tpl)}
                  className="press"
                  title={`Aplicar "${row.name}" (tu logo, textos y configuración de pedidos se conservan)`}
                  style={{
                    display: 'flex', flexDirection: 'column', gap: 7, textAlign: 'left', width: '100%',
                    padding: 7, borderRadius: 15, cursor: 'pointer',
                    border: `1.5px solid ${applied ? 'var(--brand-accent, #D97757)' : 'var(--u-hair)'}`,
                    background: applied
                      ? 'color-mix(in srgb, var(--brand-accent, #D97757) 8%, transparent)'
                      : 'color-mix(in srgb, var(--u-text) 3%, transparent)',
                    transition: 'border-color 150ms, background 150ms', opacity: deleting ? 0.5 : 1,
                  }}
                >
                  <Thumb tpl={tpl} />
                  <div style={{ padding: '0 3px 3px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--u-text)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.name}</span>
                      {applied && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, fontWeight: 700, color: 'var(--brand-accent-ink, #D97757)', flexShrink: 0 }}>
                          <Icon name="checkCircle" size={11} /> Aplicada
                        </span>
                      )}
                    </div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(row.id)}
                  disabled={deleting}
                  aria-label={`Eliminar plantilla "${row.name}"`}
                  title="Eliminar"
                  className="press"
                  style={{
                    position: 'absolute', top: 6, right: 6, width: 24, height: 24, borderRadius: 8, border: 'none',
                    background: 'rgba(0,0,0,0.55)', color: '#fff', display: 'grid', placeItems: 'center', cursor: deleting ? 'default' : 'pointer',
                    backdropFilter: 'blur(4px)',
                  }}
                >
                  <Icon name="trash" size={12} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
