import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getAdminContext } from '@/lib/db/admin';
import { getRestaurantBySlug } from '@/lib/db/restaurants';
import { createServiceClient } from '@/lib/supabase/service';
import { Icon } from '@/components/icons';
import CollapsibleCard from '@/components/admin/collapsible-card';
import PrintAgentSettings from '@/components/admin/print-agent-settings';
import KitchenPrintSettings from '@/components/admin/kitchen-print-settings';

export const metadata = { title: 'Impresión y modo offline – Panel admin' };

/* ============================================================
   /admin/impresion — Impresión y modo offline
   ------------------------------------------------------------
   Sección propia del Agente Leogin (antes vivía plegado dentro de
   Perfil). Presenta el agente como lo que es — la pieza que imprime
   solo y mantiene el restaurante operando sin internet — con estado
   en vivo de la cadena de respaldo e instalación guiada. La
   impresión por navegador (QZ/USB) queda como alternativa plegada.
   ============================================================ */

type NodeState = 'ok' | 'warn' | 'off';

interface ChainNode {
  label: string;
  state: NodeState;
  detail: string;
}

const STATE_COLOR: Record<NodeState, string> = {
  ok: '#4ade80',
  warn: '#f59e0b',
  off: 'var(--u-text-4)',
};

function timeAgo(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 60) return `hace ${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `hace ${hours} h`;
  return `hace ${Math.round(hours / 24)} días`;
}

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
    .select('last_seen_at, agent_version, hub_url, hub_order_token, kitchen_target, receipt_target')
    .eq('restaurant_id', restaurantId)
    .maybeSingle();

  const lastSeen = (agent?.last_seen_at as string | null) ?? null;
  const version = (agent?.agent_version as string | null) ?? null;
  // Estado calculado al momento del request a propósito (server component:
  // es texto informativo del panel, igual que en print-agent-settings.tsx).
  // eslint-disable-next-line react-hooks/purity
  const connected = !!lastSeen && Date.now() - new Date(lastSeen).getTime() < 90_000;
  const hubReady = !!agent?.hub_url && !!agent?.hub_order_token;

  const agentNode: ChainNode = !agent
    ? { label: 'Agente en el local', state: 'off', detail: 'Sin instalar' }
    : !lastSeen
      ? { label: 'Agente en el local', state: 'warn', detail: 'Esperando primera conexión' }
      : connected
        ? { label: 'Agente en el local', state: 'ok', detail: `Conectado${version ? ` · v${version}` : ''}` }
        : { label: 'Agente en el local', state: 'warn', detail: `Última conexión ${timeAgo(lastSeen)}` };

  const hubNode: ChainNode = connected && hubReady
    ? { label: 'Respaldo sin internet', state: 'ok', detail: 'Listo · toma pedidos e imprime en el local' }
    : connected
      ? { label: 'Respaldo sin internet', state: 'warn', detail: 'El agente necesita actualizarse' }
      : { label: 'Respaldo sin internet', state: 'off', detail: 'Se activa al instalar el agente' };

  const chain: ChainNode[] = [
    { label: 'Nube Leogin', state: 'ok', detail: 'En línea' },
    agentNode,
    hubNode,
  ];

  // Pantalla de cocina de respaldo servida por el propio hub en la LAN:
  // navegación directa al hub (no sufre mixed content ni el permiso de red
  // local del navegador — todo pasa a ser mismo-origen una vez dentro).
  const hubUrl = (agent?.hub_url as string | null) ?? null;
  const hubToken = (agent?.hub_order_token as string | null) ?? null;
  const kdsUrl = hubUrl && hubToken
    ? `${hubUrl.replace(/\/+$/, '')}/kds?t=${encodeURIComponent(hubToken)}`
    : null;

  const benefits = [
    {
      icon: 'print',
      title: 'Impresión automática',
      desc: 'Comandas y recibos salen solos en cocina y caja, desde cualquier celular, tablet o PC — sin diálogos.',
    },
    {
      icon: 'plug',
      title: 'Funciona sin internet',
      desc: 'Si se corta la señal, el local sigue tomando pedidos y la comanda se imprime igual.',
    },
    {
      icon: 'upload',
      title: 'Se sincroniza solo',
      desc: 'Al volver la conexión, todo sube a la nube automáticamente: nada se pierde ni se duplica.',
    },
  ];

  return (
    <div className="anim-fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 860 }}>
      {/* ── Hero ─────────────────────────────────────────────── */}
      <div className="glass" style={{ borderRadius: 18, padding: '22px 22px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap' }}>
          <div style={{
            width: 46, height: 46, borderRadius: 13, flexShrink: 0, display: 'grid', placeItems: 'center',
            background: 'var(--admin-panel-btn, var(--brand-accent))', color: 'var(--admin-panel-btn-text, #fff)',
          }}>
            <Icon name="print" size={22} />
          </div>
          <div style={{ flex: 1, minWidth: 240 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <h2 className="t-display" style={{ fontSize: 21, lineHeight: 1.1 }}>Agente Leogin</h2>
              <span style={{
                fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 99,
                color: connected ? '#4ade80' : 'var(--u-text-3)',
                background: connected ? 'rgba(74,222,128,0.1)' : 'color-mix(in srgb, var(--u-text) 6%, transparent)',
                border: `1px solid ${connected ? 'rgba(74,222,128,0.3)' : 'var(--u-hair)'}`,
              }}>
                {connected ? '● Conectado' : lastSeen ? '○ Desconectado' : '○ Sin instalar'}
              </span>
            </div>
            <p style={{ fontSize: 13, color: 'var(--u-text-3)', lineHeight: 1.55, margin: '6px 0 0' }}>
              Se instala <strong style={{ color: 'var(--u-text-2)' }}>una sola vez</strong> en la PC del local
              y convierte tu restaurante en una operación que no se detiene: impresión automática y
              respaldo completo cuando falla el internet.
            </p>
          </div>
        </div>

        {/* Beneficios */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 12, marginTop: 18,
        }}>
          {benefits.map((b) => (
            <div key={b.title} style={{
              borderRadius: 14, padding: '13px 14px',
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

        {/* CTA cuando aún no hay agente funcionando */}
        {!connected && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16, flexWrap: 'wrap' }}>
            <a
              href="#instalar"
              className="press"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 8, padding: '11px 18px',
                borderRadius: 'var(--radius-md)', textDecoration: 'none', fontSize: 13.5, fontWeight: 700,
                background: 'var(--admin-panel-btn, var(--brand-accent))', color: 'var(--admin-panel-btn-text, #fff)',
              }}
            >
              <Icon name="download" size={16} /> {lastSeen ? 'Revisar mi agente' : 'Instalarlo ahora · 5 minutos'}
            </a>
            <span style={{ fontSize: 11.5, color: 'var(--u-text-4)' }}>
              Sin conocimientos técnicos: descargar, doble clic, listo.
            </span>
          </div>
        )}
      </div>

      {/* ── Cadena de respaldo (estado en vivo) ──────────────── */}
      <div className="glass" style={{ borderRadius: 18, padding: '18px 20px' }}>
        <div className="t-kicker" style={{ fontSize: 10, marginBottom: 12 }}>Cadena de respaldo — así no se detiene tu servicio</div>
        <div style={{ display: 'flex', alignItems: 'stretch', gap: 8, flexWrap: 'wrap' }}>
          {chain.map((node, i) => (
            <div key={node.label} style={{ display: 'flex', alignItems: 'center', gap: 8, flex: '1 1 180px', minWidth: 170 }}>
              <div style={{
                flex: 1, borderRadius: 12, padding: '10px 12px',
                background: 'color-mix(in srgb, var(--u-text) 4%, transparent)',
                border: `1px solid ${node.state === 'ok' ? 'rgba(74,222,128,0.25)' : node.state === 'warn' ? 'rgba(245,158,11,0.3)' : 'var(--u-hair)'}`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 99, flexShrink: 0, background: STATE_COLOR[node.state] }} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--u-text)' }}>{node.label}</span>
                </div>
                <div style={{ fontSize: 10.5, color: node.state === 'warn' ? '#f59e0b' : 'var(--u-text-4)', marginTop: 4, lineHeight: 1.4 }}>
                  {node.detail}
                </div>
              </div>
              {i < chain.length - 1 && (
                <Icon name="chevronRight" size={14} style={{ color: 'var(--u-text-4)', flexShrink: 0 }} />
              )}
            </div>
          ))}
        </div>
        <p style={{ fontSize: 11, color: 'var(--u-text-4)', lineHeight: 1.5, margin: '12px 0 0' }}>
          Si un eslabón falla, el siguiente lo cubre: la nube atiende normal, el agente imprime y toma
          pedidos cuando la nube no responde, y los dispositivos guardan el pedido si nada más contesta.
        </p>

        {kdsUrl && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginTop: 14,
            borderRadius: 12, padding: '12px 14px',
            background: 'color-mix(in srgb, var(--u-text) 4%, transparent)',
            border: '1px solid var(--u-hair)',
          }}>
            <div style={{ flex: 1, minWidth: 220 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--u-text)' }}>
                Pantalla de cocina de respaldo
              </div>
              <div style={{ fontSize: 11, color: 'var(--u-text-3)', lineHeight: 1.5, marginTop: 3 }}>
                Ábrela en la tablet de cocina (misma red WiFi del local) y déjala de marcador:
                muestra los pedidos que el agente capturó, incluso sin internet.
              </div>
            </div>
            <a
              href={kdsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="press glass-quiet"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 14px',
                borderRadius: 'var(--radius-md)', textDecoration: 'none',
                fontSize: 12.5, fontWeight: 700, color: 'var(--u-text-2)',
              }}
            >
              <Icon name="flame" size={15} /> Abrir pantalla de respaldo
            </a>
          </div>
        )}
      </div>

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
        subtitle="Impresión por USB/QZ Tray directamente desde esta pantalla. Funciona, pero depende del dispositivo y del navegador — el Agente Leogin es la opción recomendada."
      >
        <KitchenPrintSettings />
      </CollapsibleCard>
    </div>
  );
}
