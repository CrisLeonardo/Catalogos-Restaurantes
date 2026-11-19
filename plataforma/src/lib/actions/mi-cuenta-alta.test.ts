import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ from: vi.fn(), precio: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'dueño', email: 'qa@example.com' } } }) } }),
}));
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: () => ({ from: mocks.from, rpc: mocks.precio }) }));
vi.mock('@/lib/rate-limit', () => ({ rateLimit: async () => true }));
vi.mock('@/lib/db/membership', () => ({ getMyMemberships: async () => [] }));
vi.mock('@/lib/db/billing', () => ({ getPricingSettings: async () => ({ trialDays: 0 }) }));
vi.mock('@/lib/analytics-server', () => ({ registrarEvento: async () => {} }));
vi.mock('@/lib/slug', () => ({ slugify: () => 'cafe-de-prueba', validateSlug: () => null, uniqueSlug: async () => 'cafe-de-prueba' }));

import { createAnotherRestaurant } from './mi-cuenta';

const id = '11111111-1111-4111-8111-111111111111';
const ok = { error: null };
const fallo = { error: { message: 'fallo de prueba' } };
const tema = vi.fn();
const cobro = vi.fn();
const eliminar = vi.fn();
const membresia = vi.fn();

function alta(plan = 'EN_LINEA') {
  const form = new FormData();
  form.set('name', 'Café de prueba');
  form.set('plan_code', plan);
  return createAnotherRestaurant(null, form);
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  tema.mockResolvedValue(ok);
  cobro.mockResolvedValue(ok);
  eliminar.mockResolvedValue(ok);
  membresia.mockResolvedValue(ok);
  mocks.precio.mockResolvedValue(ok);
  const tablas: Record<string, object> = {
    profiles: { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) },
    restaurants: {
      insert: () => ({ select: () => ({ single: async () => ({ data: { id }, error: null }) }) }),
      delete: () => ({ eq: eliminar }),
    },
    restaurant_themes: { insert: tema },
    restaurant_billing: { insert: cobro },
    restaurant_members: { insert: membresia },
  };
  mocks.from.mockImplementation((tabla: string) => tablas[tabla]);
});

afterEach(() => vi.restoreAllMocks());

describe('alta comercial', () => {
  it('rechaza un plan desconocido antes de crear o facturar el local', async () => {
    expect(await alta('DESCONOCIDO')).toEqual({ error: 'Elige un plan válido para tu restaurante.' });
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it.each([['tema', tema], ['facturación', cobro], ['precio', mocks.precio]])('revierte el alta si falla %s', async (_, operacion) => {
    operacion.mockResolvedValue(fallo);
    expect(await alta()).toEqual({ error: 'No se pudo terminar de crear el restaurante. Inténtalo de nuevo.' });
    expect(eliminar).toHaveBeenCalledWith('id', id);
    expect(membresia).not.toHaveBeenCalled();
  });

  it('asigna la membresía después de configurar la mensualidad', async () => {
    expect(await alta()).toEqual({ url: '/panel/cafe-de-prueba?welcome=1' });
    expect(cobro).toHaveBeenCalledWith(expect.objectContaining({ restaurant_id: id, active: true, auto_price: true }));
    expect(mocks.precio).toHaveBeenCalledWith('leogin_apply_auto_price', { p_restaurant_id: id });
    expect(mocks.precio.mock.invocationCallOrder[0]).toBeLessThan(membresia.mock.invocationCallOrder[0]);
    expect(eliminar).not.toHaveBeenCalled();
  });
});
