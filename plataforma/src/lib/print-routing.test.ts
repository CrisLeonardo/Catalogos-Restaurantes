import { describe, it, expect } from 'vitest';
import { repartirPorEstacion, etiquetaDeParte, estacionesConPapel, destinoValido } from './print-routing';
import type { MapaDeEstaciones, PrintStation } from '@/lib/db/print-stations';

/* ════════════════════════════════════════════════════════════
   EL REPARTO DE UNA COMANDA ENTRE LAS ESTACIONES (M-07)
   ------------------------------------------------------------
   Lo que decide esto es qué se cocina y dónde. Una línea que se
   pierde aquí es un plato que nadie prepara y que el cliente sí está
   esperando, así que casi todas las pruebas de abajo son un plato
   que podría haberse perdido.
   ════════════════════════════════════════════════════════════ */

const cocina: PrintStation = {
  id: 'est-cocina', name: 'Cocina', target: 'windows:COCINA',
  sortOrder: 0, isDefault: true,
};
const barra: PrintStation = {
  id: 'est-barra', name: 'Barra', target: 'tcp://192.168.1.51:9100',
  sortOrder: 1, isDefault: false,
};
const parrilla: PrintStation = {
  id: 'est-parrilla', name: 'Parrilla', target: 'windows:PARRILLA',
  sortOrder: 2, isDefault: false,
};

/** El mapa que devuelve `getStationMap`, ya con producto→estación resuelto. */
function mapa(
  estaciones: PrintStation[],
  porProducto: Record<string, string> = {},
): MapaDeEstaciones {
  return {
    estaciones,
    porDefecto: estaciones.find((e) => e.isDefault) ?? null,
    porProducto,
  };
}

const linea = (name: string, product_id: string | null = null) => ({ name, product_id });

/** Nombres de las líneas de cada parte, para leer las expectativas de un vistazo. */
const resumen = (partes: { estacion: PrintStation; items: { name: string }[] }[]) =>
  partes.map((p) => [p.estacion.name, p.items.map((i) => i.name)] as const);

// ── El mapa normal ───────────────────────────────────────────

describe('el reparto normal', () => {
  it('manda cada línea a la estación de su producto', () => {
    const partes = repartirPorEstacion(
      [linea('Carne asada', 'p-carne'), linea('Gallo litro', 'p-gallo')],
      mapa([cocina, barra], { 'p-gallo': barra.id }),
    );
    expect(resumen(partes)).toEqual([
      ['Cocina', ['Carne asada']],
      ['Barra', ['Gallo litro']],
    ]);
  });

  it('una anulación por producto NO arrastra a sus hermanos de categoría', () => {
    // El café de la carta de postres sale por la barra; el brownie, que
    // está en la misma categoría, se queda en la cocina. Es la razón de
    // que exista `products.station_id` (migración 130).
    const partes = repartirPorEstacion(
      [linea('Brownie', 'p-brownie'), linea('Café', 'p-cafe')],
      mapa([cocina, barra], { 'p-cafe': barra.id }),
    );
    expect(resumen(partes)).toEqual([
      ['Cocina', ['Brownie']],
      ['Barra', ['Café']],
    ]);
  });

  it('si todo cae en una sola estación sale UN papel, no uno por estación', () => {
    // El caso de casi todos los locales el primer día: hay tres
    // estaciones declaradas y la mesa pidió solo comida.
    const partes = repartirPorEstacion(
      [linea('Carne asada', 'p-carne'), linea('Guacamol', 'p-guac')],
      mapa([cocina, barra, parrilla]),
    );
    expect(partes).toHaveLength(1);
    expect(partes[0].estacion.name).toBe('Cocina');
  });

  it('una mesa que pide solo comida no produce papel de barra', () => {
    const partes = repartirPorEstacion(
      [linea('Carne asada', 'p-carne')],
      mapa([cocina, barra], { 'p-gallo': barra.id }),
    );
    expect(partes.map((p) => p.estacion.name)).not.toContain('Barra');
  });
});

// ── Las líneas que no tienen a qué agarrarse ─────────────────

describe('líneas sin producto contra el que resolver', () => {
  it('el ARTÍCULO LIBRE va a la estación por defecto', () => {
    // Un descorche no tiene producto (fase 3 de la auditoría anterior).
    // Sin esta regla se perdería en silencio: impreso en ningún sitio.
    const partes = repartirPorEstacion(
      [linea('Descorche', null)],
      mapa([cocina, barra]),
    );
    expect(resumen(partes)).toEqual([['Cocina', ['Descorche']]]);
  });

  it('un producto BORRADO del menú va a la estación por defecto', () => {
    // `order_items.product_id` es `on delete set null`: el pedido
    // sobrevive al producto, y su línea tiene que seguir cocinándose.
    const partes = repartirPorEstacion(
      [linea('Plato de ayer', null), linea('Gallo litro', 'p-gallo')],
      mapa([cocina, barra], { 'p-gallo': barra.id }),
    );
    expect(resumen(partes)).toEqual([
      ['Cocina', ['Plato de ayer']],
      ['Barra', ['Gallo litro']],
    ]);
  });

  it('un producto que nadie mapeó va a la estación por defecto', () => {
    const partes = repartirPorEstacion(
      [linea('Producto nuevo', 'p-nuevo')],
      mapa([cocina, barra], { 'p-gallo': barra.id }),
    );
    expect(resumen(partes)).toEqual([['Cocina', ['Producto nuevo']]]);
  });
});

// ── Los casos raros: ninguno puede perder una línea ──────────

describe('nada se pierde cuando el mapa está roto', () => {
  it('una línea que apunta a una estación que YA NO EXISTE se rescata', () => {
    // Pasa de verdad: se borra la Barra mientras hay una comanda a medio
    // enviar, o el mapa se leyó antes del borrado. `on delete set null`
    // limpia el catálogo, pero este mapa ya está en memoria.
    const partes = repartirPorEstacion(
      [linea('Gallo litro', 'p-gallo')],
      mapa([cocina], { 'p-gallo': 'est-que-ya-no-esta' }),
    );
    expect(resumen(partes)).toEqual([['Cocina', ['Gallo litro']]]);
  });

  it('una estación SIN IMPRESORA manda sus líneas a la de por defecto', () => {
    // Declarar «Barra» y no asignarle impresora todavía es lo más normal
    // del mundo mientras se configura. Encolar contra un destino vacío es
    // exactamente cómo se pierde una cerveza.
    const barraSinImpresora = { ...barra, target: null };
    const partes = repartirPorEstacion(
      [linea('Carne asada', 'p-carne'), linea('Gallo litro', 'p-gallo')],
      mapa([cocina, barraSinImpresora], { 'p-gallo': barraSinImpresora.id }),
    );
    expect(resumen(partes)).toEqual([['Cocina', ['Carne asada', 'Gallo litro']]]);
  });

  it('si la de por defecto TAMPOCO tiene impresora, la línea se queda en la suya', () => {
    // Aquí ya no hay a dónde huir: el local no tiene ninguna impresora
    // puesta. Se deja donde le toca y quien encola avisa «sin impresora»,
    // igual que antes de las estaciones. Lo que no se hace es moverla a
    // un sitio que tampoco imprime.
    const cocinaSinImpresora = { ...cocina, target: null };
    const barraSinImpresora = { ...barra, target: null };
    const partes = repartirPorEstacion(
      [linea('Gallo litro', 'p-gallo')],
      mapa([cocinaSinImpresora, barraSinImpresora], { 'p-gallo': barraSinImpresora.id }),
    );
    expect(resumen(partes)).toEqual([['Barra', ['Gallo litro']]]);
  });

  it('sin estación POR DEFECTO cae en la primera, no en el suelo', () => {
    // El índice único de la migración 130 impide DOS por defecto; no
    // impide CERO. Un local en ese estado tiene que seguir cocinando.
    const sinDefecto: MapaDeEstaciones = {
      estaciones: [{ ...cocina, isDefault: false }, barra],
      porDefecto: null,
      porProducto: {},
    };
    const partes = repartirPorEstacion([linea('Carne asada', 'p-carne')], sinDefecto);
    expect(resumen(partes)).toEqual([['Cocina', ['Carne asada']]]);
  });

  it('NINGUNA línea se pierde ni se duplica, por revuelto que esté el mapa', () => {
    const items = [
      linea('Carne asada', 'p-carne'),          // sin mapear   → Cocina
      linea('Gallo litro', 'p-gallo'),          // → Barra
      linea('Descorche', null),                 // libre        → Cocina
      linea('Costilla', 'p-costilla'),          // → Parrilla
      linea('Fantasma', 'p-fantasma'),          // estación ida → Cocina
      linea('Plato de ayer', null),             // borrado      → Cocina
      linea('Michelada', 'p-michelada'),        // → Barra
    ];
    const partes = repartirPorEstacion(items, mapa([cocina, barra, parrilla], {
      'p-gallo': barra.id,
      'p-michelada': barra.id,
      'p-costilla': parrilla.id,
      'p-fantasma': 'est-que-ya-no-esta',
    }));

    const repartidas = partes.flatMap((p) => p.items);
    expect(repartidas).toHaveLength(items.length);
    expect(new Set(repartidas.map((i) => i.name)).size).toBe(items.length);
    for (const item of items) expect(repartidas).toContain(item);
  });
});

// ── El orden, que también es información ─────────────────────

describe('el orden de los papeles y de las líneas', () => {
  it('las partes salen por sort_order, no por el orden en que se pidió', () => {
    const partes = repartirPorEstacion(
      [linea('Costilla', 'p-costilla'), linea('Gallo litro', 'p-gallo'), linea('Guacamol', 'p-guac')],
      mapa([cocina, barra, parrilla], { 'p-gallo': barra.id, 'p-costilla': parrilla.id }),
    );
    expect(partes.map((p) => p.estacion.name)).toEqual(['Cocina', 'Barra', 'Parrilla']);
  });

  it('dentro de cada papel, las líneas van en el orden en que se cantaron', () => {
    const partes = repartirPorEstacion(
      [linea('Gallo litro', 'p-gallo'), linea('Carne asada', 'p-carne'), linea('Michelada', 'p-michelada')],
      mapa([cocina, barra], { 'p-gallo': barra.id, 'p-michelada': barra.id }),
    );
    expect(resumen(partes)).toEqual([
      ['Cocina', ['Carne asada']],
      ['Barra', ['Gallo litro', 'Michelada']],
    ]);
  });
});

// ── Los vacíos: que quien llama sepa volver al camino de antes ──

describe('cuándo devuelve nada', () => {
  it('una comanda sin líneas no produce papeles', () => {
    expect(repartirPorEstacion([], mapa([cocina, barra]))).toEqual([]);
  });

  it('un local sin estaciones no produce papeles (se imprime como antes)', () => {
    const vacio: MapaDeEstaciones = { estaciones: [], porDefecto: null, porProducto: {} };
    expect(repartirPorEstacion([linea('Carne asada', 'p-carne')], vacio)).toEqual([]);
  });
});

// ── La coletilla de la cabecera ──────────────────────────────

describe('etiquetaDeParte', () => {
  it('con un solo papel no dice nada: en 80 mm sería ruido', () => {
    expect(etiquetaDeParte(0, 1)).toBeNull();
  });

  it('con varios numera desde 1, que es como cuenta la gente', () => {
    expect(etiquetaDeParte(0, 3)).toBe('Parte 1 de 3');
    expect(etiquetaDeParte(2, 3)).toBe('Parte 3 de 3');
  });
});

// ── La trampa del despliegue ─────────────────────────────────

describe('estacionesConPapel', () => {
  it('un trabajo SIN estación cuenta como la de por defecto', () => {
    // Es LA regla del despliegue: los papeles impresos antes de la
    // migración 130 no dicen de qué estación fueron. Sin esto, aplicar la
    // migración reimprime la comanda de cada pedido abierto del local.
    const set = estacionesConPapel([{ station_id: null }], 'est-cocina');
    expect(set.has('est-cocina')).toBe(true);
  });

  it('con la cocina ya impresa, la barra sigue pendiente', () => {
    const set = estacionesConPapel([{ station_id: null }], 'est-cocina');
    expect(set.has('est-barra')).toBe(false);
  });

  it('sin estación por defecto, un trabajo sin estación no bloquea a nadie', () => {
    // Preferimos un papel de más que un plato sin cocinar.
    expect(estacionesConPapel([{ station_id: null }], null).size).toBe(0);
  });

  it('junta las estaciones de varios trabajos sin repetirlas', () => {
    const set = estacionesConPapel(
      [{ station_id: 'est-barra' }, { station_id: 'est-barra' }, { station_id: null }],
      'est-cocina',
    );
    expect([...set].sort()).toEqual(['est-barra', 'est-cocina']);
  });
});

// ── Un destino que el agente no entiende ─────────────────────

describe('destinoValido', () => {
  it('acepta los cuatro formatos que abre el agente', () => {
    expect(destinoValido('windows:EPSON TM-T20')).toBe(true);
    expect(destinoValido('win:EPSON')).toBe(true);
    expect(destinoValido('tcp://192.168.1.50:9100')).toBe(true);
    expect(destinoValido('tcp://192.168.1.50')).toBe(true);   // puerto 9100 por defecto
    expect(destinoValido('doc:HP LaserJet')).toBe(true);
    expect(destinoValido('preview:')).toBe(true);
  });

  it('rechaza «tcp:» sin las dos barras', () => {
    // El error real que se coló al sembrar datos de prueba: la columna es
    // texto libre, la base lo tragó, y el agente lo habria rechazado al
    // imprimir. Una estación que nunca imprime y que nadie echa en falta.
    expect(destinoValido('tcp:192.168.1.51:9100')).toBe(false);
  });

  it('rechaza lo que no lleva ningún formato', () => {
    expect(destinoValido('EPSON TM-T20')).toBe(false);
    expect(destinoValido('192.168.1.50')).toBe(false);
    expect(destinoValido('windows:')).toBe(false);
    expect(destinoValido('tcp://')).toBe(false);
    expect(destinoValido('tcp://impresora:puerto')).toBe(false);
  });
});
