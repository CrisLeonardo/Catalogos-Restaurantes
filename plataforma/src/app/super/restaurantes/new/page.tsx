import Link from 'next/link';
import RestaurantForm from '@/components/super/restaurant-form';

export const metadata = { title: 'Nuevo restaurante — Super Admin' };

export default function NewRestaurantePage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div>
        <Link
          href="/super/restaurantes"
          style={{
            fontSize: 13,
            color: 'var(--u-text-3)',
            textDecoration: 'none',
            marginBottom: 12,
            display: 'inline-block',
          }}
        >
          ← Restaurantes
        </Link>
        <h1 className="t-display" style={{ fontSize: 24, marginTop: 4 }}>
          Nuevo restaurante
        </h1>
        <p className="t-mute" style={{ fontSize: 14, marginTop: 6 }}>
          Completa la información básica. Podrás configurar el plan y el tema
          después.
        </p>
      </div>

      <RestaurantForm />
    </div>
  );
}
