/* Pedidos › Mesas — QUÉ ESTÁ PASANDO en el salón.
   ------------------------------------------------------------------
   Esta pantalla se llamaba «Mesas» y enseñaba un formulario: cuántas
   mesas hay, sus códigos QR, el plano, la propina. Es decir, tenía
   nombre de pantalla de operación y contenido de pantalla de ajustes,
   y el dueño no tenía en ningún sitio la respuesta a "¿cómo va mi
   salón ahora mismo?".

   Desde el rediseño de 2026-08-26 son dos:
     · aquí vive lo que está pasando;
     · en Ajustes › Salón vive cómo está armado el salón.

   Desde el rediseño de 2026-09-01 esto es UNA pantalla con tres
   vistas del mismo salón —Fichas, Plano y Lista— bajo una barra
   superior que no se mueve. Ver `components/admin/salon-board.tsx`.

   El tablero usa la MISMA regla que el mesero (lib/table-state.ts):
   si una mesa sale en acento aquí, sale en acento en su teléfono. */

/* `Link` es aqui `PanelLink`: traduce las rutas del panel al origen desde el
   que se sirve la pagina. Lo que no es del panel pasa de largo sin tocarse.
   Ver components/admin/panel-link.tsx. */
import Link from '@/components/admin/panel-link';
import SalonBoard from '@/components/admin/salon-board';
import PlanLockedScreen from '@/components/admin/plan-locked-screen';
import { Icon } from '@/components/icons';
import { getActiveTableNumbers, getPendingTableCalls, getTableTurnsToday } from '@/lib/db/orders';
import { getOpenTableSessions, getWaiterRoster } from '@/lib/db/table-sessions';
import { getSalonData } from './salon-data';

export const metadata = { title: 'Mesas – Panel admin' };

export default async function MesasPage() {
  const { restaurantId, config, hasWaiterPanel, hasDineIn, isSuperAdmin, timezone } = await getSalonData();

  /* Gestión de mesas es de Premium en adelante, pero un ESTANDAR con el
     paquete "Local" (dine_in activo) también depende de esta pantalla:
     sin acceso aquí, "comer en local" no tendría cómo verse. Solo se
     bloquea a quien no tiene ni el plan ni dine_in. */
  if (!isSuperAdmin && !hasWaiterPanel && !hasDineIn) {
    return (
      <PlanLockedScreen
        feature="Gestión de mesas"
        description="El mapa de mesas y el control de estado (libre, ocupada, por cobrar) son parte del panel de mesero, exclusivo del plan Premium."
        icon="grid"
      />
    );
  }

  if (!restaurantId || !config) {
    return (
      <p style={{ fontSize: 14, color: 'var(--u-text-3)' }}>
        No se pudo cargar la configuración del restaurante.
      </p>
    );
  }

  /* La ocupación del salón son DOS cosas desde la migración 128: las mesas
     con pedido vivo (como siempre) y las que alguien sentó y todavía no han
     pedido. Van en el mismo `Promise.all` porque la pantalla no puede
     pintarse a medias: sin las sentadas, «Mesas con gente» mentiría durante
     los primeros minutos de cada mesa. */
  const [occupancy, calls, turnsToday, seatings, waiters] = await Promise.all([
    getActiveTableNumbers(restaurantId),
    getPendingTableCalls(restaurantId),
    getTableTurnsToday(restaurantId, timezone),
    getOpenTableSessions(restaurantId),
    getWaiterRoster(restaurantId),
  ]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <SalonBoard
        tableCount={config.dineInTableCount}
        occupancy={occupancy}
        calls={calls}
        seatings={seatings}
        waiters={waiters}
        restaurantId={restaurantId}
        turnsToday={turnsToday}
        floorPlan={config.floorPlan ?? null}
        umbrales={{
          readyMin: config.salonReadyMin,
          unpaidMin: config.salonUnpaidMin,
          unacceptedMin: config.salonUnacceptedMin,
        }}
        currency={{
          symbol: config.currencySymbol,
          position: config.currencyPosition,
          locale: config.locale,
        }}
        waiterHref={hasWaiterPanel || isSuperAdmin ? '/admin/mesero' : null}
      />

      {/* La configuración ya no vive aquí: se dice dónde está, en vez de
          dejar al dueño buscándola donde siempre estuvo. */}
      <Link
        href="/admin/ajustes/salon"
        className="press"
        style={{
          display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px',
          border: '1px solid var(--u-hair)', borderRadius: 'var(--radius-lg)', textDecoration: 'none',
          background: 'var(--adm-card, transparent)',
        }}
      >
        <span style={{
          display: 'grid', placeItems: 'center', width: 30, height: 30, borderRadius: 'var(--radius-md)', flexShrink: 0,
          background: 'color-mix(in srgb, var(--u-text) 8%, transparent)', color: 'var(--u-text-2)',
        }}>
          <Icon name="settings" size={16} />
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: 14, fontWeight: 500, color: 'var(--u-text)' }}>
            Configuración del salón
          </span>
          <span style={{ display: 'block', fontSize: 13, color: 'var(--u-text-3)', marginTop: 1, lineHeight: 1.35 }}>
            Cuántas mesas, sillas por mesa, códigos QR y NFC, plano por niveles, propina
          </span>
        </span>
        <span style={{ fontSize: 13, color: 'var(--u-text-3)', flexShrink: 0 }}>Ajustes › Salón</span>
        <Icon name="chevronRight" size={17} style={{ color: 'var(--u-text-4)', flexShrink: 0 }} />
      </Link>
    </div>
  );
}
