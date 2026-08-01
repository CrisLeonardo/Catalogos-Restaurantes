/**
 * Comprobación de la HORA DE LOS TICKETS (bug del 2026-08-01).
 *
 * Los tickets se arman en dos sitios con relojes distintos: el navegador del
 * local y el servidor (Render), que corre en UTC. Sin una zona horaria
 * explícita, todo ticket encolado desde el servidor salía con la hora de UTC —
 * en Guatemala, seis horas adelantadas.
 *
 * Este script fuerza el proceso a UTC (TZ=UTC), como el servidor de verdad, y
 * comprueba que la comanda y el recibo salen con la HORA DEL RESTAURANTE.
 *
 * Uso:  node scripts/test-hora-ticket.mjs
 */
import ts from 'typescript';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

// Como el servidor de producción: reloj del proceso en UTC.
process.env.TZ = 'UTC';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, '..', 'src', 'lib', 'escpos.ts'), 'utf8');
const js = ts.transpileModule(src, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;

const dir = mkdtempSync(join(tmpdir(), 'leogin-escpos-'));
const file = join(dir, 'escpos.mjs');
writeFileSync(file, js, 'utf8');
const { buildKitchenEscPos, buildReceiptEscPos, ticketTime } = await import(pathToFileURL(file).href);

let passed = 0, failed = 0;
const check = (name, cond, extra) => {
  if (cond) { passed++; console.log(`  ok   ${name}`); }
  else { failed++; console.log(`  FALLA ${name}${extra ? ` — ${extra}` : ''}`); }
};

const GT = { timezone: 'America/Guatemala', locale: 'es-GT' };
// 2026-08-01 02:30 UTC = 2026-07-31 20:30 en Guatemala (UTC-6).
const createdAt = '2026-08-01T02:30:00.000Z';

const order = {
  id: 'x', order_number: 'ORD-2026-00042', customer_name: 'Cliente Prueba',
  customer_phone: '55551234', order_type: 'DINE_IN', address: 'Mesa 4',
  delivery_zone: null, status: 'PREP', created_at: createdAt,
  subtotal: 100, delivery_fee: 0, discount: 0, tip: 0, total: 100,
  loyalty_points_redeemed: 0, loyalty_discount: 0, coupon_code: null,
  payment_method: 'CASH', cash_amount: null, notes: null, waiter_name: 'Ana',
  items: [{ id: 'i1', quantity: 2, name_snapshot: 'Hamburguesa', subtotal: 100, options_snapshot: null }],
  voids: [],
};
const currency = { symbol: 'Q', position: 'prefix', locale: 'es-GT' };
const text = (bytes) => Buffer.from(bytes).toString('latin1');

console.log(`\nReloj del proceso: ${process.env.TZ} (como el servidor de producción)`);
console.log(`Pedido creado a las ${createdAt} → en Guatemala son las 20:30 del 31 de julio\n`);

console.log('1. La hora sale en la zona del restaurante, no en UTC');
const gtTime = ticketTime(createdAt, GT);
check(`ticketTime devuelve la hora local (${gtTime})`, gtTime.includes('8:30') || gtTime.includes('20:30'), gtTime);
check('NO devuelve la hora de UTC (2:30)', !gtTime.startsWith('02:3') && !gtTime.startsWith('2:3'), gtTime);

console.log('\n2. La comanda de cocina lleva esa misma hora');
const kitchen = text(buildKitchenEscPos(order, 'Azúcar Negra', { format: GT }));
check('la comanda contiene la hora local', kitchen.includes(gtTime), kitchen.slice(0, 80));
check('la comanda NO contiene la hora UTC', !kitchen.includes(ticketTime(createdAt, { timezone: 'UTC', locale: 'es-GT' })));

console.log('\n3. El recibo de caja también');
const receipt = text(buildReceiptEscPos(order, currency, 'Azúcar Negra', GT));
check('el recibo contiene la hora local', receipt.includes(gtTime), receipt.slice(0, 90));

console.log('\n4. Una reimpresión sale marcada como copia');
const copy = text(buildKitchenEscPos(order, 'Azúcar Negra', { format: GT, reprint: true }));
check('la copia avisa "NO COCINAR"', copy.includes('NO COCINAR'));
check('la comanda normal NO lleva ese aviso', !kitchen.includes('NO COCINAR'));

console.log('\n5. Otra zona horaria da otra hora (la zona se respeta de verdad)');
// Bogotá es UTC-5, una hora por delante de Guatemala: si el ticket saliera
// igual, sería señal de que la zona no se está aplicando en absoluto.
const bog = ticketTime(createdAt, { timezone: 'America/Bogota', locale: 'es-CO' });
check(`Bogotá marca una hora más que Guatemala (${bog} vs ${gtTime})`, bog.includes('9:30'), bog);

console.log(`\n${passed} comprobaciones ok, ${failed} fallidas.`);
process.exit(failed === 0 ? 0 : 1);
