import { describe, expect, it } from 'vitest';
import { leerCsv, leerHoja, leerLista, normalizar, resumenDeImportacion, revisar } from '@/lib/importar-carta';

const LISTA = `DESAYUNOS
Huevos rancheros ........ Q35
Desayuno chapín  42.00
- Pancakes con miel - 30

ALMUERZOS
Pepián de pollo   Q45
Hilachas Q 48,50
Caldo de res
Limonada  15`;

describe('leerLista', () => {
  const filas = leerLista(LISTA);

  it('toma el último número como precio y limpia el relleno', () => {
    expect(filas.map((f) => [f.categoria, f.nombre, f.precio])).toEqual([
      ['Desayunos', 'Huevos rancheros', 35],
      ['Desayunos', 'Desayuno chapín', 42],
      ['Desayunos', 'Pancakes con miel', 30],
      ['Almuerzos', 'Pepián de pollo', 45],
      ['Almuerzos', 'Hilachas', 48.5],
      ['Almuerzos', 'Caldo de res', null],
      ['Almuerzos', 'Limonada', 15],
    ]);
  });
  it('una línea sin precio en medio de platillos es un platillo con duda, no una categoría', () => {
    expect(filas.find((f) => f.nombre === 'Caldo de res')?.duda).toBe('sin-precio');
  });
  it('un título con dos puntos abre categoría aunque no vaya en mayúsculas', () => {
    expect(leerLista('Bebidas:\nCafé 12')[0]).toMatchObject({ categoria: 'Bebidas', nombre: 'Café', precio: 12 });
  });
  it('sin categorías en la lista, la fila queda sin categoría', () => {
    expect(leerLista('Café americano 15\nPan con frijol 12')[0].categoria).toBeNull();
  });
  it('un precio enorme queda en duda y un platillo repetido también', () => {
    const r = leerLista('Coca cola 1500\nCafé 15\ncafe 16');
    expect(r[0].duda).toBe('precio-raro');
    expect(r[2].duda).toBe('repetido');
  });
  it('quita numeración del inicio', () => {
    expect(leerLista('1. Tostadas 10\n2) Tamal 8')[1]).toMatchObject({ nombre: 'Tamal', precio: 8 });
  });
});

describe('leerHoja y leerCsv', () => {
  it('lee la plantilla con sus encabezados, en cualquier orden', () => {
    const r = leerHoja([['Precio', 'Producto', 'Categoría'], ['Q 25', 'Tacos', 'Cena'], ['', '', ''], ['abc', 'Atol', 'Cena']]);
    expect('filas' in r && r.filas.map((f) => [f.nombre, f.precio, f.categoria, f.duda])).toEqual([
      ['Tacos', 25, 'Cena', null],
      ['Atol', null, 'Cena', 'sin-precio'],
    ]);
  });
  it('sin «Producto» y «Precio» explica qué falta', () => {
    expect(leerHoja([['Nombre del plato', 'Costo']])).toHaveProperty('error');
  });
  it('el CSV acepta punto y coma, comillas y coma decimal', () => {
    const celdas = leerCsv('Categoría;Producto;Precio\nCena;"Tamal, de pollo";12,50\n');
    const r = leerHoja(celdas);
    expect('filas' in r && r.filas[0]).toMatchObject({ nombre: 'Tamal, de pollo', precio: 12.5 });
  });
});

describe('revisar', () => {
  const existentes = [{ id: 'p1', name: 'Pepián de Pollo', price: 42 }, { id: 'p2', name: 'Café', price: 15 }];
  it('no duplica: ofrece cambiar el precio o deja igual lo que ya está', () => {
    const r = revisar(leerLista('pepian de pollo 45\nCafé 15\nTamal 8\nAtol'), existentes);
    expect(r.map((f) => [f.nombre, f.accion, f.marcada])).toEqual([
      ['pepian de pollo', 'cambia-precio', true],
      ['Café', 'igual', false],
      ['Tamal', 'nuevo', true],
      ['Atol', 'nuevo', false],
    ]);
    expect(resumenDeImportacion(r).texto).toBe('Agregar 1 platillo y cambiar 1 precio');
  });
  it('normaliza tildes y espacios', () => {
    expect(normalizar('  Pepián   de Pollo ')).toBe('pepian de pollo');
  });
});

describe('celdasDeXlsx', () => {
  it('lee la primera hoja de un Excel con números, texto y fórmulas', async () => {
    const { celdasDeXlsx } = await import('@/lib/importar-carta-xlsx');
    const ExcelJS = (await import('exceljs')).default;
    const libro = new ExcelJS.Workbook();
    const hoja = libro.addWorksheet('Carta');
    hoja.addRow(['Categoría', 'Producto', 'Precio']);
    hoja.addRow(['Cena', 'Tacos al pastor', 25]);
    hoja.addRow(['Cena', 'Gringa', { formula: '20+5', result: 25 }]);
    const datos = await libro.xlsx.writeBuffer();
    const celdas = await celdasDeXlsx(datos as ArrayBuffer);
    const r = leerHoja(celdas!);
    expect('filas' in r && r.filas.map((f) => [f.categoria, f.nombre, f.precio])).toEqual([
      ['Cena', 'Tacos al pastor', 25],
      ['Cena', 'Gringa', 25],
    ]);
  }, 30_000); // cargar exceljs en frío, con toda la suite corriendo, pasa de 5 s
});
