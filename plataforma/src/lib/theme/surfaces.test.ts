import { describe, expect, it } from 'vitest';

import { DEFAULT_CONFIG, type ThemeConfig } from './defaults';
import { TEMPLATE_VISUAL_KEYS } from './templates';
import {
  IDENTITY_KEYS,
  KEY_SURFACES,
  OPERATIONAL_KEYS,
  OWNER_KEYS,
  allConfigKeys,
  surfaceOf,
} from './surfaces';

type Key = keyof ThemeConfig;

const EVERY_DECLARED: Key[] = Object.values(KEY_SURFACES).flat() as Key[];

describe('reparto de las claves de ThemeConfig', () => {
  it('no deja ninguna clave sin sitio', () => {
    // Es LA prueba de este archivo: si alguien añade una clave a ThemeConfig
    // y no decide quién la edita, esto falla y le obliga a decidirlo.
    const huerfanas = allConfigKeys().filter((k) => surfaceOf(k) === null);
    expect(huerfanas).toEqual([]);
  });

  it('no reparte la misma clave dos veces', () => {
    const vistas = new Set<Key>();
    const repetidas: Key[] = [];
    for (const k of EVERY_DECLARED) {
      if (vistas.has(k)) repetidas.push(k);
      vistas.add(k);
    }
    expect(repetidas).toEqual([]);
  });

  it('no declara claves que ya no existen en ThemeConfig', () => {
    const reales = new Set(allConfigKeys());
    expect(EVERY_DECLARED.filter((k) => !reales.has(k))).toEqual([]);
  });

  it('cubre exactamente las claves de DEFAULT_CONFIG', () => {
    expect(EVERY_DECLARED.length).toBe(Object.keys(DEFAULT_CONFIG).length);
  });
});

describe('lo que una plantilla tiene prohibido tocar', () => {
  // templates.ts lo promete por escrito ("Una plantilla SOLO define claves
  // visuales. Nunca identidad ni operación") y hasta ahora no lo comprobaba
  // nadie: una plantilla podía haber renombrado el restaurante o cambiado
  // su modo de pedido sin que ningún test se enterara.
  const plantilla = new Set<Key>(TEMPLATE_VISUAL_KEYS as readonly Key[]);

  it('nunca toca la identidad del restaurante', () => {
    const invasoras = IDENTITY_KEYS.filter((k) => plantilla.has(k));
    expect(invasoras).toEqual([]);
  });

  it('nunca toca la operación (pedidos, propina, moneda, cocina, mesas)', () => {
    const invasoras = OPERATIONAL_KEYS.filter((k) => plantilla.has(k));
    expect(invasoras).toEqual([]);
  });

  it('todo lo que una plantilla define es algo que alguien edita a mano', () => {
    // Si una plantilla puede ponerlo, tiene que haber una pantalla donde se
    // pueda cambiar después; si no, el dueño se queda con un valor que no
    // sabe de dónde salió y no puede deshacer.
    const editables = new Set<Key>([
      ...OWNER_KEYS,
      ...KEY_SURFACES.expert,
      ...KEY_SURFACES.deprecated,
    ]);
    const sinPantalla = (TEMPLATE_VISUAL_KEYS as readonly Key[]).filter((k) => !editables.has(k));
    expect(sinPantalla).toEqual([]);
  });
});

describe('la operación no se cuela en el editor de personalización', () => {
  it('ninguna clave de operación es del dueño ni del experto', () => {
    const visuales = new Set<Key>([...OWNER_KEYS, ...KEY_SURFACES.expert]);
    expect(OPERATIONAL_KEYS.filter((k) => visuales.has(k))).toEqual([]);
  });

  it('la identidad la edita el dueño, no el súper admin', () => {
    const delDueno = new Set<Key>(OWNER_KEYS);
    expect(IDENTITY_KEYS.filter((k) => !delDueno.has(k))).toEqual([]);
  });
});
