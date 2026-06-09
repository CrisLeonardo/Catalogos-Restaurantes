import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Glass } from '@/components/glass';
import { getRestaurantFullById, getRestaurantUsers } from '@/lib/db/super-admin';
import RestaurantEditForm from '@/components/super/restaurant-edit-form';
import PlanEditor from '@/components/super/plan-editor';
import ThemeEditor from '@/components/super/theme-editor';
import RestaurantUsers from '@/components/super/restaurant-users';
import DeleteButton from '@/components/admin/delete-button';
import { deleteRestaurant } from '@/lib/actions/super-admin';

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
  const users = await getRestaurantUsers(id);

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
        <PlanEditor restaurant={row} />
      </section>

      {/* ── 3. Apariencia ──────────────────────────────────── */}
      <section>
        <SectionTitle>Apariencia</SectionTitle>
        {theme ? (
          <ThemeEditor restaurant={row} theme={theme} />
        ) : (
          <Glass variant="quiet" style={{ padding: 20 }}>
            <p className="t-mute" style={{ fontSize: 14 }}>
              Sin tema configurado. Guarda el restaurante para inicializar el
              tema.
            </p>
          </Glass>
        )}
      </section>

      {/* ── 4. Acceso (usuarios) ───────────────────────────── */}
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

      {/* ── 5. Zona peligrosa ──────────────────────────────── */}
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
