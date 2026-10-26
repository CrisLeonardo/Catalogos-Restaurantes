import { describe, it, expect, vi, beforeAll } from 'vitest';

/* ============================================================
   LA COOKIE DEL COMENSAL BAJO EL LINK ESTABLE (BIL-03)
   ------------------------------------------------------------
   Servidor y navegador tienen que escribir la sesión del comensal en
   `/m/<ref>`, SIN barra final. Con `/m/<ref>/` la portada del QR general
   (`/m/<ref>`, a donde Next redirige `/m/<ref>/`) no la recibía: el
   comensal entraba con Google o por la billetera y el menú no lo veía.

   Aquí se mira solo qué ruta le pasa cada cliente a @supabase/ssr; la
   mudanza de la cookie vieja la prueban las pruebas del proxy.
   ============================================================ */

const h = vi.hoisted(() => ({
  servidor: null as null | { cookies: { setAll: (c: unknown[]) => void } },
  navegador: [] as Record<string, unknown>[],
  escritas: [] as { name: string; options: Record<string, unknown> }[],
}));

vi.mock('@supabase/ssr', () => ({
  createServerClient: (_u: string, _k: string, opts: NonNullable<typeof h.servidor>) => {
    h.servidor = opts;
    return { auth: {} };
  },
  createBrowserClient: (_u: string, _k: string, opts: { cookieOptions?: Record<string, unknown> }) => {
    h.navegador.push(opts.cookieOptions ?? {});
    return { auth: {} };
  },
}));

vi.mock('next/headers', () => ({
  cookies: async () => ({
    getAll: () => [],
    set: (name: string, _value: string, options: Record<string, unknown>) => h.escritas.push({ name, options }),
  }),
  headers: async () => new Headers({ host: 'distleogin.com', 'x-tenant-stable-id': 'rincon502' }),
}));

beforeAll(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://abcdefghij.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon';
  process.env.NEXT_PUBLIC_ROOT_DOMAIN = 'distleogin.com';
});

describe('servidor: createDinerClient bajo /m/<ref>', () => {
  it('escribe la sesión en /m/<ref>, sin barra final', async () => {
    const { createDinerClient } = await import('./server');
    await createDinerClient();
    h.servidor!.cookies.setAll([
      { name: 'sb-leogin-diner-v2', value: 'SESION', options: { path: '/', maxAge: 100 } },
    ]);

    expect(h.escritas).toEqual([
      { name: 'sb-leogin-diner-v2', options: { path: '/m/rincon502', maxAge: 100 } },
    ]);
  });
});

describe('navegador: createDinerClient bajo /m/<ref>', () => {
  it('en una subpágina también usa /m/<ref>, no /m/<ref>/', async () => {
    const definir = (nombre: string, valor: unknown) =>
      Object.defineProperty(globalThis, nombre, { value: valor, configurable: true, writable: true });
    definir('window', { location: { hostname: 'distleogin.com', pathname: '/m/rincon502/4' } });

    const { createDinerClient } = await import('./client');
    createDinerClient();

    expect(h.navegador.at(-1)).toMatchObject({ path: '/m/rincon502', name: 'sb-leogin-diner-v2' });
  });
});
