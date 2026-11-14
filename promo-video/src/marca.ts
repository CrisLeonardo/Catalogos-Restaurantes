// Marca de Leogin para el video. Sale del propio proyecto:
//  · paleta «colores de la cocina chapina» (docs/negocio/ESTRATEGIA_ATRACCION_2026-10-25.md §5.1)
//  · logo: plataforma/public/logo-mark.svg
//  · tipografías de la web pública (plataforma/src/app/layout.tsx):
//    Unbounded para titulares de marca y Geist para todo lo demás.
import { loadFont as cargarUnbounded } from '@remotion/google-fonts/Unbounded';
import { loadFont as cargarGeist } from '@remotion/google-fonts/Geist';
import { loadFont as cargarGeistMono } from '@remotion/google-fonts/GeistMono';

export const color = {
  brasa: '#E8534A',
  mango: '#F5A030',
  carbon: '#1C1C1E',
  carbonHondo: '#121214',
  masa: '#FBF6EE',
  albahaca: '#2F9E6B',
  albahacaOscura: '#23855A',
  terracota: '#B4492A',
  tinta: '#2B2622',
  papel: '#FFFDF6',
  grisPapel: '#9C958C',
} as const;

export const degradado = `linear-gradient(135deg, ${color.brasa}, ${color.mango})`;

export const fuente = {
  titular: cargarUnbounded('normal', { weights: ['700', '800'], subsets: ['latin'] }).fontFamily,
  texto: cargarGeist('normal', { weights: ['400', '500', '600', '700'], subsets: ['latin'] }).fontFamily,
  cifras: cargarGeistMono('normal', { weights: ['500', '700'], subsets: ['latin'] }).fontFamily,
};

export const VIDEO = { ancho: 1080, alto: 1920, fps: 30 } as const;
