// Banda sonora de «Otra vez», sintetizada con código (sin material de terceros).
//
//   node scripts/otra-vez/sonido.mjs
//
// Deja public/otra-vez/banda.wav (45,6 s, estéreo, 44,1 kHz). El mapa de
// tiempos es el mismo de src/otra-vez/tiempos.ts: 100 pulsos por minuto,
// un pulso = 18 cuadros a 30 fps.
//
//   0,0 s  el caos: tic-tac que se acelera, avisos que se amontonan, ruido que sube
//   5,4 s  corte seco y silencio
//   7,2 s  la cinta se rebobina
//   8,4 s  entra la música: el mismo sábado, en orden
//  39,6 s  acorde final y campana

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SR = 44100;
const PULSO = 0.6;
const DUR = 45.6;
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

// ── 1. el caos (0 – 5,4 s) ────────────────────────────────────────────────
const FIN_CAOS = 5.4;
// tic-tac que se acelera
{
  let t = 0;
  let paso = 0.5;
  let lado = 0;
  while (t < FIN_CAOS - 0.05) {
    const agudo = lado % 2 === 0;
    poner(t, 0.05, (x) => Math.sin(TAU * (agudo ? 2100 : 1500) * x) * Math.exp(-x * 160) + ruido() * 0.3 * Math.exp(-x * 500), { vol: 0.32, pan: agudo ? -0.3 : 0.3, rev: 0.3 });
    t += paso;
    paso = Math.max(0.085, paso * 0.9);
    lado++;
  }
}
// avisos de teléfono que se amontonan, cada vez más seguidos y más desafinados
{
  let t = 0.35;
  let k = 0;
  while (t < FIN_CAOS - 0.1) {
    const avance = t / FIN_CAOS;
    const base = [88, 91, 86, 93, 84, 95][k % 6] + (azar() - 0.5) * avance * 3;
    const f1 = nota(base);
    const f2 = nota(base + 5);
    poner(t, 0.3, (x) => (x < 0.09 ? Math.sin(TAU * f1 * x) : Math.sin(TAU * f2 * x)) * Math.exp(-x * 11) * Math.min(1, x * 500), { vol: 0.1 + avance * 0.1, pan: azar() * 1.6 - 0.8, rev: 0.6 });
    t += Math.max(0.07, 0.62 * (1 - avance) ** 1.5 + 0.06);
    k++;
  }
}
// zumbido grave y ruido que sube
{
  let y = 0;
  poner(0, FIN_CAOS, (x) => {
    const a = (x / FIN_CAOS) ** 2.2;
    y = y * 0.985 + ruido() * 0.015;
    const grave = Math.sin(TAU * 55 * x) * (0.5 + 0.5 * Math.sin(TAU * (2 + 9 * a) * x)) * 0.5;
    const subida = Math.sin(TAU * (180 + 900 * a * a) * x + 3 * Math.sin(TAU * 7 * x)) * 0.12 * a;
    return (y * 6 + grave + subida) * a;
  }, { vol: 0.5 });
}
// latido que se acelera
{
  let t = 0.2;
  let paso = 0.8;
  while (t < FIN_CAOS - 0.1) {
    bombo(t, 0.45 + 0.4 * (t / FIN_CAOS));
    t += paso;
    paso = Math.max(0.2, paso * 0.86);
  }
}
// corte seco
poner(FIN_CAOS, 0.5, (x) => Math.sin(TAU * (70 * Math.exp(-x * 6) + 30) * x) * Math.exp(-x * 7) + ruido() * 0.25 * Math.exp(-x * 60), { vol: 0.95, rev: 0.4 });
// una sola nota suspendida mientras se lee la pregunta
poner(FIN_CAOS + 0.25, 1.7, (x) => (Math.sin(TAU * nota(76) * x) + 0.5 * Math.sin(TAU * nota(83) * x + Math.sin(TAU * 5 * x) * 0.1)) * Math.min(1, x * 3) * Math.min(1, (1.7 - x) * 4), { vol: 0.045, rev: 1 });

// ── 2. la cinta se rebobina (7,2 – 8,4 s) ─────────────────────────────────
{
  const d = 1.2;
  let fase = 0;
  let y = 0;
  poner(7.2, d, (x) => {
    const a = x / d;
    const f = 220 * 2 ** (a * 3.1) * (1 + 0.03 * Math.sin(TAU * 31 * x));
    fase += (TAU * f) / SR;
    y = y * 0.6 + ruido() * 0.4;
    const cinta = (2 * ((fase / TAU) % 1) - 1) * 0.22 + Math.sin(fase * 0.5) * 0.25;
    const aleteo = 0.55 + 0.45 * Math.sin(TAU * (18 + 30 * a) * x);
    return (cinta * aleteo + y * 0.35 * a) * Math.min(1, x * 25) * Math.min(1, (d - x) * 60);
  }, { vol: 0.34, rev: 0.3 });
  // clic de la casetera al parar
  poner(8.38, 0.06, (x) => ruido() * Math.exp(-x * 120), { vol: 0.5 });
}

// ── 3. la música (desde 8,4 s) ────────────────────────────────────────────
const T0 = 8.4;
const pulso = (b) => T0 + b * PULSO;
// Cmaj9 · Am9 · Fmaj9 · G6/9, cuatro pulsos cada uno
const ARMONIA = [
  { bajo: 36, notas: [60, 64, 67, 71, 74] },
  { bajo: 33, notas: [57, 60, 64, 67, 71] },
  { bajo: 29, notas: [57, 60, 64, 65, 69] },
  { bajo: 31, notas: [59, 62, 64, 67, 69] },
];
const PENTA = [72, 74, 76, 79, 81, 84];

// pulsos: título 0-4 · pasos 4-44 · además 44-52 · cierre 52-62
const P_PASOS = 4;
const P_ADEMAS = 44;
const P_CIERRE = 52;

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
// campana al empezar cada paso (cada 8 pulsos) y al entrar el título
campana(pulso(0), 84, 0.9);
for (let p = 0; p < 5; p++) campana(pulso(P_PASOS + p * 8), [79, 81, 84, 81, 88][p], 0.75, p % 2 ? 0.3 : -0.3);
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
writeFileSync(join(destino, 'banda.wav'), Buffer.concat([cab, pcm]));
console.log(`banda.wav · ${DUR} s`);
