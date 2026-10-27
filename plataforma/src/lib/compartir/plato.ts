/* «Comparte tu plato del día» (estrategia R4): una historia vertical con
   la foto del platillo, su nombre y su precio, en los colores del
   restaurante y con su enlace. Abajo, la «L» chiquita de Leogin: cada
   imagen que se comparte también nos presenta. Solo cliente. */

import {
  ALTO, ANCHO, aBlob, cargarFuentes, cargarImagen, espaciado, firmaLeogin, imagenCubriendo, lienzo,
  rectRedondo, renglones,
} from './lienzo';

export interface MarcaRestaurante {
  nombre: string;
  fondo: string;
  texto: string;
  acento: string;
  sobreAcento: string;
  logo: string | null;
  /** El enlace del menú tal como se lee: «rincon502.distleogin.com». */
  menu: string;
}

export interface PlatoParaCompartir {
  nombre: string;
  precio: string | null;
  imagen: string | null;
}

/** Un plato con tenedor y cuchillo, en líneas: el respaldo cuando no hay foto. */
function platoDibujado(ctx: CanvasRenderingContext2D, cx: number, cy: number, color: string): void {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  ctx.lineWidth = 18;
  ctx.beginPath();
  ctx.arc(cx, cy, 190, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.arc(cx, cy, 128, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.lineWidth = 16;
  // Tenedor, a la izquierda.
  const tx = cx - 290;
  ctx.beginPath();
  ctx.moveTo(tx, cy - 150); ctx.lineTo(tx, cy + 170);
  for (const d of [-26, 0, 26]) { ctx.moveTo(tx + d, cy - 150); ctx.lineTo(tx + d, cy - 70); }
  ctx.moveTo(tx - 26, cy - 70); ctx.quadraticCurveTo(tx, cy - 40, tx + 26, cy - 70);
  ctx.stroke();
  // Cuchillo, a la derecha.
  const kx = cx + 290;
  ctx.beginPath();
  ctx.moveTo(kx, cy - 150); ctx.quadraticCurveTo(kx + 40, cy - 60, kx, cy); ctx.lineTo(kx, cy + 170);
  ctx.stroke();
  ctx.restore();
}

export async function dibujarPlato(marca: MarcaRestaurante, plato: PlatoParaCompartir): Promise<Blob> {
  const [f, foto, logo] = await Promise.all([cargarFuentes(), cargarImagen(plato.imagen), cargarImagen(marca.logo)]);
  const { canvas, ctx } = lienzo();
  const M = 90;

  // Fondo: el color del restaurante, sólido. Su segundo tono puede ser
  // claro en un tema oscuro (o al revés) y el texto dejaría de leerse.
  ctx.fillStyle = marca.fondo;
  ctx.fillRect(0, 0, ANCHO, ALTO);

  // Arriba: el logo (si hay) y el nombre del restaurante.
  let x = M;
  if (logo) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(M + 48, 150, 48, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = '#fff';
    ctx.fillRect(M, 102, 96, 96);
    imagenCubriendo(ctx, logo, M, 102, 96, 96, 0);
    ctx.restore();
    x = M + 96 + 24;
  }
  ctx.fillStyle = marca.texto;
  ctx.font = `600 46px ${f.ui}`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText(renglones(ctx, marca.nombre, ANCHO - x - M, 1)[0] ?? marca.nombre, x, 152);

  // La foto, grande y cuadrada. Sin foto, un plato dibujado sobre el acento
  // (una inicial grande se confundía con la «L» de Leogin).
  const fy = 250;
  const fw = ANCHO - M * 2;
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
  ctx.shadowBlur = 60;
  ctx.shadowOffsetY = 24;
  rectRedondo(ctx, M, fy, fw, fw, 56);
  ctx.fillStyle = marca.acento;
  ctx.fill();
  ctx.restore();
  if (foto) {
    imagenCubriendo(ctx, foto, M, fy, fw, fw, 56);
  } else {
    platoDibujado(ctx, ANCHO / 2, fy + fw / 2, marca.sobreAcento);
  }

  // «Plato del día», el nombre y el precio.
  let y = fy + fw + 110;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = marca.acento;
  ctx.font = `700 34px ${f.ui}`;
  espaciado(ctx, 7);
  ctx.fillText('PLATO DEL DÍA', M, y);
  espaciado(ctx, 0);

  ctx.fillStyle = marca.texto;
  ctx.font = `700 88px ${f.display}`;
  const lineas = renglones(ctx, plato.nombre, ANCHO - M * 2, 3);
  y += 30;
  for (const l of lineas) {
    y += 96;
    ctx.fillText(l, M, y);
  }
  if (plato.precio) {
    y += 92;
    ctx.font = `600 64px ${f.mono}`;
    ctx.fillStyle = marca.acento;
    ctx.fillText(plato.precio, M, y);
  }

  // Abajo: dónde pedirlo y la firma de Leogin.
  ctx.fillStyle = marca.texto;
  ctx.globalAlpha = 0.72;
  ctx.font = `400 34px ${f.ui}`;
  ctx.fillText('Pídelo en', M, ALTO - 214);
  ctx.globalAlpha = 1;
  ctx.font = `600 44px ${f.ui}`;
  ctx.fillText(renglones(ctx, marca.menu, ANCHO - M * 2, 1)[0] ?? marca.menu, M, ALTO - 158);
  ctx.globalAlpha = 0.85;
  firmaLeogin(ctx, M, ALTO - 112, marca.texto, f);
  ctx.globalAlpha = 1;

  return aBlob(canvas);
}
