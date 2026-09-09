import { describe, it, expect } from 'vitest';
import { armarCuenta, type AccountLocal, type CuentaCruda, type LocalBasico } from './account-classification';

/* ════════════════════════════════════════════════════════════
   CÓMO SE CLASIFICA UNA CUENTA (fase 1 · administración de cuentas)
   ------------------------------------------------------------
   Cada caso de abajo es una persona a la que hoy no se puede
   rescatar. Si una regla se confunde con otra, la pantalla enseña el
   problema equivocado —y peor: deja de enseñar a quien sí lo tiene—,
   que es exactamente el fallo que esta sección viene a arreglar.
   ════════════════════════════════════════════════════════════ */

const AHORA = Date.parse('2026-09-08T12:00:00Z');

const CATALOGO: Record<string, LocalBasico> = {
  'r-1': { name: 'El Rincón', slug: 'rincon', plan: 'ESTANDAR', status: 'active' },
  'r-2': { name: 'Azúcar Negra', slug: 'azucar-negra', plan: 'PREMIUM', status: 'active' },
};
const buscarLocal = (id: string) => CATALOGO[id];

function cuenta(over: Partial<CuentaCruda> = {}): CuentaCruda {
  return {
    id: 'u-1',
    full_name: 'Carlos',
    role: 'RESTAURANT_OWNER',
    restaurant_id: null,
    email_verified_at: '2026-09-01T00:00:00Z',
    email: 'carlos@ejemplo.com',
    created_at: '2026-09-01T00:00:00Z',
    last_sign_in_at: '2026-09-07T00:00:00Z',
    banned_until: null,
    providers: ['email'],
    ...over,
  };
}

const membresia = (restaurantId: string, role: AccountLocal['role'] = 'OWNER'): AccountLocal => ({
  restaurantId,
  ...CATALOGO[restaurantId],
  role,
  legacy: false,
});

describe('pertenecer a un local son dos cosas', () => {
  it('cuenta la membresía del modelo nuevo', () => {
    const r = armarCuenta(cuenta(), [membresia('r-1')], buscarLocal, AHORA);
    expect(r.locales).toHaveLength(1);
    expect(r.sinLocal).toBe(false);
  });

  it('cuenta también el `restaurant_id` del alta del Super Admin', () => {
    // Es el hallazgo A-09: `createRestaurantUser` escribe el camino viejo y
    // no crea membresía. Mirando solo `restaurant_members`, esta persona
    // aparecería como atascada sin haberlo estado nunca.
    const r = armarCuenta(cuenta({ restaurant_id: 'r-1' }), [], buscarLocal, AHORA);
    expect(r.locales).toHaveLength(1);
    expect(r.locales[0].legacy).toBe(true);
    expect(r.sinLocal).toBe(false);
  });

  it('no cuenta dos veces a quien está en los dos sitios', () => {
    const r = armarCuenta(cuenta({ restaurant_id: 'r-1' }), [membresia('r-1')], buscarLocal, AHORA);
    expect(r.locales).toHaveLength(1);
    // Y manda la membresía, que es la que lleva el rol de verdad.
    expect(r.locales[0].legacy).toBe(false);
  });

  it('junta los dos caminos cuando son locales distintos', () => {
    const r = armarCuenta(cuenta({ restaurant_id: 'r-2' }), [membresia('r-1')], buscarLocal, AHORA);
    expect(r.locales.map((l) => l.name)).toEqual(['Azúcar Negra', 'El Rincón']);
  });

  it('ignora un `restaurant_id` que apunta a un restaurante que ya no existe', () => {
    const r = armarCuenta(cuenta({ restaurant_id: 'r-borrado' }), [], buscarLocal, AHORA);
    expect(r.locales).toHaveLength(0);
    expect(r.sinLocal).toBe(true);
  });
});

describe('sin local y huérfana no son lo mismo', () => {
  it('un dueño sin ningún local es un registro a medias, no un huérfano', () => {
    const r = armarCuenta(cuenta({ role: 'RESTAURANT_OWNER' }), [], buscarLocal, AHORA);
    expect(r.sinLocal).toBe(true);
    expect(r.huerfana).toBe(false);
  });

  it('personal sin ningún local es un huérfano: su restaurante se borró debajo', () => {
    const r = armarCuenta(cuenta({ role: 'RESTAURANT_STAFF' }), [], buscarLocal, AHORA);
    expect(r.huerfana).toBe(true);
  });

  it('un mesero sin local también es huérfano', () => {
    const r = armarCuenta(cuenta({ role: 'RESTAURANT_WAITER' }), [], buscarLocal, AHORA);
    expect(r.huerfana).toBe(true);
  });

  it('el super admin no es ninguna de las dos: no administra locales por definición', () => {
    const r = armarCuenta(cuenta({ role: 'SUPER_ADMIN' }), [], buscarLocal, AHORA);
    expect(r.sinLocal).toBe(false);
    expect(r.huerfana).toBe(false);
  });

  it('con local, nadie es huérfano aunque sea personal', () => {
    const r = armarCuenta(cuenta({ role: 'RESTAURANT_STAFF' }), [membresia('r-1', 'STAFF')], buscarLocal, AHORA);
    expect(r.sinLocal).toBe(false);
    expect(r.huerfana).toBe(false);
  });
});

describe('verificado es haber abierto NUESTRO enlace, o venir de Google', () => {
  it('sin fecha y sin Google, no está verificado', () => {
    const r = armarCuenta(cuenta({ email_verified_at: null }), [], buscarLocal, AHORA);
    expect(r.verificado).toBe(false);
  });

  it('con Google está verificado aunque no haya fecha', () => {
    // La cuenta que nació de una invitación puede no tener la fecha aunque
    // su identidad sea de Google. Pedirle que confirme un correo que nunca
    // escribió no tiene sentido.
    const r = armarCuenta(
      cuenta({ email_verified_at: null, providers: ['google'] }),
      [], buscarLocal, AHORA,
    );
    expect(r.verificado).toBe(true);
  });
});

describe('cómo entra y en qué estado está', () => {
  it('lista las dos identidades cuando las tiene', () => {
    const r = armarCuenta(cuenta({ providers: ['email', 'google'] }), [], buscarLocal, AHORA);
    expect(r.providers).toEqual(['email', 'google']);
  });

  it('una credencial de turno del local se marca como PIN', () => {
    const r = armarCuenta(
      cuenta({ email: 'u.9f2c4a1b.carlos@staff.leogin.internal' }),
      [], buscarLocal, AHORA,
    );
    expect(r.esPin).toBe(true);
  });

  it('un correo de verdad no se marca como PIN', () => {
    expect(armarCuenta(cuenta(), [], buscarLocal, AHORA).esPin).toBe(false);
  });

  it('suspendida solo si el veto sigue vigente', () => {
    const vigente = armarCuenta(cuenta({ banned_until: '2026-12-01T00:00:00Z' }), [], buscarLocal, AHORA);
    const vencido = armarCuenta(cuenta({ banned_until: '2026-08-01T00:00:00Z' }), [], buscarLocal, AHORA);
    expect(vigente.suspendida).toBe(true);
    expect(vencido.suspendida).toBe(false);
  });

  it('sin veto, no está suspendida', () => {
    expect(armarCuenta(cuenta(), [], buscarLocal, AHORA).suspendida).toBe(false);
  });
});
