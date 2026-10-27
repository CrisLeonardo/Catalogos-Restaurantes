/**
 * take-screenshots.mjs
 * Retoma capturas del panel admin para las secciones que tenían el overlay del
 * tour de bienvenida superpuesto. Solo reemplaza las imágenes afectadas.
 *
 * Secciones que NO se tocan (ya están bien):
 *   cocina, cupones, encuestas, fel, loyalty, meseros, personal,
 *   primeros-pasos, qr, recetas
 *
 * Uso: node scripts/take-screenshots.mjs
 * Requiere: npm run dev corriendo en otra terminal (puerto 3000)
 */

import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SS_DIR = path.join(__dirname, '..', 'public', 'tutorial', 'screenshots');
const BASE = 'http://127.0.0.1:3000';
const EMAIL = 'dueno@rincon502.test';
const PASS  = 'Dueno12345';

const delay = ms => new Promise(r => setTimeout(r, ms));

let saved = 0;
async function shot(page, filename) {
  const dest = path.join(SS_DIR, filename);
  await page.screenshot({ path: dest, clip: { x: 0, y: 0, width: 1280, height: 800 } });
  console.log(`  ✅  ${filename}`);
  saved++;
}

// Navega a una ruta y espera que cargue
async function goto(page, path) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await delay(1500); // espera animaciones y renders
}

async function run() {
  fs.mkdirSync(SS_DIR, { recursive: true });

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-web-security'],
  });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();

  // Silenciar errores JS de la app (hot-reload, etc.)
  page.on('console', () => {});
  page.on('pageerror', () => {});

  // ── LOGIN ────────────────────────────────────────────────
  console.log('\n[ login ]');
  await goto(page, '/admin/login');

  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASS);
  await page.click('button[type="submit"]');
  try { await page.waitForURL(`${BASE}/admin/**`, { timeout: 12000 }); } catch {}
  await page.waitForLoadState('domcontentloaded');
  await delay(1500);

  // Marca el tour como completado para que no interfiera con ninguna navegación
  await page.evaluate(() => localStorage.setItem('leogin_tour_completed', 'true'));
  await page.keyboard.press('Escape');
  await delay(300);
  console.log('  ✅ Sesión iniciada, tour descartado');

  // Helper: navega y vuelve a descartar el tour por si acaso
  const safeGoto = async (path) => {
    await goto(page, path);
    await page.evaluate(() => localStorage.setItem('leogin_tour_completed', 'true'));
    // Espera brevemente por si el tour apareció y luego se quita
    await delay(100);
  };

  // ── PERFIL ───────────────────────────────────────────────
  console.log('\n[ perfil ]');
  await safeGoto('/admin/perfil');
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
  await safeGoto('/admin/menu');
  await shot(page, 'catalogo-paso1.png');         // vista del catálogo

  // Abre formulario de nuevo producto
  const btnNuevo = page.locator('button, a').filter({ hasText: /nuevo producto/i }).first();
  if (await btnNuevo.isVisible({ timeout: 3000 }).catch(() => false)) {
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
    await page.evaluate(() => localStorage.setItem('leogin_tour_completed', 'true'));
  } else {
    // Si no encontró el botón, usa capturas de la misma vista del catálogo
    await shot(page, 'catalogo-paso2.png');
    await shot(page, 'catalogo-paso3.png');
    await shot(page, 'catalogo-paso4.png');
  }

  await safeGoto('/admin/menu');
  await shot(page, 'catalogo-paso5.png');         // toggles de disponibilidad
  await shot(page, 'catalogo-paso6.png');         // íconos de arrastre (misma vista)

  // ── CATEGORÍAS ───────────────────────────────────────────
  console.log('\n[ categorias ]');
  await safeGoto('/admin/categorias');
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
  await shot(page, 'categorias-paso4.png');       // (vista de asignación similar)

  // ── PERSONALIZAR ─────────────────────────────────────────
  console.log('\n[ personalizar ]');
  await safeGoto('/admin/personalizacion');
  await delay(1500);                              // espera la vista previa en tiempo real
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

  // ── MÉTRICAS ─────────────────────────────────────────────
  console.log('\n[ metricas ]');
  await safeGoto('/admin/metricas');
  await shot(page, 'metricas-paso1.png');         // panel de visitas

  await page.evaluate(() => window.scrollBy(0, 300));
  await delay(400);
  await shot(page, 'metricas-paso2.png');         // selector de período

  await page.evaluate(() => window.scrollBy(0, 400));
  await delay(400);
  await shot(page, 'metricas-paso3.png');         // productos más vistos

  // ── CONFIGURAR PEDIDOS ────────────────────────────────────
  console.log('\n[ pedidos ]');
  await safeGoto('/admin/pedidos');
  await delay(500);
  await shot(page, 'pedidos-paso1.png');          // panel de módulos/pedidos
  await shot(page, 'pedidos-paso2.png');          // tipos de orden
  await shot(page, 'pedidos-paso3.png');          // tarifa de envío
  await shot(page, 'pedidos-paso4.png');          // pausar pedidos
  await shot(page, 'pedidos-paso5.png');          // notificaciones

  // ── PANEL DE PEDIDOS EN TIEMPO REAL ──────────────────────
  console.log('\n[ panel-pedidos ]');
  await safeGoto('/admin/pedidos');
  await shot(page, 'panel-pedidos-paso1.png');    // vista en tiempo real
  await page.evaluate(() => window.scrollBy(0, 300));
  await delay(300);
  await shot(page, 'panel-pedidos-paso2.png');    // avanzar estado
  await shot(page, 'panel-pedidos-paso3.png');    // detalle del pedido
  await shot(page, 'panel-pedidos-paso4.png');    // imprimir
  // Intenta click en tab historial
  const histTab = page.locator('[role="tab"], button').filter({ hasText: /historial/i }).first();
  if (await histTab.isVisible({ timeout: 2000 }).catch(() => false)) {
    await histTab.click(); await delay(500);
  }
  await shot(page, 'panel-pedidos-paso5.png');    // historial

  // ── INVENTARIO ───────────────────────────────────────────
  console.log('\n[ inventario ]');
  await safeGoto('/admin/inventario');
  await shot(page, 'inventario-paso1.png');
  await shot(page, 'inventario-paso2.png');
  await page.evaluate(() => window.scrollBy(0, 200));
  await delay(300);
  await shot(page, 'inventario-paso3.png');
  await shot(page, 'inventario-paso4.png');

  // ── ANALÍTICA ────────────────────────────────────────────
  console.log('\n[ analitica ]');
  await safeGoto('/admin/analitica');
  await shot(page, 'analitica-paso1.png');
  // Intenta navegar entre tabs de analítica
  const analiticaTabs = [/más vendidos|vendidos/i, /cancelac/i, /tiemp/i];
  for (let i = 0; i < analiticaTabs.length; i++) {
    const tab = page.locator('[role="tab"], button, a').filter({ hasText: analiticaTabs[i] }).first();
    if (await tab.isVisible({ timeout: 2000 }).catch(() => false)) {
      await tab.click(); await delay(500);
    }
    await shot(page, `analitica-paso${i + 2}.png`);
  }

  // ── FINANZAS ─────────────────────────────────────────────
  console.log('\n[ finanzas ]');
  await safeGoto('/admin/finanzas');
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
  await safeGoto('/admin/clientes');
  await shot(page, 'clientes-paso1.png');
  await page.evaluate(() => window.scrollBy(0, 200));
  await delay(300);
  await shot(page, 'clientes-paso2.png');
  await page.evaluate(() => window.scrollTo(0, 0));
  await delay(300);
  await shot(page, 'clientes-paso3.png');

  await browser.close();
  console.log(`\n🎉 Listo! ${saved} capturas guardadas en public/tutorial/screenshots/`);
  console.log('   (Secciones NO modificadas: cocina, cupones, encuestas, fel, loyalty,');
  console.log('    meseros, personal, primeros-pasos, qr, recetas)');
}

run().catch(e => { console.error('\n❌', e.message); process.exit(1); });
