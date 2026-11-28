'use client';

/* «Empezar a recibir domicilios» (auditoría 26-nov, hallazgo 5).
   Un local nuevo ya no nace repartiendo a cualquier dirección y a toda
   hora: la carta recibe pedidos para recoger y el domicilio espera a que
   el dueño vea sus tres reglas —hasta dónde, cuánto cobra y a qué hora— y
   las confirme. Si elige cualquier dirección o toda hora, aquí se dice
   como lo que es: una elección. */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import PanelLink from '@/components/admin/panel-link';
import { Button } from '@/components/ui/button';
import { confirmarReparto } from '@/lib/actions/restaurant';

export interface ReglaReparto { etiqueta: string; valor: string; aviso?: string; href?: string }

export default function ConfirmarReparto({ restaurantId, reglas }: { restaurantId: string; reglas: ReglaReparto[] }) {
  const router = useRouter();
  const [pendiente, start] = useTransition();
  const [error, setError] = useState('');
  const elecciones = reglas.filter((r) => r.aviso).map((r) => r.aviso!);

  return (
    <section aria-labelledby="confirmar-reparto" className="rounded-adm-xl border border-adm-border bg-adm-card p-4 shadow-adm-sm md:p-5" style={{ marginBottom: 20 }}>
      <h2 id="confirmar-reparto" className="text-[16px] font-bold text-adm-text">Tu carta todavía no recibe domicilios</h2>
      <p className="mt-1 text-[13px] leading-snug text-adm-text-2">
        Ya recibe pedidos para recoger. Revisa cómo repartes y confírmalo para que tus clientes puedan pedir a domicilio.
      </p>
      <dl className="m-0 mt-3 grid gap-0">
        {reglas.map((r) => (
          <div key={r.etiqueta} className="flex min-h-11 items-center justify-between gap-3 border-t border-adm-border py-2">
            <dt className="text-[13px] text-adm-text-3">{r.etiqueta}</dt>
            <dd className="m-0 text-right text-[14px] font-semibold text-adm-text">
              {r.href ? <PanelLink href={r.href} className="text-adm-text no-underline">{r.valor}</PanelLink> : r.valor}
            </dd>
          </div>
        ))}
      </dl>
      {elecciones.length > 0 && (
        <p className="note note-warn mt-2" style={{ margin: '8px 0 0' }}>
          {elecciones.join(' ')} Si no es así, cámbialo antes de confirmar.
        </p>
      )}
      {error && <p role="alert" className="mt-2 text-[13px] font-medium" style={{ color: 'var(--c-danger)' }}>{error}</p>}
      <Button type="button" size="touch" className="mt-3 w-full md:w-auto" disabled={pendiente}
        onClick={() => start(async () => {
          setError('');
          const r = await confirmarReparto(restaurantId);
          if ('error' in r) { setError(r.error); return; }
          router.refresh();
        })}>
        {pendiente ? 'Guardando…' : 'Empezar a recibir domicilios'}
      </Button>
    </section>
  );
}
