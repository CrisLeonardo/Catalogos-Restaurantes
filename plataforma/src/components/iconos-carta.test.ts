import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ICONOS_CARTA } from './icons-carta';
import { ICON_PATHS } from './icons';
import { CAT_ICON_MAP } from '@/lib/category-icon';

/* La carta baja solo su tabla de íconos (auditoría de lanzamiento
   2026-11-23, LZ-12). Si un archivo de la carta pide un ícono que no está
   en ella, se pintaría vacío; si importa la tabla del panel, el teléfono
   vuelve a bajar los 83. */

const SRC = join(__dirname, '..');
const leer = (ruta: string) => readFileSync(join(SRC, ruta), 'utf8');

function archivos(dir: string): string[] {
  return readdirSync(join(SRC, dir)).flatMap((n) => {
    const ruta = `${dir}/${n}`;
    if (statSync(join(SRC, ruta)).isDirectory()) return archivos(ruta);
    return /\.tsx?$/.test(n) && !/\.test\.tsx?$/.test(n) ? [ruta] : [];
  });
}

/** Todo lo que importa la tabla de la carta, en cualquier parte de src. */
const deLaCarta = archivos('.').filter((r) => leer(r).includes("from '@/components/icons-carta'"));

describe('íconos de la carta', () => {
  it('cada ícono que nombra un archivo de la carta está en su tabla', () => {
    const faltan: string[] = [];
    for (const ruta of deLaCarta) {
      for (const [, nombre] of leer(ruta).matchAll(/['"`]([A-Za-z]+)['"`]/g)) {
        if (ICON_PATHS[nombre] && !ICONOS_CARTA[nombre]) faltan.push(`${ruta}: ${nombre}`);
      }
    }
    expect(faltan).toEqual([]);
  });

  it('la carta no importa la tabla del panel ni las piezas de la portada', () => {
    const carta = [
      ...archivos('components/menu'),
      'components/menu-shell.tsx', 'components/menu-client.tsx', 'components/my-orders.tsx',
      'components/active-order-chip.tsx', 'components/install-banner.tsx', 'components/offline-support.tsx',
      'components/brand-pattern.tsx', 'components/ui/hoja-operativa.tsx',
      // Todo lo que carga app/page.tsx (la ruta de la carta) y el error global.
      'app/page.tsx', 'app/error.tsx', 'components/islas-de-la-raiz.tsx',
    ];
    expect(carta.filter((r) => leer(r).includes("from '@/components/icons'"))).toEqual([]);
    // La portada y el selector de sucursal comparten página con la carta:
    // fijos, su código bajaba en cada carta. Van por islas-de-la-raiz.
    const fijos = /from '@\/components\/(landing-demo|landing-intro|landing-planes|site-menu|leogin-install-banner|branch-selector)'/;
    expect(['app/page.tsx', 'components/landing.tsx', 'components/site-chrome.tsx']
      .filter((r) => leer(r).split('\n').some((l) => fijos.test(l) && !l.startsWith('import type')))).toEqual([]);
  });

  it('se pueden pintar todos los íconos elegibles para categorías y platillos', () => {
    const categorias = CAT_ICON_MAP.map(([icono]) => icono);
    const platillos = [...leer('components/admin/product-form.tsx')
      .split('const PRODUCT_ICONS = [')[1].split('];')[0]
      .matchAll(/id: '(\w+)'/g)].map((m) => m[1]);
    expect(platillos.length).toBeGreaterThan(5);
    expect([...categorias, ...platillos].filter((n) => !ICONOS_CARTA[n])).toEqual([]);
  });

  it('el panel sigue teniendo todos', () => {
    expect(Object.keys(ICON_PATHS)).toHaveLength(83);
    for (const n of Object.keys(ICONOS_CARTA)) expect(ICON_PATHS[n]).toBe(ICONOS_CARTA[n]);
  });
});
