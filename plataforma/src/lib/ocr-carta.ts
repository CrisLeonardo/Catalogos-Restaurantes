'use client';

/* Leer la foto de una carta en el navegador, sin IA de pago (ficha 2.4).
   Tesseract (OCR libre) corre en un trabajador del propio teléfono o PC;
   la foto nunca sale del aparato. Los archivos se sirven desde Leogin
   (public/ocr, ver scripts/copiar-ocr.mjs): unos 6 MB la primera vez y
   después quedan en la caché del navegador.

   El resultado es texto que el dueño revisa y corrige antes de la
   revisión por fila: el OCR se equivoca, y aquí nada se publica solo. */

/** Las fotos de teléfono pasan de 4.000 px; con 2.000 se lee igual y más rápido. */
async function achicar(foto: File, lado = 2000): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(foto);
    const escala = Math.min(1, lado / Math.max(bmp.width, bmp.height));
    if (escala === 1) return foto;
    const lienzo = document.createElement('canvas');
    lienzo.width = Math.round(bmp.width * escala);
    lienzo.height = Math.round(bmp.height * escala);
    lienzo.getContext('2d')?.drawImage(bmp, 0, 0, lienzo.width, lienzo.height);
    return await new Promise<Blob>((ok) => lienzo.toBlob((b) => ok(b ?? foto), 'image/jpeg', 0.92));
  } catch {
    return foto;
  }
}

export async function leerFotoDeCarta(foto: File, alAvanzar: (porcentaje: number, que: string) => void): Promise<string> {
  const { createWorker } = await import('tesseract.js');
  alAvanzar(0, 'Preparando el lector…');
  const trabajador = await createWorker('spa', 1, {
    workerPath: '/ocr/worker.min.js',
    corePath: '/ocr/',
    langPath: '/ocr/',
    gzip: true,
    workerBlobURL: false,
    logger: (m: { status: string; progress: number }) => {
      if (m.status === 'recognizing text') alAvanzar(Math.round(m.progress * 100), 'Leyendo tu carta…');
      else if (m.status.includes('loading')) alAvanzar(0, 'Preparando el lector…');
    },
  });
  try {
    const { data } = await trabajador.recognize(await achicar(foto));
    return data.text.replace(/[ \t]+\n/g, '\n').trim();
  } finally {
    await trabajador.terminate();
  }
}
