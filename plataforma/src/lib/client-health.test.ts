import { describe, expect, it } from 'vitest';
import { alertasDeSalud, alertasPorAvisar, type SaludRestaurante } from './client-health';

// Un martes a las 14:00 en Guatemala (UTC-6).
const ahora = Date.parse('2026-10-20T20:00:00Z');
const hace = (ms: number) => new Date(ahora - ms).toISOString();
const DIA = 86_400_000;
const MIN = 60_000;

const base: SaludRestaurante = {
  restaurantId: 'r1',
  nombre: 'Rincón 502',
  creadoEn: hace(60 * DIA),
  pedidosActivos: true,
  ultimoPedidoEn: hace(1 * DIA),
  platillos: 20,
  pcActiva: true,
  pcVistoEn: hace(1 * MIN),
  impresionesFallidas24h: 0,
  horario: { '2': [['08:00', '22:00']] }, // martes
  excepciones: null,
  zonaHoraria: 'America/Guatemala',
};

const claves = (r: Partial<SaludRestaurante>) => alertasDeSalud([{ ...base, ...r }], [], ahora).map((a) => a.key);

describe('alertasDeSalud', () => {
  it('un restaurante sano no avisa de nada', () => {
    expect(claves({})).toEqual([]);
  });

  it('PC caída en horario: aviso grave', () => {
    const [a] = alertasDeSalud([{ ...base, pcVistoEn: hace(40 * MIN) }], [], ahora);
    expect(a).toMatchObject({ key: 'pc-r1', tone: 'danger', grave: true });
    expect(a.body).toMatch(/40 min/);
  });

  it('PC caída FUERA de horario: nada (a las 3 a. m. está apagada a propósito)', () => {
    expect(claves({ pcVistoEn: hace(40 * MIN), horario: { '2': [['18:00', '23:00']] } })).toEqual([]);
  });

  it('PC sin conectarse desde hace DÍAS: aviso tranquilo en días, nunca al celular', () => {
    const [a] = alertasDeSalud([{ ...base, pcVistoEn: hace(90 * DIA) }], [], ahora);
    expect(a).toMatchObject({ key: 'pc-r1', tone: 'warn', grave: false });
    expect(a.title).toMatch(/90 días sin conectarse/);
  });

  it('PC caída hace 5 h en horario: sigue siendo urgente, contado en horas', () => {
    const [a] = alertasDeSalud([{ ...base, pcVistoEn: hace(5 * 3_600_000) }], [], ahora);
    expect(a).toMatchObject({ tone: 'danger', grave: true });
    expect(a.body).toMatch(/hace 5 h/);
  });

  it('sin horario puesto cuenta como abierto, y lo dice', () => {
    const [a] = alertasDeSalud([{ ...base, horario: null, pcVistoEn: hace(30 * MIN) }], [], ahora);
    expect(a.body).toMatch(/No tiene horario puesto/);
  });

  it('PC apagada por el dueño (no activa): nada', () => {
    expect(claves({ pcActiva: false, pcVistoEn: hace(5 * DIA) })).toEqual([]);
  });

  it('pocas impresiones fallidas no avisan; desde 3 sí, y desde 10 es grave', () => {
    expect(claves({ impresionesFallidas24h: 2 })).toEqual([]);
    expect(alertasDeSalud([{ ...base, impresionesFallidas24h: 3 }], [], ahora)[0]).toMatchObject({ tone: 'warn', grave: false });
    expect(alertasDeSalud([{ ...base, impresionesFallidas24h: 12 }], [], ahora)[0]).toMatchObject({ tone: 'danger', grave: true });
  });

  it('una semana sin pedidos: aviso', () => {
    const [a] = alertasDeSalud([{ ...base, ultimoPedidoEn: hace(9 * DIA) }], [], ahora);
    expect(a).toMatchObject({ key: 'sin-pedidos-r1', grave: false });
    expect(a.title).toMatch(/9 días sin pedidos/);
  });

  it('nunca un pedido tras una semana: «primer pedido»', () => {
    const [a] = alertasDeSalud([{ ...base, ultimoPedidoEn: null, creadoEn: hace(8 * DIA) }], [], ahora);
    expect(a.title).toMatch(/primer pedido/);
  });

  it('recién creado sin pedidos: todavía no', () => {
    expect(claves({ ultimoPedidoEn: null, creadoEn: hace(2 * DIA) })).toEqual([]);
  });

  it('sin pedidos en línea encendidos: no se le exige vender por ahí', () => {
    expect(claves({ pedidosActivos: false, ultimoPedidoEn: null })).toEqual([]);
  });

  it('sin platillos a los 3 días: avisa ESO y no además «sin pedidos»', () => {
    expect(claves({ platillos: 0, ultimoPedidoEn: null, creadoEn: hace(10 * DIA) })).toEqual(['sin-platillos-r1']);
  });

  it('cuenta sin restaurante: aviso informativo que lleva a la cuenta', () => {
    const [a] = alertasDeSalud([], [{ userId: 'u1', email: 'ana@x.com', nombre: 'Ana', creadaEn: hace(3 * DIA) }], ahora);
    expect(a).toMatchObject({ key: 'cuenta-u1', tone: 'info', href: '/super/cuentas/u1', grave: false });
    expect(a.title).toMatch(/^Ana se registró/);
  });

  it('ordena: lo grave primero', () => {
    const r = alertasDeSalud(
      [
        { ...base, restaurantId: 'a', ultimoPedidoEn: hace(9 * DIA) },
        { ...base, restaurantId: 'b', pcVistoEn: hace(30 * MIN) },
      ],
      [{ userId: 'u1', email: 'x@x.com', nombre: null, creadaEn: hace(3 * DIA) }],
      ahora,
    );
    expect(r.map((x) => x.tone)).toEqual(['danger', 'warn', 'info']);
  });
});

describe('alertasPorAvisar', () => {
  const graves = alertasDeSalud(
    [{ ...base, restaurantId: 'a', pcVistoEn: hace(40 * MIN) }, { ...base, restaurantId: 'b', ultimoPedidoEn: hace(9 * DIA) }],
    [],
    ahora,
  );

  it('solo lo grave, y la primera vez sí', () => {
    expect(alertasPorAvisar(graves, new Map(), ahora).map((a) => a.key)).toEqual(['pc-a']);
  });

  it('mandada hace 2 h: no se repite', () => {
    expect(alertasPorAvisar(graves, new Map([['pc-a', hace(2 * 3_600_000)]]), ahora)).toEqual([]);
  });

  it('mandada hace 7 h y sigue pasando: se vuelve a mandar', () => {
    expect(alertasPorAvisar(graves, new Map([['pc-a', hace(7 * 3_600_000)]]), ahora).map((a) => a.key)).toEqual(['pc-a']);
  });
});
