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

describe('describirActividad · antifraude (PROD-10)', () => {
  it('precios, borrados, cupones, gastos, pausa y horario, con el importe', () => {
    expect(describirActividad(fila('precio', 'Pepián', { precio: { antes: 50, despues: 40 }, opciones: [] }, 'Ana')))
      .toBe('Ana cambió el precio de «Pepián» (Q50.00 → Q40.00)');
    expect(describirActividad(fila('precio', 'Pizza', { precio: null, opciones: [{ que: 'Tamaño › Grande', antes: 5, despues: -2 }] })))
      .toBe('Cambió el precio de «Pizza» (Tamaño › Grande: +Q5.00 → −Q2.00)');
    expect(describirActividad(fila('platillo_borrado', 'Pepián', { precio: 50 })))
      .toBe('Borró el platillo «Pepián» de Q50.00');
    expect(describirActividad(fila('categoria_borrada', 'Postres'))).toBe('Borró la categoría «Postres»');
    expect(describirActividad(fila('cupon', 'AMIGO', { evento: 'creado', tipo: 'PERCENT', valor: 100 }, 'Luis')))
      .toBe('Luis creó el cupón AMIGO (100 % de descuento)');
    expect(describirActividad(fila('cupon', 'VERANO', { evento: 'editado', tipo: 'FIXED', valor: 30, antes: { tipo: 'FIXED', valor: 10 } })))
      .toBe('Editó el cupón VERANO (Q10.00 de descuento → Q30.00 de descuento)');
    expect(describirActividad(fila('cupon', 'VERANO', { evento: 'desactivado' }))).toBe('Desactivó el cupón VERANO');
    expect(describirActividad(fila('cupon', 'VERANO', { evento: 'borrado', tipo: 'PERCENT', valor: 10 })))
      .toBe('Borró el cupón VERANO (10 % de descuento)');
    expect(describirActividad(fila('gasto', 'Mercado', { evento: 'alta', monto: 85.5 })))
      .toBe('Anotó un gasto de caja de Q85.50 — «Mercado»');
    expect(describirActividad(fila('gasto', 'Mercado', { evento: 'borrado', monto: 85.5 })))
      .toBe('Borró un gasto de caja de Q85.50 — «Mercado»');
    expect(describirActividad(fila('pausa_pedidos', null, { pausado: true }))).toBe('Pausó los pedidos en línea');
    expect(describirActividad(fila('pausa_pedidos', null, { pausado: false }))).toBe('Reanudó los pedidos en línea');
    expect(describirActividad(fila('horario', null, {}))).toBe('Cambió el horario del restaurante');
  });

  it('más de dos opciones se resumen', () => {
    const opciones = ['A', 'B', 'C', 'D'].map((x) => ({ que: x, antes: 1, despues: 2 }));
    expect(describirActividad(fila('precio', 'Combo', { precio: null, opciones })))
      .toBe('Cambió el precio de «Combo» (A: +Q1.00 → +Q2.00; B: +Q1.00 → +Q2.00; y 2 opciones más)');
  });
});
