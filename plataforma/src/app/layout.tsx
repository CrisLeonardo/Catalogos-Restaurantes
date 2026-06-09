import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { headers } from 'next/headers';
import './globals.css';
import { getRestaurantBySlug } from '@/lib/db/restaurants';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Menú en línea',
  description: 'Menús interactivos para restaurantes',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'MenúVivo',
  },
};

export const viewport: Viewport = {
  themeColor: '#0b0b0c',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const headersList = await headers();
  const slug = headersList.get('x-tenant-slug');

  let glassIntensity = 'translucido';
  let brandVars: React.CSSProperties = {};

  if (slug) {
    const data = await getRestaurantBySlug(slug);
    if (data?.theme) {
      const { theme } = data;
      glassIntensity = theme.glass_intensity;
      brandVars = {
        '--brand-bg': theme.color_bg,
        '--brand-text': theme.color_text,
        '--brand-accent': theme.color_primary,
      } as React.CSSProperties;
    }
  }

  return (
    <html
      lang="es"
      data-glass={glassIntensity}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      style={brandVars}
    >
      <head>
        <link rel="apple-touch-icon" sizes="180x180" href="/icon-192.png" />
      </head>
      <body className="min-h-full flex flex-col">
        <div className="asphalt" aria-hidden />
        {children}
      </body>
    </html>
  );
}
