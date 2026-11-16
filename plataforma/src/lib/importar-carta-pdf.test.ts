import { describe, expect, it } from 'vitest';
import { renglones, textoDePdf } from '@/lib/importar-carta-pdf';
import { leerLista } from '@/lib/importar-carta';

describe('renglones', () => {
  it('junta los trozos de la misma altura y ordena de arriba abajo', () => {
    expect(renglones([
      { x: 200, y: 700, ancho: 30, texto: 'Q45' },
      { x: 50, y: 701, ancho: 100, texto: 'Pepián de pollo' },
      { x: 50, y: 740, ancho: 80, texto: 'ALMUERZOS' },
    ])).toEqual(['ALMUERZOS', 'Pepián de pollo Q45']);
  });
  it('parte dos columnas cuando un precio va seguido de otro platillo', () => {
    expect(renglones([
      { x: 50, y: 700, ancho: 90, texto: 'Huevos Q35' },
      { x: 320, y: 700, ancho: 60, texto: 'Atol Q12' },
    ])).toEqual(['Huevos Q35', 'Atol Q12']);
  });
  it('no parte el nombre de su precio aunque haya un hueco grande', () => {
    expect(renglones([
      { x: 50, y: 700, ancho: 90, texto: 'Hilachas' },
      { x: 400, y: 700, ancho: 30, texto: 'Q48.50' },
    ])).toEqual(['Hilachas Q48.50']);
  });
});

describe('textoDePdf', () => {
  it('lee una carta hecha en PDF y la entiende el lector de la lista', async () => {
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF();
    doc.text('DESAYUNOS', 20, 20);
    doc.text('Huevos rancheros', 20, 30); doc.text('Q35.00', 150, 30);
    doc.text('Desayuno chapin', 20, 40); doc.text('Q42.00', 150, 40);
    const texto = await textoDePdf(new Uint8Array(doc.output('arraybuffer')));
    expect(leerLista(texto).map((f) => [f.categoria, f.nombre, f.precio])).toEqual([
      ['Desayunos', 'Huevos rancheros', 35],
      ['Desayunos', 'Desayuno chapin', 42],
    ]);
  }, 30_000);
  it('un PDF sin texto devuelve vacío', async () => {
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF();
    doc.rect(10, 10, 50, 50);
    expect(await textoDePdf(new Uint8Array(doc.output('arraybuffer')))).toBe('');
  }, 30_000);
});
