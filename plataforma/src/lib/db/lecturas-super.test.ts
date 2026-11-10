import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/* Auditoría 2026-11-03, ficha 0.3 (N12, N13): lo que alimenta el inicio
   del super, el aviso nocturno y la bandeja de comprobantes. Un error de
   la base no puede salir como «todo sano» ni como «no hay nada». */

vi.mock('server-only', () => ({}));

let rpc: ReturnType<typeof vi.fn>;
let consulta: { data: unknown; error: unknown; count?: number | null };

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => {
    // Cadena de PostgREST: cada método devuelve la misma cadena, que al
    // final se resuelve con `consulta`.
    const cadena: Record<string, unknown> = {};
    for (const m of ['from', 'select', 'eq', 'order', 'limit', 'in']) cadena[m] = () => cadena;
    cadena.maybeSingle = () => Promise.resolve(consulta);
    cadena.then = (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve(consulta).then(ok, ko);
    cadena.rpc = rpc;
    cadena.storage = { from: () => ({ createSignedUrl: () => Promise.resolve({ data: null }) }) };
    return cadena;
  },
}));

import { getClientHealth } from './client-health';
import { comprobantesPorRevisar, contarComprobantesPorRevisar, ultimoComprobante } from './comprobantes';

const FALLO = { code: '57014', message: 'canceling statement due to statement timeout' };

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  rpc = vi.fn();
  consulta = { data: null, error: null };
});
afterEach(() => vi.restoreAllMocks());

describe('getClientHealth (N12)', () => {
  it('consulta fallida: estado error, nunca «todo en orden»', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: FALLO }).mockResolvedValueOnce({ data: [], error: null });
    const s = await getClientHealth();
    expect(s.estado).toBe('error');
    expect(s.restaurantes).toEqual([]);
  });

  it('funciones aún no creadas (migración 138 pendiente): falta-migracion', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } });
    expect((await getClientHealth()).estado).toBe('falta-migracion');
  });

  it('sin error y sin filas: ok (aquí sí es «todo en orden»)', async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    expect((await getClientHealth()).estado).toBe('ok');
  });
});

describe('comprobantes (N13)', () => {
  it('bandeja con la consulta fallida: error, no «no hay comprobantes»', async () => {
    consulta = { data: null, error: FALLO };
    expect(await comprobantesPorRevisar()).toEqual({ estado: 'error', items: [] });
  });

  it('bandeja sin la tabla (148 pendiente): falta-migracion', async () => {
    consulta = { data: null, error: { code: 'PGRST205' } };
    expect((await comprobantesPorRevisar()).estado).toBe('falta-migracion');
  });

  it('el contador fallido no es 0', async () => {
    consulta = { data: null, error: FALLO, count: null };
    const l = await contarComprobantesPorRevisar();
    expect(l.estado).toBe('error');
  });

  it('el último comprobante del dueño: error distinto de «nunca mandó uno»', async () => {
    consulta = { data: null, error: FALLO };
    expect((await ultimoComprobante('r1')).estado).toBe('error');
    consulta = { data: null, error: null };
    const sinNinguno = await ultimoComprobante('r1');
    expect(sinNinguno.estado).toBe('ok');
    expect(sinNinguno.datos).toBeNull();
  });
});
