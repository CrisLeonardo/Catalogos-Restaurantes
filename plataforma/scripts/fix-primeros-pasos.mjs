/**
 * fix-primeros-pasos.mjs
 * Retoma solo primeros-pasos-paso2 (dashboard con accesos rápidos + sidebar)
 * navegando explícitamente a /admin después del login.
 */
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SS_DIR = path.join(__dirname, '..', 'public', 'tutorial', 'screenshots');
const BASE   = 'http://bistro-la-plaza.localhost:3000';
const EMAIL  = 'owner@bistroplaza.com';
const PASS   = 'Demo1234!';

const delay = ms => new Promise(r => setTimeout(r, ms));

async function run() {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const ctx  = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  page.on('console', () => {}); page.on('pageerror', () => {});

  // Login
  await page.goto(`${BASE}/admin/login`, { waitUntil: 'domcontentloaded' });
  await delay(1000);
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASS);
  await page.click('button[type="submit"]');
  try { await page.waitForURL(/\/admin$/, { timeout: 12000 }); } catch {}
  await page.waitForLoadState('domcontentloaded');
  await delay(1500);

  // Descarta el tour
  await page.evaluate(() => localStorage.setItem('leogin_tour_completed', 'true'));
  await page.keyboard.press('Escape');
  await delay(300);

  // Navega explícitamente al dashboard
  await page.goto(`${BASE}/admin`, { waitUntil: 'domcontentloaded' });
  await delay(1500);
  await page.evaluate(() => localStorage.setItem('leogin_tour_completed', 'true'));
  await page.keyboard.press('Escape');
  await delay(400);

  // Expande los grupos del sidebar
  for (const txt of ['Operación', 'Negocio', 'Cuenta']) {
    try {
      const btn = page.locator('button').filter({ hasText: new RegExp(txt, 'i') }).first();
      if (await btn.isVisible({ timeout: 600 })) { await btn.click(); await delay(300); }
    } catch {}
  }
  await delay(400);

  // paso2: dashboard con sidebar y accesos rápidos
  const dest2 = path.join(SS_DIR, 'primeros-pasos-paso2.png');
  await page.screenshot({ path: dest2, clip: { x: 0, y: 0, width: 1280, height: 800 } });
  console.log('✅  primeros-pasos-paso2.png (dashboard)');

  // paso3: misma vista — sidebar con tres grupos visibles
  const dest3 = path.join(SS_DIR, 'primeros-pasos-paso3.png');
  await page.screenshot({ path: dest3, clip: { x: 0, y: 0, width: 1280, height: 800 } });
  console.log('✅  primeros-pasos-paso3.png (sidebar tres grupos)');

  // paso4: scroll al fondo para mostrar el badge del plan
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await delay(400);
  const dest4 = path.join(SS_DIR, 'primeros-pasos-paso4.png');
  await page.screenshot({ path: dest4, clip: { x: 0, y: 0, width: 1280, height: 800 } });
  console.log('✅  primeros-pasos-paso4.png (badge del plan)');

  await browser.close();
  console.log('\n🎉 primeros-pasos-paso2/3/4 actualizados.');
}

run().catch(e => { console.error('❌', e.message); process.exit(1); });
