import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getAdminContext } from '@/lib/db/admin';
import { getRestaurantBySlug } from '@/lib/db/restaurants';
import { createServiceClient } from '@/lib/supabase/service';
import { Icon } from '@/components/icons';
import CollapsibleCard from '@/components/admin/collapsible-card';
import MainPcSwitch from '@/components/admin/main-pc-switch';
import PrintAgentSettings from '@/components/admin/print-agent-settings';
import KitchenPrintSettings from '@/components/admin/kitchen-print-settings';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export const metadata = { title: 'Mi PC del local – Panel admin' };

/* ============================================================
   /admin/mi-pc — Mi PC del local
   ------------------------------------------------------------
   Fusiona las TRES secciones que antes contaban la misma historia
   por pedazos (Impresión, Sin internet y Leogin Desktop) más el
   botón escondido en Ajustes → Este dispositivo. El dueño tenía
   que visitar cuatro sitios para entender una sola cosa: "hay una
   computadora en el local que imprime y te cubre si se cae el
   internet". Ahora es una pantalla con un orden fijo:

     1. ¿Tengo PC principal? ¿Cuál es? ¿Está viva?  → el interruptor
     2. ¿Dónde imprime?                              → impresoras
     3. ¿Qué pasa si se cae el internet?             → respaldo
     4. Lo demás                                     → plegado

   /admin/impresion, /admin/sin-internet y /admin/escritorio
   redirigen aquí (ver sus page.tsx) para no romper enlaces viejos.
   ============================================================ */

function timeAgo(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 60) return `hace ${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `hace ${hours} h`;
  return `hace ${Math.round(hours / 24)} días`;
}

const QUE_HACE = [
  {
    icon: 'print',
    title: 'Imprime sola',
    desc: 'Cada pedido sale en la impresora de cocina y en la de caja al instante — venga de un celular, de una tablet o del mesero.',
  },
  {
    icon: 'plug',
    title: 'Te cubre sin internet',
    desc: 'Si se cae la señal, esta PC sigue recibiendo los pedidos por tu WiFi e imprimiendo. Cuando vuelve, todo se sincroniza solo.',
  },
  {
    icon: 'monitor',
    title: 'Es la app de escritorio',
    desc: 'El mismo panel que ya conoces, pero como programa instalado: ícono propio, siempre a la mano y se actualiza sola.',
  },
];

export default async function AdminMiPcPage() {
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
    .select('last_seen_at, agent_version, kitchen_target, receipt_target, hub_url, hub_order_token, is_active, device_name')
    .eq('restaurant_id', restaurantId)
    .maybeSingle();

  const lastSeen = (agent?.last_seen_at as string | null) ?? null;
  const active = !!agent && (agent.is_active as boolean | null) !== false;
  // Frescura evaluada al momento del request a propósito (server component):
  // es texto informativo del panel, no estado persistente.
  // eslint-disable-next-line react-hooks/purity
  const connected = active && !!lastSeen && Date.now() - new Date(lastSeen).getTime() < 90_000;
  const kitchenTarget = (agent?.kitchen_target as string | null) ?? null;
  const receiptTarget = (agent?.receipt_target as string | null) ?? null;
  const hubReady = !!agent?.hub_url && !!agent?.hub_order_token;

  const hubUrl = (agent?.hub_url as string | null) ?? null;
  const hubToken = (agent?.hub_order_token as string | null) ?? null;
  const kdsUrl = connected && hubUrl && hubToken
    ? `${hubUrl.replace(/\/+$/, '')}/kds?t=${encodeURIComponent(hubToken)}`
    : null;

  return (
    <div className="anim-fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 880 }}>
      {/* ── Hero ─────────────────────────────────────────────── */}
      <Card className="p-5">
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap' }}>
          <div style={{
            width: 46, height: 46, borderRadius: 13, flexShrink: 0, display: 'grid', placeItems: 'center',
            background: 'var(--admin-panel-btn, var(--brand-accent))', color: 'var(--admin-panel-btn-text, #fff)',
          }}>
            <Icon name="monitor" size={22} />
          </div>
          <div style={{ flex: 1, minWidth: 240 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <h2 className="t-display" style={{ fontSize: 21, lineHeight: 1.1 }}>Mi PC del local</h2>
              <span style={{
                fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 99,
                color: connected ? 'var(--c-ok, #4ade80)' : 'var(--c-warn, #f59e0b)',
                background: connected
                  ? 'color-mix(in srgb, var(--c-ok, #4ade80) 10%, transparent)'
                  : 'color-mix(in srgb, var(--c-warn, #f59e0b) 10%, transparent)',
                border: `1px solid ${connected
                  ? 'color-mix(in srgb, var(--c-ok, #4ade80) 30%, transparent)'
                  : 'color-mix(in srgb, var(--c-warn, #f59e0b) 30%, transparent)'}`,
              }}>
                {connected ? '● Todo listo' : active && agent ? '○ Sin responder' : '○ Sin PC principal'}
              </span>
            </div>
            <p style={{ fontSize: 13, color: 'var(--u-text-3)', lineHeight: 1.55, margin: '6px 0 0' }}>
              Una computadora del restaurante hace de <strong style={{ color: 'var(--u-text-2)' }}>PC
              principal</strong>: la que está junto a la impresora. Se configura una sola vez y de ahí
              en adelante trabaja sola.
            </p>
          </div>
        </div>

        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
          gap: 12, marginTop: 18,
        }}>
          {QUE_HACE.map((b) => (
            <div key={b.title} style={{
              borderRadius: 14, padding: '13px 14px',
              background: 'color-mix(in srgb, var(--u-text) 4%, transparent)',
              border: '1px solid var(--u-hair)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <Icon name={b.icon} size={16} style={{ color: 'var(--brand-accent-ink, var(--u-text))' }} />
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--u-text)' }}>{b.title}</span>
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--u-text-3)', lineHeight: 1.55 }}>{b.desc}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* ── 1. El interruptor ────────────────────────────────── */}
      <Card className="p-4.5" id="pc-principal">
        <div className="t-kicker" style={{ fontSize: 10, marginBottom: 12 }}>Paso 1 · La PC principal</div>
        <MainPcSwitch />
      </Card>

      {/* ── 2. Impresoras ────────────────────────────────────── */}
      <Card className="p-4.5">
        <div className="t-kicker" style={{ fontSize: 10, marginBottom: 12 }}>Paso 2 · Dónde imprime</div>
        {connected ? (
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
            gap: 12, marginBottom: 16,
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
                    {p.target || 'Sin asignar — elígela abajo'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p style={{ fontSize: 12.5, color: 'var(--u-text-3)', lineHeight: 1.6, margin: '0 0 14px' }}>
            En cuanto la PC principal esté conectada, aquí aparecerán sus impresoras para que elijas
            cuál imprime las comandas de cocina y cuál los recibos de caja. Pueden ser la misma.
          </p>
        )}
        <PrintAgentSettings />
      </Card>

      {/* ── 3. Respaldo sin internet ─────────────────────────── */}
      <Card className="p-4.5">
        <div className="t-kicker" style={{ fontSize: 10, marginBottom: 12 }}>Paso 3 · Si se cae el internet</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <span style={{
            width: 9, height: 9, borderRadius: 99, flexShrink: 0,
            background: connected && hubReady ? 'var(--c-ok, #4ade80)' : 'var(--u-text-4)',
          }} />
          <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--u-text)' }}>
            {connected && hubReady ? 'Protegido' : 'Sin proteger'}
          </span>
          {lastSeen && !connected && (
            <span style={{ fontSize: 11.5, color: 'var(--u-text-4)' }}>· última señal {timeAgo(lastSeen)}</span>
          )}
        </div>
        <p style={{ fontSize: 12.5, color: 'var(--u-text-3)', lineHeight: 1.6, margin: 0 }}>
          {connected && hubReady
            ? 'Si se corta la señal, tus meseros y los QR de las mesas siguen tomando pedidos: los recibe esta PC por tu WiFi y las comandas se imprimen igual. Al volver el internet todo se sincroniza solo, sin duplicados y sin que nadie tenga que hacer nada.'
            : 'Con la PC principal encendida, un corte de internet deja de detener el local: los pedidos siguen entrando por tu WiFi y se sincronizan solos al volver la señal.'}
        </p>
        {kdsUrl && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--u-hair)' }}>
            <div style={{ flex: 1, minWidth: 220 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--u-text)' }}>Pantalla de cocina de respaldo</div>
              <div style={{ fontSize: 11, color: 'var(--u-text-3)', lineHeight: 1.5, marginTop: 3 }}>
                Ábrela en la tablet de cocina (misma red WiFi) y déjala de marcador: muestra los pedidos aunque no haya internet.
              </div>
            </div>
            <Button render={<a href={kdsUrl} target="_blank" rel="noopener noreferrer" />} variant="secondary" size="sm">
              <Icon name="flame" size={15} /> Abrir pantalla de respaldo
            </Button>
          </div>
        )}
      </Card>

      {/* ── Otras opciones (plegadas: casi nadie las necesita) ─ */}
      <CollapsibleCard
        title="Imprimir desde el navegador, sin PC principal"
        icon="print"
        storageKey="mi-pc-navegador"
        defaultOpen={false}
        subtitle="Impresión por USB/QZ Tray desde esta pantalla. Funciona, pero depende del dispositivo y del navegador — la PC principal es la opción recomendada."
      >
        <KitchenPrintSettings />
      </CollapsibleCard>
    </div>
  );
}
