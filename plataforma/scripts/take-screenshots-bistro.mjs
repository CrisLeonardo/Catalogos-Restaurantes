/**
 * take-screenshots-bistro.mjs
 * Retoma TODAS las capturas del centro de ayuda usando Bistró La Plaza.
 * Así ninguna captura enseña el restaurante de pruebas, y descarta el tour de bienvenida en
 * cada navegación para que no aparezca en ninguna imagen.
 *
 * Uso: node scripts/take-screenshots-bistro.mjs
 * Requiere: npm run dev corriendo en otra terminal (puerto 3000)
 */

import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SS_DIR = path.join(__dirname, '..', 'public', 'tutorial', 'screenshots');
const BASE   = 'http://bistro-la-plaza.localhost:3000';
const EMAIL  = 'owner@bistroplaza.com';
const PASS   = 'Demo1234!';

const delay = ms => new Promise(r => setTimeout(r, ms));
let saved = 0;

async function shot(page, filename) {
  const dest = path.join(SS_DIR, filename);
  await page.screenshot({ path: dest, clip: { x: 0, y: 0, width: 1280, height: 800 } });
  console.log(`  ✅  ${filename}`);
  saved++;
}

/** Descarta el tour si está visible y borra el flag del localStorage */
async function dismissTour(page) {
  await page.evaluate(() => localStorage.setItem('leogin_tour_completed', 'true'));
  try {
    const skip = page.locator('button').filter({ hasText: /omitir|saltar|skip/i }).first();
    if (await skip.isVisible({ timeout: 400 })) { await skip.click(); await delay(250); }
  } catch {}
  await page.keyboard.press('Escape');
  await delay(200);
}

/** Navega, espera carga y descarta el tour */
async function goto(page, p) {
  await page.goto(`${BASE}${p}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await delay(1400);
  await dismissTour(page);
}

/** Intenta expandir todos los grupos del sidebar */
async function expandSidebar(page) {
  for (const texto of ['Operación', 'Negocio', 'Cuenta']) {
    try {
      const btn = page.locator('button').filter({ hasText: new RegExp(texto, 'i') }).first();
      if (await btn.isVisible({ timeout: 600 })) { await btn.click(); await delay(300); }
    } catch {}
  }
}

async function run() {
  fs.mkdirSync(SS_DIR, { recursive: true });

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-web-security'],
  });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  page.on('console', () => {});
  page.on('pageerror', () => {});

  // ── PRIMEROS PASOS – paso1: captura de la pantalla de login ─────────
  console.log('\n[ primeros-pasos ]');
  await page.goto(`${BASE}/admin/login`, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await delay(1200);
  await shot(page, 'primeros-pasos-paso1.png');   // pantalla de login

  // ── LOGIN ────────────────────────────────────────────────────────────
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASS);
  await page.click('button[type="submit"]');
  try { await page.waitForURL(`${BASE}/admin`, { timeout: 12000 }); } catch {}
  await page.waitForLoadState('domcontentloaded');
  await delay(1500);
  await dismissTour(page);

  // ── PRIMEROS PASOS – paso2: dashboard con sidebar ────────────────────
  await expandSidebar(page);
  await delay(400);
  await shot(page, 'primeros-pasos-paso2.png');   // dashboard + sidebar visible

  // paso3: sidebar expandido mostrando los tres grupos
  await expandSidebar(page);
  await delay(300);
  await shot(page, 'primeros-pasos-paso3.png');   // sidebar con grupos Operación/Negocio/Cuenta

  // paso4: badge del plan en la parte inferior del sidebar
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await delay(400);
  await shot(page, 'primeros-pasos-paso4.png');   // badge del plan visible

  // ── PERFIL ───────────────────────────────────────────────────────────
  console.log('\n[ perfil ]');
  await goto(page, '/admin/perfil');
  await shot(page, 'perfil-paso1.png');           // formulario información básica

  await page.evaluate(() => window.scrollBy(0, 350));
  await delay(400);
  await shot(page, 'perfil-paso2.png');           // sección horarios

  await page.evaluate(() => window.scrollBy(0, 350));
  await delay(400);
  await shot(page, 'perfil-paso3.png');           // campo WhatsApp

  await page.evaluate(() => window.scrollBy(0, 400));
  await delay(400);
  await shot(page, 'perfil-paso4.png');           // zona de entrega

  // ── CATÁLOGO ─────────────────────────────────────────────────────────
  console.log('\n[ catalogo ]');
  await goto(page, '/admin/menu');
  await shot(page, 'catalogo-paso1.png');         // vista del catálogo con productos

  // Intenta abrir formulario de nuevo producto
  const btnNuevo = page.locator('button, a').filter({ hasText: /nuevo producto/i }).first();
  const tieneNuevo = await btnNuevo.isVisible({ timeout: 3000 }).catch(() => false);
  if (tieneNuevo) {
    await btnNuevo.click();
    await delay(1200);
    await shot(page, 'catalogo-paso2.png');       // formulario nuevo producto
    await shot(page, 'catalogo-paso3.png');       // área de imagen (misma vista arriba)
    await page.evaluate(() => window.scrollBy(0, 400));
    await delay(400);
    await shot(page, 'catalogo-paso4.png');       // sección de opciones
    await page.goBack(); await delay(1000);
    await dismissTour(page);
  } else {
    // Sin botón de nuevo, usa la misma vista del catálogo
    await shot(page, 'catalogo-paso2.png');
    await shot(page, 'catalogo-paso3.png');
    await shot(page, 'catalogo-paso4.png');
  }

  await goto(page, '/admin/menu');
  await shot(page, 'catalogo-paso5.png');         // toggles de disponibilidad
  await shot(page, 'catalogo-paso6.png');         // íconos de arrastre

  // ── CATEGORÍAS ───────────────────────────────────────────────────────
  console.log('\n[ categorias ]');
  await goto(page, '/admin/categorias');
  await shot(page, 'categorias-paso1.png');       // lista de categorías

  const btnNuevaCat = page.locator('button, a').filter({ hasText: /nueva categor/i }).first();
  if (await btnNuevaCat.isVisible({ timeout: 3000 }).catch(() => false)) {
    await btnNuevaCat.click();
    await delay(1000);
    await shot(page, 'categorias-paso2.png');     // modal nueva categoría
    await page.keyboard.press('Escape');
    await delay(400);
  } else {
    await shot(page, 'categorias-paso2.png');
  }
  await shot(page, 'categorias-paso3.png');       // lista con drag handles
  await shot(page, 'categorias-paso4.png');       // selección de categoría en producto

  // ── PERSONALIZAR ─────────────────────────────────────────────────────
  console.log('\n[ personalizar ]');
  await goto(page, '/admin/personalizacion');
  await delay(1500);
  await shot(page, 'personalizar-paso1.png');     // panel con preview

  await page.evaluate(() => window.scrollBy(0, 200));
  await delay(400);
  await shot(page, 'personalizar-paso2.png');     // sección logo

  await page.evaluate(() => window.scrollBy(0, 300));
  await delay(400);
  await shot(page, 'personalizar-paso3.png');     // selector de color

  await page.evaluate(() => window.scrollBy(0, 300));
  await delay(400);
  await shot(page, 'personalizar-paso4.png');     // modo claro/oscuro

  await page.evaluate(() => window.scrollBy(0, 300));
  await delay(400);
  await shot(page, 'personalizar-paso5.png');     // tipografía

  await page.evaluate(() => window.scrollTo(0, 0));
  await delay(400);
  await shot(page, 'personalizar-paso6.png');     // botón guardar visible

  // ── QR ───────────────────────────────────────────────────────────────
  console.log('\n[ qr ]');
  await goto(page, '/admin/qr');
  await shot(page, 'qr-paso1.png');              // página QR con el código y enlace

  await page.evaluate(() => window.scrollBy(0, 200));
  await delay(400);
  await shot(page, 'qr-paso2.png');              // botón de descarga PNG

  await page.evaluate(() => window.scrollTo(0, 0));
  await delay(300);
  await shot(page, 'qr-paso3.png');              // QR listo para compartir

  await page.evaluate(() => window.scrollBy(0, 400));
  await delay(300);
  await shot(page, 'qr-paso4.png');              // información de uso / pie de página

  // ── MÉTRICAS ─────────────────────────────────────────────────────────
  console.log('\n[ metricas ]');
  await goto(page, '/admin/metricas');
  await shot(page, 'metricas-paso1.png');         // panel de visitas

  await page.evaluate(() => window.scrollBy(0, 300));
  await delay(400);
  await shot(page, 'metricas-paso2.png');         // selector de período

  await page.evaluate(() => window.scrollBy(0, 400));
  await delay(400);
  await shot(page, 'metricas-paso3.png');         // productos más vistos

  // ── PEDIDOS (configuración) ───────────────────────────────────────────
  console.log('\n[ pedidos ]');
  await goto(page, '/admin/pedidos');
  await shot(page, 'pedidos-paso1.png');
  await page.evaluate(() => window.scrollBy(0, 200));
  await delay(300);
  await shot(page, 'pedidos-paso2.png');          // tipos de orden
  await page.evaluate(() => window.scrollBy(0, 300));
  await delay(300);
  await shot(page, 'pedidos-paso3.png');          // tarifa de envío
  await page.evaluate(() => window.scrollTo(0, 0));
  await delay(300);
  await shot(page, 'pedidos-paso4.png');          // pausar pedidos
  await shot(page, 'pedidos-paso5.png');          // notificaciones

  // ── PANEL DE PEDIDOS EN TIEMPO REAL ──────────────────────────────────
  console.log('\n[ panel-pedidos ]');
  await goto(page, '/admin/pedidos');
  await shot(page, 'panel-pedidos-paso1.png');    // vista en tiempo real

  await page.evaluate(() => window.scrollBy(0, 300));
  await delay(300);
  await shot(page, 'panel-pedidos-paso2.png');    // avanzar estado
  await shot(page, 'panel-pedidos-paso3.png');    // detalle del pedido
  await shot(page, 'panel-pedidos-paso4.png');    // imprimir recibo

  // Intenta clic en tab historial
  const histTab = page.locator('[role="tab"], button').filter({ hasText: /historial/i }).first();
  if (await histTab.isVisible({ timeout: 2000 }).catch(() => false)) {
    await histTab.click(); await delay(500);
  }
  await shot(page, 'panel-pedidos-paso5.png');    // historial

  // ── INVENTARIO ───────────────────────────────────────────────────────
  console.log('\n[ inventario ]');
  await goto(page, '/admin/inventario');
  await shot(page, 'inventario-paso1.png');       // toggle inventario en producto
  await shot(page, 'inventario-paso2.png');       // panel de inventario

  await page.evaluate(() => window.scrollBy(0, 200));
  await delay(300);
  await shot(page, 'inventario-paso3.png');       // reponer stock

  await page.evaluate(() => window.scrollBy(0, 300));
  await delay(300);
  await shot(page, 'inventario-paso4.png');       // alerta de stock bajo

  // ── ANALÍTICA ────────────────────────────────────────────────────────
  console.log('\n[ analitica ]');
  await goto(page, '/admin/analitica');
  await shot(page, 'analitica-paso1.png');        // horas pico

  const analiticaTextos = [/más vendidos|vendidos/i, /cancelac/i, /tiemp/i];
  for (let i = 0; i < analiticaTextos.length; i++) {
    const tab = page.locator('[role="tab"], button, a').filter({ hasText: analiticaTextos[i] }).first();
    if (await tab.isVisible({ timeout: 2000 }).catch(() => false)) {
      await tab.click(); await delay(500);
    }
    await shot(page, `analitica-paso${i + 2}.png`);
  }

  // ── FINANZAS ─────────────────────────────────────────────────────────
  console.log('\n[ finanzas ]');
  await goto(page, '/admin/finanzas');
  await shot(page, 'finanzas-paso1.png');         // resumen de ventas

  await page.evaluate(() => window.scrollBy(0, 300));
  await delay(300);
  await shot(page, 'finanzas-paso2.png');         // corte de caja

  await page.evaluate(() => window.scrollTo(0, 0));
  await delay(300);
  await shot(page, 'finanzas-paso3.png');         // selector de período
  await shot(page, 'finanzas-paso4.png');         // botón exportar

  await page.evaluate(() => window.scrollBy(0, 500));
  await delay(300);
  await shot(page, 'finanzas-paso5.png');         // desglose por producto

  // ── CLIENTES ─────────────────────────────────────────────────────────
  console.log('\n[ clientes ]');
  await goto(page, '/admin/clientes');
  await shot(page, 'clientes-paso1.png');         // lista de clientes

  await page.evaluate(() => window.scrollBy(0, 200));
  await delay(300);
  await shot(page, 'clientes-paso2.png');         // historial de cliente

  await page.evaluate(() => window.scrollTo(0, 0));
  await delay(300);
  await shot(page, 'clientes-paso3.png');         // barra de búsqueda

  // ── PERSONAL ─────────────────────────────────────────────────────────
  console.log('\n[ personal ]');
  await goto(page, '/admin/personal');
  await shot(page, 'personal-paso1.png');         // lista de staff

  const btnStaff = page.locator('button').filter({ hasText: /nuevo staff/i }).first();
  if (await btnStaff.isVisible({ timeout: 2000 }).catch(() => false)) {
    await btnStaff.click(); await delay(1000);
    await shot(page, 'personal-paso2.png');       // formulario nuevo staff
    await page.keyboard.press('Escape'); await delay(400);
  } else {
    await shot(page, 'personal-paso2.png');
  }
  await shot(page, 'personal-paso3.png');         // permisos por sección

  await page.evaluate(() => window.scrollBy(0, 400)); await delay(300);
  await shot(page, 'personal-paso4.png');         // sección meseros
  await shot(page, 'personal-paso5.png');         // toggle activar/desactivar

  // ── COCINA (KDS) ─────────────────────────────────────────────────────
  console.log('\n[ cocina ]');
  await goto(page, '/admin/cocina');
  await shot(page, 'cocina-paso1.png');           // pantalla KDS
  await shot(page, 'cocina-paso2.png');           // tablet en cocina
  await shot(page, 'cocina-paso3.png');           // botones Comenzar / Marcar listo

  await page.evaluate(() => window.scrollBy(0, 300)); await delay(300);
  await shot(page, 'cocina-paso4.png');           // semáforo de tiempo
  await shot(page, 'cocina-paso5.png');           // configurar umbrales

  // ── MESEROS ──────────────────────────────────────────────────────────
  console.log('\n[ meseros ]');
  await goto(page, '/admin/mesero');
  await shot(page, 'meseros-paso1.png');          // panel táctil del mesero
  await shot(page, 'meseros-paso2.png');          // alta de mesero
  await shot(page, 'meseros-paso3.png');          // login del mesero
  await shot(page, 'meseros-paso4.png');          // toma de pedido
  await shot(page, 'meseros-paso5.png');          // tab mis pedidos

  // ── LEALTAD ──────────────────────────────────────────────────────────
  console.log('\n[ loyalty ]');
  await goto(page, '/admin/lealtad');
  await shot(page, 'loyalty-paso1.png');          // panel lealtad

  await page.evaluate(() => window.scrollBy(0, 300)); await delay(300);
  await shot(page, 'loyalty-paso2.png');          // configuración del programa
  await shot(page, 'loyalty-paso3.png');          // bono de bienvenida

  await page.evaluate(() => window.scrollBy(0, 300)); await delay(300);
  await shot(page, 'loyalty-paso4.png');          // checkout con puntos
  await shot(page, 'loyalty-paso5.png');          // saldos de clientes

  await page.evaluate(() => window.scrollBy(0, 300)); await delay(300);
  await shot(page, 'loyalty-paso6.png');          // ajuste manual de puntos

  // ── FEL ──────────────────────────────────────────────────────────────
  console.log('\n[ fel ]');
  await goto(page, '/admin/facturacion');
  await shot(page, 'fel-paso1.png');              // panel de facturación

  const tabConfig = page.locator('button, [role="tab"]').filter({ hasText: /configuraci/i }).first();
  if (await tabConfig.isVisible({ timeout: 1500 }).catch(() => false)) {
    await tabConfig.click(); await delay(800);
  }
  await shot(page, 'fel-paso2.png');              // formulario datos fiscales

  const tabEmitir = page.locator('button, [role="tab"]').filter({ hasText: /emitir/i }).first();
  if (await tabEmitir.isVisible({ timeout: 1500 }).catch(() => false)) {
    await tabEmitir.click(); await delay(800);
  }
  await shot(page, 'fel-paso3.png');              // formulario emisión de factura

  await page.evaluate(() => window.scrollBy(0, 300)); await delay(300);
  await shot(page, 'fel-paso4.png');              // factura libre

  const tabHist = page.locator('button, [role="tab"]').filter({ hasText: /historial/i }).first();
  if (await tabHist.isVisible({ timeout: 1500 }).catch(() => false)) {
    await tabHist.click(); await delay(800);
  }
  await shot(page, 'fel-paso5.png');              // historial de facturas
  await shot(page, 'fel-paso6.png');              // anular factura

  // ── PROVEEDORES ──────────────────────────────────────────────────────
  console.log('\n[ proveedores ]');
  await goto(page, '/admin/proveedores');
  await shot(page, 'proveedores-paso1.png');      // panel de proveedores

  const btnProveedor = page.locator('button').filter({ hasText: /nuevo proveedor/i }).first();
  if (await btnProveedor.isVisible({ timeout: 1500 }).catch(() => false)) {
    await btnProveedor.click(); await delay(1000);
    await shot(page, 'proveedores-paso2.png');    // formulario nuevo proveedor
    await page.keyboard.press('Escape'); await delay(400);
  } else {
    await shot(page, 'proveedores-paso2.png');
  }

  const tabOrdenes = page.locator('button, [role="tab"]').filter({ hasText: /órdenes|ordenes/i }).first();
  if (await tabOrdenes.isVisible({ timeout: 1500 }).catch(() => false)) {
    await tabOrdenes.click(); await delay(800);
  }
  await shot(page, 'proveedores-paso3.png');      // tabla de órdenes

  const btnOrden = page.locator('button').filter({ hasText: /nueva orden/i }).first();
  if (await btnOrden.isVisible({ timeout: 1500 }).catch(() => false)) {
    await btnOrden.click(); await delay(1000);
    await shot(page, 'proveedores-paso4.png');    // formulario nueva orden
    await page.keyboard.press('Escape'); await delay(400);
  } else {
    await shot(page, 'proveedores-paso4.png');
  }

  // ── ENCUESTAS ────────────────────────────────────────────────────────
  console.log('\n[ encuestas ]');
  await goto(page, '/admin/encuestas');
  await shot(page, 'encuestas-paso1.png');        // panel de encuestas

  await page.evaluate(() => window.scrollBy(0, 300)); await delay(300);
  await shot(page, 'encuestas-paso2.png');        // métricas de satisfacción

  await page.evaluate(() => window.scrollBy(0, 400)); await delay(300);
  await shot(page, 'encuestas-paso3.png');        // feed de reseñas

  // ── RESERVACIONES ────────────────────────────────────────────────────
  console.log('\n[ reservaciones ]');
  await goto(page, '/admin/reservaciones');
  await shot(page, 'reservaciones-paso1.png');    // panel de reservaciones
  await shot(page, 'reservaciones-paso2.png');    // confirmar reserva

  const tabNuevaRes = page.locator('button, [role="tab"]').filter({ hasText: /nueva reserva/i }).first();
  if (await tabNuevaRes.isVisible({ timeout: 1500 }).catch(() => false)) {
    await tabNuevaRes.click(); await delay(800);
  }
  await shot(page, 'reservaciones-paso3.png');    // formulario nueva reservación
  await shot(page, 'reservaciones-paso4.png');    // flujo de estados

  // ── CUPONES ──────────────────────────────────────────────────────────
  console.log('\n[ cupones ]');
  await goto(page, '/admin/cupones');
  await shot(page, 'cupones-paso1.png');          // lista de cupones

  const btnCupon = page.locator('button').filter({ hasText: /nuevo cup[oó]n/i }).first();
  if (await btnCupon.isVisible({ timeout: 1500 }).catch(() => false)) {
    await btnCupon.click(); await delay(1000);
    await shot(page, 'cupones-paso2.png');        // formulario nuevo cupón
    await page.evaluate(() => window.scrollBy(0, 400)); await delay(300);
    await shot(page, 'cupones-paso3.png');        // sección restricciones
    await page.keyboard.press('Escape'); await delay(400);
  } else {
    await shot(page, 'cupones-paso2.png');
    await shot(page, 'cupones-paso3.png');
  }

  await goto(page, '/admin/cupones');
  await shot(page, 'cupones-paso4.png');          // estados de cupones

  // ── RECETAS ──────────────────────────────────────────────────────────
  console.log('\n[ recetas ]');
  await goto(page, '/admin/ingredientes');
  await shot(page, 'recetas-paso1.png');          // panel de ingredientes
  await shot(page, 'recetas-paso2.png');          // lista con costos

  const btnIngr = page.locator('button').filter({ hasText: /nuevo ingrediente/i }).first();
  if (await btnIngr.isVisible({ timeout: 1500 }).catch(() => false)) {
    await btnIngr.click(); await delay(1000);
    await shot(page, 'recetas-paso3.png');        // formulario nuevo ingrediente
    await page.keyboard.press('Escape'); await delay(400);
  } else {
    await shot(page, 'recetas-paso3.png');
  }

  // Abre catálogo para mostrar columnas de costo/margen
  await goto(page, '/admin/menu');
  await shot(page, 'recetas-paso4.png');          // catálogo con precio, costo y margen

  // ── FIN ──────────────────────────────────────────────────────────────
  await browser.close();
  console.log(`\n🎉 Listo! ${saved} capturas guardadas en:`);
  console.log(`   ${SS_DIR}`);
}

run().catch(e => { console.error('\n❌ Error:', e.message); process.exit(1); });
