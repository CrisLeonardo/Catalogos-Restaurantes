import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { cupoDeUsuarios, errorDeCupo, lugaresOcupados, verificarCupo } from './cupo-usuarios';

describe('cupo de usuarios por plan (LZ-08)', () => {
  it('Básico y En línea: solo el dueño; Estándar: dos; Premium y Pro: sin tope', () => {
    expect(cupoDeUsuarios('BASICO')).toBe(1);
    expect(cupoDeUsuarios('EN_LINEA')).toBe(1);
    expect(cupoDeUsuarios('ESTANDAR')).toBe(2);
    expect(cupoDeUsuarios('PREMIUM')).toBeNull();
    expect(cupoDeUsuarios('PRO')).toBeNull();
  });

  it('un plan desconocido se trata como Básico, nunca como ilimitado', () => {
    expect(cupoDeUsuarios(null)).toBe(1);
    expect(cupoDeUsuarios('INVENTADO')).toBe(1);
  });

  it('el dueño ocupa el único lugar de En línea y se le dice a qué plan subir', () => {
    expect(errorDeCupo('EN_LINEA', 0)).toBeNull();
    expect(errorDeCupo('EN_LINEA', 1)).toBe('Tu plan En línea incluye 1 usuario: tú. Para sumar a tu equipo, sube a Estándar.');
  });

  it('Estándar deja sumar a una persona y después pide liberar o subir a Premium', () => {
    expect(errorDeCupo('ESTANDAR', 1)).toBeNull();
    expect(errorDeCupo('ESTANDAR', 2)).toMatch(/incluye 2 usuarios contándote a ti.*sube a Premium/);
  });

  it('quien ya excede no pierde a nadie: solo no puede sumar más', () => {
    expect(errorDeCupo('ESTANDAR', 5)).not.toBeNull();
    expect(errorDeCupo('PREMIUM', 50)).toBeNull();
  });
});

/** Cliente falso: cada `from` responde el conteo dado y guarda los filtros. */
function clienteFalso(conteos: Record<string, number | Error>, plan: string | null = 'ESTANDAR') {
  const filtros: Record<string, unknown[][]> = {};
  const db = {
    from(tabla: string) {
      const registro: unknown[][] = (filtros[tabla] = []);
      const res = conteos[tabla];
      const cadena = {
        select: () => cadena,
        eq: (...a: unknown[]) => { registro.push(['eq', ...a]); return cadena; },
        in: (...a: unknown[]) => { registro.push(['in', ...a]); return cadena; },
        is: (...a: unknown[]) => { registro.push(['is', ...a]); return cadena; },
        gt: (...a: unknown[]) => { registro.push(['gt', ...a]); return cadena; },
        maybeSingle: async () => ({ data: plan ? { plan_actual: plan } : null, error: null }),
        then: (ok: (v: unknown) => unknown) => Promise.resolve(
          res instanceof Error ? { count: null, error: { message: res.message } } : { count: res ?? 0, error: null },
        ).then(ok),
      };
      return cadena;
    },
  };
  return { db: db as unknown as SupabaseClient, filtros };
}

describe('lugares ocupados', () => {
  it('suma miembros con acceso e invitaciones vigentes', async () => {
    const { db, filtros } = clienteFalso({ restaurant_members: 1, restaurant_invitations: 1 });
    expect(await lugaresOcupados(db, 'r1')).toBe(2);
    expect(filtros.restaurant_members).toContainEqual(['in', 'status', ['active', 'invited']]);
    expect(filtros.restaurant_invitations).toContainEqual(['is', 'accepted_at', null]);
  });

  it('al aceptar una invitación cuenta solo a quienes ya están', async () => {
    const { db, filtros } = clienteFalso({ restaurant_members: 1, restaurant_invitations: 5 });
    expect(await lugaresOcupados(db, 'r1', { conInvitaciones: false })).toBe(1);
    expect(filtros.restaurant_invitations).toBeUndefined();
  });

  it('si no se puede contar, no deja pasar a nadie más', async () => {
    const { db } = clienteFalso({ restaurant_members: new Error('caída') });
    expect(await verificarCupo(db, 'r1')).toMatch(/No se pudo comprobar/);
  });

  it('Premium no cuenta nada', async () => {
    const { db, filtros } = clienteFalso({ restaurant_members: 99 }, 'PREMIUM');
    expect(await verificarCupo(db, 'r1')).toBeNull();
    expect(filtros.restaurant_members).toBeUndefined();
  });
});
