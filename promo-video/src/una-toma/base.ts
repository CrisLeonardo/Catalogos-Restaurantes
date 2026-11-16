// Piezas comunes de «Una sola toma»: formato, curvas, colores y la app.
import { useVideoConfig } from 'remotion';
import { loadFont as cargarCaveat } from '@remotion/google-fonts/Caveat';

export const mano = cargarCaveat('normal', { weights: ['500', '700'], subsets: ['latin', 'latin-ext'] }).fontFamily;

/** Vertical (TikTok, Reels) u horizontal (PC, la visita al restaurante). */
export const useFormato = () => {
  const { width, height } = useVideoConfig();
  const vertical = height > width;
  return { vertical, W: width, H: height };
};

export const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const prog = (f: number, de: number, a: number) => clamp((f - de) / (a - de));
export const easeIO = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
export const easeOutExpo = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
export const easeIn = (t: number) => t * t * t;
/** Rebote corto (sale de 0, se pasa un poco y asienta en 1). */
export const pop = (t: number) => {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const c = 1.9;
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
};

// Colores de la app real (panel en tema claro, docs/diseno/SISTEMA_VISUAL)
export const app = {
  fondo: '#F2F1EE',
  tarjeta: '#FFFFFF',
  tinta: '#17161A',
  tinta2: '#5E5A55',
  tinta3: '#8F8A84',
  borde: '#E4E1DC',
  coral: '#C2542F',
  coralSuave: '#F6E6DF',
  ok: '#1F7A4D',
  okSuave: '#DDF1E6',
  aviso: '#9A5B00',
};

// Marca (paleta «cocina chapina»)
export const marca = {
  brasa: '#E8534A',
  mango: '#F5A030',
  carbon: '#1C1C1E',
  noche: '#0E0E10',
  masa: '#FBF6EE',
};
export const degradado = `linear-gradient(120deg, ${marca.brasa}, ${marca.mango})`;

export const dinero = (q: number) =>
  'Q' + q.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
