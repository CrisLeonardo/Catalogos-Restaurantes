import { describe, expect, it } from 'vitest';
import { authPathFor } from './tenant';

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
