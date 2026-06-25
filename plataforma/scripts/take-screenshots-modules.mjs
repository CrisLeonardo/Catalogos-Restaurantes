/**
 * take-screenshots-modules.mjs
 * Capturas de los módulos opcionales: fel, proveedores, encuestas, reservaciones, cupones
 * (grupo se omite porque requiere configuración especial multi-sucursal)
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
  await page.screenshot({ path: path.join(SS_DIR, filename), clip: { x: 0, y: 0, width: 1280, height: 800 } });
  console.log(`  ✅  ${filename}`);
  saved++;
}

async function goto(page, p) {
  await page.goto(`${BASE}${p}`);
  await page.waitForLoadState('domcontentloaded');
  await delay(1500);
  await page.keyboard.press('Escape'); // cierra tour si está abierto
  await delay(200);
}

async function tryClick(page, selector) {
  const btn = page.locator('button').filter({ hasText: selector }).first();
  if (await btn.isVisible({ timeout: 1500 }).catch(() => false)) {
    await btn.click();
    await delay(1000);
    return true;
  }
  return false;
}

async function run() {
  const browser = await chromium.launch({ headless: false, channel: 'chrome', args: ['--window-size=1280,900'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();

  // Login
  await page.goto(`${BASE}/admin/login`);
  await page.waitForLoadState('domcontentloaded');
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASS);
  await page.click('button[type="submit"]');
  try { await page.waitForURL(`${BASE}/admin`, { timeout: 8000 }); } catch {}
  await page.waitForLoadState('domcontentloaded');
  await delay(1500);
  await page.evaluate(() => localStorage.setItem('leogin_tour_completed', 'true'));
  await page.keyboard.press('Escape');
  await delay(400);

  // ── FEL ──────────────────────────────────────────────────
  console.log('\n[ fel ]');
  await goto(page, '/admin/facturacion');
  await shot(page, 'fel-paso1.png');             // panel de facturación
  // Tab configuración
  const tabConfig = page.locator('button, [role="tab"]').filter({ hasText: /configuraci/i }).first();
  if (await tabConfig.isVisible({ timeout: 1500 }).catch(() => false)) {
    await tabConfig.click(); await delay(800);
  }
  await shot(page, 'fel-paso2.png');             // formulario de datos fiscales
  // Tab emitir
  const tabEmitir = page.locator('button, [role="tab"]').filter({ hasText: /emitir/i }).first();
  if (await tabEmitir.isVisible({ timeout: 1500 }).catch(() => false)) {
    await tabEmitir.click(); await delay(800);
  }
  await shot(page, 'fel-paso3.png');             // formulario emisión de factura
  await page.evaluate(() => window.scrollBy(0, 300));
  await delay(300);
  await shot(page, 'fel-paso4.png');             // factura libre
  // Tab historial
  const tabHist = page.locator('button, [role="tab"]').filter({ hasText: /historial/i }).first();
  if (await tabHist.isVisible({ timeout: 1500 }).catch(() => false)) {
    await tabHist.click(); await delay(800);
  }
  await shot(page, 'fel-paso5.png');             // historial de facturas
  await shot(page, 'fel-paso6.png');             // (anular - misma vista)

  // ── PROVEEDORES ──────────────────────────────────────────
  console.log('\n[ proveedores ]');
  await goto(page, '/admin/proveedores');
  await shot(page, 'proveedores-paso1.png');
  const openedProveedor = await tryClick(page, /nuevo proveedor/i);
  await shot(page, 'proveedores-paso2.png');
  if (openedProveedor) { await page.keyboard.press('Escape'); await delay(400); }
  // Tab órdenes
  const tabOrdenes = page.locator('button, [role="tab"]').filter({ hasText: /órdenes|ordenes/i }).first();
  if (await tabOrdenes.isVisible({ timeout: 1500 }).catch(() => false)) {
    await tabOrdenes.click(); await delay(800);
  }
  await shot(page, 'proveedores-paso3.png');
  const openedOrden = await tryClick(page, /nueva orden/i);
  await shot(page, 'proveedores-paso4.png');
  if (openedOrden) { await page.keyboard.press('Escape'); await delay(400); }

  // ── ENCUESTAS ────────────────────────────────────────────
  console.log('\n[ encuestas ]');
  await goto(page, '/admin/encuestas');
  await shot(page, 'encuestas-paso1.png');
  await page.evaluate(() => window.scrollBy(0, 300));
  await delay(300);
  await shot(page, 'encuestas-paso2.png');
  await page.evaluate(() => window.scrollBy(0, 400));
  await delay(300);
  await shot(page, 'encuestas-paso3.png');

  // ── RESERVACIONES ────────────────────────────────────────
  console.log('\n[ reservaciones ]');
  await goto(page, '/admin/reservaciones');
  await shot(page, 'reservaciones-paso1.png');
  await shot(page, 'reservaciones-paso2.png');
  // Tab nueva reservación
  const tabNuevaRes = page.locator('button, [role="tab"]').filter({ hasText: /nueva reserva/i }).first();
  if (await tabNuevaRes.isVisible({ timeout: 1500 }).catch(() => false)) {
    await tabNuevaRes.click(); await delay(800);
  }
  await shot(page, 'reservaciones-paso3.png');
  await shot(page, 'reservaciones-paso4.png');

  // ── CUPONES ──────────────────────────────────────────────
  console.log('\n[ cupones ]');
  await goto(page, '/admin/cupones');
  await shot(page, 'cupones-paso1.png');
  const openedCupon = await tryClick(page, /nuevo cup[oó]n/i);
  await shot(page, 'cupones-paso2.png');
  await page.evaluate(() => window.scrollBy(0, 400));
  await delay(300);
  await shot(page, 'cupones-paso3.png');
  if (openedCupon) { await page.keyboard.press('Escape'); await delay(400); }
  await goto(page, '/admin/cupones');
  await shot(page, 'cupones-paso4.png');

  await browser.close();
  console.log(`\n🎉 ${saved} capturas de módulos guardadas en public/tutorial/screenshots/`);
}

run().catch(e => { console.error('\n❌', e.message); process.exit(1); });
