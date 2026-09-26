import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/* bucketPrefix() lee la URL de Supabase la primera vez y la memoriza: hay
   que fijarla antes de importar el módulo. */
const SUPA = 'https://abcdefghijklmnop.supabase.co';
const BUCKET = `${SUPA}/storage/v1/object/public/restaurant-assets`;
let m: typeof import('./asset-image');
beforeAll(async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = SUPA;
  m = await import('./asset-image');
});

describe('assetPath: qué fuentes pasan por /img', () => {
  it('acepta una foto del bucket en un formato reducible', () => {
    expect(m.assetPath(`${BUCKET}/6f40-uuid/products/1788547833372.webp`)).toBe('6f40-uuid/products/1788547833372.webp');
    expect(m.assetPath(`${BUCKET}/r/logo/1.png`)).toBe('r/logo/1.png');
    expect(m.assetPath(`${BUCKET}/r/products/1.jpeg`)).toBe('r/products/1.jpeg');
  });

  it('ignora la query y el fragmento', () => {
    expect(m.assetPath(`${BUCKET}/r/products/1.webp?v=2#x`)).toBe('r/products/1.webp');
  });

  it('deja fuera GIF y SVG (se romperían al reducirlos)', () => {
    expect(m.assetPath(`${BUCKET}/r/products/anim.gif`)).toBeNull();
    expect(m.assetPath(`${BUCKET}/r/logo/logo.svg`)).toBeNull();
  });

  it('deja fuera extensiones en mayúsculas (el proxy no las excluye)', () => {
    expect(m.assetPath(`${BUCKET}/r/products/IMG.JPG`)).toBeNull();
  });

  it('deja fuera fuentes ajenas', () => {
    expect(m.assetPath('https://lh3.googleusercontent.com/a/foto.png')).toBeNull();
    expect(m.assetPath('https://otro.supabase.co/storage/v1/object/public/restaurant-assets/r/p/1.webp')).toBeNull();
    expect(m.assetPath(`${SUPA}/storage/v1/object/public/otro-bucket/r/p/1.webp`)).toBeNull();
    expect(m.assetPath('data:image/png;base64,AAAA')).toBeNull();
    expect(m.assetPath(null)).toBeNull();
  });

  it('rechaza rutas con segmentos peligrosos o fuera de forma', () => {
    expect(m.assetPath(`${BUCKET}/../secreto/1.webp`)).toBeNull();
    expect(m.assetPath(`${BUCKET}/r/./1.webp`)).toBeNull();
    expect(m.assetPath(`${BUCKET}/r//1.webp`)).toBeNull();
    expect(m.assetPath(`${BUCKET}/1.webp`)).toBeNull();
    expect(m.assetPath(`${BUCKET}/r/p%20x/1.webp`)).toBeNull();
  });
});

describe('assetSrc y anchos', () => {
  it('sube al ancho permitido más cercano', () => {
    expect(m.nearestWidth(40)).toBe(48);
    expect(m.nearestWidth(384)).toBe(384);
    expect(m.nearestWidth(385)).toBe(640);
    expect(m.nearestWidth(5000)).toBe(1920);
  });

  it('arma /img/<ancho>/<ruta> para las nuestras y deja el resto igual', () => {
    expect(m.assetSrc(`${BUCKET}/r/products/1.webp`, 600)).toBe('/img/640/r/products/1.webp');
    expect(m.assetSrc('https://lh3.googleusercontent.com/a/x.png', 96)).toBe('https://lh3.googleusercontent.com/a/x.png');
    expect(m.assetSrc(null, 96)).toBeNull();
  });

  it('el cargador de next/image usa el ancho que le piden', () => {
    expect(m.assetLoader({ src: `${BUCKET}/r/products/1.webp`, width: 1080 })).toBe('/img/1080/r/products/1.webp');
  });
});

/* next.config.ts no puede importar este módulo (`next start` no resuelve
   imports de .ts desde la configuración), así que repite las listas a mano.
   Si divergen, next/image pediría anchos que /img responde con 404. */
describe('next.config.ts repite los mismos anchos', () => {
  const config = readFileSync(join(__dirname, '..', '..', 'next.config.ts'), 'utf8');
  const lista = (clave: string) => {
    const hit = config.match(new RegExp(`${clave}:\\s*\\[([^\\]]*)\\]`));
    return hit ? hit[1].split(',').map((n) => Number(n.trim())).filter(Number.isFinite) : null;
  };

  it('deviceSizes', () => {
    expect(lista('deviceSizes')).toEqual(m.IMG_DEVICE_SIZES);
  });

  it('imageSizes', () => {
    expect(lista('imageSizes')).toEqual(m.IMG_IMAGE_SIZES);
  });
});
