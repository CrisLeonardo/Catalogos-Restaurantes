// KDS local de respaldo (servido por el hub en la LAN).
//
// Durante un corte de internet, cocina abre http://IP-DEL-HUB:47100/kds?t=TOKEN
// (el panel admin muestra el enlace listo) y ve los pedidos que el hub capturó
// sin nube — con nombres y opciones ya resueltos (store.KdsDisplay). Todo es
// mismo-origen una vez dentro: la navegación directa al hub no sufre mixed
// content ni el permiso Local Network Access del navegador (esos solo aplican
// a subrecursos pedidos DESDE otro origen).
//
// Alcance deliberado: muestra SOLO lo que el hub capturó (los pedidos que
// llegaron por la nube ya se imprimieron y viven en /admin/cocina). "Listo"
// es presentación local — no toca la sincronización.

import type http from 'node:http';
import { getKdsOrders, markOrderKdsDone, getMenuSnapshot, type PendingOrder, type KdsDisplay } from './store.ts';

const TYPE_LABELS: Record<string, string> = {
  DINE_IN: 'EN LOCAL',
  PICKUP: 'PARA LLEVAR',
  DELIVERY: 'A DOMICILIO',
};

/** Pedidos viejos (anteriores a que existiera `display`) se reconstruyen del
    payload crudo: nombres y cantidades sí, etiquetas de opciones no. */
function displayOf(order: PendingOrder): KdsDisplay {
  if (order.display) return order.display;
  const body = (order.payload ?? {}) as Record<string, unknown>;
  const customer = (body.customer ?? {}) as Record<string, unknown>;
  const rawItems = Array.isArray(body.items) ? (body.items as Record<string, unknown>[]) : [];
  return {
    customerName: typeof customer.name === 'string' ? customer.name : '—',
    orderType: typeof customer.type === 'string' ? customer.type : '—',
    address: typeof customer.address === 'string' ? customer.address : null,
    notes: typeof customer.notes === 'string' ? customer.notes : null,
    total: 0,
    items: rawItems.map((i) => ({
      name: typeof i.name === 'string' ? i.name : 'Producto',
      quantity: typeof i.quantity === 'number' ? i.quantity : 1,
      options: [],
    })),
  };
}

export function kdsOrdersPayload(): string {
  const snapshot = getMenuSnapshot();
  return JSON.stringify({
    restaurantName: snapshot?.restaurantName ?? 'Restaurante',
    orders: getKdsOrders().map((o) => ({
      clientId: o.clientId,
      orderNumber: o.orderNumber,
      status: o.status,
      syncedOrderNumber: o.syncedOrderNumber ?? null,
      createdAt: o.createdAt,
      error: o.error ?? null,
      display: displayOf(o),
    })),
  });
}

export function kdsMarkDone(clientId: unknown): boolean {
  return typeof clientId === 'string' && clientId !== '' && markOrderKdsDone(clientId);
}

export function sendKdsPage(res: http.ServerResponse): void {
  res.setHeader('content-type', 'text/html; charset=utf-8');
  res.end(KDS_HTML);
}

const TYPE_LABELS_JS = JSON.stringify(TYPE_LABELS);

// Página autocontenida (sin assets externos: debe funcionar sin internet).
const KDS_HTML = `<!doctype html>
<html lang="es">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Cocina · Respaldo Leogin</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; margin: 0; }
  body { background: #0d1017; color: #e7eaf0; font: 15px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; min-height: 100vh; }
  header { display: flex; align-items: center; gap: 12px; padding: 12px 18px; border-bottom: 1px solid #232838; position: sticky; top: 0; background: #0d1017; flex-wrap: wrap; }
  header h1 { font-size: 15px; letter-spacing: 1.5px; font-weight: 800; }
  header .sub { font-size: 11.5px; color: #8b93a7; }
  #estado { margin-left: auto; font-size: 12px; font-weight: 700; }
  #estado.ok { color: #4ade80; } #estado.err { color: #f87171; }
  main { padding: 16px; display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 14px; }
  .vacio { grid-column: 1 / -1; text-align: center; color: #8b93a7; padding: 60px 20px; font-size: 15px; }
  .card { background: #151a26; border: 1px solid #262d40; border-radius: 14px; padding: 14px 16px; display: flex; flex-direction: column; gap: 10px; }
  .card.age-warn { border-color: #b4830b; } .card.age-late { border-color: #dc2626; }
  .top { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
  .num { font-size: 18px; font-weight: 800; letter-spacing: 0.5px; }
  .mins { margin-left: auto; font-size: 14px; font-weight: 800; color: #8b93a7; }
  .age-warn .mins { color: #f59e0b; } .age-late .mins { color: #f87171; }
  .meta { font-size: 12.5px; color: #aab2c5; }
  .badge { font-size: 10px; font-weight: 800; letter-spacing: 0.6px; padding: 3px 8px; border-radius: 99px; align-self: flex-start; }
  .badge.pending { background: rgba(245,158,11,.12); color: #f59e0b; border: 1px solid rgba(245,158,11,.35); }
  .badge.synced  { background: rgba(74,222,128,.1);  color: #4ade80; border: 1px solid rgba(74,222,128,.3); }
  .badge.failed  { background: rgba(248,113,113,.1); color: #f87171; border: 1px solid rgba(248,113,113,.35); }
  ul { list-style: none; display: flex; flex-direction: column; gap: 7px; border-top: 1px solid #232838; padding-top: 10px; }
  li .qn { font-size: 15.5px; font-weight: 700; }
  li .ops { font-size: 12px; color: #9aa3b8; padding-left: 22px; }
  .nota { font-size: 12.5px; color: #fcd34d; background: rgba(245,158,11,.07); border-radius: 8px; padding: 6px 10px; }
  .err { font-size: 12px; color: #f87171; }
  button.listo { margin-top: 2px; padding: 11px; border: 0; border-radius: 10px; background: #233049; color: #e7eaf0; font-size: 14px; font-weight: 800; letter-spacing: 1px; cursor: pointer; }
  button.listo:active { transform: scale(.98); }
</style>
<header>
  <h1>COCINA · RESPALDO</h1>
  <span class="sub" id="rest"></span>
  <span id="estado">conectando…</span>
</header>
<main id="lista"><div class="vacio">Cargando…</div></main>
<script>
  const T = new URLSearchParams(location.search).get('t') || '';
  const TYPES = ${TYPE_LABELS_JS};
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  async function marcarListo(clientId) {
    try {
      await fetch('/kds/done?t=' + encodeURIComponent(T), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ clientId }),
      });
    } catch {}
    void refrescar();
  }

  function tarjeta(o) {
    const mins = Math.max(0, Math.round((Date.now() - new Date(o.createdAt).getTime()) / 60000));
    const age = mins >= 20 ? 'age-late' : mins >= 10 ? 'age-warn' : '';
    const d = o.display;
    const badge = o.status === 'synced'
      ? '<span class="badge synced">SINCRONIZADO' + (o.syncedOrderNumber ? ' · ' + esc(o.syncedOrderNumber) : '') + '</span>'
      : o.status === 'failed'
        ? '<span class="badge failed">RECHAZADO AL SINCRONIZAR</span>'
        : '<span class="badge pending">POR SINCRONIZAR</span>';
    const items = d.items.map((i) =>
      '<li><div class="qn">' + i.quantity + ' × ' + esc(i.name) + '</div>' +
      (i.options.length ? '<div class="ops">' + esc(i.options.join(', ')) + '</div>' : '') + '</li>'
    ).join('');
    return '<div class="card ' + age + '">' +
      '<div class="top"><span class="num">#' + esc(o.orderNumber) + '</span>' +
      '<span class="mins">' + mins + ' min</span></div>' +
      badge +
      '<div class="meta">' + esc(d.customerName) + ' · ' + esc(TYPES[d.orderType] || d.orderType) +
      (d.address ? ' · ' + esc(d.address) : '') + '</div>' +
      '<ul>' + items + '</ul>' +
      (d.notes ? '<div class="nota">NOTA: ' + esc(d.notes) + '</div>' : '') +
      (o.error ? '<div class="err">' + esc(o.error) + ' — vuelve a ingresar el pedido cuando haya señal.</div>' : '') +
      '<button class="listo" onclick="marcarListo(\\'' + esc(o.clientId) + '\\')">LISTO ✓</button>' +
      '</div>';
  }

  async function refrescar() {
    const estado = document.getElementById('estado');
    try {
      const res = await fetch('/kds/orders?t=' + encodeURIComponent(T));
      if (!res.ok) { estado.textContent = res.status === 401 ? 'enlace inválido — ábrelo desde el panel' : 'error ' + res.status; estado.className = 'err'; return; }
      const data = await res.json();
      document.getElementById('rest').textContent = data.restaurantName;
      estado.textContent = '● en vivo'; estado.className = 'ok';
      document.getElementById('lista').innerHTML = data.orders.length
        ? data.orders.map(tarjeta).join('')
        : '<div class="vacio">Sin pedidos de respaldo.<br>Los pedidos con internet siguen llegando a la pantalla de cocina normal.</div>';
    } catch {
      estado.textContent = 'sin conexión con el agente'; estado.className = 'err';
    }
  }

  void refrescar();
  setInterval(refrescar, 4000);
</script>
</html>`;
