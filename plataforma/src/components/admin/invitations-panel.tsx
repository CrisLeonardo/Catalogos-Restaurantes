'use client';

/* Invitaciones al equipo (migración 114) — RETIRADAS de la pantalla.
   El acceso del administrador se crea ahora en Personal, con usuario y
   contraseña de ese restaurante (ver lib/staff-email.ts). Este panel solo
   sobrevive para VER y REVOCAR las invitaciones que quedaran vivas de antes:
   cuando no queda ninguna, /admin/personal deja de montarlo. El enlace de
   aceptación (/invitacion/<token>) sigue funcionando para que a nadie se le
   muera un correo ya enviado. */

import { Icon } from '@/components/icons';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { revokeInvitation } from '@/lib/actions/invitations';
import type { PendingInvitation } from '@/lib/auth/invitations';

const ROLE_LABEL: Record<string, string> = {
  MANAGER: 'Gerente',
  STAFF: 'Personal',
  WAITER: 'Mesero',
};

function whenExpires(iso: string, expired: boolean): string {
  if (expired) return 'vencida';
  const days = Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
  return days <= 1 ? 'vence hoy' : `vence en ${days} días`;
}

export default function InvitationsPanel({ restaurantId, invitations }: {
  restaurantId: string;
  invitations: PendingInvitation[];
}) {

  return (
    <Card className="p-4.5 flex flex-col gap-3.5" style={{ marginTop: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <div className="adm-label">Invitaciones pendientes</div>
      </div>

      <p style={{ fontSize: 12.5, color: 'var(--u-text-3)', margin: 0, lineHeight: 1.5 }}>
        Enlaces que enviaste antes y siguen vivos. Quien los abra entrará con normalidad.
        Si ya no quieres que entre, revócalo aquí. Para dar acceso a alguien nuevo,
        usa <strong>Nuevo miembro</strong> arriba: se crea con un usuario y una contraseña
        de tu restaurante.
      </p>

      {invitations.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--u-text-4)' }}>No hay invitaciones pendientes.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {invitations.map((inv) => (
            <div
              key={inv.id}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '9px 0', borderTop: '1px solid var(--u-hair)',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, color: 'var(--u-text)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {inv.email}
                </div>
                <div style={{ fontSize: 11.5, color: inv.expired ? 'var(--c-danger)' : 'var(--u-text-4)', marginTop: 1 }}>
                  {ROLE_LABEL[inv.role] ?? inv.role} · {whenExpires(inv.expiresAt, inv.expired)}
                </div>
              </div>
              <form
                action={revokeInvitation}
                onSubmit={(e) => { if (!confirm('¿Cancelar esta invitación? El enlace dejará de funcionar.')) e.preventDefault(); }}
                style={{ flexShrink: 0 }}
              >
                <input type="hidden" name="restaurantId" value={restaurantId} />
                <input type="hidden" name="invitationId" value={inv.id} />
                <Button type="submit" variant="ghost" size="sm" aria-label="Cancelar invitación">
                  <Icon name="x" size={15} />
                </Button>
              </form>
            </div>
          ))}
        </div>
      )}

    </Card>
  );
}
