'use client';

/* Activa/desactiva el selector de idioma (ES/EN) del menú público (Fase 3
   auditoría de lanzamiento: experiencia multi-mercado). Los productos y
   categorías sin traducción capturada muestran el español — el dueño no
   tiene que traducir todo su catálogo antes de poder activarlo.

   Vive como una FILA de la portada de Ajustes, no como una pantalla propia:
   un solo interruptor no justifica un viaje de ida y vuelta. Por eso el
   formulario se dibuja con la forma de una fila de lista (texto flexible +
   control a la derecha) y no con la suya. */

import { useRef } from 'react';
import { ListText } from '@/components/ui/list';
import { Switch } from '@/components/ui/switch';
import { updateMenuLanguages } from '@/lib/actions/restaurant';
import type { Restaurant } from '@/types';

export default function MenuLanguagesEditor({ restaurant, translated }: {
  restaurant: Restaurant;
  /** Cuántos platillos a la vista tienen nombre en inglés (AJU-18). */
  translated?: { done: number; total: number };
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const enabled = (restaurant.menu_languages ?? []).includes('en');

  return (
    <form ref={formRef} action={updateMenuLanguages} className="flex min-w-0 flex-1 items-center gap-3.5">
      <input type="hidden" name="restaurantId" value={restaurant.id} />
      <input type="hidden" name="menu_languages" value={enabled ? '' : 'en'} />
      <ListText
        title="Menú también en inglés"
        desc="Los platillos sin traducción se ven en español."
      />
      {/* Cuánto falta, sin tener que abrir platillo por platillo: un
          interruptor encendido con 0 traducidos no hace nada (AJU-18). */}
      {translated && translated.total > 0 && (
        <span
          className="shrink-0 text-[13px]"
          style={{ color: enabled && translated.done < translated.total ? 'var(--c-warn)' : 'var(--u-text-3)' }}
          title={`${translated.done} de ${translated.total} platillos con nombre en inglés`}
        >
          {translated.done} de {translated.total}
        </span>
      )}
      <Switch
        checked={enabled}
        onCheckedChange={() => formRef.current?.requestSubmit()}
        aria-label={enabled ? 'Desactivar menú en inglés' : 'Activar menú en inglés'}
      />
    </form>
  );
}
