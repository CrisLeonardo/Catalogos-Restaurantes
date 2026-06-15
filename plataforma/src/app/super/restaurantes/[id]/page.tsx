import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Glass } from '@/components/glass';
import { getRestaurantFullById, getRestaurantUsers } from '@/lib/db/super-admin';
import RestaurantEditForm from '@/components/super/restaurant-edit-form';
import PlanEditor from '@/components/super/plan-editor';
import OrderTypesEditor from '@/components/super/order-types-editor';
import ThemeEditor from '@/components/super/theme-editor';
import RestaurantUsers from '@/components/super/restaurant-users';
import BillingManager from '@/components/super/billing-manager';
import RestaurantLocationEditor from '@/components/admin/restaurant-location-editor';
import DeleteButton from '@/components/admin/delete-button';
import { getBillingConfig, getInvoices } from '@/lib/db/billing';
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
  const [users, templates, billingConfig, invoices] = await Promise.all([
    getRestaurantUsers(id),
    listThemeTemplates(),
    getBillingConfig(id),
    getInvoices(id),
  ]);
  const resolved = resolveTheme(theme as ThemeRow | null, row.slug, {
    brandName: row.name,
    tagline: row.tagline,
  });

  return (
    <div className="anim-fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>

      {/* Header */}
      <div>
        <Link
          href="/super/restaurantes"
          style={{
            fontSize: 13,
            color: 'var(--u-text-3)',
            textDecoration: 'none',
            marginBottom: 10,
            display: 'inline-block',
          }}
        >
          ← Restaurantes
        </Link>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            marginTop: 4,
          }}
        >
          {theme && (
            <div
              style={{
                width: 12,
                height: 12,
                borderRadius: '50%',
                background: theme.color_primary,
                flexShrink: 0,
              }}
            />
          )}
          <h1 className="t-display" style={{ fontSize: 24 }}>
            {row.name}
          </h1>
          <span
            style={{
              fontSize: 12,
              color: 'var(--u-text-4)',
              fontFamily: 'monospace',
            }}
          >
            {row.slug}
          </span>
        </div>
      </div>

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
        <RestaurantEditForm restaurant={row} />
      </section>

      {/* ── 2. Plan y módulos ──────────────────────────────── */}
      <section>
        <SectionTitle>Plan y módulos</SectionTitle>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <PlanEditor restaurant={row} />
          {resolved.config.orderTypes && (
            <OrderTypesEditor
              restaurantId={row.id}
              initialOrderTypes={resolved.config.orderTypes}
            />
          )}
        </div>
      </section>

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
        <RestaurantLocationEditor restaurant={row as unknown as Restaurant} />
      </section>

      {/* ── 4. Apariencia ──────────────────────────────────── */}
      {/* full-bleed: rompe el max-width de 800px del layout para que el
          editor y la vista previa en vivo quepan lado a lado. */}
      <section className="bleed">
        <div className="bleed-inner">
          <SectionTitle>Apariencia</SectionTitle>
          <ThemeEditor
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
        <RestaurantUsers restaurantId={row.id} slug={row.slug} users={users} />
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
        <BillingManager restaurantId={row.id} config={billingConfig} invoices={invoices} />
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
                background: 'rgba(255,255,255,0.06)',
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
