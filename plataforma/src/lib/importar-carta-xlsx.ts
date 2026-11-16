import { MAX_FILAS } from '@/lib/importar-carta';

/* Un .xlsx a filas de celdas (ficha 2.4), con exceljs. Aparte de la acción
   para poder probarlo con un libro armado en memoria. Las celdas con
   fórmula dan su resultado y el texto enriquecido se junta. */
export async function celdasDeXlsx(datos: ArrayBuffer): Promise<unknown[][] | null> {
  const ExcelJS = (await import('exceljs')).default;
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(datos);
  const hoja = libro.worksheets[0];
  if (!hoja) return null;
  const celdas: unknown[][] = [];
  hoja.eachRow({ includeEmpty: false }, (fila) => {
    if (celdas.length > MAX_FILAS + 1) return;
    celdas.push((fila.values as unknown[]).slice(1).map((v) => {
      if (v && typeof v === 'object') {
        const o = v as { text?: unknown; result?: unknown; richText?: { text: string }[] };
        if (o.richText) return o.richText.map((r) => r.text).join('');
        return o.result ?? o.text ?? '';
      }
      return v ?? '';
    }));
  });
  return celdas;
}
