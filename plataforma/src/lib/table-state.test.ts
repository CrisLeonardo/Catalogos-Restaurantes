import { describe, it, expect } from 'vitest';
import {
  tableState, tablesWithState, needsAttention, fmtMin, fmtMinShort,
  tableStage, tableAction, byUrgency,
  READY_ALERT_MIN, UNPAID_ALERT_MIN, UNACCEPTED_ALERT_MIN, ABANDONED_HOURS,
  type TableState,
} from './table-state';
import type { TableOccupancy, TableCall } from './db/orders';

const NOW = new Date('2026-08-25T13:00:00Z').getTime();

/** Un ISO a N minutos antes de NOW. */
function haceMin(min: number): string {
  return new Date(NOW - min * 60_000).toISOString();
}

function ocupada(over: Partial<TableOccupancy> = {}): TableOccupancy {
  return {
    since: haceMin(20),
    waiterName: 'Carlos',
    status: 'PREP',
    itemCount: 3,
    total: 284,
    servedAt: null,
    readySince: null,
    partySize: null,
    firedAt: null,
    ...over,
  };
}

describe('tableState', () => {
  it('una mesa sin pedido está libre y no dice nada', () => {
    const s = tableState(undefined, undefined, NOW);
    expect(s.kind).toBe('libre');
    expect(s.reason).toBeNull();
  });

  it('una mesa con gente NO pide atención: es tinta normal', () => {
    const s = tableState(ocupada(), undefined, NOW);
    expect(s.kind).toBe('abierta');
    expect(s.label).toBe('3 platos · 20 min');
  });

  it('pedir la cuenta gana sobre cualquier reloj', () => {
    const call: TableCall = { reason: 'bill', since: haceMin(3) };
    // Mesa que además lleva un plato listo hace rato: la cuenta manda igual.
    const s = tableState(ocupada({ status: 'READY', readySince: haceMin(30) }), call, NOW);
    expect(s.kind).toBe('atencion');
    expect(s.reason).toBe('cuenta');
    expect(s.label).toContain('Pidió la cuenta');
  });

  it('llamar al mesero avisa, pero pesa menos que la cuenta', () => {
    const llamada = tableState(ocupada(), { reason: 'call', since: haceMin(2) }, NOW);
    const cuenta = tableState(ocupada(), { reason: 'bill', since: haceMin(2) }, NOW);
    expect(llamada.reason).toBe('llamada');
    expect(cuenta.priority).toBeLessThan(llamada.priority);
  });

  it('un plato listo avisa solo cuando lleva rato sin que lo lleven', () => {
    const recien = tableState(
      ocupada({ status: 'READY', readySince: haceMin(READY_ALERT_MIN - 1) }), undefined, NOW);
    expect(recien.kind).toBe('abierta');

    const frio = tableState(
      ocupada({ status: 'READY', readySince: haceMin(READY_ALERT_MIN + 1) }), undefined, NOW);
    expect(frio.kind).toBe('atencion');
    expect(frio.reason).toBe('lista');
  });

  it('un pedido que cocina no acepta acaba avisando', () => {
    const s = tableState(
      ocupada({ status: 'NEW', since: haceMin(UNACCEPTED_ALERT_MIN + 1) }), undefined, NOW);
    expect(s.reason).toBe('sin-aceptar');
  });

  it('una mesa servida sin cobrar avisa pasado el umbral', () => {
    const recien = tableState(
      ocupada({ status: 'SERVED', servedAt: haceMin(UNPAID_ALERT_MIN - 1) }), undefined, NOW);
    expect(recien.kind).toBe('abierta');
    expect(recien.label).toContain('Servida');

    const olvidada = tableState(
      ocupada({ status: 'SERVED', servedAt: haceMin(UNPAID_ALERT_MIN + 1) }), undefined, NOW);
    expect(olvidada.reason).toBe('sin-cobrar');
  });

  it('un pedido de ayer sin aceptar es basura, no una urgencia de cocina', () => {
    // Con el orden mal puesto esto decía "Sin aceptar hace 24 h" y mandaba al
    // mesero a una mesa que ya no existe. Lo destapó la data real del entorno
    // local, no una prueba escrita a priori.
    const s = tableState(
      ocupada({ status: 'NEW', since: haceMin(ABANDONED_HOURS * 60 + 5) }), undefined, NOW);
    expect(s.reason).toBe('abandonada');
  });

  it('un plato "listo" de ayer tampoco se anuncia como listo', () => {
    const s = tableState(
      ocupada({ status: 'READY', since: haceMin(ABANDONED_HOURS * 60 + 5), readySince: haceMin(1400) }),
      undefined, NOW);
    expect(s.reason).toBe('abandonada');
  });

  it('pero pedir la cuenta gana incluso sobre una mesa abandonada', () => {
    const s = tableState(
      ocupada({ since: haceMin(ABANDONED_HOURS * 60 + 5) }),
      { reason: 'bill', since: haceMin(2) }, NOW);
    expect(s.reason).toBe('cuenta');
  });

  it('una mesa de ayer se marca abandonada, no "sin cobrar"', () => {
    const s = tableState(
      ocupada({ status: 'SERVED', since: haceMin(ABANDONED_HOURS * 60 + 10), servedAt: haceMin(600) }),
      undefined, NOW);
    expect(s.reason).toBe('abandonada');
  });

  it('una llamada anterior a la mesa es de la tanda de antes y NO cuenta', () => {
    /* Visto tal cual en el entorno local: un "pidió la cuenta" del 26 de
       agosto sin resolver hacía que una mesa de diecisiete minutos dijera
       «Pidió la cuenta · 145 h 53 min». El aviso muere con la mesa que lo
       pidió. */
    const occ = ocupada({ since: haceMin(17) });
    const vieja: TableCall = { reason: 'bill', since: haceMin(60 * 24 * 6) };
    const s = tableState(occ, vieja, NOW);
    expect(s.kind).toBe('abierta');
    expect(s.reason).toBeNull();
  });

  it('pero una llamada de después de sentarse sí cuenta, aunque lleve rato', () => {
    const occ = ocupada({ since: haceMin(90) });
    const s = tableState(occ, { reason: 'bill', since: haceMin(40) }, NOW);
    expect(s.reason).toBe('cuenta');
  });

  it('sin reloj tampoco se cuela la llamada de la tanda anterior', () => {
    const occ = ocupada({ since: haceMin(10) });
    const s = tableState(occ, { reason: 'bill', since: haceMin(5000) }, null);
    expect(s.kind).toBe('abierta');
  });

  it('sin reloj no inventa relojes, pero sí respeta lo que pidió el comensal', () => {
    const sinReloj = tableState(ocupada(), undefined, null);
    expect(sinReloj.kind).toBe('abierta');
    expect(sinReloj.label).toBe('3 platos');

    const conCuenta = tableState(ocupada(), { reason: 'bill', since: haceMin(3) }, null);
    expect(conCuenta.reason).toBe('cuenta');
  });

  it('el singular de un plato está bien escrito', () => {
    expect(tableState(ocupada({ itemCount: 1 }), undefined, NOW).label).toBe('1 plato · 20 min');
  });
});

describe('tablesWithState / needsAttention', () => {
  it('devuelve todas las mesas del salón, ocupadas o no', () => {
    const t = tablesWithState(5, { 2: ocupada() }, {}, NOW);
    expect(t).toHaveLength(5);
    expect(t.map((x) => x.n)).toEqual([1, 2, 3, 4, 5]);
    expect(t[1].state.kind).toBe('abierta');
    expect(t[0].state.kind).toBe('libre');
  });

  it('ordena las urgentes de la que más apura a la que menos', () => {
    const occ = {
      3: ocupada({ status: 'SERVED', servedAt: haceMin(40) }),          // sin-cobrar
      5: ocupada({ status: 'READY', readySince: haceMin(20) }),         // lista
      8: ocupada(),                                                     // cuenta (por la llamada)
      9: ocupada(),                                                     // abierta, no urge
    };
    const calls: Record<number, TableCall> = { 8: { reason: 'bill', since: haceMin(1) } };
    const urgentes = needsAttention(tablesWithState(10, occ, calls, NOW));
    expect(urgentes.map((t) => t.n)).toEqual([8, 5, 3]);
  });
});

/* La ficha de mesa mide unos 95 px. Estas pruebas son el contrato de que ahí
   siempre cabe algo legible: si alguien alarga una etiqueta sin pensar en la
   rejilla, se entera aquí y no en el salón. */
describe('short — lo que cabe en la ficha de mesa', () => {
  it('una mesa libre lo dice y ya', () => {
    expect(tableState(undefined, undefined, NOW).short).toBe('Libre');
  });

  it('una mesa abierta enseña el reloj, no el inventario', () => {
    // La línea larga sí cuenta los platos; la ficha solo tiene sitio para el
    // tiempo, que es el dato con el que el mesero decide a dónde va.
    const s = tableState(ocupada(), undefined, NOW);
    expect(s.label).toBe('3 platos · 20 min');
    expect(s.short).toBe('20 min');
  });

  it('pedir la cuenta se abrevia a una palabra', () => {
    const s = tableState(ocupada(), { reason: 'bill', since: haceMin(3) }, NOW);
    expect(s.short).toBe('Cuenta');
  });

  it('la comida lista SÍ se lleva el reloj a la ficha', () => {
    // "Lista" a secas no distingue el plato recién salido del que lleva
    // veinte minutos enfriándose, que es justo lo que hay que distinguir.
    const s = tableState(ocupada({ status: 'READY', readySince: haceMin(20) }), undefined, NOW);
    expect(s.short).toBe('Lista 20 min');
  });

  it('ninguna abreviatura se pasa de larga', () => {
    const casos: TableState[] = [
      tableState(undefined, undefined, NOW),
      tableState(ocupada(), undefined, NOW),
      tableState(ocupada(), { reason: 'bill', since: haceMin(3) }, NOW),
      tableState(ocupada(), { reason: 'call', since: haceMin(3) }, NOW),
      tableState(ocupada({ status: 'READY', readySince: haceMin(20) }), undefined, NOW),
      tableState(ocupada({ status: 'NEW', since: haceMin(30) }), undefined, NOW),
      tableState(ocupada({ status: 'SERVED', servedAt: haceMin(40) }), undefined, NOW),
      tableState(ocupada({ since: haceMin(ABANDONED_HOURS * 60 + 10) }), undefined, NOW),
    ];
    for (const c of casos) {
      expect(c.short.length, `demasiado larga: "${c.short}"`).toBeLessThanOrEqual(14);
    }
  });
});

describe('fmtMin', () => {
  it('escribe los tiempos como los diría una persona', () => {
    expect(fmtMin(0)).toBe('0 min');
    expect(fmtMin(42)).toBe('42 min');
    expect(fmtMin(60)).toBe('1 h');
    expect(fmtMin(130)).toBe('2 h 10 min');
  });
});

describe('fmtMinShort — el ancho de una ficha de mesa', () => {
  it('por debajo de la hora dice los minutos', () => {
    expect(fmtMinShort(0)).toBe('0 min');
    expect(fmtMinShort(42)).toBe('42 min');
  });

  it('pasada la hora tira los minutos: en una ficha no caben y no cambian nada', () => {
    expect(fmtMinShort(60)).toBe('1 h');
    expect(fmtMinShort(220)).toBe('3 h');
  });

  it('pasado el día cuenta días', () => {
    expect(fmtMinShort(60 * 24)).toBe('1 d');
    expect(fmtMinShort(60 * 50)).toBe('2 d');
  });

  it('nunca parte en dos renglones: cinco caracteres como mucho más la unidad', () => {
    for (const m of [0, 1, 59, 60, 61, 599, 1439, 1440, 100000]) {
      expect(fmtMinShort(m).length).toBeLessThanOrEqual(7);
    }
  });
});

/* ════════════════════════════════════════════════════════════
   LA ETAPA DE LA COMIDA Y LA ÚNICA ACCIÓN (rediseño 2026-09-01)
   ════════════════════════════════════════════════════════════ */

describe('tableStage', () => {
  it('una mesa libre no tiene etapa que enseñar', () => {
    const s = tableStage(undefined, tableState(undefined, undefined, NOW));
    expect(s.index).toBe(-1);
    expect(s.label).toBe('Sin abrir');
  });

  it('recién tomada, la etapa es "Pedido tomado" y cuenta desde que se abrió', () => {
    const occ = ocupada({ status: 'NEW', since: haceMin(2) });
    const s = tableStage(occ, tableState(occ, undefined, NOW));
    expect(s.index).toBe(0);
    expect(s.since).toBe(occ.since);
  });

  it('en cocina, el reloj cuenta desde que SALIÓ la comanda, no desde que se sentaron', () => {
    const occ = ocupada({ status: 'PREP', since: haceMin(40), firedAt: haceMin(12) });
    const s = tableStage(occ, tableState(occ, undefined, NOW));
    expect(s.index).toBe(1);
    expect(s.since).toBe(occ.firedAt);
  });

  it('servida sin prisa se queda en "Servida"', () => {
    const occ = ocupada({ status: 'SERVED', servedAt: haceMin(3) });
    const s = tableStage(occ, tableState(occ, undefined, NOW));
    expect(s.index).toBe(2);
  });

  it('pedir la cuenta la lleva a "Por cobrar" aunque el pedido siga en SERVED', () => {
    const occ = ocupada({ status: 'SERVED', servedAt: haceMin(3) });
    const call: TableCall = { reason: 'bill', since: haceMin(4) };
    const s = tableStage(occ, tableState(occ, call, NOW));
    expect(s.index).toBe(3);
    expect(s.since).toBe(call.since);
  });

  it('servida hace rato sin cobrar también es "Por cobrar"', () => {
    const occ = ocupada({ status: 'SERVED', servedAt: haceMin(UNPAID_ALERT_MIN + 10) });
    const s = tableStage(occ, tableState(occ, undefined, NOW));
    expect(s.index).toBe(3);
  });
});

describe('tableAction — una mesa, una acción', () => {
  it('la mesa libre se abre', () => {
    expect(tableAction(tableState(undefined, undefined, NOW)).kind).toBe('abrir');
  });

  it('la que pidió la cuenta se cobra', () => {
    const occ = ocupada();
    const a = tableAction(tableState(occ, { reason: 'bill', since: haceMin(2) }, NOW));
    expect(a.kind).toBe('cobrar');
    expect(a.label).toBe('Cobrar');
  });

  it('la comida lista se lleva a la mesa', () => {
    const occ = ocupada({ status: 'READY', readySince: haceMin(READY_ALERT_MIN + 3) });
    expect(tableAction(tableState(occ, undefined, NOW)).kind).toBe('llevar');
  });

  it('quien llamó se atiende', () => {
    const occ = ocupada();
    expect(tableAction(tableState(occ, { reason: 'call', since: haceMin(1) }, NOW)).kind).toBe('atender');
  });

  it('la mesa en marcha ofrece agregar platillos, no un menú de opciones', () => {
    const a = tableAction(tableState(ocupada(), undefined, NOW));
    expect(a.kind).toBe('agregar');
    expect(a.label).toBe('Agregar platillos');
  });
});

describe('byUrgency — el salón se ordena por lo que pide, no por número', () => {
  const salon = () => tablesWithState(
    6,
    {
      2: ocupada({ status: 'PREP' }),
      4: ocupada({ status: 'SERVED', servedAt: haceMin(UNPAID_ALERT_MIN + 5) }),
      5: ocupada({ status: 'PREP' }),
    },
    { 5: { reason: 'bill', since: haceMin(3) } },
    NOW,
  );

  it('primero las que piden algo, luego las que están en marcha, al final las libres', () => {
    const orden = byUrgency(salon()).map((t) => t.n);
    // 5 pidió la cuenta (prioridad 0), 4 lleva rato servida (prioridad 4),
    // 2 está en marcha, y 1·3·6 están libres.
    expect(orden).toEqual([5, 4, 2, 1, 3, 6]);
  });

  it('dentro de cada grupo manda el número de mesa', () => {
    const libres = byUrgency(salon()).filter((t) => t.state.kind === 'libre').map((t) => t.n);
    expect(libres).toEqual([1, 3, 6]);
  });

  it('no pierde ni duplica mesas', () => {
    const orden = byUrgency(salon());
    expect(orden).toHaveLength(6);
    expect(new Set(orden.map((t) => t.n)).size).toBe(6);
  });
});
