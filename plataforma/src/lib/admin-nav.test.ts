import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildNav, barraMovil, destinoActivo, seccionDeRuta, type BarraMovil, type NavContext } from './admin-nav';
import { permisosDePuesto } from './permisos-trabajo';
import { can } from './permissions';

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

describe('seccionDeRuta (SEC-06)', () => {
  it('cada pantalla del menú exige su llave', () => {
    expect(seccionDeRuta('/admin/finanzas')).toBe('finanzas');
    // Desde la 1.7 Caja tiene llave propia: operar el cajón no enseña utilidades.
    expect(seccionDeRuta('/admin/caja')).toBe('caja');
    expect(seccionDeRuta('/admin/menu')).toBe('catalogo');
    expect(seccionDeRuta('/admin/categorias')).toBe('categorias');
    expect(seccionDeRuta('/admin/ajustes/salon')).toBe('mesas');
    expect(seccionDeRuta('/admin/ajustes/restaurante')).toBe('ajustes');
    expect(seccionDeRuta('/admin/personalizacion')).toBe('personalizar');
  });

  it('las subpantallas heredan la de su pantalla', () => {
    expect(seccionDeRuta('/admin/menu/productos/new')).toBe('catalogo');
    expect(seccionDeRuta('/admin/clientes/123')).toBe('clientes');
  });

  it('Hoy, la portada de Ajustes y lo que no está en el menú no exigen nada', () => {
    expect(seccionDeRuta('/admin')).toBeNull();
    expect(seccionDeRuta('/admin/ajustes')).toBeNull();
    expect(seccionDeRuta('/admin/sin-internet')).toBeNull();
  });

  it('un prefijo parecido no cuenta (/admin/menuX no es /admin/menu)', () => {
    expect(seccionDeRuta('/admin/menuX')).toBeNull();
  });

  it('coincide con lo que el menú esconde: un mesero no tiene Finanzas', () => {
    const nav = buildNav({ ...todoApagadoMenosPedidos(), role: 'RESTAURANT_STAFF', permissions: ['pedidos'] });
    const visibles = nav.flatMap((g) => g.items.map((i) => i.href));
    expect(visibles).not.toContain('/admin/finanzas');
    expect(can('RESTAURANT_STAFF', ['pedidos'], seccionDeRuta('/admin/finanzas')!)).toBe(false);
    expect(can('RESTAURANT_STAFF', ['pedidos'], seccionDeRuta('/admin/pedidos')!)).toBe(true);
  });
});

/* ── La barra del teléfono con roles estrechos (auditoría 2026-10-14) ──
   El mesero puro veía «Hoy» (que el layout rebotaba a Tomar pedidos) y
   «Pedidos» (que ya era Tomar pedidos), sin botón central —se colgaba tras
   «Menú», que él no tiene— y sin ningún destino marcado. */
describe('barraMovil (ficha 2.11): la barra del teléfono por rol', () => {
  const MESERO: NavContext = { ...CTX_DUEÑO, role: 'RESTAURANT_STAFF', permissions: ['mesero'], showStaff: false };
  const puesto = (p: Parameters<typeof permisosDePuesto>[0]): NavContext =>
    ({ ...CTX_DUEÑO, role: 'RESTAURANT_STAFF', permissions: permisosDePuesto(p), showStaff: false });
  const nombres = (b: BarraMovil) => b.principales.map((d) => d.label);

  it('el mesero puro no ve «Hoy»: el panel lo devolvería a Tomar pedidos', () => {
    expect(buildNav(MESERO).map((g) => g.key)).toEqual(['pedidos']);
    expect(buildNav({ ...MESERO, role: 'RESTAURANT_WAITER', permissions: null }).map((g) => g.key)).toEqual(['pedidos']);
  });

  it('el mesero puro tiene un solo sitio: no hay barra que pintar', () => {
    expect(barraMovil(buildNav(MESERO)).sinBarra).toBe(true);
    expect(barraMovil(buildNav(puesto('mesero'))).sinBarra).toBe(true);
  });

  it('dueño: Hoy · Pedidos · [botón] · Menú · Más, con Clientes, Negocio y Ajustes dentro', () => {
    const b = barraMovil(buildNav(CTX_DUEÑO));
    expect(b.modo).toBe('secciones');
    expect(nombres(b)).toEqual(['Hoy', 'Pedidos', 'Menú']);
    expect(b.conBoton).toBe(true);
    expect(b.botonEn).toBe(2);
    expect(b.mas.map((d) => d.label)).toEqual(['Clientes', 'Negocio', 'Ajustes']);
    // Cinco casillas: tres destinos, el botón y «Más».
    expect(b.principales.length + 1 + 1).toBe(5);
  });

  it('dueño sin Tomar pedidos en el plan: Negocio ocupa esa casilla', () => {
    const b = barraMovil(buildNav({ ...CTX_DUEÑO, planActual: 'ESTANDAR' }));
    expect(b.conBoton).toBe(false);
    expect(b.botonEn).toBe(-1);
    expect(nombres(b)).toEqual(['Hoy', 'Pedidos', 'Menú', 'Negocio']);
    expect(b.mas.map((d) => d.label)).toEqual(['Clientes', 'Ajustes']);
  });

  it('caja: sus pantallas por nombre, con Hoy y Salón en «Más»', () => {
    const b = barraMovil(buildNav(puesto('caja')));
    expect(b.modo).toBe('trabajo');
    expect(nombres(b)).toEqual(['Pedidos', 'Mesas', 'Caja']);
    expect(b.botonEn).toBe(2);
    expect(b.mas.map((d) => d.label)).toEqual(['Hoy', 'Salón']);
  });

  it('recepción: Mesas, Reservas, Espera y Pedidos a un toque', () => {
    const b = barraMovil(buildNav(puesto('recepcion')));
    expect(b.modo).toBe('trabajo');
    expect(nombres(b)).toEqual(['Mesas', 'Reservas', 'Espera', 'Pedidos']);
    expect(b.conBoton).toBe(false);
    expect(b.mas.map((d) => d.label)).toEqual(['Hoy', 'Salón']);
  });

  it('cocina: cabe todo, sin «Más», y su casilla se llama Cocina', () => {
    const b = barraMovil(buildNav(puesto('cocina')));
    expect(nombres(b)).toEqual(['Hoy', 'Cocina']);
    expect(b.mas).toEqual([]);
    expect(b.sinBarra).toBe(false);
  });

  it('encargado: como el dueño, y una sección de una sola pantalla se llama como ella', () => {
    const b = barraMovil(buildNav(puesto('encargado')));
    expect(b.modo).toBe('secciones');
    expect(nombres(b)).toEqual(['Hoy', 'Pedidos', 'Menú']);
    expect(b.mas.map((d) => d.label)).toEqual(['Clientes', 'Caja', 'Salón']);
  });

  it('ningún destino lleva a una pantalla con candado ni que la persona no pueda abrir', () => {
    for (const p of ['caja', 'recepcion', 'cocina', 'encargado'] as const) {
      const ctx = puesto(p);
      const b = barraMovil(buildNav(ctx));
      for (const d of [...b.principales, ...b.mas]) {
        const llave = seccionDeRuta(d.href);
        if (llave) expect(can(ctx.role, ctx.permissions, llave), `${p} → ${d.href}`).toBe(true);
      }
    }
  });

  it('«Más» se marca estando en una de sus pantallas, y el botón no deja a Pedidos marcado', () => {
    const b = barraMovil(buildNav(CTX_DUEÑO));
    expect(destinoActivo(b, '/admin/cupones')).toBe('clientes');
    expect(b.mas.some((d) => d.key === destinoActivo(b, '/admin/ajustes/salon'))).toBe(true);
    expect(destinoActivo(b, '/admin/pedidos')).toBe('pedidos');
    expect(destinoActivo(b, '/admin/mesero')).toBeNull();
    expect(destinoActivo(b, '/admin')).toBe('hoy');
  });

  it('«Más» dice lo que trae dentro', () => {
    const b = barraMovil(buildNav(CTX_DUEÑO));
    expect(b.mas.find((d) => d.key === 'negocio')?.detalle).toBe('Resumen, analítica, finanzas, caja y más');
    expect(barraMovil(buildNav({ ...CTX_DUEÑO, felActive: false })).mas.find((d) => d.key === 'negocio')?.detalle)
      .toBe('Resumen, analítica, finanzas y caja');
  });

  it('en la vista previa del súper admin no hay botón y se enseñan las secciones', () => {
    const b = barraMovil(buildNav({ ...CTX_DUEÑO, preview: true }), true);
    expect(b.conBoton).toBe(false);
    expect(b.modo).toBe('secciones');
  });
});

function todoApagadoMenosPedidos(): NavContext {
  return {
    ordersEnabled: true, analiticaEnabled: true, inventarioEnabled: true, ingredientesEnabled: true,
    personalEnabled: true, finanzasEnabled: true, felActive: false, proveedoresActive: false,
    loyaltyActive: false, reservacionesActive: false, listaEsperaActive: false, encuestasActive: false,
    cuponesActive: false, dineInEnabled: true, planActual: 'PREMIUM', showStaff: false, preview: false,
  };
}

describe('quien vende solo en línea no ve el salón con candado', () => {
  const hrefs = (ctx: NavContext) => buildNav(ctx).flatMap((g) => g.items.map((it) => `${it.href}${it.locked ? ' 🔒' : ''}`));
  const SALON = ['/admin/mesas', '/admin/mesero', '/admin/ajustes/salon'];

  it('Estándar con recoger y domicilio: sin Mesas, Tomar pedidos ni Salón', () => {
    const vistos = hrefs({ ...CTX_DUEÑO, planActual: 'ESTANDAR', dineInEnabled: false });
    for (const r of SALON) expect(vistos.some((h) => h.startsWith(r)), r).toBe(false);
    expect(vistos).toContain('/admin/pedidos');
  });

  it('Estándar con comer en local: Mesas y Salón abiertos, Tomar pedidos con candado (eso sí se vende)', () => {
    const vistos = hrefs({ ...CTX_DUEÑO, planActual: 'ESTANDAR', dineInEnabled: true });
    expect(vistos).toContain('/admin/mesas');
    expect(vistos).toContain('/admin/ajustes/salon');
    expect(vistos).toContain('/admin/mesero 🔒');
  });

  it('Básico sin pedidos sigue viendo el Salón con candado: puede tener local', () => {
    const vistos = hrefs({ ...CTX_DUEÑO, planActual: 'BASICO', ordersEnabled: false, dineInEnabled: false });
    expect(vistos).toContain('/admin/ajustes/salon 🔒');
  });

  it('en la vista previa del súper admin se enseña todo', () => {
    const vistos = hrefs({ ...CTX_DUEÑO, planActual: 'ESTANDAR', dineInEnabled: false, preview: true });
    for (const r of SALON) expect(vistos.some((h) => h.startsWith(r)), r).toBe(true);
  });
});
