'use client';

/* Pantalla que reemplaza al checkout cuando el restaurante está cerrado
   (horario) o con los pedidos en pausa ("cocina saturada"). El carrito
   NO se borra: el comensal puede volver cuando abran. */

import { Glass } from '@/components/glass';
import { Icon } from '@/components/icons';
import { PrimaryButton } from '@/components/menu/ui';
import { useThemeContent } from '@/lib/theme/context';
import { useTenantPrefix } from '@/lib/tenant-client';

export default function CheckoutBlocked({
  reason,
  pauseMessage,
}: {
  reason: 'closed' | 'paused';
  pauseMessage: string | null;
}) {
  const content = useThemeContent();
  const backHref = useTenantPrefix('/');
  const title = reason === 'paused' ? content.checkout.pausedTitle : content.checkout.closedTitle;
  const msg =
    reason === 'paused'
      ? pauseMessage?.trim() || content.checkout.pausedMsg || 'Estamos a tope en cocina. Vuelve a intentar en unos minutos.'
      : content.checkout.closedMsg;

  return (
    <main className="themed-type" style={{ minHeight: '100svh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 16px' }}>
      <Glass className="anim-pop" style={{ padding: '34px 26px', textAlign: 'center', maxWidth: 400, width: '100%' }}>
        <div style={{ width: 64, height: 64, borderRadius: 20, margin: '0 auto 16px', display: 'grid', placeItems: 'center', background: 'var(--surface-3)', color: 'var(--u-text-2)' }}>
          <Icon name={reason === 'paused' ? 'flame' : 'clock'} size={30} strokeWidth={1.6} />
        </div>
        <h2 className="t-display" style={{ fontSize: 'var(--fs-h1)', marginBottom: 10 }}>{title}</h2>
        <p className="t-serif" style={{ fontSize: 16, lineHeight: 1.45, marginBottom: 22 }}>
          {msg}
        </p>
        <PrimaryButton href={backHref} full>{content.tracking.back}</PrimaryButton>
      </Glass>
    </main>
  );
}
