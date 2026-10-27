import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { disenosDeLaPortada, PALETAS_VITRINA } from './landing-disenos';
import { MENU_STRUCTURES, findTemplate, templatesForStructure } from './theme/templates';
import { DEMO_PRODUCTS, DEMO_CATEGORIES, DEMO_THEME } from './demo-menu';

describe('vitrina de diseños de la portada', () => {
  const disenos = disenosDeLaPortada();

  it('enseña las ocho estructuras, en el orden de la galería', () => {
    expect(disenos.map((d) => d.id)).toEqual(MENU_STRUCTURES.map((s) => s.id));
  });

  it('cada estructura trae tres paletas y la primera es la de firma', () => {
    for (const d of disenos) {
      expect(d.estilos).toHaveLength(3);
      expect(d.estilos[0].id).toBe(templatesForStructure(d.id as keyof typeof PALETAS_VITRINA)[0].id);
      expect(new Set(d.estilos.map((e) => e.id)).size).toBe(3);
    }
  });

  it('todo estilo existe como plantilla (es lo que se guarda para el registro)', () => {
    for (const d of disenos) for (const e of d.estilos) expect(findTemplate(e.id), e.id).toBeDefined();
  });

  it('los colores de las muestras son colores de verdad', () => {
    for (const d of disenos) {
      for (const e of d.estilos) {
        for (const c of [e.bg, e.accent, e.text]) expect(c, `${d.id}/${e.id}`).toMatch(/^#|^rgb|^hsl/);
      }
    }
  });
});

describe('Rincón 502, el menú de ejemplo', () => {
  it('cada platillo tiene su ilustración en public/', () => {
    for (const p of DEMO_PRODUCTS) {
      expect(p.image_url, p.name).toMatch(/^\/demo\/rincon502\/[a-z0-9-]+\.webp$/);
      expect(existsSync(join(process.cwd(), 'public', p.image_url!)), p.image_url!).toBe(true);
    }
  });

  it('cada platillo cae en una categoría que existe y toda categoría tiene platillos', () => {
    const ids = new Set(DEMO_CATEGORIES.map((c) => c.id));
    for (const p of DEMO_PRODUCTS) expect(ids.has(p.category_id!), p.name).toBe(true);
    for (const c of DEMO_CATEGORIES) expect(DEMO_PRODUCTS.some((p) => p.category_id === c.id), c.name).toBe(true);
  });

  it('lleva el nombre y los colores de Rincón 502', () => {
    expect(DEMO_THEME.brand_name).toBe('Rincón 502');
    expect(DEMO_THEME.color_primary).toBe('#E4572E');
    expect(DEMO_THEME.config?.scheme).toBe('dark');
  });
});
