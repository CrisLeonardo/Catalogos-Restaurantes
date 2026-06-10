import type { Metadata, Viewport } from 'next';
import type { CSSProperties } from 'react';
import { Geist, Geist_Mono } from 'next/font/google';
import { headers } from 'next/headers';
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

export const metadata: Metadata = {
  title: 'Menú en línea',
  description: 'Menús interactivos para restaurantes',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Leogin',
  },
};

// La barra del navegador toma el color de fondo del tenant (en plataforma
// queda el oscuro por defecto).
export async function generateViewport(): Promise<Viewport> {
  const slug = (await headers()).get('x-tenant-slug');
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

  // Resolver el tema del tenant (o de la demo). Las superficies de plataforma
  // (landing, login, super, admin) no tienen slug → usan los defaults de globals.css.
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

  return (
    <html
      lang="es"
      data-glass={glassIntensity}
      data-scheme={scheme}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      // Variables del tema: inline en <html> gana sobre :root de globals.css.
      style={themeVars as unknown as CSSProperties}
    >
      <body className="min-h-full flex flex-col">
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

