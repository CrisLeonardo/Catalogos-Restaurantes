import { List, ListLink, ListRow, ListText, StatusDot } from '@/components/ui/list';
import { Section } from '@/components/ui/section';
import { panelBase } from '@/lib/panel-links-server';
import { panelHref } from '@/lib/panel-links';

/* ── Menú · Fuera del menú ahora mismo ───────────────────────── */

export interface OffMenuItem {
  id: string;
  name: string;
  /** 'inventario' = se apagó solo al llegar a cero; 'mano' = lo marcó alguien. */
  reason: 'inventario' | 'mano';
  /** Desde cuándo, ya en texto ("hace 2 h"). null si no quedó registrado. */
  since: string | null;
}

/**
 * Lo que el comensal NO puede pedir ahora mismo, arriba de la lista.
 *
 * Un platillo marcado agotado desaparece de la vista del comensal, así que se
 * olvida así: nadie echa de menos lo que no ve. Aquí se ve y se reactiva sin
 * ir a buscarlo.
 *
 * Solo entra lo que de verdad está fuera EN ESTE MOMENTO: lo marcado hace más
 * de doce horas ya volvió solo al menú (ver lib/product-availability.ts), y
 * anunciarlo como apagado sería mentirle al restaurante.
 *
 * No cuesta ni una consulta: la pantalla ya carga el catálogo entero.
 */
export async function OffMenuWidget({ items, total }: { items: OffMenuItem[]; total: number }) {
  /* Prefijo del origen unico ('' en el subdominio de hoy). Ver lib/panel-links.ts. */
  const base = await panelBase();
  const resto = total - items.length;

  return (
    <Section title="No se puede pedir ahora">
      <List>
        {items.map((p) => (
          /* Sin existencias no se arregla en la ficha del platillo (encenderlo
             ahí no repone nada): lleva a Inventario y dice «Reponer». */
          <ListLink
            key={p.id}
            href={panelHref(base, p.reason === 'inventario' ? '/admin/inventario' : `/admin/menu/productos/${p.id}`)}
          >
            <StatusDot tone={p.reason === 'inventario' ? 'danger' : 'neutral'} size={9} />
            <ListText
              title={p.name}
              desc={
                (p.reason === 'inventario'
                  ? 'Se quitó solo al llegar a cero existencias'
                  : 'Marcado agotado a mano')
                + (p.since ? ` · ${p.since}.` : '.')
              }
            />
            <span
              className="shrink-0 text-[13.5px] font-semibold"
              style={{ color: 'var(--brand-accent-ink, var(--adm-accent-500))' }}
            >
              {p.reason === 'inventario' ? 'Reponer' : 'Reactivar'}
            </span>
          </ListLink>
        ))}
        {resto > 0 && (
          <ListRow className="text-[13px] text-adm-text-3">
            Y {resto} {resto === 1 ? 'platillo más' : 'platillos más'} sin poder pedirse.
          </ListRow>
        )}
      </List>
    </Section>
  );
}
