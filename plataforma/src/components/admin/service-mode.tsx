'use client';

/* Modo servicio — la pantalla completa de Cocina y Tomar pedidos.
   ------------------------------------------------------------------
   Quita la barra lateral y la barra superior del panel y deja el
   armazón solo, que es como se usa una tablet sobre el mostrador o una
   PC en la caja durante el turno.

   Quien lo enciende es `AdminShell` —es el único que sabe si pinta o no
   su chrome alrededor del contenido—, pero el botón que lo pide vive
   DENTRO de la pantalla, junto al trabajo. Este contexto es el cable
   entre los dos: sin él, el panel de mesero tendría que hablar con el
   armazón por eventos de ventana, que es lo mismo pero sin tipos y sin
   que nadie pueda seguir el rastro.

   `null` fuera del panel: quien lo consuma tiene que aguantar no tener
   modo servicio (la vista previa del editor de temas, por ejemplo). */

import { createContext, useContext } from 'react';

export interface ServiceMode {
  /** ¿Está ahora mismo a pantalla completa? */
  active: boolean;
  /** Entra o sale. */
  toggle: () => void;
}

export const ServiceModeContext = createContext<ServiceMode | null>(null);

/** El modo servicio de esta pantalla, o `null` si aquí no existe. */
export function useServiceMode(): ServiceMode | null {
  return useContext(ServiceModeContext);
}
