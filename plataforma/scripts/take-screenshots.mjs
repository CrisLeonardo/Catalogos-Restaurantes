/**
 * take-screenshots.mjs
 * Toma capturas automáticas del panel admin de Bistró La Plaza
 * y las guarda en public/tutorial/screenshots/ con la convención
 * {sectionId}-paso{N}.png
 *
 * Uso: node scripts/take-screenshots.mjs
 * Requiere: dev server corriendo en bistro-la-plaza.localhost:3000
 */

import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SS_DIR = path.join(__dirname, '..', 'public', 'tutorial', 'screenshots');
const BASE = 'http://bistro-la-plaza.localhost:3000';
const EMAIL = 'owner@bistroplaza.com';
const PASS  = 'Demo1234!';

const delay = ms => new Promise(r => setTimeout(r, ms));

let saved = 0;
async function shot(page, filename) {
  const dest = path.join(SS_DIR, filename);
  await page.screenshot({ path: dest, clip: { x: 0, y: 0, width: 1280, height: 800 } });
  console.log(`  ✅  ${filename}`);
  saved++;
}

// Expande todos los grupos del sidebar para que sean visibles
async function expandSidebar(page) {
  // Busca botones de grupo colapsados y los expande
  const groups = page.locator('button[data-tour-step], nav button').filter({ hasText: /Operación|Negocio|Cuenta/i });
  const count = await groups.count();
  for (let i = 0; i < count; i++) {
    try { await groups.nth(i).click({ timeout: 1000 }); await delay(200); } catch {}
  }
}

// Navega a una ruta y espera que cargue
async function goto(page, path) {
  await page.goto(`${BASE}${path}`);
  await page.waitForLoadState('domcontentloaded');
  await delay(1200); // espera animaciones
}

async function run() {
  fs.mkdirSync(SS_DIR, { recursive: true });

  const browser = await chromium.launch({
    headless: false,
    channel: 'chrome',
    args: ['--window-size=1280,900'],
  });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();

  // ── LOGIN ────────────────────────────────────────────────
  console.log('\n[ primeros-pasos ]');
  await goto(page, '/admin/login');
  await shot(page, 'primeros-pasos-paso1.png');   // pantalla de login

  // Inicia sesión
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASS);
  await page.click('button[type="submit"]');
  try { await page.waitForURL(`${BASE}/admin`, { timeout: 8000 }); } catch {}
  await page.waitForLoadState('domcontentloaded');
  await delay(1500);

  // Marca el tour como completado para que no interfiera con clics
  await page.evaluate(() => localStorage.setItem('leogin_tour_completed', 'true'));
  // Si hay un overlay del tour activo, lo cierra con Escape
  await page.keyboard.press('Escape');
  await delay(300);

  // ── PRIMEROS PASOS ───────────────────────────────────────
  await shot(page, 'primeros-pasos-paso2.png');   // dashboard

  // Asegura sidebar expandida para paso 3
  await expandSidebar(page);
  await delay(500);
  await shot(page, 'primeros-pasos-paso3.png');   // sidebar con grupos

  // Scroll al fondo del sidebar para ver el badge del plan
  await page.evaluate(() => {
    const nav = document.querySelector('nav, aside, [class*="sidebar"]');
    if (nav) nav.scrollTop = nav.scrollHeight;
  });
  await delay(400);
  await shot(page, 'primeros-pasos-paso4.png');   // badge del plan

  // ── PERFIL ───────────────────────────────────────────────
  console.log('\n[ perfil ]');
  await goto(page, '/admin/perfil');
  await shot(page, 'perfil-paso1.png');           // formulario arriba

  await page.evaluate(() => window.scrollBy(0, 350));
  await delay(400);
  await shot(page, 'perfil-paso2.png');           // sección horarios

  await page.evaluate(() => window.scrollBy(0, 350));
  await delay(400);
  await shot(page, 'perfil-paso3.png');           // campo WhatsApp

  await page.evaluate(() => window.scrollBy(0, 400));
  await delay(400);
  await shot(page, 'perfil-paso4.png');           // zona de entrega

  // ── CATÁLOGO ─────────────────────────────────────────────
  console.log('\n[ catalogo ]');
  await goto(page, '/admin/menu');
  await shot(page, 'catalogo-paso1.png');         // vista del catálogo

  // Abre formulario de nuevo producto
  const btnNuevo = page.locator('button, a').filter({ hasText: /nuevo producto/i }).first();
  if (await btnNuevo.isVisible({ timeout: 2000 }).catch(() => false)) {
    await btnNuevo.click();
    await delay(1200);
    await shot(page, 'catalogo-paso2.png');       // formulario nuevo producto

    await shot(page, 'catalogo-paso3.png');       // área de imagen (misma pantalla arriba)

    await page.evaluate(() => window.scrollBy(0, 400));
    await delay(400);
    await shot(page, 'catalogo-paso4.png');       // sección de opciones

    // Vuelve al catálogo
    await page.goBack();
    await page.waitForLoadState('domcontentloaded');
    await delay(1000);
  } else {
    // Si no encontró el botón, copia capturas del catálogo
    await shot(page, 'catalogo-paso2.png');
    await shot(page, 'catalogo-paso3.png');
    await shot(page, 'catalogo-paso4.png');
  }

  await goto(page, '/admin/menu');
  await shot(page, 'catalogo-paso5.png');         // toggles de disponibilidad
  await shot(page, 'catalogo-paso6.png');         // íconos de arrastre (misma vista)

  // ── CATEGORÍAS ───────────────────────────────────────────
  console.log('\n[ categorias ]');
  await goto(page, '/admin/categorias');
  await shot(page, 'categorias-paso1.png');       // lista de categorías

  const btnNuevaCat = page.locator('button, a').filter({ hasText: /nueva categor/i }).first();
  if (await btnNuevaCat.isVisible({ timeout: 2000 }).catch(() => false)) {
    await btnNuevaCat.click();
    await delay(1000);
    await shot(page, 'categorias-paso2.png');     // modal nueva categoría
    await page.keyboard.press('Escape');
    await delay(400);
  } else {
    await shot(page, 'categorias-paso2.png');
  }

  await shot(page, 'categorias-paso3.png');       // lista con drag handles
  await shot(page, 'categorias-paso4.png');       // (vista de asignación similar)

  // ── PERSONALIZAR ─────────────────────────────────────────
  console.log('\n[ personalizar ]');
  await goto(page, '/admin/personalizacion');
  await delay(1500);                              // espera la vista previa
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

  // ── QR ───────────────────────────────────────────────────
  console.log('\n[ qr ]');
  await goto(page, '/admin/qr');
  await shot(page, 'qr-paso1.png');              // código QR y enlace
  await shot(page, 'qr-paso2.png');              // botón descargar
  await shot(page, 'qr-paso3.png');              // misma vista (probar escaneo es manual)
  await shot(page, 'qr-paso4.png');              // idem (tips de colocación)

  // ── MÉTRICAS ─────────────────────────────────────────────
  console.log('\n[ metricas ]');
  await goto(page, '/admin/metricas');
  await shot(page, 'metricas-paso1.png');         // panel de visitas

  await page.evaluate(() => window.scrollBy(0, 300));
  await delay(400);
  await shot(page, 'metricas-paso2.png');         // selector de período

  await page.evaluate(() => window.scrollBy(0, 400));
  await delay(400);
  await shot(page, 'metricas-paso3.png');         // productos más vistos

  // ── POPULAR: PEDIDOS ─────────────────────────────────────
  console.log('\n[ pedidos ]');
  await goto(page, '/admin/pedidos');
  await delay(500);
  await shot(page, 'pedidos-paso1.png');
  await shot(page, 'pedidos-paso2.png');
  await shot(page, 'pedidos-paso3.png');
  await shot(page, 'pedidos-paso4.png');
  await shot(page, 'pedidos-paso5.png');

  // ── PANEL DE PEDIDOS ─────────────────────────────────────
  console.log('\n[ panel-pedidos ]');
  await goto(page, '/admin/pedidos');
  await shot(page, 'panel-pedidos-paso1.png');
  await page.evaluate(() => window.scrollBy(0, 300));
  await delay(300);
  await shot(page, 'panel-pedidos-paso2.png');
  await shot(page, 'panel-pedidos-paso3.png');
  await shot(page, 'panel-pedidos-paso4.png');
  await shot(page, 'panel-pedidos-paso5.png');

  // ── INVENTARIO ───────────────────────────────────────────
  console.log('\n[ inventario ]');
  await goto(page, '/admin/inventario');
  await shot(page, 'inventario-paso1.png');
  await shot(page, 'inventario-paso2.png');
  await shot(page, 'inventario-paso3.png');
  await shot(page, 'inventario-paso4.png');

  // ── ANALÍTICA ────────────────────────────────────────────
  console.log('\n[ analitica ]');
  await goto(page, '/admin/analitica');
  await shot(page, 'analitica-paso1.png');
  await shot(page, 'analitica-paso2.png');
  await shot(page, 'analitica-paso3.png');
  await shot(page, 'analitica-paso4.png');

  // ── FINANZAS ─────────────────────────────────────────────
  console.log('\n[ finanzas ]');
  await goto(page, '/admin/finanzas');
  await shot(page, 'finanzas-paso1.png');
  await page.evaluate(() => window.scrollBy(0, 300));
  await delay(300);
  await shot(page, 'finanzas-paso2.png');
  await page.evaluate(() => window.scrollTo(0, 0));
  await delay(300);
  await shot(page, 'finanzas-paso3.png');
  await shot(page, 'finanzas-paso4.png');
  await page.evaluate(() => window.scrollBy(0, 500));
  await delay(300);
  await shot(page, 'finanzas-paso5.png');

  // ── CLIENTES ─────────────────────────────────────────────
  console.log('\n[ clientes ]');
  await goto(page, '/admin/clientes');
  await shot(page, 'clientes-paso1.png');
  await shot(page, 'clientes-paso2.png');
  await shot(page, 'clientes-paso3.png');

  // ── PROMOCIONES ──────────────────────────────────────────
  console.log('\n[ promociones ]');
  await goto(page, '/admin/promociones');
  await shot(page, 'promociones-paso1.png');
  const btnPromo = page.locator('button, a').filter({ hasText: /nueva promoci/i }).first();
  if (await btnPromo.isVisible({ timeout: 2000 }).catch(() => false)) {
    await btnPromo.click(); await delay(1000);
    await shot(page, 'promociones-paso2.png');
    await page.keyboard.press('Escape'); await delay(300);
  } else { await shot(page, 'promociones-paso2.png'); }
  await shot(page, 'promociones-paso3.png');
  await shot(page, 'promociones-paso4.png');

  // ── PERSONAL ─────────────────────────────────────────────
  console.log('\n[ personal ]');
  await goto(page, '/admin/personal');
  await shot(page, 'personal-paso1.png');
  await shot(page, 'personal-paso2.png');
  await shot(page, 'personal-paso3.png');
  await shot(page, 'personal-paso4.png');
  await shot(page, 'personal-paso5.png');

  // ── COCINA (KDS) ─────────────────────────────────────────
  console.log('\n[ cocina ]');
  await goto(page, '/admin/cocina');
  await shot(page, 'cocina-paso1.png');
  await shot(page, 'cocina-paso2.png');
  await shot(page, 'cocina-paso3.png');
  await shot(page, 'cocina-paso4.png');
  await shot(page, 'cocina-paso5.png');

  // ── MESEROS ──────────────────────────────────────────────
  console.log('\n[ meseros ]');
  await goto(page, '/admin/mesero');
  await shot(page, 'meseros-paso1.png');
  await shot(page, 'meseros-paso2.png');
  await shot(page, 'meseros-paso3.png');
  await shot(page, 'meseros-paso4.png');
  await shot(page, 'meseros-paso5.png');

  // ── LEALTAD ──────────────────────────────────────────────
  console.log('\n[ loyalty ]');
  await goto(page, '/admin/lealtad');
  await shot(page, 'loyalty-paso1.png');
  await shot(page, 'loyalty-paso2.png');
  await shot(page, 'loyalty-paso3.png');
  await shot(page, 'loyalty-paso4.png');
  await shot(page, 'loyalty-paso5.png');
  await shot(page, 'loyalty-paso6.png');

  // ── RECETAS ──────────────────────────────────────────────
  console.log('\n[ recetas ]');
  await goto(page, '/admin/ingredientes');
  await shot(page, 'recetas-paso1.png');
  await shot(page, 'recetas-paso2.png');
  await shot(page, 'recetas-paso3.png');
  await shot(page, 'recetas-paso4.png');

  await browser.close();
  console.log(`\n🎉 Listo! ${saved} capturas guardadas en public/tutorial/screenshots/`);
}

run().catch(e => { console.error('\n❌', e.message); process.exit(1); });
