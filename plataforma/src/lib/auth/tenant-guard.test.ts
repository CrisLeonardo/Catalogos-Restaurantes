import { describe, expect, it } from 'vitest';
import { decideTenantAccess, type TenantGuardInput } from './tenant-guard';

/* ── Contexto ─────────────────────────────────────────────────────
   La cookie del personal vale en TODO el dominio: quien inició sesión en
   un restaurante llega autenticado al subdominio de cualquier otro. Lo
   único que separa los paneles de dos clientes distintos es esta
   decisión. Un fallo aquí no se ve como un error: se ve como el dueño de
   un restaurante mirando los pedidos, los clientes y las finanzas de
   otro.

   Reproducido en local el 2026-08-08 antes de escribir esto:
   /admin/cocina abría en el subdominio ajeno (el KDS no tenía candado) y
   un `x-tenant-slug` mandado por el cliente cambiaba el tenant que veía
   el servidor. */

const ADMIN_URL = (slug: string) => `https://${slug}-admin.leogin.online`;

const REST_A = { id: 'rest-a', organizationId: null };
const REST_B = { id: 'rest-b', organizationId: null };

function input(over: Partial<TenantGuardInput> = {}): TenantGuardInput {
  return {
    role: 'RESTAURANT_OWNER',
    profileRestaurantId: 'rest-a',
    profileOrganizationId: null,
    tenantSlug: 'restaurante-a',
    tenant: REST_A,
    ownSlug: 'restaurante-a',
    adminUrlFor: ADMIN_URL,
    ...over,
  };
}

describe('dueño / staff de un restaurante', () => {
  it('entra a su propio panel', () => {
    expect(decideTenantAccess(input())).toEqual({ allow: true });
  });

  it('en el subdominio de OTRO restaurante lo manda a su panel, no al ajeno', () => {
    const d = decideTenantAccess(input({ tenantSlug: 'restaurante-b', tenant: REST_B }));
    expect(d).toEqual({
      allow: false,
      redirectTo: 'https://restaurante-a-admin.leogin.online/menu',
    });
  });

  it('el rol no cambia la regla: mesero y cocina se rebotan igual', () => {
    for (const role of ['RESTAURANT_STAFF', 'RESTAURANT_WAITER']) {
      const d = decideTenantAccess(input({ role, tenantSlug: 'restaurante-b', tenant: REST_B }));
      expect(d.allow).toBe(false);
    }
  });

  it('sin restaurante propio al que volver, al login', () => {
    const d = decideTenantAccess(
      input({ tenantSlug: 'restaurante-b', tenant: REST_B, ownSlug: null, profileRestaurantId: null }),
    );
    expect(d).toEqual({ allow: false, redirectTo: '/admin/login' });
  });
});

describe('super admin', () => {
  const sa = { role: 'SUPER_ADMIN', profileRestaurantId: null, ownSlug: null };

  it('entra directo a cualquier restaurante, sin pedir nada extra', () => {
    const d = decideTenantAccess(input({ ...sa, tenantSlug: 'restaurante-b', tenant: REST_B }));
    expect(d).toEqual({ allow: true });
  });
});

describe('quien administra un grupo', () => {
  // Desde la migración 116 no hay rol que lo diga: lo dice tener organización.
  const go = { role: 'RESTAURANT_OWNER', profileRestaurantId: null, profileOrganizationId: 'org-1', ownSlug: null };

  it('entra a una sucursal de su grupo', () => {
    const d = decideTenantAccess(
      input({ ...go, tenantSlug: 'sucursal', tenant: { id: 'rest-b', organizationId: 'org-1' } }),
    );
    expect(d).toEqual({ allow: true });
  });

  it('no entra a un restaurante de otro grupo aunque sea legible por RLS', () => {
    // restaurants_select_active deja LEER cualquier restaurante activo (lo
    // necesita el menú público). Poder leerlo nunca puede implicar entrar.
    const d = decideTenantAccess(
      input({ ...go, tenantSlug: 'ajeno', tenant: { id: 'rest-b', organizationId: 'org-2' } }),
    );
    expect(d).toEqual({ allow: false, redirectTo: '/mi-cuenta' });
  });

  it('sin organización en su perfil tampoco entra', () => {
    const d = decideTenantAccess(
      input({ ...go, profileOrganizationId: null, tenant: { id: 'rest-b', organizationId: 'org-1' } }),
    );
    expect(d.allow).toBe(false);
  });
});

describe('varios restaurantes con una sola cuenta (migración 113)', () => {
  it('el dueño de A y B entra a B, aunque su perfil apunte a A', () => {
    // El caso que abre todo el modelo de membresías: `profiles.restaurant_id`
    // es UN id, así que sin `isMember` el dueño de dos negocios rebotaba de su
    // propio segundo restaurante a "su" panel, sin entender por qué.
    expect(
      decideTenantAccess(input({
        isMember: true,
        tenantSlug: 'restaurante-b',
        tenant: REST_B,
      })),
    ).toEqual({ allow: true });
  });

  it('el gerente invitado a una sucursal entra a esa sucursal', () => {
    expect(
      decideTenantAccess(input({
        role: 'RESTAURANT_STAFF',
        isMember: true,
        profileRestaurantId: null,
        ownSlug: null,
        tenantSlug: 'restaurante-b',
        tenant: REST_B,
      })),
    ).toEqual({ allow: true });
  });

  it('sin membresía sigue rebotando al panel propio', () => {
    expect(
      decideTenantAccess(input({
        isMember: false,
        tenantSlug: 'restaurante-b',
        tenant: REST_B,
      })),
    ).toEqual({ allow: false, redirectTo: `${ADMIN_URL('restaurante-a')}/menu` });
  });

  it('una membresía no cambia nada si el grupo es ajeno', () => {
    // Quien administra un grupo se mide por su organización. Si además
    // tuviera membresía en esa sucursal, entra por esa vía — pero sin ella,
    // pertenecer a OTRO grupo nunca alcanza.
    expect(
      decideTenantAccess(input({
        role: 'RESTAURANT_OWNER',
        isMember: false,
        profileRestaurantId: null,
        profileOrganizationId: 'org-1',
        ownSlug: null,
        tenantSlug: 'ajeno',
        tenant: { id: 'rest-b', organizationId: 'org-2' },
      })),
    ).toEqual({ allow: false, redirectTo: '/mi-cuenta' });
  });
});

describe('casos borde', () => {
  it('sin slug de tenant (dominio raíz, login central) no hay nada que candar', () => {
    expect(decideTenantAccess(input({ tenantSlug: null }))).toEqual({ allow: true });
  });

  it('slug que no resuelve a ningún restaurante: fuera del panel', () => {
    const d = decideTenantAccess(input({ tenantSlug: 'no-existe', tenant: null }));
    expect(d).toEqual({
      allow: false,
      redirectTo: 'https://restaurante-a-admin.leogin.online/menu',
    });
  });
});
