import { describe, expect, it } from 'vitest';
import { armarEnvelope, framesDelStack, parseDsn, rutaSegura } from './sentry-core';

describe('parseDsn', () => {
  it('DSN normal de sentry.io', () => {
    expect(parseDsn('https://abc123@o45.ingest.us.sentry.io/4507')).toEqual({
      endpoint: 'https://o45.ingest.us.sentry.io/api/4507/envelope/',
      publicKey: 'abc123',
      dsn: 'https://abc123@o45.ingest.us.sentry.io/4507',
    });
  });

  it('con prefijo de ruta (Sentry propio)', () => {
    expect(parseDsn('https://k@errores.ejemplo.com/sentry/12')?.endpoint)
      .toBe('https://errores.ejemplo.com/sentry/api/12/envelope/');
  });

  it('sin variable, o mal escrita: apagado', () => {
    expect(parseDsn(undefined)).toBeNull();
    expect(parseDsn('')).toBeNull();
    expect(parseDsn('no-es-una-url')).toBeNull();
    expect(parseDsn('https://o45.ingest.sentry.io/4507')).toBeNull(); // sin clave
    expect(parseDsn('https://k@o45.ingest.sentry.io/')).toBeNull(); // sin proyecto
  });
});

describe('framesDelStack', () => {
  const stack = [
    'Error: se cayó',
    '    at guardar (/app/.next/server/chunks/a.js:10:5)',
    '    at async Object.run (/app/node_modules/next/dist/x.js:3:1)',
    '    at node:internal/process:1:1',
  ].join('\n');

  it('la llamada más reciente queda al final, y marca lo propio', () => {
    const f = framesDelStack(stack);
    expect(f).toHaveLength(3);
    expect(f[2]).toMatchObject({ function: 'guardar', lineno: 10, colno: 5, in_app: true });
    expect(f[1].in_app).toBe(false);
    expect(f[0].in_app).toBe(false);
  });

  it('sin stack, sin frames', () => {
    expect(framesDelStack(undefined)).toEqual([]);
  });
});

describe('armarEnvelope', () => {
  it('tres líneas de JSON, con la ruta plantilla y sin nada más', () => {
    const dsn = parseDsn('https://k@o1.ingest.sentry.io/9')!;
    const texto = armarEnvelope(dsn, {
      tipo: 'TypeError', mensaje: 'x is undefined', origen: 'render',
      ruta: '/pedido/[token]', metodo: 'GET', digest: '123',
    }, new Date('2026-10-08T12:00:00Z'), 'a'.repeat(32));
    const [cabecera, item, evento] = texto.split('\n').map((l) => JSON.parse(l));
    expect(cabecera).toMatchObject({ event_id: 'a'.repeat(32), sent_at: '2026-10-08T12:00:00.000Z' });
    expect(item).toEqual({ type: 'event' });
    expect(evento.exception.values[0]).toMatchObject({ type: 'TypeError', value: 'x is undefined' });
    expect(evento.tags).toEqual({ origen: 'render', ruta: '/pedido/[token]', digest: '123' });
    expect(JSON.stringify(evento)).not.toMatch(/cookie|authorization/i);
  });
});

describe('rutaSegura', () => {
  it('quita la consulta y los segmentos que parecen tokens', () => {
    expect(rutaSegura('/pedido/8f3a9c1d2e4b5a6f7c8d?x=1')).toBe('/pedido/:id');
    expect(rutaSegura('/panel/rincon502/menu#arriba')).toBe('/panel/rincon502/menu');
    expect(rutaSegura('/m/15fe3b20-262e-4404-80ae-4ea58d40ae0a/4')).toBe('/m/:id/4');
  });

  it('nada → nada', () => {
    expect(rutaSegura(null)).toBeUndefined();
  });
});
