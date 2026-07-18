import RestaurantForm from '@/components/super/restaurant-form';
import { PageHeader } from '@/components/super/ui';

export const metadata = { title: 'Nuevo restaurante — Super Admin' };

export default function NewRestaurantePage() {
  return (
    <div className="anim-fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <PageHeader
        backHref="/super/restaurantes"
        backLabel="Restaurantes"
        title="Nuevo restaurante"
        subtitle="Completa la información básica. A la derecha ves cómo se vería el sitio; podrás configurar el plan y el tema después."
      />

      {/* full-bleed para que el formulario y la vista previa quepan lado a lado */}
      <div className="bleed">
        <div className="bleed-inner">
          <RestaurantForm />
        </div>
      </div>
    </div>
  );
}
