import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Glass } from '@/components/glass';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/icons';
import { PageHeader } from '@/components/super/ui';
import { subdomainUrl } from '@/lib/tenant';
import { getRestaurantFullById, getRestaurantUsers } from '@/lib/db/super-admin';
import RestaurantEditForm from '@/components/super/restaurant-edit-form';
import PlanEditor from '@/components/super/plan-editor';
import OrderTypesEditor from '@/components/super/order-types-editor';
import ThemeEditor from '@/components/super/theme-editor';
import RestaurantUsers from '@/components/super/restaurant-users';
import BillingManager from '@/components/super/billing-manager';
import RestaurantLocationEditor from '@/components/admin/restaurant-location-editor';
import DeleteButton from '@/components/admin/delete-button';
import { getBillingConfig, getInvoices, getPricingSettings, getEffectivePlanPricing, computeSuggestedFee, planLabel, getFeeBreakdown } from '@/lib/db/billing';
import {
  deleteRestaurant,
  duplicateRestaurant,
  listThemeTemplates,
} from '@/lib/actions/super-admin';
import { resolveTheme, type ThemeRow } from '@/lib/theme/resolve';
import type { Restaurant } from '@/types';

// El editor del Super Admin debe leer SIEMPRE el estado fresco de la BD
// (no caché de route): tras guardar el tema, debe reflejar lo guardado.
export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const row = await getRestaurantFullById(id);
  return { title: `${row?.name ?? 'Restaurante'} — Super Admin` };
}

export default async function EditRestaurantePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; new?: string }>;
}) {
  const { id } = await params;
  const { saved, new: isNew } = await searchParams;

  const row = await getRestaurantFullById(id);
  if (!row) notFound();

  const theme = row.restaurant_themes[0] ?? null;
  const [users, templates, billingConfig, invoices, suggestedFee, pricing, planPricing, feeBreakdown] = await Promise.all([
    getRestaurantUsers(id),
    listThemeTemplates(),
    getBillingConfig(id),
    getInvoices(id),
    computeSuggestedFee(id),
    getPricingSettings(),
    getEffectivePlanPricing(),
    getFeeBreakdown(id),
  ]);
  const resolved = resolveTheme(theme as ThemeRow | null, row.slug, {
    brandName: row.name,
    tagline: row.tagline,
  });

  return (
    <div className="anim-fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>

      {/* Header */}
      <PageHeader
        backHref="/super/restaurantes"
        backLabel="Restaurantes"
        title={row.name}
        subtitle={
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            {theme && (
              <span aria-hidden style={{ width: 10, height: 10, borderRadius: '50%', background: theme.color_primary, flexShrink: 0 }} />
            )}
            <span style={{ fontFamily: 'var(--ui-font-mono)' }}>{row.slug}</span>
          </span>
        }
        actions={
          <>
            <Button variant="secondary" size="sm" render={<a href={subdomainUrl(row.slug)} target="_blank" rel="noopener noreferrer" />}>
              <Icon name="eye" size={14} /> Ver menú
            </Button>
            <Button variant="secondary" size="sm" render={<Link href={`/super/metricas/${row.id}`} />}>
              <Icon name="chart" size={14} /> Métricas
            </Button>
          </>
        }
      />

      {/* Banner de éxito */}
      {(saved || isNew) && (
        <div
          style={{
            padding: '12px 16px',
            borderRadius: 'var(--radius-md)',
            background: 'rgba(34,197,94,0.10)',
            border: '1px solid rgba(34,197,94,0.25)',
            color: '#4ade80',
            fontSize: 14,
            fontWeight: 500,
          }}
        >
          {isNew
            ? 'Restaurante creado. Configura el plan, el tema y crea el acceso del dueño.'
            : saved === 'info'
            ? 'Información guardada.'
            : saved === 'plan'
            ? 'Plan y módulos guardados.'
            : saved === 'tema'
            ? 'Apariencia guardada.'
            : saved === 'user'
            ? 'Acceso creado. Entrega las credenciales al restaurante.'
            : saved === 'pass'
            ? 'Contraseña actualizada.'
            : saved === 'location'
            ? 'Ubicación y radio guardados.'
            : 'Cambios guardados.'}
        </div>
      )}

      {/* ── 1. Información ─────────────────────────────────── */}
      <section>
        <SectionTitle>Información</SectionTitle>
        {/* key={row.id}: fuerza re-montaje al cambiar de sucursal por navegación
            cliente; sin él, el estado/inputs conservaban los datos de la
            sucursal anterior y se guardaban en la equivocada. */}
        <RestaurantEditForm key={row.id} restaurant={row} />
      </section>

      {/* ── 2. Plan y módulos ──────────────────────────────── */}
      <section>
        <SectionTitle>Plan y módulos</SectionTitle>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <PlanEditor key={row.id} restaurant={row} pricing={planPricing} />
          {resolved.config.orderTypes && (
            <OrderTypesEditor
              key={row.id}
              restaurantId={row.id}
              initialOrderTypes={resolved.config.orderTypes}
            />
          )}
        </div>
      </section>

      {/* ── 2.5. Desglose de mensualidad (plan fijo, sin GMV) ── */}
      {feeBreakdown && (
        <section>
          <SectionTitle>Desglose de mensualidad</SectionTitle>
          {(() => {
            const fmtQ = (n: number) => 'Q' + n.toLocaleString('es-GT', { maximumFractionDigits: 0 });
            const b = feeBreakdown;
            return (
              <Glass variant="quiet" style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <Row label="Precio base del plan" value={fmtQ(b.base)} />
                {b.discountApplies && (
                  <Row
                    label={`Descuento "plan a tu medida" (${b.channelsOff} canal${b.channelsOff === 1 ? '' : 'es'} desactivado${b.channelsOff === 1 ? '' : 's'})`}
                    value={b.discount > 0 ? `− ${fmtQ(b.discount)}` : 'Q0'}
                    color={b.discount > 0 ? '#4ade80' : undefined}
                  />
                )}
                {b.branchDiscountPct > 0 && (
                  <Row label={`Descuento por volumen de sucursales (${Math.round(b.branchDiscountPct * 100)}%)`} value="aplicado sobre el neto del plan" color="#4ade80" />
                )}
                {b.addonTotal > 0 && (
                  <Row label="Módulos a la carta (no incluidos en el plan)" value={`+ ${fmtQ(b.addonTotal)}`} />
                )}
                <div style={{ height: 1, background: 'var(--u-hair)', margin: '4px 0' }} />
                <Row label="Mensualidad calculada" value={fmtQ(b.final)} bold />
                <p style={{ fontSize: 12, color: 'var(--u-text-4)', margin: '4px 0 0', lineHeight: 1.5 }}>
                  Este es el precio automático según plan + módulos activos. Si «Cobro automático» está apagado abajo,
                  el monto real facturado puede diferir (override manual).
                </p>
              </Glass>
            );
          })()}
        </section>
      )}

      {/* ── 3. Ubicación y radio de entrega ───────────────── */}
      <section>
        <SectionTitle>Ubicación y radio de entrega</SectionTitle>
        <p
          style={{
            fontSize: 13,
            color: 'var(--u-text-4)',
            marginTop: -8,
            marginBottom: 14,
          }}
        >
          Coloca el pin en el mapa y define hasta cuántos km llega el reparto.
          Las coordenadas alimentan el selector automático de sucursal del grupo.
        </p>
        <RestaurantLocationEditor key={row.id} restaurant={row as unknown as Restaurant} />
      </section>

      {/* ── 4. Apariencia ──────────────────────────────────── */}
      {/* full-bleed: rompe el max-width de 800px del layout para que el
          editor y la vista previa en vivo quepan lado a lado. */}
      <section className="bleed">
        <div className="bleed-inner">
          <SectionTitle>Apariencia</SectionTitle>
          <ThemeEditor
            key={row.id}
            restaurantId={row.id}
            config={resolved.config}
            content={resolved.content}
            customCss={resolved.customCss}
            templates={templates}
          />
        </div>
      </section>

      {/* ── 5. Acceso (usuarios) ───────────────────────────── */}
      <section>
        <SectionTitle>Acceso del restaurante</SectionTitle>
        <p
          style={{
            fontSize: 13,
            color: 'var(--u-text-4)',
            marginTop: -8,
            marginBottom: 14,
          }}
        >
          Crea el usuario y contraseña con los que el dueño entrará a gestionar
          su menú. Tú controlas estos accesos.
        </p>
        <RestaurantUsers key={row.id} restaurantId={row.id} slug={row.slug} users={users} />
      </section>

      {/* ── 5. Facturación / Cobros ────────────────────────── */}
      <section>
        <SectionTitle>Facturación y cobros</SectionTitle>
        <p
          style={{
            fontSize: 13,
            color: 'var(--u-text-4)',
            marginTop: -8,
            marginBottom: 14,
          }}
        >
          Define cuánto paga este restaurante por la implementación y la
          mensualidad, genera sus cobros y registra cuándo te pagan. Lo verá en
          su panel en «Mi suscripción».{' '}
          <Link href={`/super/metricas/${row.id}`} style={{ color: 'var(--brand-accent)' }}>
            Ver métricas a fondo →
          </Link>
        </p>
        <BillingManager
          key={row.id}
          restaurantId={row.id}
          config={billingConfig}
          invoices={invoices}
          suggestedFee={suggestedFee}
          planName={planLabel(row.plan_actual)}
          globalGraceDays={pricing.graceDays}
        />
      </section>

      {/* ── 6. Duplicar ────────────────────────────────────── */}
      <section>
        <SectionTitle>Duplicar</SectionTitle>
        <Glass
          variant="quiet"
          style={{
            padding: 20,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
          }}
        >
          <div>
            <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--u-text)' }}>
              Duplicar restaurante
            </div>
            <div style={{ fontSize: 13, color: 'var(--u-text-4)', marginTop: 2 }}>
              Copia el tema, las categorías y los productos a un restaurante
              nuevo (queda suspendido hasta que lo actives). Ideal para
              arrancar un cliente con un diseño que ya te gustó.
            </div>
          </div>
          <form action={duplicateRestaurant}>
            <input type="hidden" name="id" value={row.id} />
            <button
              type="submit"
              className="press"
              style={{
                padding: '10px 18px',
                borderRadius: 'var(--radius-full)',
                fontWeight: 600,
                fontSize: 13,
                border: '1px solid var(--u-hair-2)',
                background: 'color-mix(in srgb, var(--u-text) 6%, transparent)',
                color: 'var(--u-text)',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              Duplicar
            </button>
          </form>
        </Glass>
      </section>

      {/* ── 7. Zona peligrosa ──────────────────────────────── */}
      <section>
        <SectionTitle>Zona peligrosa</SectionTitle>
        <Glass
          variant="quiet"
          style={{
            padding: 20,
            border: '1px solid rgba(239,68,68,0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
          }}
        >
          <div>
            <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--u-text)' }}>
              Eliminar restaurante
            </div>
            <div style={{ fontSize: 13, color: 'var(--u-text-4)', marginTop: 2 }}>
              Se borrará todo: menú, categorías, productos y tema. Irreversible.
            </div>
          </div>
          <DeleteButton
            action={deleteRestaurant}
            hiddenFields={{ id: row.id }}
            label="Eliminar"
            confirm={`¿Eliminar "${row.name}" y todos sus datos? Esta acción no se puede deshacer.`}
          />
        </Glass>
      </section>
    </div>
  );
}

function Row({ label, value, bold, color }: { label: string; value: string; bold?: boolean; color?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
      <span style={{ fontSize: 13, color: 'var(--u-text-3)' }}>{label}</span>
      <span style={{ fontSize: bold ? 17 : 13.5, fontWeight: bold ? 800 : 600, fontFamily: 'var(--ui-font-mono)', color: color ?? (bold ? 'var(--u-text)' : 'var(--u-text-2)') }}>
        {value}
      </span>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2
      style={{
        fontFamily: 'var(--font-display)',
        fontWeight: 700,
        fontSize: 18,
        marginBottom: 14,
        color: 'var(--u-text)',
      }}
    >
      {children}
    </h2>
  );
}
