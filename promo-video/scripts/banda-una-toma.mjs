// Banda sonora de «Una sola toma»: latin house a 120 BPM + efectos, todo
// sintetizado con código (sin muestras ni grabaciones de terceros).
// Lee la línea de tiempo de src/una-toma/tiempos.json, así que cada toque,
// campana y golpe cae en el mismo cuadro que el video.
//
//   node scripts/banda-una-toma.mjs   → public/una-toma/banda.wav

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const T = JSON.parse(readFileSync(join(RAIZ, 'src', 'una-toma', 'tiempos.json'), 'utf8'));
const SR = 44100;
const DUR = T.total / T.fps;
const N = Math.ceil(DUR * SR);
const seg = (cuadro) => cuadro / T.fps;
const TIEMPO = 0.5; // 120 BPM
const DROP = seg(T.drop);

// Pistas: lo que pasa por la reverb y lo que no, y la bomba (sidechain).
const seco = { L: new Float32Array(N), R: new Float32Array(N) };
const envio = { L: new Float32Array(N), R: new Float32Array(N) };
const musica = { L: new Float32Array(N), R: new Float32Array(N) }; // se «agacha» con el bombo

let semilla = 502;
const azar = () => ((semilla = (semilla * 1664525 + 1013904223) % 4294967296) / 4294967296) * 2 - 1;
const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);

function sumar(bus, t0, s, { pan = 0, gan = 1, rev = 0 } = {}) {
  const i0 = Math.round(t0 * SR);
  const gl = Math.cos(((pan + 1) * Math.PI) / 4) * gan;
  const gr = Math.sin(((pan + 1) * Math.PI) / 4) * gan;
  for (let i = 0; i < s.length; i++) {
    const k = i0 + i;
    if (k < 0 || k >= N) continue;
    bus.L[k] += s[i] * gl;
    bus.R[k] += s[i] * gr;
    if (rev) {
      envio.L[k] += s[i] * gl * rev;
      envio.R[k] += s[i] * gr * rev;
    }
  }
}
const buf = (seg) => new Float32Array(Math.ceil(seg * SR));

// Filtro de un polo (paso bajo) y paso alto derivado.
function pasoBajo(s, fc) {
  const a = Math.exp((-2 * Math.PI * fc) / SR);
  let y = 0;
  for (let i = 0; i < s.length; i++) s[i] = y = (1 - a) * s[i] + a * y;
  return s;
}
function pasoAlto(s, fc) {
  const a = Math.exp((-2 * Math.PI * fc) / SR);
  let y = 0, xa = 0;
  for (let i = 0; i < s.length; i++) {
    const x = s[i];
    y = a * (y + x - xa);
    xa = x;
    s[i] = y;
  }
  return s;
}
// Paso banda de 2.º orden (RBJ).
function banda(s, f0, q = 2) {
  const w = (2 * Math.PI * f0) / SR, al = Math.sin(w) / (2 * q);
  const b0 = al, b2 = -al, a0 = 1 + al, a1 = -2 * Math.cos(w), a2 = 1 - al;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < s.length; i++) {
    const x = s[i];
    const y = (b0 * x + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    s[i] = y;
  }
  return s;
}

// ── instrumentos ─────────────────────────────────────────────────────────
function bombo(vel = 1) {
  const s = buf(0.45);
  let fase = 0;
  for (let i = 0; i < s.length; i++) {
    const t = i / SR;
    const f = 46 + 110 * Math.exp(-t / 0.03);
    fase += (2 * Math.PI * f) / SR;
    s[i] = vel * (Math.sin(fase) * Math.exp(-t / 0.22) + 0.35 * Math.exp(-t / 0.002) * azar());
  }
  return s;
}
function palmas(vel = 1) {
  const s = buf(0.3);
  for (let i = 0; i < s.length; i++) {
    const t = i / SR;
    let env = 0;
    for (const d of [0, 0.009, 0.018]) if (t >= d) env = Math.max(env, Math.exp(-(t - d) / (d === 0.018 ? 0.06 : 0.006)));
    s[i] = azar() * env * vel;
  }
  return banda(s, 1400, 0.9);
}
function platillo(vel = 1, largo = 0.05) {
  const s = buf(largo * 6);
  for (let i = 0; i < s.length; i++) s[i] = azar() * Math.exp(-(i / SR) / largo) * vel;
  return pasoAlto(s, 7000);
}
function shaker(vel = 1) {
  const s = buf(0.08);
  for (let i = 0; i < s.length; i++) {
    const t = i / SR;
    s[i] = azar() * vel * Math.min(1, t / 0.012) * Math.exp(-t / 0.025);
  }
  return pasoAlto(s, 5000);
}
// Conga/bongó: membrana afinada con golpe.
function conga(f, vel = 1, abierta = true) {
  const s = buf(0.4);
  let fase = 0;
  for (let i = 0; i < s.length; i++) {
    const t = i / SR;
    const ff = f * (1 + 0.25 * Math.exp(-t / 0.012));
    fase += (2 * Math.PI * ff) / SR;
    s[i] = vel * (Math.sin(fase) * Math.exp(-t / (abierta ? 0.12 : 0.035)) + 0.25 * azar() * Math.exp(-t / 0.003));
  }
  return s;
}
// Bajo: sierra filtrada + senoidal grave.
function bajo(m, dur, vel = 1) {
  const s = buf(dur + 0.05);
  const f = hz(m);
  let fs = 0, fz = 0;
  for (let i = 0; i < s.length; i++) {
    const t = i / SR;
    fs += f / SR; fz += (2 * Math.PI * f) / SR;
    const saw = 2 * (fs - Math.floor(fs + 0.5));
    const env = Math.min(1, t / 0.004) * (t < dur ? 1 : Math.exp(-(t - dur) / 0.01)) * Math.exp(-t / 0.6);
    s[i] = vel * env * (0.55 * Math.sin(fz) + 0.45 * saw);
  }
  return pasoBajo(s, 520);
}
// Cuerda pulsada (Karplus-Strong): da el «rasgueo» latino de los acordes.
function cuerda(m, vel = 1, dur = 1.2, brillo = 0.5) {
  const f = hz(m);
  const p = Math.max(2, Math.round(SR / f));
  const linea = new Float32Array(p);
  for (let i = 0; i < p; i++) linea[i] = azar();
  pasoBajo(linea, 2000 + 6000 * brillo);
  const s = buf(dur);
  let idx = 0, prev = 0;
  const caida = 0.996;
  for (let i = 0; i < s.length; i++) {
    const v = linea[idx];
    const nuevo = caida * 0.5 * (v + prev);
    prev = v;
    linea[idx] = nuevo;
    idx = (idx + 1) % p;
    const t = i / SR;
    s[i] = v * vel * Math.min(1, (dur - t) / 0.05);
  }
  return s;
}
// Colchón: sierras desafinadas, filtradas.
function colchon(notas, dur, vel = 1) {
  const s = buf(dur);
  const fases = [];
  for (const m of notas) for (const d of [-0.07, 0, 0.07]) fases.push({ f: hz(m + d), ph: (azar() + 1) / 2 });
  for (let i = 0; i < s.length; i++) {
    const t = i / SR;
    let v = 0;
    for (const o of fases) {
      o.ph += o.f / SR;
      v += 2 * (o.ph - Math.floor(o.ph + 0.5));
    }
    const env = Math.min(1, t / 0.4) * Math.min(1, (dur - t) / 0.6);
    s[i] = (v / fases.length) * env * vel;
  }
  return pasoBajo(pasoBajo(s, 1800), 2400);
}
// Campana (FM): para la cocina, el éxito y el cierre.
function campana(m, vel = 1, caida = 1.2) {
  const s = buf(caida * 4);
  const f = hz(m);
  for (let i = 0; i < s.length; i++) {
    const t = i / SR;
    const mod = 2.2 * Math.exp(-t / 0.25) * Math.sin(2 * Math.PI * f * 3.5 * t);
    s[i] = vel * Math.min(1, t / 0.002) * Math.exp(-t / caida) * Math.sin(2 * Math.PI * f * t + mod);
  }
  return s;
}
function toque(vel = 1) {
  const s = buf(0.05);
  for (let i = 0; i < s.length; i++) {
    const t = i / SR;
    s[i] = vel * (Math.sin(2 * Math.PI * 1900 * t) * Math.exp(-t / 0.006) + 0.4 * azar() * Math.exp(-t / 0.002));
  }
  return s;
}
function tecla(vel = 1) {
  const s = buf(0.03);
  for (let i = 0; i < s.length; i++) s[i] = vel * azar() * Math.exp(-(i / SR) / 0.004);
  return banda(s, 3200, 1.5);
}
function golpe(vel = 1, largo = 1.6) {
  const s = buf(largo);
  let fase = 0;
  for (let i = 0; i < s.length; i++) {
    const t = i / SR;
    const f = 34 + 90 * Math.exp(-t / 0.06);
    fase += (2 * Math.PI * f) / SR;
    s[i] = vel * (Math.sin(fase) * Math.exp(-t / 0.5) + 0.6 * azar() * Math.exp(-t / 0.05));
  }
  return s;
}
function zumbido(dur, vel = 1, de = 300, a = 4000) {
  // Barrido de ruido (whoosh/riser): banda que sube.
  const s = buf(dur);
  const out = buf(dur);
  for (let i = 0; i < s.length; i++) s[i] = azar();
  const bloques = 40;
  const largo = Math.ceil(s.length / bloques);
  for (let b = 0; b < bloques; b++) {
    const trozo = s.slice(b * largo, (b + 1) * largo);
    const fc = de * Math.pow(a / de, b / (bloques - 1));
    banda(trozo, fc, 1.2);
    out.set(trozo, b * largo);
  }
  for (let i = 0; i < out.length; i++) {
    const x = i / out.length;
    out[i] *= vel * Math.sin(Math.PI * Math.min(1, x * 1.15)) ** 2;
  }
  return out;
}
function riser(dur, vel = 1) {
  const s = zumbido(dur, vel, 400, 9000);
  for (let i = 0; i < s.length; i++) s[i] *= Math.pow(i / s.length, 1.6) * 1.6;
  return s;
}
function rasgon(vel = 1) {
  // Papel que se rompe: ruido con crujidos irregulares.
  const s = buf(0.5);
  for (let i = 0; i < s.length; i++) {
    const t = i / SR;
    const cruje = Math.abs(Math.sin(t * 410 + Math.sin(t * 77) * 6)) > 0.93 ? 1 : 0.35;
    s[i] = vel * azar() * cruje * Math.min(1, t / 0.01) * Math.exp(-t / 0.22);
  }
  return pasoAlto(s, 900);
}
function garabato(dur, vel = 1) {
  // Lápiz sobre papel.
  const s = buf(dur);
  for (let i = 0; i < s.length; i++) {
    const t = i / SR;
    const trazo = 0.5 + 0.5 * Math.sin(2 * Math.PI * 9 * t + Math.sin(2 * Math.PI * 3 * t) * 2);
    s[i] = vel * azar() * trazo * Math.min(1, t / 0.02) * Math.min(1, (dur - t) / 0.03);
  }
  return banda(s, 3800, 0.8);
}
function marcador(dur, vel = 1) {
  const s = buf(dur);
  let fase = 0;
  for (let i = 0; i < s.length; i++) {
    const t = i / SR;
    const f = 1500 + 900 * Math.sin((2 * Math.PI * t) / dur);
    fase += (2 * Math.PI * f) / SR;
    s[i] = vel * (0.25 * Math.sin(fase) + azar() * 0.5) * Math.sin((Math.PI * t) / dur);
  }
  return banda(s, 2200, 1.2);
}
function chispazo(vel = 1) {
  const s = buf(0.9);
  let fase = 0;
  for (let i = 0; i < s.length; i++) {
    const t = i / SR;
    fase += (2 * Math.PI * (1200 + 2400 * t)) / SR;
    s[i] = vel * Math.min(1, t / 0.01) * Math.exp(-t / 0.35) * (0.4 * Math.sin(fase) + 0.3 * Math.sin(fase * 2.01) + 0.15 * azar());
  }
  return s;
}

// ── arreglo ──────────────────────────────────────────────────────────────
// Acordes por compás (2 s): La m · Fa · Do · Sol (raíces MIDI y triadas).
const PROG = [
  { r: 45, t: [57, 60, 64] },
  { r: 41, t: [57, 60, 65] },
  { r: 48, t: [55, 60, 64] },
  { r: 43, t: [55, 59, 62] },
];
const RUPTURA = [seg(T.revela.inicio), seg(T.revela.golpe)]; // sin batería
const FIN = seg(T.cierre.inicio);
const conBateria = (t) => t >= DROP && t < FIN && !(t >= RUPTURA[0] && t < RUPTURA[1]);

const bomboPos = [];
for (let b = 0; t(b) < FIN; b++) {
  const tb = DROP + b * TIEMPO;
  const comp = Math.floor(b / 4);
  const acorde = PROG[comp % 4];
  if (conBateria(tb)) {
    sumar(seco, tb, bombo(0.95));
    bomboPos.push(tb);
    if (b % 2 === 1) sumar(seco, tb, palmas(0.5), { rev: 0.25 });
    sumar(seco, tb + TIEMPO / 2, platillo(0.22, 0.07), { pan: 0.2 });
    for (let k = 0; k < 4; k++) sumar(seco, tb + (k * TIEMPO) / 4, shaker(k % 2 ? 0.1 : 0.16), { pan: -0.35 });
    // Bajo en el contratiempo (house) con cambio de octava.
    sumar(musica, tb + TIEMPO / 2, bajo(acorde.r + (b % 4 === 3 ? 12 : 0), 0.2, 0.55));
    // Congas a partir del compás 4.
    if (comp >= 3) {
      const patron = [[0.25, 64, 0.35, false], [0.75, 69, 0.45, true], [0.5, 62, 0.25, false]];
      for (const [d, f, v, ab] of patron) if (b % 2 === 0 || d !== 0.5) sumar(seco, tb + d * TIEMPO, conga(hz(f) / 2.2, v, ab), { pan: 0.45, rev: 0.12 });
    }
  }
  // Rasgueo de acordes: en el tiempo 1 y el «y» del 2 y del 3.
  if (tb < FIN && !(tb >= RUPTURA[0] && tb < RUPTURA[1])) {
    const pos = b % 4;
    if (pos === 0 || pos === 1 || pos === 2) {
      const d = pos === 0 ? 0 : TIEMPO / 2;
      acorde.t.forEach((m, j) => sumar(musica, tb + d + j * 0.012, cuerda(m, 0.22, 0.9, 0.55), { pan: -0.3 + j * 0.3, rev: 0.3 }));
    }
  }
}
function t(b) { return DROP + b * TIEMPO; }

// Melodía corta (gancho) desde el compás 5, en La menor pentatónica.
const MELODIA = [
  [0, 76], [0.75, 74], [1.5, 72], [2.5, 69], [3, 72],
  [4, 76], [4.75, 79], [5.5, 76], [6.5, 74], [7, 72],
];
for (const inicioComp of [4, 8]) {
  for (const [d, m] of MELODIA) {
    const tb = t(inicioComp * 4) + d * TIEMPO;
    if (tb < FIN && !(tb >= RUPTURA[0] && tb < RUPTURA[1])) sumar(musica, tb, cuerda(m, 0.26, 0.8, 0.9), { pan: 0.15, rev: 0.35 });
  }
}

// Colchón en la ruptura y el clímax.
sumar(musica, RUPTURA[0], colchon([57, 60, 64, 69], 1.2, 0.12), { rev: 0.4 });
for (let c = 0; c < 4; c++) {
  const tb = RUPTURA[1] + c * 2 * TIEMPO * 2;
  if (tb < FIN) sumar(musica, tb, colchon(PROG[c % 4].t.map((m) => m + 12), 2, 0.1), { rev: 0.4 });
}

// Final: acorde que queda sonando.
sumar(seco, FIN, golpe(0.9, 2.4), { rev: 0.3 });
[45, 57, 60, 64, 69, 76].forEach((m, j) => sumar(musica, FIN + j * 0.02, cuerda(m, 0.24, 3.5, 0.6), { pan: -0.4 + j * 0.16, rev: 0.45 }));
sumar(musica, FIN, colchon([57, 60, 64, 69], DUR - FIN, 0.2), { rev: 0.5 });
for (const [d, m] of [[0.6, 81], [0.9, 84], [1.2, 88]]) sumar(seco, FIN + d, campana(m, 0.12, 0.9), { rev: 0.5, pan: 0.3 });

// ── efectos del gancho ───────────────────────────────────────────────────
const g = T.gancho;
sumar(seco, 0, golpe(1, 1.4), { rev: 0.2 });
// Reloj de tensión antes del drop.
for (let k = 1; k * TIEMPO < seg(g.rasga); k++) {
  sumar(seco, k * TIEMPO, toque(0.3), { pan: 0.4 });
  if (k % 2 === 0) sumar(seco, k * TIEMPO, bombo(0.4)); // latido de tensión
}
sumar(musica, 0, colchon([33, 45, 46], seg(g.rasga) + 0.2, 0.42));
for (const [d, l] of [[0.12, 0.3], [0.5, 0.35], [0.95, 0.25], [1.9, 0.3], [2.4, 0.25]]) sumar(seco, d, garabato(l, 0.42), { pan: -0.2 });
sumar(seco, seg(g.circulo), marcador(0.55, 0.32), { pan: 0.25 });
sumar(seco, seg(g.rasga), rasgon(0.85), { rev: 0.15 });
sumar(seco, seg(g.chispa), chispazo(0.35), { rev: 0.4 });
sumar(seco, seg(g.rasga) + 0.05, riser(DROP - seg(g.rasga) - 0.05, 0.3));
sumar(seco, DROP, golpe(0.95, 1.6), { rev: 0.25 });

// ── efectos de la toma ───────────────────────────────────────────────────
const me = T.mesero, co = T.cocina, ca = T.caja, du = T.duenio, re = T.revela;
for (const f of [me.tapPlato, me.tapMedio, me.tapMas, me.tapAgregar, me.tapEnviar, co.tapListo, ca.tapCobrar]) sumar(seco, seg(f), toque(0.4));
for (let f = me.notaDesde; f < me.notaHasta; f += 2) sumar(seco, seg(f), tecla(0.25), { pan: 0.1 });
const viaje = (de, a) => sumar(seco, seg(de), zumbido(seg(a - de) + 0.15, 0.32, 250, 5000), { rev: 0.2 });
viaje(me.sale, co.llega);
viaje(co.sale, ca.llega);
viaje(ca.sale, du.llega);
sumar(seco, seg(co.llega), campana(84, 0.32, 1.1), { rev: 0.4 });
sumar(seco, seg(co.llega) + 0.12, campana(91, 0.22, 0.9), { rev: 0.4 });
sumar(seco, seg(co.listo), campana(79, 0.22, 0.6), { rev: 0.3 });
sumar(seco, seg(co.listo) + 0.1, campana(84, 0.22, 0.8), { rev: 0.3 });
// Caja registradora: campanita + monedas.
sumar(seco, seg(ca.cobrado), campana(88, 0.3, 0.7), { rev: 0.35 });
sumar(seco, seg(ca.cobrado) + 0.09, campana(93, 0.26, 0.9), { rev: 0.35 });
for (let k = 0; k < 7; k++) sumar(seco, seg(ca.cobrado) + 0.05 + k * 0.035, campana(96 + (k % 3) * 2, 0.07, 0.15), { pan: (k % 2 ? 0.4 : -0.4) });
for (let f = ca.cuentaDesde; f < ca.cuentaHasta; f += 2) sumar(seco, seg(f), toque(0.12), { pan: 0.2 });
sumar(seco, seg(ca.cuadra), golpe(0.55, 0.6));
sumar(seco, seg(ca.cuadra), campana(81, 0.25, 1), { rev: 0.4 });
[76, 81, 84, 88].forEach((m, j) => sumar(seco, seg(du.suma) + j * 0.07, campana(m, 0.18, 0.6), { rev: 0.4, pan: -0.2 + j * 0.13 }));
sumar(seco, seg(re.riser), riser(seg(re.golpe - re.riser), 0.32));
sumar(seco, seg(re.golpe), golpe(0.9, 1.8), { rev: 0.3 });
sumar(seco, seg(re.aLogo), zumbido(seg(T.cierre.inicio - re.aLogo) + 0.1, 0.3, 300, 7000), { rev: 0.2 });
sumar(seco, seg(T.cierre.qr), campana(88, 0.12, 0.6), { rev: 0.4 });

// ── mezcla ───────────────────────────────────────────────────────────────
// Bomba: la música se agacha 120 ms en cada bombo (sensación de «empuje»).
const agache = new Float32Array(N).fill(1);
for (const tb of bomboPos) {
  const i0 = Math.round(tb * SR);
  for (let i = 0; i < 0.22 * SR; i++) {
    const k = i0 + i;
    if (k >= N) break;
    const x = i / (0.22 * SR);
    agache[k] = Math.min(agache[k], 0.35 + 0.65 * Math.pow(x, 0.7));
  }
}
// Reverb tipo Schroeder sobre el envío.
function reverb(x, desfase) {
  const combs = [1557, 1617, 1491, 1422].map((d) => ({ b: new Float32Array(d + desfase), i: 0, f: 0 }));
  const alls = [225, 556].map((d) => ({ b: new Float32Array(d), i: 0 }));
  const y = new Float32Array(x.length);
  for (let n = 0; n < x.length; n++) {
    let s = 0;
    for (const c of combs) {
      const o = c.b[c.i];
      c.f = o * 0.8 + c.f * 0.2;
      c.b[c.i] = x[n] + c.f * 0.84;
      c.i = (c.i + 1) % c.b.length;
      s += o;
    }
    for (const a of alls) {
      const o = a.b[a.i];
      a.b[a.i] = s + o * 0.5;
      a.i = (a.i + 1) % a.b.length;
      s = o - s * 0.5;
    }
    y[n] = s * 0.18;
  }
  return y;
}
for (let i = 0; i < N; i++) {
  envio.L[i] += musica.L[i] * agache[i] * 0.3;
  envio.R[i] += musica.R[i] * agache[i] * 0.3;
}
const rvL = reverb(envio.L, 0), rvR = reverb(envio.R, 23);
const L = new Float32Array(N), R = new Float32Array(N);
let pico = 0;
for (let i = 0; i < N; i++) {
  L[i] = seco.L[i] + musica.L[i] * agache[i] + rvL[i];
  R[i] = seco.R[i] + musica.R[i] * agache[i] + rvR[i];
}
// Saturación suave + fundido de salida.
for (let i = 0; i < N; i++) {
  const tt = i / SR;
  const fade = Math.min(1, (DUR - tt) / 1.2);
  L[i] = Math.tanh(L[i] * 1.1) * fade;
  R[i] = Math.tanh(R[i] * 1.1) * fade;
  pico = Math.max(pico, Math.abs(L[i]), Math.abs(R[i]));
}
const norma = 0.92 / pico;

const datos = Buffer.alloc(44 + N * 4);
datos.write('RIFF', 0); datos.writeUInt32LE(36 + N * 4, 4); datos.write('WAVE', 8);
datos.write('fmt ', 12); datos.writeUInt32LE(16, 16); datos.writeUInt16LE(1, 20); datos.writeUInt16LE(2, 22);
datos.writeUInt32LE(SR, 24); datos.writeUInt32LE(SR * 4, 28); datos.writeUInt16LE(4, 32); datos.writeUInt16LE(16, 34);
datos.write('data', 36); datos.writeUInt32LE(N * 4, 40);
for (let i = 0; i < N; i++) {
  datos.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i] * norma)) * 32767), 44 + i * 4);
  datos.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i] * norma)) * 32767), 46 + i * 4);
}
const salida = join(RAIZ, 'public', 'una-toma');
mkdirSync(salida, { recursive: true });
writeFileSync(join(salida, 'banda.wav'), datos);
console.log(`banda.wav · ${DUR.toFixed(1)} s · pico normalizado ×${norma.toFixed(2)}`);
