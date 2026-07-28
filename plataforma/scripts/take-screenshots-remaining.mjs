/**
 * take-screenshots-remaining.mjs
 * Solo las secciones que faltaron: personal, cocina, meseros, loyalty, recetas
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

async function dismissTour(page) {
  // Cierra el tour si está visible
  try {
    const tourBtn = page.locator('[aria-label*="tour"], button:has-text("Omitir"), button:has-text("omitir")').first();
    if (await tourBtn.isVisible({ timeout: 500 })) {
      await tourBtn.click();
      await delay(300);
    }
  } catch {}
  // También intentar con Escape
  await page.keyboard.press('Escape');
  await delay(200);
}

async function goto(page, p) {
  await page.goto(`${BASE}${p}`);
  await page.waitForLoadState('domcontentloaded');
  await delay(1200);
  await dismissTour(page);
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

  // Login
  await page.goto(`${BASE}/admin/login`);
  await page.waitForLoadState('domcontentloaded');
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASS);
  await page.click('button[type="submit"]');
  try { await page.waitForURL(`${BASE}/admin`, { timeout: 8000 }); } catch {}
  await page.waitForLoadState('domcontentloaded');
  await delay(1500);

  // Desactiva el tour para que no bloquee clics
  await page.evaluate(() => localStorage.setItem('leogin_tour_completed', 'true'));
  await page.keyboard.press('Escape');
  await delay(400);

  // ── PERSONAL ─────────────────────────────────────────────
  console.log('\n[ personal ]');
  await goto(page, '/admin/personal');
  await shot(page, 'personal-paso1.png');

  // Abre modal de nuevo staff
  const btnStaff = page.locator('button').filter({ hasText: /nuevo staff/i }).first();
  if (await btnStaff.isVisible({ timeout: 2000 }).catch(() => false)) {
    await btnStaff.click();
    await delay(1000);
    await shot(page, 'personal-paso2.png');
    await page.keyboard.press('Escape');
    await delay(400);
  } else {
    await shot(page, 'personal-paso2.png');
  }

  await shot(page, 'personal-paso3.png');
  await page.evaluate(() => window.scrollBy(0, 400));
  await delay(300);
  await shot(page, 'personal-paso4.png');
  await shot(page, 'personal-paso5.png');

  // ── COCINA (KDS) ─────────────────────────────────────────
  console.log('\n[ cocina ]');
  await goto(page, '/admin/cocina');
  await shot(page, 'cocina-paso1.png');
  await shot(page, 'cocina-paso2.png');
  await shot(page, 'cocina-paso3.png');
  await page.evaluate(() => window.scrollBy(0, 300));
  await delay(300);
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
  await page.evaluate(() => window.scrollBy(0, 300));
  await delay(300);
  await shot(page, 'loyalty-paso2.png');
  await shot(page, 'loyalty-paso3.png');
  await page.evaluate(() => window.scrollBy(0, 300));
  await delay(300);
  await shot(page, 'loyalty-paso4.png');
  await shot(page, 'loyalty-paso5.png');
  await shot(page, 'loyalty-paso6.png');

  // ── RECETAS ──────────────────────────────────────────────
  console.log('\n[ recetas ]');
  await goto(page, '/admin/ingredientes');
  await shot(page, 'recetas-paso1.png');
  await shot(page, 'recetas-paso2.png');

  // Abre modal de nuevo ingrediente
  const btnIngr = page.locator('button').filter({ hasText: /nuevo ingrediente/i }).first();
  if (await btnIngr.isVisible({ timeout: 2000 }).catch(() => false)) {
    await btnIngr.click();
    await delay(1000);
    await shot(page, 'recetas-paso3.png');
    await page.keyboard.press('Escape');
    await delay(400);
  } else {
    await shot(page, 'recetas-paso3.png');
  }
  await shot(page, 'recetas-paso4.png');

  await browser.close();
  console.log(`\n🎉 Listo! ${saved} capturas adicionales guardadas.`);
}

run().catch(e => { console.error('\n❌', e.message); process.exit(1); });
