import { describe, expect, it } from 'vitest';
import {
  duracion, etapaDeHoy, excepcionesDeServicio, ordenarExcepciones, ordenarServicio,
  pasosPrimerPedido, type PedidoVivo,
} from '@/lib/hoy-etapa';

const AHORA = new Date('2026-11-15T21:00:00Z').getTime();
const hace = (min: number) => new Date(AHORA - min * 60_000).toISOString();
const hora = () => '6:12';
const dinero = (n: number) => `Q${n.toFixed(2)}`;

function pedido(p: Partial<PedidoVivo>): PedidoVivo {
  return {
    id: crypto.randomUUID(), status: 'NEW', order_type: 'PICKUP', created_at: hace(5),
    accepted_at: null, ready_at: null, total: 100, etiqueta: 'Para llevar', cliente: null,
    es_prueba: false, ...p,
  };
}

describe('etapaDeHoy', () => {
  const base = { guiaPendiente: false, cerroHoy: false, turnoAbierto: false, cobradoDesdeCierre: 0, pedidosVivos: 0 };

  it('la guía pendiente manda sobre todo', () => {
    expect(etapaDeHoy({ ...base, guiaPendiente: true, cerroHoy: true })).toBe('nuevo');
  });
  it('cerrado solo con cierre de hoy, sin turno, sin cobros nuevos y sin pedidos vivos', () => {
    expect(etapaDeHoy({ ...base, cerroHoy: true })).toBe('cerrado');
    expect(etapaDeHoy({ ...base, cerroHoy: true, turnoAbierto: true })).toBe('operando');
    expect(etapaDeHoy({ ...base, cerroHoy: true, cobradoDesdeCierre: 10 })).toBe('operando');
    expect(etapaDeHoy({ ...base, cerroHoy: true, pedidosVivos: 1 })).toBe('operando');
  });
  it('sin cierre hoy sigue operando', () => {
    expect(etapaDeHoy(base)).toBe('operando');
  });
});

describe('pasosPrimerPedido', () => {
  it('marca cada paso por lo que pasó', () => {
    const pasos = pasosPrimerPedido({ platillos: 3, visitas: 0, personasDistintas: 0, conPedidos: true, pedidoRecorrido: false });
    expect(pasos.map((p) => [p.clave, p.hecho])).toEqual([['platillos', true], ['carta', false], ['prueba', false]]);
  });
  it('sin pedidos en el plan, el tercer paso es que la carta llegue a la gente', () => {
    const pasos = pasosPrimerPedido({ platillos: 3, visitas: 5, personasDistintas: 3, conPedidos: false, pedidoRecorrido: false });
    expect(pasos[2]).toEqual({ clave: 'qr', hecho: true });
  });
});

describe('duracion', () => {
  it('da minutos y horas sin ceros sobrantes', () => {
    expect(duracion(12 * 60_000)).toBe('12 min');
    expect(duracion(60 * 60_000)).toBe('1 h');
    expect(duracion((9 * 60 + 26) * 60_000)).toBe('9 h 26 min');
    expect(duracion(-5)).toBe('0 min');
  });
});

describe('excepcionesDeServicio', () => {
  it('sin nada que atender no inventa avisos', () => {
    expect(excepcionesDeServicio([pedido({ status: 'PREP', accepted_at: hace(5) })], AHORA, hora, dinero)).toEqual([]);
  });

  it('agrupa los pedidos por aceptar y dice desde cuándo espera el primero', () => {
    const [e] = excepcionesDeServicio([
      pedido({ created_at: hace(6), order_type: 'DELIVERY' }),
      pedido({ created_at: hace(2), order_type: 'DELIVERY' }),
    ], AHORA, hora, dinero);
    expect(e.titulo).toBe('2 pedidos esperan que los aceptes');
    expect(e.detalle).toBe('Domicilio · el primero hace 6 min');
    expect(e.nivel).toBe('urgente');
  });

  it('señala un pedido atascado en cocina con su hora y total', () => {
    const [e] = excepcionesDeServicio([
      pedido({ status: 'PREP', etiqueta: 'Mesa 7', accepted_at: hace(9 * 60 + 26), total: 192 }),
    ], AHORA, hora, dinero);
    expect(e.titulo).toBe('Mesa 7 lleva 9 h 26 min en cocina');
    expect(e.detalle).toBe('Pedido de las 6:12 · Q192.00');
  });

  it('la comida lista avisa a los diez minutos, no antes', () => {
    expect(excepcionesDeServicio([pedido({ status: 'READY', ready_at: hace(9) })], AHORA, hora, dinero)).toEqual([]);
    const [e] = excepcionesDeServicio([pedido({ status: 'READY', etiqueta: 'Mesa 4', ready_at: hace(12) })], AHORA, hora, dinero);
    expect(e.titulo).toBe('La comida de Mesa 4 está lista');
    expect(e.nivel).toBe('aviso');
  });
});

describe('ordenar', () => {
  it('las excepciones van por nivel y conservan el orden dentro de cada uno', () => {
    const e = (key: string, nivel: 'urgente' | 'aviso' | 'info') => ({ key, nivel, titulo: '', detalle: '', accion: '', ruta: '' });
    expect(ordenarExcepciones([e('a', 'info'), e('b', 'urgente'), e('c', 'aviso'), e('d', 'urgente')]).map((x) => x.key))
      .toEqual(['b', 'd', 'c', 'a']);
  });
  it('en el servicio, lo listo va primero', () => {
    const lista = ordenarServicio([
      pedido({ id: 'cocina', status: 'PREP', created_at: hace(30) }),
      pedido({ id: 'listo', status: 'READY', created_at: hace(10) }),
      pedido({ id: 'nuevo', status: 'NEW', created_at: hace(1) }),
    ]);
    expect(lista.map((p) => p.id)).toEqual(['listo', 'nuevo', 'cocina']);
  });
});
