'use client';

/* ============================================================
   El link único de pedidos del grupo — con su interruptor
   ------------------------------------------------------------
   Si la organización ya existe, esto es la tarjeta de siempre. Si no,
   es un botón que la crea.

   Ese botón es el que faltaba: la organización solo nacía cuando Leogin la
   creaba a mano, así que quien ya tenía sus restaurantes antes del cambio se
   quedaba sin link de grupo y sin manera de pedirlo salvo escribiendo.
   ============================================================ */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/icons';
import { createGroupLink } from '@/lib/actions/mi-cuenta';
import GroupLinkCard from './group-link-card';

export default function GroupLinkSection({ url, groupName }: { url: string | null; groupName: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  if (url) return <GroupLinkCard url={url} groupName={groupName} />;

  function activate() {
    setError(null);
    start(async () => {
      const res = await createGroupLink();
      if ('error' in res) { setError(res.error); return; }
      router.refresh();
    });
  }

  return (
    <div className="glass" style={{ borderRadius: 16, padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="t-kicker" style={{ fontSize: 9.5 }}>Link de pedidos en línea · grupo</div>
      <p style={{ fontSize: 12.5, color: 'var(--u-text-3)', margin: 0, lineHeight: 1.55 }}>
        Un <strong>único link</strong> para todos tus restaurantes: detecta la ubicación del
        cliente y lo lleva a la sucursal más cercana para pedir. Ideal para Instagram,
        WhatsApp o flyers, en vez de repartir un link por local.
      </p>
      {error && <p style={{ fontSize: 12.5, color: 'var(--c-danger)', margin: 0 }}>{error}</p>}
      <div>
        <button
          type="button"
          onClick={activate}
          disabled={pending}
          className="press btn-accent"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 7,
            padding: '10px 16px', borderRadius: 'var(--radius-full)',
            fontSize: 13, fontWeight: 600, border: 'none',
            cursor: pending ? 'wait' : 'pointer', opacity: pending ? 0.7 : 1,
          }}
        >
          <Icon name="globe" size={15} /> {pending ? 'Creando…' : 'Crear el link del grupo'}
        </button>
      </div>
    </div>
  );
}
