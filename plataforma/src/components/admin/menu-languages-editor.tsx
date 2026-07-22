'use client';

/* Activa/desactiva el selector de idioma (ES/EN) del menú público (Fase 3
   auditoría de lanzamiento: experiencia multi-mercado). Los productos y
   categorías sin traducción capturada muestran el español — el dueño no
   tiene que traducir todo su catálogo antes de poder activarlo. */

import { useRef } from 'react';
import { Switch } from '@/components/ui/switch';
import { updateMenuLanguages } from '@/lib/actions/restaurant';
import type { Restaurant } from '@/types';

export default function MenuLanguagesEditor({ restaurant }: { restaurant: Restaurant }) {
  const formRef = useRef<HTMLFormElement>(null);
  const enabled = (restaurant.menu_languages ?? []).includes('en');

  return (
    <form ref={formRef} action={updateMenuLanguages}>
      <input type="hidden" name="restaurantId" value={restaurant.id} />
      <input type="hidden" name="menu_languages" value={enabled ? '' : 'en'} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--u-text)' }}>Menú también en inglés</div>
          <div style={{ fontSize: 12.5, color: 'var(--u-text-3)', marginTop: 2, lineHeight: 1.5 }}>
            Muestra un selector ES/EN en tu menú público. Los platillos o categorías sin traducción
            capturada (campo &quot;(inglés)&quot; en Catálogo/Categorías) se ven en español.
          </div>
        </div>
        <Switch
          checked={enabled}
          onCheckedChange={() => formRef.current?.requestSubmit()}
          aria-label={enabled ? 'Desactivar menú en inglés' : 'Activar menú en inglés'}
        />
      </div>
    </form>
  );
}
