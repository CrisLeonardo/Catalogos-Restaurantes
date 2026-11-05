import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  slug: 'sucursal-b' as string | null,
  tenant: { id: 'b' } as { id: string } | null,
  memberships: [] as { restaurant_id: string; role: string; permissions: string[] | null }[],
}));
vi.mock('server-only', () => ({}));
vi.mock('react', () => ({ cache: (fn: unknown) => fn }));
vi.mock('next/headers', () => ({ headers: async () => new Headers(h.slug ? { 'x-tenant-slug': h.slug } : {}) }));
vi.mock('@/lib/supabase/server', () => ({ getStaffUser: async () => ({ data: { user: { id: 'u' } } }) }));
vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      const result = { data: table === 'restaurants' ? h.tenant : h.memberships, error: null };
      const query = {
        select: () => query, eq: () => query,
        maybeSingle: async () => result,
        then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve),
      };
      return query;
    },
  }),
}));

import { resolveOwnRestaurantId } from './membership';

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://localhost:54321');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'local');
  h.slug = 'sucursal-b'; h.tenant = { id: 'b' }; h.memberships = [];
});

describe('la sucursal elegida no cae silenciosamente al restaurante del perfil', () => {
  it('dueño moderno sin restaurant_id resuelve B por su membresía', async () => {
    h.memberships = [{ restaurant_id: 'b', role: 'OWNER', permissions: null }];
    expect(await resolveOwnRestaurantId(null)).toBe('b');
  });
  it('sin acceso a B no escribe por accidente en A', async () => {
    expect(await resolveOwnRestaurantId('a')).toBeNull();
  });
  it('un slug inexistente tampoco termina escribiendo en A', async () => {
    h.tenant = null;
    expect(await resolveOwnRestaurantId('a')).toBeNull();
  });
  it('conserva el acceso legado cuando no hay sucursal en la ruta', async () => {
    h.slug = null;
    expect(await resolveOwnRestaurantId('a')).toBe('a');
  });
});
