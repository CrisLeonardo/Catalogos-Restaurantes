import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import ts from 'typescript';

/* ── El glosario, vigilado (ficha 2.12, D07) ───────────────────────
   docs/guias/GUIA_GLOSARIO.md dice una sola forma de nombrar cada cosa.
   Esta prueba lee los TEXTOS que ve la gente —literales, plantillas y
   texto JSX— y falla si vuelve a aparecer una palabra prohibida. No mira
   nombres del código ni claves de datos (`product`, `'platos'` en una
   comparación, rutas como /admin/menu/productos).

   El superadmin queda fuera: lo usa el equipo de Leogin. */

const RAIZ = join(process.cwd(), 'src');

function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return archivos(p);
    return /\.tsx?$/.test(n) && !/\.test\.tsx?$/.test(n) ? [p] : [];
  });
}

const rel = (p: string) => relative(process.cwd(), p).split(sep).join('/');

const FUERA = (f: string) =>
  f.includes('/super/') || f.startsWith('src/app/super')
  || f.startsWith('src/app/intro') // HTML de la intro animada, generado
  || f.endsWith('command-search.tsx') // sinónimos del buscador: datos
  || f.startsWith('src/lib/ayuda/') // sinónimos de la ayuda: datos
  || f.endsWith('canales-panel.tsx'); // Canales sigue apagado

/** Donde el restaurante lee «platillo» y no «producto». */
const ALCANCE_PRODUCTO = (f: string) =>
  f.startsWith('src/components/admin/') || f.startsWith('src/app/admin/')
  || ['src/lib/actions/backup.ts', 'src/lib/actions/finanzas.ts', 'src/lib/actions/products.ts',
    'src/lib/actions/inventory.ts', 'src/lib/actions/recipes.ts', 'src/lib/actions/orders.ts',
    'src/lib/catalogo/contexto.ts', 'src/lib/plans.ts', 'src/app/planes/page.tsx',
    'src/lib/tutorial/content.ts', 'src/lib/tutorial/tours.ts'].includes(f);

const PROP_DATOS = new Set(['id', 'key', 'href', 'slug', 'icon', 'tour', 'section', 'type', 'kind', 'seg', 'path', 'target', 'name', 'keywords']);

function esDato(node: ts.Node): boolean {
  const p = node.parent;
  if (!p) return false;
  if (ts.isImportDeclaration(p) || ts.isExportDeclaration(p) || ts.isLiteralTypeNode(p)) return true;
  if (ts.isPropertyAssignment(p) && (p.name === node || PROP_DATOS.has(p.name.getText()))) return true;
  if (ts.isArrayLiteralExpression(p) && ts.isPropertyAssignment(p.parent) && PROP_DATOS.has(p.parent.name.getText())) return true;
  if (ts.isBinaryExpression(p) && [ts.SyntaxKind.InKeyword, ts.SyntaxKind.EqualsEqualsEqualsToken,
    ts.SyntaxKind.ExclamationEqualsEqualsToken].includes(p.operatorToken.kind)) return true;
  if (ts.isCaseClause(p) || ts.isElementAccessExpression(p)) return true;
  // formData.get('platos'), ruta.startsWith('…'): nombres de campos y claves.
  if (ts.isCallExpression(p) && ts.isPropertyAccessExpression(p.expression)
    && ['get', 'getAll', 'has', 'set', 'append', 'delete', 'startsWith', 'endsWith', 'includes', 'querySelector', 'eq', 'select', 'from'].includes(p.expression.name.text)) return true;
  if (ts.isJsxAttribute(p) && ['className', 'href', 'id', 'name', 'key', 'value', 'data-tour-step', 'icon', 'htmlFor'].includes(p.name.getText())) return true;
  return false;
}

interface Texto { archivo: string; linea: number; texto: string }

function textos(): Texto[] {
  const salida: Texto[] = [];
  for (const abs of archivos(RAIZ)) {
    const archivo = rel(abs);
    if (FUERA(archivo)) continue;
    const fuente = readFileSync(abs, 'utf8');
    const sf = ts.createSourceFile(archivo, fuente, ts.ScriptTarget.Latest, true,
      archivo.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const visitar = (n: ts.Node) => {
      let texto: string | null = null;
      if ((ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) && !esDato(n)) texto = n.text;
      else if (ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n)) texto = n.text;
      else if (ts.isJsxText(n)) texto = n.text;
      if (texto && !texto.startsWith('/') && !texto.includes('/admin')) {
        salida.push({ archivo, linea: sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1, texto });
      }
      ts.forEachChild(n, visitar);
    };
    visitar(sf);
  }
  return salida;
}

const TODOS = textos();

function prohibido(re: RegExp, alcance: (f: string) => boolean = () => true, permitido: (t: Texto) => boolean = () => false) {
  return TODOS
    .filter((t) => alcance(t.archivo) && re.test(t.texto) && !permitido(t))
    .map((t) => `${t.archivo}:${t.linea} «${t.texto.trim().slice(0, 80)}»`);
}

describe('glosario de Leogin (docs/guias/GUIA_GLOSARIO.md)', () => {
  it('lee textos de verdad (la prueba no está vacía)', () => {
    expect(TODOS.length).toBeGreaterThan(2000);
  });

  it('«platillo», no «plato» (salvo el plato principal y los platos fuertes)', () => {
    expect(prohibido(/\b[Pp]latos?\b(?! (principal|fuertes?)\b)/)).toEqual([]);
  });

  it('«platillo», no «producto», en lo que ve el restaurante', () => {
    expect(prohibido(/\b[Pp]roductos?\b/, ALCANCE_PRODUCTO)).toEqual([]);
  });

  it('«pantalla de cocina», no KDS', () => {
    // Las palabras clave del buscador de Google no se ven en la página.
    expect(prohibido(/\bKDS\b/, () => true, (t) => t.archivo === 'src/app/page.tsx' && t.texto === 'KDS')).toEqual([]);
  });

  it('«función», no «módulo»; «pantalla completa», no «modo kiosco»', () => {
    expect(prohibido(/\b[Mm]ódulos?\b|\b[Mm]odo kiosco\b/)).toEqual([]);
  });

  it('los tres modos se llaman igual: Comer en local, Para llevar y A domicilio', () => {
    // La carta del comensal usa el texto que configura cada restaurante.
    expect(prohibido(/^(En local|En el local|Comer aquí|Domicilio)$/, (f) => f !== 'src/lib/theme/defaults.ts')).toEqual([]);
  });
});
