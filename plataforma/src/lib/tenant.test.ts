import { describe, expect, it } from 'vitest';
import { authPathFor, isPlatformSurface } from './tenant';

describe('isPlatformSurface', () => {
  it('sin slug y fuera de la vista previa es el sitio de Leogin', () => {
    expect(isPlatformSurface(null, '/')).toBe(true);
    expect(isPlatformSurface(null, '/planes')).toBe(true);
    expect(isPlatformSurface(undefined, null)).toBe(true);
  });

  it('con slug es el menú de un restaurante', () => {
    expect(isPlatformSurface('azucar-negra', '/')).toBe(false);
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
    expect(authPathFor('/admin/login', 'azucar-negra')).toBe('/panel/azucar-negra/login');
    expect(authPathFor('/admin/logout-operator', 'azucar-negra')).toBe(
      '/panel/azucar-negra/logout-operator',
    );
  });
});
