/** Quién administra el personal (auditoría 1.7): capacidad «personal», techo y responsables protegidos. */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  actor: null as null | Record<string, unknown>,
  perfiles: {} as Record<string, { role: string; restaurant_id: string }>,
  miembros: {} as Record<string, { role: string; permissions: string[] | null }>,
}));
const RID = '11111111-1111-4111-8111-111111111111';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'yo' } } }) },
    from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { role: 'RESTAURANT_STAFF', restaurant_id: RID } }) }) }) }),
  }),
}));
vi.mock('@/lib/db/membership', () => ({ resolveOwnRestaurantId: async () => RID }));
vi.mock('@/lib/auth/capacidades', async (original) => {
  const real = await original<typeof import('@/lib/auth/capacidades')>();
  return { ...real, actorEn: vi.fn(async () => h.actor) };
});
vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({
    from: (tabla: string) => {
      const filtros: Record<string, string> = {};
      const q = {
        select: () => q,
        eq: (c: string, v: string) => { filtros[c] = v; return q; },
        single: async () => ({ data: h.perfiles[filtros.id] ?? null }),
        maybeSingle: async () => ({ data: tabla === 'restaurant_members' ? h.miembros[filtros.user_id] ?? null : null }),
      };
      return q;
    },
  }),
}));

import { ownerCtx, assertStaffOfRestaurant } from '@/lib/auth/personal';

function actor(esDueno: boolean, permissions: string[] | null) {
  h.actor = { userId: 'yo', esSuper: false, esDueno, role: esDueno ? 'RESTAURANT_OWNER' : 'RESTAURANT_STAFF',
    permissions, memberRole: null, profileRestaurantId: RID, fullName: 'AUD' };
}

beforeEach(() => {
  h.perfiles = {
    cajero: { role: 'RESTAURANT_STAFF', restaurant_id: RID },
    encargado2: { role: 'RESTAURANT_STAFF', restaurant_id: RID },
    yo: { role: 'RESTAURANT_STAFF', restaurant_id: RID },
    ajeno: { role: 'RESTAURANT_STAFF', restaurant_id: '22222222-2222-4222-8222-222222222222' },
  };
  h.miembros = {
    cajero: { role: 'STAFF', permissions: ['caja.cobrar'] },
    encargado2: { role: 'STAFF', permissions: ['mesero', 'personal'] },
  };
});

describe('ownerCtx', () => {
  it('sin «personal» no administra', async () => {
    actor(false, ['mesero', 'caja.cobrar']);
    expect(await ownerCtx()).toBeNull();
  });
  it('con «personal» administra con su lista como techo', async () => {
    actor(false, ['mesero', 'personal']);
    expect(await ownerCtx()).toMatchObject({ as: 'MANAGER', ownPermissions: ['mesero', 'personal'] });
  });
  it('el dueño administra sin techo', async () => {
    actor(true, null);
    expect(await ownerCtx()).toMatchObject({ as: 'OWNER', ownPermissions: null });
  });
});

describe('assertStaffOfRestaurant', () => {
  it('un encargado edita al personal de su local, no a otro responsable ni a sí mismo', async () => {
    actor(false, ['mesero', 'personal']);
    const ctx = (await ownerCtx())!;
    expect(await assertStaffOfRestaurant(ctx, 'cajero')).toBe(true);
    expect(await assertStaffOfRestaurant(ctx, 'encargado2')).toBe(false);
    expect(await assertStaffOfRestaurant(ctx, 'yo')).toBe(false);
    expect(await assertStaffOfRestaurant(ctx, 'ajeno')).toBe(false);
  });
  it('el dueño edita a cualquier miembro del personal de su local', async () => {
    actor(true, null);
    const ctx = (await ownerCtx())!;
    expect(await assertStaffOfRestaurant(ctx, 'encargado2')).toBe(true);
    expect(await assertStaffOfRestaurant(ctx, 'ajeno')).toBe(false);
  });
});
