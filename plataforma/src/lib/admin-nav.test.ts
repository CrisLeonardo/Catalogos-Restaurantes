import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildNav, type NavContext } from './admin-nav';

/* ── Contexto ─────────────────────────────────────────────────────
   El grupo "Ajustes" del menú tiene `index: true`: NO dibuja fila de
   pestañas, dibuja una portada con listas (`/admin/ajustes`). Eso deja dos
   listas de las mismas pantallas, escritas a mano en dos archivos —
   `lib/admin-nav.ts` y `app/admin/(protected)/ajustes/page.tsx`— y nada que
   las obligara a decir lo mismo.

   Se separaron, y se notó: "Salón" estaba en el menú y NO en la portada, así
   que el plano del local, los QR de mesa y la propina no tenían ninguna
   entrada desde Ajustes. Se llegaba solo por el enlace de Pedidos › Mesas;
   para quien no lo supiera, la pantalla no existía.

   Esta prueba es el amarre. No compara pantallas: compara las rutas que cada
   archivo nombra, que es lo único que tiene que coincidir. */

const CTX_DUEÑO: NavContext = {
  role: 'RESTAURANT_OWNER',
  permissions: null,
  ordersEnabled: true,
  analiticaEnabled: true,
  inventarioEnabled: true,
  ingredientesEnabled: true,
  personalEnabled: true,
  finanzasEnabled: true,
  felActive: true,
  proveedoresActive: true,
  loyaltyActive: true,
  reservacionesActive: true,
  listaEsperaActive: true,
  encuestasActive: true,
  cuponesActive: true,
  dineInEnabled: true,
  deliveryEnabled: true,
  whatsappReady: true,
  planActual: 'PREMIUM',
  showStaff: true,
  preview: false,
};

function portadaDeAjustes(): string {
  return readFileSync(
    join(process.cwd(), 'src/app/admin/(protected)/ajustes/page.tsx'),
    'utf-8',
  );
}

describe('el menú de Ajustes y su portada enseñan las mismas pantallas', () => {
  it('cada pestaña del grupo Ajustes tiene su fila en la portada', () => {
    const grupo = buildNav(CTX_DUEÑO).find((g) => g.key === 'ajustes');
    expect(grupo, 'el grupo Ajustes tiene que existir para un dueño Premium').toBeDefined();

    const fuente = portadaDeAjustes();
    const sinFila = grupo!.items
      .map((it) => it.href)
      .filter((href) => !fuente.includes(`href: '${href}'`));

    expect(
      sinFila,
      'estas pantallas están en el menú y no en la portada de /admin/ajustes: '
        + 'nadie puede llegar a ellas desde Ajustes',
    ).toEqual([]);
  });

  it('la portada no ofrece pantallas que el menú no conozca', () => {
    const grupo = buildNav(CTX_DUEÑO).find((g) => g.key === 'ajustes');
    const conocidas = new Set(grupo!.items.map((it) => it.href));

    const enLaPortada = [...portadaDeAjustes().matchAll(/href: '(\/admin\/[^']+)'/g)]
      .map((m) => m[1]);

    expect(enLaPortada.length, 'la portada tiene que listar algo').toBeGreaterThan(5);
    expect(
      enLaPortada.filter((href) => !conocidas.has(href)),
      'la portada enseña pantallas que el menú no cuenta como suyas',
    ).toEqual([]);
  });
});

describe('el grupo Ajustes siempre lleva a su portada', () => {
  it('no se remapea a su primera pestaña, como sí hacen los demás', () => {
    const grupos = buildNav(CTX_DUEÑO);
    expect(grupos.find((g) => g.key === 'ajustes')!.href).toBe('/admin/ajustes');
    // Contraste: Negocio sí apunta a su primera pestaña.
    expect(grupos.find((g) => g.key === 'negocio')!.href).toBe('/admin/metricas');
  });
});
