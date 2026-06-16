import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

/* ============================================================
   Content-Security-Policy — capa defensiva contra XSS / inyección.
   ------------------------------------------------------------
   Orígenes externos que la app usa legítimamente:
     · Google Fonts:  fonts.googleapis.com (CSS) + fonts.gstatic.com (woff2)
     · Leaflet:       unpkg.com (leaflet.css) + tiles de OpenStreetMap (img)
     · Supabase:      REST (https) + Realtime (wss)
   En desarrollo, `next dev` necesita 'unsafe-eval' (HMR/source-maps) y
   websockets a localhost; por eso la política se ramifica por entorno.
   `frame-ancestors` se añade por-ruta abajo (preview es embebible mismo-origen).
   ============================================================ */
const cspDirectives = [
  `default-src 'self'`,
  // Next inyecta scripts inline para el bootstrap/hidratación; en dev usa eval.
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  // Estilos inline (style={}), <style> del custom_css del tenant, Google Fonts, Leaflet.
  `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://unpkg.com`,
  `font-src 'self' data: https://fonts.gstatic.com`,
  // Logos/fondos (Supabase), previews de canvas (blob/data), tiles de mapa y grano SVG (data).
  `img-src 'self' data: blob: https:`,
  // Supabase REST + Realtime (wss); en dev, websockets de HMR.
  `connect-src 'self' https://*.supabase.co wss://*.supabase.co${
    isDev ? " ws://localhost:* http://localhost:*" : ""
  }`,
  `worker-src 'self' blob:`,
  `manifest-src 'self'`,
  `base-uri 'self'`,
  `form-action 'self'`,
  `object-src 'none'`,
  `frame-src 'self'`,
].join("; ");

const baseHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  // El filtro XSS legacy de los navegadores está deprecado y "1; mode=block"
  // podía abrir vectores; la recomendación actual (OWASP) es desactivarlo y
  // confiar en escapado + CSP.
  { key: "X-XSS-Protection", value: "0" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(self)",
  },
];

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
  async headers() {
    return [
      {
        source: "/((?!preview/).*)",
        headers: [
          ...baseHeaders,
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Content-Security-Policy",
            value: `${cspDirectives}; frame-ancestors 'none'`,
          },
        ],
      },
      {
        // Las páginas de preview se embeben en el editor (mismo origen):
        // sin X-Frame-Options y con frame-ancestors 'self'.
        source: "/preview/:path*",
        headers: [
          ...baseHeaders,
          {
            key: "Content-Security-Policy",
            value: `${cspDirectives}; frame-ancestors 'self'`,
          },
        ],
      },
    ];
  },
};

export default nextConfig;
