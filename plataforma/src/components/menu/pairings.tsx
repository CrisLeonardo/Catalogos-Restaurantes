'use client';

/* ============================================================
   «ACOMPÁÑALO CON…» (auditoría 2026-10-02, CAT-13)
   ------------------------------------------------------------
   La bebida, el acompañamiento o el postre que elige
   lib/menu-pairings.ts. Eran píldoras de texto («+ Malteada +Q28») que
   se leían como etiquetas, no como comida. Ahora son piezas pequeñas
   con foto, nombre y precio en un carril (auditoría «La carta que
   vende», CV-16); se marcan con un toque y se suman con el mismo
   «Agregar» de la ficha.
   ============================================================ */

import AssetImage from '@/components/asset-image';
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
        <span className="opt-title">{en ? 'Goes well with' : 'Va bien con'}</span>
        {nota && <span className="opt-hint">{en ? nota.en : nota.es}</span>}
      </div>
      <div className="m-acomp u-noscroll">
        {items.map((s) => {
          const on = elegidos?.has(s.id) ?? false;
          const nombre = en && s.name_en ? s.name_en : s.name;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onToggle(s)}
              className="press m-acomp-pieza"
              data-on={on ? '1' : undefined}
              aria-pressed={elegidos ? on : undefined}
              aria-label={`${nombre}, más ${formatPrice(s.price, config)}`}
            >
              <span className="m-acomp-foto">
                {s.image_url
                  ? <AssetImage src={s.image_url} alt="" fill sizes="112px" style={{ objectFit: 'cover' }} />
                  : <Icon name="utensils" size={22} />}
                <span className="m-acomp-marca" aria-hidden><Icon name={on ? 'check' : 'plus'} size={14} strokeWidth={on ? 3 : 2.4} /></span>
              </span>
              <span className="m-acomp-nombre">{nombre}</span>
              <span className="m-acomp-precio">+{formatPrice(s.price, config)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
