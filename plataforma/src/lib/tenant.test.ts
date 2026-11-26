import { afterEach, describe, expect, it } from 'vitest';
import { authPathFor, isPlatformSurface, marketingUrl, subdomainUrl } from './tenant';

describe('isPlatformSurface', () => {
  it('sin slug y fuera de la vista previa es el sitio de Leogin', () => {
    expect(isPlatformSurface(null, '/')).toBe(true);
    expect(isPlatformSurface(null, '/planes')).toBe(true);
    expect(isPlatformSurface(undefined, null)).toBe(true);
  });

  it('con slug es el menú de un restaurante', () => {
    expect(isPlatformSurface('rincon502', '/')).toBe(false);
  });

  it('la vista previa del editor pinta un menú aunque no lleve slug', () => {
    expect(isPlatformSurface(null, '/preview/abc-123')).toBe(false);
    expect(isPlatformSurface(null, '/preview/new')).toBe(false);
    expect(isPlatformSurface(null, '/preview')).toBe(false);
  });

  it('una ruta que solo EMPIEZA parecido no cuenta como vista previa', () => {
    expect(isPlatformSurface(null, '/previews')).toBe(true);
  });
});

describe('authPathFor', () => {
  it('sin slug, deja la ruta tal cual (dominio raíz, como hoy)', () => {
    expect(authPathFor('/admin/login', null)).toBe('/admin/login');
    expect(authPathFor('/admin/logout-operator', undefined)).toBe('/admin/logout-operator');
  });

  it('con slug, la prefija con el panel del restaurante', () => {
    expect(authPathFor('/admin/login', 'rincon502')).toBe('/panel/rincon502/login');
    expect(authPathFor('/admin/logout-operator', 'rincon502')).toBe(
      '/panel/rincon502/logout-operator',
    );
  });
});

describe('URLs públicas con varios dominios raíz', () => {
  const original = process.env.NEXT_PUBLIC_ROOT_DOMAIN;
  afterEach(() => { process.env.NEXT_PUBLIC_ROOT_DOMAIN = original; });

  // Producción declara dos dominios separados por coma; la carta publicaba
  // `og:url` con los dos pegados (auditoría 2026-11-23, WEB-06).
  it('usan solo el primer dominio, sin la coma ni el segundo', () => {
    process.env.NEXT_PUBLIC_ROOT_DOMAIN = 'distleogin.com, leogin.online';
    expect(subdomainUrl('rincon502')).toBe('https://rincon502.distleogin.com');
    expect(marketingUrl('/planes')).toBe('https://distleogin.com/planes');
    expect(marketingUrl()).toBe('https://distleogin.com/');
  });

  it('en local van por http y conservan el puerto', () => {
    process.env.NEXT_PUBLIC_ROOT_DOMAIN = 'localhost:3000';
    expect(marketingUrl('/sitemap.xml')).toBe('http://localhost:3000/sitemap.xml');
  });
});
