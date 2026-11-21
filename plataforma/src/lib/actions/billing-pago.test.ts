import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(), updateTag: vi.fn(), unstable_cache: (fn: unknown) => fn,
}));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'superadmin' } } }) },
    from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { role: 'SUPER_ADMIN' } }) }) }) }),
  }),
}));
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: () => ({ from: mocks.from, rpc: mocks.rpc }) }));

import { markInvoicePaid } from './billing';

const facturaId = '11111111-1111-4111-8111-111111111111';
const restauranteId = '22222222-2222-4222-8222-222222222222';
const leer = vi.fn();
const guardar = vi.fn();
const buscar = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: leer };
const actualizar = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: guardar };
const tabla = { select: vi.fn(), update: vi.fn() };

function pagar(importe: string) {
  const form = new FormData();
  form.set('invoiceId', facturaId);
  form.set('restaurantId', restauranteId);
  form.set('paid_amount', importe);
  form.set('payment_method', 'Transferencia');
  return markInvoicePaid(null, form);
}

beforeEach(() => {
  vi.clearAllMocks();
  leer.mockResolvedValue({ data: { amount: 99 }, error: null });
  guardar.mockResolvedValue({ data: { id: facturaId }, error: null });
  mocks.rpc.mockResolvedValue({ data: null, error: null });
  tabla.select.mockReturnValue(buscar);
  tabla.update.mockReturnValue(actualizar);
  mocks.from.mockReturnValue(tabla);
});

describe('registro de un pago comercial', () => {
  it.each(['10', '', '0', '99.001'])('mantiene el cobro pendiente con un monto insuficiente o inválido (%s)', async (importe) => {
    expect(await pagar(importe)).toHaveProperty('error');
    expect(tabla.update).not.toHaveBeenCalled();
  });

  it('registra el total solo sobre el cobro pendiente del restaurante', async () => {
    expect(await pagar('99.00')).toEqual({ ok: true, msg: 'Pago registrado.' });
    expect(tabla.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'PAID', paid_amount: 99 }));
    expect(actualizar.eq.mock.calls).toEqual([
      ['id', facturaId], ['restaurant_id', restauranteId], ['status', 'PENDING'], ['amount', 99],
    ]);
    expect(mocks.rpc).toHaveBeenCalledWith('leogin_sync_restaurant_status', { p_restaurant_id: restauranteId });
  });

  it('evita confirmar el pago si otra sesión cambió el cobro', async () => {
    guardar.mockResolvedValue({ data: null, error: null });
    expect(await pagar('99')).toEqual({ error: 'El cobro cambió. Actualiza la página antes de registrar el pago.' });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
