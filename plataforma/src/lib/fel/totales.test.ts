import { describe, expect, it } from 'vitest';
import {
  calcularMontos,
  verificarMontos,
  repartirCentavos,
  desglosarIva,
  type PedidoParaFacturar,
  type OpcionesMontos,
} from './totales';

/* ── Contexto ─────────────────────────────────────────────────────
   Aquí vive el dinero. Un centavo de descuadre lo rechaza el
   certificador; un descuento ignorado lo paga el restaurante en IVA
   todos los meses sin darse cuenta. Estas pruebas cubren las dos cosas. */

const GEN: OpcionesMontos = { ivaIncluido: true, desglosaIva: true, facturarPropina: false };
const PEQ: OpcionesMontos = { ivaIncluido: true, desglosaIva: false, facturarPropina: false };

const suma = (ns: number[]) => Math.round(ns.reduce((a, n) => a + n, 0) * 100) / 100;

describe('repartirCentavos', () => {
  it('reparte exactamente, sin perder ni inventar centavos', () => {
    const partes = repartirCentavos(10, [33.33, 33.33, 33.34]);
    expect(suma(partes)).toBe(10);
  });

  it('aguanta el caso clásico de tercios', () => {
    const partes = repartirCentavos(0.1, [1, 1, 1]);
    expect(suma(partes)).toBe(0.1);
  });

  it('nunca descuadra, con pesos arbitrarios', () => {
    // Búsqueda amplia: el reparto proporcional ingenuo falla en muchos de
    // estos casos, y cada fallo sería un DTE rechazado.
    for (let semilla = 1; semilla <= 400; semilla++) {
      const n = (semilla % 7) + 1;
      const pesos = Array.from({ length: n }, (_, i) => ((semilla * (i + 3)) % 977) / 7 + 0.01);
      const monto = ((semilla * 13) % 5000) / 100;
      const partes = repartirCentavos(monto, pesos);
      expect(suma(partes)).toBeCloseTo(monto, 2);
      expect(partes.every((p) => p >= 0)).toBe(true);
    }
  });

  it('devuelve ceros cuando no hay nada que repartir', () => {
    expect(repartirCentavos(0, [1, 2])).toEqual([0, 0]);
    expect(repartirCentavos(10, [])).toEqual([]);
    expect(repartirCentavos(10, [0, 0])).toEqual([0, 0]);
  });
});

describe('desglosarIva', () => {
  it('con IVA incluido, base + impuesto da el total exacto', () => {
    const { gravable, impuesto } = desglosarIva(112, true);
    expect(gravable).toBe(100);
    expect(impuesto).toBe(12);
  });

  it('cuadra al centavo en importes feos', () => {
    // Q10.00 con IVA incluido es el caso donde calcular el impuesto por
    // separado (base × 0.12) descuadra un centavo.
    for (const total of [10, 33.33, 7.77, 0.05, 1234.56]) {
      const { gravable, impuesto } = desglosarIva(total, true);
      expect(Math.round((gravable + impuesto) * 100)).toBe(Math.round(total * 100));
    }
  });

  it('con IVA por encima, lo agrega', () => {
    const { gravable, impuesto } = desglosarIva(100, false);
    expect(gravable).toBe(100);
    expect(impuesto).toBe(12);
  });

  it('un importe de cero no genera impuesto', () => {
    expect(desglosarIva(0, true)).toEqual({ gravable: 0, impuesto: 0 });
  });
});

describe('calcularMontos — caso simple', () => {
  const pedido: PedidoParaFacturar = {
    lineas: [
      { descripcion: 'Hamburguesa', cantidad: 2, importe: 112 },
      { descripcion: 'Refresco', cantidad: 1, importe: 20 },
    ],
    totalCobrado: 132,
  };

  it('suma el gran total y lo cuadra con lo cobrado', () => {
    const m = calcularMontos(pedido, GEN);
    expect(m.errores).toEqual([]);
    expect(m.granTotal).toBe(132);
    expect(verificarMontos(m, true)).toEqual([]);
  });

  it('desglosa IVA de forma que base + impuesto es el total', () => {
    const m = calcularMontos(pedido, GEN);
    expect(Math.round((m.totalGravable + m.totalImpuesto) * 100)).toBe(Math.round(m.granTotal * 100));
  });

  it('marca los productos como bien y numera las líneas desde 1', () => {
    const m = calcularMontos(pedido, GEN);
    expect(m.lineas.map((l) => l.numeroLinea)).toEqual([1, 2]);
    expect(m.lineas.every((l) => l.bienOServicio === 'B')).toBe(true);
  });
});

describe('calcularMontos — el descuento ya no se ignora', () => {
  const pedido: PedidoParaFacturar = {
    lineas: [
      { descripcion: 'Pizza', cantidad: 1, importe: 100 },
      { descripcion: 'Postre', cantidad: 1, importe: 50 },
    ],
    descuento: 15,
    totalCobrado: 135,
  };

  it('factura lo cobrado, no el precio de lista', () => {
    // Este era el bug: se facturaban Q150 de una venta de Q135, y el
    // restaurante pagaba IVA sobre Q15 que nunca recibió.
    const m = calcularMontos(pedido, GEN);
    expect(m.errores).toEqual([]);
    expect(m.granTotal).toBe(135);
  });

  it('reparte el descuento entre las líneas, sin perder centavos', () => {
    const m = calcularMontos(pedido, GEN);
    expect(suma(m.lineas.map((l) => l.descuento))).toBe(15);
    expect(verificarMontos(m, true)).toEqual([]);
  });

  it('reparte proporcionalmente al importe de cada línea', () => {
    const m = calcularMontos(pedido, GEN);
    expect(m.lineas[0].descuento).toBe(10); // 100/150 de 15
    expect(m.lineas[1].descuento).toBe(5);  // 50/150 de 15
  });

  it('suma el descuento de cupón con el de puntos', () => {
    const m = calcularMontos({ ...pedido, descuento: 10, descuentoLealtad: 5 }, GEN);
    expect(suma(m.lineas.map((l) => l.descuento))).toBe(15);
    expect(m.granTotal).toBe(135);
  });

  it('cuadra aunque el descuento no se divida en partes exactas', () => {
    const m = calcularMontos(
      {
        lineas: [
          { descripcion: 'A', cantidad: 1, importe: 33.33 },
          { descripcion: 'B', cantidad: 1, importe: 33.33 },
          { descripcion: 'C', cantidad: 1, importe: 33.34 },
        ],
        descuento: 10,
        totalCobrado: 90,
      },
      GEN,
    );
    expect(m.errores).toEqual([]);
    expect(suma(m.lineas.map((l) => l.descuento))).toBe(10);
    expect(m.granTotal).toBe(90);
    expect(verificarMontos(m, true)).toEqual([]);
  });

  it('rechaza un descuento mayor que el consumo', () => {
    const m = calcularMontos({ lineas: [{ descripcion: 'A', cantidad: 1, importe: 50 }], descuento: 80 }, GEN);
    expect(m.errores.join(' ')).toContain('mayor que el consumo');
  });
});

describe('calcularMontos — propina', () => {
  const pedido: PedidoParaFacturar = {
    lineas: [{ descripcion: 'Almuerzo', cantidad: 1, importe: 100 }],
    propina: 10,
    totalCobrado: 110,
  };

  it('por defecto la deja FUERA de la base gravable', () => {
    const m = calcularMontos(pedido, GEN);
    expect(m.errores).toEqual([]);
    expect(m.granTotal).toBe(100);
    expect(m.propinaExcluida).toBe(10);
    expect(m.lineas).toHaveLength(1);
  });

  it('la incluye como servicio cuando el restaurante lo configura', () => {
    const m = calcularMontos(pedido, { ...GEN, facturarPropina: true });
    expect(m.errores).toEqual([]);
    expect(m.granTotal).toBe(110);
    expect(m.propinaExcluida).toBe(0);
    expect(m.lineas[1].bienOServicio).toBe('S');
  });
});

describe('calcularMontos — envío', () => {
  it('lo factura como servicio y no le aplica el descuento', () => {
    const m = calcularMontos(
      {
        lineas: [{ descripcion: 'Combo', cantidad: 1, importe: 100 }],
        envio: 25,
        descuento: 10,
        totalCobrado: 115,
      },
      GEN,
    );
    expect(m.errores).toEqual([]);
    expect(m.granTotal).toBe(115);
    const envio = m.lineas.find((l) => l.descripcion === 'Servicio de entrega')!;
    expect(envio.bienOServicio).toBe('S');
    expect(envio.descuento).toBe(0);
    expect(m.lineas[0].descuento).toBe(10);
  });
});

describe('calcularMontos — pequeño contribuyente', () => {
  it('no desglosa IVA y el total es todo gravable', () => {
    const m = calcularMontos({ lineas: [{ descripcion: 'Menú', cantidad: 1, importe: 100 }] }, PEQ);
    expect(m.totalImpuesto).toBe(0);
    expect(m.totalGravable).toBe(100);
    expect(m.lineas.every((l) => l.montoImpuesto === 0)).toBe(true);
    expect(verificarMontos(m, false)).toEqual([]);
  });
});

describe('calcularMontos — redondeo de precios unitarios', () => {
  it('cuadra cuando el importe no se divide exacto entre la cantidad', () => {
    // 3 unidades por Q10.00: el unitario es 3.333333… Redondeado a 2 daría
    // Q9.99 de precio de línea y el DTE se rechazaría.
    const m = calcularMontos(
      { lineas: [{ descripcion: 'Taco', cantidad: 3, importe: 10 }], totalCobrado: 10 },
      GEN,
    );
    expect(m.errores).toEqual([]);
    expect(m.lineas[0].precio).toBe(10);
    expect(verificarMontos(m, true)).toEqual([]);
  });

  it('aguanta cantidades feas en serie', () => {
    for (let q = 1; q <= 12; q++) {
      for (const importe of [10, 33.33, 99.99, 7]) {
        const m = calcularMontos({ lineas: [{ descripcion: 'X', cantidad: q, importe }] }, GEN);
        expect(verificarMontos(m, true)).toEqual([]);
      }
    }
  });
});

describe('calcularMontos — cuadre contra la caja', () => {
  it('se niega a emitir si el DTE no coincide con lo cobrado', () => {
    const m = calcularMontos(
      { lineas: [{ descripcion: 'A', cantidad: 1, importe: 100 }], totalCobrado: 250 },
      GEN,
    );
    expect(m.errores.join(' ')).toContain('no coincide con lo cobrado');
  });

  it('tolera un centavo de redondeo', () => {
    const m = calcularMontos(
      { lineas: [{ descripcion: 'A', cantidad: 1, importe: 100 }], totalCobrado: 100.01 },
      GEN,
    );
    expect(m.errores).toEqual([]);
  });

  it('rechaza un pedido sin nada que facturar', () => {
    expect(calcularMontos({ lineas: [] }, GEN).errores.join(' ')).toContain('nada que facturar');
    expect(
      calcularMontos({ lineas: [{ descripcion: 'A', cantidad: 1, importe: 0 }] }, GEN).errores.join(' '),
    ).toContain('nada que facturar');
  });
});

describe('verificarMontos — el juez independiente', () => {
  it('detecta que Total no es Precio menos Descuento', () => {
    const m = calcularMontos({ lineas: [{ descripcion: 'A', cantidad: 1, importe: 100 }] }, GEN);
    m.lineas[0].total = 90;
    expect(verificarMontos(m, true).join(' ')).toContain('Precio − Descuento');
  });

  it('detecta que GranTotal no suma', () => {
    const m = calcularMontos({ lineas: [{ descripcion: 'A', cantidad: 1, importe: 100 }] }, GEN);
    m.granTotal = 999;
    expect(verificarMontos(m, true).join(' ')).toContain('GranTotal');
  });

  it('detecta impuesto en un documento que no debe llevarlo', () => {
    const m = calcularMontos({ lineas: [{ descripcion: 'A', cantidad: 1, importe: 100 }] }, PEQ);
    m.totalImpuesto = 12;
    expect(verificarMontos(m, false).join(' ')).toContain('no puede llevar impuesto');
  });
});
