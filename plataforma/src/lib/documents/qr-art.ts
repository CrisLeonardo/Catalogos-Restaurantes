/* ============================================================
   QR CON MARCA (SOLO CLIENTE) — auditoría 2026-10-02, AJU-07
   ------------------------------------------------------------
   El QR del restaurante era solo el cuadro negro. Aquí se arma:
   · `qrPng`        el QR como PNG (lo usan también los QR de mesa);
   · `downloadQrSocialPng` una tarjeta 1080×1350 para redes: nombre,
     QR con el logo al centro, «Escanea para ver el menú y pedir» y
     el enlace;
   · `downloadQrCardPdf`   el mismo cartel en A6 para imprimir.

   Con logo, el QR se pide con corrección de errores alta (`ecc=H`,
   aguanta ~30 % tapado) y el logo ocupa menos del 6 % del área.
   El fondo es claro y el acento del restaurante solo un detalle: la
   decisión de poner blanco sobre el acento sigue pendiente (D-4).
   ============================================================ */

import { createDoc } from '@/lib/documents/pdf';

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
async function loadLogo(restaurantId: string): Promise<HTMLImageElement | null> {
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

function fileBase(name: string): string {
  return name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'restaurante';
}

function download(href: string, name: string) {
  const a = document.createElement('a');
  a.href = href;
  a.download = name;
  a.click();
}

export async function downloadQrSocialPng(opts: {
  url: string; restaurantName: string; restaurantId: string; accent: string;
}): Promise<void> {
  const { url, restaurantName, restaurantId, accent } = opts;
  const W = 1080, H = 1350;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#faf8f5';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = accent;
  ctx.fillRect(0, 0, W, 18);

  ctx.fillStyle = '#18181b';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  fitText(ctx, restaurantName, W - 160, 84);
  ctx.fillText(restaurantName, W / 2, 190);

  ctx.fillStyle = '#52525b';
  ctx.font = '500 40px Helvetica, Arial, sans-serif';
  ctx.fillText('Nuestro menú, en tu teléfono', W / 2, 260);

  // Tarjeta blanca con el QR
  const card = 700, cx = (W - card) / 2, cy = 330;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.12)';
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 12;
  ctx.fillStyle = '#ffffff';
  roundRect(ctx, cx, cy, card, card, 48);
  ctx.fill();
  ctx.restore();
  const logo = await loadLogo(restaurantId);
  const qr = await qrWithLogo(url, logo, 600);
  ctx.drawImage(qr, cx + 50, cy + 50, 600, 600);

  ctx.fillStyle = '#18181b';
  ctx.font = '700 52px Helvetica, Arial, sans-serif';
  ctx.fillText('Escanea para ver el menú y pedir', W / 2, cy + card + 120);

  ctx.fillStyle = accent;
  ctx.fillRect(W / 2 - 60, cy + card + 160, 120, 8);

  ctx.fillStyle = '#52525b';
  fitText(ctx, url.replace(/^https?:\/\//, ''), W - 160, 38, 500);
  ctx.fillText(url.replace(/^https?:\/\//, ''), W / 2, cy + card + 230);

  await new Promise<void>((resolve) => canvas.toBlob((blob) => {
    if (blob) {
      const href = URL.createObjectURL(blob);
      download(href, `qr-redes-${fileBase(restaurantName)}.png`);
      setTimeout(() => URL.revokeObjectURL(href), 1000);
    }
    resolve();
  }, 'image/png'));
}

export async function downloadQrCardPdf(opts: {
  url: string; restaurantName: string; restaurantId: string; accent: string;
}): Promise<void> {
  const { url, restaurantName, restaurantId, accent } = opts;
  // Cartel A6 vertical (105 × 148 mm) centrado en una hoja A5, con línea de
  // corte: cualquier impresora casera saca A5 y se recorta a mano.
  const doc = await createDoc({ format: 'a5', orientation: 'p' });
  const cw = 105, ch = 148;
  const x0 = (doc.internal.pageSize.getWidth() - cw) / 2;
  const y0 = (doc.internal.pageSize.getHeight() - ch) / 2;
  const hex = accent.replace('#', '');
  const rgb: [number, number, number] = hex.length === 6
    ? [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)]
    : [24, 24, 27];

  doc.setDrawColor(200, 200, 205);
  doc.setLineDashPattern([1.5, 1.5], 0);
  doc.rect(x0, y0, cw, ch);
  doc.setLineDashPattern([], 0);
  doc.setFillColor(...rgb);
  doc.rect(x0, y0, cw, 3, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(24, 24, 27);
  doc.setFontSize(18);
  doc.text(restaurantName, x0 + cw / 2, y0 + 18, { align: 'center', maxWidth: cw - 14 });

  const logo = await loadLogo(restaurantId);
  const qr = await qrWithLogo(url, logo, 700);
  const q = 70;
  doc.addImage(qr.toDataURL('image/png'), 'PNG', x0 + (cw - q) / 2, y0 + 28, q, q, 'qr', 'FAST');

  doc.setFontSize(13);
  doc.text('Escanea para ver el menú y pedir', x0 + cw / 2, y0 + 28 + q + 12, { align: 'center', maxWidth: cw - 12 });
  doc.setFillColor(...rgb);
  doc.rect(x0 + cw / 2 - 8, y0 + 28 + q + 17, 16, 1.2, 'F');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(82, 82, 91);
  doc.text(url.replace(/^https?:\/\//, ''), x0 + cw / 2, y0 + 28 + q + 26, { align: 'center', maxWidth: cw - 12 });

  doc.save(`qr-cartel-${fileBase(restaurantName)}.pdf`);
}
