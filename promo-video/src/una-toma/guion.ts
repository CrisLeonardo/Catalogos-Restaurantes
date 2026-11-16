// Un «guion» describe un video de la serie «Una sola toma»: su gancho, los
// aparatos por los que pasa la chispa, los textos y el cierre. El motor
// (mundo, textos, gancho, cierre) es el mismo para los tres videos.
import React, { createContext, useContext } from 'react';
import { easeIO, prog } from './base';
import { TAB, TEL } from './dispositivos';

export type Pt = { x: number; y: number };

export type Tiempos = {
  fps: number;
  total: number;
  gancho: { rasga: number; chispa: number; iris: number; [k: string]: number };
  drop: number;
  revela: { riser: number; inicio: number; golpe: number; aLogo: number };
  cierre: { inicio: number; oferta: number; url: number; qr: number };
  /** Efectos de sonido: [cuadro, tipo, ...argumentos]. Los lee la banda sonora. */
  eventos: (string | number)[][];
};

export type Lugar = {
  id: string;
  tipo: 'tel' | 'tab';
  x: number;
  y: number;
  Pantalla: React.FC;
  etiqueta: string;
  /** Cuadros en que brilla porque la chispa acaba de llegar. */
  brilla: number[];
};

export type Salto = { de: number; a: number; p0: Pt; c1: Pt; c2: Pt; p1: Pt };

export type Clave = { f: number; x: number; y: number; s: number; hueco?: number; curva?: (t: number) => number };

export type Grupo = {
  de: number;
  a: number;
  chica?: string;
  grandes: { en: number; texto: string; acento?: boolean }[];
  extra?: { en: number; texto: string };
};

export type PropsCierre = {
  oferta: string;
  /** Renglones del precio; en horizontal se juntan en uno. */
  ofertaAcento: string[];
  detalle: string;
  url: string;
  qr: string;
};

export type Guion = {
  id: 'meseros' | 'comedor' | 'domicilio';
  T: Tiempos;
  /** Lo que se ve en los primeros 3 s (y se rompe). Llena el cuadro. */
  Escena: React.FC;
  /** Pregunta del gancho, por renglón; «*palabra» va resaltada. */
  pregunta: { vertical: string[]; horizontal: string[] };
  /** Lo que aparece cuando la escena se rompe. */
  frase: [string, string];
  lugares: Lugar[];
  logo: Pt;
  saltos: Salto[];
  aterrizajes: { en: number; p: Pt }[];
  claves: (vertical: boolean) => Clave[];
  grupos: Grupo[];
  remate: [string, string];
  cierre: PropsCierre;
};

export const GuionCtx = createContext<Guion | null>(null);
export const useGuion = () => {
  const g = useContext(GuionCtx);
  if (!g) throw new Error('Falta el guion');
  return g;
};

// ── geometría ────────────────────────────────────────────────────────────
export const enTel = (c: Pt, px: number, py: number): Pt => ({ x: c.x - TEL.w / 2 + px, y: c.y - TEL.h / 2 + py });
export const enTab = (c: Pt, px: number, py: number): Pt => ({ x: c.x - TAB.w / 2 + px, y: c.y - TAB.h / 2 + py });
export const mas = (p: Pt, dx: number, dy: number): Pt => ({ x: p.x + dx, y: p.y + dy });

export const bez = (s: Salto, t: number): Pt => {
  const u = 1 - t;
  return {
    x: u * u * u * s.p0.x + 3 * u * u * t * s.c1.x + 3 * u * t * t * s.c2.x + t * t * t * s.p1.x,
    y: u * u * u * s.p0.y + 3 * u * u * t * s.c1.y + 3 * u * t * t * s.c2.y + t * t * t * s.p1.y,
  };
};
export const chispaEn = (saltos: Salto[], f: number): Pt | null => {
  for (const s of saltos) if (f >= s.de && f <= s.a) return bez(s, easeIO(prog(f, s.de, s.a)));
  return null;
};
export const caminoSvg = (s: Salto) => `M${s.p0.x},${s.p0.y} C${s.c1.x},${s.c1.y} ${s.c2.x},${s.c2.y} ${s.p1.x},${s.p1.y}`;

/** Salto con curva automática: sale hacia `sale` y entra desde `entra`. */
export const salto = (de: number, a: number, p0: Pt, p1: Pt, sale: [number, number], entra: [number, number]): Salto => ({
  de, a, p0, p1, c1: mas(p0, sale[0], sale[1]), c2: mas(p1, entra[0], entra[1]),
});
