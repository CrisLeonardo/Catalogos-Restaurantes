import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getAdminContext } from '@/lib/db/admin';
import { getRestaurantBySlug } from '@/lib/db/restaurants';
import { createServiceClient } from '@/lib/supabase/service';
import { Icon } from '@/components/icons';
import { Card, cardVariants } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export const metadata = { title: 'Leogin Desktop – Panel admin' };

/* ============================================================
   /admin/escritorio — Leogin Desktop
   ------------------------------------------------------------
   Página propia para la app instalable (leogin-desktop/, el shell
   con ventana + bandeja + auto-update). Antes su único punto de
   entrada era un botón semi-escondido dentro de Impresión, lo cual
   ya no reflejaba lo que la app se convirtió: un producto aparte,
   no solo "el instalador del agente de impresión". Impresión sigue
   siendo la sección donde se configuran destinos de impresora y se
   ve la salud del servicio; aquí se presenta y descarga la app.
   ============================================================ */

function timeAgo(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 60) return `hace ${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `hace ${hours} h`;
  return `hace ${Math.round(hours / 24)} días`;
}

const BENEFITS = [
  {
    icon: 'monitor',
    title: 'Una app de verdad, no una pestaña',
    desc: 'Ícono en el menú Inicio y en la bandeja del sistema. Se queda corriendo aunque la cierres: minimizarla no corta nada.',
  },
  {
    icon: 'key',
    title: 'Vincula la impresora en un clic',
    desc: 'Ya con sesión iniciada, un botón instala y conecta el servicio de impresión — sin descargar nada aparte ni copiar tokens.',
  },
  {
    icon: 'flame',
    title: 'Modo Kiosco para cocina',
    desc: 'Un acceso directo abre una pantalla de cocina (KDS) a pantalla completa, sin bandeja ni menús — ideal para una pantalla dedicada.',
  },
  {
    icon: 'plug',
    title: 'Respaldo si se corta el internet',
    desc: 'Si la nube no responde, la app avisa y muestra el estado del servicio local: tu restaurante sigue tomando pedidos e imprimiendo.',
  },
  {
    icon: 'upload',
    title: 'Se actualiza sola, sin interrumpir',
    desc: 'Cuando hay una versión nueva, un aviso discreto te deja elegir "Reiniciar ahora" o "Después" — nunca te empuja a mitad de una comanda.',
  },
  {
    icon: 'grid',
    title: 'Instálala donde la necesites',
    desc: 'Caja, recepción, cocina: instala Leogin en cada PC del local que quieras. El servicio de impresión solo corre en una — la app en todas.',
  },
];

export default async function AdminEscritorioPage() {
  const ctx = await getAdminContext();
  if (!ctx) redirect('/admin/login');

  let restaurantId: string | null = null;
  if (ctx.profile.role === 'SUPER_ADMIN') {
    const slug = (await headers()).get('x-tenant-slug');
    if (slug) {
      const tenantData = await getRestaurantBySlug(slug);
      restaurantId = tenantData?.restaurant.id ?? null;
    }
  } else {
    restaurantId = ctx.profile.restaurant_id;
  }
  if (!restaurantId) redirect('/admin/login');

  const db = createServiceClient();
  const { data: agent } = await db
    .from('print_agents')
    .select('shell_version, shell_last_seen_at')
    .eq('restaurant_id', restaurantId)
    .maybeSingle();

  const shellVersion = (agent?.shell_version as string | null) ?? null;
  const shellLastSeen = (agent?.shell_last_seen_at as string | null) ?? null;
  // Frescura evaluada al momento del request a propósito (server component,
  // igual que en impresion/page.tsx): es texto informativo, no estado persistente.
  // eslint-disable-next-line react-hooks/purity
  const installed = !!shellLastSeen && Date.now() - new Date(shellLastSeen).getTime() < 3 * 24 * 60 * 60_000;

  return (
    <div className="anim-fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 900 }}>
      {/* ── Hero ─────────────────────────────────────────────── */}
      <Card className="p-6 pb-5.5">
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap' }}>
          <div style={{
            width: 50, height: 50, borderRadius: 14, flexShrink: 0, display: 'grid', placeItems: 'center',
            background: 'var(--admin-panel-btn, var(--brand-accent))', color: 'var(--admin-panel-btn-text, #fff)',
          }}>
            <Icon name="monitor" size={24} />
          </div>
          <div style={{ flex: 1, minWidth: 260 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <h2 className="t-display" style={{ fontSize: 22, lineHeight: 1.1 }}>Leogin Desktop</h2>
              {installed && (
                <span style={{
                  fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 99,
                  color: '#4ade80', background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.3)',
                }}>
                  ● Instalada{shellVersion ? ` · v${shellVersion}` : ''}
                </span>
              )}
            </div>
            <p style={{ fontSize: 13.5, color: 'var(--u-text-3)', lineHeight: 1.6, margin: '8px 0 0', maxWidth: 620 }}>
              La app de escritorio de Leogin para Windows: el mismo panel que ya conoces, pero como un
              programa instalado — con ícono propio, siempre a la mano en la bandeja del sistema, y con
              impresión y modo offline listos en un clic desde adentro.
            </p>
            {installed && shellLastSeen && (
              <p style={{ fontSize: 11.5, color: 'var(--u-text-4)', margin: '6px 0 0' }}>
                Última conexión reportada {timeAgo(shellLastSeen)}.
              </p>
            )}
          </div>
        </div>

        {/* Beneficios */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 12, marginTop: 20,
        }}>
          {BENEFITS.map((b) => (
            <div key={b.title} style={{
              borderRadius: 14, padding: '14px 15px',
              background: 'color-mix(in srgb, var(--u-text) 4%, transparent)',
              border: '1px solid var(--u-hair)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <Icon name={b.icon} size={16} style={{ color: 'var(--brand-accent, var(--u-text))' }} />
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--u-text)' }}>{b.title}</span>
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--u-text-3)', lineHeight: 1.55 }}>{b.desc}</div>
            </div>
          ))}
        </div>

        {/* CTA principal */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 20, flexWrap: 'wrap' }}>
          <Button render={<a href="/api/desktop/download-exe" />} size="lg">
            <Icon name="download" size={17} /> Descargar Leogin Desktop
          </Button>
          <span style={{ fontSize: 11.5, color: 'var(--u-text-4)' }}>
            Para Windows 10/11 (64 bits) · gratis · sin conocimientos técnicos.
          </span>
        </div>
      </Card>

      {/* ── Cómo instalarla ──────────────────────────────────── */}
      <Card className="px-5.5 py-5">
        <div className="t-kicker" style={{ fontSize: 10, marginBottom: 14 }}>Cómo instalarla — 3 pasos</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Step n={1} title="Descarga y ejecuta el instalador">
            Clic en «Descargar Leogin Desktop» en la PC donde la quieras usar y haz doble clic en el
            archivo descargado. No pide permisos de administrador.
            <div style={{
              fontSize: 11, color: 'var(--u-text-4)', background: 'rgba(245,158,11,0.08)',
              border: '1px solid rgba(245,158,11,0.15)', borderRadius: 6, padding: '6px 9px',
              lineHeight: 1.5, marginTop: 8,
            }}>
              <strong style={{ color: 'var(--u-text-3)' }}>Si Windows muestra una pantalla azul</strong> («Windows
              protegió tu PC»), haz clic en <strong style={{ color: '#fcd34d' }}>Más información → Ejecutar de
              todos modos</strong>. Es normal en programas nuevos — la firma digital llega pronto.
            </div>
          </Step>
          <Step n={2} title="Inicia sesión con tu cuenta de Leogin">
            Al abrir por primera vez, un solo botón: «Iniciar sesión con tu cuenta de Leogin». Escribe tu
            correo y contraseña de siempre — la app reconoce sola a qué restaurante perteneces y te deja
            directo en tu panel, sin escribir ninguna dirección. La sesión queda guardada en la app.
          </Step>
          <Step n={3} title="(Opcional) hazla el servidor de impresión del local">
            Dentro de la app, entra a <strong>Impresión</strong> y pulsa «Hacer de esta PC el servidor del
            local» — instala el servicio de impresión sin descargar nada más. Puedes hacerlo ahora o cuando
            quieras.
          </Step>
        </div>
      </Card>

      {/* ── Cross-link a Impresión ───────────────────────────── */}
      <a
        href="/admin/impresion"
        className={cn(cardVariants({ variant: 'interactive' }), 'flex items-center gap-3 no-underline')}
        style={{ padding: '14px 16px' }}
      >
        <span style={{
          width: 34, height: 34, borderRadius: 9, flexShrink: 0, display: 'grid', placeItems: 'center',
          background: 'rgba(var(--brand-accent-rgb, 99,102,241),0.12)', color: 'var(--brand-accent)',
        }}>
          <Icon name="print" size={17} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--u-text)' }}>
            ¿Ya tienes la impresora conectada y solo quieres revisar su estado?
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--u-text-3)' }}>
            Ve a Impresión para asignar impresoras, ver la cadena de respaldo y el estado en vivo.
          </div>
        </div>
        <Icon name="chevronRight" size={16} style={{ color: 'var(--u-text-4)', flexShrink: 0 }} />
      </a>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
      <span style={{
        flexShrink: 0, width: 24, height: 24, borderRadius: 99,
        background: 'var(--brand-accent, rgba(99,102,241,0.7))', display: 'grid', placeItems: 'center',
        fontSize: 12, fontWeight: 700, color: '#fff',
      }}>
        {n}
      </span>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={{ fontSize: 13, color: 'var(--u-text-2)', fontWeight: 600 }}>{title}</span>
        <span style={{ fontSize: 12, color: 'var(--u-text-3)', lineHeight: 1.6 }}>{children}</span>
      </div>
    </div>
  );
}
