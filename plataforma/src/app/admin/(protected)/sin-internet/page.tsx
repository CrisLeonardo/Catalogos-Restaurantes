import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getAdminContext } from '@/lib/db/admin';
import { getRestaurantBySlug } from '@/lib/db/restaurants';
import { createServiceClient } from '@/lib/supabase/service';
import { Icon } from '@/components/icons';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export const metadata = { title: 'Modo sin internet – Panel admin' };

/* ============================================================
   /admin/sin-internet — Modo sin internet (respaldo local)
   ------------------------------------------------------------
   Antes este contenido vivía mezclado dentro de /admin/impresion,
   lo que confundía: quien buscaba configurar su impresora se topaba
   con la cadena de respaldo y el KDS offline. Ahora cada cosa vive
   en su lugar: Impresión = impresoras; aquí = qué pasa cuando se
   corta el internet y cómo dejar el local blindado.
   El servicio que lo hace posible es el MISMO que imprime (Leogin
   en la PC del local) — la instalación sigue en /admin/impresion.
   ============================================================ */

type NodeState = 'ok' | 'warn' | 'off';

interface ChainNode {
  label: string;
  state: NodeState;
  detail: string;
}

const STATE_COLOR: Record<NodeState, string> = {
  ok: 'var(--c-ok, #4ade80)',
  warn: 'var(--c-warn, #f59e0b)',
  off: 'var(--u-text-4)',
};

function timeAgo(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 60) return `hace ${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `hace ${hours} h`;
  return `hace ${Math.round(hours / 24)} días`;
}

export default async function AdminSinInternetPage() {
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
    .select('last_seen_at, agent_version, hub_url, hub_order_token')
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
    ? { label: 'Leogin en el local', state: 'off', detail: 'Sin instalar' }
    : !lastSeen
      ? { label: 'Leogin en el local', state: 'warn', detail: 'Esperando primera conexión' }
      : connected
        ? { label: 'Leogin en el local', state: 'ok', detail: `Conectado${version ? ` · v${version}` : ''}` }
        : { label: 'Leogin en el local', state: 'warn', detail: `Última conexión ${timeAgo(lastSeen)}` };

  const hubNode: ChainNode = connected && hubReady
    ? { label: 'Respaldo sin internet', state: 'ok', detail: 'Listo · toma pedidos e imprime en el local' }
    : connected
      ? { label: 'Respaldo sin internet', state: 'warn', detail: 'El servicio necesita actualizarse' }
      : { label: 'Respaldo sin internet', state: 'off', detail: 'Se activa al instalar Leogin en tu PC' };

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

  const steps = [
    {
      icon: 'plug',
      title: 'Se corta el internet',
      desc: 'Tus meseros y los QR de las mesas siguen tomando pedidos: los recibe Leogin en la PC del local, por tu WiFi.',
    },
    {
      icon: 'print',
      title: 'La cocina no se entera',
      desc: 'Las comandas se imprimen igual y la pantalla de cocina de respaldo sigue mostrando los pedidos.',
    },
    {
      icon: 'upload',
      title: 'Vuelve la señal',
      desc: 'Todo se sincroniza solo con la nube: nada se pierde ni se duplica, sin que nadie tenga que hacer nada.',
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
            <Icon name="plug" size={22} />
          </div>
          <div style={{ flex: 1, minWidth: 240 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <h2 className="t-display" style={{ fontSize: 21, lineHeight: 1.1 }}>Modo sin internet</h2>
              <span style={{
                fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 99,
                color: connected && hubReady ? 'var(--c-ok, #4ade80)' : 'var(--u-text-3)',
                background: connected && hubReady ? 'color-mix(in srgb, var(--c-ok, #4ade80) 10%, transparent)' : 'color-mix(in srgb, var(--u-text) 6%, transparent)',
                border: `1px solid ${connected && hubReady ? 'color-mix(in srgb, var(--c-ok, #4ade80) 30%, transparent)' : 'var(--u-hair)'}`,
              }}>
                {connected && hubReady ? '● Protegido' : '○ Sin proteger'}
              </span>
            </div>
            <p style={{ fontSize: 13, color: 'var(--u-text-3)', lineHeight: 1.55, margin: '6px 0 0' }}>
              Si el internet de tu local falla, tu restaurante <strong style={{ color: 'var(--u-text-2)' }}>no se
              detiene</strong>: el servicio de Leogin instalado en la PC del local toma los pedidos, imprime las
              comandas y sincroniza todo solo cuando vuelve la señal.
            </p>
          </div>
        </div>

        {/* Cómo funciona, en 3 pasos */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 12, marginTop: 18,
        }}>
          {steps.map((b) => (
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

        {/* CTA cuando aún no hay agente funcionando (la instalación vive en Impresión: es el mismo servicio) */}
        {!connected && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16, flexWrap: 'wrap' }}>
            <Button render={<a href="/admin/impresion#instalar" />}>
              <Icon name="download" size={16} /> {lastSeen ? 'Revisar mi instalación' : 'Activar el respaldo · 5 minutos'}
            </Button>
            <span style={{ fontSize: 11.5, color: 'var(--u-text-4)' }}>
              Es el mismo servicio que imprime tus comandas: se instala una sola vez.
            </span>
          </div>
        )}
      </Card>

      {/* ── Cadena de respaldo (estado en vivo) ──────────────── */}
      <Card className="p-4.5">
        <div className="t-kicker" style={{ fontSize: 10, marginBottom: 12 }}>Cadena de respaldo — así no se detiene tu servicio</div>
        <div style={{ display: 'flex', alignItems: 'stretch', gap: 8, flexWrap: 'wrap' }}>
          {chain.map((node, i) => (
            <div key={node.label} style={{ display: 'flex', alignItems: 'center', gap: 8, flex: '1 1 180px', minWidth: 170 }}>
              <div style={{
                flex: 1, borderRadius: 12, padding: '10px 12px',
                background: 'color-mix(in srgb, var(--u-text) 4%, transparent)',
                border: `1px solid ${node.state === 'ok' ? 'color-mix(in srgb, var(--c-ok, #4ade80) 25%, transparent)' : node.state === 'warn' ? 'color-mix(in srgb, var(--c-warn, #f59e0b) 30%, transparent)' : 'var(--u-hair)'}`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 99, flexShrink: 0, background: STATE_COLOR[node.state] }} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--u-text)' }}>{node.label}</span>
                </div>
                <div style={{ fontSize: 10.5, color: node.state === 'warn' ? 'var(--c-warn, #f59e0b)' : 'var(--u-text-4)', marginTop: 4, lineHeight: 1.4 }}>
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
          Si un eslabón falla, el siguiente lo cubre: la nube atiende normal, el servicio del local imprime y toma
          pedidos cuando la nube no responde, y los dispositivos guardan el pedido si nada más contesta.
        </p>
      </Card>

      {/* ── Pantalla de cocina de respaldo ───────────────────── */}
      {kdsUrl && (
        <Card className="p-4.5">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 220 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--u-text)' }}>
                Pantalla de cocina de respaldo
              </div>
              <div style={{ fontSize: 11, color: 'var(--u-text-3)', lineHeight: 1.5, marginTop: 3 }}>
                Ábrela en la tablet de cocina (misma red WiFi del local) y déjala de marcador:
                muestra los pedidos que el servicio capturó, incluso sin internet.
              </div>
            </div>
            <Button
              render={<a href={kdsUrl} target="_blank" rel="noopener noreferrer" />}
              variant="secondary"
              size="sm"
            >
              <Icon name="flame" size={15} /> Abrir pantalla de respaldo
            </Button>
          </div>
        </Card>
      )}

      {/* ── Enlaces relacionados ─────────────────────────────── */}
      <Card className="flex flex-wrap items-center justify-between gap-3 p-3.5">
        <div style={{ fontSize: 12.5, color: 'var(--u-text-3)', lineHeight: 1.5 }}>
          <Icon name="print" size={14} style={{ verticalAlign: 'middle', marginRight: 6, color: 'var(--u-text-4)' }} />
          ¿Buscas configurar tus impresoras? Eso vive en su propia sección.
        </div>
        <a href="/admin/impresion" style={{ fontSize: 12.5, color: 'var(--brand-accent)', fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap' }}>
          Ir a Impresión →
        </a>
      </Card>
    </div>
  );
}
