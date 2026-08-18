import { describe, it, expect, beforeAll } from 'vitest';

/* ============================================================
   DOS SESIONES, DOS CLIENTES
   ------------------------------------------------------------
   `createBrowserClient` de @supabase/ssr guarda UN cliente por página y
   se lo devuelve a todo el que lo pida, ignorando las opciones de las
   llamadas siguientes. Con las dos sesiones de esta app —personal y
   comensal— eso las funde en una, con la clave de cookie del que se
   creara primero.

   El sintoma en produccion fue el login con Google del panel muriendo con
   "PKCE code verifier not found in storage": el verificador se habia
   guardado bajo la clave del comensal y el callback del personal buscaba
   la suya.
   ============================================================ */

/** `storageKey` es protected en el tipo de Supabase; en runtime está ahí. */
type ClienteConClave = { auth: { storageKey: string } };
let createClient: () => ClienteConClave;
let createDinerClient: () => ClienteConClave;

beforeAll(async () => {
  // El módulo se evalúa como si estuviera en el navegador.
  let jar = '';
  const doc = {
    get cookie() { return jar; },
    set cookie(v: string) { const nv = v.split(';')[0]; jar = jar ? `${jar}; ${nv}` : nv; },
  };
  // `navigator` en Node solo tiene getter: se define, no se asigna.
  const definir = (nombre: string, valor: unknown) =>
    Object.defineProperty(globalThis, nombre, { value: valor, configurable: true, writable: true });
  definir('document', doc);
  definir('window', { document: doc, location: { origin: 'https://demo-admin.distleogin.com', pathname: '/' } });
  definir('navigator', { userAgent: 'node' });
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://abcdefghij.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon';
  process.env.NEXT_PUBLIC_ROOT_DOMAIN = 'distleogin.com';

  const mod = await import('./client');
  createClient = mod.createClient as unknown as typeof createClient;
  createDinerClient = mod.createDinerClient as unknown as typeof createDinerClient;
});

describe('createClient / createDinerClient en el navegador', () => {
  it('no se pisan: cada sesión tiene su cliente y su clave de cookie', () => {
    // A propósito el COMENSAL primero: es el orden que rompía el login del
    // panel (una página que monta algo del menú antes que el botón de Google).
    const comensal = createDinerClient();
    const personal = createClient();

    expect(personal).not.toBe(comensal);
    expect(comensal.auth.storageKey).toBe('sb-leogin-diner-v2');
    expect(personal.auth.storageKey).toBe('sb-abcdefghij-auth-token');
  });

  it('y en el otro orden pasa lo mismo', () => {
    const personal = createClient();
    const comensal = createDinerClient();
    expect(personal.auth.storageKey).toBe('sb-abcdefghij-auth-token');
    expect(comensal.auth.storageKey).toBe('sb-leogin-diner-v2');
  });

  it('devuelve siempre el mismo cliente por sesión', () => {
    // Sin esto cada render crearía uno nuevo: se perderían las
    // suscripciones de Realtime del panel.
    expect(createClient()).toBe(createClient());
    expect(createDinerClient()).toBe(createDinerClient());
  });
});
