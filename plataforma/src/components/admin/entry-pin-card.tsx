'use client';

/* PIN de entrada al restaurante (migración 113).
   El candado que se pide al abrir este restaurante desde Mi cuenta. Solo lo
   ve y lo cambia el dueño: protege el negocio entero, así que lo pone quien
   responde por él. */

import { useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/icons';
import { Card } from '@/components/ui/card';
import { Section } from '@/components/ui/section';
import { Button } from '@/components/ui/button';
import { updateEntryPin, type EntryPinState } from '@/lib/actions/mi-cuenta';

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'color-mix(in srgb, var(--u-text) 5%, transparent)',
  border: '1px solid var(--u-hair)',
  borderRadius: 11,
  padding: '10px 12px',
  color: 'var(--u-text)',
  fontSize: 14,
  outline: 'none',
  letterSpacing: '0.3em',
};

export default function EntryPinCard({ restaurantId, hasPin }: {
  restaurantId: string;
  hasPin: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [state, formAction, isPending] = useActionState<EntryPinState, FormData>(updateEntryPin, null);

  useEffect(() => {
    if (state && 'ok' in state) {
      setEditing(false);
      router.refresh();
    }
  }, [state, router]);

  return (
    <Section
      title="PIN de entrada"
      aside={hasPin ? (
        <span className="chip chip-ok" style={{ flexShrink: 0 }}>
          <Icon name="key" size={11} /> Activo
        </span>
      ) : undefined}
    >
      <Card className="p-4.5 flex flex-col gap-3">
      <p style={{ fontSize: 12.5, color: 'var(--u-text-3)', margin: 0, lineHeight: 1.5 }}>
        {hasPin
          ? 'Al abrir este restaurante desde Mi cuenta se pide este PIN. Se recuerda 12 horas en cada aparato, no se pregunta a cada rato.'
          : 'Sin PIN se entra directo desde Mi cuenta. Ponle uno si quieres que una sesión abierta y desatendida no pueda entrar aquí — útil sobre todo si administras varios restaurantes.'}
      </p>

      {editing ? (
        <form action={formAction} style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <input type="hidden" name="restaurantId" value={restaurantId} />
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 10.5, color: 'var(--u-text-3)', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 6, display: 'block' }}>
              Nuevo PIN (4 dígitos)
            </label>
            <input
              name="pin"
              type="text"
              inputMode="numeric"
              pattern="\d{4}"
              maxLength={4}
              required
              autoFocus
              placeholder="1234"
              style={inputStyle}
            />
          </div>
          <Button type="submit" disabled={isPending} className="whitespace-nowrap">
            {isPending ? 'Guardando…' : 'Guardar'}
          </Button>
          <Button type="button" variant="ghost" onClick={() => setEditing(false)}>Cancelar</Button>
        </form>
      ) : (
        <div style={{ display: 'flex', gap: 8 }}>
          <Button type="button" size="sm" variant={hasPin ? 'secondary' : 'primary'} onClick={() => setEditing(true)}>
            {hasPin ? 'Cambiar PIN' : 'Poner un PIN'}
          </Button>
          {hasPin && (
            <form
              action={formAction}
              onSubmit={(e) => { if (!confirm('¿Quitar el PIN? Se entrará directo desde Mi cuenta.')) e.preventDefault(); }}
            >
              <input type="hidden" name="restaurantId" value={restaurantId} />
              <input type="hidden" name="remove" value="true" />
              <Button type="submit" size="sm" variant="ghost" disabled={isPending}>Quitar</Button>
            </form>
          )}
        </div>
      )}

      {state && 'error' in state && (
        <div style={{ fontSize: 12.5, color: 'var(--c-danger)' }}>{state.error}</div>
      )}
      </Card>
    </Section>
  );
}
