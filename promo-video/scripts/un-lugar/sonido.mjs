// Banda sonora de «Un solo lugar», sintetizada con código (sin material de terceros).
//
//   node scripts/un-lugar/sonido.mjs
//
// Deja public/otra-vez/banda-un-lugar.wav (53,4 s, estéreo, 44,1 kHz), junto a
// las capturas que el video comparte con «Otra vez». El mapa de tiempos es el
// de src/un-lugar/guion.ts: 100 pulsos por minuto, un pulso = 18 cuadros.
//
//   0,0 s  ocho lugares: un golpe por pulso, cada vez más tenso
//   5,4 s  corte seco; los ocho se meten en uno
//   7,8 s  entra la música
//  47,4 s  acorde final y campana

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SR = 44100;
const PULSO = 0.6;
const DUR = 53.4;
const N = Math.ceil(DUR * SR);
const L = new Float32Array(N);
const R = new Float32Array(N);
// envío a la reverberación
const VL = new Float32Array(N);
const VR = new Float32Array(N);

// azar con semilla: el mismo archivo en cada corrida
let semilla = 502;
const azar = () => {
  semilla = (semilla * 1664525 + 1013904223) >>> 0;
  return semilla / 4294967296;
};
const ruido = () => azar() * 2 - 1;
const TAU = Math.PI * 2;
const nota = (n) => 440 * 2 ** ((n - 69) / 12);

function poner(t, dur, fn, { vol = 1, pan = 0, rev = 0 } = {}) {
  const i0 = Math.floor(t * SR);
  const n = Math.floor(dur * SR);
  const gl = vol * Math.cos(((pan + 1) * Math.PI) / 4);
  const gr = vol * Math.sin(((pan + 1) * Math.PI) / 4);
  for (let i = 0; i < n; i++) {
    const j = i0 + i;
    if (j < 0 || j >= N) continue;
    const s = fn(i / SR, i);
    L[j] += s * gl;
    R[j] += s * gr;
    if (rev) {
      VL[j] += s * gl * rev;
      VR[j] += s * gr * rev;
    }
  }
}

// ── instrumentos ──────────────────────────────────────────────────────────
const bombo = (t, vol = 1) => {
  let fase = 0;
  poner(t, 0.32, (x) => {
    const f = 46 + 95 * Math.exp(-x * 34);
    fase += (TAU * f) / SR;
    return Math.sin(fase) * Math.exp(-x * 9) + ruido() * 0.06 * Math.exp(-x * 220);
  }, { vol: 0.95 * vol });
};

const palmada = (t, vol = 1) => {
  let y = 0;
  let prev = 0;
  poner(t, 0.22, (x) => {
    const r = ruido();
    // paso de banda tosco alrededor de 1,5 kHz
    y = y * 0.72 + (r - prev) * 0.55;
    prev = r;
    const rafagas = Math.exp(-((x % 0.011) * 260)) * (x < 0.033 ? 1 : 0) + Math.exp(-(Math.max(0, x - 0.03)) * 26);
    return y * rafagas;
  }, { vol: 0.34 * vol, rev: 0.5, pan: 0.08 });
};

const platillo = (t, vol = 1, largo = 0.045) => {
  let prev = 0;
  poner(t, largo * 4, (x) => {
    const r = ruido();
    const s = r - prev;
    prev = r;
    return s * Math.exp(-x / largo);
  }, { vol: 0.1 * vol, pan: 0.25 });
};

const bajo = (t, n, dur, vol = 1) => {
  const f = nota(n);
  poner(t, dur, (x) => {
    const env = Math.min(1, x * 180) * Math.exp(-x * 2.6) * Math.min(1, (dur - x) * 60);
    return (Math.sin(TAU * f * x) + 0.28 * Math.sin(TAU * f * 2 * x + 0.4) + 0.1 * Math.sin(TAU * f * 3 * x)) * env;
  }, { vol: 0.42 * vol });
};

// piano eléctrico por FM, una voz por nota y un poco abierto en estéreo
const tecla = (t, n, dur, vol = 1, pan = 0) => {
  const f = nota(n);
  poner(t, dur, (x) => {
    const env = Math.min(1, x * 300) * Math.exp(-x * 2.2) * Math.min(1, (dur - x) * 30);
    const indice = 1.5 * Math.exp(-x * 7) + 0.22;
    return Math.sin(TAU * f * x + indice * Math.sin(TAU * f * x) + 0.5 * Math.exp(-x * 30) * Math.sin(TAU * f * 14 * x)) * env;
  }, { vol: 0.11 * vol, pan, rev: 0.55 });
};

const acorde = (t, notas, dur, vol = 1) => {
  notas.forEach((n, i) => tecla(t + i * 0.008, n, dur, vol, (i / (notas.length - 1)) * 1.1 - 0.55));
};

// campana de pedido: el «ding» de la marca
const campana = (t, n, vol = 1, pan = 0) => {
  const f = nota(n);
  poner(t, 1.6, (x) => {
    const env = Math.min(1, x * 900) * Math.exp(-x * 3.4);
    return (Math.sin(TAU * f * x + 2.4 * Math.exp(-x * 5) * Math.sin(TAU * f * 3.5 * x)) + 0.4 * Math.sin(TAU * f * 2 * x) * Math.exp(-x * 6)) * env;
  }, { vol: 0.2 * vol, pan, rev: 0.8 });
};

const punteo = (t, n, vol = 1, pan = 0) => {
  const f = nota(n);
  poner(t, 0.5, (x) => {
    const env = Math.min(1, x * 700) * Math.exp(-x * 9);
    return (Math.sin(TAU * f * x + 0.9 * Math.exp(-x * 18) * Math.sin(TAU * f * 2 * x))) * env;
  }, { vol: 0.13 * vol, pan, rev: 0.7 });
};

// ── 1. ocho lugares (0 – 5,4 s): uno por pulso, cada vez más tenso ─────────
const FIN_LUGARES = 5.4;
{
  // cada lugar cae con un golpe y una nota que no encaja con la anterior
  const NOTAS = [48, 54, 53, 59, 58, 64, 63, 69];
  for (let i = 0; i < 8; i++) {
    const t = i * PULSO;
    bombo(t, 0.55 + i * 0.06);
    tecla(t, NOTAS[i], 1.1, 1.5 + i * 0.12, i % 2 ? 0.4 : -0.4);
    tecla(t, NOTAS[i] + 6, 0.9, 0.7 + i * 0.1, i % 2 ? -0.4 : 0.4);
    // papel que cae
    poner(t, 0.12, (x) => ruido() * Math.exp(-x * 45), { vol: 0.16, pan: i % 2 ? 0.5 : -0.5 });
    // tic en el contratiempo, cada vez más fuerte
    poner(t + PULSO / 2, 0.05, (x) => Math.sin(TAU * 1800 * x) * Math.exp(-x * 160), { vol: 0.1 + i * 0.03, pan: i % 2 ? -0.3 : 0.3, rev: 0.3 });
    if (i >= 4) poner(t + PULSO * 0.75, 0.05, (x) => Math.sin(TAU * 2300 * x) * Math.exp(-x * 160), { vol: 0.08 + i * 0.02, rev: 0.3 });
  }
  // zumbido que sube
  let y = 0;
  poner(0, FIN_LUGARES, (x) => {
    const a = (x / FIN_LUGARES) ** 2;
    y = y * 0.985 + ruido() * 0.015;
    return (y * 5 + Math.sin(TAU * 55 * x) * (0.5 + 0.5 * Math.sin(TAU * (2 + 7 * a) * x)) * 0.45) * a;
  }, { vol: 0.42 });
}
// corte seco y una nota suspendida mientras se lee la pregunta
poner(FIN_LUGARES, 0.5, (x) => Math.sin(TAU * (70 * Math.exp(-x * 6) + 30) * x) * Math.exp(-x * 7) + ruido() * 0.25 * Math.exp(-x * 60), { vol: 0.9, rev: 0.4 });
poner(FIN_LUGARES + 0.25, 1.9, (x) => (Math.sin(TAU * nota(76) * x) + 0.5 * Math.sin(TAU * nota(83) * x)) * Math.min(1, x * 3) * Math.min(1, (1.9 - x) * 4), { vol: 0.04, rev: 1 });

// ── 2. los ocho se meten en uno (6,3 – 7,8 s) ─────────────────────────────
{
  // un punteo por cada lugar que entra, subiendo
  const SUBE = [60, 62, 64, 67, 69, 72, 74, 76];
  for (let i = 0; i < 8; i++) punteo(6.4 + i * 0.1, SUBE[i], 0.9 + i * 0.06, i % 2 ? 0.4 : -0.4);
  // aire que sube hasta el título
  let prev = 0;
  poner(6.2, 1.6, (x) => {
    const a = x / 1.6;
    const r = ruido();
    const s = r - prev * (1 - a * 0.8);
    prev = r;
    return s * a * a * Math.min(1, (1.6 - x) * 40);
  }, { vol: 0.16, rev: 0.5 });
}

// ── 3. la música (desde 7,8 s) ────────────────────────────────────────────
const T0 = 7.8;
const pulso = (b) => T0 + b * PULSO;
// Cmaj9 · Am9 · Fmaj9 · G6/9, cuatro pulsos cada uno
const ARMONIA = [
  { bajo: 36, notas: [60, 64, 67, 71, 74] },
  { bajo: 33, notas: [57, 60, 64, 67, 71] },
  { bajo: 29, notas: [57, 60, 64, 65, 69] },
  { bajo: 31, notas: [59, 62, 64, 67, 69] },
];
const PENTA = [72, 74, 76, 79, 81, 84];

// pulsos: título 0-4 · tres negocios 4-40 · cocina, caja y ventas 40-58 · además 58-66 · cierre 66-76
const P_PASOS = 4;
const P_CENTRO = 40;
const P_ADEMAS = 58;
const P_CIERRE = 66;

for (let b = 0; b < P_CIERRE; b++) {
  const a = ARMONIA[Math.floor(b / 4) % 4];
  const enCompas = b % 4;
  const lleno = b >= P_PASOS;
  // teclas: en el 1 y en el «y» del 2, con respuesta suave en el 4
  if (enCompas === 0) acorde(pulso(b), a.notas, 1.5, 1);
  if (enCompas === 1) acorde(pulso(b + 0.5), a.notas.slice(1), 0.9, 0.7);
  if (enCompas === 3) acorde(pulso(b), a.notas.slice(2), 0.5, 0.5);
  // bajo
  if (enCompas === 0) bajo(pulso(b), a.bajo, 0.85);
  if (enCompas === 1) bajo(pulso(b + 0.5), a.bajo, 0.4, 0.8);
  if (enCompas === 2) bajo(pulso(b + 0.5), a.bajo + 12, 0.25, 0.6);
  if (enCompas === 3) bajo(pulso(b), a.bajo + 7, 0.5, 0.8);
  // batería
  platillo(pulso(b + 0.5), lleno ? 1 : 0.6);
  if (lleno) {
    bombo(pulso(b));
    if (enCompas === 1 || enCompas === 3) palmada(pulso(b));
    platillo(pulso(b + 0.25), 0.35, 0.02);
    platillo(pulso(b + 0.75), 0.45, 0.02);
  }
}
// campana al empezar cada tramo y al entrar el título
campana(pulso(0), 84, 0.9);
for (let p = 0; p < 3; p++) campana(pulso(P_PASOS + p * 12), [79, 81, 84][p], 0.75, p % 2 ? 0.3 : -0.3);
for (let p = 0; p < 3; p++) campana(pulso(P_CENTRO + p * 6), [86, 88, 91][p], 0.7, p % 2 ? -0.3 : 0.3);
// punteo pentatónico que crece en «además»
for (let b = P_ADEMAS; b < P_CIERRE; b += 0.5) {
  const k = Math.round((b - P_ADEMAS) * 2);
  punteo(pulso(b), PENTA[[0, 2, 3, 1, 4, 3, 5, 2][k % 8]] , 0.7 + 0.03 * k, k % 2 ? 0.5 : -0.5);
}
// redoble corto antes del cierre
for (let k = 0; k < 6; k++) palmada(pulso(P_CIERRE - 1 + k / 6), 0.35 + k * 0.1);
// cierre: acorde final que se queda sonando y la campana de la marca
bombo(pulso(P_CIERRE), 1.1);
acorde(pulso(P_CIERRE), [60, 64, 67, 71, 74, 79], 5.5, 1.5);
bajo(pulso(P_CIERRE), 36, 3.5, 1.1);
campana(pulso(P_CIERRE), 84, 1.1);
campana(pulso(P_CIERRE + 0.5), 91, 0.7, 0.3);
campana(pulso(P_CIERRE + 4), 96, 0.5, -0.2);

// ── reverberación (Schroeder sencilla) y mezcla ───────────────────────────
function reverberar(entrada, retardos) {
  const salida = new Float32Array(N);
  for (const [ms, g] of retardos) {
    const d = Math.floor((ms / 1000) * SR);
    const buf = new Float32Array(N);
    let lp = 0;
    for (let i = 0; i < N; i++) {
      const atras = i >= d ? buf[i - d] : 0;
      lp = lp * 0.55 + atras * 0.45;
      buf[i] = entrada[i] + lp * g;
      salida[i] += atras;
    }
  }
  return salida;
}
const revL = reverberar(VL, [[29.7, 0.78], [37.1, 0.76], [41.1, 0.74], [43.7, 0.72]]);
const revR = reverberar(VR, [[30.9, 0.78], [36.3, 0.76], [40.3, 0.74], [44.9, 0.72]]);

const pcm = Buffer.alloc(N * 4);
const FUNDIDO = 1.2 * SR;
for (let i = 0; i < N; i++) {
  const fin = Math.min(1, (N - i) / FUNDIDO);
  const l = Math.tanh((L[i] + revL[i] * 0.16) * 1.25) * 0.9 * fin;
  const r = Math.tanh((R[i] + revR[i] * 0.16) * 1.25) * 0.9 * fin;
  pcm.writeInt16LE(Math.round(l * 32767), i * 4);
  pcm.writeInt16LE(Math.round(r * 32767), i * 4 + 2);
}
const cab = Buffer.alloc(44);
cab.write('RIFF', 0);
cab.writeUInt32LE(36 + pcm.length, 4);
cab.write('WAVEfmt ', 8);
cab.writeUInt32LE(16, 16);
cab.writeUInt16LE(1, 20);
cab.writeUInt16LE(2, 22);
cab.writeUInt32LE(SR, 24);
cab.writeUInt32LE(SR * 4, 28);
cab.writeUInt16LE(4, 32);
cab.writeUInt16LE(16, 34);
cab.write('data', 36);
cab.writeUInt32LE(pcm.length, 40);

const destino = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'public', 'otra-vez');
mkdirSync(destino, { recursive: true });
writeFileSync(join(destino, 'banda-un-lugar.wav'), Buffer.concat([cab, pcm]));
console.log(`banda-un-lugar.wav · ${DUR} s`);
