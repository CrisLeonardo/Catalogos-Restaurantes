/**
 * Guardia de Caja por capacidad (auditoría 1.7, C05): matriz por puesto
 * contra la regla que usan las acciones del servidor, sin pasar por la UI.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  actor: null as null | Record<string, unknown>,
  ciego: false,
}));

vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('@/lib/auth/firma-encargado', () => ({ verificarAprobador: vi.fn(async () => ({ error: 'PIN' })) }));
vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({
            data: { timezone: 'America/Guatemala', slug: 'aud', day_cutoff_minutes: 300, arqueo_ciego: h.ciego },
            error: null,
          }),
        }),
      }),
    }),
  }),
}));
vi.mock('@/lib/auth/capacidades', async (original) => {
  const real = await original<typeof import('@/lib/auth/capacidades')>();
  return { ...real, actorEn: vi.fn(async () => h.actor) };
});

import { authRestaurant, firmar } from '@/lib/caja/acceso';
import { permisosDePuesto, type PuestoKey } from '@/lib/permisos-trabajo';

const RID = '11111111-1111-4111-8111-111111111111';

function como(puesto: PuestoKey | 'dueno' | null, extra: string[] = []) {
  h.actor = puesto === null ? null : {
    userId: 'u1', esSuper: false, esDueno: puesto === 'dueno',
    role: puesto === 'dueno' ? 'RESTAURANT_OWNER' : 'RESTAURANT_STAFF',
    permissions: puesto === 'dueno' ? null : [...permisosDePuesto(puesto), ...extra],
    memberRole: null, profileRestaurantId: RID, fullName: 'AUD',
  };
}

beforeEach(() => { h.ciego = false; });

describe('matriz de Caja por puesto', () => {
  const casos: [PuestoKey | 'dueno', string, boolean][] = [
    ['caja', 'caja.abrir', true],
    ['caja', 'caja.cerrar', true],
    ['caja', 'caja.salida', true],
    ['caja', 'finanzas', false],
    ['caja', 'caja.devolver', false],
    ['mesero', 'caja.cerrar', false],
    ['mesero', 'caja.abrir', false],
    ['cocina', 'caja.abrir', false],
    ['recepcion', 'caja.cerrar', false],
    ['encargado', 'caja.devolver', true],
    ['encargado', 'caja.ver_esperado', true],
    ['encargado', 'finanzas', false],
    ['dueno', 'finanzas', true],
  ];
  it.each(casos)('%s · %s → %s', async (puesto, llave, esperado) => {
    como(puesto);
    expect(!!(await authRestaurant(RID, llave))).toBe(esperado);
  });

  it('la pestaña Caja no se abre sólo con cobrar (el mesero)', async () => {
    como('mesero');
    expect(await authRestaurant(RID)).toBeNull();
  });

  it('quien no pertenece al restaurante no entra', async () => {
    como(null);
    expect(await authRestaurant(RID, 'caja.cerrar')).toBeNull();
  });
});

describe('arqueo ciego', () => {
  it('el puesto Caja cuenta a ciegas cuando el local lo activa', async () => {
    como('caja');
    h.ciego = true;
    expect((await authRestaurant(RID, 'caja.cerrar'))?.ciego).toBe(true);
  });
  it('con «ver lo esperado» no es a ciegas', async () => {
    como('encargado');
    h.ciego = true;
    expect((await authRestaurant(RID, 'caja.cerrar'))?.ciego).toBe(false);
  });
  it('apagado, nadie cuenta a ciegas', async () => {
    como('caja');
    expect((await authRestaurant(RID, 'caja.cerrar'))?.ciego).toBe(false);
  });
});

describe('firma de correcciones', () => {
  it('el encargado firma solo; el puesto Caja necesita el PIN de alguien que pueda', async () => {
    como('encargado');
    const enc = (await authRestaurant(RID))!;
    expect(await firmar(enc, RID, {})).toEqual({ id: 'u1' });
    expect(await firmar(enc, RID, {}, 'caja.devolver')).toEqual({ id: 'u1' });

    como('caja');
    const caja = (await authRestaurant(RID))!;
    expect(caja.firmaSola).toBe(false);
    expect(await firmar(caja, RID, {})).toEqual({ error: 'Esto lo autoriza un encargado con su PIN.' });
  });
});
