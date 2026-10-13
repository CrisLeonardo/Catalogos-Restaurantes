import { describe, it, expect } from 'vitest';
import {
  cuadrarPeriodo, inicioDelPeriodo, esperadoEnCajon, netoPorMetodo,
  filasDeCambioDeMetodo, metodoPrincipal, devolvible, montoDeLinea,
  type Movimiento, type PedidoSinFilas,
} from './libro';
import {
  diaDeNegocio, inicioDelDia, bordesDelDia, minutosDelDia, horaACorte, corteAHora,
  normalizarCorte, sumarDias, CORTE_POR_OMISION,
} from './dia';

/* ════════════════════════════════════════════════════════════
   LA CAJA QUE NO CUADRABA (auditoría 2026-10-09)
   ------------------------------------------------------------
   Cada bloque de abajo es un caso de la matriz de errores humanos
   de la auditoría: lo que el cajero veía y lo que tiene que ver.
   ════════════════════════════════════════════════════════════ */

const GT = 'America/Guatemala'; // UTC−6, sin cambio de hora
const mov = (p: Partial<Movimiento> & { amount: number }): Movimiento => ({
  orderId: 'o1', method: 'CASH', kind: 'PAYMENT', at: '2026-10-09T20:00:00Z', ...p,
});

describe('día de negocio (PROD-04)', () => {
  it('la 1:30 de la madrugada es del día anterior con el corte a las 05:00', () => {
    // 01:30 en Guatemala = 07:30 UTC
    expect(diaDeNegocio(new Date('2026-10-10T07:30:00Z'), GT, 300)).toBe('2026-10-09');
  });

  it('las 05:00 en punto ya son del día nuevo', () => {
    expect(diaDeNegocio(new Date('2026-10-10T11:00:00Z'), GT, 300)).toBe('2026-10-10');
  });

  it('con corte a medianoche es la fecha de calendario de siempre', () => {
    expect(diaDeNegocio(new Date('2026-10-10T07:30:00Z'), GT, 0)).toBe('2026-10-10');
  });

  it('el día empieza a la hora de corte local, no a medianoche UTC', () => {
    expect(inicioDelDia('2026-10-09', GT, 300).toISOString()).toBe('2026-10-09T11:00:00.000Z');
    const { desde, hasta } = bordesDelDia('2026-10-09', GT, 300);
    expect(hasta.getTime() - desde.getTime()).toBe(24 * 3600_000);
  });

  it('minutos del día cuentan desde el corte', () => {
    // 06:00 local con corte 05:00 → 60 min del día
    expect(minutosDelDia(new Date('2026-10-09T12:00:00Z'), GT, 300)).toBe(60);
    // 01:00 local → 20 h del día anterior
    expect(minutosDelDia(new Date('2026-10-10T07:00:00Z'), GT, 300)).toBe(20 * 60);
  });

  it('lee y escribe la hora de corte', () => {
    expect(horaACorte('05:00')).toBe(300);
    expect(horaACorte('5:30')).toBe(330);
    expect(horaACorte('13:00')).toBeNull(); // más allá del mediodía
    expect(horaACorte('ab')).toBeNull();
    expect(corteAHora(300)).toBe('05:00');
    expect(normalizarCorte(null)).toBe(CORTE_POR_OMISION);
    expect(normalizarCorte(0)).toBe(0);
    expect(normalizarCorte(9999)).toBe(720);
    expect(sumarDias('2026-10-31', 1)).toBe('2026-11-01');
  });
});

describe('cuadrarPeriodo · lo que no se ha cobrado no se espera (PROD-02)', () => {
  it('una mesa abierta no tiene filas ni está entregada: no cuenta', () => {
    // Antes: los Q380 de dos mesas comiendo eran «faltan Q380».
    const c = cuadrarPeriodo([], []);
    expect(c.efectivo).toBe(0);
    expect(c.cobrado).toBe(0);
  });

  it('cobro de mesa mixto: cada método en su sitio', () => {
    const c = cuadrarPeriodo([
      mov({ amount: 250, kind: 'TABLE_CLOSE' }),
      mov({ amount: 150, method: 'CARD', kind: 'TABLE_CLOSE' }),
    ], []);
    expect(c.porMetodo).toEqual({ CASH: 250, CARD: 150 });
    expect(c.efectivo).toBe(250);
    expect(c.cobrado).toBe(400);
    expect(c.pedidos).toBe(1);
  });

  it('cobro por partes con la mesa todavía abierta: lo cobrado SÍ cuenta', () => {
    const c = cuadrarPeriodo([mov({ amount: 80 })], []);
    expect(c.efectivo).toBe(80);
  });

  it('domicilio del menú en línea entregado sin filas: cuenta con su método', () => {
    const sinFilas: PedidoSinFilas[] = [
      { orderId: 'd1', orderType: 'DELIVERY', method: 'CASH', total: 95, at: '2026-10-09T20:00:00Z' },
      { orderId: 'd2', orderType: 'PICKUP', method: 'card', total: 60, at: '2026-10-09T20:00:00Z' },
    ];
    const c = cuadrarPeriodo([], sinFilas);
    expect(c.porMetodo).toEqual({ CASH: 95, CARD: 60 });
    expect(c.pedidos).toBe(2);
  });

  it('mesa liberada sin cobrar: no se espera, pero se enseña', () => {
    const c = cuadrarPeriodo([], [
      { orderId: 'm1', orderType: 'DINE_IN', method: 'CASH', total: 120, at: '2026-10-09T20:00:00Z' },
    ]);
    expect(c.efectivo).toBe(0);
    expect(c.liberadasSinCobrar).toEqual({ pedidos: 1, total: 120 });
  });
});

describe('corregir un cobro (PROD-05)', () => {
  it('Efectivo→Tarjeta deja de esperar el efectivo y no cambia lo cobrado', () => {
    const original = [mov({ id: 'p1', amount: 200, kind: 'TABLE_CLOSE' })];
    const fix = filasDeCambioDeMetodo(netoPorMetodo(original), 'CARD');
    expect(fix).toEqual([
      { method: 'CASH', amount: -200, kind: 'METHOD_FIX', reversesId: null },
      { method: 'CARD', amount: 200, kind: 'METHOD_FIX', reversesId: null },
    ]);
    const todo = [...original, ...fix.map((f) => mov({ amount: f.amount, method: f.method, kind: f.kind }))];
    const c = cuadrarPeriodo(todo, []);
    expect(c.porMetodo).toEqual({ CARD: 200 });
    expect(c.efectivo).toBe(0);
    expect(c.cobrado).toBe(200);
    // Y el cuadre del cajón con Q500 de fondo: solo el fondo.
    expect(esperadoEnCajon(500, c.efectivo, 0)).toBe(500);
    expect(metodoPrincipal(netoPorMetodo(todo))).toBe('CARD');
  });

  it('una mesa mixta que en realidad pagó toda con tarjeta', () => {
    const neto = { CASH: 250, CARD: 150 };
    const fix = filasDeCambioDeMetodo(neto, 'CARD');
    expect(fix.map((f) => [f.method, f.amount])).toEqual([['CASH', -250], ['CARD', 250]]);
  });

  it('corregir al mismo método no escribe nada', () => {
    expect(filasDeCambioDeMetodo({ CARD: 100 }, 'CARD')).toEqual([]);
  });

  it('solo una parte: mover únicamente el efectivo a transferencia', () => {
    const fix = filasDeCambioDeMetodo({ CASH: 50, CARD: 70 }, 'TRANSFER', 'CASH');
    expect(fix.map((f) => [f.method, f.amount])).toEqual([['CASH', -50], ['TRANSFER', 50]]);
  });

  it('reabrir una mesa cobrada por error: el cobro se compensa', () => {
    const c = cuadrarPeriodo([
      mov({ amount: 300, kind: 'TABLE_CLOSE' }),
      mov({ amount: -300, kind: 'REOPEN' }),
    ], []);
    expect(c.efectivo).toBe(0);
    expect(c.cobrado).toBe(0);
    expect(c.devoluciones).toBe(0);
  });

  it('devolución de una línea: sale del cajón del turno en que se devuelve', () => {
    // El pedido se cobró en el turno anterior; aquí solo está la devolución.
    const c = cuadrarPeriodo([mov({ amount: -45, kind: 'REFUND' })], []);
    expect(c.efectivo).toBe(-45);
    expect(c.devoluciones).toBe(45);
    expect(c.devolucionesEfectivo).toBe(45);
    expect(esperadoEnCajon(500, c.efectivo, 0)).toBe(455);
  });

  it('no se devuelve más de lo cobrado', () => {
    expect(devolvible(netoPorMetodo([mov({ amount: 100 }), mov({ amount: -30, kind: 'REFUND' })]))).toBe(70);
  });

  it('el monto de una línea lleva su parte de propina y descuento', () => {
    // Pedido: consumo 200, total 220 (10 % de propina). Devolver 1 de 2 cafés de Q40.
    expect(montoDeLinea({ lineaSubtotal: 40, lineaCantidad: 2, cantidad: 1, consumoPedido: 200, totalPedido: 220 })).toBe(22);
    expect(montoDeLinea({ lineaSubtotal: 40, lineaCantidad: 2, cantidad: 5, consumoPedido: 200, totalPedido: 220 })).toBe(44);
  });
});

describe('inicioDelPeriodo · el turno cubre desde el cierre anterior (PROD-03)', () => {
  const base = { timezone: GT, corteMin: 300 };

  it('segundo turno del día: empieza en el cierre del primero', () => {
    const ultimoCierre = new Date('2026-10-09T21:00:00Z'); // 15:00 local
    const desde = inicioDelPeriodo({ ...base, ultimoCierre, abiertoEn: null, ahora: new Date('2026-10-10T04:00:00Z') });
    expect(desde.toISOString()).toBe(ultimoCierre.toISOString());
  });

  it('primer turno del día: el cierre de ayer no arrastra lo de ayer', () => {
    const ultimoCierre = new Date('2026-10-08T23:00:00Z'); // ayer 17:00
    const desde = inicioDelPeriodo({ ...base, ultimoCierre, abiertoEn: new Date('2026-10-09T14:00:00Z'), ahora: new Date('2026-10-09T20:00:00Z') });
    expect(desde.toISOString()).toBe('2026-10-09T11:00:00.000Z'); // 05:00 local del 9
  });

  it('bar que cierra a la 1:00: el turno abierto a las 18:00 cubre desde las 05:00 de su día', () => {
    const desde = inicioDelPeriodo({
      ...base, ultimoCierre: null,
      abiertoEn: new Date('2026-10-10T00:00:00Z'), // 18:00 local del 9
      ahora: new Date('2026-10-10T07:00:00Z'),      // 01:00 local del 10
    });
    expect(desde.toISOString()).toBe('2026-10-09T11:00:00.000Z');
  });

  it('un local que nunca cerró caja: solo el día en curso', () => {
    const desde = inicioDelPeriodo({ ...base, ultimoCierre: null, abiertoEn: null, ahora: new Date('2026-10-09T20:00:00Z') });
    expect(desde.toISOString()).toBe('2026-10-09T11:00:00.000Z');
  });

  it('dos turnos en un día: cada uno cuadra solo lo suyo', () => {
    // Mañana: Q300 en efectivo, cierra 15:00 local. Noche: Q200.
    const cierreManana = new Date('2026-10-09T21:00:00Z');
    const todos = [
      mov({ orderId: 'a', amount: 300, at: '2026-10-09T18:00:00Z' }),
      mov({ orderId: 'b', amount: 200, at: '2026-10-10T02:00:00Z' }),
    ];
    const desdeNoche = inicioDelPeriodo({ ...base, ultimoCierre: cierreManana, abiertoEn: cierreManana, ahora: new Date('2026-10-10T04:00:00Z') });
    const deLaNoche = todos.filter((m) => new Date(m.at) > desdeNoche);
    const c = cuadrarPeriodo(deLaNoche, []);
    // Antes esperaba Q500 y salía «faltan Q300».
    expect(esperadoEnCajon(500, c.efectivo, 0)).toBe(700);
  });
});
