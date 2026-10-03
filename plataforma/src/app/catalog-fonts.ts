import {
  Archivo_Black, Bebas_Neue, Space_Grotesk, Syne, Playfair_Display, Fraunces,
  Cormorant_Garamond, Inter, Manrope, Plus_Jakarta_Sans, DM_Sans, Poppins,
  Space_Mono, IBM_Plex_Mono,
} from 'next/font/google';

/* ============================================================
   EL RESTO DEL CATÁLOGO DE TIPOGRAFÍAS, DESDE NUESTRO DOMINIO
   (auditoría 2026-10-02, REN-08 — heredado M-6 del 09-25)
   ------------------------------------------------------------
   Las cinco fuentes por defecto ya viajaban con next/font (layout.tsx);
   las otras catorce del editor de temas se pedían a fonts.googleapis.com
   con un <link rel="stylesheet">: una hoja de OTRO dominio (DNS + TLS)
   que bloqueaba el primer pintado del menú de cada restaurante que eligió
   una de ellas. La salida «cargarla sin bloquear» tenía costo estético
   (un instante con la letra del sistema), por eso esperaba decisión.

   Así no hay que elegir: los archivos se bajan al compilar y se sirven
   como estáticos de la app. Ninguna se precarga (`preload: false`): una
   @font-face solo se descarga si algo en la página la usa, así que un
   restaurante con Fraunces baja Fraunces y nada más. Y next/font genera
   la letra de respaldo con las métricas ajustadas: sin salto de texto.

   Las variables CSS van en <html> (layout.tsx) y `fam()` en
   lib/theme/resolve.ts traduce el nombre de la familia a su variable.
   `resolve.test.ts` comprueba que TODA familia de FONT_OPTIONS tenga la
   suya: una fuente nueva en el catálogo sin declararse aquí volvería a
   pedirse a Google y la prueba lo dice.

   Sin `weight` en las variables (un archivo por estilo cubre todos los
   pesos); con la lista de pesos del catálogo en las estáticas.
   ============================================================ */

/* next/font exige literales en cada llamada (sin variables ni `...`). */
const archivoBlack = Archivo_Black({ subsets: ['latin'], preload: false, display: 'swap', variable: '--font-archivo-black', weight: '400' });
const bebasNeue = Bebas_Neue({ subsets: ['latin'], preload: false, display: 'swap', variable: '--font-bebas-neue', weight: '400' });
const spaceGrotesk = Space_Grotesk({ subsets: ['latin'], preload: false, display: 'swap', variable: '--font-space-grotesk' });
const syne = Syne({ subsets: ['latin'], preload: false, display: 'swap', variable: '--font-syne' });
const playfair = Playfair_Display({ subsets: ['latin'], preload: false, display: 'swap', variable: '--font-playfair', style: ['normal', 'italic'] });
const fraunces = Fraunces({ subsets: ['latin'], preload: false, display: 'swap', variable: '--font-fraunces', style: ['normal', 'italic'] });
const cormorant = Cormorant_Garamond({ subsets: ['latin'], preload: false, display: 'swap', variable: '--font-cormorant', style: ['normal', 'italic'] });
const inter = Inter({ subsets: ['latin'], preload: false, display: 'swap', variable: '--font-inter' });
const manrope = Manrope({ subsets: ['latin'], preload: false, display: 'swap', variable: '--font-manrope' });
const jakarta = Plus_Jakarta_Sans({ subsets: ['latin'], preload: false, display: 'swap', variable: '--font-jakarta' });
const dmSans = DM_Sans({ subsets: ['latin'], preload: false, display: 'swap', variable: '--font-dm-sans' });
const poppins = Poppins({ subsets: ['latin'], preload: false, display: 'swap', variable: '--font-poppins', weight: ['300', '400', '500', '600', '700'] });
const spaceMono = Space_Mono({ subsets: ['latin'], preload: false, display: 'swap', variable: '--font-space-mono', weight: ['400', '700'] });
const plexMono = IBM_Plex_Mono({ subsets: ['latin'], preload: false, display: 'swap', variable: '--font-plex-mono', weight: ['400', '500', '600'] });

/** Clases que definen las variables en <html>. */
export const CATALOG_FONT_VARS = [
  archivoBlack, bebasNeue, spaceGrotesk, syne, playfair, fraunces, cormorant,
  inter, manrope, jakarta, dmSans, poppins, spaceMono, plexMono,
].map((f) => f.variable).join(' ');
