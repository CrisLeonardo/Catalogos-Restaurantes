/* «Tu año con Leogin» (estrategia R7): la imagen para compartir. A
   diferencia del plato del día, esta es de Leogin —como un resumen anual
   de música—: fondo carbón, el año en brasa y mango, Leo celebrando y el
   nombre del restaurante. Solo cliente. */

import {
  ALTO, ANCHO, aBlob, cargarFuentes, cargarImagen, espaciado, firmaLeogin, lienzo, renglones,
} from './lienzo';

export interface DatosDelAno {
  ano: number;
  restaurante: string;
  /** Renglones «etiqueta → valor», ya con formato. Se pintan los primeros cuatro. */
  cifras: Array<{ etiqueta: string; valor: string }>;
}

/** Convierte un <svg> de la página en una imagen para el canvas (Leo). */
function svgAImagen(svg: SVGSVGElement | null): Promise<HTMLImageElement | null> {
  if (!svg) return Promise.resolve(null);
  const copia = svg.cloneNode(true) as SVGSVGElement;
  copia.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  copia.setAttribute('width', '400');
  copia.setAttribute('height', '400');
  const datos = new XMLSerializer().serializeToString(copia);
  return cargarImagen(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(datos)}`);
}

export async function dibujarAno(d: DatosDelAno, leo: SVGSVGElement | null): Promise<Blob> {
  const [f, leoImg] = await Promise.all([cargarFuentes(), svgAImagen(leo)]);
  const { canvas, ctx } = lienzo();
  const M = 90;

  const fondo = ctx.createLinearGradient(0, 0, ANCHO, ALTO);
  fondo.addColorStop(0, '#1C1C1E');
  fondo.addColorStop(1, '#2B1A15');
  ctx.fillStyle = fondo;
  ctx.fillRect(0, 0, ANCHO, ALTO);

  // Arriba a la derecha, fuera del año (que llega hasta x ≈ 700).
  if (leoImg) ctx.drawImage(leoImg, ANCHO - M - 230, 70, 230, 230);

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#F5A030';
  ctx.font = `700 34px ${f.ui}`;
  espaciado(ctx, 7);
  ctx.fillText('TU AÑO CON LEOGIN', M, 220);
  espaciado(ctx, 0);

  const brasa = ctx.createLinearGradient(M, 260, M + 600, 420);
  brasa.addColorStop(0, '#E8534A');
  brasa.addColorStop(1, '#F5A030');
  ctx.fillStyle = brasa;
  ctx.font = `700 190px ${f.display}`;
  ctx.fillText(String(d.ano), M - 6, 420);

  ctx.fillStyle = '#FBF6EE';
  ctx.font = `600 50px ${f.ui}`;
  ctx.fillText(renglones(ctx, d.restaurante, ANCHO - M * 2, 1)[0] ?? d.restaurante, M, 520);

  // Las cifras, una debajo de otra, con una línea fina entre ellas.
  let y = 650;
  for (const c of d.cifras.slice(0, 4)) {
    ctx.fillStyle = 'rgba(251, 246, 238, 0.62)';
    ctx.font = `500 36px ${f.ui}`;
    ctx.fillText(c.etiqueta, M, y);
    ctx.fillStyle = '#FBF6EE';
    ctx.font = `700 76px ${f.display}`;
    const lineas = renglones(ctx, c.valor, ANCHO - M * 2, 2);
    for (const l of lineas) {
      y += 92;
      ctx.fillText(l, M, y);
    }
    y += 64;
    ctx.fillStyle = 'rgba(251, 246, 238, 0.12)';
    ctx.fillRect(M, y - 24, ANCHO - M * 2, 2);
    y += 64;
  }

  ctx.globalAlpha = 0.9;
  firmaLeogin(ctx, M, ALTO - 150, '#FBF6EE', f);
  ctx.globalAlpha = 0.6;
  ctx.fillStyle = '#FBF6EE';
  ctx.font = `500 30px ${f.ui}`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillText('distleogin.com', ANCHO - M, ALTO - 122);
  ctx.globalAlpha = 1;

  return aBlob(canvas);
}
