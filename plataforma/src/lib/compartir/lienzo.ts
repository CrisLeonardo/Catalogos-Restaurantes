/* ============================================================
   IMÁGENES PARA COMPARTIR (PLAN_MOMENTOS_PICO P7 y P8)
   ------------------------------------------------------------
   «Comparte tu plato del día» y «Tu año con Leogin» se dibujan
   en el navegador, en un canvas vertical de 1080 × 1920 (el
   formato del estado de WhatsApp y de las historias).

   ¿Por qué en el navegador y no con next/og en el servidor?
   - next/og de este proyecto no decodifica WebP (api/icon/[slug])
     y las fotos de los platillos son WebP; el navegador sí.
   - Aquí ya están cargadas las letras de Leogin (next/font), así
     que la imagen sale con la misma tipografía que el panel.
   - No hace falta una ruta nueva que autorizar: quien ve el botón
     ya está dentro del panel.

   Solo cliente: todas las funciones tocan `document`.
   ============================================================ */

export const ANCHO = 1080;
export const ALTO = 1920;

/** La familia real de una fuente de next/font (las variables viven en <body>). */
export function familia(variable: string, respaldo: string): string {
  const v = getComputedStyle(document.body).getPropertyValue(variable).trim()
    || getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
  return v ? `${v}, ${respaldo}` : respaldo;
}

export interface Fuentes {
  display: string;
  ui: string;
  mono: string;
}

/** Resuelve y espera las tres fuentes: sin esto el canvas dibuja con la del sistema. */
export async function cargarFuentes(): Promise<Fuentes> {
  const f: Fuentes = {
    display: familia('--font-unbounded', '"Arial Black", sans-serif'),
    ui: familia('--font-geist-sans', 'system-ui, sans-serif'),
    mono: familia('--font-jetbrains-mono', 'ui-monospace, monospace'),
  };
  try {
    await Promise.all([
      document.fonts.load(`700 80px ${f.display}`),
      document.fonts.load(`600 40px ${f.ui}`),
      document.fonts.load(`400 40px ${f.ui}`),
      document.fonts.load(`600 50px ${f.mono}`),
    ]);
  } catch { /* se dibuja con lo que haya */ }
  return f;
}

/** Una imagen lista para el canvas, o null si no se pudo (sin CORS, rota). */
export function cargarImagen(src: string | null | undefined): Promise<HTMLImageElement | null> {
  if (!src) return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    // Sin esto, una foto de otro origen «mancha» el canvas y no se puede exportar.
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

export function rectRedondo(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Dibuja la imagen cubriendo el recuadro (como object-fit: cover), con esquinas redondas. */
export function imagenCubriendo(
  ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number, r: number,
): void {
  const escala = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const sw = w / escala;
  const sh = h / escala;
  const sx = (img.naturalWidth - sw) / 2;
  const sy = (img.naturalHeight - sh) / 2;
  ctx.save();
  rectRedondo(ctx, x, y, w, h, r);
  ctx.clip();
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
  ctx.restore();
}

/** Parte un texto en renglones que caben en `ancho`; el último lleva «…» si sobra. */
export function renglones(ctx: CanvasRenderingContext2D, texto: string, ancho: number, max: number): string[] {
  const palabras = texto.trim().split(/\s+/);
  const out: string[] = [];
  let linea = '';
  for (const p of palabras) {
    const prueba = linea ? `${linea} ${p}` : p;
    if (ctx.measureText(prueba).width <= ancho || !linea) {
      linea = prueba;
    } else {
      out.push(linea);
      linea = p;
    }
  }
  if (linea) out.push(linea);
  if (out.length <= max) return out;
  const cortado = out.slice(0, max);
  let ultimo = cortado[max - 1];
  while (ultimo.length > 1 && ctx.measureText(`${ultimo}…`).width > ancho) ultimo = ultimo.slice(0, -1);
  cortado[max - 1] = `${ultimo.trimEnd()}…`;
  return cortado;
}

/** Espaciado entre letras, donde el navegador lo sabe hacer. */
export function espaciado(ctx: CanvasRenderingContext2D, px: number): void {
  const c = ctx as CanvasRenderingContext2D & { letterSpacing?: string };
  if ('letterSpacing' in c) c.letterSpacing = `${px}px`;
}

/** La «L» chiquita de Leogin y su nombre: la firma de cada imagen. */
export function firmaLeogin(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, f: Fuentes): void {
  const s = 56;
  ctx.save();
  rectRedondo(ctx, x, y, s, s, 14);
  ctx.fillStyle = '#1C1C1E';
  ctx.fill();
  const g = ctx.createLinearGradient(x, y, x + s, y + s);
  g.addColorStop(0, '#E8534A');
  g.addColorStop(1, '#F5A030');
  ctx.fillStyle = g;
  // El trazo del logo, en su cuadro de 100: M27 19h18v44h27v18H27Z.
  const k = s / 100;
  ctx.beginPath();
  ctx.moveTo(x + 27 * k, y + 19 * k);
  ctx.lineTo(x + 45 * k, y + 19 * k);
  ctx.lineTo(x + 45 * k, y + 63 * k);
  ctx.lineTo(x + 72 * k, y + 63 * k);
  ctx.lineTo(x + 72 * k, y + 81 * k);
  ctx.lineTo(x + 27 * k, y + 81 * k);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = color;
  ctx.font = `600 30px ${f.ui}`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText('Hecho con Leogin', x + s + 18, y + s / 2 + 1);
  ctx.restore();
}

export function lienzo(): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = ANCHO;
  canvas.height = ALTO;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Este navegador no puede dibujar la imagen.');
  return { canvas, ctx };
}

export function aBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('No se pudo crear la imagen.'))), 'image/png');
  });
}

/** ¿Este aparato puede mandar la imagen por la hoja de compartir (WhatsApp, Instagram)? */
export function puedeCompartirArchivo(archivo: File): boolean {
  try {
    return typeof navigator !== 'undefined' && !!navigator.canShare && navigator.canShare({ files: [archivo] });
  } catch {
    return false;
  }
}

/** Descarga el archivo (computadora, o un teléfono sin hoja de compartir). */
export function descargar(blob: Blob, nombre: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
