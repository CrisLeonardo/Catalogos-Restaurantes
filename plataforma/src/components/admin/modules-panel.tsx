'use client';

/* ============================================================
   FUNCIONES (/admin/modulos)
   ------------------------------------------------------------
   Lo que había: la pantalla abría con "Tu mensualidad" en cifras
   grandes, seguida de un muro de tarjetas grises con lo que el
   plan NO incluye. El primer interruptor —a lo que se viene— caía
   por debajo del pliegue. Era una página de venta vestida de
   pantalla de ajustes.

   Cada módulo era además una TARJETA de 42 px de icono con
   título, punto de estado, descripción, nota de precio y pista:
   quince tarjetas apiladas en una columna en el teléfono. Y la
   nota de precio ("Apagarlo solo lo esconde del panel — tu
   mensualidad no cambia") estaba impresa quince veces, una por
   tarjeta, para decir siempre exactamente lo mismo.

   Lo que hay ahora: primero los interruptores, en listas
   agrupadas —el punto de estado sobra, el interruptor YA dice si
   está encendido—, la frase repetida una sola vez como nota al
   pie de su grupo, y el plan al FINAL, que es donde va la venta
   cuando el dueño entró a trabajar. No se quitó nada: la
   comparativa, el aviso de Básico/Estándar y "lo que agrega
   Premium" siguen aquí, abajo y en una sola lista en vez de en
   una rejilla de tarjetas apagadas.
   ============================================================ */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
/* `Link` es aqui `PanelLink`: traduce las rutas del panel al origen desde el
   que se sirve la pagina. Lo que no es del panel pasa de largo sin tocarse.
   Ver components/admin/panel-link.tsx. */
import Link from '@/components/admin/panel-link';
import { Icon } from '@/components/icons';
import { List, ListLink, ListRow, ListText } from '@/components/ui/list';
import { Section, SectionNote } from '@/components/ui/section';
import { Switch } from '@/components/ui/switch';
import { setModuleEnabled } from '@/lib/actions/modules';
import { updateOwnOrderTypes } from '@/lib/actions/restaurant';
import {
  ACTIVATABLE_MODULES,
  MODULE_GROUPS,
  isModuleActive,
  showsInPanel,
  moduleBadge,
  type ActivatableModuleKey,
  type ModuleMeta,
  type ModulesMap,
  type ModuleSettings,
} from '@/lib/modules';
import { ESTANDAR_MAX_ORDER_TYPES, INCLUDED_MODULES, PLANS, PUBLIC_PLANS, planPriceLabel, type PlanCode } from '@/lib/plans';
import { usePlanPricing } from '@/components/plan-pricing-context';
import type { OrderType } from '@/lib/theme/defaults';
import { usePathname as useRutaNavegador } from 'next/navigation';
import { panelBaseFrom, panelHref } from '@/lib/panel-links';

const q = (n: number) => 'Q' + Math.round(n).toLocaleString('es-GT');

/** ¿El plan incluye este módulo? (si no, solo está activo por excepción manual de Leogin). */
function includedInPlan(plan: string | null | undefined, key: ActivatableModuleKey): boolean {
  return INCLUDED_MODULES[(plan ?? 'BASICO') as PlanCode]?.includes(key) ?? false;
}

/** Cada modo de pedido es su propio canal independiente — comer en local,
   para llevar y a domicilio ya no se agrupan entre sí (antes "local" unía
   comer en local + para llevar en un solo toggle). */
const CHANNEL_META: { id: OrderType; label: string; description: string; icon: string; configHref?: string }[] = [
  {
    id: 'dine_in',
    label: 'Comer en el local',
    description: 'El cliente pide desde la mesa escaneando el QR. Requiere configurar el número de mesas.',
    icon: 'utensils',
    configHref: '/admin/mesas',
  },
  {
    id: 'pickup',
    label: 'Para llevar',
    description: 'El cliente hace su pedido en línea y lo retira en el mostrador de tu local.',
    icon: 'bag',
    configHref: '/admin/personalizacion',
  },
  {
    id: 'delivery',
    label: 'A domicilio',
    description: 'El cliente ingresa su dirección y el pedido se entrega donde está. Puedes definir zonas y costo de envío.',
    icon: 'truck',
    configHref: '/admin/personalizacion',
  },
];

interface Props {
  restaurantId: string;
  modules: ModulesMap;
  settings: ModuleSettings;
  orderTypes: OrderType[];
  /** Datos de contacto del soporte para "solicitar activación". */
  supportWhatsapp?: string;
  /** Plan actual — determina qué tipos de pedido están disponibles. */
  planActual?: string | null;
  /** Mensualidad que se está facturando (precio fijo del plan). */
  billedNow?: number | null;
}

const BADGE_COLOR: Record<string, string> = { POPULAR: 'chip-warn', NUEVO: 'chip-alt' };

function Badge({ label }: { label: string }) {
  return (
    <span className={`chip ${BADGE_COLOR[label] ?? 'chip-neutral'}`} style={{ fontSize: 11, padding: '1px 7px' }}>
      {label}
    </span>
  );
}

/** El cuadradito del icono. 28 px y no 42: es una fila de una lista, no una
 *  tarjeta de catálogo. */
function RowIcon({ name, on }: { name: string; on?: boolean }) {
  return (
    <span
      className="grid size-7 shrink-0 place-items-center rounded-adm-md"
      style={{
        background: on
          ? 'color-mix(in srgb, var(--brand-accent) 14%, transparent)'
          : 'color-mix(in srgb, var(--u-text) 8%, transparent)',
        color: on ? 'var(--brand-accent-ink)' : 'var(--u-text-2)',
      }}
    >
      <Icon name={name} size={16} />
    </span>
  );
}

/** Título de fila con su chip opcional. */
function RowTitle({ label, badge, extra }: { label: string; badge?: string; extra?: string }) {
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {label}
      {badge && <Badge label={badge} />}
      {extra && <span className="chip chip-ok" style={{ fontSize: 11, padding: '1px 7px' }}>{extra}</span>}
    </span>
  );
}

/** Candado: la fila se ve y se lee, atenuada, y dice qué plan la trae. */
function LockedRow({ icon, label, description, lockLabel }: {
  icon: string; label: string; description: string; lockLabel: string;
}) {
  return (
    <ListRow style={{ opacity: 0.62 }}>
      <RowIcon name={icon} />
      <ListText title={label} desc={description} />
      <span className="flex shrink-0 items-center gap-1.5 text-[12px]" style={{ color: 'var(--u-text-4)' }}>
        <Icon name="key" size={12} /> {lockLabel}
      </span>
    </ListRow>
  );
}

export default function ModulesPanel({ restaurantId, modules, settings, orderTypes, supportWhatsapp, planActual, billedNow = null }: Props) {
  /* Prefijo del origen unico ('' en el subdominio de hoy). Ver lib/panel-links.ts. */
  const base = panelBaseFrom(useRutaNavegador());
  const router = useRouter();
  const pricing = usePlanPricing();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  // Estado local para modos de pedido (optimistic).
  const [localOrderTypes, setLocalOrderTypes] = useState<OrderType[]>(orderTypes);
  const [orderBusy, setOrderBusy] = useState<OrderType | null>(null);
  const [localSettings, setLocalSettings] = useState<ModuleSettings>(settings);

  // Estándar: el dueño elige libremente sus modos de pedido, con tope de
  // ESTANDAR_MAX_ORDER_TYPES (2 de 3) — el 3ero requiere subir a Premium.
  const isEstandar = planActual === 'ESTANDAR';
  const isBasico = planActual === 'BASICO';

  function toggle(key: ActivatableModuleKey, next: boolean) {
    setError(null);
    setBusyKey(key);
    // Optimista: el interruptor cambia al instante; si el servidor rechaza, se revierte.
    const prev = localSettings;
    setLocalSettings({ ...localSettings, [key]: { ...(localSettings[key] ?? {}), enabled: next } });
    startTransition(async () => {
      const res = await setModuleEnabled(restaurantId, key, next);
      setBusyKey(null);
      if (res.error) { setLocalSettings(prev); setError(res.error); return; }
      router.refresh();
    });
  }

  function toggleType(m: typeof CHANNEL_META[number]) {
    const isOn = localOrderTypes.includes(m.id);

    if (!isOn && isEstandar && localOrderTypes.length >= ESTANDAR_MAX_ORDER_TYPES) {
      setError(`Tu plan Estándar permite hasta ${ESTANDAR_MAX_ORDER_TYPES} modos de pedido activos. Desactiva otro primero, o actualiza a Premium para tener los 3.`);
      return;
    }

    const next = isOn
      ? localOrderTypes.filter((t) => t !== m.id)
      : [...localOrderTypes, m.id];

    if (next.length === 0) {
      setError('Debe haber al menos un modo de pedido activo.');
      return;
    }
    setError(null);
    setLocalOrderTypes(next);
    setOrderBusy(m.id);
    startTransition(async () => {
      const res = await updateOwnOrderTypes(restaurantId, next);
      setOrderBusy(null);
      if (res.error) {
        setLocalOrderTypes(localOrderTypes); // revert
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  const supportHref = supportWhatsapp
    ? `https://wa.me/${supportWhatsapp.replace(/[^\d]/g, '')}?text=${encodeURIComponent('Hola, quiero activar la Factura Electrónica (FEL) en mi restaurante.')}`
    : '/admin/ayuda';

  // Módulos visibles en el panel (oculta los gestionados que no requieren setup).
  const visible = ACTIVATABLE_MODULES.filter((m) => showsInPanel(modules, m.key));
  const activeCount = ACTIVATABLE_MODULES.filter((m) => isModuleActive(modules, localSettings, m.key)).length;

  const currentPlan = (planActual ?? 'BASICO') as PlanCode;
  const planFeatures = PLANS[currentPlan];
  const premiumLabel = planPriceLabel(pricing, 'PREMIUM');
  const amount = billedNow ?? pricing.prices[currentPlan] ?? 0;

  // Lo que el plan actual todavía no trae. Solo se anuncian módulos que algún
  // plan A LA VENTA realmente incluye — "proveedores" y "fel" son exclusivos
  // de Pro, que está pausado (ver nota "PAUSADO" en plans.ts) y no se puede
  // contratar; sin este filtro un dueño en Premium veía dos filas anunciadas
  // como "Incluido en Premium" que ni Premium trae ni Pro puede vender.
  const missingModules = ACTIVATABLE_MODULES.filter(
    (m) =>
      !INCLUDED_MODULES[currentPlan]?.includes(m.key) &&
      !isModuleActive(modules, localSettings, m.key) &&
      PUBLIC_PLANS.some((p) => INCLUDED_MODULES[p]?.includes(m.key)),
  );
  const missingWaiter = !planFeatures.hasWaiterPanel;
  const missingAnalytics = !planFeatures.hasAnalytics;
  const hasGaps = missingWaiter || missingAnalytics || missingModules.length > 0;

  /** La fila de un módulo self-service. */
  function moduleRow(m: ModuleMeta) {
    const on = localSettings[m.key]?.enabled !== false; // defaults ON para módulos habilitados
    const busy = busyKey === m.key && isPending;
    const byException = !includedInPlan(planActual, m.key);
    return (
      <ListRow key={m.key}>
        <RowIcon name={m.icon} on={on} />
        <ListText
          /* «Activado para tu restaurante» iba en verde metido en medio de
             la descripción; ahora es una etiqueta junto al nombre
             (auditoría 2026-10-02, AJU-14). */
          title={<RowTitle label={m.label} badge={moduleBadge(m)} extra={byException ? 'Activado para ti' : undefined} />}
          desc={
            <>
              {m.description}
              {m.hint && <> {m.hint}</>}
              {on && m.href && (
                <>
                  {' '}
                  <Link href={m.href} className="tap44 font-semibold no-underline" style={{ color: 'var(--brand-accent-ink)' }}>
                    Abrir {m.navLabel ?? m.label} →
                  </Link>
                </>
              )}
            </>
          }
        />
        <Switch
          checked={on}
          onCheckedChange={(next) => toggle(m.key, next)}
          disabled={busy}
          aria-label={`${on ? 'Desactivar' : 'Activar'} ${m.label}`}
        />
      </ListRow>
    );
  }

  /** La fila de un módulo que activa Leogin (FEL). */
  function managedRow(m: ModuleMeta) {
    const active = isModuleActive(modules, localSettings, m.key);
    return (
      <ListRow key={m.key}>
        <RowIcon name={m.icon} on={active} />
        <ListText
          title={<RowTitle label={m.label} badge={moduleBadge(m)} />}
          desc={
            <>
              {m.description}{' '}
              {active && m.href ? (
                <Link href={m.href} className="tap44 font-semibold no-underline" style={{ color: 'var(--brand-accent-ink)' }}>
                  Abrir {m.navLabel ?? m.label} →
                </Link>
              ) : (
                <a
                  href={supportHref}
                  target={supportHref.startsWith('http') ? '_blank' : undefined}
                  rel="noopener noreferrer"
                  className="font-semibold no-underline"
                  style={{ color: 'var(--brand-accent-ink)' }}
                >
                  Solicitar activación →
                </a>
              )}
            </>
          }
        />
        <span className={`chip shrink-0 ${active ? 'chip-ok' : 'chip-neutral'}`}>
          {active ? 'Activo' : 'Lo activa Leogin'}
        </span>
      </ListRow>
    );
  }

  return (
    <div className="adm-w-read flex flex-col gap-6">
      <p className="text-[14px] leading-snug" style={{ color: 'var(--u-text-3)' }}>
        Enciende solo lo que usa tu restaurante. Lo que apagues desaparece de tu
        panel y puedes volver a encenderlo cuando quieras.
      </p>

      {error && <div className="note note-danger">{error}</div>}

      {/* ── Modos de pedido ──────────────────────────────────── */}
      <Section title="Modos de pedido">
        <List>
          {CHANNEL_META.map((m) => {
            const on = localOrderTypes.includes(m.id);
            const activeTypes = localOrderTypes.length;
            // BASICO: solo "para llevar" (sin pedidos reales todavía).
            // ESTANDAR: cualquier modo, hasta el tope de 2 — el que falta pide Premium.
            const locked = isBasico
              ? m.id !== 'pickup'
              : isEstandar
                ? (!on && activeTypes >= ESTANDAR_MAX_ORDER_TYPES)
                : false;
            const busy = orderBusy === m.id && isPending;
            const isLast = activeTypes === 1 && on;

            if (locked) {
              return (
                <LockedRow
                  key={m.id}
                  icon={m.icon}
                  label={m.label}
                  description={m.description}
                  lockLabel={isBasico ? 'Requiere Estándar' : 'Requiere Premium'}
                />
              );
            }

            return (
              <ListRow key={m.id}>
                <RowIcon name={m.icon} on={on} />
                <ListText
                  title={m.label}
                  desc={
                    <>
                      {m.description}
                      {isLast && <> Es tu único modo activo: no se puede apagar.</>}
                      {on && m.configHref && (
                        <>
                          {' '}
                          <Link href={m.configHref} className="tap44 font-semibold no-underline" style={{ color: 'var(--brand-accent-ink)' }}>
                            Configurar →
                          </Link>
                        </>
                      )}
                    </>
                  }
                />
                <Switch
                  checked={on}
                  onCheckedChange={() => toggleType(m)}
                  disabled={busy || isLast}
                  aria-label={`${on ? 'Desactivar' : 'Activar'} ${m.label}`}
                />
              </ListRow>
            );
          })}
        </List>
        <SectionNote>
          Al menos uno tiene que estar activo.
          {isBasico && <> El plan Básico es solo menú digital: los pedidos en línea empiezan en Estándar ({planPriceLabel(pricing, 'ESTANDAR')}).</>}
          {isEstandar && <> Tu plan Estándar incluye {ESTANDAR_MAX_ORDER_TYPES} de los 3 modos y tú eliges cuáles; para tener los tres a la vez, Premium ({premiumLabel}).</>}
        </SectionNote>
      </Section>

      {/* ── Módulos, por grupo ───────────────────────────────── */}
      {MODULE_GROUPS.map((g) => {
        const mods = visible.filter((m) => m.group === g.id);
        if (mods.length === 0) return null;
        return (
          <Section key={g.id} title={g.label}>
            <List>
              {mods.map((m) => (m.requiresSetup ? managedRow(m) : moduleRow(m)))}
            </List>
            <SectionNote>{g.description}</SectionNote>
          </Section>
        );
      })}

      {/* ── El plan, al final ────────────────────────────────
          Aquí es donde va la venta: quien entró a esta pantalla venía a
          encender algo, no a que le cobraran. La frase que antes se repetía
          en cada una de las quince tarjetas se dice UNA vez, aquí. */}
      <Section title="Tu plan">
        <List>
          <ListLink href={panelHref(base, "/admin/suscripcion")}>
            <RowIcon name="wallet" on />
            <ListText
              title={`Plan ${PLANS[currentPlan].name}`}
              desc={activeCount === 1 ? '1 función activa' : `${activeCount} funciones activas`}
            />
            <span className="t-mono shrink-0 text-[13px]" style={{ color: 'var(--u-text-2)' }}>
              {q(amount)}/mes
            </span>
            <Icon name="chevronRight" size={15} style={{ color: 'var(--u-text-4)', flexShrink: 0 }} />
          </ListLink>
        </List>
        <SectionNote>
          Precio fijo: prender o apagar lo de esta pantalla nunca cambia tu
          mensualidad.
        </SectionNote>
      </Section>

      {hasGaps && (
        <Section title={`Lo que agrega Premium (${premiumLabel})`}>
          <List>
            {missingWaiter && (
              <LockedRow
                icon="userPlus"
                label="Panel de mesero y mapa de mesas"
                description="Tu equipo toma pedidos desde una tablet en cada mesa y ves el mapa del salón en vivo."
                lockLabel="Premium"
              />
            )}
            {missingAnalytics && (
              <LockedRow
                icon="chart"
                label="Analítica, inventario y personal"
                description="Estadísticas avanzadas, control de inventario y costos, y personal con roles."
                lockLabel="Premium"
              />
            )}
            {missingModules.map((m) => (
              <LockedRow
                key={m.key}
                icon={m.icon}
                label={m.label}
                description={m.description}
                lockLabel="Premium"
              />
            ))}
          </List>
          <SectionNote>
            Esto es lo que tu plan {PLANS[currentPlan].name} todavía no incluye.{' '}
            <Link href={panelHref(base, "/admin/suscripcion")} className="tap44 font-semibold no-underline" style={{ color: 'var(--brand-accent-ink)' }}>
              Ver la comparativa →
            </Link>
          </SectionNote>
        </Section>
      )}

      <p className="px-4 text-[12.5px] leading-snug" style={{ color: 'var(--u-text-3)' }}>
        ¿Tienes varias sucursales? Se unen en un panel de grupo con métricas
        consolidadas.{' '}
        <Link href={panelHref(base, "/admin/ayuda")} className="tap44 font-semibold no-underline" style={{ color: 'var(--brand-accent-ink)' }}>
          Hablar con Leogin →
        </Link>
      </p>
    </div>
  );
}
