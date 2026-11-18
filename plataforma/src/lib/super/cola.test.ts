import { describe, expect, it } from 'vitest';
import { antiguedad, armarCola, type CobroDeRestaurante, type EstadoGuardado } from './cola';
import type { SaludRestaurante } from '@/lib/client-health';

const AHORA = new Date('2026-11-18T18:00:00Z').getTime();
const RID = '11111111-1111-4111-8111-111111111111';
const RID2 = '22222222-2222-4222-8222-222222222222';

function rest(p: Partial<SaludRestaurante> = {}): SaludRestaurante {
  return {
    restaurantId: RID, nombre: 'Rincón 502', creadoEn: '2026-08-04T12:00:00Z', pedidosActivos: true,
    ultimoPedidoEn: '2026-11-18T17:00:00Z', platillos: 30, pcActiva: false, pcVistoEn: null,
    impresionesFallidas24h: 0, horario: null, excepciones: null, zonaHoraria: 'America/Guatemala',
    ...p,
  };
}

function cobro(p: Partial<CobroDeRestaurante> = {}): CobroDeRestaurante {
  return {
    restaurantId: RID2, nombre: 'Comedor Ana', activo: true, planNombre: 'Estándar', pendiente: 398,
    vencido: true, vencidoDesde: '2026-11-13', sinTarifa: false, pruebaDias: null, pendienteTexto: 'Q398.00',
    ...p,
  };
}

const sinGuardados = new Map<string, EstadoGuardado>();

describe('armarCola', () => {
  it('junta la PC caída y las impresiones fallidas del mismo restaurante en un asunto', () => {
    const cola = armarCola({
      restaurantes: [rest({ pcActiva: true, pcVistoEn: '2026-11-18T17:40:00Z', impresionesFallidas24h: 4 })],
      cuentas: [], cobros: [], guardados: sinGuardados, ahora: AHORA,
    });
    const servicio = cola.grupos.find((g) => g.tipo === 'servicio');
    expect(servicio?.asuntos).toHaveLength(1);
    expect(servicio?.asuntos[0].resumen).toBe('La PC no responde · 4 impresiones fallidas');
    expect(servicio?.asuntos[0].evidencia).toHaveLength(2);
    expect(servicio?.asuntos[0].tono).toBe('danger');
  });

  it('un cobro vencido es un asunto de cobranza con su antigüedad', () => {
    const cola = armarCola({ restaurantes: [], cuentas: [], cobros: [cobro()], guardados: sinGuardados, ahora: AHORA });
    const a = cola.grupos[0].asuntos[0];
    expect(cola.grupos[0].tipo).toBe('cobranza');
    expect(a.resumen).toBe('Vencido Q398.00 · Estándar');
    expect(antiguedad(a.desde, AHORA)).toBe('5 días');
  });

  it('resuelto con la misma evidencia no vuelve; con otra evidencia vuelve marcado', () => {
    const base = armarCola({ restaurantes: [], cuentas: [], cobros: [cobro()], guardados: sinGuardados, ahora: AHORA });
    const firma = base.grupos[0].asuntos[0].firma;
    const resuelto = new Map<string, EstadoGuardado>([[`cobranza:${RID2}`, { estado: 'resuelto', hasta: null, motivo: null, evidencia: firma }]]);

    const igual = armarCola({ restaurantes: [], cuentas: [], cobros: [cobro()], guardados: resuelto, ahora: AHORA });
    expect(igual.total).toBe(0);
    expect(igual.resueltos).toBe(1);

    const otroCobro = armarCola({ restaurantes: [], cuentas: [], cobros: [cobro({ pendiente: 747, pendienteTexto: 'Q747.00' })], guardados: resuelto, ahora: AHORA });
    expect(otroCobro.total).toBe(1);
    expect(otroCobro.grupos[0].asuntos[0].volvio).toBe('evidencia');
  });

  it('pospuesto se aparta hasta su fecha y luego vuelve', () => {
    const base = armarCola({ restaurantes: [], cuentas: [], cobros: [cobro()], guardados: sinGuardados, ahora: AHORA });
    const firma = base.grupos[0].asuntos[0].firma;
    const pospuesto = new Map<string, EstadoGuardado>([[`cobranza:${RID2}`, {
      estado: 'pospuesto', hasta: '2026-11-20T12:00:00Z', motivo: 'Espera un pago', evidencia: firma,
    }]]);

    const antes = armarCola({ restaurantes: [], cuentas: [], cobros: [cobro()], guardados: pospuesto, ahora: AHORA });
    expect(antes.total).toBe(0);
    expect(antes.pospuestos[0].motivo).toBe('Espera un pago');

    const despues = armarCola({ restaurantes: [], cuentas: [], cobros: [cobro()], guardados: pospuesto, ahora: new Date('2026-11-21T00:00:00Z').getTime() });
    expect(despues.total).toBe(1);
    expect(despues.grupos[0].asuntos[0].volvio).toBe('fecha');
  });

  it('sin pedidos es seguimiento, no un cliente perdido', () => {
    const cola = armarCola({
      restaurantes: [rest({ ultimoPedidoEn: '2026-11-09T12:00:00Z' })],
      cuentas: [], cobros: [], guardados: sinGuardados, ahora: AHORA,
    });
    expect(cola.grupos[0].tipo).toBe('seguimiento');
    expect(cola.grupos[0].asuntos[0].resumen).toBe('Lleva 9 días sin pedidos');
  });

  it('pone primero el servicio afectado', () => {
    const cola = armarCola({
      restaurantes: [rest({ pcActiva: true, pcVistoEn: '2026-11-18T17:30:00Z' })],
      cuentas: [], cobros: [cobro()], guardados: sinGuardados, ahora: AHORA,
    });
    expect(cola.grupos.map((g) => g.tipo)).toEqual(['servicio', 'cobranza']);
  });
});

describe('antiguedad', () => {
  it('dice minutos, horas o días', () => {
    expect(antiguedad('2026-11-18T17:40:00Z', AHORA)).toBe('hace 20 min');
    expect(antiguedad('2026-11-18T15:00:00Z', AHORA)).toBe('hace 3 h');
    expect(antiguedad('2026-11-17T12:00:00Z', AHORA)).toBe('1 día');
    expect(antiguedad(null, AHORA)).toBeNull();
  });
});
