'use client';

/* Lo que no tiene vuelta atrás (fase 5).
   ------------------------------------------------------------
   Suspender y borrar. Aparte del rescate y al final de la ficha a
   propósito: son las dos cosas que se hacen CONTRA alguien, no para
   ayudarle, y no deberían estar al lado del botón que se pulsa todos
   los días.

   El aviso de «se quedarían sin dueño» no es decorativo: cuando hay
   locales en esa lista, el botón de borrar no está. Quitarle a alguien
   el último acceso de dueño ya está prohibido desde la pestaña Accesos
   —un local sin dueño sigue funcionando y facturando mientras nadie
   puede entrar a su panel— y borrar su cuenta es el mismo sitio por
   otro camino. La salida es nombrar otro dueño primero, que desde la
   fase 4 sí se puede. */

import { useActionState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/icons';
import DeleteButton from '@/components/admin/delete-button';
import {
  toggleAccountSuspension,
  deleteAccount,
  type AccountActionState,
} from '@/lib/actions/accounts';

const vacio: AccountActionState = null;

export type LocalEnRiesgo = { restaurantId: string; name: string };

export default function AccountDanger({
  userId,
  email,
  suspendida,
  sinDueño,
}: {
  userId: string;
  email: string | null;
  suspendida: boolean;
  /** Locales que se quedarían sin ninguna persona dueña si se borra. */
  sinDueño: LocalEnRiesgo[];
}) {
  const [state, action, pending] = useActionState(toggleAccountSuspension, vacio);
  const [borrado, borrar] = useActionState(deleteAccount, vacio);
  const bloqueado = sinDueño.length > 0;

  return (
    <Card
      style={{
        padding: 18,
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        border: '1px solid color-mix(in srgb, var(--c-danger) 20%, transparent)',
      }}
    >
      {/* Suspender / reactivar */}
      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <Icon name="alertCircle" size={17} style={{ color: 'var(--c-danger)', flexShrink: 0, marginTop: 2 }} />
        <div style={{ flex: '1 1 260px', minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--u-text)' }}>
            {suspendida ? 'Reactivar la cuenta' : 'Suspender la cuenta'}
          </div>
          <p style={{ fontSize: 13, color: 'var(--u-text-4)', margin: '3px 0 0', lineHeight: 1.55 }}>
            {suspendida
              ? 'Está suspendida: no puede entrar a ningún sitio. Reactivarla le devuelve el acceso con la contraseña de siempre.'
              : 'Apaga a la PERSONA, no a un local. Sus restaurantes siguen funcionando y cobrando; lo que se corta es que ella entre — y que abra más.'}
          </p>
        </div>
        <form action={action}>
          <input type="hidden" name="userId" value={userId} />
          <input type="hidden" name="suspender" value={suspendida ? 'false' : 'true'} />
          <Button type="submit" variant={suspendida ? 'secondary' : 'destructive'} disabled={pending}>
            {pending ? '…' : suspendida ? 'Reactivar' : 'Suspender'}
          </Button>
        </form>
      </div>

      {state && (
        <div
          role="status"
          style={{
            display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12, lineHeight: 1.55,
            color: 'error' in state ? 'var(--c-danger)' : 'var(--c-ok)',
          }}
        >
          <Icon name={'error' in state ? 'alertCircle' : 'checkCircle'} size={15} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>{'error' in state ? state.error : state.ok}</span>
        </div>
      )}

      <hr style={{ border: 0, borderTop: '1px solid var(--adm-border, var(--u-hair))', margin: 0 }} />

      {/* Borrar */}
      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <Icon name="trash" size={17} style={{ color: 'var(--c-danger)', flexShrink: 0, marginTop: 2 }} />
        <div style={{ flex: '1 1 260px', minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--u-text)' }}>
            Borrar la cuenta
          </div>
          <p style={{ fontSize: 13, color: 'var(--u-text-4)', margin: '3px 0 0', lineHeight: 1.55 }}>
            Desaparece de Auth y con ella sus membresías. No se puede deshacer, y la persona no
            recupera nada: si vuelve, empieza de cero.
          </p>

          {bloqueado && (
            <div
              style={{
                marginTop: 10, padding: '10px 12px', borderRadius: 'var(--radius-md)',
                background: 'color-mix(in srgb, var(--c-danger) 10%, transparent)',
                border: '1px solid color-mix(in srgb, var(--c-danger) 26%, transparent)',
                fontSize: 12, lineHeight: 1.6, color: 'var(--u-text-2, var(--u-text))',
              }}
            >
              No se puede todavía: es la <strong>única persona dueña</strong> de{' '}
              {sinDueño.length === 1 ? 'este local' : `estos ${sinDueño.length} locales`}, que se
              quedarían funcionando y cobrando sin que nadie pudiera entrar a su panel.
              <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
                {sinDueño.map((l) => (
                  <li key={l.restaurantId} style={{ marginBottom: 2 }}>
                    <Link
                      href={`/super/restaurantes/${l.restaurantId}/accesos`}
                      style={{ color: 'var(--brand-accent-ink)', textDecoration: 'none', fontWeight: 600 }}
                    >
                      {l.name}
                    </Link>
                  </li>
                ))}
              </ul>
              <div style={{ marginTop: 8 }}>
                Nombra dueño a otra persona en cada uno y vuelve aquí.
              </div>
            </div>
          )}
        </div>

        {!bloqueado && (
          <DeleteButton
            action={borrar}
            hiddenFields={{ userId }}
            label="Borrar la cuenta"
            confirm={`¿Borrar la cuenta de ${email ?? 'esta persona'}?`}
          />
        )}
        {borrado && 'error' in borrado && (
          <p role="alert" style={{ margin: 0, fontSize: 13, color: 'var(--c-danger)', lineHeight: 1.5 }}>{borrado.error}</p>
        )}
      </div>
    </Card>
  );
}
