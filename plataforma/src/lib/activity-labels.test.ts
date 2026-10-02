/** La bitácora en palabras (auditoría 2026-10-02, T-15). Los casos son
 *  filas reales de `activity_log`. */
import { describe, it, expect } from 'vitest';
import { describirActividad, humanizarClave } from './activity-labels';

const fila = (action: string, entity: string | null, meta: Record<string, unknown> | null = null, actor_name: string | null = null) =>
  ({ action, entity, meta, actor_name });

describe('describirActividad', () => {
  it('nunca enseña la clave cruda', () => {
    const casos = [
      fila('order_void', 'se acabó el producto', { itemId: 'x' }),
      fila('order_status', 'SERVED'),
      fila('descuento_mesa', '4', { tipo: 'percent', valor: 10, monto: 13.1, motivo: 'Cumpleaños' }),
      fila('auto_archive', '1 mesa(s)'),
      fila('channel_toggle', 'delivery', { active: false }),
      fila('staff_pin_login', 'Mesero Test', null, 'Mesero Test'),
      fila('vale', 'REGALO-BTVQJ7', { amount: 50 }),
      fila('mesa', '15', { pax: 5, sentar: true, source: 'reservation' }),
      fila('articulo_libre', 'ORD-2026-00049'),
    ];
    for (const c of casos) {
      const texto = describirActividad(c);
      expect(texto).not.toMatch(/_|\b(SERVED|PREP|READY)\b|\(s\)/);
    }
  });

  it('frases de ejemplo', () => {
    expect(describirActividad(fila('order_void', 'se acabó el producto', { itemId: 'x' }, 'Carlos')))
      .toBe('Carlos anuló un plato — «se acabó el producto»');
    expect(describirActividad(fila('order_status', 'SERVED'))).toBe('Pasó un pedido a «Servido»');
    expect(describirActividad(fila('descuento_mesa', '4', { tipo: 'percent', valor: 10, motivo: 'Cumpleaños' })))
      .toBe('Aplicó un descuento del 10 % en la mesa 4 («Cumpleaños»)');
    expect(describirActividad(fila('auto_archive', '1 mesa(s)'))).toBe('Cerró solo 1 mesa abandonada');
    expect(describirActividad(fila('channel_toggle', 'delivery', { active: true }))).toBe('Encendió «A domicilio»');
    expect(describirActividad(fila('mesa', '15', { pax: 5, sentar: true, source: 'reservation' })))
      .toBe('Sentó 5 personas en la mesa 15 de una reservación');
  });

  it('un UUID en `entity` no se enseña', () => {
    expect(describirActividad(fila('staff', 'db44adfa-ae91-4d3f-8c7e-332c87ebcab4', { password_reset: true })))
      .toBe('Cambió la contraseña de un miembro del personal');
  });

  it('una acción nueva sin traducir sale con palabras', () => {
    expect(humanizarClave('cierre_de_caja')).toBe('Cierre de caja');
    expect(describirActividad(fila('cierre_de_caja', null))).toBe('Cierre de caja');
  });
});
