/** Analítica de la web comercial (auditoría 2026-10-02, WEB-01). */
import { describe, it, expect } from 'vitest';
import { analiticaConfig, conEvento, cuerpoDelEvento, eventoAlTocar, EVENTOS } from './analytics';

describe('configuración', () => {
  it('apagada sin variables o con un proveedor desconocido', () => {
    expect(analiticaConfig({})).toBeNull();
    expect(analiticaConfig({ NEXT_PUBLIC_ANALYTICS_PROVIDER: 'umami' })).toBeNull();
    expect(analiticaConfig({ NEXT_PUBLIC_ANALYTICS_PROVIDER: 'google', NEXT_PUBLIC_ANALYTICS_ID: 'x' })).toBeNull();
  });

  it('Umami en la nube por defecto', () => {
    expect(analiticaConfig({ NEXT_PUBLIC_ANALYTICS_PROVIDER: 'Umami', NEXT_PUBLIC_ANALYTICS_ID: 'abc' })).toEqual({
      proveedor: 'umami', id: 'abc', script: 'https://cloud.umami.is/script.js', origen: 'https://cloud.umami.is',
    });
  });

  it('Plausible con la variante que lee los eventos de las clases', () => {
    const c = analiticaConfig({ NEXT_PUBLIC_ANALYTICS_PROVIDER: 'plausible', NEXT_PUBLIC_ANALYTICS_ID: 'distleogin.com' });
    expect(c?.script).toBe('https://plausible.io/js/script.tagged-events.js');
    expect(c?.origen).toBe('https://plausible.io');
  });

  it('instancia propia: su origen entra en la CSP; nunca por http', () => {
    const c = analiticaConfig({ NEXT_PUBLIC_ANALYTICS_PROVIDER: 'umami', NEXT_PUBLIC_ANALYTICS_ID: 'abc', NEXT_PUBLIC_ANALYTICS_SCRIPT: 'https://stats.distleogin.com/script.js' });
    expect(c?.origen).toBe('https://stats.distleogin.com');
    expect(analiticaConfig({ NEXT_PUBLIC_ANALYTICS_PROVIDER: 'umami', NEXT_PUBLIC_ANALYTICS_ID: 'abc', NEXT_PUBLIC_ANALYTICS_SCRIPT: 'http://evil.example/x.js' })).toBeNull();
    expect(analiticaConfig({ NEXT_PUBLIC_ANALYTICS_PROVIDER: 'umami', NEXT_PUBLIC_ANALYTICS_ID: 'abc', NEXT_PUBLIC_ANALYTICS_SCRIPT: 'no es url' })).toBeNull();
  });
});

describe('eventos al tocar', () => {
  it('atributos para los dos proveedores', () => {
    expect(eventoAlTocar(EVENTOS.clicCrear, 'plan Básico')).toEqual({
      className: 'plausible-event-name=Clic+crear+restaurante plausible-event-lugar=plan+Básico',
      data: { 'data-umami-event': 'Clic crear restaurante', 'data-umami-event-lugar': 'plan Básico' },
    });
  });

  it('conserva las clases del enlace', () => {
    const p = conEvento('lp-btn lp-btn-primary', EVENTOS.clicCrear, 'portada');
    expect(p.className.startsWith('lp-btn lp-btn-primary plausible-event-name=')).toBe(true);
    expect(p['data-umami-event']).toBe('Clic crear restaurante');
  });
});

describe('eventos del servidor (LZ-11)', () => {
  const umami = analiticaConfig({ NEXT_PUBLIC_ANALYTICS_PROVIDER: 'umami', NEXT_PUBLIC_ANALYTICS_ID: 'sitio-1' })!;
  const plausible = analiticaConfig({ NEXT_PUBLIC_ANALYTICS_PROVIDER: 'plausible', NEXT_PUBLIC_ANALYTICS_ID: 'distleogin.com' })!;
  const url = 'https://distleogin.com/registro';

  it('llevan el plan y el caso de la web, en el campo de cada proveedor', () => {
    const props = { plan: 'EN_LINEA', caso: 'llevar' };
    expect(cuerpoDelEvento(umami, EVENTOS.cuentaCreada, url, props)).toEqual({
      type: 'event',
      payload: { website: 'sitio-1', hostname: 'distleogin.com', url: '/registro', name: 'Cuenta creada', language: 'es-GT', data: props },
    });
    expect(cuerpoDelEvento(plausible, EVENTOS.cuentaCreada, url, props)).toEqual({
      name: 'Cuenta creada', domain: 'distleogin.com', url, props,
    });
  });

  it('sin propiedades, el cuerpo queda como antes', () => {
    expect(cuerpoDelEvento(plausible, EVENTOS.primerPlatillo, url)).toEqual({ name: 'Primer platillo', domain: 'distleogin.com', url });
    expect('data' in (cuerpoDelEvento(umami, EVENTOS.primerPlatillo, url, {}) as { payload: object }).payload).toBe(false);
  });
});
