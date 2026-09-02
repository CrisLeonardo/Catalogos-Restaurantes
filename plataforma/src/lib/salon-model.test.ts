/* El salón resuelto: de los datos crudos a lo que se pinta.
   ------------------------------------------------------------------
   Desde el rediseño de 2026-09-01 esta función la usan LAS DOS
   pantallas del salón —el tablero del dueño y el panel de mesero—.
   Antes cada una montaba sus mesas por su cuenta y contaban historias
   distintas del mismo local: distinto orden, distinto vocabulario y
   distinto criterio de color. Estas pruebas son el candado. */
import { describe, it, expect } from 'vitest';
import { buildSalonTables } from '@/components/admin/salon/pieces';
import type { TableOccupancy, TableCall } from '@/lib/db/orders';
import type { FloorPlan } from '@/lib/theme/defaults';

const money = (n: number) => `Q${n.toFixed(2)}`;
const moneyShort = (n: number) => `Q${Math.round(n)}`;

const AHORA = Date.parse('2026-09-01T20:00:00Z');
const haceMin = (m: number) => new Date(AHORA - m * 60_000).toISOString();

function ocupada(over: Partial<TableOccupancy> = {}): TableOccupancy {
  return {
    since: haceMin(30),
    waiterName: 'Ana',
    status: 'PREP',
    itemCount: 3,
    total: 100,
    servedAt: null,
    readySince: null,
    partySize: null,
    firedAt: haceMin(28),
    ...over,
  } as TableOccupancy;
}

function build(
  occupancy: Record<number, TableOccupancy>,
  calls: Record<number, TableCall> = {},
  tableCount = 5,
  floorPlan: FloorPlan | null = null,
) {
  return buildSalonTables({ tableCount, occupancy, calls, now: AHORA, floorPlan, money, moneyShort });
}

describe('buildSalonTables', () => {
  it('devuelve todas las mesas del salón, ocupadas o no', () => {
    expect(build({ 2: ocupada() })).toHaveLength(5);
  });

  it('ordena por urgencia y no por número: primero lo que pide algo', () => {
    const salon = build(
      {
        1: ocupada(),                                                   // comiendo
        3: ocupada({ since: haceMin(60) }),                             // pedirá la cuenta
        4: ocupada({ status: 'SERVED', servedAt: haceMin(40) }),        // sin cobrar
      },
      { 3: { since: haceMin(2), reason: 'bill' } as TableCall },
    );
    // La 3 pidió la cuenta (prioridad 0), la 4 lleva 40 min servida sin
    // cobrar, la 1 solo está comiendo, y las libres al final.
    expect(salon.map((t) => t.n)).toEqual([3, 4, 1, 2, 5]);
  });

  it('una llamada en una mesa sin abrir no secuestra la mesa', () => {
    /* Es la llamada que dejó la gente anterior: se fueron, la mesa se
       liberó y nadie resolvió el aviso. Si contara, una mesa recién
       sentada aparecería «pidió la cuenta hace 145 h» — visto tal cual
       antes de que `tableState` lo comprobara. */
    const salon = build({}, { 3: { since: haceMin(2), reason: 'bill' } as TableCall });
    expect(salon.find((t) => t.n === 3)!.state.kind).toBe('libre');
    expect(salon.map((t) => t.n)).toEqual([1, 2, 3, 4, 5]);
  });

  it('a igual motivo, la que lleva más esperando va primero', () => {
    const salon = build(
      { 1: ocupada({ since: haceMin(50) }), 5: ocupada({ since: haceMin(50) }) },
      {
        1: { since: haceMin(3), reason: 'call' } as TableCall,
        5: { since: haceMin(20), reason: 'call' } as TableCall,
      },
    );
    // Las dos llamaron: primero la que lleva veinte minutos esperando.
    expect(salon.map((t) => t.n).slice(0, 2)).toEqual([5, 1]);
  });

  it('una mesa libre no lleva ni monto ni acento, y su acción es abrirla', () => {
    const [m1] = build({});
    expect(m1.state.kind).toBe('libre');
    expect(m1.total).toBeNull();
    expect(m1.action.kind).toBe('abrir');
  });

  it('la mesa con gente enseña su total con la moneda de quien pinta', () => {
    const salon = build({ 1: ocupada({ total: 412.5 }) });
    const m1 = salon.find((t) => t.n === 1)!;
    expect(m1.total).toBe('Q412.50');
    expect(m1.totalCorto).toBe('Q413');
  });

  it('«N pers» es la gente sentada cuando la hay', () => {
    const salon = build({ 1: ocupada({ partySize: 4 }) });
    expect(salon.find((t) => t.n === 1)!.pax).toBe('4 pers');
  });

  it('«N pers» de una mesa libre son sus sillas, no sus comensales', () => {
    const plan = {
      enabled: true,
      levels: [{ id: 'l1', name: 'Planta baja' }],
      tables: [{ n: 2, x: 0.5, y: 0.5, level: 'l1', seats: 6 }],
      fixtures: [],
    } as unknown as FloorPlan;
    const salon = build({}, {}, 5, plan);
    expect(salon.find((t) => t.n === 2)!.pax).toBe('6 pers');
    // Sin sillas declaradas no se inventa un número.
    expect(salon.find((t) => t.n === 3)!.pax).toBeNull();
  });

  it('la acción sale del motivo, no del estado del pedido', () => {
    const salon = build(
      { 1: ocupada({ status: 'READY', readySince: haceMin(20) }) },
      { 2: { since: haceMin(1), reason: 'bill' } as TableCall },
    );
    // Comida lista y fría: hay que llevarla.
    expect(salon.find((t) => t.n === 1)!.action.kind).toBe('llevar');
  });

  it('sin reloj no inventa tiempos (primer render del servidor)', () => {
    const salon = buildSalonTables({
      tableCount: 3,
      occupancy: { 1: ocupada() },
      calls: {},
      now: null,
      floorPlan: null,
      money,
      moneyShort,
    });
    expect(salon.every((t) => t.tiempo === null)).toBe(true);
  });
});
