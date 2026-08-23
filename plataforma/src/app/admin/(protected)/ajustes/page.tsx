import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getAdminContext } from '@/lib/db/admin';
import { getRestaurantBySlug } from '@/lib/db/restaurants';
import { createServiceClient } from '@/lib/supabase/service';
import { can } from '@/lib/permissions';
import { PLANS, type PlanCode } from '@/lib/plans';
import { Icon } from '@/components/icons';
import { List, ListLink, ListRow, ListText } from '@/components/ui/list';
import { Section } from '@/components/ui/section';
import MenuLanguagesEditor from '@/components/admin/menu-languages-editor';
import type { Restaurant } from '@/types';

export const metadata = { title: 'Ajustes – Panel admin' };

/* ============================================================
   /admin/ajustes — portada de Ajustes
   ------------------------------------------------------------
   Las entradas que antes colgaban sueltas del menú lateral viven
   aquí, agrupadas por tema, porque nueve pestañas en una fila no
   son una elección: son una lista mal dibujada.

   Cada fila enseña su ESTADO a la derecha. Es la diferencia entre
   un índice y un tablero: se ve qué falta —la PC sin responder, el
   plan que se tiene— sin entrar a mirar una por una.

   Cambios de esta pasada:
   · El título ya no se repite. La barra de arriba dice "Ajustes";
     escribirlo otra vez a diez píxeles no ayudaba a nadie.
   · "Horarios y preferencias" era una pantalla con cinco acordeones
     que mezclaba horario, mapa de entrega, idiomas, moneda y el
     semáforo de cocina. Ahora son tres filas que llevan a tres
     pantallas que hacen una cosa cada una.
   · "Menú en inglés" es un interruptor y se queda como interruptor
     EN la lista. Una pantalla entera para un switch es un viaje de
     ida y vuelta por nada.
   · En el teléfono la descripción de cada fila se calla: diez filas
     de tres renglones son 1.166 px de scroll para una lista que
     cabe en una pantalla. El nombre ya dice a dónde va.
   ============================================================ */

interface Row {
  href: string;
  icon: string;
  label: string;
  desc: string;
  /** Llave de permiso; sin ella la fila no se pinta. */
  key: string;
  value?: string;
  tone?: 'warn';
}

export default async function AdminAjustesPage() {
  const ctx = await getAdminContext();
  if (!ctx) redirect('/admin/login');
  const { profile } = ctx;

  const slug = (await headers()).get('x-tenant-slug');
  let restaurant: Restaurant | null = ctx.restaurant ?? null;
  if (slug) {
    const data = await getRestaurantBySlug(slug);
    if (data) restaurant = data.restaurant;
  }

  const restaurantId = restaurant?.id ?? profile.restaurant_id ?? null;
  const modules = restaurant?.modules as Record<string, boolean> | null;
  const ordersEnabled = modules?.orders === true;
  const allow = (key: string) => can(profile.role, profile.permissions, key);
  const showStaff = profile.role !== 'RESTAURANT_STAFF';

  // Estado de la PC del local: la fila lo dice sin tener que entrar.
  let pcValue = 'Sin configurar';
  let pcTone: 'warn' | undefined;
  if (ordersEnabled && restaurantId && allow('impresion')) {
    const db = createServiceClient();
    const { data: agent } = await db
      .from('print_agents')
      .select('last_seen_at, is_active')
      .eq('restaurant_id', restaurantId)
      .maybeSingle();
    const lastSeen = (agent?.last_seen_at as string | null) ?? null;
    if (lastSeen) {
      // eslint-disable-next-line react-hooks/purity
      const stale = Date.now() - new Date(lastSeen).getTime() > 10 * 60_000;
      const off = (agent?.is_active as boolean | null) === false;
      pcValue = off ? 'Apagada' : stale ? 'Sin responder' : 'Conectada';
      pcTone = stale && !off ? 'warn' : undefined;
    }
  }

  const activeModules = modules ? Object.values(modules).filter(Boolean).length : 0;
  const planLabel = restaurant?.plan_actual ? (PLANS[restaurant.plan_actual as PlanCode]?.name ?? restaurant.plan_actual) : undefined;

  const negocio: Row[] = [
    { href: '/admin/perfil', icon: 'user', label: 'Perfil del negocio', desc: 'Nombre, contacto y datos de tu cuenta', key: 'perfil' },
    { href: '/admin/ajustes/restaurante', icon: 'clock', label: 'Horarios', desc: 'A qué hora abrís cada día y la pausa de pedidos', key: 'ajustes' },
    ...(ordersEnabled
      ? [{ href: '/admin/ajustes/entrega', icon: 'mapPin', label: 'Zona de entrega', desc: 'Dónde estás y hasta dónde repartís a domicilio', key: 'ajustes' } as Row]
      : []),
    { href: '/admin/personalizacion', icon: 'sparkle', label: 'Personalizar el sitio', desc: 'Colores, tipografía y plantilla de tu menú', key: 'personalizar' },
    { href: '/admin/qr', icon: 'image', label: 'Código QR', desc: 'El código que ponés en las mesas y en el mostrador', key: 'qr' },
  ];

  const servicio: Row[] = [
    ...(ordersEnabled
      ? [{ href: '/admin/ajustes/pedidos', icon: 'wallet', label: 'Pedidos y cobro', desc: 'Propina, moneda, confirmación automática y semáforo de cocina', key: 'ajustes' } as Row]
      : []),
    ...(ordersEnabled
      ? [{ href: '/admin/mi-pc', icon: 'monitor', label: 'La PC del local', desc: 'Imprime comandas sola y te cubre si se cae el internet', key: 'impresion', value: pcValue, tone: pcTone } as Row]
      : []),
  ];

  const equipo: Row[] = showStaff
    ? [{ href: '/admin/personal', icon: 'users', label: 'Personal y permisos', desc: 'Quién entra al panel y qué puede ver cada quien', key: 'personal' }]
    : [];

  const cuenta: Row[] = [
    { href: '/admin/suscripcion', icon: 'wallet', label: 'Mi suscripción', desc: 'Tu plan, lo que incluye y cómo cambiarlo', key: 'suscripcion', value: planLabel },
    ...(showStaff
      ? [{ href: '/admin/modulos', icon: 'grid', label: 'Funciones', desc: 'Encendé y apagá lo que usa tu restaurante', key: 'modulos', value: activeModules ? `${activeModules} activas` : undefined } as Row]
      : []),
    { href: '/admin/respaldo', icon: 'download', label: 'Copia de tus datos', desc: 'Descargá todo lo tuyo cuando quieras', key: 'respaldo' },
    { href: '/admin/ayuda', icon: 'helpCircle', label: 'Ayuda y tutoriales', desc: 'Guías paso a paso de cada pantalla', key: 'ayuda' },
  ];

  type Group = { title: string; rows: Row[]; extra?: 'idiomas' };
  const groups: Group[] = ([
    { title: 'Tu restaurante', rows: negocio, extra: 'idiomas' },
    { title: 'Servicio', rows: servicio },
    { title: 'El equipo', rows: equipo },
    { title: 'Tu cuenta', rows: cuenta },
  ] as Group[])
    // 'personal' no es delegable: su llave es el rol, y ya se aplicó arriba.
    .map((g) => ({ ...g, rows: g.rows.filter((r) => r.key === 'personal' || allow(r.key)) }))
    .filter((g) => g.rows.length > 0);

  const canEditIdiomas = allow('ajustes') && !!restaurant;

  return (
    <div className="anim-fade-up flex max-w-[1040px] flex-col gap-6">
      <p className="max-w-[52ch] text-[14px] leading-snug" style={{ color: 'var(--u-text-3)' }}>
        Todo lo que se configura una vez y se olvida, ordenado por tema.
      </p>

      <div className="adm-settings-index grid items-start gap-6" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
        {groups.map((g) => (
          <Section key={g.title} title={g.title}>
            <List>
              {g.rows.map((r) => (
                <ListLink key={r.href} href={r.href}>
                  <span className="grid size-7 shrink-0 place-items-center rounded-adm-md" style={{ background: 'color-mix(in srgb, var(--u-text) 8%, transparent)', color: 'var(--u-text-2)' }}>
                    <Icon name={r.icon} size={16} />
                  </span>
                  <ListText title={r.label} desc={r.desc} />
                  {r.value && (
                    <span
                      className="shrink-0 text-[13px]"
                      style={{ color: r.tone === 'warn' ? 'var(--c-warn)' : 'var(--u-text-3)' }}
                    >
                      {r.value}
                    </span>
                  )}
                  <Icon name="chevronRight" size={15} style={{ color: 'var(--u-text-4)', flexShrink: 0 }} />
                </ListLink>
              ))}
              {/* Un interruptor no merece su propia pantalla. */}
              {g.extra === 'idiomas' && restaurant && canEditIdiomas && (
                <ListRow>
                  <span className="grid size-7 shrink-0 place-items-center rounded-adm-md" style={{ background: 'color-mix(in srgb, var(--u-text) 8%, transparent)', color: 'var(--u-text-2)' }}>
                    <Icon name="globe" size={16} />
                  </span>
                  <MenuLanguagesEditor restaurant={restaurant} />
                </ListRow>
              )}
            </List>
          </Section>
        ))}
      </div>
    </div>
  );
}
