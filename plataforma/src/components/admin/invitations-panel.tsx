'use client';

/* Invitaciones al equipo (migración 114).
   El dueño invita por correo; la cuenta la crea quien acepta, con su propia
   contraseña o con su Google. Reemplaza al "te creo la cuenta y te paso la
   contraseña por WhatsApp". */

import { useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/icons';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ADMIN_SECTIONS } from '@/lib/permissions';
import { inviteToTeam, revokeInvitation, type InviteState } from '@/lib/actions/invitations';
import type { PendingInvitation } from '@/lib/auth/invitations';

/** Secciones que un gerente NO recibe: el cobro es del dueño. */
const GERENTE_EXCLUDES = ['suscripcion'];

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

export default function InvitationsPanel({ restaurantId, invitations, enabledSections, emailEnabled }: {
  restaurantId: string;
  invitations: PendingInvitation[];
  enabledSections: string[];
  /** Sin proveedor de correo, la única vía es copiar el enlace a mano. */
  emailEnabled: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <Card className="p-4.5 flex flex-col gap-3.5" style={{ marginTop: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <div className="t-kicker" style={{ fontSize: 9.5 }}>Invitaciones</div>
        <Button type="button" size="sm" onClick={() => setOpen(true)}>
          <Icon name="plus" size={14} /> Invitar
        </Button>
      </div>

      <p style={{ fontSize: 12.5, color: 'var(--u-text-3)', margin: 0, lineHeight: 1.5 }}>
        Para un gerente o encargado que entra desde donde sea. Le llega un enlace y
        <strong> él elige su propia contraseña</strong> (o entra con su Google): tú nunca
        la conoces y no hay contraseñas circulando por WhatsApp.
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

      {open && (
        <InviteDialog
          restaurantId={restaurantId}
          enabledSections={enabledSections}
          emailEnabled={emailEnabled}
          onClose={() => { setOpen(false); router.refresh(); }}
        />
      )}
    </Card>
  );
}

function InviteDialog({ restaurantId, enabledSections, emailEnabled, onClose }: {
  restaurantId: string;
  enabledSections: string[];
  emailEnabled: boolean;
  onClose: () => void;
}) {
  const [state, formAction, isPending] = useActionState<InviteState, FormData>(inviteToTeam, null);
  const visibleSections = ADMIN_SECTIONS.filter((s) => enabledSections.includes(s.key));

  const gerentePerms = visibleSections
    .map((s) => s.key as string)
    .filter((k) => !GERENTE_EXCLUDES.includes(k));

  const [role, setRole] = useState<'MANAGER' | 'STAFF'>('MANAGER');
  const [perms, setPerms] = useState<string[]>(gerentePerms);
  const [copied, setCopied] = useState(false);

  // Cambiar de rol reajusta lo típico de ese rol; sigue siendo editable.
  useEffect(() => {
    setPerms(role === 'MANAGER' ? gerentePerms : ['pedidos', 'mesas'].filter((p) => enabledSections.includes(p)));
    // gerentePerms se deriva de props estables dentro de este diálogo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  function toggle(key: string) {
    setPerms((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }

  const sent = state && 'ok' in state ? state : null;

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent showClose={false} className="flex w-[460px] max-w-[94vw] max-h-[90vh] flex-col p-0">
        <DialogHeader className="flex-row items-center justify-between px-5.5 py-4.5 border-b border-[var(--u-hair)] space-y-0">
          <DialogTitle className="t-display" style={{ fontSize: 19 }}>
            {sent ? 'Invitación lista' : 'Invitar al equipo'}
          </DialogTitle>
          <Button type="button" onClick={onClose} variant="ghost" size="icon" aria-label="Cerrar">
            <Icon name="x" size={18} />
          </Button>
        </DialogHeader>

        <div style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto' }}>
          {sent ? (
            /* El enlace se enseña SIEMPRE, se haya mandado el correo o no: es
               lo que permite seguir trabajando si el correo tarda, cae en spam
               o el proveedor no está configurado. */
            <>
              <p style={{ fontSize: 14, color: 'var(--u-text-2)', margin: 0, lineHeight: 1.55 }}>
                {sent.sent
                  ? 'Le mandamos el correo con la invitación. Si no le llega en unos minutos, pásale este enlace:'
                  : 'El correo automático no está disponible ahora mismo. Pásale tú este enlace:'}
              </p>
              <div
                style={{
                  padding: '11px 13px', borderRadius: 11, wordBreak: 'break-all',
                  background: 'color-mix(in srgb, var(--u-text) 5%, transparent)',
                  border: '1px solid var(--u-hair)', fontSize: 12.5, color: 'var(--u-text-2)',
                  fontFamily: 'ui-monospace, monospace',
                }}
              >
                {sent.url}
              </div>
              <Button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(sent.url);
                    setCopied(true);
                  } catch {
                    setCopied(false);
                  }
                }}
              >
                {copied ? 'Copiado' : 'Copiar enlace'}
              </Button>
              <p style={{ fontSize: 11.5, color: 'var(--u-text-4)', margin: 0, lineHeight: 1.45 }}>
                Vence en 7 días y solo funciona una vez. Solo sirve para el correo al que lo mandaste.
              </p>
              <Button type="button" variant="secondary" onClick={onClose}>Listo</Button>
            </>
          ) : (
            <form action={formAction} style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
              <input type="hidden" name="restaurantId" value={restaurantId} />
              <input type="hidden" name="role" value={role} />
              {perms.map((p) => <input key={p} type="hidden" name="permissions" value={p} />)}

              <div>
                <label style={{ fontSize: 10.5, color: 'var(--u-text-3)', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 6, display: 'block' }}>
                  Su correo *
                </label>
                <input
                  name="email"
                  type="email"
                  required
                  autoFocus
                  placeholder="encargado@ejemplo.com"
                  style={{
                    width: '100%', background: 'color-mix(in srgb, var(--u-text) 5%, transparent)',
                    border: '1px solid var(--u-hair)', borderRadius: 11, padding: '10px 12px',
                    color: 'var(--u-text)', fontSize: 14, outline: 'none',
                  }}
                />
                {!emailEnabled && (
                  <p style={{ fontSize: 11.5, color: 'var(--u-text-4)', marginTop: 6, lineHeight: 1.45 }}>
                    El envío automático de correo no está configurado: al terminar te damos el enlace para pasárselo tú.
                  </p>
                )}
              </div>

              <div>
                <label style={{ fontSize: 10.5, color: 'var(--u-text-3)', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 6, display: 'block' }}>
                  Qué va a ser
                </label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {([
                    { id: 'MANAGER' as const, title: 'Gerente', desc: 'Todo menos el cobro' },
                    { id: 'STAFF' as const, title: 'Personal', desc: 'Solo lo que marques' },
                  ]).map((opt) => {
                    const on = role === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setRole(opt.id)}
                        className="press"
                        style={{
                          flex: 1, textAlign: 'left', cursor: 'pointer', padding: '10px 12px', borderRadius: 11,
                          border: `1.5px solid ${on ? 'var(--brand-accent)' : 'var(--u-hair)'}`,
                          background: on ? 'color-mix(in srgb, var(--brand-accent) 10%, transparent)' : 'color-mix(in srgb, var(--u-text) 4%, transparent)',
                        }}
                      >
                        <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: 'var(--u-text)' }}>{opt.title}</span>
                        <span style={{ display: 'block', fontSize: 11.5, color: 'var(--u-text-4)', marginTop: 1 }}>{opt.desc}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label style={{ fontSize: 10.5, color: 'var(--u-text-3)', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 6, display: 'block' }}>
                  Acceso a secciones
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                  {visibleSections.map((s) => {
                    const on = perms.includes(s.key);
                    return (
                      <button
                        key={s.key}
                        type="button"
                        onClick={() => toggle(s.key)}
                        className="press"
                        style={{
                          padding: '7px 12px', borderRadius: 99, cursor: 'pointer', fontSize: 12.5, fontWeight: 600,
                          border: `1px solid ${on ? 'transparent' : 'var(--u-hair)'}`,
                          background: on ? 'var(--u-text)' : 'color-mix(in srgb, var(--u-text) 4%, transparent)',
                          color: on ? 'var(--brand-bg)' : 'var(--u-text-3)',
                        }}
                      >
                        {s.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {state && 'error' in state && (
                <div style={{ fontSize: 13, color: 'var(--c-danger)' }}>{state.error}</div>
              )}

              <Button type="submit" disabled={isPending} size="lg" className="w-full rounded-adm-full">
                {isPending ? 'Enviando…' : 'Enviar invitación'}
              </Button>
            </form>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
