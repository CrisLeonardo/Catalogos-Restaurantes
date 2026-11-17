import { describe, expect, it } from 'vitest';
import { diagnosticarPedidos, type DatosDiagnostico } from './diagnostico';

// Martes 15 de diciembre de 2026, 13:00 en Guatemala.
const AHORA = Date.parse('2026-12-15T19:00:00Z');
const base: DatosDiagnostico = {
  pausa: { orders_paused: false, orders_paused_until: null },
  hours: null, exceptions: null, zona: 'America/Guatemala',
  pedidosEncendidos: true, orderTypes: ['pickup', 'delivery'],
  pc: { activa: true, ultimaSenal: new Date(AHORA - 5_000).toISOString() },
};

describe('no me entran pedidos (S07)', () => {
  it('con todo bien, todo en verde', () => {
    expect(diagnosticarPedidos(base, AHORA).every((p) => p.ok)).toBe(true);
  });

  it('la pausa va primero y trae «Reanudar»', () => {
    const r = diagnosticarPedidos({ ...base, pausa: { orders_paused: true, orders_paused_until: null } }, AHORA);
    expect(r[0]).toMatchObject({ key: 'pausa', ok: false, accion: { tipo: 'reanudar' } });
  });

  it('el horario cerrado lleva a Horarios', () => {
    const r = diagnosticarPedidos({ ...base, hours: { '3': [['11:00', '22:00']] } }, AHORA);
    expect(r.find((p) => p.key === 'horario')).toMatchObject({ ok: false, titulo: 'Tu horario dice cerrado ahora' });
  });

  it('la PC sin señal hace 30 min no responde; apagada a propósito no se revisa', () => {
    const caida = diagnosticarPedidos({ ...base, pc: { activa: true, ultimaSenal: new Date(AHORA - 30 * 60_000).toISOString() } }, AHORA);
    expect(caida.find((p) => p.key === 'pc')?.ok).toBe(false);
    expect(diagnosticarPedidos({ ...base, pc: { activa: false, ultimaSenal: null } }, AHORA).some((p) => p.key === 'pc')).toBe(false);
  });

  it('pedidos apagados lo dice', () => {
    expect(diagnosticarPedidos({ ...base, pedidosEncendidos: false }, AHORA)[0])
      .toMatchObject({ key: 'pedidos', ok: false });
  });
});
