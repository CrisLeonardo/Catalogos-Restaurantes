import { describe, it, expect } from 'vitest';
import {
  mesasDeServicio, pasaFiltro, porUrgencia, resumenDelSalon, subtituloDeMesa,
  etiquetaDeMesa, datosDelPlano,
  type EntradaSalon,
} from './estado';
import type { TableOccupancy, TableCall } from '@/lib/db/orders';
import type { TableSeating } from '@/lib/db/table-sessions';
import type { FloorPlan } from '@/lib/theme/defaults';

const NOW = new Date('2026-09-17T19:00:00Z').getTime();

function haceMin(min: number): string {
  return new Date(NOW - min * 60_000).toISOString();
}

function ocupada(over: Partial<TableOccupancy> = {}): TableOccupancy {
  return {
    since: haceMin(20),
    waiterName: 'Carlos',
    status: 'PREP',
    itemCount: 3,
    total: 180,
    servedAt: null,
    readySince: null,
    partySize: 4,
    firedAt: null,
    ...over,
  };
}

function sentada(over: Partial<TableSeating> = {}): TableSeating {
  return {
    id: 's1',
    partySize: 4,
    waiterId: null,
    waiterName: null,
    seatedByName: 'Ana',
    seatedAt: haceMin(5),
    source: 'walk_in',
    note: null,
    ...over,
  };
}

function entrada(over: Partial<EntradaSalon> = {}): EntradaSalon {
  return {
    tableCount: 6,
    occupancy: {},
    calls: {},
    seatings: {},
    sinEnviar: {},
    totalSinEnviar: {},
    qrPendiente: {},
    floorPlan: null,
    now: NOW,
    ...over,
  };
}

describe('mesasDeServicio — los cinco estados', () => {
  it('sin nada, la mesa está libre', () => {
    const m = mesasDeServicio(entrada())[0];
    expect(m.estado).toBe('libre');
    expect(m.total).toBe(0);
  });

  it('sentada y sin pedir NO es libre (migración 128, hallazgo M-02)', () => {
    /* El handoff del rediseño solo traía cuatro estados y habría pintado
       esta mesa libre: dos meseros yendo a la misma mesa sin saberlo. */
    const m = mesasDeServicio(entrada({ seatings: { 1: sentada() } }))[0];
    expect(m.estado).toBe('sentada');
    expect(m.minutos).toBe(5);
  });

  it('con pedido en cocina, falta servir', () => {
    const m = mesasDeServicio(entrada({ occupancy: { 1: ocupada() } }))[0];
    expect(m.estado).toBe('cocina');
    expect(m.total).toBe(180);
  });

  it('con todo servido, por cobrar', () => {
    const m = mesasDeServicio(entrada({
      occupancy: { 1: ocupada({ status: 'SERVED', servedAt: haceMin(3) }) },
    }))[0];
    expect(m.estado).toBe('listo');
  });

  it('lo apuntado sin enviar manda sobre lo demás', () => {
    const m = mesasDeServicio(entrada({
      occupancy: { 1: ocupada({ status: 'SERVED' }) },
      sinEnviar: { 1: 2 },
      totalSinEnviar: { 1: 40 },
    }))[0];
    expect(m.estado).toBe('borrador');
    // El total incluye lo que todavía no ha salido a cocina.
    expect(m.total).toBe(220);
    expect(m.platos).toBe(5);
  });
});

describe('la mano levantada va ENCIMA del estado', () => {
  const call = (reason: TableCall['reason'], min: number): TableCall =>
    ({ reason, since: haceMin(min) });

  it('«pidió la cuenta» no borra el color del estado', () => {
    const m = mesasDeServicio(entrada({
      occupancy: { 1: ocupada() },
      calls: { 1: call('bill', 2) },
    }))[0];
    expect(m.estado).toBe('cocina');
    expect(m.atencion).toBe('cuenta');
  });

  it('una llamada ANTERIOR a que se abriera la mesa no cuenta', () => {
    /* Se fueron, la mesa se liberó y nadie resolvió el aviso: sin esto un
       «pidió la cuenta» olvidado secuestra una mesa recién sentada. */
    const m = mesasDeServicio(entrada({
      occupancy: { 1: ocupada({ since: haceMin(10) }) },
      calls: { 1: call('bill', 200) },
    }))[0];
    expect(m.atencion).toBeNull();
  });

  it('la mesa sentada cuenta desde que se sentó, no desde que pidió', () => {
    const m = mesasDeServicio(entrada({
      occupancy: { 1: ocupada({ since: haceMin(4) }) },
      seatings: { 1: sentada({ seatedAt: haceMin(30) }) },
      calls: { 1: call('call', 20) },
    }))[0];
    expect(m.minutos).toBe(30);
    // La llamada es posterior a sentarse: cuenta.
    expect(m.atencion).toBe('llamada');
  });
});

describe('mesas fuera del salón configurado (M-03)', () => {
  it('una mesa con pedido cuyo número se sale NO desaparece', () => {
    const mesas = mesasDeServicio(entrada({
      tableCount: 6,
      occupancy: { 25: ocupada({ total: 144.1 }) },
    }));
    const m25 = mesas.find((m) => m.n === 25);
    expect(m25).toBeDefined();
    expect(m25!.fuera).toBe(true);
    expect(m25!.total).toBe(144.1);
    // Y no se rellenan las 7..24 que no existen.
    expect(mesas.map((m) => m.n)).toEqual([1, 2, 3, 4, 5, 6, 25]);
  });
});

describe('nombre, alias y zona', () => {
  const plano: FloorPlan = {
    enabled: true,
    levels: [{ id: 'l1', name: 'Terraza' }],
    tables: [{ n: 2, level: 'l1', x: 0.5, y: 0.5, seats: 6, label: 'Terraza 2' }],
  };

  it('el alias del plano identifica la mesa y el nombre identifica a la gente', () => {
    const m = mesasDeServicio(entrada({
      floorPlan: plano,
      seatings: { 2: sentada({ note: 'cumpleaños de Sofi' }) },
    })).find((x) => x.n === 2)!;
    expect(m.alias).toBe('Terraza 2');
    expect(m.zona).toBe('Terraza');
    expect(m.sillas).toBe(6);
    expect(m.etiqueta).toBe('Terraza 2 · cumpleaños de Sofi');
  });

  it('sin alias ni nombre, la etiqueta es «Mesa N»', () => {
    expect(etiquetaDeMesa(4, '', null)).toBe('Mesa 4');
  });

  it('un plano apagado no aporta datos', () => {
    expect(datosDelPlano({ ...plano, enabled: false })).toEqual({});
  });
});

describe('filtros', () => {
  const mesas = mesasDeServicio(entrada({
    tableCount: 4,
    occupancy: {
      1: ocupada(),
      2: ocupada({ status: 'SERVED' }),
      3: ocupada({ status: 'NEW', waiterName: null }),
    },
    qrPendiente: { 3: 2 },
  }));

  it('«Libres» deja solo las vacías', () => {
    expect(mesas.filter((m) => pasaFiltro(m, 'Libres')).map((m) => m.n)).toEqual([4]);
  });

  it('«Por cobrar» deja las que ya comieron', () => {
    expect(mesas.filter((m) => pasaFiltro(m, 'Por cobrar')).map((m) => m.n)).toEqual([2]);
  });

  it('«Falta servir» incluye lo que llegó por QR y nadie ha aceptado', () => {
    expect(mesas.filter((m) => pasaFiltro(m, 'Falta servir')).map((m) => m.n)).toEqual([1, 3]);
  });
});

describe('orden y resumen', () => {
  it('la mano levantada va primero, pase lo que pase', () => {
    const mesas = mesasDeServicio(entrada({
      tableCount: 3,
      occupancy: { 1: ocupada(), 3: ocupada({ status: 'SERVED' }) },
      calls: { 3: { reason: 'call', since: haceMin(1) } },
      sinEnviar: { 2: 1 },
      totalSinEnviar: { 2: 30 },
    }));
    expect(porUrgencia(mesas).map((m) => m.n)).toEqual([3, 2, 1]);
  });

  it('el resumen cuenta MESAS, no platos', () => {
    const mesas = mesasDeServicio(entrada({
      tableCount: 5,
      occupancy: {
        1: ocupada({ itemCount: 11 }),
        2: ocupada({ status: 'SERVED' }),
      },
    }));
    expect(resumenDelSalon(mesas)).toBe('3 libres · 1 por cobrar · 1 por servir');
  });
});

describe('subtítulo', () => {
  it('la mesa libre sin plano no repite «Libre»: eso ya lo dice el chip', () => {
    const m = mesasDeServicio(entrada())[0];
    expect(subtituloDeMesa(m)).toBe('');
  });

  it('la mesa libre dice dónde está y para cuántos', () => {
    const plano: FloorPlan = {
      enabled: true,
      levels: [{ id: 'l1', name: 'Barra' }],
      tables: [{ n: 1, level: 'l1', x: 0, y: 0, seats: 2 }],
    };
    const m = mesasDeServicio(entrada({ floorPlan: plano }))[0];
    expect(subtituloDeMesa(m)).toBe('Barra · 2 personas');
  });

  it('en el riel estrecho se abrevia en vez de partirse en dos renglones', () => {
    const m = mesasDeServicio(entrada({
      occupancy: { 1: ocupada() },
      qrPendiente: { 1: 2 },
    }))[0];
    expect(subtituloDeMesa(m, false)).toBe('20 min · 3 platos · QR nuevo');
    expect(subtituloDeMesa(m, true)).toBe('falta servir · QR');
  });
});

describe('sin reloj de cliente no hay minutos', () => {
  it('el primer render del servidor no inventa tiempos', () => {
    const m = mesasDeServicio(entrada({ occupancy: { 1: ocupada() }, now: null }))[0];
    expect(m.minutos).toBeNull();
    expect(subtituloDeMesa(m)).toBe('3 platos');
  });
});
