import type { Metadata, Viewport } from 'next';
import { Geist, Unbounded, Anton, Instrument_Serif, JetBrains_Mono } from 'next/font/google';
import { headers, cookies } from 'next/headers';
import './globals.css';
import ThemeBackground from '@/components/theme-background';
/**
 * El layout solo usa el tema del restaurante (colores, fuentes, fondo, CSS
 * propio, ícono, color de la barra del navegador) — nada que dependa de la
 * sesión de quien mira. Por eso va con la variante cacheada y NO con
 * getRestaurantBySlug: esa hace dos consultas VIVAS a Supabase (restaurants +
 * restaurant_themes, en cadena) en cada carga de cada página pública, aunque
 * la página de al lado (src/app/page.tsx) ya tuviera el mismo dato cacheado.
 * Se sigue viendo al instante al editar: el tag `restaurant:<id>` se invalida
 * con updateTag() en cada acción que toca el restaurante o su tema, y el
 * lookup slug→id de dentro es en vivo (una suspensión corta el paso ya).
 */
import { getRestaurantBySlugCached } from '@/lib/db/restaurants';
import {
  resolveTheme,
  buildThemeVars,
  buildFontsHref,
  type ResolvedTheme,
} from '@/lib/theme/resolve';
import { DEMO_SLUG } from '@/lib/tenant';

/**
 * Fuente de INTERFAZ. Es la única que renderiza texto en TODAS las superficies
 * (menú, panel, landing), así que es la única que se precarga. Sin `weight`
 * a propósito: Geist es variable en Google Fonts y así viaja como UN archivo
 * que cubre 100-900 en vez de un archivo por peso.
 */
const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });

/**
 * Fuentes de MARCA por defecto (Unbounded/Anton/Instrument Serif/JetBrains
 * Mono): antes se pedían a Google Fonts vía @import en globals.css, sin
 * condición — una petición externa bloqueante en TODA página, admin incluido
 * (que nunca las usa salvo por .t-display/.t-poster/.t-kicker heredados del
 * tema por defecto). Al self-hostearlas con next/font quedan como archivos
 * estáticos de la app: sin round-trip externo, cacheables, sin bloquear el
 * render. Ver fam() en lib/theme/resolve.ts — ahí se mapea el nombre de
 * familia ('Unbounded', etc.) a estas variables cuando el tema de un tenant
 * usa exactamente estos nombres (el resto de fuentes curadas del editor
 * sigue viajando por Google Fonts en tiempo real, ver buildFontsHref).
 *
 * `preload: false` NO las desactiva: siguen self-hosteadas y siguen llegando
 * en cuanto el CSS las pide. Lo que se quita es el `<link rel=preload>`.
 * Estas cuatro se declaran en el layout raíz (una sola plantilla para toda la
 * app), así que con el preload por defecto el navegador las bajaba SIEMPRE,
 * en toda página de todo restaurante — 173 KB en la ruta crítica. Y casi
 * ningún tenant las usa: quien elige Fraunces/Space Grotesk/Inter en el
 * editor bajaba esos 173 KB de tipografías que no pinta ni un glifo, POR
 * DELANTE (prioridad de preload) de las fuentes que sí iba a usar. Medido en
 * rincon502.leogin.online el 2026-08-12.
 *
 * Coste de quitarlo: donde SÍ se usan (landing, tema por defecto, KPIs del
 * panel) la fuente se descubre al aplicar el CSS en vez de al leer el HTML,
 * ~1 ida y vuelta más tarde. No hay salto de maquetación: next/font genera la
 * métrica de respaldo ajustada ('Unbounded Fallback', etc.) y con
 * `display: swap` el texto se pinta de inmediato.
 *
 * Sin `weight` en Unbounded y JetBrains Mono: ambas son variables en Google
 * Fonts. Pedirles una lista de pesos obligaba a next/font a generar un
 * archivo estático POR PESO (6 y 3); como variables son un archivo cada una
 * y además queda disponible cualquier peso intermedio para el editor de temas.
 */
const brandDisplay = Unbounded({ variable: '--font-unbounded', subsets: ['latin'], preload: false });
const brandPoster = Anton({ variable: '--font-anton', subsets: ['latin'], weight: '400', preload: false });
const brandSerif = Instrument_Serif({ variable: '--font-instrument-serif', subsets: ['latin'], weight: '400', style: ['normal', 'italic'], preload: false });
const brandMono = JetBrains_Mono({ variable: '--font-jetbrains-mono', subsets: ['latin'], preload: false });
const BRAND_FONT_VARS = `${brandDisplay.variable} ${brandPoster.variable} ${brandSerif.variable} ${brandMono.variable}`;

/**
 * Tema del ÁREA DE PERSONAL (admin, panel de grupo, super admin).
 *
 * El panel ya no hereda la personalización del restaurante: usa 2 paletas
 * fijas (claro/oscuro) definidas en globals.css bajo `html[data-admin-area]`.
 * La elección vive en la cookie `admin-theme` (la escribe el switch del
 * AdminShell) y se lee aquí en el servidor → el HTML llega pintado con el
 * tema correcto, sin flash. `data-scheme` reutiliza toda la maquinaria CSS
 * de modo claro ya existente (superficies, glass, estados semánticos).
 */
const ADMIN_THEME_COOKIE = 'admin-theme';

async function getAdminScheme(): Promise<'light' | 'dark'> {
  const jar = await cookies();
  return jar.get(ADMIN_THEME_COOKIE)?.value === 'dark' ? 'dark' : 'light';
}

/**
 * Metadata dinámica: el ícono de "añadir a inicio" de iOS (apple-touch-icon)
 * se personaliza por restaurante. Apunta al proxy /api/icon/[slug], que sirve
 * el PNG cuadrado del restaurante. (Por eso se eliminó apple-icon.tsx: un
 * archivo de convención fijaría el ícono genérico para todos los tenants.)
 */
export async function generateMetadata(): Promise<Metadata> {
  const headersList = await headers();
  // Área de personal: ícono genérico, sin consultar el tema del tenant.
  const slug = headersList.get('x-admin-area') ? null : headersList.get('x-tenant-slug');

  let appleIcon = '/icon-512.png'; // plataforma / demo → ícono genérico
  if (slug && slug !== DEMO_SLUG) {
    const data = await getRestaurantBySlugCached(slug);
    const icon = data?.resolved.config.pwaIconUrl ?? data?.resolved.config.logoUrl;
    if (icon) appleIcon = `/api/icon/${slug}`;
  }

  return {
    title: 'Menú en línea',
    description: 'Menús interactivos para restaurantes',
    // Nota: NO se fija `manifest` aquí — src/app/manifest.ts (archivo de
    // convención, mismo segmento raíz) siempre gana sobre este campo cuando
    // ambos compiten por el mismo segmento (confirmado en el navegador: el
    // <link rel=manifest> real es /manifest.webmanifest, nunca lo que diga
    // este objeto). Mismo motivo por el que se sacó apple-icon.tsx arriba,
    // pero al revés: ahí la convención daba un ícono genérico y había que
    // evitarla; aquí la convención YA hace lo correcto (lee x-tenant-slug),
    // así que un `manifest: '/algo'` aquí sería código muerto.
    appleWebApp: {
      capable: true,
      statusBarStyle: 'black-translucent',
      title: 'Leogin',
    },
    icons: { apple: appleIcon },
  };
}

// La barra del navegador toma el color de fondo del tenant (en plataforma
// queda el oscuro por defecto). En el área de personal, el color del tema fijo.
export async function generateViewport(): Promise<Viewport> {
  const headersList = await headers();
  if (headersList.get('x-admin-area')) {
    const scheme = await getAdminScheme();
    return {
      themeColor: scheme === 'light' ? '#f4f4f6' : '#0b0b0c',
      width: 'device-width',
      initialScale: 1,
      maximumScale: 5,
    };
  }
  const slug = headersList.get('x-tenant-slug');
  let themeColor = '#0b0b0c';
  if (slug === DEMO_SLUG) {
    themeColor = resolveTheme({ brand_name: 'Café Demo' }, DEMO_SLUG).config.colorBg;
  } else if (slug) {
    const data = await getRestaurantBySlugCached(slug);
    if (data) themeColor = data.resolved.config.colorBg;
  }
  return {
    themeColor,
    width: 'device-width',
    initialScale: 1,
    maximumScale: 5,
  };
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const headersList = await headers();
  const slug = headersList.get('x-tenant-slug');

  // ÁREA DE PERSONAL (admin/central/super): tema fijo claro u oscuro, SIN
  // tema del restaurante — ni variables, ni fuentes del tenant, ni fondo
  // decorativo, ni custom CSS. Un panel uniforme y predecible para todos los
  // restaurantes; la identidad de cada uno vive solo en su menú digital.
  if (headersList.get('x-admin-area')) {
    const adminScheme = await getAdminScheme();
    return (
      <html
        lang="es"
        data-admin-area=""
        data-scheme={adminScheme}
        data-glass="translucido"
        className={`${geistSans.variable} ${BRAND_FONT_VARS} h-full antialiased`}
        style={{ colorScheme: adminScheme }}
      >
        <body className="min-h-full flex flex-col">{children}</body>
      </html>
    );
  }

  // Resolver el tema del tenant (o de la demo). Las superficies de plataforma
  // (landing, login) no tienen slug → usan los defaults de globals.css.
  let resolved: ResolvedTheme | null = null;
  if (slug === DEMO_SLUG) {
    resolved = resolveTheme({ brand_name: 'Café Demo' }, DEMO_SLUG);
  } else if (slug) {
    const data = await getRestaurantBySlugCached(slug);
    resolved = data?.resolved ?? resolveTheme(null, slug);
  }

  const themeVars = resolved ? buildThemeVars(resolved.config) : undefined;
  const fontsHref = resolved ? buildFontsHref(resolved.config) : null;
  const glassIntensity = resolved?.config.glassIntensity ?? 'translucido';
  const scheme = resolved?.config.scheme ?? 'dark';

  // Serializar vars como :root{} para <style> en el body.
  // Un <style> en body aplica al documento completo igual que en <head>,
  // pero evita conflictos con el manejo de <head> de Next.js App Router.
  // Al ir antes de {children}, el customCss al final del body lo sobreescribe
  // normalmente por orden de cascade (sin necesitar !important).
  const themeVarsCss = themeVars
    ? `:root{${Object.entries(themeVars).map(([k, v]) => `${k}:${v}`).join(';')}}`
    : '';

  return (
    <html
      lang="es"
      data-glass={glassIntensity}
      data-scheme={scheme}
      // Lienzo del menú. Va en <html> y no en el <main> del menú a propósito:
      // así las CUATRO superficies del comensal (menú, checkout, «Mis
      // pedidos» y el seguimiento del pedido) comparten la misma columna, y
      // el ancho ya es el correcto en el primer pintado — sin medir la
      // ventana desde React ni el salto de maqueta que eso traería.
      // Ver el bloque «LIENZO DEL MENÚ» en globals.css.
      data-canvas={resolved?.config.layoutWidth ?? 'movil'}
      className={`${geistSans.variable} ${BRAND_FONT_VARS} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {/* Variables del tema: stylesheet en vez de inline style → el customCss
            al final puede sobrescribirlas con selectores normales. */}
        {themeVarsCss && (
          <style
            id="tenant-theme-vars"
            dangerouslySetInnerHTML={{ __html: themeVarsCss }}
          />
        )}

        {/* Fuentes del tenant (React 19 iza <link> al <head>) */}
        {fontsHref && (
          <>
            <link rel="preconnect" href="https://fonts.googleapis.com" />
            <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
            <link rel="stylesheet" href={fontsHref} />
          </>
        )}

        <ThemeBackground config={resolved?.config} />

        {children}

        {/* CSS propio del restaurante: último en el documento → puede sobrescribir todo. */}
        {resolved?.customCss ? (
          <style
            id="tenant-custom-css"
            dangerouslySetInnerHTML={{ __html: resolved.customCss }}
          />
        ) : null}
      </body>
    </html>
  );
}

