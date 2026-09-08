// Comprobación del reparto por estación SIN NUBE (M-07, fase 5).
//
//   npm test
//
// `src/routing.ts` es una copia deliberada de
// plataforma/src/lib/print-routing.ts —son dos entregables separados, sin
// paquete compartido— y ahí está el riesgo: aquella tiene 25 pruebas y
// esta no tenía ninguna. Una divergencia entre las dos se manifestaría
// como «en el local imprime distinto cuando se cae el internet», que es
// el peor momento posible para descubrirla.
//
// Sin runner de pruebas: `node:assert` y el mismo Node que corre el
// agente. Comprueba las MISMAS reglas que las pruebas de la nube, más la
// que solo existe aquí: sin estaciones utilizables, todo por
// `kitchenTarget`.

import assert from 'node:assert/strict';
import { repartirComandaLocal } from '../src/routing.ts';
import type { MenuSnapshot, MenuStation } from '../src/store.ts';

const COCINA: MenuStation = { id: 'e-cocina', name: 'Cocina', target: 'windows:COCINA', sort_order: 0, is_default: true };
const BARRA: MenuStation = { id: 'e-barra', name: 'Barra', target: 'tcp://10.0.0.5:9100', sort_order: 1, is_default: false };

function snap(stations: MenuStation[] | undefined, mapa: Record<string, string> = {}): MenuSnapshot {
  return {
    restaurantName: 'Prueba',
    kitchenTarget: 'windows:SIEMPRE',
    stations,
    categories: [{ id: 'c-comida', name: 'Comida', icon: null, sort_order: 0 }],
    products: Object.entries(mapa).map(([id, station_id]) => ({
      id, category_id: 'c-comida', name: id, price: 1, is_available: true, options: null,
      station_id: station_id || null,
    })),
  };
}

const linea = (productId: string | null) => ({ productId, name: productId ?? 'libre' });
const resumen = (partes: { nombre: string; target: string; items: { name: string }[] }[]) =>
  partes.map((p) => [p.nombre, p.target, p.items.map((i) => i.name)]);

let hechas = 0;
function prueba(nombre: string, fn: () => void) {
  fn();
  hechas += 1;
  console.log(`  ✓ ${nombre}`);
}

console.log('Reparto de la comanda sin conexión (M-07):');

prueba('reparte por la estación del producto', () => {
  const partes = repartirComandaLocal(
    [linea('p-carne'), linea('p-gallo')],
    snap([COCINA, BARRA], { 'p-carne': '', 'p-gallo': BARRA.id }),
    'windows:SIEMPRE',
  );
  assert.deepEqual(resumen(partes), [
    ['Cocina', 'windows:COCINA', ['p-carne']],
    ['Barra', 'tcp://10.0.0.5:9100', ['p-gallo']],
  ]);
});

prueba('hereda la estación de la categoría', () => {
  const s = snap([COCINA, BARRA], { 'p-agua': '' });
  s.categories[0].station_id = BARRA.id;
  const partes = repartirComandaLocal([linea('p-agua')], s, 'windows:SIEMPRE');
  assert.deepEqual(resumen(partes), [['Barra', 'tcp://10.0.0.5:9100', ['p-agua']]]);
});

prueba('una línea SIN producto cae en la principal', () => {
  const partes = repartirComandaLocal([linea(null)], snap([COCINA, BARRA]), 'windows:SIEMPRE');
  assert.deepEqual(resumen(partes), [['Cocina', 'windows:COCINA', ['libre']]]);
});

prueba('un producto que este snapshot no conoce cae en la principal', () => {
  const partes = repartirComandaLocal([linea('p-nuevo')], snap([COCINA, BARRA]), 'windows:SIEMPRE');
  assert.deepEqual(resumen(partes), [['Cocina', 'windows:COCINA', ['p-nuevo']]]);
});

prueba('una estación SIN impresora manda sus líneas a la principal', () => {
  const sinImpresora = { ...BARRA, target: null };
  const partes = repartirComandaLocal(
    [linea('p-gallo')],
    snap([COCINA, sinImpresora], { 'p-gallo': sinImpresora.id }),
    'windows:SIEMPRE',
  );
  assert.deepEqual(resumen(partes), [['Cocina', 'windows:COCINA', ['p-gallo']]]);
});

prueba('SIN estaciones en el snapshot, todo por el destino de siempre', () => {
  // Nube anterior a M-07, o migración 130 sin aplicar. Es el caso que hace
  // que actualizar el agente no pueda romper ningún local.
  const partes = repartirComandaLocal([linea('p-carne'), linea('p-gallo')], snap(undefined), 'windows:SIEMPRE');
  assert.deepEqual(resumen(partes), [['Cocina', 'windows:SIEMPRE', ['p-carne', 'p-gallo']]]);
});

prueba('con estaciones pero NINGUNA con impresora, también por el de siempre', () => {
  const partes = repartirComandaLocal(
    [linea('p-carne')],
    snap([{ ...COCINA, target: null }, { ...BARRA, target: null }]),
    'windows:SIEMPRE',
  );
  assert.deepEqual(resumen(partes), [['Cocina', 'windows:SIEMPRE', ['p-carne']]]);
});

prueba('sin destino de ningún tipo no se inventa uno', () => {
  assert.deepEqual(repartirComandaLocal([linea('p-carne')], snap(undefined), null), []);
});

prueba('una comanda vacía no produce papeles', () => {
  assert.deepEqual(repartirComandaLocal([], snap([COCINA, BARRA]), 'windows:SIEMPRE'), []);
});

prueba('las partes salen por sort_order, no por el orden en que se pidió', () => {
  const partes = repartirComandaLocal(
    [linea('p-gallo'), linea('p-carne')],
    snap([COCINA, BARRA], { 'p-carne': '', 'p-gallo': BARRA.id }),
    'windows:SIEMPRE',
  );
  assert.deepEqual(partes.map((p) => p.nombre), ['Cocina', 'Barra']);
});

prueba('NINGUNA línea se pierde ni se duplica', () => {
  const items = [linea('p-carne'), linea('p-gallo'), linea(null), linea('p-fantasma')];
  const partes = repartirComandaLocal(
    items,
    snap([COCINA, BARRA], { 'p-carne': '', 'p-gallo': BARRA.id }),
    'windows:SIEMPRE',
  );
  const repartidas = partes.flatMap((p) => p.items);
  assert.equal(repartidas.length, items.length);
  for (const item of items) assert.ok(repartidas.includes(item));
});

console.log(`\n${hechas} comprobaciones, todas bien.`);
