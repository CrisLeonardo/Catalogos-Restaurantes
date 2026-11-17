/* ============================================================
   QR CON MARCA (SOLO CLIENTE) — auditoría 2026-10-02, AJU-07
   ------------------------------------------------------------
   El QR del restaurante era solo el cuadro negro. Aquí se arma:
   · `qrPng` .............. el QR como PNG (lo usan también los QR de mesa);
   · `dibujarTarjeta` ..... tarjeta 1080×1350 para redes;
   · `dibujarHojaCartel` .. hoja carta con dos carteles de 105×148 mm;
   · `dibujarCodigo` ...... el código solo, 1200 px, con el logo.
   Ficha 2.10: cada uno devuelve el canvas. La pantalla enseña ESE canvas
   y la descarga lo guarda tal cual (el PDF lleva la misma imagen), así
   que lo que se ve es lo que se descarga. La frase del cartel la eligen
   las reglas de `lib/qr-material.ts`.

   Con logo, el QR se pide con corrección de errores alta (`ecc=H`,
   aguanta ~30 % tapado) y el logo ocupa menos del 6 % del área.
   El fondo es claro y el acento del restaurante solo un detalle: la
   decisión de poner blanco sobre el acento sigue pendiente (D-4).
   ============================================================ */

import { createDoc } from '@/lib/documents/pdf';
import { CARTEL, mmAPx } from '@/lib/qr-material';

type Ecc = 'M' | 'H';

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const i = new window.Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error('img'));
    i.src = src;
  });
}

/** El QR llega como SVG desde /api/qr; se pasa a PNG con fondo blanco. */
export async function qrPng(url: string, px = 600, ecc: Ecc = 'M'): Promise<string> {
  const res = await fetch(`/api/qr?url=${encodeURIComponent(url)}${ecc === 'H' ? '&ecc=H' : ''}`);
  if (!res.ok) throw new Error('qr');
  const svgUrl = URL.createObjectURL(await res.blob());
  try {
    const img = await loadImage(svgUrl);
    const canvas = document.createElement('canvas');
    canvas.width = px;
    canvas.height = px;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, px, px);
    ctx.drawImage(img, 0, 0, px, px);
    return canvas.toDataURL('image/png');
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}

/** Logo del restaurante por el proxy del mismo origen; null si no tiene. */
export async function cargarLogo(restaurantId: string): Promise<HTMLImageElement | null> {
  try {
    const res = await fetch(`/api/doc-logo/restaurant/${restaurantId}`);
    if (!res.ok) return null;
    const url = URL.createObjectURL(await res.blob());
    try { return await loadImage(url); } finally { URL.revokeObjectURL(url); }
  } catch {
    return null;
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** QR (+ logo al centro con su marco blanco) dibujado en un canvas, como PNG. */
async function qrWithLogo(url: string, logo: HTMLImageElement | null, px: number): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas');
  canvas.width = px;
  canvas.height = px;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(await loadImage(await qrPng(url, px, logo ? 'H' : 'M')), 0, 0, px, px);
  if (logo) {
    const box = Math.round(px * 0.22);
    const x = (px - box) / 2;
    ctx.fillStyle = '#ffffff';
    roundRect(ctx, x, x, box, box, box * 0.2);
    ctx.fill();
    const pad = box * 0.12;
    const inner = box - pad * 2;
    const ratio = logo.width / logo.height || 1;
    const w = ratio >= 1 ? inner : inner * ratio;
    const h = ratio >= 1 ? inner / ratio : inner;
    ctx.drawImage(logo, (px - w) / 2, (px - h) / 2, w, h);
  }
  return canvas;
}

function fitText(ctx: CanvasRenderingContext2D, text: string, maxW: number, size: number, weight = 700, family = 'Helvetica, Arial, sans-serif') {
  let s = size;
  do {
    ctx.font = `${weight} ${s}px ${family}`;
    if (ctx.measureText(text).width <= maxW) break;
    s -= 2;
  } while (s > 18);
  return s;
}

export interface Material {
  /** Lo que codifica el QR (la dirección estable). */
  url: string;
  /** Lo que se lee impreso (el enlace corto). */
  direccion: string;
  restaurantName: string;
  accent: string;
  frase: string;
  logo: HTMLImageElement | null;
}

const TINTA = '#18181b';
const GRIS = '#52525b';
const FUENTE = 'Helvetica, Arial, sans-serif';

function lienzo(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas');
  return [canvas, ctx];
}

/** Tarjeta para redes, 1080 × 1350 (4:5, la de Instagram). */
export async function dibujarTarjeta(m: Material): Promise<HTMLCanvasElement> {
  const W = 1080, H = 1350;
  const [canvas, ctx] = lienzo(W, H);
  ctx.fillStyle = '#faf8f5';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = m.accent;
  ctx.fillRect(0, 0, W, 18);

  ctx.fillStyle = TINTA;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  fitText(ctx, m.restaurantName, W - 160, 84);
  ctx.fillText(m.restaurantName, W / 2, 190);

  ctx.fillStyle = GRIS;
  ctx.font = `500 40px ${FUENTE}`;
  ctx.fillText('Nuestra carta, en tu teléfono', W / 2, 260);

  const card = 700, cx = (W - card) / 2, cy = 330;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.12)';
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 12;
  ctx.fillStyle = '#ffffff';
  roundRect(ctx, cx, cy, card, card, 48);
  ctx.fill();
  ctx.restore();
  ctx.drawImage(await qrWithLogo(m.url, m.logo, 600), cx + 50, cy + 50, 600, 600);

  ctx.fillStyle = TINTA;
  fitText(ctx, m.frase, W - 160, 56);
  ctx.fillText(m.frase, W / 2, cy + card + 120);
  ctx.fillStyle = m.accent;
  ctx.fillRect(W / 2 - 60, cy + card + 160, 120, 8);
  ctx.fillStyle = GRIS;
  fitText(ctx, m.direccion, W - 160, 38, 500);
  ctx.fillText(m.direccion, W / 2, cy + card + 230);
  return canvas;
}

/** El código solo, 1200 px, con el logo y un margen blanco de lectura. */
export async function dibujarCodigo(m: Pick<Material, 'url' | 'logo'>): Promise<HTMLCanvasElement> {
  const W = 1200, pad = 72;
  const [canvas, ctx] = lienzo(W, W);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, W);
  ctx.drawImage(await qrWithLogo(m.url, m.logo, W - pad * 2), pad, pad, W - pad * 2, W - pad * 2);
  return canvas;
}

/**
 * Hoja carta a 200 ppp con dos carteles de 105 × 148 mm lado a lado, su
 * línea de corte y, abajo, cómo imprimirla. El código mide 70 mm.
 */
export async function dibujarHojaCartel(m: Material): Promise<HTMLCanvasElement> {
  const W = mmAPx(CARTEL.hojaMm.w), H = mmAPx(CARTEL.hojaMm.h);
  const [canvas, ctx] = lienzo(W, H);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);

  const cw = mmAPx(CARTEL.cartelMm.w), ch = mmAPx(CARTEL.cartelMm.h);
  const x0 = Math.round((W - cw * 2) / 2), y0 = mmAPx(12);
  const q = mmAPx(CARTEL.codigoMm);
  const qr = await qrWithLogo(m.url, m.logo, q);

  for (const x of [x0, x0 + cw]) {
    ctx.fillStyle = m.accent;
    ctx.fillRect(x, y0, cw, mmAPx(3));
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = TINTA;
    fitText(ctx, m.restaurantName, cw - mmAPx(14), mmAPx(6.4));
    ctx.fillText(m.restaurantName, x + cw / 2, y0 + mmAPx(19));
    ctx.drawImage(qr, x + (cw - q) / 2, y0 + mmAPx(26), q, q);
    fitText(ctx, m.frase, cw - mmAPx(12), mmAPx(4.8));
    ctx.fillText(m.frase, x + cw / 2, y0 + mmAPx(108));
    ctx.fillStyle = m.accent;
    ctx.fillRect(x + cw / 2 - mmAPx(8), y0 + mmAPx(112), mmAPx(16), mmAPx(1.2));
    ctx.fillStyle = GRIS;
    fitText(ctx, m.direccion, cw - mmAPx(12), mmAPx(3.4), 500);
    ctx.fillText(m.direccion, x + cw / 2, y0 + mmAPx(121));
  }

  // Línea de corte: el contorno de los dos carteles y la división.
  ctx.strokeStyle = '#a1a1aa';
  ctx.lineWidth = 3;
  ctx.setLineDash([14, 12]);
  ctx.strokeRect(x0, y0, cw * 2, ch);
  ctx.beginPath();
  ctx.moveTo(x0 + cw, y0);
  ctx.lineTo(x0 + cw, y0 + ch);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = '#71717a';
  ctx.textAlign = 'center';
  ctx.font = `500 ${mmAPx(3.2)}px ${FUENTE}`;
  ctx.fillText('Corta por la línea punteada. Imprime en «Tamaño real» o al 100 %.', W / 2, y0 + ch + mmAPx(10));
  return canvas;
}

function blobDe(canvas: HTMLCanvasElement, tipo = 'image/png'): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('blob'))), tipo));
}

/** URL local para enseñar el canvas en la pantalla; el que llama la libera. */
export async function vistaPrevia(canvas: HTMLCanvasElement): Promise<string> {
  return URL.createObjectURL(await blobDe(canvas));
}

function bajar(href: string, nombre: string) {
  const a = document.createElement('a');
  a.href = href;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** Guarda el canvas como PNG. Si el archivo no se pudo hacer, lanza. */
export async function descargarPng(canvas: HTMLCanvasElement, nombre: string): Promise<void> {
  const href = URL.createObjectURL(await blobDe(canvas));
  bajar(href, nombre);
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}

/** Guarda la hoja como PDF carta, con la misma imagen a tamaño real. */
export async function descargarHojaPdf(canvas: HTMLCanvasElement, nombre: string): Promise<void> {
  const doc = await createDoc({ format: 'letter', orientation: 'p' });
  doc.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, CARTEL.hojaMm.w, CARTEL.hojaMm.h, 'hoja', 'FAST');
  const blob = doc.output('blob');
  if (!blob.size) throw new Error('pdf');
  const href = URL.createObjectURL(blob);
  bajar(href, nombre);
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}
