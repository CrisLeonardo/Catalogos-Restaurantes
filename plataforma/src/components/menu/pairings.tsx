'use client';

/* ============================================================
   «ACOMPÁÑALO CON…» (auditoría 2026-10-02, CAT-13)
   ------------------------------------------------------------
   Las píldoras con la bebida, el acompañamiento o el postre que
   elige lib/menu-pairings.ts. Mismas clases que las opciones del
   platillo (.opt-*, globals.css): en la ficha se leen como un grupo
   más, y en el carrito, igual.
   ============================================================ */

import { Icon } from '@/components/icons';
import { formatPrice } from '@/lib/theme/resolve';
import { useThemeConfig } from '@/lib/theme/context';
import { useLocale } from '@/lib/locale/context';

export interface Sugerencia {
  id: string;
  name: string;
  name_en?: string | null;
  price: number;
  image_url?: string | null;
}

export function Acompanantes({
  items,
  elegidos,
  onToggle,
  nota,
}: {
  items: Sugerencia[];
  /** Las que ya están marcadas (en la ficha se suman al agregar). */
  elegidos?: ReadonlySet<string>;
  onToggle: (s: Sugerencia) => void;
  /** Línea pequeña a la derecha del título. */
  nota?: { es: string; en: string };
}) {
  const config = useThemeConfig();
  const { locale } = useLocale();
  if (items.length === 0) return null;
  const en = locale === 'en';

  return (
    <div className="opt-group" style={{ marginTop: 4 }}>
      <div className="opt-head">
        <span className="opt-title">{en ? 'Pair it with…' : 'Acompáñalo con…'}</span>
        {nota && <span className="opt-hint">{en ? nota.en : nota.es}</span>}
      </div>
      <div className="opt-pills">
        {items.map((s) => {
          const on = elegidos?.has(s.id) ?? false;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onToggle(s)}
              className="press opt-pill"
              aria-pressed={elegidos ? on : undefined}
            >
              <Icon name={on ? 'check' : 'plus'} size={13} strokeWidth={on ? 3 : 2.4} />
              {en && s.name_en ? s.name_en : s.name}
              <span className="opt-delta">+{formatPrice(s.price, config)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
