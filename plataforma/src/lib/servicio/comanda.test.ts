import { describe, it, expect } from 'vitest';
import { comandaDeMesa, resumirComanda, leerComanda, coincide, importeLinea } from './comanda';
import type { OrderWithItems } from '@/lib/db/orders';
import type { CartLine } from '@/components/admin/waiter/cart';
import type { OrderItem, OrderStatus } from '@/types';

let seq = 0;
function item(over: Partial<OrderItem> = {}): OrderItem {
  seq += 1;
  return {
    id: `i${seq}`,
    order_id: 'o1',
    product_id: 'p1',
    name_snapshot: 'Pepián de pollo',
    price_snapshot: 65,
    cost_snapshot: null,
    quantity: 2,
    subtotal: 130,
    options_snapshot: null,
    note: null,
    seat_no: null,
    ...over,
  };
}

function pedido(status: OrderStatus, items: OrderItem[]): OrderWithItems {
  return {
    id: 'o1', status, items, voids: [],
  } as unknown as OrderWithItems;
}

function linea(over: Partial<CartLine> = {}): CartLine {
  return {
    lineId: 'c1', productId: 'p9', name: 'Limonada', price: 18, quantity: 1, options: [],
    ...over,
  };
}

describe('comandaDeMesa — los tres montones', () => {
  it('el carrito local es «nuevo» y lo enviado es «cocina»', () => {
    const lineas = comandaDeMesa([pedido('PREP', [item()])], [linea()]);
    expect(lineas.map((l) => l.fase)).toEqual(['nuevo', 'cocina']);
  });

  it('`served_at` manda sobre el estado del pedido (migración 133)', () => {
    const lineas = comandaDeMesa([pedido('PREP', [
      item({ id: 'a', served_at: '2026-09-17T18:00:00Z' }),
      item({ id: 'b' }),
    ])], []);
    expect(lineas.find((l) => l.id === 'a')!.fase).toBe('servido');
    expect(lineas.find((l) => l.id === 'b')!.fase).toBe('cocina');
  });

  it('sin `served_at`, un pedido SERVED se lee como servido (lo de antes de la 133)', () => {
    const lineas = comandaDeMesa([pedido('SERVED', [item()])], []);
    expect(lineas[0].fase).toBe('servido');
  });

  it('lo anulado entero desaparece; lo anulado a medias se queda con lo que queda', () => {
    const o = pedido('PREP', [item({ id: 'a', quantity: 3 }), item({ id: 'b', quantity: 2 })]);
    o.voids = [
      { item_id: 'a', quantity: 1 },
      { item_id: 'b', quantity: 2 },
    ] as unknown as OrderWithItems['voids'];
    const lineas = comandaDeMesa([o], []);
    expect(lineas.map((l) => l.id)).toEqual(['a']);
    expect(lineas[0].cantidad).toBe(2);
  });

  it('un pedido cancelado no está en la mesa', () => {
    expect(comandaDeMesa([pedido('CANCEL', [item()])], [])).toEqual([]);
  });

  it('las opciones y la nota se leen juntas debajo del nombre', () => {
    const lineas = comandaDeMesa([pedido('PREP', [item({
      options_snapshot: [{ group: 'Término', choice: 'Término medio', priceDelta: 0 }],
      note: 'la salsa aparte',
    })])], []);
    expect(lineas[0].detalle).toBe('Término medio · la salsa aparte');
  });
});

describe('resumirComanda', () => {
  const lineas = comandaDeMesa(
    [pedido('PREP', [
      item({ id: 'a', quantity: 2, price_snapshot: 65 }),
      item({ id: 'b', quantity: 1, price_snapshot: 30, served_at: '2026-09-17T18:00:00Z' }),
    ])],
    [linea({ quantity: 3, price: 18 })],
    new Set(['b']),
  );
  const r = resumirComanda(lineas);

  it('cuenta UNIDADES, no renglones', () => {
    expect(r.nNuevas).toBe(3);
    expect(r.nCocina).toBe(2);
    expect(r.nServidas).toBe(1);
    expect(r.platos).toBe(6);
  });

  it('separa lo apuntado de lo que ya salió a cocina', () => {
    expect(r.totalNuevo).toBe(54);
    expect(r.totalEnviado).toBe(160);
    expect(r.total).toBe(214);
  });

  it('lo cobrado por partes deja de contar en lo que falta por cobrar', () => {
    expect(r.totalPagado).toBe(30);
    expect(r.porCobrar).toBe(130);
  });

  it('una línea cobrada NO desaparece: se queda marcada', () => {
    /* El prototipo decía «cobrar una parte quita esas líneas». Quitarlas de
       verdad sería anular una venta y el arqueo dejaría de cuadrar. */
    expect(lineas.find((l) => l.id === 'b')!.pagada).toBe(true);
    expect(r.servidas).toHaveLength(1);
  });
});

describe('las opciones suman al precio de la línea', () => {
  it('el importe incluye los extras', () => {
    const lineas = comandaDeMesa([], [linea({
      quantity: 2,
      price: 65,
      options: [
        { groupId: 'g', groupName: 'Agregar', choiceId: 'c', choiceName: 'Extra aguacate', priceDelta: 12 },
      ],
    })]);
    expect(lineas[0].unidad).toBe(77);
    expect(importeLinea(lineas[0])).toBe(154);
  });
});

describe('leerComanda — «2 pepián» y Enter', () => {
  it('un número al principio es la cantidad', () => {
    expect(leerComanda('2 pepián')).toEqual({ qty: 2, term: 'pepián' });
    expect(leerComanda('3x limonada')).toEqual({ qty: 3, term: 'limonada' });
  });

  it('y también al final', () => {
    expect(leerComanda('limonada x2')).toEqual({ qty: 2, term: 'limonada' });
  });

  it('un número SOLO no es cantidad: es alguien empezando a escribir', () => {
    expect(leerComanda('7')).toEqual({ qty: 1, term: '7' });
  });

  it('se recorta a 99: nadie pide 300 pepianes de un teclazo', () => {
    expect(leerComanda('99 pepián').qty).toBe(99);
  });

  it('vacío no rompe nada', () => {
    expect(leerComanda('   ')).toEqual({ qty: 1, term: '' });
  });
});

describe('coincide — sin tildes y por palabras', () => {
  it('«pepian» encuentra «Pepián»', () => {
    expect(coincide('Pepián de pollo', 'pepian')).toBe(true);
  });

  it('todas las palabras tienen que estar', () => {
    expect(coincide('Pepián de pollo', 'pollo pepian')).toBe(true);
    expect(coincide('Pepián de pollo', 'pepian res')).toBe(false);
  });

  it('sin nada que buscar no coincide con todo', () => {
    expect(coincide('Pepián', '   ')).toBe(false);
  });
});

describe('comandaDeMesa — envío sin espera (EnvioEnVuelo)', () => {
  it('lo que va camino de la nube sale en «Falta servir», marcado y al final', () => {
    const enviado = pedido('PREP', [item({ id: 'i-real', name_snapshot: 'Pepián de pollo', quantity: 1 })]);
    const vuelo = [{ clientId: 'cli-1', lineas: [linea({ lineId: 'c7', name: 'Limonada', quantity: 2 })] }];
    const lineas = comandaDeMesa([enviado], [], new Set(), vuelo);
    const r = resumirComanda(lineas);
    expect(r.cocina.map((l) => l.nombre)).toEqual(['Pepián de pollo', 'Limonada']);
    const enVuelo = r.cocina[1];
    expect(enVuelo.enviando).toBe(true);
    expect(enVuelo.orderId).toBeUndefined();
    expect(r.nCocina).toBe(3);
    expect(r.nNuevas).toBe(0);
  });

  it('en cuanto la mesa trae el pedido con ese client_id, lo del vuelo no se repite', () => {
    const confirmado = {
      ...pedido('PREP', [item({ id: 'i-lim', name_snapshot: 'Limonada', quantity: 2 })]),
      client_id: 'cli-1',
    } as unknown as OrderWithItems;
    const vuelo = [{ clientId: 'cli-1', lineas: [linea({ lineId: 'c7', name: 'Limonada', quantity: 2 })] }];
    const r = resumirComanda(comandaDeMesa([confirmado], [], new Set(), vuelo));
    expect(r.cocina).toHaveLength(1);
    expect(r.cocina[0].enviando).toBeUndefined();
    expect(r.cocina[0].orderId).toBe('o1');
  });
});
