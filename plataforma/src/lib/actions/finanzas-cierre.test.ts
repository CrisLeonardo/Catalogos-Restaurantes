import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LecturaDelTurno } from '@/lib/caja/turno-servidor';

const h = vi.hoisted(() => ({ rpc: vi.fn(), leer: vi.fn(), auth: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/caja/acceso', () => ({ authRestaurant: h.auth, firmar: vi.fn() }));
vi.mock('@/lib/caja/turno-servidor', () => ({ leerTurno: h.leer, hayPendientes: () => false }));
vi.mock('@/lib/activity', () => ({ logActivity: vi.fn() }));
vi.mock('@/lib/db/momentos', () => ({ getTuDia: vi.fn(async () => null) }));
vi.mock('@/lib/push', () => ({ sendPushToRestaurant: vi.fn() }));
import { closeCaja } from './finanzas';
import { logActivity } from '@/lib/activity';

const RID = '11111111-1111-4111-8111-111111111111';
const ACTOR = '22222222-2222-4222-8222-222222222222';
const CUT = '33333333-3333-4333-8333-333333333333';
const hasta = '2026-11-05T18:00:00.123456+00:00';
const input = { restaurantId: RID, counts: {}, openingFloat: 0 };

function lectura(): LecturaDelTurno {
  return { controlCaja: { revision: 12, ultimoCierreId: CUT }, dia: '2026-11-05', desde: '2026-11-05T11:00:00.000Z', hasta,
    abierto: null, ultimoCierre: null, cobros: [], gastos: [], gastosTotal: 0, propinas: [], propinasTotal: 0,
    pendientes: { mesas: [], domicilios: [], paraLlevar: [], total: 0 }, sinMigracion: false,
    cuadre: { porMetodo: {}, efectivo: 0, cobrado: 0, devoluciones: 0, devolucionesEfectivo: 0, pedidos: 0,
      liberadasSinCobrar: { pedidos: 0, total: 0 } } };
}
beforeEach(() => {
  vi.clearAllMocks();
  h.auth.mockResolvedValue({ db: { rpc: h.rpc }, tz: 'America/Guatemala', corte: 300,
    userId: ACTOR, cashierName: 'AUD Caja', firmaSola: true, puede: () => true, ciego: false });
  h.leer.mockResolvedValue(lectura());
  h.rpc.mockResolvedValue({ data: { recibo: { id: CUT, closedAt: hasta }, repetido: false }, error: null });
});

describe('cierre de caja no vuelve a la escritura sin revisión (0.18)', () => {
  it('sin autorización no lee ni confirma el libro', async () => {
    h.auth.mockResolvedValue(null);
    expect(await closeCaja(input)).toEqual({ error: 'No autorizado.' });
    expect(h.leer).not.toHaveBeenCalled();
    expect(h.rpc).not.toHaveBeenCalled();
  });
  it('sin control de la 166 rechaza sin intentar el cierre anterior', async () => {
    h.leer.mockResolvedValue({ ...lectura(), controlCaja: null });
    expect((await closeCaja(input)).error).toMatch(/migración 166/);
    expect(h.rpc).not.toHaveBeenCalled();
  });
  it('una revisión obsoleta no entrega un recibo ni registra cierre exitoso', async () => {
    h.rpc.mockResolvedValue({ data: null, error: { code: 'LGD04', message: 'La caja cambió.' } });
    expect(await closeCaja(input)).toEqual({ error: 'La caja cambió.' });
    expect(logActivity).not.toHaveBeenCalled();
  });
  it('confirma revisión, corte previo y timestamp SQL sin perder microsegundos', async () => {
    const result = await closeCaja(input);
    expect(result.result?.closedAt).toBe(hasta);
    expect(h.rpc).toHaveBeenCalledWith('leogin_confirmar_cierre_caja_con_recibo', expect.objectContaining({
      p_revision: 12, p_ultimo: CUT, p_hasta: hasta, p_restaurant: RID, p_actor: ACTOR,
      p_abierto: null, p_gastos: [],
    }));
    expect(logActivity).toHaveBeenCalledTimes(1);
  });
});
