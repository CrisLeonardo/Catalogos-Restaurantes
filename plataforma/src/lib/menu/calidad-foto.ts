/* ============================================================
   FOTO GUIADA (auditoría «La carta que vende», CV-36)
   ------------------------------------------------------------
   La foto es lo que más vende una carta y lo que peor hacen los
   restaurantes pequeños. Al subir la de un platillo se mide, en el
   navegador y sobre una copia pequeña:
   · luz: el brillo medio (luminancia 0–255);
   · nitidez: la varianza del laplaciano (borde contra vecinos); una
     foto movida o desenfocada tiene bordes blandos y varianza baja.
   Solo AVISA; nunca impide subirla. Los umbrales están medidos con
   las fotos de la demo (nítidas, bien iluminadas) y con versiones
   oscurecidas y desenfocadas de las mismas.
   ============================================================ */

export interface CalidadFoto { brillo: number; nitidez: number }
export type AvisoFoto = 'oscura' | 'quemada' | 'borrosa';

export const UMBRAL_OSCURA = 60;
export const UMBRAL_QUEMADA = 215;
export const UMBRAL_BORROSA = 60;

/** `rgba`: píxeles RGBA (como ImageData.data) de una imagen de `ancho` × `alto`. */
export function medirFoto(rgba: Uint8ClampedArray | number[], ancho: number, alto: number): CalidadFoto {
  const n = ancho * alto;
  const lum = new Float32Array(n);
  let suma = 0;
  for (let i = 0; i < n; i++) {
    const y = 0.2126 * rgba[i * 4] + 0.7152 * rgba[i * 4 + 1] + 0.0722 * rgba[i * 4 + 2];
    lum[i] = y;
    suma += y;
  }
  let cuenta = 0, media = 0, m2 = 0;
  for (let y = 1; y < alto - 1; y++) {
    for (let x = 1; x < ancho - 1; x++) {
      const i = y * ancho + x;
      const lap = 4 * lum[i] - lum[i - 1] - lum[i + 1] - lum[i - ancho] - lum[i + ancho];
      cuenta++;
      const d = lap - media;
      media += d / cuenta;
      m2 += d * (lap - media);
    }
  }
  return { brillo: n ? suma / n : 0, nitidez: cuenta > 1 ? m2 / (cuenta - 1) : 0 };
}

export function avisosDeFoto(c: CalidadFoto): AvisoFoto[] {
  const a: AvisoFoto[] = [];
  if (c.brillo < UMBRAL_OSCURA) a.push('oscura');
  else if (c.brillo > UMBRAL_QUEMADA) a.push('quemada');
  if (c.nitidez < UMBRAL_BORROSA) a.push('borrosa');
  return a;
}

export const TEXTO_AVISO: Record<AvisoFoto, string> = {
  oscura: 'Se ve oscura. Tómala junto a una ventana, con luz de día.',
  quemada: 'Tiene demasiada luz. Aléjala del sol directo o del flash.',
  borrosa: 'Se ve movida o borrosa. Apoya los codos y toca la pantalla para enfocar.',
};

/** Mide un archivo de imagen en el navegador (copia de 160 px de ancho). */
export async function medirArchivo(file: Blob): Promise<CalidadFoto | null> {
  try {
    const bmp = await createImageBitmap(file);
    const ancho = 160;
    const alto = Math.max(1, Math.round((bmp.height / bmp.width) * ancho));
    const canvas = document.createElement('canvas');
    canvas.width = ancho; canvas.height = alto;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(bmp, 0, 0, ancho, alto);
    bmp.close?.();
    return medirFoto(ctx.getImageData(0, 0, ancho, alto).data, ancho, alto);
  } catch {
    return null;
  }
}
