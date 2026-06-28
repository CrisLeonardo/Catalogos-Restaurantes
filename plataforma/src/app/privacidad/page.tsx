import type { Metadata } from 'next';
import { LegalShell, LegalSection, LegalP, LegalList } from '@/components/legal-page';

export const metadata: Metadata = {
  title: 'Política de privacidad — Leogin',
  description: 'Cómo Leogin recopila, usa y protege los datos de restaurantes y comensales.',
  robots: { index: true, follow: true },
};

const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? 'crisleonardo100@gmail.com';
const UPDATED = '27 de junio de 2026';

export default function PrivacidadPage() {
  return (
    <LegalShell
      title="Política de privacidad"
      updated={UPDATED}
      intro="Tu confianza y la de tus comensales nos importa. Aquí explicamos, en lenguaje claro, qué datos tratamos, para qué y con quién se comparten."
    >
      <LegalSection n={1} title="Quién trata los datos">
        <LegalP>
          Leogin opera la Plataforma de menús y pedidos. Respecto a los datos de los comensales,
          el restaurante es el responsable del trato (decide qué pide y para qué los usa) y Leogin
          actúa como encargado que procesa esos datos por cuenta del restaurante para hacer funcionar
          el servicio.
        </LegalP>
      </LegalSection>

      <LegalSection n={2} title="Qué datos recopilamos">
        <LegalP>De los restaurantes (al registrarse y operar):</LegalP>
        <LegalList items={[
          'Nombre del restaurante, dirección de su menú, datos de contacto y de la cuenta.',
          'Información de operación: menú, pedidos, métricas y configuración.',
        ]} />
        <LegalP>De los comensales (al hacer un pedido):</LegalP>
        <LegalList items={[
          'Nombre y teléfono para identificar y coordinar el pedido.',
          'Dirección o ubicación, solo cuando el pedido es a domicilio.',
          'Detalle del pedido y notas que el comensal escriba.',
        ]} />
      </LegalSection>

      <LegalSection n={3} title="Para qué los usamos">
        <LegalList items={[
          'Procesar y dar seguimiento a los pedidos.',
          'Permitir que el restaurante atienda, contacte y, si aplica, entregue a domicilio.',
          'Programas de lealtad o cupones, cuando el restaurante los activa.',
          'Mejorar y mantener seguro el servicio.',
        ]} />
      </LegalSection>

      <LegalSection n={4} title="Con quién se comparten">
        <LegalP>
          Los datos del pedido se comparten con el restaurante al que se hace el pedido. Usamos
          proveedores de infraestructura (alojamiento y base de datos) que tratan los datos por
          nuestra cuenta bajo medidas de seguridad. No vendemos datos personales a terceros.
        </LegalP>
      </LegalSection>

      <LegalSection n={5} title="Almacenamiento en tu dispositivo">
        <LegalP>
          Para que tu experiencia sea fluida, guardamos en tu navegador (almacenamiento local) datos
          como tu carrito y, si lo deseas, tu nombre y teléfono para no pedírtelos de nuevo. Puedes
          borrarlos limpiando los datos del sitio en tu navegador.
        </LegalP>
      </LegalSection>

      <LegalSection n={6} title="Seguridad">
        <LegalP>
          Aplicamos medidas técnicas y organizativas razonables: cifrado en tránsito, aislamiento de
          datos entre restaurantes y control de acceso. Ningún sistema es 100 % infalible, pero
          trabajamos para protegerlos.
        </LegalP>
      </LegalSection>

      <LegalSection n={7} title="Conservación">
        <LegalP>
          Conservamos los datos mientras sean necesarios para prestar el servicio y cumplir
          obligaciones legales o contables. Al cerrar una cuenta, el restaurante puede solicitar la
          eliminación de los datos que no debamos conservar por ley.
        </LegalP>
      </LegalSection>

      <LegalSection n={8} title="Tus derechos">
        <LegalP>
          Puedes solicitar acceder, rectificar o eliminar tus datos personales, y oponerte a ciertos
          usos. Si eres comensal, dirige tu solicitud al restaurante donde hiciste el pedido; nosotros
          le daremos apoyo. También puedes escribirnos directamente.
        </LegalP>
      </LegalSection>

      <LegalSection n={9} title="Menores de edad">
        <LegalP>
          La Plataforma está dirigida a personas mayores de edad o que actúan con la supervisión de un
          adulto. No recopilamos datos de menores a sabiendas.
        </LegalP>
      </LegalSection>

      <LegalSection n={10} title="Cambios y contacto">
        <LegalP>
          Podemos actualizar esta política; publicaremos la versión vigente con su fecha. Para ejercer
          tus derechos o cualquier consulta de privacidad, escríbenos a{' '}
          <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: 'var(--brand-accent)' }}>{CONTACT_EMAIL}</a>.
        </LegalP>
      </LegalSection>
    </LegalShell>
  );
}
