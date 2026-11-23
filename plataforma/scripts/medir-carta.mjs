/**
 * Mide cuánto tarda en verse una carta en un teléfono de gama media.
 * ------------------------------------------------------------
 * Auditoría de lanzamiento 2026-11-23, LZ-12 y OP-07. Objetivo propuesto:
 * carta visible en ≤ 3 s para el 90 % de 10 intentos. Esto es laboratorio
 * (un perfil fijo de red y CPU, siempre igual para poder comparar antes y
 * después de un cambio), no lo que viven los comensales en la calle.
 *
 * Cada intento abre un navegador limpio (sin caché ni cookies), emula un
 * teléfono de 390 × 844, frena la CPU 4× y la red a «4G lento»
 * (1.6 Mb/s de bajada, 750 kb/s de subida, 150 ms de latencia), y anota:
 *   · FCP  primer contenido pintado;
 *   · LCP  el elemento más grande pintado (lo que el comensal siente
 *          como «ya cargó»);
 *   · carta  cuando aparece el primer precio («Q…») en pantalla.
 *
 * Uso (desde plataforma/):
 *   node scripts/medir-carta.mjs https://distleogin.com/m/rincon502
 *   node scripts/medir-carta.mjs <url> --intentos 5 --json salida.json
 *
 * Solo lee la página: no inicia sesión, no pide nada, no escribe en ningún
 * lado. Diez visitas a una carta pública no son carga para nadie.
 */
import { chromium, devices } from '@playwright/test';
import { writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const url = args.find((a) => /^https?:\/\//.test(a));
const opcion = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const intentos = Math.max(1, Number(opcion('--intentos', 10)));
const salida = opcion('--json', null);
const PRESUPUESTO_MS = Number(opcion('--presupuesto', 3000));

if (!url) {
  console.error('Uso: node scripts/medir-carta.mjs <url> [--intentos 10] [--presupuesto 3000] [--json salida.json]');
  process.exit(2);
}

const RED = { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 };

async function unIntento(browser) {
  const context = await browser.newContext({ ...devices['Pixel 7'], viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', RED);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.addInitScript(() => {
    window.__lcp = 0;
    new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lcp = e.startTime; })
      .observe({ type: 'largest-contentful-paint', buffered: true });
  });

  const t0 = Date.now();
  const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  let carta = null;
  try {
    await page.waitForFunction(() => /Q\s?\d/.test(document.body?.innerText ?? ''), null, { timeout: 30_000, polling: 50 });
    carta = Date.now() - t0;
  } catch { /* sin precios a la vista en 30 s: cuenta como fallo */ }
  await page.waitForTimeout(1500); // deja asentar el LCP
  const m = await page.evaluate(() => ({
    fcp: performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? null,
    lcp: window.__lcp || null,
    transferKB: Math.round(performance.getEntriesByType('resource').reduce((s, r) => s + (r.transferSize || 0), 0) / 1024),
    // Respuesta del servidor (incluye redirecciones previas) y el elemento del LCP.
    ttfb: Math.round(performance.getEntriesByType('navigation')[0]?.responseStart ?? 0),
    redirecciones: performance.getEntriesByType('navigation')[0]?.redirectCount ?? 0,
  }));
  await context.close();
  return { status: resp?.status() ?? null, carta, ...m, fcp: m.fcp && Math.round(m.fcp), lcp: m.lcp && Math.round(m.lcp) };
}

const pct = (xs, p) => {
  const v = xs.filter((x) => x != null).sort((a, b) => a - b);
  if (!v.length) return null;
  return v[Math.min(v.length - 1, Math.ceil((p / 100) * v.length) - 1)];
};

const browser = await chromium.launch();
const resultados = [];
try {
  for (let i = 1; i <= intentos; i++) {
    const r = await unIntento(browser);
    resultados.push(r);
    console.log(`#${i}  HTTP ${r.status}  TTFB ${r.ttfb} ms  carta ${r.carta ?? 'NO'} ms  FCP ${r.fcp} ms  LCP ${r.lcp} ms  ${r.transferKB} KB`);
  }
} finally {
  await browser.close();
}

const dentro = resultados.filter((r) => r.carta != null && r.carta <= PRESUPUESTO_MS).length;
const resumen = {
  url, fecha: new Date().toISOString(), intentos,
  perfil: 'Pixel 7 · 390×844 · CPU 4× · 4G lento (1.6 Mb/s, 150 ms)',
  presupuesto_ms: PRESUPUESTO_MS,
  dentro_del_presupuesto: `${dentro}/${intentos}`,
  cumple: dentro / intentos >= 0.9,
  carta_ms: { p50: pct(resultados.map((r) => r.carta), 50), p90: pct(resultados.map((r) => r.carta), 90) },
  lcp_ms: { p50: pct(resultados.map((r) => r.lcp), 50), p90: pct(resultados.map((r) => r.lcp), 90) },
  fcp_ms: { p50: pct(resultados.map((r) => r.fcp), 50), p90: pct(resultados.map((r) => r.fcp), 90) },
  transferencia_kb_p50: pct(resultados.map((r) => r.transferKB), 50),
  ttfb_ms: { p50: pct(resultados.map((r) => r.ttfb), 50), p90: pct(resultados.map((r) => r.ttfb), 90) },
  resultados,
};
console.log(`\nCarta visible ≤ ${PRESUPUESTO_MS} ms: ${resumen.dentro_del_presupuesto} → ${resumen.cumple ? 'CUMPLE' : 'NO CUMPLE'} (meta: 90 %)`);
console.log(`carta p50 ${resumen.carta_ms.p50} ms · p90 ${resumen.carta_ms.p90} ms · LCP p50 ${resumen.lcp_ms.p50} ms · p90 ${resumen.lcp_ms.p90} ms`);
if (salida) writeFileSync(salida, `${JSON.stringify(resumen, null, 2)}\n`);
process.exitCode = resumen.cumple ? 0 : 1;
