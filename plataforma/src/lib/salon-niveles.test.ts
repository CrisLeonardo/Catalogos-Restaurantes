/**
 * Los DOS niveles de atención, y los relojes configurables.
 *
 * El principio declarado del salón es «el color no describe, avisa: cinco
 * mesas ocupadas no son cinco alarmas». Con un solo nivel no se cumplía:
 * en un salón sembrado normal —una recién tomada, una en cocina, una lista,
 * dos servidas, dos llamadas— seis de las ocho mesas abiertas salían en
 * acento y el contador decía «Te necesitan 6».
 *
 * Lo que se prueba aquí es exactamente la regla que lo arregla, porque es
 * la que decide qué se pinta con el único color que tiene el sistema:
 *
 *   · lo que una persona pidió con la mano es alarma SIEMPRE;
 *   · un reloj que cruza su umbral es aviso, y solo al DOBLE es alarma;
 *   · una mesa abandonada nunca grita: lleva un día ahí;
 *   · los umbrales los pone cada restaurante.
 */
import { describe, it, expect } from 'vitest';
import {
  tableState, tablesWithState, byUrgency, needsAttention, tableTone,
  TONE_ORDER, TONE_LABEL, ALARMA_FACTOR, UMBRALES_SALON,
  type SalonUmbrales,
} from './table-state';
import type { TableOccupancy, TableCall } from './db/orders';

const NOW = new Date('2026-09-01T20:00:00Z').getTime();

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

function llamada(over: Partial<TableCall> = {}): TableCall {
  return { reason: 'help', since: haceMin(2), ...over } as TableCall;
}

describe('alarma vs aviso', () => {
  it('pedir la cuenta es alarma desde el primer segundo', () => {
    const s = tableState(ocupada(), llamada({ reason: 'bill', since: haceMin(0) }), NOW);
    expect(s.kind).toBe('atencion');
    expect(s.level).toBe('alarma');
  });

  it('llamar al mesero es alarma, no depende de ningún umbral', () => {
    const s = tableState(ocupada(), llamada({ since: haceMin(0) }), NOW);
    expect(s.level).toBe('alarma');
  });

  it('comida lista recién pasado el umbral es aviso, no alarma', () => {
    const min = UMBRALES_SALON.readyMin + 1;
    const s = tableState(ocupada({ status: 'READY', readySince: haceMin(min) }), undefined, NOW);
    expect(s.reason).toBe('lista');
    expect(s.level).toBe('aviso');
  });

  it('comida lista pasado el DOBLE del umbral sí es alarma', () => {
    const min = UMBRALES_SALON.readyMin * ALARMA_FACTOR + 1;
    const s = tableState(ocupada({ status: 'READY', readySince: haceMin(min) }), undefined, NOW);
    expect(s.level).toBe('alarma');
  });

  it('servida sin cobrar es aviso hasta el doble', () => {
    const u = UMBRALES_SALON.unpaidMin;
    const justo = tableState(ocupada({ status: 'SERVED', servedAt: haceMin(u + 1) }), undefined, NOW);
    const tarde = tableState(ocupada({ status: 'SERVED', servedAt: haceMin(u * 2 + 1) }), undefined, NOW);
    expect([justo.reason, justo.level]).toEqual(['sin-cobrar', 'aviso']);
    expect(tarde.level).toBe('alarma');
  });

  it('sin aceptar es aviso hasta el doble', () => {
    const u = UMBRALES_SALON.unacceptedMin;
    const justo = tableState(ocupada({ status: 'NEW', since: haceMin(u + 1) }), undefined, NOW);
    const tarde = tableState(ocupada({ status: 'NEW', since: haceMin(u * 2 + 1) }), undefined, NOW);
    expect([justo.reason, justo.level]).toEqual(['sin-aceptar', 'aviso']);
    expect(tarde.level).toBe('alarma');
  });

  it('una mesa abandonada NUNCA grita: lleva un día ahí', () => {
    // Cinco días abierta es lo más lejos que puede llegar el reloj, y
    // sigue siendo trabajo de archivo, no una emergencia.
    const s = tableState(ocupada({ since: haceMin(5 * 24 * 60) }), undefined, NOW);
    expect(s.reason).toBe('abandonada');
    expect(s.level).toBe('aviso');
  });

  it('una mesa que solo está comiendo no tiene nivel', () => {
    const s = tableState(ocupada(), undefined, NOW);
    expect(s.kind).toBe('abierta');
    expect(s.level).toBeNull();
  });

  it('una mesa libre no tiene nivel', () => {
    expect(tableState(undefined, undefined, NOW).level).toBeNull();
  });
});

describe('los umbrales son de cada restaurante', () => {
  /* Un sitio de sobremesa larga: media hora servida sin cobrar es normal. */
  const tranquilo: SalonUmbrales = { readyMin: 20, unpaidMin: 45, unacceptedMin: 15 };

  it('con umbrales largos, lo que era aviso deja de decir nada', () => {
    const occ = ocupada({ status: 'SERVED', servedAt: haceMin(20) });
    expect(tableState(occ, undefined, NOW).reason).toBe('sin-cobrar');
    expect(tableState(occ, undefined, NOW, tranquilo).kind).toBe('abierta');
  });

  it('con umbrales cortos, lo que era normal pasa a aviso', () => {
    const rapido: SalonUmbrales = { readyMin: 2, unpaidMin: 3, unacceptedMin: 1 };
    const occ = ocupada({ status: 'READY', readySince: haceMin(4) });
    expect(tableState(occ, undefined, NOW).kind).toBe('abierta');
    const s = tableState(occ, undefined, NOW, rapido);
    expect([s.reason, s.level]).toEqual(['lista', 'alarma']); // 4 min ≥ 2 × 2
  });

  it('lo que pidió una persona no lo cambian los umbrales', () => {
    const s = tableState(ocupada(), llamada({ reason: 'bill' }), NOW, tranquilo);
    expect(s.level).toBe('alarma');
  });

  it('tablesWithState reparte los umbrales a todas las mesas', () => {
    const occupancy = { 1: ocupada({ status: 'SERVED', servedAt: haceMin(20) }) };
    const conDefecto = tablesWithState(2, occupancy, {}, NOW);
    const conTranquilo = tablesWithState(2, occupancy, {}, NOW, tranquilo);
    expect(conDefecto[0].state.kind).toBe('atencion');
    expect(conTranquilo[0].state.kind).toBe('abierta');
  });
});

describe('el tono es lo que se pinta', () => {
  it('cada estado tiene su tono', () => {
    expect(tableTone(tableState(undefined, undefined, NOW))).toBe('libre');
    expect(tableTone(tableState(ocupada(), undefined, NOW))).toBe('abierta');
    expect(tableTone(tableState(ocupada(), llamada(), NOW))).toBe('alarma');
    const aviso = tableState(ocupada({ status: 'SERVED', servedAt: haceMin(UMBRALES_SALON.unpaidMin + 1) }), undefined, NOW);
    expect(tableTone(aviso)).toBe('aviso');
  });

  it('la leyenda nombra los cuatro tonos y ninguno más', () => {
    expect(TONE_ORDER).toEqual(['alarma', 'aviso', 'abierta', 'libre']);
    for (const t of TONE_ORDER) expect(TONE_LABEL[t]).toBeTruthy();
  });
});

describe('el orden pone las alarmas por delante de los pendientes', () => {
  /* El motivo por sí solo no bastaba: «lista» pesa menos que «llamada» en
     PRIORITY, así que una comida lista hace cuatro minutos —un pendiente—
     se colaba por delante de una persona con la mano levantada. */
  it('una llamada va antes que una comida lista que aún es aviso', () => {
    const occupancy: Record<number, TableOccupancy> = {
      3: ocupada({ status: 'READY', readySince: haceMin(UMBRALES_SALON.readyMin + 1) }),
      7: ocupada(),
    };
    const calls: Record<number, TableCall> = { 7: llamada({ since: haceMin(1) }) };
    const orden = byUrgency(tablesWithState(8, occupancy, calls, NOW)).map((t) => t.n);
    expect(orden.slice(0, 2)).toEqual([7, 3]);
  });

  it('con la comida ya fría, el motivo vuelve a mandar', () => {
    const occupancy: Record<number, TableOccupancy> = {
      3: ocupada({ status: 'READY', readySince: haceMin(UMBRALES_SALON.readyMin * 3) }),
      7: ocupada(),
    };
    const calls: Record<number, TableCall> = { 7: llamada({ since: haceMin(1) }) };
    // Las dos son alarma: entre alarmas manda PRIORITY, y 'lista' (1) pesa
    // más que 'llamada' (2) porque el plato se está enfriando.
    const orden = byUrgency(tablesWithState(8, occupancy, calls, NOW)).map((t) => t.n);
    expect(orden.slice(0, 2)).toEqual([3, 7]);
  });

  it('needsAttention usa el mismo criterio que byUrgency', () => {
    const occupancy: Record<number, TableOccupancy> = {
      2: ocupada({ status: 'READY', readySince: haceMin(UMBRALES_SALON.readyMin + 1) }),
      5: ocupada(),
    };
    const calls: Record<number, TableCall> = { 5: llamada() };
    const tablas = tablesWithState(6, occupancy, calls, NOW);
    expect(needsAttention(tablas).map((t) => t.n)).toEqual([5, 2]);
  });

  it('el salón sembrado del hallazgo deja UNA sola alarma de las tres mesas con reloj', () => {
    /* Reproduce lo medido: recién tomada, en cocina, lista, dos servidas,
       una fría de verdad. Antes cinco de estas seis salían en acento. */
    const occupancy: Record<number, TableOccupancy> = {
      1: ocupada({ status: 'NEW', since: haceMin(2) }),
      2: ocupada({ status: 'PREP' }),
      3: ocupada({ status: 'READY', readySince: haceMin(9) }),
      4: ocupada({ status: 'SERVED', servedAt: haceMin(17) }),
      5: ocupada({ status: 'SERVED', servedAt: haceMin(20) }),
      6: ocupada({ status: 'READY', readySince: haceMin(40) }),
    };
    const tablas = tablesWithState(6, occupancy, {}, NOW);
    const alarmas = tablas.filter((t) => t.state.level === 'alarma');
    const avisos = tablas.filter((t) => t.state.level === 'aviso');
    expect(alarmas.map((t) => t.n)).toEqual([6]);
    expect(avisos.map((t) => t.n)).toEqual([3, 4, 5]);
  });
});
