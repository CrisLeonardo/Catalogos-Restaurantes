// ============================================================
// HUB DE EMERGENCIA (Fase 2 del plan offline de Leogin)
// ------------------------------------------------------------
// Cuando el internet del local se cae, esta PC se vuelve el
// "cerebro" del restaurante en la RED LOCAL:
//
//   mesero (navegador en LAN) → http://IP:9123 → mini toma-pedidos
//        → cola persistente (hub-data.json) → imprime la comanda
//        → al volver el internet, sube todo a la nube (idempotente
//          por client_id, migración 061 — reintentar no duplica).
//
//   cocina (pantalla en LAN)  → http://IP:9123/cocina (KDS-lite)
//
// Mientras HAY internet el hub solo mantiene fresco su snapshot
// del menú (GET /api/agent/menu cada 5 min). No interfiere con el
// flujo normal.
// ============================================================

import http from 'node:http';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { loadConfig, loadHubConfig, type AgentConfig, type HubConfig } from './config.ts';
import { parseTarget, printRaw } from './printer/index.ts';
import { buildComandaTicket } from './escpos.ts';
import { logger } from './logger.ts';

/* ── Tipos ──────────────────────────────────────────────────── */

interface HubMenuProduct {
  id: string;
  category_id: string | null;
  name: string;
  description: string | null;
  price: number;
  options: OptionGroup[] | null;
}
interface OptionGroup {
  id: string;
  name: string;
  type: 'single' | 'multi';
  required?: boolean;
  max?: number;
  choices: { id: string; name: string; priceDelta?: number }[];
}
interface HubMenu {
  restaurantId: string;
  restaurantName: string;
  currencySymbol: string;
  fetchedAt: string;
  categories: { id: string; name: string }[];
  products: HubMenuProduct[];
}

interface HubOrder {
  clientId: string;
  folio: string;
  tableNumber: number;
  guestName: string;
  notes: string | null;
  items: {
    productId: string;
    name: string;
    price: number;       // solo informativo local; la nube recalcula
    quantity: number;
    optionLabels: string[];
    picked: { groupId: string; choiceId: string }[];
  }[];
  total: number;
  createdAt: string;
  status: 'queued' | 'synced' | 'rejected';
  orderNumber: string | null;
  error: string | null;
  /** KDS-lite: marcado como listo en cocina. */
  done: boolean;
}

interface HubState {
  menu: HubMenu | null;
  orders: HubOrder[];
  folioCounter: number;
}

/* ── Estado persistente (hub-data.json junto a la config) ───── */

function dataPath(): string {
  const candidates = [
    join(dirname(process.execPath), 'config.local.json'),
    join(process.cwd(), 'config.local.json'),
    join(process.cwd(), 'agente-impresion', 'config.local.json'),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return join(dirname(c), 'hub-data.json');
  }
  return join(process.cwd(), 'hub-data.json');
}

function loadState(): HubState {
  try {
    const raw = readFileSync(dataPath(), 'utf8');
    const s = JSON.parse(raw) as HubState;
    if (s && Array.isArray(s.orders)) return { menu: s.menu ?? null, orders: s.orders, folioCounter: s.folioCounter || 0 };
  } catch { /* primera vez o archivo dañado */ }
  return { menu: null, orders: [], folioCounter: 0 };
}

function saveState(state: HubState): void {
  try {
    // Cap del historial: los sincronizados viejos no crecen sin límite.
    if (state.orders.length > 200) {
      const pending = state.orders.filter((o) => o.status === 'queued');
      const rest = state.orders.filter((o) => o.status !== 'queued').slice(-150);
      state.orders = [...rest, ...pending];
    }
    writeFileSync(dataPath(), JSON.stringify(state));
  } catch (e) {
    logger.warn('Hub: no se pudo guardar hub-data.json:', (e as Error).message);
  }
}

/* ── Info pública del hub (la lee /health del puerto 47100) ─── */

const hubInfo: { url: string | null; queued: number } = { url: null, queued: 0 };
export function getHubInfo(): { url: string | null; queued: number } {
  return hubInfo;
}

function lanIp(): string | null {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] ?? []) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return null;
}

/* ── Utilidades HTTP ────────────────────────────────────────── */

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (c) => { body += c; if (body.length > 512_000) req.destroy(); });
    req.on('end', () => resolve(body));
  });
}

function json(res: http.ServerResponse, status: number, data: unknown): void {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(data));
}

function html(res: http.ServerResponse, body: string): void {
  res.setHeader('content-type', 'text/html; charset=utf-8');
  res.end(body);
}

/* ── Núcleo ─────────────────────────────────────────────────── */

export async function startHub(): Promise<void> {
  const hubCfg: HubConfig = loadHubConfig();
  if (!hubCfg.enabled) {
    logger.info('Hub de emergencia desactivado por configuración.');
    return;
  }

  let cloudCfg: AgentConfig | null = null;
  try { cloudCfg = loadConfig(); } catch { /* sin nube: hub sigue sirviendo en LAN */ }

  const state = loadState();
  let lastSyncAt: string | null = null;
  let cloudOk = false;
  const updateQueued = () => { hubInfo.queued = state.orders.filter((o) => o.status === 'queued').length; };
  updateQueued();

  /* Snapshot del menú (cada 5 min con internet). */
  async function refreshMenu(): Promise<void> {
    if (!cloudCfg) return;
    try {
      const res = await fetch(`${cloudCfg.apiUrl}/api/agent/menu`, {
        headers: { authorization: `Bearer ${cloudCfg.token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      state.menu = (await res.json()) as HubMenu;
      saveState(state);
      cloudOk = true;
    } catch (e) {
      cloudOk = false;
      logger.warn('Hub: sin acceso a la nube para refrescar menú:', (e as Error).message);
    }
  }

  /* Sube la cola cuando hay internet (idempotente por client_id). */
  async function syncQueue(): Promise<void> {
    if (!cloudCfg) return;
    const pending = state.orders.filter((o) => o.status === 'queued').slice(0, 10);
    if (pending.length === 0) return;
    try {
      const res = await fetch(`${cloudCfg.apiUrl}/api/agent/offline-orders`, {
        method: 'POST',
        headers: { authorization: `Bearer ${cloudCfg.token}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          orders: pending.map((o) => ({
            clientId: o.clientId,
            tableNumber: o.tableNumber,
            guestName: o.guestName,
            notes: o.notes ?? undefined,
            createdAt: o.createdAt,
            items: o.items.map((i) => ({ productId: i.productId, quantity: i.quantity, options: i.picked })),
          })),
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { results } = (await res.json()) as { results: { clientId: string; ok: boolean; orderNumber?: string; error?: string }[] };
      for (const r of results ?? []) {
        const order = state.orders.find((o) => o.clientId === r.clientId);
        if (!order) continue;
        if (r.ok) {
          order.status = 'synced';
          order.orderNumber = r.orderNumber ?? null;
          order.error = null;
          logger.info(`Hub: pedido ${order.folio} sincronizado como ${order.orderNumber}.`);
        } else {
          order.status = 'rejected';
          order.error = r.error ?? 'Rechazado por el servidor.';
          logger.warn(`Hub: pedido ${order.folio} rechazado: ${order.error}`);
        }
      }
      lastSyncAt = new Date().toISOString();
      cloudOk = true;
      saveState(state);
      updateQueued();
    } catch (e) {
      cloudOk = false;
      logger.warn('Hub: aún sin nube para sincronizar cola:', (e as Error).message);
    }
  }

  /* Alta de pedido en modo emergencia. */
  async function createHubOrder(raw: string): Promise<{ status: number; body: unknown }> {
    let input: { tableNumber?: unknown; guestName?: unknown; notes?: unknown; items?: unknown; clientId?: unknown };
    try { input = JSON.parse(raw || '{}'); } catch { return { status: 400, body: { error: 'JSON inválido.' } }; }

    if (!state.menu) return { status: 503, body: { error: 'El hub aún no tiene el menú (necesita haber tenido internet al menos una vez).' } };

    const tableNumber = Math.trunc(Number(input.tableNumber));
    if (!tableNumber || tableNumber < 1) return { status: 400, body: { error: 'Indica la mesa.' } };

    const rawItems = Array.isArray(input.items) ? input.items as { productId?: unknown; quantity?: unknown; picked?: unknown }[] : [];
    if (rawItems.length === 0) return { status: 400, body: { error: 'El pedido está vacío.' } };

    const byId = new Map(state.menu.products.map((p) => [p.id, p]));
    const items: HubOrder['items'] = [];
    for (const it of rawItems.slice(0, 50)) {
      const product = byId.get(String(it.productId));
      const qty = Math.trunc(Number(it.quantity));
      if (!product || !qty || qty < 1 || qty > 99) return { status: 400, body: { error: 'Producto inválido en el pedido.' } };

      const picked = Array.isArray(it.picked)
        ? (it.picked as { groupId?: unknown; choiceId?: unknown }[])
            .map((p) => ({ groupId: String(p.groupId ?? ''), choiceId: String(p.choiceId ?? '') }))
            .filter((p) => p.groupId && p.choiceId)
        : [];

      // Precio local informativo (la nube recalcula al sincronizar).
      let price = Number(product.price) || 0;
      const optionLabels: string[] = [];
      for (const pick of picked) {
        const group = (product.options ?? []).find((g) => g.id === pick.groupId);
        const choice = group?.choices.find((c) => c.id === pick.choiceId);
        if (!group || !choice) return { status: 400, body: { error: `Opciones inválidas en "${product.name}".` } };
        const delta = Number(choice.priceDelta) || 0;
        price += delta;
        optionLabels.push(`${group.name}: ${choice.name}${delta ? ` (+${delta})` : ''}`);
      }
      items.push({ productId: product.id, name: product.name, price, quantity: qty, optionLabels, picked });
    }

    state.folioCounter += 1;
    const folio = `E-${String(state.folioCounter).padStart(4, '0')}`;
    const order: HubOrder = {
      clientId: typeof input.clientId === 'string' && /^[0-9a-f-]{36}$/i.test(input.clientId) ? input.clientId : randomUUID(),
      folio,
      tableNumber,
      guestName: String(input.guestName ?? '').trim().slice(0, 80) || `Mesa ${tableNumber}`,
      notes: String(input.notes ?? '').trim().slice(0, 400) || null,
      items,
      total: items.reduce((s, i) => s + i.price * i.quantity, 0),
      createdAt: new Date().toISOString(),
      status: 'queued',
      orderNumber: null,
      error: null,
      done: false,
    };
    state.orders.push(order);
    saveState(state);
    updateQueued();
    logger.info(`Hub: pedido ${folio} (mesa ${tableNumber}) en cola local.`);

    // Comanda a cocina al instante (si hay impresora configurada). Best-effort.
    if (hubCfg.kitchenTarget) {
      try {
        await printRaw(parseTarget(hubCfg.kitchenTarget), buildComandaTicket({
          folio,
          tableNumber,
          guestName: order.guestName,
          notes: order.notes,
          items: items.map((i) => ({ name: i.name, quantity: i.quantity, options: i.optionLabels })),
          createdAt: new Date(),
        }));
      } catch (e) {
        logger.warn('Hub: no se pudo imprimir la comanda:', (e as Error).message);
      }
    }

    // Intento de sincronización inmediato (quizá solo se cayó el WiFi un momento).
    void syncQueue();

    return { status: 200, body: { ok: true, folio, total: order.total } };
  }

  /* ── Servidor LAN ─────────────────────────────────────────── */
  const server = http.createServer((req, res) => {
    const url = (req.url ?? '/').split('?')[0];

    if (req.method === 'GET' && url === '/') return html(res, UI_HTML);
    if (req.method === 'GET' && url === '/cocina') return html(res, KDS_HTML);

    if (req.method === 'GET' && url === '/api/health') {
      return json(res, 200, {
        ok: true, hub: true,
        restaurantName: state.menu?.restaurantName ?? null,
        menuFetchedAt: state.menu?.fetchedAt ?? null,
        queued: state.orders.filter((o) => o.status === 'queued').length,
        cloudOk, lastSyncAt,
      });
    }
    if (req.method === 'GET' && url === '/api/menu') {
      return state.menu ? json(res, 200, state.menu) : json(res, 404, { error: 'Sin snapshot del menú todavía.' });
    }
    if (req.method === 'GET' && url === '/api/orders') {
      return json(res, 200, { orders: [...state.orders].reverse().slice(0, 100) });
    }
    if (req.method === 'POST' && url === '/api/orders') {
      void readBody(req).then(async (raw) => {
        const { status, body } = await createHubOrder(raw);
        json(res, status, body);
      });
      return;
    }
    if (req.method === 'POST' && url === '/api/orders/done') {
      void readBody(req).then((raw) => {
        try {
          const { clientId, done } = JSON.parse(raw || '{}') as { clientId?: string; done?: boolean };
          const order = state.orders.find((o) => o.clientId === clientId);
          if (!order) return json(res, 404, { error: 'Pedido no encontrado.' });
          order.done = done !== false;
          saveState(state);
          json(res, 200, { ok: true });
        } catch {
          json(res, 400, { error: 'JSON inválido.' });
        }
      });
      return;
    }

    res.statusCode = 404;
    res.end();
  });

  server.once('error', (e: NodeJS.ErrnoException) => {
    logger.warn(`Hub: no se pudo abrir el puerto ${hubCfg.port}:`, e.message);
  });

  server.listen(hubCfg.port, '0.0.0.0', () => {
    const ip = lanIp();
    hubInfo.url = ip ? `http://${ip}:${hubCfg.port}` : `http://localhost:${hubCfg.port}`;
    logger.info(`Hub de emergencia listo: ${hubInfo.url}  (cocina: ${hubInfo.url}/cocina)`);
  });

  // Ciclos: menú cada 5 min; cola cada 20 s (solo hace red si hay pendientes).
  void refreshMenu();
  setInterval(() => void refreshMenu(), 5 * 60_000);
  setInterval(() => void syncQueue(), 20_000);
}

/* ════════════════════════════════════════════════════════════
   MINI-UI DEL MESERO (vanilla, un solo archivo, móvil primero)
   ════════════════════════════════════════════════════════════ */

const BASE_CSS = `
*{box-sizing:border-box;margin:0;padding:0}
body{background:#0b0b0c;color:#f5f3ef;font-family:system-ui,sans-serif;min-height:100svh}
button{font-family:inherit;cursor:pointer;border:none}
.top{position:sticky;top:0;background:#141416;padding:12px 16px;display:flex;align-items:center;gap:10px;border-bottom:1px solid rgba(255,255,255,.1);z-index:10}
.badge{font-size:11px;font-weight:700;padding:4px 10px;border-radius:99px;background:#b45309;color:#fff}
.badge.ok{background:#166534}
.wrap{max-width:720px;margin:0 auto;padding:14px 14px 120px}
.chip{display:inline-block;padding:8px 14px;border-radius:99px;background:rgba(255,255,255,.07);color:#f5f3ef;font-size:13px;font-weight:600;margin:0 6px 8px 0}
.chip.on{background:#D97757;color:#fff}
.card{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:14px;padding:12px 14px;margin-bottom:10px;display:flex;align-items:center;gap:10px}
.grow{flex:1;min-width:0}
.name{font-weight:700;font-size:14.5px}
.price{color:#D97757;font-weight:700;font-size:13.5px}
.qty{display:flex;align-items:center;gap:10px}
.qty button{width:34px;height:34px;border-radius:10px;background:rgba(255,255,255,.1);color:#fff;font-size:18px;font-weight:700}
.bar{position:fixed;bottom:0;left:0;right:0;background:#141416;border-top:1px solid rgba(255,255,255,.12);padding:12px 16px calc(12px + env(safe-area-inset-bottom,0px))}
.send{width:100%;padding:14px;border-radius:14px;background:#D97757;color:#fff;font-size:15px;font-weight:800}
.send:disabled{opacity:.5}
input,textarea{width:100%;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.14);border-radius:12px;padding:11px 13px;color:#f5f3ef;font-size:15px;outline:none;margin-bottom:10px}
.muted{color:rgba(245,243,239,.55);font-size:12.5px}
h2{font-size:16px;margin:14px 0 10px}
.modal{position:fixed;inset:0;background:rgba(0,0,0,.65);display:flex;align-items:flex-end;justify-content:center;z-index:50}
.sheet{background:#1a1a1d;border-radius:18px 18px 0 0;padding:18px 16px calc(18px + env(safe-area-inset-bottom,0px));width:100%;max-width:720px;max-height:80svh;overflow-y:auto}
.opt{display:flex;align-items:center;gap:10px;padding:10px 4px;border-bottom:1px solid rgba(255,255,255,.07);font-size:14.5px}
`;

const UI_HTML = `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Leogin · Modo emergencia</title><style>${BASE_CSS}</style></head><body>
<div class="top"><div class="grow"><div style="font-weight:800" id="rname">Modo emergencia</div>
<div class="muted" id="status">Cargando…</div></div><span class="badge" id="badge">SIN NUBE</span></div>
<div class="wrap">
  <h2>1 · Mesa</h2>
  <input id="mesa" inputmode="numeric" placeholder="Número de mesa">
  <input id="guest" placeholder="Nombre (opcional)">
  <h2>2 · Menú</h2>
  <div id="cats"></div>
  <div id="prods"></div>
  <h2>3 · Pedido</h2>
  <div id="cart"><p class="muted">Aún no hay productos.</p></div>
  <textarea id="notes" rows="2" placeholder="Notas para cocina (opcional)"></textarea>
</div>
<div class="bar"><button class="send" id="send">Enviar a cocina</button>
<div class="muted" id="msg" style="margin-top:8px;text-align:center"></div></div>
<div id="modal"></div>
<script>
let MENU=null, cat=null, cart=[];
const $=id=>document.getElementById(id);
const money=n=>((MENU&&MENU.currencySymbol)||'Q')+Number(n).toFixed(2);
async function boot(){
  try{
    const h=await (await fetch('/api/health')).json();
    $('badge').textContent=h.cloudOk?'NUBE OK':'SIN NUBE';
    $('badge').className='badge'+(h.cloudOk?' ok':'');
    if(h.restaurantName)$('rname').textContent=h.restaurantName+' · emergencia';
    const r=await fetch('/api/menu');
    if(!r.ok){$('status').textContent='El hub aún no tiene el menú descargado.';return;}
    MENU=await r.json();
    $('status').textContent='Menú del '+new Date(MENU.fetchedAt).toLocaleString('es-GT');
    cat=MENU.categories[0]?MENU.categories[0].id:null;
    renderCats();renderProds();
  }catch(e){$('status').textContent='Error cargando el hub.';}
}
function renderCats(){
  $('cats').innerHTML=MENU.categories.map(c=>'<span class="chip'+(c.id===cat?' on':'')+'" onclick="setCat(\\''+c.id+'\\')">'+esc(c.name)+'</span>').join('');
}
function setCat(id){cat=id;renderCats();renderProds();}
function esc(s){return String(s??'').replace(/[<>&"]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]));}
function renderProds(){
  const list=MENU.products.filter(p=>!cat||p.category_id===cat);
  $('prods').innerHTML=list.map(p=>{
    const q=cart.filter(l=>l.productId===p.id).reduce((s,l)=>s+l.quantity,0);
    return '<div class="card"><div class="grow"><div class="name">'+esc(p.name)+'</div>'+
      '<div class="price">'+money(p.price)+'</div></div>'+
      (q>0?'<div class="qty"><button onclick="dec(\\''+p.id+'\\')">−</button><b>'+q+'</b>':'<div class="qty">')+
      '<button style="background:#D97757" onclick="add(\\''+p.id+'\\')">+</button></div></div>';
  }).join('')||'<p class="muted">Sin productos en esta categoría.</p>';
}
function add(pid){
  const p=MENU.products.find(x=>x.id===pid);
  const groups=(p.options||[]);
  if(groups.length===0){push(p,[],[]);return;}
  openOptions(p);
}
function push(p,picked,labels){
  const key=p.id+'|'+picked.map(x=>x.choiceId).sort().join(',');
  const found=cart.find(l=>l.key===key);
  let price=Number(p.price)||0;
  picked.forEach(pk=>{const g=(p.options||[]).find(g=>g.id===pk.groupId);const c=g&&g.choices.find(c=>c.id===pk.choiceId);if(c)price+=Number(c.priceDelta)||0;});
  if(found)found.quantity++;else cart.push({key,productId:p.id,name:p.name,price,quantity:1,picked,labels});
  renderProds();renderCart();
}
function dec(pid){
  const idx=cart.map(l=>l.productId).lastIndexOf(pid);
  if(idx<0)return;
  if(cart[idx].quantity>1)cart[idx].quantity--;else cart.splice(idx,1);
  renderProds();renderCart();
}
function renderCart(){
  if(cart.length===0){$('cart').innerHTML='<p class="muted">Aún no hay productos.</p>';return;}
  const total=cart.reduce((s,l)=>s+l.price*l.quantity,0);
  $('cart').innerHTML=cart.map((l,i)=>'<div class="card"><div class="grow"><div class="name">'+l.quantity+' × '+esc(l.name)+'</div>'+
    (l.labels.length?'<div class="muted">'+l.labels.map(esc).join(' · ')+'</div>':'')+'</div>'+
    '<div class="price">'+money(l.price*l.quantity)+'</div>'+
    '<button class="chip" onclick="rm('+i+')">✕</button></div>').join('')+
    '<div class="card"><div class="grow name">Total</div><div class="price">'+money(total)+'</div></div>';
}
function rm(i){cart.splice(i,1);renderProds();renderCart();}
function openOptions(p){
  const groups=p.options||[];
  $('modal').innerHTML='<div class="modal" onclick="if(event.target===this)closeModal()"><div class="sheet">'+
    '<div class="name" style="font-size:17px;margin-bottom:4px">'+esc(p.name)+'</div>'+
    '<div class="muted" style="margin-bottom:10px">'+money(p.price)+'</div>'+
    groups.map((g,gi)=>'<div><b style="font-size:13.5px">'+esc(g.name)+(g.required?' *':'')+'</b>'+
      g.choices.map(c=>'<label class="opt"><input type="'+(g.type==='single'?'radio':'checkbox')+'" name="g'+gi+'" value="'+c.id+'" data-group="'+g.id+'">'+
      '<span class="grow">'+esc(c.name)+'</span><span class="muted">'+(c.priceDelta?'+'+money(c.priceDelta):'')+'</span></label>').join('')+'</div>').join('')+
    '<button class="send" style="margin-top:14px" onclick="confirmOptions(\\''+p.id+'\\')">Agregar</button></div></div>';
}
function closeModal(){$('modal').innerHTML='';}
function confirmOptions(pid){
  const p=MENU.products.find(x=>x.id===pid);
  const groups=p.options||[];
  const picked=[],labels=[];
  for(const g of groups){
    const sel=[...document.querySelectorAll('input[data-group="'+g.id+'"]:checked')];
    if(g.required&&g.type==='single'&&sel.length===0){alert('Elige '+g.name);return;}
    if(g.max&&sel.length>g.max){alert('Máximo '+g.max+' en '+g.name);return;}
    for(const s of sel){const c=g.choices.find(c=>c.id===s.value);picked.push({groupId:g.id,choiceId:s.value});labels.push(g.name+': '+(c?c.name:''));}
  }
  closeModal();push(p,picked,labels);
}
$('send').onclick=async()=>{
  const mesa=parseInt($('mesa').value,10);
  if(!mesa||mesa<1){$('msg').textContent='Indica la mesa.';return;}
  if(cart.length===0){$('msg').textContent='Agrega productos primero.';return;}
  $('send').disabled=true;$('msg').textContent='Enviando…';
  try{
    const r=await fetch('/api/orders',{method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({clientId:crypto.randomUUID(),tableNumber:mesa,guestName:$('guest').value,notes:$('notes').value,
        items:cart.map(l=>({productId:l.productId,quantity:l.quantity,picked:l.picked}))})});
    const d=await r.json();
    if(!r.ok){$('msg').textContent=d.error||'Error';$('send').disabled=false;return;}
    cart=[];renderCart();renderProds();$('notes').value='';
    $('msg').textContent='✓ '+d.folio+' enviado a cocina ('+money(d.total)+'). Se sincroniza al volver el internet.';
    $('send').disabled=false;
  }catch(e){$('msg').textContent='Error de red con el hub.';$('send').disabled=false;}
};
boot();
</script></body></html>`;

/* ════════════════════════════════════════════════════════════
   KDS-LITE (pantalla de cocina en LAN) — /cocina
   ════════════════════════════════════════════════════════════ */

const KDS_HTML = `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Cocina · Modo emergencia</title><style>${BASE_CSS}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px}
.ticket{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.12);border-radius:14px;padding:14px;display:flex;flex-direction:column;gap:8px}
.ticket.done{opacity:.45}
.mesa{font-size:22px;font-weight:900}
.item{font-size:15px;font-weight:700}
.small{font-size:12px;color:rgba(245,243,239,.6)}
.listo{padding:11px;border-radius:11px;background:#166534;color:#fff;font-weight:800;font-size:14px}
</style></head><body>
<div class="top"><div class="grow"><div style="font-weight:800">Cocina · Modo emergencia</div>
<div class="muted" id="status"></div></div><span class="badge" id="badge">…</span></div>
<div class="wrap"><div class="grid" id="grid"></div></div>
<script>
const $=id=>document.getElementById(id);
function esc(s){return String(s??'').replace(/[<>&"]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]));}
async function tick(){
  try{
    const h=await (await fetch('/api/health')).json();
    $('badge').textContent=h.cloudOk?'NUBE OK':'SIN NUBE';
    $('badge').className='badge'+(h.cloudOk?' ok':'');
    $('status').textContent=(h.queued||0)+' por sincronizar';
    const d=await (await fetch('/api/orders')).json();
    $('grid').innerHTML=(d.orders||[]).map(o=>'<div class="ticket'+(o.done?' done':'')+'">'+
      '<div style="display:flex;justify-content:space-between;align-items:center"><span class="mesa">Mesa '+o.tableNumber+'</span>'+
      '<span class="small">'+esc(o.folio)+(o.orderNumber?' → '+esc(o.orderNumber):'')+'</span></div>'+
      '<div class="small">'+new Date(o.createdAt).toLocaleTimeString('es-GT',{hour:'2-digit',minute:'2-digit'})+' · '+esc(o.guestName)+
      (o.status==='queued'?' · <b style="color:#fbbf24">en cola</b>':o.status==='rejected'?' · <b style="color:#f87171">rechazado</b>':' · sincronizado')+'</div>'+
      o.items.map(i=>'<div class="item">'+i.quantity+' × '+esc(i.name)+
        (i.optionLabels.length?'<div class="small">'+i.optionLabels.map(esc).join(' · ')+'</div>':'')+'</div>').join('')+
      (o.notes?'<div class="small">NOTA: '+esc(o.notes)+'</div>':'')+
      '<button class="listo" onclick="done(\\''+o.clientId+'\\','+(o.done?'false':'true')+')">'+(o.done?'Reabrir':'Marcar listo')+'</button>'+
    '</div>').join('')||'<p class="muted">Sin comandas.</p>';
  }catch(e){$('status').textContent='Sin conexión con el hub';}
}
async function done(id,v){await fetch('/api/orders/done',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({clientId:id,done:v==='true'||v===true})});tick();}
tick();setInterval(tick,5000);
</script></body></html>`;
