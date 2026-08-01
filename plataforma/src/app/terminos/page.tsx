import type { Metadata } from 'next';
import { LegalShell, LegalSection, LegalP, LegalList } from '@/components/legal-page';

export const metadata: Metadata = {
  title: 'Términos del servicio — Leogin',
  description: 'Términos y condiciones de uso de la plataforma Leogin para restaurantes.',
  robots: { index: true, follow: true },
};

const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? 'crisleonardo100@gmail.com';
const UPDATED = '27 de junio de 2026';

export default function TerminosPage() {
  return (
    <LegalShell
      title="Términos del servicio"
      updated={UPDATED}
      intro="Estos términos rigen el uso de Leogin (la “Plataforma”), un servicio de menús digitales y pedidos en línea para restaurantes. Al crear una cuenta o usar la Plataforma, aceptas estos términos."
    >
      <LegalSection n={1} title="Qué es Leogin">
        <LegalP>
          Leogin es una herramienta tecnológica que permite a un restaurante (el “Cliente”)
          publicar su menú digital, recibir pedidos en línea, administrar su operación y
          personalizar la experiencia de sus comensales. Leogin provee el software; no prepara,
          vende ni entrega alimentos.
        </LegalP>
      </LegalSection>

      <LegalSection n={2} title="Cuentas y registro">
        <LegalList items={[
          'Debes proporcionar información verídica y mantenerla actualizada.',
          'Eres responsable de la confidencialidad de tu contraseña y de toda actividad en tu cuenta.',
          'Debes ser mayor de edad y tener facultad para representar al restaurante que registras.',
        ]} />
      </LegalSection>

      <LegalSection n={3} title="Planes, prueba gratis y cobros">
        <LegalP>
          Ofrecemos distintos planes con una mensualidad fija. Cada cuenta nueva incluye un período
          de prueba gratuito de 30 días, sin necesidad de tarjeta. Concluida la prueba, aplica la
          mensualidad del plan elegido.
        </LegalP>
        <LegalList items={[
          'No cobramos comisión por pedido: lo que vende el restaurante es del restaurante.',
          'Los precios pueden actualizarse avisando con anticipación razonable.',
          'Puedes cambiar de plan o cancelar cuando quieras; la cancelación detiene cobros futuros.',
        ]} />
      </LegalSection>

      <LegalSection n={4} title="Pagos de los pedidos">
        <LegalP>
          Por el momento Leogin <strong>no procesa pagos en línea</strong>. El pago de cada pedido se
          acuerda directamente entre el comensal y el restaurante (por ejemplo, efectivo o tarjeta al
          recibir). La relación de compraventa de alimentos es exclusivamente entre el restaurante y el
          comensal; Leogin actúa solo como intermediario tecnológico que transmite la información del
          pedido.
        </LegalP>
      </LegalSection>

      <LegalSection n={5} title="Contenido del restaurante">
        <LegalP>
          El restaurante es el único responsable de su menú, precios, fotografías, descripciones,
          disponibilidad, horarios e información fiscal. Garantiza que tiene derecho a usar el contenido
          que publica y que cumple con la normativa sanitaria y comercial aplicable.
        </LegalP>
      </LegalSection>

      <LegalSection n={6} title="Uso aceptable">
        <LegalList items={[
          'No usar la Plataforma para fines ilícitos, fraudulentos o engañosos.',
          'No intentar vulnerar la seguridad, ni acceder a datos de otros restaurantes o comensales.',
          'No sobrecargar el servicio ni interferir con su funcionamiento.',
        ]} />
      </LegalSection>

      <LegalSection n={7} title="Disponibilidad del servicio">
        <LegalP>
          Trabajamos para mantener la Plataforma disponible y segura, pero el servicio se presta “tal
          cual” y puede tener interrupciones por mantenimiento, fallas de terceros o causas de fuerza
          mayor. No garantizamos disponibilidad ininterrumpida.
        </LegalP>
      </LegalSection>

      <LegalSection n={8} title="Propiedad intelectual">
        <LegalP>
          El software, la marca Leogin y sus componentes son propiedad de Leogin. El contenido que
          sube cada restaurante sigue siendo de su propiedad; nos otorga una licencia limitada para
          alojarlo y mostrarlo con el fin de prestar el servicio.
        </LegalP>
      </LegalSection>

      <LegalSection n={9} title="Suspensión y terminación">
        <LegalP>
          Podemos suspender o terminar una cuenta que incumpla estos términos o que represente un riesgo
          para la Plataforma o terceros. El restaurante puede exportar sus datos de pedidos antes de
          cancelar.
        </LegalP>
      </LegalSection>

      <LegalSection n={10} title="Limitación de responsabilidad">
        <LegalP>
          Leogin no es responsable por la calidad, inocuidad o entrega de los alimentos, ni por
          disputas entre el restaurante y sus comensales. En la medida permitida por la ley, nuestra
          responsabilidad se limita al monto pagado por el servicio en los últimos tres meses.
        </LegalP>
      </LegalSection>

      <LegalSection n={11} title="Cambios a estos términos">
        <LegalP>
          Podemos actualizar estos términos. Si el cambio es relevante, lo avisaremos por un medio
          razonable. El uso continuado de la Plataforma implica la aceptación de la versión vigente.
        </LegalP>
      </LegalSection>

      <LegalSection n={12} title="Ley aplicable y contacto">
        <LegalP>
          Estos términos se rigen por las leyes de la República de Guatemala. Para cualquier consulta,
          escríbenos a <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: 'var(--brand-accent-ink)' }}>{CONTACT_EMAIL}</a>.
        </LegalP>
      </LegalSection>
    </LegalShell>
  );
}
