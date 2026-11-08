import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  authenticated: true,
  permissions: ['pedidos'] as string[] | null,
  writes: [] as string[],
}));
vi.mock('server-only', () => ({}));
vi.mock('react', async (original) => ({ ...await original<typeof import('react')>(), cache: (fn: unknown) => fn }));
vi.mock('next/headers', () => ({ headers: async () => new Headers({ 'x-tenant-slug': 'b' }) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), updateTag: vi.fn() }));
vi.mock('next/server', () => ({ after: vi.fn() }));
vi.mock('@/lib/activity', () => ({ logActivity: vi.fn() }));
vi.mock('@/lib/db/admin', () => ({
  resolveGroupBranchId: async () => null,
  canActOnGroupBranch: async () => false,
  getAdminMenu: vi.fn(),
}));
vi.mock('@/lib/supabase/server', () => ({
  getStaffUser: async () => ({ data: { user: h.authenticated ? { id: 'u' } : null } }),
  createClient: async () => client(),
}));
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: () => client() }));

function client() {
  return {
    // El getUser crudo sigue viendo la sesión AAL1: la acción debe usar getStaffUser.
    auth: { getUser: async () => ({ data: { user: { id: 'u' } } }) },
    from: (table: string) => {
      const data = table === 'profiles'
        ? { role: 'RESTAURANT_OWNER', restaurant_id: null, permissions: null }
        : table === 'restaurant_members'
          ? [{ restaurant_id: 'b', role: 'STAFF', permissions: h.permissions }]
          : { id: 'b' };
      const result = { data, error: null };
      const query = {
        select: () => query, eq: () => query, order: () => query, limit: () => query,
        single: async () => result, maybeSingle: async () => result,
        insert: () => { h.writes.push(table); return query; },
        update: () => { h.writes.push(table); return query; },
        then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve),
      };
      return query;
    },
  };
}

import { createCategoryModal } from './categories';
import { createProduct, getProductsPdfData } from './products';
import { saveInventory } from './inventory';
import { saveChannelMapping } from './channels';
import { connectWhatsApp } from './whatsapp';
import { saveDriver } from './drivers';

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:54321');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'local');
  h.authenticated = true; h.permissions = ['pedidos']; h.writes = [];
});

const form = () => {
  const data = new FormData();
  data.set('restaurantId', 'b'); data.set('name', 'AUD'); data.set('nombre', 'AUD');
  return data;
};
const cases = [
  ['categorías', () => createCategoryModal(null, form())],
  ['productos', () => createProduct(null, form())],
  ['inventario', () => saveInventory(null, form())],
  ['canales', () => saveChannelMapping('b', { channel: 'rappi', externalSku: 'AUD', productId: 'p' })],
  ['WhatsApp', () => connectWhatsApp(null, form())],
  ['repartidores', () => saveDriver(null, form())],
  ['exportación', () => getProductsPdfData('00000000-0000-4000-8000-000000000001')],
] as const;

describe('las acciones consultan el permiso en la sucursal y el segundo factor', () => {
  it.each(cases)('%s: ser dueño en A no concede permisos en B', async (_name, run) => {
    expect(await run()).toEqual({ error: 'No autorizado.' });
    expect(h.writes).toEqual([]);
  });
  it.each(cases)('%s: una sesión pendiente de MFA no ejecuta la acción', async (_name, run) => {
    h.authenticated = false;
    expect(await run()).toEqual({ error: 'No autorizado.' });
    expect(h.writes).toEqual([]);
  });
  it('también permite la sección delegada aunque el perfil global no la describa', async () => {
    h.permissions = ['categorias'];
    // Pasa el candado y llega a la escritura. El formulario mínimo solo necesita nombre.
    expect(await createCategoryModal(null, form())).toEqual({ success: true });
    expect(h.writes).toContain('categories');
  });
});
