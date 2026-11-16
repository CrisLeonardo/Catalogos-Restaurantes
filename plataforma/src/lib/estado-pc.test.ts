import { describe, expect, it } from 'vitest';
import { estadoDeImpresora, estadoDePc, veredictoDePc } from './estado-pc';

const AHORA = Date.parse('2026-11-16T19:00:00Z'); // 13:00 en Guatemala
const hace = (ms: number) => new Date(AHORA - ms).toISOString();

describe('estadoDePc: un solo reloj (PA-T21)', () => {
  it('sin fila no hay PC, y apagada no alarma', () => {
    expect(estadoDePc(null, AHORA).estado).toBe('sin_pc');
    expect(estadoDePc({ existe: true, activa: false, ultimaSenal: hace(3_600_000) }, AHORA))
      .toMatchObject({ estado: 'apagada', alarma: false });
  });

  it('nunca conectada espera la primera señal', () => {
    expect(estadoDePc({ existe: true, activa: true, ultimaSenal: null }, AHORA).estado).toBe('esperando');
  });

  it('con señal de hace 4 s está conectada', () => {
    expect(estadoDePc({ existe: true, activa: true, ultimaSenal: hace(4_000) }, AHORA))
      .toMatchObject({ estado: 'conectada', texto: 'Conectada', alarma: false });
  });

  it('a los 2 min dice «sin señal» con la hora, sin alarma', () => {
    const d = estadoDePc({ existe: true, activa: null, ultimaSenal: hace(2 * 60_000) }, AHORA);
    expect(d.estado).toBe('sin_senal');
    expect(d.texto).toMatch(/^Sin señal desde las 12:58/);
    expect(d.alarma).toBe(false);
  });

  it('pasados 10 min está desconectada y alarma', () => {
    const d = estadoDePc({ existe: true, activa: true, ultimaSenal: hace(31 * 60_000) }, AHORA);
    expect(d).toMatchObject({ estado: 'desconectada', alarma: true, tono: 'danger' });
    expect(d.texto).toMatch(/^Desconectada desde las 12:29/);
  });

  it('una señal de otro día dice la fecha, no solo la hora', () => {
    expect(estadoDePc({ existe: true, activa: true, ultimaSenal: hace(3 * 86_400_000) }, AHORA).texto)
      .toBe('Desconectada desde el 13 de noviembre');
  });
});

describe('estadoDeImpresora', () => {
  it('cuenta lo que no salió, con la hora del primero', () => {
    const d = estadoDeImpresora({ destino: 'EPSON', fallidos: 3, primerFallo: hace(20 * 60_000), ultimoBien: null }, 'comanda');
    expect(d.estado).toBe('fallando');
    expect(d.texto).toMatch(/^3 comandas no salieron desde las 12:40/);
  });

  it('sin destino pide elegirla; sin uso no es un fallo', () => {
    expect(estadoDeImpresora({ destino: null, fallidos: 0, primerFallo: null, ultimoBien: null }, 'recibo').estado).toBe('sin_asignar');
    expect(estadoDeImpresora({ destino: 'EPSON', fallidos: 0, primerFallo: null, ultimoBien: null }, 'recibo').tono).toBe('ok');
  });
});

describe('veredictoDePc', () => {
  const pcBien = estadoDePc({ existe: true, activa: true, ultimaSenal: hace(2_000) }, AHORA);
  const bien = estadoDeImpresora({ destino: 'EPSON', fallidos: 0, primerFallo: null, ultimoBien: hace(60_000) }, 'comanda');
  const mal = estadoDeImpresora({ destino: 'EPSON', fallidos: 1, primerFallo: hace(60_000), ultimoBien: null }, 'comanda');

  it('PC conectada no es «todo listo» si la cocina no imprime', () => {
    const v = veredictoDePc(pcBien, mal, bien, true);
    expect(v.titulo).toBe('Revisa la impresora de cocina');
    expect(v.detalle).not.toMatch(/\.\./);
  });

  it('todo bien dice todo listo', () => {
    expect(veredictoDePc(pcBien, bien, bien, true)).toMatchObject({ titulo: 'Todo listo para el servicio', tono: 'ok' });
  });

  it('la PC caída manda sobre las impresoras', () => {
    const caida = estadoDePc({ existe: true, activa: true, ultimaSenal: hace(3_600_000) }, AHORA);
    expect(veredictoDePc(caida, mal, bien, true).titulo).toBe('Revisa la PC principal');
  });
});
