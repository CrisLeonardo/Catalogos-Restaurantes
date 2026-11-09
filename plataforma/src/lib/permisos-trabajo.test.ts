/** Permisos por trabajo (auditoría 1.7): la regla, los puestos y su acuerdo con la migración 177. */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { can, isMeseroOnly, CAJA_CAPACIDADES, STAFF_ASSIGNABLE } from '@/lib/permissions';
import {
  AREAS, PUESTOS, excepciones, fueraDelTecho, normalizarPermisos, permisosDePuesto,
  puestoQueCoincide, tareasDelicadas,
} from '@/lib/permisos-trabajo';
import { buildNav, type NavContext } from '@/lib/admin-nav';

const STAFF = 'RESTAURANT_STAFF';

describe('can() ya no lee null como todo', () => {
  it('el personal sin lista no tiene acceso', () => {
    expect(can(STAFF, null, 'pedidos')).toBe(false);
    expect(can(STAFF, undefined, 'mesero')).toBe(false);
  });

  it('el dueño y el super admin pasan siempre', () => {
    expect(can('RESTAURANT_OWNER', null, 'caja.devolver')).toBe(true);
    expect(can('SUPER_ADMIN', null, 'suscripcion')).toBe(true);
  });

  it('la suscripción no se delega aunque esté en la lista', () => {
    expect(can(STAFF, ['suscripcion'], 'suscripcion')).toBe(false);
    expect(STAFF_ASSIGNABLE).not.toContain('suscripcion');
  });

  it('Caja: la pantalla exige una tarea del cajón; cobrar solo no basta', () => {
    expect(can(STAFF, ['caja.cobrar'], 'caja')).toBe(false);
    expect(can(STAFF, ['caja.cerrar'], 'caja')).toBe(true);
    expect(can(STAFF, ['caja.cerrar'], 'finanzas')).toBe(false);
  });

  it('Servicio admite a quien toma pedidos y a quien sólo cobra', () => {
    expect(can(STAFF, ['mesero'], 'servicio')).toBe(true);
    expect(can(STAFF, ['caja.cobrar'], 'servicio')).toBe(true);
    expect(can(STAFF, ['cocina'], 'servicio')).toBe(false);
  });

  it('el mesero del rol anterior toma pedidos y cobra, nada más', () => {
    expect(can('RESTAURANT_WAITER', null, 'mesero')).toBe(true);
    expect(can('RESTAURANT_WAITER', null, 'caja.cobrar')).toBe(true);
    expect(can('RESTAURANT_WAITER', null, 'caja')).toBe(false);
    expect(can('RESTAURANT_WAITER', null, 'pedidos')).toBe(false);
  });
});

describe('puestos', () => {
  it('cada puesto sólo usa llaves delegables', () => {
    for (const p of PUESTOS) expect(normalizarPermisos(p.permisos).sort()).toEqual([...p.permisos].sort());
  });

  it('el mesero cobra y sigue siendo «mesero puro» (no entra al panel)', () => {
    expect(permisosDePuesto('mesero')).toEqual(['mesero', 'caja.cobrar']);
    expect(isMeseroOnly(STAFF, permisosDePuesto('mesero'))).toBe(true);
  });

  it('Caja opera el cajón sin ver utilidades ni lo esperado', () => {
    const caja = permisosDePuesto('caja');
    expect(can(STAFF, caja, 'caja.cerrar')).toBe(true);
    expect(can(STAFF, caja, 'finanzas')).toBe(false);
    expect(can(STAFF, caja, 'caja.ver_esperado')).toBe(false);
    expect(can(STAFF, caja, 'caja.devolver')).toBe(false);
  });

  it('el Encargado tiene toda la Caja y administra personal', () => {
    const e = permisosDePuesto('encargado');
    for (const c of CAJA_CAPACIDADES) expect(e).toContain(c);
    expect(e).toContain('personal');
    expect(e).not.toContain('finanzas');
  });

  it('reconoce el puesto sólo si la lista coincide exactamente', () => {
    expect(puestoQueCoincide(['caja.cobrar', 'mesero'])).toBe('mesero');
    expect(puestoQueCoincide(['cocina', 'inventario'])).toBeNull();
  });

  it('enseña las excepciones respecto a la plantilla', () => {
    expect(excepciones('cocina', ['cocina', 'inventario'])).toEqual({ añadidos: ['inventario'], quitados: [] });
    expect(excepciones('mesero', ['mesero'])).toEqual({ añadidos: [], quitados: ['caja.cobrar'] });
    expect(excepciones(null, ['cocina'])).toEqual({ añadidos: [], quitados: [] });
  });

  it('marca las tareas delicadas', () => {
    expect(tareasDelicadas(permisosDePuesto('encargado')).map((t) => t.key))
      .toEqual(expect.arrayContaining(['caja.corregir', 'caja.devolver', 'personal', 'catalogo']));
    expect(tareasDelicadas(permisosDePuesto('cocina'))).toEqual([]);
  });
});

describe('techo de quien reparte', () => {
  it('el dueño no tiene techo', () => {
    expect(fueraDelTecho(null, ['finanzas', 'personal'])).toEqual([]);
  });
  it('un encargado no da lo que no tiene ni crea pares', () => {
    expect(fueraDelTecho(['mesero', 'personal'], ['mesero', 'finanzas', 'personal'])).toEqual(['finanzas', 'personal']);
  });
});

describe('acuerdo entre pantalla, regla y base', () => {
  it('las áreas de la ficha cubren cada llave delegable exactamente una vez', () => {
    const llaves = AREAS.flatMap((a) => a.tareas.map((t) => t.key));
    expect(new Set(llaves).size).toBe(llaves.length);
    expect([...llaves].sort()).toEqual([...STAFF_ASSIGNABLE].sort());
  });

  it('la lista heredada de la migración 177 es lo que concedía null (sin suscripción, cupones ni personal)', () => {
    const sql = readFileSync(path.join(process.cwd(), 'supabase/migrations/177_permisos_por_trabajo.sql'), 'utf8');
    const bloque = sql.slice(sql.indexOf('function public.leogin_permisos_heredados'), sql.indexOf('::jsonb'));
    const lista = JSON.parse(bloque.slice(bloque.indexOf("'[") + 1, bloque.lastIndexOf("]'") + 1).replace(/\s+/g, '')) as string[];
    const esperada = STAFF_ASSIGNABLE.filter((k) => k !== 'personal' && k !== 'cupones');
    expect([...lista].sort()).toEqual([...esperada].sort());
  });

  it('cada pestaña del panel pide una llave que la regla conoce', () => {
    const ctx = { role: 'RESTAURANT_OWNER', permissions: null, preview: true, planActual: 'PREMIUM', showStaff: true } as unknown as NavContext;
    const conocidas = new Set([...STAFF_ASSIGNABLE, 'hoy', 'caja', 'servicio', 'suscripcion', 'encuestas']);
    for (const g of buildNav(ctx)) for (const it of g.items) expect(conocidas, it.href).toContain(it.key);
  });
});
