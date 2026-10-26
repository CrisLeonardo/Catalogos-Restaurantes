import { describe, it, expect } from 'vitest';
import { panelBaseFrom, internalPanelPath, panelHref } from './panel-links';

/* ── Contexto ─────────────────────────────────────────────────────
   Fase 3 del PLAN_ORIGEN_UNICO.md. Lo que fija este archivo es la propiedad
   que hace que la fase se pueda subir SOLA, sin encender nada más: mientras
   el navegador no esté en `/panel/<slug>`, todos los enlaces tienen que salir
   exactamente igual que antes. Si eso se rompiera, el panel del subdominio
   —el que usa todo el mundo hoy— se llenaría de enlaces a ninguna parte. */

describe('panelBaseFrom', () => {
  it('saca el prefijo cuando el navegador ya está en el origen único', () => {
    expect(panelBaseFrom('/panel/rincon502')).toBe('/panel/rincon502');
    expect(panelBaseFrom('/panel/rincon502/menu/productos/1')).toBe('/panel/rincon502');
  });

  it('en el subdominio de hoy no hay prefijo: cadena vacía', () => {
    expect(panelBaseFrom('/admin/menu')).toBe('');
    expect(panelBaseFrom('/mi-cuenta')).toBe('');
    expect(panelBaseFrom(null)).toBe('');
  });

  it('/panel a secas no es de nadie', () => {
    expect(panelBaseFrom('/panel')).toBe('');
  });

  it('no se come un slug parecido: /paneles no es /panel', () => {
    expect(panelBaseFrom('/paneles/rincon502')).toBe('');
  });
});

describe('internalPanelPath', () => {
  it('traduce lo que ve el navegador a la ruta que renderiza Next', () => {
    expect(internalPanelPath('/panel/rincon502')).toBe('/admin');
    expect(internalPanelPath('/panel/rincon502/')).toBe('/admin');
    expect(internalPanelPath('/panel/rincon502/menu')).toBe('/admin/menu');
    expect(internalPanelPath('/panel/rincon502/menu/productos/1')).toBe('/admin/menu/productos/1');
  });

  it('en el subdominio devuelve la misma ruta: la lógica de pestañas no se entera', () => {
    expect(internalPanelPath('/admin/menu')).toBe('/admin/menu');
    expect(internalPanelPath('/admin')).toBe('/admin');
  });
});

describe('panelHref', () => {
  const base = '/panel/rincon502';

  it('prefija las secciones del panel', () => {
    expect(panelHref(base, '/admin')).toBe('/panel/rincon502');
    expect(panelHref(base, '/admin/menu')).toBe('/panel/rincon502/menu');
    expect(panelHref(base, '/admin/menu/productos/new')).toBe('/panel/rincon502/menu/productos/new');
  });

  it('sin base (el subdominio de hoy) NO toca nada — es lo que hace segura esta fase', () => {
    expect(panelHref('', '/admin')).toBe('/admin');
    expect(panelHref('', '/admin/menu')).toBe('/admin/menu');
    expect(panelHref('', '/admin/login')).toBe('/admin/login');
  });

  it('las rutas sin restaurante se quedan en el dominio raíz', () => {
    // Son de la plataforma, no de un local: prefijarlas las mandaría a una
    // ruta que el proxy reescribiría a /admin/admin/login.
    expect(panelHref(base, '/admin/login')).toBe('/admin/login');
    expect(panelHref(base, '/admin/logout-operator')).toBe('/admin/logout-operator');
    expect(panelHref(base, '/admin/recuperar')).toBe('/admin/recuperar');
    expect(panelHref(base, '/admin/nueva-clave')).toBe('/admin/nueva-clave');
    expect(panelHref(base, '/admin/auth/google/callback')).toBe('/admin/auth/google/callback');
  });

  it('lo que no es del panel pasa de largo', () => {
    expect(panelHref(base, '/mi-cuenta')).toBe('/mi-cuenta');
    expect(panelHref(base, '/mi-cuenta/nuevo')).toBe('/mi-cuenta/nuevo');
    expect(panelHref(base, '/preview/abc')).toBe('/preview/abc');
    expect(panelHref(base, 'https://rincon502.distleogin.com')).toBe('https://rincon502.distleogin.com');
  });

  it('no confunde /administracion con /admin/', () => {
    expect(panelHref(base, '/administracion')).toBe('/administracion');
  });

  it('conserva la query', () => {
    expect(panelHref(base, '/admin/menu?nueva=1')).toBe('/panel/rincon502/menu?nueva=1');
  });
});
