import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getAdminContext } from '@/lib/db/admin';
import { getRestaurantBySlug } from '@/lib/db/restaurants';
import { createServiceClient } from '@/lib/supabase/service';
import { Icon } from '@/components/icons';
import CollapsibleCard from '@/components/admin/collapsible-card';
import PrintAgentSettings from '@/components/admin/print-agent-settings';
import KitchenPrintSettings from '@/components/admin/kitchen-print-settings';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export const metadata = { title: 'Impresión – Panel admin' };

/* ============================================================
   /admin/impresion — Impresión de comandas y recibos
   ------------------------------------------------------------
   Solo impresoras: qué imprime, dónde y cómo dejarlo configurado.
   El contenido de "modo offline" que antes vivía aquí se movió a
   /admin/sin-internet — quien entra a configurar su impresora no
   tiene por qué toparse con la cadena de respaldo.
   ============================================================ */

export default async function AdminImpresionPage() {
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
    .select('last_seen_at, agent_version, kitchen_target, receipt_target')
    .eq('restaurant_id', restaurantId)
    .maybeSingle();

  const lastSeen = (agent?.last_seen_at as string | null) ?? null;
  // Estado calculado al momento del request a propósito (server component:
  // es texto informativo del panel, igual que en print-agent-settings.tsx).
  // eslint-disable-next-line react-hooks/purity
  const connected = !!lastSeen && Date.now() - new Date(lastSeen).getTime() < 90_000;
  const kitchenTarget = (agent?.kitchen_target as string | null) ?? null;
  const receiptTarget = (agent?.receipt_target as string | null) ?? null;

  const steps = [
    {
      n: '1',
      title: 'Instala Leogin en la PC del local',
      desc: 'Descarga tu instalador personalizado y haz doble clic. Una sola vez, sin conocimientos técnicos.',
    },
    {
      n: '2',
      title: 'Asigna tus impresoras',
      desc: 'Elige cuál imprime las comandas de cocina y cuál los recibos de caja. Puede ser la misma.',
    },
    {
      n: '3',
      title: 'Listo — imprime solo',
      desc: 'Cada pedido nuevo sale en la impresora correcta al instante, venga de un celular, tablet o PC.',
    },
  ];

  return (
    <div className="anim-fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 860 }}>
      {/* ── Hero ─────────────────────────────────────────────── */}
      <Card className="p-5">
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap' }}>
          <div style={{
            width: 46, height: 46, borderRadius: 13, flexShrink: 0, display: 'grid', placeItems: 'center',
            background: 'var(--admin-panel-btn, var(--brand-accent))', color: 'var(--admin-panel-btn-text, #fff)',
          }}>
            <Icon name="print" size={22} />
          </div>
          <div style={{ flex: 1, minWidth: 240 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <h2 className="t-display" style={{ fontSize: 21, lineHeight: 1.1 }}>Impresión</h2>
              <span style={{
                fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 99,
                color: connected ? 'var(--c-ok, #4ade80)' : 'var(--u-text-3)',
                background: connected ? 'color-mix(in srgb, var(--c-ok, #4ade80) 10%, transparent)' : 'color-mix(in srgb, var(--u-text) 6%, transparent)',
                border: `1px solid ${connected ? 'color-mix(in srgb, var(--c-ok, #4ade80) 30%, transparent)' : 'var(--u-hair)'}`,
              }}>
                {connected ? '● Conectado' : lastSeen ? '○ Desconectado' : '○ Sin configurar'}
              </span>
            </div>
            <p style={{ fontSize: 13, color: 'var(--u-text-3)', lineHeight: 1.55, margin: '6px 0 0' }}>
              Configura tus impresoras una sola vez y cada pedido sale{' '}
              <strong style={{ color: 'var(--u-text-2)' }}>automáticamente</strong> en cocina y en caja —
              sin diálogos de imprimir, sin depender de un navegador abierto.
            </p>
          </div>
        </div>

        {/* Pasos */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 12, marginTop: 18,
        }}>
          {steps.map((s) => (
            <div key={s.n} style={{
              borderRadius: 14, padding: '13px 14px',
              background: 'color-mix(in srgb, var(--u-text) 4%, transparent)',
              border: '1px solid var(--u-hair)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{
                  width: 20, height: 20, borderRadius: 99, flexShrink: 0, display: 'grid', placeItems: 'center',
                  background: 'color-mix(in srgb, var(--brand-accent) 15%, transparent)', color: 'var(--brand-accent)',
                  fontSize: 11, fontWeight: 800,
                }}>{s.n}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--u-text)' }}>{s.title}</span>
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--u-text-3)', lineHeight: 1.55 }}>{s.desc}</div>
            </div>
          ))}
        </div>

        {/* Estado de impresoras asignadas (cuando ya está conectado) */}
        {connected && (
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
            gap: 12, marginTop: 14,
          }}>
            {[{ icon: 'flame', label: 'Comandas de cocina', target: kitchenTarget },
              { icon: 'receipt', label: 'Recibos de caja', target: receiptTarget }].map((p) => (
              <div key={p.label} style={{
                display: 'flex', alignItems: 'center', gap: 10, borderRadius: 12, padding: '10px 13px',
                background: 'color-mix(in srgb, var(--u-text) 4%, transparent)', border: '1px solid var(--u-hair)',
              }}>
                <Icon name={p.icon} size={16} style={{ color: p.target ? 'var(--c-ok, #4ade80)' : 'var(--u-text-4)', flexShrink: 0 }} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 11, color: 'var(--u-text-4)', fontWeight: 600 }}>{p.label}</div>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: p.target ? 'var(--u-text)' : 'var(--u-text-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {p.target || 'Sin asignar — asígnala abajo'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* CTA cuando aún no hay agente funcionando */}
        {!connected && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16, flexWrap: 'wrap' }}>
            <Button render={<a href="#instalar" />}>
              <Icon name="download" size={16} /> {lastSeen ? 'Revisar mi instalación' : 'Conectar mi impresora · 5 minutos'}
            </Button>
            <span style={{ fontSize: 11.5, color: 'var(--u-text-4)' }}>
              Sin conocimientos técnicos: descargar, doble clic, listo.
            </span>
          </div>
        )}
      </Card>

      {/* ── Instalación y configuración (guiada) ─────────────── */}
      <div id="instalar">
        <CollapsibleCard
          title="Instalar y configurar"
          icon="download"
          storageKey="impresion-instalar"
          defaultOpen
          subtitle="Genera tu instalador personalizado, haz doble clic en la PC del local y asigna tus impresoras."
        >
          <PrintAgentSettings />
        </CollapsibleCard>
      </div>

      {/* ── Alternativa: navegador (QZ/USB) ──────────────────── */}
      <CollapsibleCard
        title="Alternativa: imprimir desde el navegador"
        icon="print"
        storageKey="impresion-navegador"
        defaultOpen={false}
        subtitle="Impresión por USB/QZ Tray directamente desde esta pantalla. Funciona, pero depende del dispositivo y del navegador — Leogin en tu PC es la opción recomendada."
      >
        <KitchenPrintSettings />
      </CollapsibleCard>

      {/* ── Enlace al modo sin internet ──────────────────────── */}
      <Card className="flex flex-wrap items-center justify-between gap-3 p-3.5">
        <div style={{ fontSize: 12.5, color: 'var(--u-text-3)', lineHeight: 1.5 }}>
          <Icon name="plug" size={14} style={{ verticalAlign: 'middle', marginRight: 6, color: 'var(--u-text-4)' }} />
          El mismo servicio que imprime también mantiene tu local operando cuando falla el internet.
        </div>
        <a href="/admin/sin-internet" style={{ fontSize: 12.5, color: 'var(--brand-accent)', fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap' }}>
          Ver modo sin internet →
        </a>
      </Card>
    </div>
  );
}
