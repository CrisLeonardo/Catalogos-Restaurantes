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
import PrintStationsSettings from '@/components/admin/print-stations-settings';
import { Card } from '@/components/ui/card';
import { Section } from '@/components/ui/section';
import { haceTiempo } from '@/lib/dates';
import EstadoDelLocal, { type PiezaDelLocal } from '@/components/admin/mi-pc/estado-del-local';
import { leerSaludDelLocal } from '@/lib/db/estado-pc';
import { estadoDeImpresora, estadoDePc, veredictoDePc, type DiagnosticoImpresora } from '@/lib/estado-pc';

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

/** «windows:EPSON TM-T20» → «EPSON TM-T20»: el prefijo es del agente, no del dueño. */
const nombreImpresora = (t: string) => t.replace(/^(windows|doc):/i, '').replace(/^tcp:\/\//i, 'Red ');

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
  const [salud, { data: r }] = await Promise.all([
    leerSaludDelLocal(restaurantId),
    db.from('restaurants').select('timezone').eq('id', restaurantId).maybeSingle(),
  ]);
  const zona = (r?.timezone as string | null) || 'America/Guatemala';
  // Frescura evaluada al momento del request a propósito (server component):
  // es texto informativo del panel, no estado persistente.
  // eslint-disable-next-line react-hooks/purity
  const ahora = Date.now();
  const pc = estadoDePc(salud.pc, ahora, zona);
  const conectada = pc.estado === 'conectada';
  const cocina = estadoDeImpresora(salud.cocina, 'comanda', zona);
  const caja = estadoDeImpresora(salud.caja, 'recibo', zona);
  const veredicto = veredictoDePc(pc, cocina, caja, salud.pc.hubListo);

  /* La pantalla de cocina de respaldo vive en la PC (hub local). */
  const { data: hub } = conectada
    ? await db.from('print_agents').select('hub_url, hub_order_token').eq('restaurant_id', restaurantId).maybeSingle()
    : { data: null };
  const kdsUrl = hub?.hub_url && hub?.hub_order_token
    ? `${(hub.hub_url as string).replace(/\/+$/, '')}/kds?t=${encodeURIComponent(hub.hub_order_token as string)}`
    : null;

  const piezaImpresora = (key: string, titulo: string, d: DiagnosticoImpresora, destino: string | null, papel: 'kitchen' | 'receipt'): PiezaDelLocal => {
    if (!conectada) {
      return { key, titulo, tono: 'neutral', texto: destino ? `${nombreImpresora(destino)} · espera a la PC` : 'Sin impresora elegida' };
    }
    if (d.estado === 'sin_asignar') return { key, titulo, tono: 'warn', texto: d.texto, enlace: { href: '#impresoras', label: 'Elegir' } };
    if (d.estado === 'fallando') return { key, titulo, tono: 'warn', texto: `${d.texto} · ¿sin papel?`, reintentar: papel };
    return { key, titulo, tono: 'ok', texto: d.estado === 'sin_uso' && destino ? `${nombreImpresora(destino)} · nada impreso hoy` : d.texto };
  };

  const piezas: PiezaDelLocal[] = [
    {
      key: 'pc',
      titulo: salud.pc.nombre ? `PC principal · ${salud.pc.nombre}` : 'PC principal',
      texto: conectada && salud.pc.ultimaSenal ? `Conectada · señal ${haceTiempo(salud.pc.ultimaSenal, ahora)}` : pc.texto,
      tono: pc.tono,
      ...(conectada ? {} : { enlace: { href: '#pc-principal', label: 'Revisar' } }),
    },
    piezaImpresora('cocina', 'Impresora de cocina', cocina, salud.cocina.destino, 'kitchen'),
    piezaImpresora('caja', 'Impresora de caja', caja, salud.caja.destino, 'receipt'),
    conectada && salud.pc.hubListo
      ? { key: 'respaldo', titulo: 'Si se cae el internet', tono: 'ok', texto: 'Protegido: los pedidos siguen por tu WiFi',
          ...(kdsUrl ? { enlace: { href: kdsUrl, label: 'Cocina de respaldo', externo: true } } : {}) }
      : { key: 'respaldo', titulo: 'Si se cae el internet', tono: conectada ? 'warn' : 'neutral',
          texto: conectada ? 'Sin proteger: actualiza Leogin en la PC principal' : 'Sin proteger mientras la PC no conteste' },
  ];
  const sinPc = pc.estado === 'sin_pc';

  return (
    <div className="anim-fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 880 }}>
      {sinPc ? (
        /* Sin PC todavía: aquí sí se explica qué es. Con PC, esto sobraba
           en cada visita y empujaba el estado real tres pantallas abajo. */
        <Card className="p-5">
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap' }}>
            <div style={{
              width: 46, height: 46, borderRadius: 'var(--radius-lg)', flexShrink: 0, display: 'grid', placeItems: 'center',
              background: 'var(--admin-panel-btn, var(--brand-accent))', color: 'var(--admin-panel-btn-text, #fff)',
            }}>
              <Icon name="monitor" size={22} />
            </div>
            <div style={{ flex: 1, minWidth: 240 }}>
              <h2 className="t-display" style={{ fontSize: 20, lineHeight: 1.1 }}>Sin PC principal</h2>
              <p style={{ fontSize: 13, color: 'var(--u-text-3)', lineHeight: 1.55, margin: '6px 0 0' }}>
                Una computadora del restaurante hace de <strong style={{ color: 'var(--u-text-2)' }}>PC
                principal</strong>: la que está junto a la impresora. Se configura una sola vez y de ahí
                en adelante trabaja sola.
              </p>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12, marginTop: 18 }}>
            {QUE_HACE.map((b) => (
              <div key={b.title} style={{
                borderRadius: 'var(--radius-lg)', padding: '13px 14px',
                background: 'var(--adm-bg-2)', border: '1px solid var(--u-hair)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <Icon name={b.icon} size={16} style={{ color: 'var(--brand-accent-ink, var(--u-text))' }} />
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--u-text)' }}>{b.title}</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--u-text-3)', lineHeight: 1.55 }}>{b.desc}</div>
              </div>
            ))}
          </div>
        </Card>
      ) : (
        <EstadoDelLocal restaurantId={restaurantId} veredicto={veredicto} piezas={piezas} puedeProbar={conectada} />
      )}

      {/* ── La PC principal ──────────────────────────────────── */}
      <Section title={sinPc ? 'Paso 1 · Elige la PC principal' : 'La PC principal'}>
        <Card className="p-4.5" id="pc-principal" style={{ scrollMarginTop: 80 }}>
          <MainPcSwitch />
        </Card>
      </Section>

      {/* ── Impresoras ───────────────────────────────────────── */}
      <Section title={sinPc ? 'Paso 2 · Dónde imprime' : 'Dónde imprime'}>
        <Card className="p-4.5" id="impresoras" style={{ scrollMarginTop: 80 }}>
          {!conectada && (
            <p style={{ fontSize: 13, color: 'var(--u-text-3)', lineHeight: 1.6, margin: '0 0 14px' }}>
              En cuanto la PC principal esté conectada, aquí aparecerán sus impresoras para que elijas
              cuál imprime las comandas de cocina y cuál los recibos de caja. Pueden ser la misma.
            </p>
          )}
          <PrintAgentSettings />
        </Card>
      </Section>

      {/* ── Más de una impresora (M-07) ───────────────────────
          Plegada porque un local con una sola impresora no tiene nada que
          hacer aquí, y con una sola estación esta pantalla no cambia nada.
          Pero está a la vista de quien vende cerveza, que es quien hoy
          manda las bebidas a la plancha. */}
      <CollapsibleCard
        title="Cocina, barra, parrilla: una impresora para cada una"
        icon="print"
        storageKey="mi-pc-estaciones"
        defaultOpen={false}
        subtitle="Manda las bebidas a la barra y la comida a la cocina. Cada una recibe solo lo suyo, y una mesa que pide solo comida no gasta papel en la barra."
      >
        <PrintStationsSettings />
      </CollapsibleCard>

      {/* ── Otras opciones (plegadas: casi nadie las necesita) ─ */}
      <CollapsibleCard
        title="Imprimir desde el navegador, sin PC principal"
        icon="print"
        storageKey="mi-pc-navegador"
        defaultOpen={false}
        subtitle="Impresión por USB desde esta pantalla. Funciona, pero depende del dispositivo y del navegador — la PC principal es la opción recomendada."
      >
        <KitchenPrintSettings />
      </CollapsibleCard>
    </div>
  );
}
