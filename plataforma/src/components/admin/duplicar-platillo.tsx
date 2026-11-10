'use client';

/* Duplicar un platillo como punto de partida (auditoría 1.9, R07.3).
   La copia nace OCULTA hasta revisarla (decisión del dueño, 2026-11-09). */

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { duplicateProduct } from '@/lib/actions/products';

export default function DuplicarPlatillo({ restaurantId, productId, nombre }: {
  restaurantId: string; productId: string; nombre: string;
}) {
  const { confirmSubmit, dialog } = useConfirm();
  const [error, setError] = useState<string | null>(null);
  const [pendiente, setPendiente] = useState(false);

  async function duplicar(fd: FormData) {
    setPendiente(true);
    setError(null);
    // En éxito el servidor lleva a la ficha de la copia; aquí sólo vuelve si falla.
    const r = await duplicateProduct(fd);
    setPendiente(false);
    if (r?.error) setError(r.error);
  }

  return (
    <>
      {dialog}
      <form
        action={duplicar}
        onSubmit={confirmSubmit({
          title: `¿Duplicar «${nombre}»?`,
          description: 'Se copian opciones, dietas, sellos, foto y receta. Las existencias no. La copia queda oculta hasta que la revises.',
          confirmLabel: 'Duplicar',
          destructive: false,
        })}
        style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}
      >
        <input type="hidden" name="restaurantId" value={restaurantId} />
        <input type="hidden" name="id" value={productId} />
        <Button type="submit" variant="secondary" size="touch" disabled={pendiente}>
          {pendiente ? 'Duplicando…' : 'Duplicar'}
        </Button>
        {error && <span role="alert" style={{ fontSize: 13, color: 'var(--c-danger)' }}>{error}</span>}
      </form>
    </>
  );
}
