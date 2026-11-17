/* El texto de un PDF de carta (ficha 2.4, sin IA). Con pdf.js (vía unpdf)
   se leen los trozos de texto de cada página y se rearman los renglones
   por su altura: así «Pepián de pollo …. Q45» queda en una línea, como en
   la carta, y lo lee el mismo lector de la lista pegada.

   Solo sirve para PDF con texto (los que salen de Word, Canva o un
   programa de diseño). Un PDF escaneado es una imagen: no trae texto y se
   pide subirlo como foto. */

type Trozo = { x: number; y: number; ancho: number; texto: string };

const PRECIO_AL_FINAL = /(?:Q\s*\.?\s*)?\d{1,6}(?:[.,]\d{1,2})?\s*$/i;

/**
 * Junta trozos con la misma altura en un renglón, de izquierda a derecha.
 * Si en un mismo renglón hay dos columnas («Huevos Q35 … Atol Q12»), se
 * parte donde termina un precio y empieza otro platillo tras un hueco.
 */
export function renglones(trozos: Trozo[]): string[] {
  /* Renglones por cercanía de altura (3 unidades de tolerancia), de arriba
     abajo: en PDF, y crece hacia arriba. Redondear en escalones partía en
     dos un renglón que caía justo en el borde. */
  const filas: { y: number; trozos: Trozo[] }[] = [];
  for (const t of [...trozos].filter((t) => t.texto.trim()).sort((a, b) => b.y - a.y)) {
    const ultima = filas.at(-1);
    if (ultima && Math.abs(ultima.y - t.y) <= 3) ultima.trozos.push(t);
    else filas.push({ y: t.y, trozos: [t] });
  }
  const salida: string[] = [];
  for (const { trozos: deLaFila } of filas) {
    const fila = deLaFila.sort((a, b) => a.x - b.x);
    let actual = '';
    let finAnterior = -Infinity;
    for (const t of fila) {
      const hueco = t.x - finAnterior;
      if (actual && hueco > 40 && PRECIO_AL_FINAL.test(actual.trim()) && /^\s*[A-Za-zÁÉÍÓÚÑáéíóúñ]/.test(t.texto)) {
        salida.push(actual.trim());
        actual = t.texto;
      } else {
        actual += (actual && hueco > 1 && !actual.endsWith(' ') && !t.texto.startsWith(' ') ? ' ' : '') + t.texto;
      }
      finAnterior = t.x + t.ancho;
    }
    if (actual.trim()) salida.push(actual.trim());
  }
  return salida;
}

/** El texto del PDF, página por página, con una línea en blanco entre páginas. */
export async function textoDePdf(datos: Uint8Array): Promise<string> {
  const { getDocumentProxy } = await import('unpdf');
  const pdf = await getDocumentProxy(datos);
  const paginas: string[] = [];
  for (let n = 1; n <= Math.min(pdf.numPages, 20); n++) {
    const pagina = await pdf.getPage(n);
    const contenido = await pagina.getTextContent();
    const trozos: Trozo[] = [];
    for (const it of contenido.items as { str?: string; transform?: number[]; width?: number }[]) {
      if (typeof it.str !== 'string' || !it.transform) continue;
      trozos.push({ x: it.transform[4], y: it.transform[5], ancho: it.width ?? 0, texto: it.str });
    }
    paginas.push(renglones(trozos).join('\n'));
  }
  return paginas.join('\n\n').trim();
}
