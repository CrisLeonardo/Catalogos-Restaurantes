import { describe, expect, it } from 'vitest';
import {
  BUILTIN_TEMPLATES, MENU_STRUCTURES, STYLE_PALETTES,
  findTemplate, templatesForStructure, structureOfConfig, applyTemplateToConfig,
} from './templates';
import { DEFAULT_CONFIG, DEFAULT_TYPOGRAPHY } from './defaults';

describe('galería = estructura × paleta', () => {
  it('cruza las 8 estructuras con las 25 paletas', () => {
    expect(MENU_STRUCTURES).toHaveLength(8);
    expect(STYLE_PALETTES).toHaveLength(25);
    expect(BUILTIN_TEMPLATES).toHaveLength(8 * 25);
    for (const s of MENU_STRUCTURES) {
      expect(templatesForStructure(s.id)).toHaveLength(STYLE_PALETTES.length);
    }
  });

  it('no genera dos plantillas con el mismo id', () => {
    const ids = BUILTIN_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('cada estructura abre con la paleta que la estrenó', () => {
    for (const s of MENU_STRUCTURES) {
      expect(templatesForStructure(s.id)[0].palette).toBe(s.signature);
    }
  });

  it('la paleta pone el color y la estructura el esqueleto', () => {
    const t = findTemplate('revista-rosa-pastel');
    expect(t).toBeDefined();
    // piel de Rosa Pastel…
    expect(t!.config.colorAccent).toBe('#d4548c');
    expect(t!.config.scheme).toBe('light');
    // …sobre el esqueleto de Revista.
    expect(t!.config.cardStyle).toBe('mosaico');
    expect(t!.config.catalogNav).toBe('secciones');
    expect(t!.config.layoutWidth).toBe('revista');
    expect(t!.config.portadaVariant).toBe('fullbleed');
  });

  it('el esqueleto propio de una paleta solo manda en la estructura clásica', () => {
    // Nieve Minimal nació sin portada y en filas…
    expect(findTemplate('nieve-minimal')!.config.portadaVariant).toBe('none');
    expect(findTemplate('nieve-minimal')!.config.cardStyle).toBe('fila');
    // …pero llevada a Kiosco manda el esqueleto de Kiosco.
    const kiosco = findTemplate('kiosco-nieve-minimal')!;
    expect(kiosco.config.portadaVariant).toBe('directo');
    expect(kiosco.config.catalogNav).toBe('portadas');
    expect(kiosco.config.colorAccent).toBe('#2563eb');
  });

  it('la tipografía de la estructura le gana a la de la paleta en el rol que declara', () => {
    // Carta de autor exige el nombre del platillo en serif (sin foto, ese
    // nombre ES la pieza); Rosa Pastel solo toca el kicker, así que convive.
    const t = findTemplate('carta-rosa-pastel')!;
    expect(t.config.typography!.productName.font).toBe('serif');
    expect(t.config.typography!.kicker.tracking).toBe(0.08);
  });

  it('toda plantilla trae los 10 roles tipográficos completos', () => {
    const roles = Object.keys(DEFAULT_TYPOGRAPHY);
    for (const t of BUILTIN_TEMPLATES) {
      expect(Object.keys(t.config.typography ?? {}).sort()).toEqual(roles.sort());
    }
  });
});

/* Los ids viajan en el formulario de registro (`template_id`) y en enlaces que
   la gente ya tiene guardados. Si el cruce de ejes los renombrara, quien se
   registrara con un enlace viejo se quedaría sin plantilla. */
describe('compatibilidad de ids', () => {
  const CLASICAS = [
    'carbon-autor', 'brasa-humo', 'marfil-oro', 'neon-urbano', 'jardin-fresco',
    'medianoche-azul', 'rosa-pastel', 'selva-tropical', 'taqueria-viva', 'nieve-minimal',
    'trattoria', 'zen-carbon', 'cafe-barrio', 'fuego-amarillo', 'oceano', 'lounge-violeta',
  ];

  it.each(CLASICAS)('la plantilla clásica %s conserva su id', (id) => {
    expect(findTemplate(id)?.structure).toBe('clasico');
  });

  it.each(['carta-autor', 'revista', 'kiosco', 'pizarra', 'estantes', 'compacto'])(
    'el arquetipo %s conserva su id',
    (id) => {
      expect(findTemplate(id)).toBeDefined();
    },
  );

  /* El esqueleto exacto con el que se publicaron las plantillas de siempre: si
     algo de esto cambia, restaurantes que ya operan amanecen con otro menú. */
  it.each([
    ['carbon-autor', { portadaVariant: 'spotlight', cardStyle: 'tarjeta', catalogColumns: 2, featuredFavorites: true }],
    ['brasa-humo', { portadaVariant: 'poster', cardStyle: 'fila', featuredFavorites: true }],
    ['marfil-oro', { portadaVariant: 'spotlight', cardStyle: 'fila', featuredFavorites: false }],
    ['neon-urbano', { portadaVariant: 'poster', cardStyle: 'tarjeta', catalogColumns: 3 }],
    ['nieve-minimal', { portadaVariant: 'none', cardStyle: 'fila', showCategoryIcons: false, featuredFavorites: false }],
    ['zen-carbon', { showCategoryIcons: false, featuredFavorites: false }],
    ['cafe-barrio', { portadaVariant: 'stack', featuredFavorites: false }],
    ['taqueria-viva', { portadaVariant: 'poster', catalogColumns: 3 }],
    ['carta-autor', { layoutWidth: 'ancho', catalogNav: 'secciones', cardStyle: 'texto', portadaVariant: 'ticket', showTags: false }],
    ['revista', { layoutWidth: 'revista', catalogNav: 'secciones', cardStyle: 'mosaico', portadaVariant: 'fullbleed' }],
    ['kiosco', { layoutWidth: 'ancho', catalogNav: 'portadas', cardStyle: 'tarjeta', portadaVariant: 'directo' }],
    ['pizarra', { layoutWidth: 'movil', catalogNav: 'acordeon', cardStyle: 'texto', portadaVariant: 'poster' }],
    ['estantes', { layoutWidth: 'ancho', catalogNav: 'secciones', cardStyle: 'carrusel', portadaVariant: 'directo' }],
    ['compacto', { layoutWidth: 'movil', catalogNav: 'acordeon', cardStyle: 'fila', portadaVariant: 'directo' }],
    ['vitrina-cereza', { layoutWidth: 'movil', catalogNav: 'secciones', cardStyle: 'pieza', portadaVariant: 'vitrina', featuredFavorites: false }],
  ])('%s conserva su esqueleto publicado', (id, skeleton) => {
    expect(findTemplate(id)!.config).toMatchObject(skeleton);
  });
});

describe('Vitrina', () => {
  it('abre con Cereza y pone el nombre del producto en letra de cartel', () => {
    const t = templatesForStructure('vitrina')[0];
    expect(t.id).toBe('vitrina-cereza');
    expect(t.config.typography?.productName.font).toBe('poster');
    expect(t.config.typography?.productName.transform).toBe('uppercase');
  });

  it('aplicar la plantilla no toca el lanzamiento ni el aviso de existencias', () => {
    const prev = { ...DEFAULT_CONFIG, launchMode: true, launchEndsAt: '2026-10-18T18:00', showStockLeft: true, stockLeftBelow: 5 };
    const next = applyTemplateToConfig(prev, findTemplate('vitrina-cacao')!);
    expect(next).toMatchObject({ launchMode: true, launchEndsAt: '2026-10-18T18:00', showStockLeft: true, stockLeftBelow: 5 });
    expect(next.cardStyle).toBe('pieza');
  });
});

describe('structureOfConfig', () => {
  it('reconoce la estructura de cada plantilla insignia', () => {
    for (const s of MENU_STRUCTURES) {
      const applied = applyTemplateToConfig(DEFAULT_CONFIG, templatesForStructure(s.id)[0]);
      expect(structureOfConfig(applied)).toBe(s.id);
    }
  });

  it('cae en clásico cuando el dueño tiene una mezcla propia', () => {
    expect(structureOfConfig({ catalogNav: 'chips', cardStyle: 'fila', layoutWidth: 'movil' })).toBe('clasico');
  });
});

describe('applyTemplateToConfig', () => {
  it('conserva identidad y operación, y resetea lo visual anterior', () => {
    const prev = {
      ...DEFAULT_CONFIG,
      brandName: 'Azúcar Negra', logoUrl: 'https://x/logo.png', currencySymbol: '$',
      // Personalización visual previa que la plantilla nueva NO define:
      grain: true, watermark: true,
    };
    const next = applyTemplateToConfig(prev, findTemplate('kiosco')!);
    expect(next.brandName).toBe('Azúcar Negra');
    expect(next.logoUrl).toBe('https://x/logo.png');
    expect(next.currencySymbol).toBe('$');
    expect(next.grain).toBe(DEFAULT_CONFIG.grain);
    expect(next.watermark).toBe(DEFAULT_CONFIG.watermark);
    expect(next.catalogNav).toBe('portadas');
  });
});
