'use client';

/* ============================================================
   «LO MÁS PEDIDO» (auditoría «La carta que vende», CV-31)
   ------------------------------------------------------------
   Una tira bajo la cabecera con lo que de verdad se vendió esta
   semana (las reglas viven en lib/menu/mas-pedidos.ts). Tocar una
   pieza abre su ficha, igual que en la carta. Sólida, con la paleta
   del restaurante; nada de Leogin.
   ============================================================ */

import AssetImage from '@/components/asset-image';
import { Icon } from '@/components/icons';
import { Price } from '@/components/menu/ui';
import { useLocale, useLocalized } from '@/lib/locale/context';
import type { DestacadoVentas } from '@/lib/menu/mas-pedidos';
import { marcarOrigen } from '@/lib/menu/origen-ficha';

interface Pieza { id: string; name: string; name_en?: string | null; price: number; image_url?: string | null; icon?: string | null }

export default function MasPedidos<P extends Pieza>({ items, onOpen }: { items: DestacadoVentas<P>[]; onOpen: (p: P) => void }) {
  const { locale } = useLocale();
  const en = locale === 'en';
  if (items.length === 0) return null;
  return (
    <section aria-labelledby="mas-pedidos-t" style={{ margin: '12px 0 2px' }}>
      <h2 id="mas-pedidos-t" className="opt-title" style={{ margin: '0 0 8px', fontSize: 'var(--m-fs-md)', fontWeight: 700, color: 'var(--u-text)' }}>
        {en ? 'Most ordered this week' : 'Lo más pedido esta semana'}
      </h2>
      <div className="m-acomp u-noscroll" style={{ gap: 8 }}>
        {items.map((d) => <PiezaVentas key={d.producto.id} d={d} en={en} onOpen={onOpen} />)}
      </div>
    </section>
  );
}

function PiezaVentas<P extends Pieza>({ d, en, onOpen }: { d: DestacadoVentas<P>; en: boolean; onOpen: (p: P) => void }) {
  const nombre = useLocalized(d.producto.name, d.producto.name_en);
  const dato = d.vendidos !== null
    ? (en ? `${d.vendidos} sold` : `${d.vendidos} vendidos`)
    : null;
  /* Fila baja (fase 4, F4-3): foto cuadrada de 64 px y, al lado, nombre,
     ventas y precio. La pieza alta de 190 px empujaba la carta fuera de la
     primera pantalla. */
  return (
    <button
      type="button"
      onClick={(e) => { marcarOrigen(e.currentTarget); onOpen(d.producto); }}
      className="press m-acomp-pieza m-mp-pieza"
      aria-label={`${en ? 'No.' : 'N.º'} ${d.puesto}: ${nombre}${dato ? `, ${dato} ${en ? 'this week' : 'esta semana'}` : ''}`}
    >
      <span className="m-acomp-foto m-mp-foto">
        {d.producto.image_url
          ? <AssetImage src={d.producto.image_url} alt="" fill sizes="64px" style={{ objectFit: 'cover' }} />
          : <Icon name={d.producto.icon || 'utensils'} size={22} />}
      </span>
      <span className="m-mp-texto" aria-hidden>
        <span className="m-acomp-nombre">{nombre}</span>
        <span className="m-mp-dato">#{d.puesto}{dato ? ` · ${dato}` : ''}</span>
        <span className="m-acomp-precio"><Price amount={Number(d.producto.price)} size={14} /></span>
      </span>
    </button>
  );
}
