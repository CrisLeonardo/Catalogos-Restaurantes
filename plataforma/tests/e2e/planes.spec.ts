/** Auditoría 0.2: lecturas del mismo contrato, sin modificar precios globales. */
import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHmac } from 'node:crypto';
import { defaultPlanPricing, planPresentation, formatPlanAmount, type PlanCode } from '../../src/lib/plans';

try {
  for (const line of readFileSync(join(__dirname, '../../.env.local'), 'utf8').split('\n')) {
    const match = line.trim().match(/^([A-Z_]+)=(.*)$/);
    if (match && !(match[1] in process.env)) process.env[match[1]] = match[2].trim();
  }
} catch { /* CI recibe el entorno. */ }
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
if (!url || !['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname)) {
  throw new Error('Las pruebas de planes solo crean datos en Supabase local.');
}
const db = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
const origin = 'http://localhost:3000';
const suffix = Math.random().toString(36).slice(2, 10);
const cases: { tag: string; plan: PlanCode; manual?: boolean; modes: ('dine_in' | 'pickup' | 'delivery')[] }[] = [
  { tag: 'estandar', plan: 'ESTANDAR', modes: ['dine_in', 'delivery'] },
  { tag: 'premium', plan: 'PREMIUM', modes: ['pickup'] },
  { tag: 'en-linea', plan: 'EN_LINEA', modes: ['pickup', 'delivery'] },
  { tag: 'excepcion', plan: 'PREMIUM', manual: true, modes: ['pickup', 'delivery', 'dine_in'] },
];
type Fixture = typeof cases[number] & { id: string; slug: string; email: string; amount: number; invoiceId?: string };
const fixtures: Fixture[] = [];
const userIds: string[] = [];
const pricing = defaultPlanPricing();
let superCookies = new Map<string, string>();

async function account(tag: string, role = 'RESTAURANT_OWNER', restaurantId: string | null = null) {
  const email = `aud-plan-${tag}-${suffix}@test.local`;
  const user = await db.auth.admin.createUser({ email, email_confirm: true });
  if (user.error) throw user.error;
  const id = user.data.user!.id;
  userIds.push(id);
  const profile = await db.from('profiles').upsert({ id, role, restaurant_id: restaurantId, full_name: `AUD Plan ${tag}` });
  if (profile.error) throw profile.error;
  return { id, email };
}

async function login(context: BrowserContext | null, email: string) {
  const { data, error } = await db.auth.admin.generateLink({ type: 'magiclink', email });
  if (error) throw error;
  const jar = new Map<string, string>();
  const client = createServerClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: async (cookies) => {
        for (const { name, value } of cookies) jar.set(name, value);
        if (context) await context.addCookies(cookies.map(({ name, value }) => ({ name, value, url: origin })));
      },
    },
  });
  const result = await client.auth.verifyOtp({ type: 'magiclink', token_hash: data.properties.hashed_token });
  if (result.error) throw result.error;
  if (context) await context.addInitScript(() => localStorage.setItem('leogin_tour_completed', 'true'));
  return { client, jar };
}

function totp(secret: string) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const bits = [...secret.replace(/=+$/, '').toUpperCase()].map((c) => alphabet.indexOf(c).toString(2).padStart(5, '0')).join('');
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)));
  const hash = createHmac('sha1', Buffer.from(bits.match(/.{8}/g)!.map((byte) => parseInt(byte, 2)))).update(counter).digest();
  return String((hash.readUInt32BE(hash[hash.length - 1] & 15) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}

async function visit(page: Page, path: string, check: () => Promise<void>) {
  await expect(async () => {
    await page.goto(`${origin}${path}`, { waitUntil: 'domcontentloaded' });
    await check();
  }).toPass({ timeout: 90_000 });
  await page.waitForLoadState('networkidle');
}

test.describe('Auditoría 0.2 — cinco superficies del contrato', () => {
  test.setTimeout(240_000);
  test.beforeAll(async () => {
    const settings = await db.from('platform_settings').select('key,value').like('key', 'plan_price_%');
    if (settings.error) throw settings.error;
    for (const row of settings.data ?? []) {
      const code = row.key.replace('plan_price_', '') as PlanCode;
      if (code in pricing.prices) pricing.prices[code] = Number(row.value);
    }
    for (const example of cases) {
      const slug = `aud-plan-${example.tag}-${suffix}`;
      const created = await db.from('restaurants').insert({ name: `AUD Plan ${example.tag} ${suffix}`, slug, status: 'active', plan_actual: example.plan, onboarding_done: true }).select('id').single();
      if (created.error) throw created.error;
      const fixture: Fixture = { ...example, id: created.data!.id as string, slug, email: '', amount: example.manual ? 275.25 : pricing.prices[example.plan] };
      fixtures.push(fixture);
      const theme = await db.from('restaurant_themes').insert({ restaurant_id: fixture.id, brand_name: 'AUD Plan', config: { orderTypes: example.modes } });
      if (theme.error) throw theme.error;
      const owner = await account(example.tag, 'RESTAURANT_OWNER', fixture.id);
      fixture.email = owner.email;
      const member = await db.from('restaurant_members').insert({ user_id: owner.id, restaurant_id: fixture.id, role: 'OWNER', status: 'active' });
      if (member.error) throw member.error;
      const billing = await db.from('restaurant_billing').upsert({ restaurant_id: fixture.id, monthly_fee: fixture.amount, auto_price: !example.manual, active: true, currency: 'GTQ', billing_day: 1, notes: 'AUD Prueba de lectura' });
      if (billing.error) throw billing.error;
      const invoice = await db.from('invoices').insert({ restaurant_id: fixture.id, concept: 'MONTHLY', amount: 88.88, currency: 'GTQ', period: '2026-10-01', status: 'PAID', paid_amount: 88.88, description: 'AUD Importe histórico' }).select('id').single();
      if (invoice.error) throw invoice.error;
      fixture.invoiceId = invoice.data!.id;
    }
    const admin = await account('super', 'SUPER_ADMIN');
    const session = await login(null, admin.email);
    const enrolled = await session.client.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'AUD Planes' });
    if (enrolled.error || !enrolled.data || enrolled.data.type !== 'totp') throw enrolled.error ?? new Error('No se creó el factor');
    const verified = await session.client.auth.mfa.challengeAndVerify({ factorId: enrolled.data.id, code: totp(enrolled.data.totp.secret) });
    if (verified.error) throw verified.error;
    superCookies = session.jar;
  });

  test.afterAll(async () => {
    const errors: Error[] = [];
    for (const fixture of fixtures) {
      const removed = await db.from('restaurants').delete().eq('id', fixture.id);
      if (removed.error) errors.push(new Error(removed.error.message));
    }
    for (const id of userIds) {
      const removed = await db.auth.admin.deleteUser(id);
      if (removed.error) errors.push(removed.error);
    }
    if (errors.length) throw new AggregateError(errors, 'Limpieza de fixtures de planes');
  });

  for (const example of cases) {
    test(`${example.tag}: web, comparación, Hoy, Suscripción y Super coinciden sin alterar el acuerdo`, async ({ page, context, browser }) => {
      const fixture = fixtures.find((item) => item.tag === example.tag)!;
      const contract = planPresentation({ plan: fixture.plan, pricing, billing: { auto_price: !fixture.manual, monthly_fee: fixture.amount, currency: 'GTQ' }, computedFee: pricing.prices[fixture.plan], orderTypes: fixture.modes });
      await visit(page, '/', async () => {
        await expect(page.locator('#planes').getByText(formatPlanAmount(contract.publicAmount), { exact: true }).first()).toBeVisible();
      });
      await visit(page, '/planes', async () => {
        await expect(page.getByRole('table').getByText(contract.publicLabel, { exact: true }).first()).toBeVisible();
      });
      await expect(page.getByRole('table').getByText('Facturación electrónica (FEL)', { exact: true })).toHaveCount(0);
      if (fixture.manual) await expect(page.getByText(contract.monthlyLabel, { exact: true })).toHaveCount(0);
      await login(context, fixture.email);
      await visit(page, `/panel/${fixture.slug}`, async () => {
        await expect(page.getByText(`Plan ${contract.name} · ${contract.monthlyLabel}`, { exact: false }).first()).toBeVisible();
      });
      await expect(page.getByText('Tu plan Estándar incluye pedidos para llevar.', { exact: false })).toHaveCount(0);
      await visit(page, `/panel/${fixture.slug}/suscripcion`, async () => {
        await expect(page.getByText(contract.monthlyLabel, { exact: true }).first()).toBeVisible();
      });
      await expect(page.getByText(`${contract.includedCount} funciones incluidas`, { exact: false })).toBeVisible();
      await expect(page.getByText(contract.selectedScope, { exact: false }).first()).toBeVisible();
      expect(await page.locator('[title^="Incluido en tu plan"]').count()).toBe(contract.includedCount);
      if (fixture.manual) {
        for (const width of [390, 768, 1280]) {
          for (const theme of ['light', 'dark']) {
            await context.addCookies([{ name: 'admin-theme', value: theme, url: origin }]);
            await page.setViewportSize({ width, height: 900 });
            await page.reload({ waitUntil: 'networkidle' });
            await page.screenshot({ path: test.info().outputPath(`suscripcion-${width}-${theme}.png`), fullPage: true });
            expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
          }
        }
        await page.getByRole('button', { name: /^Estándar/ }).click();
        await expect(page.getByText('Se conserva tu mensualidad acordada', { exact: false })).toBeVisible();
      }
      await visit(page, `/panel/${fixture.slug}/modulos`, async () => {
        await expect(page.getByText(contract.monthlyLabel, { exact: true }).first()).toBeVisible();
      });
      await expect(page.getByText('con configuración comprobada', { exact: false }).first()).toBeVisible();
      const superContext = await browser.newContext();
      try {
        await superContext.addCookies([...superCookies].map(([name, value]) => ({ name, value, url: origin })));
        const superPage = await superContext.newPage();
        await visit(superPage, `/super/restaurantes/${fixture.id}/plan`, async () => {
          await expect(superPage.getByText(contract.monthlyLabel, { exact: true }).first()).toBeVisible();
        });
        await expect(superPage.getByText(contract.selectedScope, { exact: false }).first()).toBeVisible();
      } finally { await superContext.close(); }
      const after = await db.from('restaurant_billing').select('monthly_fee,auto_price').eq('restaurant_id', fixture.id).single();
      expect(Number(after.data?.monthly_fee)).toBe(fixture.amount);
      expect(after.data?.auto_price).toBe(!fixture.manual);
      const invoice = await db.from('invoices').select('amount,paid_amount,period').eq('id', fixture.invoiceId!).single();
      expect(invoice.data).toMatchObject({ amount: 88.88, paid_amount: 88.88, period: '2026-10-01' });
    });
  }
});
