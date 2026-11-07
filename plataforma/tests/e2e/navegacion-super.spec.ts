import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';

try {
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const match = line.trim().match(/^([A-Z_]+)=(.*)$/);
    if (match && !(match[1] in process.env)) process.env[match[1]] = match[2].trim();
  }
} catch { /* CI exporta su entorno local. */ }
const api = process.env.NEXT_PUBLIC_SUPABASE_URL!;
if (!api || !['localhost', '127.0.0.1', '[::1]'].includes(new URL(api).hostname)) throw new Error('Navegación E2E solo admite Supabase local.');
const db = createClient(api, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
const origin = 'http://localhost:3000';

/** Código de la app autenticadora de la cuenta efímera: no se omite MFA. */
function totp(secret: string) {
  const bits = [...secret].map((c) => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.indexOf(c).toString(2).padStart(5, '0')).join('');
  const key = Buffer.from(bits.match(/.{8}/g)!.map((byte) => parseInt(byte, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)));
  const digest = createHmac('sha1', key).update(counter).digest();
  return ((digest.readUInt32BE(digest[19] & 15) & 0x7fffffff) % 1_000_000).toString().padStart(6, '0');
}
function checked<T extends { data: unknown; error: { message: string } | null }>(result: T): T['data'] {
  if (result.error) throw new Error(result.error.message);
  return result.data;
}

test('la cápsula de superadmin conserva todos los destinos y el foco', async ({ page, context }) => {
  test.setTimeout(240_000);
  const email = `aud-nav-${Date.now()}@local.test`;
  const { user } = checked(await db.auth.admin.createUser({ email, email_confirm: true }));
  if (!user) throw new Error('No se creó el superadmin de prueba.');
  try {
    checked(await db.from('profiles').upsert({ id: user.id, role: 'SUPER_ADMIN', full_name: 'AUD navegación' }));
    const link = checked(await db.auth.admin.generateLink({ type: 'magiclink', email }));
    if (!link.properties) throw new Error('No se generó el enlace de acceso.');
    const jar = new Map<string, string>();
    const session = createServerClient(api, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      cookies: {
        getAll: () => [...jar].map(([name, value]) => ({ name, value })),
        setAll: async (cookies) => {
          for (const { name, value } of cookies) jar.set(name, value);
          await context.addCookies(cookies.map(({ name, value }) => ({ name, value, url: origin })));
        },
      },
    });
    checked(await session.auth.verifyOtp({ type: 'magiclink', token_hash: link.properties.hashed_token }));
    const factor = checked(await session.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'AUD navegación' }));
    if (!factor) throw new Error('No se inscribió la app autenticadora.');
    checked(await session.auth.mfa.challengeAndVerify({ factorId: factor.id, code: totp(factor.totp.secret) }));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${origin}/super`);
    const nav = page.getByRole('navigation', { name: 'Navegación de superadmin' });
    await expect(nav).toBeVisible({ timeout: 90_000 });
    await expect(nav.getByRole('link')).toHaveCount(3);
    await expect(nav.getByRole('link', { name: 'Inicio', exact: true })).toHaveAttribute('aria-current', 'page');
    const more = nav.getByRole('button', { name: 'Más', exact: true });
    await more.focus();
    await more.press('Enter');
    const sheet = page.getByRole('dialog', { name: 'Más destinos de superadmin' });
    await expect(sheet.getByRole('link')).toHaveCount(4);
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
    await expect(more).toBeFocused();
    for (const destination of ['Grupos', 'Métricas', 'Finanzas', 'Ajustes']) {
      await more.click();
      await sheet.getByRole('link', { name: destination, exact: true }).click();
      await expect(sheet).toBeHidden();
      await expect(page.getByRole('heading', { level: 1, name: destination, exact: true })).toBeVisible({ timeout: 60_000 });
      await expect(more).toHaveAttribute('aria-current', 'page');
    }
    for (const width of [320, 390, 768]) {
      await page.setViewportSize({ width, height: 844 });
      for (const item of await nav.locator('a,button').all()) {
        const box = await item.boundingBox();
        expect(box!.height).toBeGreaterThanOrEqual(44);
        expect(box!.width).toBeGreaterThanOrEqual(44);
        expect(await item.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
      }
    }
    await page.setViewportSize({ width: 1280, height: 900 });
    await expect(nav).toBeVisible();
    await expect(nav.getByRole('link')).toHaveCount(7);
    await expect(more).toBeHidden();
  } finally {
    checked(await db.auth.admin.deleteUser(user.id));
  }
});
