import { describe, expect, it } from 'vitest';
import { accesoAlPanel, destinoDePanel, segundoFactorPara } from './panel-destino';

describe('el destino de sucursal sobrevive al acceso sin abrir redirects externos', () => {
  it('conserva local y sección tanto en login como en MFA', () => {
    const path = '/panel/sucursal-b/categorias';
    expect(destinoDePanel(path)).toBe(path);
    expect(accesoAlPanel('sucursal-b', path)).toBe('/panel/sucursal-b/login?next=%2Fpanel%2Fsucursal-b%2Fcategorias');
    expect(segundoFactorPara(path)).toBe('/admin/dos-pasos?next=%2Fpanel%2Fsucursal-b%2Fcategorias');
  });
  it.each([null, '', '//evil.test', '/\\evil.test', 'https://evil.test', '/panel/a/../../super', '/panel/a/%2e%2e', '/panel/a\n', '/super'])('rechaza %s', (value) => {
    expect(destinoDePanel(value)).toBeNull();
    expect(segundoFactorPara(value)).toBe('/admin/dos-pasos');
  });
});
