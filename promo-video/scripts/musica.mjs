// Banda sonora y efectos del video, sintetizados con código.
// No usa muestras ni grabaciones de nadie: cada nota es una suma de senos
// con caída exponencial (timbre de marimba). Así no hay derechos de autor
// de terceros. Escribe WAV de 16 bits en public/audio/.
//
//   node scripts/musica.mjs            → genera todo
//
// Para usar otra pista, pon tu archivo en public/audio/ y cambia la prop
// `musica` de la composición (ver src/datos.ts).

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SR = 44100;
const raiz = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'audio');
mkdirSync(raiz, { recursive: true });

// ── utilidades ───────────────────────────────────────────────────────────
function lienzo(segundos) {
  const n = Math.ceil(segundos * SR);
  return { L: new Float32Array(n), R: new Float32Array(n), n };
}
// Generador pseudoaleatorio fijo: el WAV sale idéntico en cada corrida.
let semilla = 502;
function azar() {
  semilla = (semilla * 1664525 + 1013904223) % 4294967296;
  return semilla / 4294967296;
}
const nota = (n) => 440 * Math.pow(2, (n - 69) / 12); // MIDI → Hz

function sumar(c, t0, muestras, pan = 0) {
  const i0 = Math.round(t0 * SR);
  const gl = Math.cos(((pan + 1) * Math.PI) / 4);
  const gr = Math.sin(((pan + 1) * Math.PI) / 4);
  for (let i = 0; i < muestras.length; i++) {
    const k = i0 + i;
    if (k < 0 || k >= c.n) continue;
    c.L[k] += muestras[i] * gl;
    c.R[k] += muestras[i] * gr;
  }
}

function marimba(f, vel = 1, largo = null) {
  const caida = largo ?? Math.max(0.18, Math.min(1.4, 120 / f));
  const dur = caida * 5;
  const n = Math.ceil(dur * SR);
  const out = new Float32Array(n);
  const parciales = [
    [1, 1, 1],
    [3.93, 0.32, 0.35],
    [9.2, 0.07, 0.15],
  ];
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const ataque = Math.min(1, t / 0.002);
    let s = 0;
    for (const [m, a, d] of parciales) s += a * Math.exp(-t / (caida * d)) * Math.sin(2 * Math.PI * f * m * t);
    // golpe del mazo
    s += 0.25 * Math.exp(-t / 0.004) * (azar() * 2 - 1);
    out[i] = s * ataque * vel * 0.32;
  }
  return out;
}

function shaker(vel = 1) {
  const n = Math.ceil(0.06 * SR);
  const out = new Float32Array(n);
  let prev = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const r = azar() * 2 - 1;
    const hp = r - prev; // paso alto barato
    prev = r;
    out[i] = hp * Math.exp(-t / 0.018) * vel * 0.05;
  }
  return out;
}

function latido(vel = 1) {
  const n = Math.ceil(0.35 * SR);
  const out = new Float32Array(n);
  let fase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const f = 48 + 60 * Math.exp(-t / 0.04);
    fase += (2 * Math.PI * f) / SR;
    out[i] = Math.sin(fase) * Math.exp(-t / 0.11) * vel * 0.9;
  }
  return out;
}

function tic(vel = 1, f = 2400) {
  const n = Math.ceil(0.03 * SR);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    out[i] = Math.sin(2 * Math.PI * f * t) * Math.exp(-t / 0.004) * vel * 0.35;
  }
  return out;
}

function campana(f, vel = 1, caida = 1.1) {
  const n = Math.ceil(caida * 4 * SR);
  const out = new Float32Array(n);
  const p = [
    [1, 1, 1],
    [2.76, 0.5, 0.6],
    [5.4, 0.25, 0.35],
    [8.93, 0.12, 0.2],
  ];
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    let s = 0;
    for (const [m, a, d] of p) s += a * Math.exp(-t / (caida * d)) * Math.sin(2 * Math.PI * f * m * t);
    out[i] = s * Math.min(1, t / 0.001) * vel * 0.28;
  }
  return out;
}

function pop(vel = 1) {
  const n = Math.ceil(0.09 * SR);
  const out = new Float32Array(n);
  let fase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const f = 620 + 520 * (t / 0.09);
    fase += (2 * Math.PI * f) / SR;
    out[i] = Math.sin(fase) * Math.exp(-t / 0.03) * Math.min(1, t / 0.002) * vel * 0.5;
  }
  return out;
}

function sello(vel = 1) {
  const n = Math.ceil(0.4 * SR);
  const out = new Float32Array(n);
  let fase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const f = 70 + 90 * Math.exp(-t / 0.03);
    fase += (2 * Math.PI * f) / SR;
    out[i] = (Math.sin(fase) * Math.exp(-t / 0.12) + 0.5 * (azar() * 2 - 1) * Math.exp(-t / 0.015)) * vel * 0.8;
  }
  return out;
}

function barrido(vel = 1, dur = 0.45) {
  const n = Math.ceil(dur * SR);
  const out = new Float32Array(n);
  let lp = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const env = Math.sin(Math.PI * Math.min(1, t / dur)) ** 2;
    const k = 0.02 + 0.5 * (t / dur);
    lp += k * ((azar() * 2 - 1) - lp);
    out[i] = lp * env * vel * 0.6;
  }
  return out;
}

function escribirWav(nombre, c) {
  // limitador suave y normalización a -1 dBFS
  let pico = 0;
  for (let i = 0; i < c.n; i++) pico = Math.max(pico, Math.abs(c.L[i]), Math.abs(c.R[i]));
  const g = pico > 0 ? 0.89 / Math.tanh(pico) : 1;
  const datos = Buffer.alloc(44 + c.n * 4);
  datos.write('RIFF', 0);
  datos.writeUInt32LE(36 + c.n * 4, 4);
  datos.write('WAVEfmt ', 8);
  datos.writeUInt32LE(16, 16);
  datos.writeUInt16LE(1, 20);
  datos.writeUInt16LE(2, 22);
  datos.writeUInt32LE(SR, 24);
  datos.writeUInt32LE(SR * 4, 28);
  datos.writeUInt16LE(4, 32);
  datos.writeUInt16LE(16, 34);
  datos.write('data', 36);
  datos.writeUInt32LE(c.n * 4, 40);
  for (let i = 0; i < c.n; i++) {
    const l = Math.max(-1, Math.min(1, Math.tanh(c.L[i]) * g));
    const r = Math.max(-1, Math.min(1, Math.tanh(c.R[i]) * g));
    datos.writeInt16LE(Math.round(l * 32767), 44 + i * 4);
    datos.writeInt16LE(Math.round(r * 32767), 46 + i * 4);
  }
  writeFileSync(join(raiz, nombre), datos);
  console.log('escrito', join('public', 'audio', nombre), `${(c.n / SR).toFixed(2)} s`);
}

// ── la pista: 40 s a 120 BPM (un pulso = 0.5 s = 15 cuadros) ─────────────
// 0–3 s gancho (latido + reloj) · 3–8 s caos · 8–35 s marimba en Sol mayor
// · 35–40 s acorde final con trémolo, como cierra una marimba de verdad.
const DUR = 40;
const BEAT = 0.5;
const c = lienzo(DUR + 1.5);

// gancho: latido en cada pulso y reloj en cada medio pulso
for (let t = 0; t < 3; t += BEAT) {
  sumar(c, t, latido(t < 1 ? 0.7 : 1));
  sumar(c, t + BEAT / 2, tic(0.5));
  sumar(c, t, tic(0.8, 1800));
}
// caos: semicorcheas nerviosas en segundas menores, cada vez más
const caos = [62, 63, 61, 64, 62, 66, 65, 63];
for (let t = 3, i = 0; t < 8; t += BEAT / 4, i++) {
  const v = 0.35 + 0.5 * ((t - 3) / 5);
  sumar(c, t, marimba(nota(caos[i % caos.length] + (i % 16 > 11 ? 12 : 0)), v, 0.12), (azar() - 0.5) * 1.2);
  if (i % 4 === 0) sumar(c, t, latido(0.6));
  if (i % 2 === 0) sumar(c, t, tic(0.35, 3000));
}

// groove: Sol – Re – Mim – Do (una medida de 2 s por acorde)
const acordes = [
  { bajo: 43, notas: [67, 71, 74, 79] }, // G
  { bajo: 38, notas: [66, 69, 74, 78] }, // D
  { bajo: 40, notas: [67, 71, 76, 79] }, // Em
  { bajo: 36, notas: [64, 67, 72, 76] }, // C
];
// figura de arpegio sincopada (en corcheas, 8 por medida)
const figura = [0, 2, 1, 3, 2, 1, 3, 2];
const acentos = [1, 0.55, 0.8, 0.6, 0.9, 0.55, 0.85, 0.6];
// contramelodía (entra en la prueba, 25 s)
const melodia = [79, null, 78, 76, null, 74, 76, null, 79, null, 81, 79, null, 76, 74, null];

for (let t = 8, compas = 0; t < 35 - 1e-6; t += 4 * BEAT, compas++) {
  const a = acordes[compas % 4];
  const subir = t >= 25 ? 1.12 : 1;
  sumar(c, t, marimba(nota(a.bajo), 1.1 * subir, 1.2), -0.2);
  sumar(c, t + 2 * BEAT, marimba(nota(a.bajo + 7), 0.8 * subir, 0.9), -0.2);
  sumar(c, t + 3.5 * BEAT, marimba(nota(a.bajo + 12), 0.55, 0.5), -0.2);
  for (let k = 0; k < 8; k++) {
    const tt = t + k * (BEAT / 2);
    if (tt >= 35) break;
    sumar(c, tt, marimba(nota(a.notas[figura[k]]), 0.55 * acentos[k] * subir), 0.35);
    sumar(c, tt, shaker(k % 2 ? 0.7 : 1));
  }
  if (t >= 25) {
    for (let k = 0; k < 8; k++) {
      const m = melodia[((compas * 8) + k) % melodia.length];
      if (m == null) continue;
      sumar(c, t + k * (BEAT / 2), marimba(nota(m + 12), 0.42, 0.35), 0.6);
    }
  }
}

// final: acorde de Sol con trémolo (redoble de marimba) que se apaga
const finalNotas = [55, 67, 71, 74, 79, 83];
for (let t = 35; t < 39.2; t += 1 / 16) {
  const env = t < 35.4 ? (t - 35) / 0.4 : Math.exp(-(t - 35.4) / 1.6);
  for (const [j, n] of finalNotas.entries()) {
    sumar(c, t + j * 0.004, marimba(nota(n), 0.22 * env, 0.3), (j / finalNotas.length - 0.5) * 1.2);
  }
}
sumar(c, 35, marimba(nota(31), 1.2, 2.2), 0);
sumar(c, 35, campana(nota(91), 0.35, 1.6), 0.3);

escribirWav('musica.wav', c);

// ── efectos sueltos (la composición los coloca en su cuadro) ─────────────
function suelto(nombre, muestras, dur) {
  const s = lienzo(dur);
  sumar(s, 0, muestras);
  escribirWav(nombre, s);
}
// «ding» de pedido nuevo: dos golpes de campana, como un timbre de mostrador
{
  const s = lienzo(2.2);
  sumar(s, 0, campana(nota(88), 1, 1.0));
  sumar(s, 0.14, campana(nota(93), 0.9, 1.2));
  escribirWav('ding.wav', s);
}
suelto('pop.wav', pop(), 0.15);
suelto('sello.wav', sello(), 0.5);
suelto('barrido.wav', barrido(), 0.5);
suelto('tic.wav', tic(1, 2200), 0.05);
