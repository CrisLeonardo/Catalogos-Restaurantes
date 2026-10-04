/**
 * Escala tipográfica del área de personal (auditoría 2026-10-02, T-22).
 *
 * El panel tenía ~40 tamaños de letra distintos (13, 12,5, 12, 13,5, 11,5,
 * 14,5…) y 7 pesos: medio punto de diferencia no se distingue a la vista,
 * solo desordena. Ahora hay una escala y esta prueba impide que vuelvan los
 * tamaños sueltos. Por debajo de 11 px no se mira: son dibujos a escala
 * (miniaturas de plantillas, teléfono de muestra) o la barra inferior,
 * que T-21 dejó así a propósito.
 *
 * Si de verdad hace falta un tamaño nuevo, se añade a la escala aquí (y se
 * piensa dos veces).
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const SCALE = [11, 12, 13, 14, 15, 16, 18, 20, 22, 24, 28, 32, 40];
const WEIGHTS = [400, 500, 600, 700, 800];

const SCOPE = [
  'src/components/admin', 'src/components/super', 'src/app/admin', 'src/app/super',
  'src/app/mi-cuenta', 'src/components/mi-cuenta', 'src/components/ui', 'src/app/login',
  'src/app/invitacion', 'src/app/central', 'src/app/repartidor', 'src/app/kiosko',
];

function walk(dir: string): string[] {
  const abs = path.join(process.cwd(), dir);
  return readdirSync(abs).flatMap((name) => {
    const rel = path.join(dir, name);
    if (statSync(path.join(process.cwd(), rel)).isDirectory()) return walk(rel);
    return /\.tsx?$/.test(name) && !name.endsWith('.test.ts') ? [rel] : [];
  });
}

const FILES = SCOPE.flatMap(walk).map((f) => ({ f, src: readFileSync(path.join(process.cwd(), f), 'utf8') }));
const ADMIN_CSS = readFileSync(path.join(process.cwd(), 'src/app/admin.css'), 'utf8');

/** Números fuera de comillas dentro de la expresión de `fontSize:`. */
function sizesIn(expr: string): number[] {
  return expr
    .split(/'[^']*'|"[^"]*"|`[^`]*`/)
    .flatMap((part) => [...part.matchAll(/(?<![\w.])\d+(?:\.\d+)?(?![\w.])/g)].map((m) => Number(m[0])));
}

const offScale = (n: number) => n >= 11 && !SCALE.includes(n);

describe('escala tipográfica del panel, el Super y Mi cuenta', () => {
  it('fontSize en línea: solo tamaños de la escala', () => {
    const malos = FILES.flatMap(({ f, src }) =>
      [...src.matchAll(/fontSize:\s*([^,}\n]+)/g)]
        .flatMap((m) => sizesIn(m[1]))
        .filter(offScale)
        .map((n) => `${f}: ${n}`),
    );
    expect(malos).toEqual([]);
  });

  it('clases text-[Npx]: solo tamaños de la escala', () => {
    const malos = FILES.flatMap(({ f, src }) =>
      [...src.matchAll(/text-\[(\d+(?:\.\d+)?)px\]/g)].map((m) => Number(m[1])).filter(offScale).map((n) => `${f}: ${n}`),
    );
    expect(malos).toEqual([]);
  });

  it('admin.css: solo tamaños de la escala', () => {
    const malos = [...ADMIN_CSS.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)].map((m) => Number(m[1])).filter(offScale);
    expect(malos).toEqual([]);
  });

  it(`pesos: solo ${WEIGHTS.join(', ')}`, () => {
    const enLinea = FILES.flatMap(({ f, src }) =>
      [...src.matchAll(/fontWeight:\s*'?(\d{3})\b/g)].map((m) => Number(m[1])).filter((w) => !WEIGHTS.includes(w)).map((w) => `${f}: ${w}`),
    );
    const enCss = [...ADMIN_CSS.matchAll(/font-weight:\s*(\d{3})\b/g)].map((m) => Number(m[1])).filter((w) => !WEIGHTS.includes(w));
    expect([...enLinea, ...enCss.map((w) => `admin.css: ${w}`)]).toEqual([]);
  });
});
