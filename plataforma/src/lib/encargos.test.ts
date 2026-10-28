import { describe, expect, it } from 'vitest';
import {
  diaDeEntrega, entroEnElCupo, estadoEncargo, horaLocalAIso, lugaresLibres,
  textoCierre, textoEntrega, validarNuevaFecha,
} from './encargos';

const GT = 'America/Guatemala';
const AHORA = Date.parse('2026-10-28T18:00:00Z'); // mié 28 oct, 12:00 en Guatemala

describe('horaLocalAIso', () => {
  it('convierte la hora de Guatemala (UTC−6) a UTC', () => {
    expect(horaLocalAIso('2026-11-01T18:00', GT)).toBe('2026-11-02T00:00:00.000Z');
  });

  it('respeta el cambio de horario de otras zonas', () => {
    // Nueva York: 1 nov 2026 ya es horario de invierno (UTC−5).
    expect(horaLocalAIso('2026-11-02T09:00', 'America/New_York')).toBe('2026-11-02T14:00:00.000Z');
    expect(horaLocalAIso('2026-07-02T09:00', 'America/New_York')).toBe('2026-07-02T13:00:00.000Z');
  });

  it('rechaza lo que no es fecha y hora', () => {
    expect(horaLocalAIso('mañana', GT)).toBeNull();
    expect(horaLocalAIso('2026-11-01', GT)).toBeNull();
  });
});

describe('estadoEncargo', () => {
  const base = { activo: true, cierreAt: '2026-11-01T00:00:00Z', cupo: 40, ocupados: 10 };
  it('abierto, lleno, cerrado y pausado', () => {
    expect(estadoEncargo(base, AHORA)).toBe('abierto');
    expect(estadoEncargo({ ...base, ocupados: 40 }, AHORA)).toBe('lleno');
    expect(estadoEncargo({ ...base, cierreAt: '2026-10-28T17:00:00Z' }, AHORA)).toBe('cerrado');
    expect(estadoEncargo({ ...base, activo: false }, AHORA)).toBe('pausado');
  });

  it('lugares libres nunca negativo', () => {
    expect(lugaresLibres({ cupo: 40, ocupados: 28 })).toBe(12);
    expect(lugaresLibres({ cupo: 40, ocupados: 41 })).toBe(0);
  });
});

describe('entroEnElCupo', () => {
  const pedidos = [
    { id: 'b', created_at: '2026-10-28T10:00:00Z' },
    { id: 'a', created_at: '2026-10-28T10:00:00Z' },
    { id: 'c', created_at: '2026-10-28T09:00:00Z' },
  ];
  it('ordena por hora y desempata por id, igual para todos', () => {
    expect(entroEnElCupo(pedidos, 'c', 2)).toBe(true);
    expect(entroEnElCupo(pedidos, 'a', 2)).toBe(true);
    expect(entroEnElCupo(pedidos, 'b', 2)).toBe(false);
  });
  it('un pedido que no está en la lista no entra', () => {
    expect(entroEnElCupo(pedidos, 'z', 10)).toBe(false);
  });
});

describe('textos', () => {
  it('día y hora de entrega', () => {
    expect(diaDeEntrega('2026-11-07')).toBe('sáb 7 nov');
    expect(textoEntrega({ entregaFecha: '2026-11-07', entregaHora: '8 a 11 a. m.' })).toBe('sáb 7 nov · 8 a 11 a. m.');
    expect(textoEntrega({ entregaFecha: '2026-11-07', entregaHora: null })).toBe('sáb 7 nov');
  });
  it('cierre en la hora del restaurante', () => {
    expect(textoCierre('2026-11-07T00:00:00Z', GT)).toMatch(/^vie 6 nov, 6:00/);
  });
});

describe('validarNuevaFecha', () => {
  const ok = { titulo: '  Tamales  del sábado ', entregaFecha: '2026-11-07', entregaHora: '8 a 11', cierre: '2026-11-06T18:00', cupo: 40, pagoAdelantado: true };

  it('normaliza y convierte el cierre', () => {
    const r = validarNuevaFecha(ok, GT, AHORA);
    expect(r).toEqual({
      ok: true,
      fila: { titulo: 'Tamales del sábado', entrega_fecha: '2026-11-07', entrega_hora: '8 a 11', cierre_at: '2026-11-07T00:00:00.000Z', cupo: 40, pago_adelantado: true },
    });
  });

  it('rechaza cierre pasado, cierre después de la entrega y cupo inválido', () => {
    expect(validarNuevaFecha({ ...ok, cierre: '2026-10-27T18:00' }, GT, AHORA).ok).toBe(false);
    expect(validarNuevaFecha({ ...ok, cierre: '2026-11-08T08:00' }, GT, AHORA).ok).toBe(false);
    expect(validarNuevaFecha({ ...ok, cupo: 0 }, GT, AHORA).ok).toBe(false);
    expect(validarNuevaFecha({ ...ok, titulo: 'x' }, GT, AHORA).ok).toBe(false);
  });

  it('permite cerrar el mismo día de la entrega', () => {
    expect(validarNuevaFecha({ ...ok, cierre: '2026-11-07T06:00' }, GT, AHORA).ok).toBe(true);
  });
});
