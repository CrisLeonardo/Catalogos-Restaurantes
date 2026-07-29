/* ============================================================
   ESQUELETO DE CARGA DEL PANEL
   ------------------------------------------------------------
   Se dibuja mientras el servidor arma la página siguiente.

   Antes no existía ningún loading.tsx en toda la app: al tocar
   "Finanzas" desde "Pedidos" la pantalla se quedaba EXACTAMENTE
   igual — mismo contenido, sin spinner, sin nada — hasta que el
   servidor terminaba. En pantallas pesadas eso son varios
   segundos de aparente "no pasó nada", y la reacción natural de
   alguien poco acostumbrado a la computadora es volver a tocar,
   lo que dispara otra petición y lo hace todavía más lento.

   Además de la respuesta inmediata, tener un límite de carga es
   lo que permite que el prefetch de <Link> sirva de algo en
   rutas dinámicas: sin él, Next no tiene una cáscara que
   precargar.

   No lleva 'use client': es puro marcado, se envía ya renderizado.
   ============================================================ */

function Line({ w = '100%', h = 14, r = 7 }: { w?: string | number; h?: number; r?: number }) {
  return (
    <span
      className="adm-skeleton"
      style={{ display: 'block', width: w, height: h, borderRadius: r }}
    />
  );
}

function CardBlock({ lines = 3 }: { lines?: number }) {
  return (
    <div
      style={{
        border: '1px solid var(--u-hair)',
        borderRadius: 'var(--radius-lg, 16px)',
        padding: 18,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        background: 'var(--admin-content-bg, transparent)',
      }}
    >
      <Line w="45%" h={11} />
      {Array.from({ length: lines }).map((_, i) => (
        <Line key={i} w={i === lines - 1 ? '70%' : '100%'} />
      ))}
    </div>
  );
}

/**
 * `label` sale en el aviso para lectores de pantalla; conviene que diga a
 * dónde se está yendo ("Cargando Finanzas") y no un genérico.
 */
export default function PageSkeleton({
  label = 'la sección',
  cards = 3,
}: {
  label?: string;
  cards?: number;
}) {
  return (
    <div className="anim-fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* Aviso para lectores de pantalla: sin esto el cambio de página es mudo. */}
      <p role="status" aria-live="polite" className="sr-only">
        Cargando {label}, espera un momento.
      </p>

      {/* Título de la pantalla */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        <Line w={190} h={22} />
        <Line w={280} h={12} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
        {Array.from({ length: cards }).map((_, i) => (
          <CardBlock key={i} lines={i === 0 ? 4 : 3} />
        ))}
      </div>
    </div>
  );
}
