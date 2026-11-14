// Lo que se puede cambiar del video sin tocar las escenas.
// En Remotion Studio aparece como props editables; en la línea de comandos:
//   npx remotion render Leogin-40s-A out/x.mp4 --props='{"cta":"..."}'

export type Gancho = 'dolor' | 'resultado' | 'cronometro';

export type PropsVideo = {
  gancho: Gancho;
  /** Pista de música en public/ (o null para dejar el video sin música). */
  musica: string | null;
  volumenMusica: number;
  /** Texto del único llamado a la acción. */
  cta: string;
  ctaAntes: string;
  oferta: string;
  promesa: string;
};

export const PROPS_BASE: Omit<PropsVideo, 'gancho'> = {
  musica: 'audio/musica.wav',
  volumenMusica: 0.55,
  ctaAntes: 'Pruébalo gratis en',
  cta: 'distleogin.com',
  oferta: '30 días gratis · sin tarjeta',
  promesa: 'Tu restaurante, bajo control.',
};

// Línea de tiempo (cuadros a 30 fps). El cuerpo es igual para los tres ganchos.
export const T = {
  gancho: [0, 90],
  caos: [90, 165],
  comanda: [165, 240],
  pide: [240, 330],
  panel: [330, 420],
  cocina: [420, 510],
  seguimiento: [510, 600],
  caja: [600, 750],
  antesDespues: [750, 900],
  hoy: [900, 1050],
  cierre: [1050, 1200],
} as const;

export const DURACION = 1200;
