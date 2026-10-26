// Ilustraciones de los platillos de Rincón 502, el restaurante de ejemplo.
//
// La demo (demo.distleogin.com) y la vitrina de diseños de la portada usan
// estas imágenes en lugar de fotos: Rincón 502 no tiene fotos libres de usar.
// Cada platillo es un SVG de 800×800 que se pasa a WebP con sharp.
//
//   node docs/diseno/rincon502/ilustraciones.mjs            → escribe las WebP
//   node docs/diseno/rincon502/ilustraciones.mjs --hoja X   → además, una hoja
//                                                              de contacto en X
//
// Destino: plataforma/public/demo/rincon502/<id>.webp. Si algún día hay fotos
// de verdad, basta con dejarlas con el mismo nombre en esa carpeta.

import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = dirname(fileURLToPath(import.meta.url));
const plataforma = resolve(aqui, '../../../plataforma');
const require = createRequire(join(plataforma, 'package.json'));
const sharp = require('sharp');

const S = 800;

/* ── Piezas comunes ──────────────────────────────────────────── */

// Fondo «de estudio»: carbón cálido con una luz arriba y un tinte por platillo
// (así las fotos de una misma carta se ven de la misma sesión).
function fondo(tinte, zoom = 1.12) {
  // El platillo se acerca un poco: en una tarjeta pequeña del menú tiene que
  // llenar el cuadro, como en una foto bien encuadrada.
  return `
  <defs>
    <radialGradient id="bg" cx="50%" cy="34%" r="78%">
      <stop offset="0" stop-color="#4a3f37"/>
      <stop offset="0.55" stop-color="#2a231e"/>
      <stop offset="1" stop-color="#141110"/>
    </radialGradient>
    <radialGradient id="tinte" cx="50%" cy="100%" r="70%">
      <stop offset="0" stop-color="${tinte}" stop-opacity="0.34"/>
      <stop offset="1" stop-color="${tinte}" stop-opacity="0"/>
    </radialGradient>
    <filter id="grano" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="7" result="n"/>
      <feColorMatrix in="n" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.07 0"/>
    </filter>
    <filter id="sombra" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="22"/>
    </filter>
    <filter id="suave" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="6"/>
    </filter>
    <linearGradient id="plato" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fbf7f1"/>
      <stop offset="1" stop-color="#d8cec1"/>
    </linearGradient>
    <linearGradient id="platoIn" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#e9e1d6"/>
      <stop offset="1" stop-color="#f8f3ec"/>
    </linearGradient>
  </defs>
  <rect width="${S}" height="${S}" fill="url(#bg)"/>
  <rect width="${S}" height="${S}" fill="url(#tinte)"/>
  <g transform="translate(400 440) scale(${zoom}) translate(-400 -440)">`;
}

const grano = `</g><rect width="${S}" height="${S}" filter="url(#grano)"/>`;

function sombra(cx, cy, rx, ry, o = 0.6) {
  return `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="#000" opacity="${o}" filter="url(#sombra)"/>`;
}

// Plato de cerámica visto en tres cuartos.
function plato(cx, cy, rx, ry) {
  return `
  ${sombra(cx, cy + ry * 0.35, rx * 0.98, ry * 0.9)}
  <ellipse cx="${cx}" cy="${cy + 10}" rx="${rx}" ry="${ry}" fill="#b9ad9f"/>
  <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="url(#plato)"/>
  <ellipse cx="${cx}" cy="${cy + 4}" rx="${rx * 0.74}" ry="${ry * 0.72}" fill="url(#platoIn)"/>
  <path d="M${cx - rx * 0.86} ${cy - ry * 0.28} A${rx} ${ry} 0 0 1 ${cx + rx * 0.3} ${cy - ry * 0.97}" stroke="#fff" stroke-width="5" fill="none" opacity="0.7" stroke-linecap="round"/>`;
}

// Tabla de madera ovalada (pizzas, nachos).
function tabla(cx, cy, rx, ry) {
  return `
  <defs>
    <linearGradient id="madera" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#b9824f"/>
      <stop offset="1" stop-color="#8a5a33"/>
    </linearGradient>
  </defs>
  ${sombra(cx, cy + ry * 0.3, rx, ry * 0.92)}
  <ellipse cx="${cx}" cy="${cy + 16}" rx="${rx}" ry="${ry}" fill="#6b4426"/>
  <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="url(#madera)"/>
  ${[0.2, 0.42, 0.63, 0.82].map((k) => `<path d="M${cx - rx * 0.92} ${cy - ry + ry * 2 * k} Q${cx} ${cy - ry + ry * 2 * k - 18} ${cx + rx * 0.92} ${cy - ry + ry * 2 * k + 6}" stroke="#7d4f2c" stroke-width="3" fill="none" opacity="0.35"/>`).join('')}`;
}

// Brillo blanco suave (la luz de arriba a la izquierda).
const brillo = (d, o = 0.55, w = 10) =>
  `<path d="${d}" stroke="#fff" stroke-width="${w}" stroke-linecap="round" fill="none" opacity="${o}"/>`;

// Pseudoaleatorio estable: las ilustraciones salen iguales cada vez.
function rnd(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/* ── Hamburguesas ────────────────────────────────────────────── */

function hamburguesa({ doble = false, ajonjoli = true }) {
  const cx = 400;
  const r = rnd(doble ? 11 : 5);
  const carne = (y) => {
    const bumps = Array.from({ length: 18 }, (_, i) => {
      const x = cx - 205 + i * 24;
      return `Q${x + 6} ${y + 46 + r() * 10} ${x + 12} ${y + 40}`;
    }).join(' ');
    return `
    <path d="M${cx - 214} ${y + 6} Q${cx - 222} ${y + 40} ${cx - 205} ${y + 40} ${bumps} Q${cx + 226} ${y + 40} ${cx + 214} ${y + 6} Q${cx} ${y - 22} ${cx - 214} ${y + 6}Z" fill="url(#carne)"/>
    ${Array.from({ length: 9 }, () => `<path d="M${cx - 170 + r() * 330} ${y + 10 + r() * 22} l${10 + r() * 14} ${-2 + r() * 4}" stroke="#2a150b" stroke-width="3" opacity="0.6" stroke-linecap="round"/>`).join('')}
    ${brillo(`M${cx - 150} ${y + 2} Q${cx - 40} ${y - 12} ${cx + 90} ${y - 2}`, 0.18, 6)}`;
  };
  const queso = (y) => `
    <path d="M${cx - 220} ${y} L${cx + 222} ${y - 4} L${cx + 205} ${y + 22} L${cx + 168} ${y + 22} L${cx + 150} ${y + 58} L${cx + 128} ${y + 22} L${cx + 40} ${y + 24} L${cx + 18} ${y + 70} L${cx - 6} ${y + 24} L${cx - 98} ${y + 22} L${cx - 116} ${y + 50} L${cx - 136} ${y + 22} L${cx - 204} ${y + 24}Z" fill="url(#queso)"/>
    ${brillo(`M${cx - 180} ${y + 6} L${cx - 60} ${y + 4}`, 0.4, 5)}`;
  const tocino = (y) => [0, 1, 2].map((i) => {
    const x0 = cx - 230 + i * 150;
    return `<path d="M${x0} ${y + 6} q24 -22 48 0 t48 0 t48 0 t30 -4 l4 18 q-24 -16 -48 4 t-48 0 t-48 0 t-36 0Z" fill="#a8432a"/>
      <path d="M${x0 + 6} ${y + 10} q24 -16 48 0 t48 0 t48 0" stroke="#f2c7a2" stroke-width="5" fill="none" opacity="0.85"/>`;
  }).join('');

  let capas = '';
  // Pan de abajo: la corona en 520 y la base en 584 (el plato está en 600).
  capas += `
    <path d="M${cx - 222} 520 Q${cx - 230} 578 ${cx - 170} 586 L${cx + 170} 586 Q${cx + 230} 578 ${cx + 222} 520Z" fill="url(#panAbajo)"/>
    <path d="M${cx - 222} 520 L${cx + 222} 520 L${cx + 214} 536 L${cx - 214} 536Z" fill="#f1d3a1"/>`;
  let y = 482; // borde de arriba de la carne
  capas += carne(y);
  capas += queso(y - 8);
  if (doble) {
    y -= 66;
    capas += carne(y);
    capas += queso(y - 8);
    capas += tocino(y - 30);
    y -= 40;
  } else {
    // Tomate, cebolla y lechuga: se ven de lado entre el queso y el pan.
    y -= 64;
    const holanes = Array.from({ length: 12 }, (_, i) => {
      const x = cx + 242 - i * 40.3;
      return `Q${(x - 20).toFixed(0)} ${y + (i % 2 ? 56 : 32)} ${(x - 40.3).toFixed(0)} ${y + 38}`;
    }).join(' ');
    capas += `
      <rect x="${cx - 204}" y="${y + 30}" width="196" height="32" rx="14" fill="#d93a2b"/>
      <rect x="${cx + 4}" y="${y + 28}" width="200" height="32" rx="14" fill="#e2483a"/>
      <path d="M${cx - 184} ${y + 40} h150 M${cx + 22} ${y + 38} h160" stroke="#ff8a70" stroke-width="5" opacity="0.7" stroke-linecap="round"/>
      <path d="M${cx - 80} ${y + 30} q50 -12 110 0" stroke="#9b4f96" stroke-width="10" fill="none" stroke-linecap="round"/>
      <path d="M${cx - 242} ${y + 8} Q${cx} ${y - 10} ${cx + 242} ${y + 8} L${cx + 242} ${y + 38} ${holanes} Z" fill="url(#lechuga)"/>
      <path d="M${cx - 200} ${y + 22} q40 10 80 0 t80 0" stroke="#bff07f" stroke-width="4" fill="none" opacity="0.6"/>`;
  }
  // Pan de arriba: su borde de abajo queda en y + 10.
  const tope = y - 196;
  capas += `
    <path d="M${cx - 236} ${y + 10} Q${cx - 250} ${tope + 10} ${cx} ${tope} Q${cx + 250} ${tope + 10} ${cx + 236} ${y + 10} Q${cx} ${y + 26} ${cx - 236} ${y + 10}Z" fill="url(#panArriba)"/>
    ${brillo(`M${cx - 150} ${tope + 70} Q${cx - 90} ${tope + 22} ${cx - 10} ${tope + 18}`, 0.45, 18)}`;
  if (ajonjoli) {
    capas += Array.from({ length: 26 }, () => {
      const x = cx + (r() * 2 - 1) * 180;
      const yy = tope + 34 + r() * 120 * (1 - Math.abs(x - cx) / 250);
      return `<ellipse cx="${x.toFixed(1)}" cy="${yy.toFixed(1)}" rx="7" ry="3.6" fill="#fbecc8" transform="rotate(${(r() * 70 - 35).toFixed(0)} ${x.toFixed(1)} ${yy.toFixed(1)})"/>`;
    }).join('');
  } else {
    capas += brillo(`M${cx + 40} ${tope + 30} Q${cx + 120} ${tope + 46} ${cx + 170} ${tope + 96}`, 0.22, 10);
  }
  // Banderita de la casa
  capas += `
    <line x1="${cx + 30}" y1="${tope + 30}" x2="${cx + 54}" y2="${tope - 90}" stroke="#e8dcc8" stroke-width="6" stroke-linecap="round"/>
    <path d="M${cx + 54} ${tope - 90} L${cx + 128} ${tope - 70} L${cx + 50} ${tope - 46}Z" fill="#E4572E"/>`;

  return `${fondo('#E4572E')}
  <defs>
    <linearGradient id="panArriba" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${ajonjoli ? '#e6a052' : '#c97a34'}"/>
      <stop offset="1" stop-color="${ajonjoli ? '#b76a2a' : '#8f4f1d'}"/>
    </linearGradient>
    <linearGradient id="panAbajo" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#e2a35c"/>
      <stop offset="1" stop-color="#a8622a"/>
    </linearGradient>
    <linearGradient id="carne" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#6b3b22"/>
      <stop offset="1" stop-color="#3a1f11"/>
    </linearGradient>
    <linearGradient id="queso" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffd25a"/>
      <stop offset="1" stop-color="#f0a92a"/>
    </linearGradient>
    <linearGradient id="lechuga" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#8fd04f"/>
      <stop offset="1" stop-color="#4e8f2a"/>
    </linearGradient>
  </defs>
  ${plato(400, 600, 330, 96)}
  ${capas}
  ${grano}`;
}

/* ── Entradas ────────────────────────────────────────────────── */

function papas() {
  const r = rnd(3);
  const papa = (x, y, h, a) => `
    <g transform="rotate(${a} ${x} ${y})">
      <rect x="${x - 13}" y="${y - h}" width="26" height="${h}" rx="5" fill="url(#papa)"/>
      <rect x="${x - 9}" y="${y - h + 4}" width="7" height="${h - 14}" rx="3" fill="#fff3c4" opacity="0.5"/>
    </g>`;
  const fries = Array.from({ length: 22 }, (_, i) => {
    const x = 270 + (i % 11) * 26 + r() * 10;
    const fila = i < 11 ? 0 : 1;
    return papa(x, 470 + fila * 22, 150 + r() * 90 - fila * 30, (r() * 30 - 15).toFixed(0));
  }).join('');
  const tocino = Array.from({ length: 16 }, () => {
    const x = 290 + r() * 230, y = 380 + r() * 70;
    return `<rect x="${x}" y="${y}" width="${12 + r() * 10}" height="${9 + r() * 6}" rx="3" fill="#9c3a22" transform="rotate(${(r() * 60).toFixed(0)} ${x} ${y})"/>`;
  }).join('');
  const cebollin = Array.from({ length: 18 }, () => {
    const x = 280 + r() * 250, y = 360 + r() * 90;
    return `<rect x="${x}" y="${y}" width="10" height="5" rx="2" fill="#5bbd52"/>`;
  }).join('');
  return `${fondo('#F5A030')}
  <defs>
    <linearGradient id="papa" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#f7cf5f"/>
      <stop offset="1" stop-color="#d9962b"/>
    </linearGradient>
    <linearGradient id="quesoSalsa" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffcf4d"/>
      <stop offset="1" stop-color="#f29a1f"/>
    </linearGradient>
    <clipPath id="barco"><path d="M210 470 L590 470 L548 640 Q400 668 252 640Z"/></clipPath>
  </defs>
  ${sombra(400, 650, 230, 46)}
  ${fries}
  <path d="M270 400 Q300 370 340 392 Q370 360 410 388 Q450 356 486 386 Q520 362 548 398 Q560 430 520 440 Q480 470 440 446 Q400 476 360 448 Q318 470 290 440 Q254 430 270 400Z" fill="url(#quesoSalsa)"/>
  <path d="M330 440 q6 40 -4 70 M452 446 q8 36 2 58" stroke="#f29a1f" stroke-width="16" stroke-linecap="round" fill="none"/>
  ${brillo('M300 398 Q340 380 380 396', 0.5, 7)}
  ${tocino}${cebollin}
  <path d="M210 470 L590 470 L548 640 Q400 668 252 640Z" fill="#fbf4ea"/>
  <g clip-path="url(#barco)">
    ${Array.from({ length: 9 }, (_, i) => `<rect x="${200 + i * 48}" y="460" width="24" height="220" fill="#E4572E"/>`).join('')}
    <rect x="200" y="460" width="420" height="30" fill="#000" opacity="0.12"/>
  </g>
  ${brillo('M232 486 L270 630', 0.35, 8)}
  ${grano}`;
}

function alitas() {
  const r = rnd(8);
  const ala = (x, y, a, s = 1) => `
    <g transform="translate(${x} ${y}) rotate(${a}) scale(${s})">
      <path d="M-66 0 C-70 -46 8 -52 34 -18 L64 -12 Q84 -16 86 0 Q84 16 64 12 L34 18 C8 50 -70 46 -66 0Z" fill="url(#bbq)"/>
      <circle cx="80" cy="-7" r="10" fill="#ead2ab"/><circle cx="80" cy="8" r="9" fill="#d8bb8e"/>
      <path d="M-48 -24 Q-12 -42 22 -20" stroke="#ffb27a" stroke-width="9" stroke-linecap="round" fill="none" opacity="0.5"/>
      ${Array.from({ length: 5 }, () => { const sx = -54 + r() * 76, sy = -22 + r() * 40; return `<ellipse cx="${sx.toFixed(0)}" cy="${sy.toFixed(0)}" rx="4.6" ry="2.4" fill="#f6e3c0" transform="rotate(${(r() * 180).toFixed(0)} ${sx.toFixed(0)} ${sy.toFixed(0)})"/>`; }).join('')}
    </g>`;
  return `${fondo('#E8534A')}
  <defs>
    <radialGradient id="bbq" cx="40%" cy="30%" r="80%">
      <stop offset="0" stop-color="#d4622f"/>
      <stop offset="0.6" stop-color="#9a3418"/>
      <stop offset="1" stop-color="#5e1c0c"/>
    </radialGradient>
  </defs>
  ${plato(400, 520, 320, 150)}
  <g>
    <rect x="520" y="430" width="22" height="190" rx="10" fill="#a9cf6b" transform="rotate(58 530 520)"/>
    <rect x="552" y="420" width="22" height="200" rx="10" fill="#8dbb4f" transform="rotate(64 560 520)"/>
  </g>
  ${ala(300, 470, -18)}${ala(420, 440, 12)}${ala(260, 560, 10, 0.95)}${ala(390, 560, -6)}${ala(500, 540, 30, 0.9)}${ala(330, 400, 24, 0.85)}
  <ellipse cx="560" cy="400" rx="62" ry="24" fill="#d8cec1"/>
  <path d="M498 400 L504 460 Q560 480 616 460 L622 400Z" fill="#efe8dd"/>
  <ellipse cx="560" cy="400" rx="60" ry="22" fill="#fbf7ef"/>
  <ellipse cx="560" cy="402" rx="48" ry="15" fill="#f1ead9"/>
  ${Array.from({ length: 10 }, () => `<circle cx="${525 + r() * 70}" cy="${396 + r() * 10}" r="2.2" fill="#6aa84f"/>`).join('')}
  ${grano}`;
}

function nachos() {
  const r = rnd(21);
  const chip = (x, y, a, s = 1) => `
    <g transform="translate(${x} ${y}) rotate(${a}) scale(${s})">
      <path d="M-58 34 L0 -62 L58 34 Q0 46 -58 34Z" fill="url(#totopo)"/>
      <path d="M-40 26 L0 -40" stroke="#fff3c4" stroke-width="5" opacity="0.5" stroke-linecap="round"/>
    </g>`;
  const pico = Array.from({ length: 26 }, () => {
    const x = 300 + r() * 200, y = 360 + r() * 90;
    const c = ['#d93a2b', '#e2483a', '#f4efe6', '#5bbd52'][Math.floor(r() * 4)];
    return `<rect x="${x}" y="${y}" width="${10 + r() * 6}" height="${10 + r() * 6}" rx="3" fill="${c}"/>`;
  }).join('');
  return `${fondo('#2F9E6B')}
  <defs>
    <linearGradient id="totopo" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#f6c95a"/>
      <stop offset="1" stop-color="#d99630"/>
    </linearGradient>
    <radialGradient id="guaca" cx="40%" cy="30%" r="70%">
      <stop offset="0" stop-color="#a6d46a"/>
      <stop offset="1" stop-color="#5f9a32"/>
    </radialGradient>
  </defs>
  ${tabla(400, 540, 320, 150)}
  ${chip(270, 520, -30)}${chip(530, 520, 28)}${chip(330, 470, -8)}${chip(470, 470, 14)}${chip(400, 520, 4)}
  ${chip(260, 430, -52, 0.9)}${chip(545, 430, 50, 0.9)}${chip(350, 400, -20, 0.95)}${chip(455, 395, 22, 0.95)}${chip(400, 450, -4)}
  <path d="M290 410 Q320 380 360 400 Q400 370 440 396 Q480 372 510 404 Q520 436 486 444 Q450 470 410 452 Q370 476 334 450 Q290 450 290 410Z" fill="#ffc53d"/>
  <path d="M340 446 q4 34 -4 56 M470 440 q6 30 0 50" stroke="#ffc53d" stroke-width="14" stroke-linecap="round" fill="none"/>
  <path d="M360 360 Q400 318 446 356 Q462 384 432 396 Q400 408 370 394 Q344 380 360 360Z" fill="url(#guaca)"/>
  ${pico}
  <path d="M320 430 q40 -20 80 0 t80 0" stroke="#fffaf0" stroke-width="7" fill="none" stroke-linecap="round" opacity="0.95"/>
  ${grano}`;
}

/* ── Pizzas ──────────────────────────────────────────────────── */

function pizza(tipo) {
  const r = rnd(tipo === 'pepperoni' ? 31 : 37);
  const cx = 400, cy = 450, R = 260, k = 0.66; // k: aplastado por la perspectiva
  let encima = '';
  if (tipo === 'pepperoni') {
    const pos = [[-150, -40], [-80, -130], [20, -150], [120, -100], [170, 0], [110, 100], [10, 150], [-100, 110], [-170, 50], [-40, -20], [60, -20], [-10, 70], [80, 40], [-110, -100]];
    encima = pos.map(([x, y]) => `
      <g transform="translate(${cx + x} ${cy + y * k})">
        <ellipse rx="34" ry="${34 * k}" fill="#8c2318"/>
        <ellipse rx="30" ry="${30 * k}" fill="url(#peperoni)"/>
        <circle cx="-9" cy="-4" r="3.4" fill="#6e170e"/><circle cx="8" cy="6" r="3" fill="#6e170e"/><circle cx="10" cy="-8" r="2.4" fill="#6e170e"/>
        <ellipse cx="-10" cy="-8" rx="10" ry="4" fill="#fff" opacity="0.25"/>
      </g>`).join('');
  } else {
    const blobs = Array.from({ length: 9 }, () => {
      const a = r() * Math.PI * 2, d = 40 + r() * 170;
      const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d * k;
      return `<ellipse cx="${x}" cy="${y}" rx="${34 + r() * 12}" ry="${(26 + r() * 8) * k}" fill="#fbf6ea"/><ellipse cx="${x - 8}" cy="${y - 6}" rx="12" ry="5" fill="#fff" opacity="0.8"/>`;
    }).join('');
    const hojas = Array.from({ length: 7 }, () => {
      const a = r() * Math.PI * 2, d = 50 + r() * 150;
      const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d * k;
      return `<g transform="translate(${x} ${y}) rotate(${(r() * 360).toFixed(0)}) scale(1 ${k})"><path d="M-26 0 Q0 -22 26 0 Q0 22 -26 0Z" fill="#2f8a3a"/><path d="M-22 0 H22" stroke="#78c06b" stroke-width="2.4"/></g>`;
    }).join('');
    encima = blobs + hojas;
  }
  return `${fondo(tipo === 'pepperoni' ? '#E4572E' : '#2F9E6B', 1.02)}
  <defs>
    <radialGradient id="borde" cx="45%" cy="35%" r="70%">
      <stop offset="0.8" stop-color="#e3a258"/>
      <stop offset="1" stop-color="#a9642c"/>
    </radialGradient>
    <radialGradient id="queso2" cx="45%" cy="40%" r="70%">
      <stop offset="0" stop-color="${tipo === 'pepperoni' ? '#ffd76e' : '#e8502f'}"/>
      <stop offset="1" stop-color="${tipo === 'pepperoni' ? '#f0a43a' : '#b8321c'}"/>
    </radialGradient>
    <radialGradient id="peperoni" cx="40%" cy="35%" r="70%">
      <stop offset="0" stop-color="#d4452f"/>
      <stop offset="1" stop-color="#a92b1c"/>
    </radialGradient>
  </defs>
  ${tabla(cx, cy + 40, 340, 230 * k + 20)}
  <ellipse cx="${cx}" cy="${cy + 14}" rx="${R}" ry="${R * k}" fill="#8f4f1d"/>
  <ellipse cx="${cx}" cy="${cy}" rx="${R}" ry="${R * k}" fill="url(#borde)"/>
  <ellipse cx="${cx}" cy="${cy}" rx="${R - 30}" ry="${(R - 30) * k}" fill="url(#queso2)"/>
  ${Array.from({ length: 22 }, () => { const a = r() * Math.PI * 2, d = r() * 200; return `<ellipse cx="${cx + Math.cos(a) * d}" cy="${cy + Math.sin(a) * d * k}" rx="${8 + r() * 10}" ry="${(5 + r() * 6)}" fill="${tipo === 'pepperoni' ? '#e98b2a' : '#f2c16b'}" opacity="0.6"/>`; }).join('')}
  ${encima}
  ${[0, 60, 120].map((a) => { const rad = (a * Math.PI) / 180; return `<line x1="${cx - Math.cos(rad) * R}" y1="${cy - Math.sin(rad) * R * k}" x2="${cx + Math.cos(rad) * R}" y2="${cy + Math.sin(rad) * R * k}" stroke="#7a3d14" stroke-width="3" opacity="0.35"/>`; }).join('')}
  ${brillo(`M${cx - 200} ${cy - 70} Q${cx - 120} ${cy - 150} ${cx + 10} ${cy - 165}`, 0.28, 12)}
  ${grano}`;
}

/* ── Pastas ──────────────────────────────────────────────────── */

function fettuccine() {
  const r = rnd(41);
  const cintas = Array.from({ length: 16 }, (_, i) => {
    const a0 = (i / 16) * Math.PI * 2;
    const pts = Array.from({ length: 5 }, (_, j) => {
      const a = a0 + j * 0.5, d = 40 + j * 34 + r() * 14;
      return [400 + Math.cos(a) * d, 440 + Math.sin(a) * d * 0.6];
    });
    const d = `M${pts[0][0]} ${pts[0][1]} C${pts[1][0]} ${pts[1][1]} ${pts[2][0]} ${pts[2][1]} ${pts[3][0]} ${pts[3][1]} S${pts[4][0]} ${pts[4][1]} ${pts[4][0] + 10} ${pts[4][1] + 6}`;
    return `<path d="${d}" stroke="#c9a65e" stroke-width="30" fill="none" stroke-linecap="round"/><path d="${d}" stroke="url(#fideo)" stroke-width="24" fill="none" stroke-linecap="round"/>`;
  }).join('');
  return `${fondo('#F5A030')}
  <defs>
    <linearGradient id="fideo" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fff1c9"/>
      <stop offset="1" stop-color="#ead08c"/>
    </linearGradient>
    <radialGradient id="tazon" cx="50%" cy="30%" r="80%">
      <stop offset="0" stop-color="#2c4f5c"/>
      <stop offset="1" stop-color="#16303a"/>
    </radialGradient>
  </defs>
  ${sombra(400, 590, 300, 70)}
  <path d="M110 430 Q120 620 400 640 Q680 620 690 430Z" fill="url(#tazon)"/>
  <ellipse cx="400" cy="430" rx="290" ry="140" fill="#1d3b46"/>
  <ellipse cx="400" cy="436" rx="262" ry="122" fill="#f3e4bf"/>
  ${cintas}
  <path d="M300 470 Q400 520 500 470" stroke="#fff8e4" stroke-width="16" fill="none" stroke-linecap="round" opacity="0.6"/>
  ${Array.from({ length: 34 }, () => `<rect x="${260 + r() * 280}" y="${360 + r() * 150}" width="7" height="5" rx="2" fill="#3d9a4a" transform="rotate(${(r() * 90).toFixed(0)} 400 440)"/>`).join('')}
  ${Array.from({ length: 30 }, () => `<circle cx="${270 + r() * 260}" cy="${370 + r() * 140}" r="2" fill="#2a2018" opacity="0.7"/>`).join('')}
  <ellipse cx="560" cy="350" rx="60" ry="22" fill="#f7e7b4" opacity="0.9"/>
  ${brillo('M150 460 Q170 580 300 612', 0.25, 10)}
  ${grano}`;
}

function lasana() {
  const capas = [
    ['#f0c977', 26], ['#a8381f', 22], ['#f7e3a1', 14], ['#f0c977', 22], ['#a8381f', 22], ['#f7e3a1', 14], ['#f0c977', 22],
  ];
  let y = 590;
  const frente = capas.map(([c, h]) => {
    y -= h;
    return `<rect x="250" y="${y}" width="300" height="${h}" fill="${c}"/>`;
  }).join('');
  const topY = y;
  return `${fondo('#E8534A')}
  ${plato(400, 600, 320, 110)}
  <path d="M250 590 Q220 620 280 632 Q400 650 560 626 Q610 612 550 590Z" fill="#a8381f" opacity="0.9"/>
  ${frente}
  <path d="M550 ${topY} L640 ${topY - 50} L640 ${590 - 40} L550 590Z" fill="#c78b3c"/>
  <path d="M550 ${topY + 30} L640 ${topY - 20} M550 ${topY + 70} L640 ${topY + 20} M550 ${topY + 110} L640 ${topY + 60}" stroke="#8a2a14" stroke-width="10" opacity="0.6"/>
  <path d="M250 ${topY} L340 ${topY - 50} L640 ${topY - 50} L550 ${topY}Z" fill="#e1a04b"/>
  ${[[300, -14], [380, -30], [470, -20], [560, -38], [420, -10], [520, -8]].map(([x, dy]) => `<ellipse cx="${x}" cy="${topY + dy}" rx="${16}" ry="7" fill="#b8642a"/>`).join('')}
  <path d="M250 ${topY} q20 26 6 46 M330 ${topY} q10 20 0 40 M470 ${topY} q14 30 2 54" stroke="#f7e3a1" stroke-width="10" fill="none" stroke-linecap="round"/>
  <g transform="translate(470 ${topY - 52}) rotate(-20)"><path d="M-34 0 Q0 -26 34 0 Q0 26 -34 0Z" fill="#2f8a3a"/><path d="M-30 0 H30" stroke="#78c06b" stroke-width="2.4"/></g>
  ${brillo(`M270 ${topY - 6} L360 ${topY - 44}`, 0.4, 6)}
  ${grano}`;
}

/* ── Postres ─────────────────────────────────────────────────── */

function volcan() {
  const r = rnd(51);
  return `${fondo('#E8534A')}
  <defs>
    <radialGradient id="choco" cx="40%" cy="25%" r="80%">
      <stop offset="0" stop-color="#6b3a24"/>
      <stop offset="1" stop-color="#2e140a"/>
    </radialGradient>
    <linearGradient id="lava" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#3a160a"/>
      <stop offset="1" stop-color="#1e0a04"/>
    </linearGradient>
  </defs>
  ${plato(400, 560, 320, 120)}
  <path d="M300 560 Q260 610 340 626 Q420 640 520 616 Q580 596 500 566Z" fill="url(#lava)"/>
  ${brillo('M350 610 Q420 620 480 606', 0.35, 6)}
  <path d="M250 560 Q240 380 400 360 Q560 380 550 560 Q400 590 250 560Z" fill="url(#choco)"/>
  <path d="M344 552 L358 514 L378 528 L396 496 L416 524 L436 506 L456 554 Q400 566 344 552Z" fill="#1a0803"/>
  <path d="M368 546 Q376 520 398 514 Q422 520 430 548 Q444 586 480 600 Q424 616 380 600 Q352 588 368 546Z" fill="url(#lava)"/>
  ${brillo('M386 532 Q398 524 412 532', 0.45, 5)}
  ${Array.from({ length: 70 }, () => { const a = r() * Math.PI, d = r() * 140; return `<circle cx="${400 + Math.cos(a) * d * (r() > 0.5 ? 1 : -1)}" cy="${380 + r() * 60}" r="${1.6 + r() * 2}" fill="#fff" opacity="0.9"/>`; }).join('')}
  <g transform="translate(560 470)">
    <path d="M-60 40 Q-70 -20 0 -30 Q70 -20 60 40 Q0 56 -60 40Z" fill="#f6ebd3"/>
    <path d="M-50 0 Q-10 -26 40 -10" stroke="#fff" stroke-width="10" opacity="0.7" stroke-linecap="round" fill="none"/>
  </g>
  <g transform="translate(470 360)">
    ${Array.from({ length: 12 }, (_, i) => { const a = (i / 12) * Math.PI * 2; return `<circle cx="${Math.cos(a) * 14}" cy="${Math.sin(a) * 14}" r="9" fill="#c2263b"/>`; }).join('')}
    <circle r="12" fill="#a51d30"/>
    <path d="M-4 -20 q8 -18 26 -18 q-6 14 -26 18Z" fill="#3d9a4a"/>
  </g>
  ${brillo('M290 470 Q300 410 350 390', 0.3, 12)}
  ${grano}`;
}

function cheesecake() {
  return `${fondo('#E8534A')}
  <defs>
    <linearGradient id="crema" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fbf0d8"/>
      <stop offset="1" stop-color="#ead6ae"/>
    </linearGradient>
    <linearGradient id="fresa" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#e2384c"/>
      <stop offset="1" stop-color="#a6172b"/>
    </linearGradient>
  </defs>
  ${plato(400, 580, 320, 110)}
  <path d="M220 570 L560 600 L600 520 L300 470Z" fill="#000" opacity="0.18" filter="url(#suave)"/>
  <path d="M220 540 L540 590 L540 620 L220 570Z" fill="#c98b4a"/>
  <path d="M540 590 L620 500 L620 530 L540 620Z" fill="#a8703a"/>
  <path d="M220 400 L540 450 L540 590 L220 540Z" fill="url(#crema)"/>
  <path d="M540 450 L620 360 L620 500 L540 590Z" fill="#e3cda0"/>
  <path d="M220 400 L300 320 L620 360 L540 450Z" fill="url(#fresa)"/>
  <path d="M220 400 q10 40 -4 70 M330 418 q14 30 4 60 M450 436 q10 34 0 66 M540 450 q12 24 4 50" stroke="#c21f35" stroke-width="16" stroke-linecap="round" fill="none"/>
  ${[[330, 360], [420, 370], [500, 390], [390, 340]].map(([x, y]) => `
  <g transform="translate(${x} ${y})">
    <path d="M-30 6 Q-30 -30 0 -32 Q30 -30 30 6 Q0 34 -30 6Z" fill="#d62b40"/>
    <path d="M-30 6 Q0 -6 30 6" stroke="#f7c3cb" stroke-width="5" fill="none"/>
    <circle cx="-12" cy="-12" r="2" fill="#ffe7a8"/><circle cx="10" cy="-16" r="2" fill="#ffe7a8"/><circle cx="0" cy="-4" r="2" fill="#ffe7a8"/>
    <path d="M-8 -30 l8 -14 l8 14Z" fill="#3d9a4a"/>
  </g>`).join('')}
  ${brillo('M240 412 L300 340', 0.45, 7)}
  ${grano}`;
}

/* ── Bebidas ─────────────────────────────────────────────────── */

function malteada() {
  return `${fondo('#F5A030')}
  <defs>
    <linearGradient id="vaso" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#f6a3b6"/>
      <stop offset="0.5" stop-color="#ffc7d3"/>
      <stop offset="1" stop-color="#e98aa1"/>
    </linearGradient>
    <radialGradient id="nata" cx="40%" cy="30%" r="80%">
      <stop offset="0" stop-color="#fffdf8"/>
      <stop offset="1" stop-color="#eadfcf"/>
    </radialGradient>
  </defs>
  ${sombra(400, 680, 170, 30)}
  <path d="M290 300 L510 300 L470 660 Q400 680 330 660Z" fill="url(#vaso)"/>
  <path d="M300 300 L330 300 L352 650 L338 652Z" fill="#fff" opacity="0.45"/>
  <path d="M470 330 L488 330 L460 640 L448 642Z" fill="#fff" opacity="0.25"/>
  <path d="M290 300 L510 300 L506 330 Q400 344 294 330Z" fill="#d76a85"/>
  <path d="M296 310 q20 40 6 70 M420 314 q10 30 2 56" stroke="#7a2a12" stroke-width="12" stroke-linecap="round" fill="none" opacity="0.9"/>
  <path d="M276 300 Q270 250 320 246 Q320 200 370 204 Q390 160 440 190 Q490 196 486 246 Q536 250 524 300 Q400 320 276 300Z" fill="url(#nata)"/>
  <path d="M320 260 q40 -20 80 0 M380 214 q30 -14 60 4" stroke="#fff" stroke-width="7" fill="none" stroke-linecap="round" opacity="0.8"/>
  <g transform="rotate(14 470 200)">
    <rect x="456" y="40" width="26" height="230" rx="6" fill="#fff"/>
    ${[0, 1, 2, 3, 4, 5].map((i) => `<path d="M456 ${50 + i * 38} l26 -14 v18 l-26 14Z" fill="#E4572E"/>`).join('')}
  </g>
  <circle cx="400" cy="176" r="30" fill="#c8102e"/>
  <circle cx="390" cy="166" r="8" fill="#fff" opacity="0.5"/>
  <path d="M404 148 Q416 110 446 96" stroke="#5a7a2a" stroke-width="5" fill="none" stroke-linecap="round"/>
  ${grano}`;
}

function limonada() {
  const r = rnd(61);
  return `${fondo('#2F9E6B')}
  <defs>
    <linearGradient id="limon" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#f4f7c2" stop-opacity="0.9"/>
      <stop offset="1" stop-color="#d9e88a" stop-opacity="0.95"/>
    </linearGradient>
  </defs>
  ${sombra(400, 680, 160, 28)}
  <path d="M300 250 L500 250 L476 660 Q400 676 324 660Z" fill="#fff" opacity="0.14"/>
  <path d="M305 330 L495 330 L476 660 Q400 676 324 660Z" fill="url(#limon)"/>
  ${[[350, 380, 12], [430, 420, -10], [380, 480, 20], [440, 530, 6], [360, 580, -14]].map(([x, y, a]) => `<rect x="${x - 34}" y="${y - 30}" width="68" height="60" rx="14" fill="#fff" opacity="0.55" transform="rotate(${a} ${x} ${y})"/><rect x="${x - 24}" y="${y - 22}" width="20" height="14" rx="5" fill="#fff" opacity="0.7" transform="rotate(${a} ${x} ${y})"/>`).join('')}
  ${[[330, 470, 40], [460, 560, -30], [420, 360, 70]].map(([x, y, a]) => `<g transform="translate(${x} ${y}) rotate(${a})"><path d="M-30 0 Q0 -22 30 0 Q0 22 -30 0Z" fill="#3e9a55"/><path d="M-26 0 H26" stroke="#8fd08f" stroke-width="2.4"/></g>`).join('')}
  <path d="M306 330 L330 330 L346 650 L334 652Z" fill="#fff" opacity="0.5"/>
  ${Array.from({ length: 24 }, () => `<circle cx="${310 + r() * 180}" cy="${280 + r() * 360}" r="${2 + r() * 3}" fill="#fff" opacity="${(0.4 + r() * 0.4).toFixed(2)}"/>`).join('')}
  <rect x="440" y="120" width="22" height="240" rx="6" fill="#E4572E" transform="rotate(12 450 240)"/>
  <g transform="translate(330 252) rotate(-18)">
    <circle r="66" fill="#f5d547"/>
    <circle r="56" fill="#fbeb8c"/>
    ${Array.from({ length: 10 }, (_, i) => { const a = (i / 10) * Math.PI * 2; return `<path d="M0 0 L${Math.cos(a) * 50} ${Math.sin(a) * 50} A50 50 0 0 1 ${Math.cos(a + 0.56) * 50} ${Math.sin(a + 0.56) * 50}Z" fill="#f7df5e"/>`; }).join('')}
    <circle r="6" fill="#fff6c8"/>
  </g>
  <g transform="translate(480 262)">
    <path d="M0 0 Q-30 -40 -6 -70 Q20 -40 0 0Z" fill="#3e9a55"/>
    <path d="M6 0 Q40 -34 66 -16 Q40 10 6 0Z" fill="#4fae64"/>
  </g>
  ${grano}`;
}

/* ── Catálogo ────────────────────────────────────────────────── */

export const ILUSTRACIONES = {
  'rincon-clasica': () => hamburguesa({ doble: false }),
  'doble-bacon': () => hamburguesa({ doble: true, ajonjoli: false }),
  'papas-con-queso': papas,
  'alitas-bbq': alitas,
  'nachos-supremos': nachos,
  'pizza-pepperoni': () => pizza('pepperoni'),
  'pizza-margarita': () => pizza('margarita'),
  'fettuccine-alfredo': fettuccine,
  'lasana-de-la-casa': lasana,
  'volcan-de-chocolate': volcan,
  'cheesecake-de-fresa': cheesecake,
  'malteada': malteada,
  'limonada-con-menta': limonada,
};

const svg = (cuerpo) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">${cuerpo}</svg>`;

async function main() {
  const args = process.argv.slice(2);
  const hoja = args.includes('--hoja') ? args[args.indexOf('--hoja') + 1] : null;
  const destino = join(plataforma, 'public/demo/rincon502');
  mkdirSync(destino, { recursive: true });

  const pngs = [];
  for (const [id, dibujar] of Object.entries(ILUSTRACIONES)) {
    const buf = Buffer.from(svg(dibujar()));
    const img = sharp(buf, { density: 72 });
    const info = await img.clone().webp({ quality: 80, effort: 6 }).toFile(join(destino, `${id}.webp`));
    console.log(`${id}.webp`, `${Math.round(info.size / 1024)} KB`);
    if (hoja) pngs.push(await img.clone().resize(260, 260).png().toBuffer());
  }

  if (hoja) {
    const cols = 5;
    const filas = Math.ceil(pngs.length / cols);
    const lienzo = sharp({ create: { width: cols * 270, height: filas * 270, channels: 3, background: '#ffffff' } });
    await lienzo
      .composite(pngs.map((input, i) => ({ input, left: (i % cols) * 270 + 5, top: Math.floor(i / cols) * 270 + 5 })))
      .png()
      .toFile(hoja);
    console.log('hoja:', hoja);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exit(1); });
}

// Para depurar un solo platillo: escribe su SVG.
export function escribirSvg(id, ruta) {
  writeFileSync(ruta, svg(ILUSTRACIONES[id]()));
}
