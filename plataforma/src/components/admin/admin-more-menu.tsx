'use client';

/* ============================================================
   MENÚ "⋯" DE LA BARRA DE TÍTULO — solo móvil
   ------------------------------------------------------------
   En escritorio la barra lateral tiene sitio de sobra para el
   buscador, el plan, el cambio de restaurante y la tarjeta de
   usuario, y la barra de título para ayuda, tema e instalar.

   En un teléfono no. Antes esas nueve cosas se apretaban en una
   segunda banda encima del título: en un iPhone el panel gastaba
   258 px —un tercio de la pantalla— en armazón antes de enseñar
   una sola línea de trabajo.

   Aquí se juntan todas detrás de un botón, que es lo que hace
   una app: barra de título con el nombre de la pantalla y un
   "más"; navegación abajo. Nada se pierde, todo baja un nivel.
   ============================================================ */

/* `Link` es aqui `PanelLink`: traduce las rutas del panel al origen desde el
   que se sirve la pagina. Lo que no es del panel pasa de largo sin tocarse.
   Ver components/admin/panel-link.tsx. */
import Link from '@/components/admin/panel-link';
import { Icon } from '@/components/icons';
import { useAdminScheme } from '@/components/admin/theme-toggle';
import { logout } from '@/lib/actions/auth';
import { changeOperatorUser } from '@/lib/actions/operator';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { usePathname as useRutaNavegador } from 'next/navigation';
import { panelBaseFrom, panelHref } from '@/lib/panel-links';

interface Props {
  restaurantName: string;
  roleLabel: string;
  planLabel?: string | null;
  planColor?: string;
  hasMultipleRestaurants?: boolean;
  /** Sección del centro de ayuda de la pantalla actual, si tiene. */
  helpSection?: string | null;
  isOperatorSession?: boolean;
}

export default function AdminMoreMenu({
  restaurantName, roleLabel, planLabel, planColor,
  hasMultipleRestaurants = false, helpSection, isOperatorSession = false,
}: Props) {
  /* Prefijo del origen unico ('' en el subdominio de hoy). Ver lib/panel-links.ts. */
  const base = panelBaseFrom(useRutaNavegador());
  const { scheme, toggle } = useAdminScheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="admin-more press glass-quiet"
        aria-label="Más opciones"
        title="Más opciones"
      >
        <Icon name="more" size={19} />
      </DropdownMenuTrigger>

      {/* 44 px por fila: es un menú que se toca con el pulgar, no con un
          ratón. Los 36 px por defecto son cómodos en escritorio y justos en
          un teléfono. */}
      <DropdownMenuContent
        align="end"
        className="min-w-[240px] [&_[data-slot=dropdown-menu-item]]:min-h-11"
      >
        {/* Quién sos y dónde estás. Es lo que decía la tarjeta de usuario de
            la barra lateral, que en móvil ya no existe. */}
        <div className="px-3 pt-2 pb-2.5">
          <div className="truncate text-[14px] font-semibold text-adm-text">{restaurantName}</div>
          <div className="mt-0.5 text-[12px] text-adm-text-3">{roleLabel}</div>
        </div>
        <DropdownMenuSeparator />

        <DropdownMenuItem
          onClick={() => window.dispatchEvent(new Event('admin:search'))}
        >
          <Icon name="search" size={16} /> Buscar en el panel
        </DropdownMenuItem>

        {helpSection && (
          <DropdownMenuItem render={<Link href={`${panelHref(base, '/admin/ayuda')}#${helpSection}`} />}>
            <Icon name="helpCircle" size={16} /> Ayuda de esta pantalla
          </DropdownMenuItem>
        )}

        {/* `closeOnClick={false}`: alternar el tema es un ajuste, no una
            navegación — cerrar el menú al tocarlo impide ver el cambio y
            volver atrás de un toque si no gustó. */}
        <DropdownMenuItem closeOnClick={false} onClick={toggle}>
          <Icon name={scheme === 'light' ? 'moon' : 'sun'} size={16} />
          {scheme === 'light' ? 'Tema oscuro' : 'Tema claro'}
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem render={<Link href="/admin/suscripcion" />}>
          <Icon name="wallet" size={16} />
          <span className="flex-1">Mi suscripción</span>
          {planLabel && (
            <span className="flex items-center gap-1.5 text-[12px] text-adm-text-3">
              <span
                aria-hidden
                className="size-2 rounded-adm-full"
                style={{ background: planColor ?? 'var(--u-text-4)' }}
              />
              {planLabel}
            </span>
          )}
        </DropdownMenuItem>

        {hasMultipleRestaurants && (
          <DropdownMenuItem render={<a href="/mi-cuenta" />}>
            <Icon name="grid" size={16} /> Cambiar de restaurante
          </DropdownMenuItem>
        )}

        {!isOperatorSession && (
          <DropdownMenuItem render={<a href="/mi-cuenta/seguridad" />}>
            <Icon name="key" size={16} /> Mi contraseña
          </DropdownMenuItem>
        )}

        <DropdownMenuSeparator />

        {/* Cerrar sesión: `render` con el <button> del formulario para que
            siga siendo un submit de la acción de servidor y no dependa de
            JavaScript propio. */}
        <form action={isOperatorSession ? changeOperatorUser : logout}>
          <DropdownMenuItem
            variant={isOperatorSession ? 'default' : 'destructive'}
            render={<button type="submit" />}
            className="w-full"
          >
            <Icon name="logOut" size={16} />
            {isOperatorSession ? 'Cambiar de usuario' : 'Cerrar sesión'}
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
