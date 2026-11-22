/** El equipo de un local se lee de la membresía (auditoría 2026-11-21). */
import { describe, expect, it } from 'vitest';
import { componerEquipo, esCuentaDelLocal, esPersonalDelLocal, planDeRetiro, type PerfilEquipo } from '@/lib/equipo-reglas';

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const perfil = (id: string, role: string, casa: string | null, permissions: string[] | null = null): PerfilEquipo =>
  ({ id, full_name: id, permissions, role, restaurant_id: casa });

describe('esPersonalDelLocal', () => {
  it('con membresía aquí manda la membresía, aunque su casa sea otro local', () => {
    expect(esPersonalDelLocal({ role: 'RESTAURANT_OWNER', restaurant_id: A }, { role: 'STAFF', status: 'active' }, B)).toBe(true);
  });
  it('una membresía de dueño, retirada o del superadmin no es personal', () => {
    expect(esPersonalDelLocal({ role: 'RESTAURANT_OWNER', restaurant_id: B }, { role: 'OWNER', status: 'active' }, B)).toBe(false);
    expect(esPersonalDelLocal({ role: 'RESTAURANT_STAFF', restaurant_id: B }, { role: 'STAFF', status: 'revoked' }, B)).toBe(false);
    expect(esPersonalDelLocal({ role: 'SUPER_ADMIN', restaurant_id: null }, { role: 'STAFF', status: 'active' }, B)).toBe(false);
  });
  it('sin membresía, la cuenta vieja cuenta sólo en su local de casa', () => {
    expect(esPersonalDelLocal({ role: 'RESTAURANT_STAFF', restaurant_id: B }, null, B)).toBe(true);
    expect(esPersonalDelLocal({ role: 'RESTAURANT_WAITER', restaurant_id: B }, null, B)).toBe(true);
    expect(esPersonalDelLocal({ role: 'RESTAURANT_STAFF', restaurant_id: A }, null, B)).toBe(false);
    expect(esPersonalDelLocal({ role: 'RESTAURANT_OWNER', restaurant_id: B }, null, B)).toBe(false);
  });
});

describe('esCuentaDelLocal', () => {
  it('sólo la cuenta que no tiene otros locales recibe PIN o contraseña desde aquí', () => {
    expect(esCuentaDelLocal({ restaurant_id: B }, [B], B)).toBe(true);
    expect(esCuentaDelLocal({ restaurant_id: B }, [], B)).toBe(true);
    expect(esCuentaDelLocal({ restaurant_id: B }, [B, A], B)).toBe(false);
    expect(esCuentaDelLocal({ restaurant_id: A }, [B], B)).toBe(false);
    expect(esCuentaDelLocal(null, [], B)).toBe(false);
  });
});

describe('planDeRetiro', () => {
  it('quien sólo trabaja aquí pierde la cuenta, como antes', () => {
    expect(planDeRetiro({ restaurant_id: B }, [{ restaurantId: B, role: 'STAFF', permissions: ['mesero'] }], B))
      .toEqual({ tipo: 'borrar-cuenta' });
  });
  it('quien tiene otro local conserva la cuenta y se muda a su local de dueño', () => {
    expect(planDeRetiro({ restaurant_id: B }, [
      { restaurantId: B, role: 'STAFF', permissions: ['mesero'] },
      { restaurantId: 'c', role: 'STAFF', permissions: ['cocina'] },
      { restaurantId: A, role: 'OWNER', permissions: null },
    ], B)).toEqual({ tipo: 'retirar-membresia', nuevaCasa: { restaurantId: A, role: 'RESTAURANT_OWNER', permissions: null } });
  });
  it('si su casa ya es otro local, sólo se retira la membresía', () => {
    expect(planDeRetiro({ restaurant_id: A }, [{ restaurantId: A, role: 'OWNER', permissions: null }], B))
      .toEqual({ tipo: 'retirar-membresia', nuevaCasa: null });
    expect(planDeRetiro({ restaurant_id: A }, [], B)).toEqual({ tipo: 'retirar-membresia', nuevaCasa: null });
  });
});

describe('componerEquipo', () => {
  it('suma a quien entra por membresía y deja fuera a dueños y retirados', () => {
    const equipo = componerEquipo(
      [
        { user_id: 'cajera', role: 'STAFF', status: 'active', permissions: ['caja.cobrar'] },
        { user_id: 'socia', role: 'STAFF', status: 'active', permissions: ['cocina'] },
        { user_id: 'dueno', role: 'OWNER', status: 'active', permissions: null },
        { user_id: 'ido', role: 'STAFF', status: 'revoked', permissions: ['mesero'] },
      ],
      [
        perfil('cajera', 'RESTAURANT_STAFF', B, ['caja.cobrar']),
        perfil('viejo', 'RESTAURANT_WAITER', B),
        perfil('ido', 'RESTAURANT_STAFF', B, ['mesero']),
        perfil('socia', 'RESTAURANT_OWNER', A),
        perfil('dueno', 'RESTAURANT_OWNER', B),
        perfil('cajera', 'RESTAURANT_STAFF', B, ['caja.cobrar']),
      ],
      B,
    );
    expect(equipo.map((p) => p.id)).toEqual(['cajera', 'viejo', 'socia']);
    // La dueña de otro local, aquí, es personal con los permisos de aquí.
    expect(equipo.find((p) => p.id === 'socia')).toMatchObject({ role: 'RESTAURANT_STAFF', permissions: ['cocina'] });
  });
});
