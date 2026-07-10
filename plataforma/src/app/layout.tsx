import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { headers, cookies } from 'next/headers';
import './globals.css';
import ThemeBackground from '@/components/theme-background';
import { getRestaurantBySlug } from '@/lib/db/restaurants';
import {
  resolveTheme,
  buildThemeVars,
  buildFontsHref,
  type ResolvedTheme,
} from '@/lib/theme/resolve';
import { DEMO_SLUG } from '@/lib/tenant';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

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
  return jar.get(ADMIN_THEME_COOKIE)?.value === 'light' ? 'light' : 'dark';
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
    const data = await getRestaurantBySlug(slug);
    const icon = data?.resolved.config.pwaIconUrl ?? data?.resolved.config.logoUrl;
    if (icon) appleIcon = `/api/icon/${slug}`;
  }

  return {
    title: 'Menú en línea',
    description: 'Menús interactivos para restaurantes',
    manifest: '/api/manifest',
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
    themeColor = resolveTheme({ brand_name: 'Azúcar Negra' }, DEMO_SLUG).config.colorBg;
  } else if (slug) {
    const data = await getRestaurantBySlug(slug);
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
        className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
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
    resolved = resolveTheme({ brand_name: 'Azúcar Negra' }, DEMO_SLUG);
  } else if (slug) {
    const data = await getRestaurantBySlug(slug);
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
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
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

