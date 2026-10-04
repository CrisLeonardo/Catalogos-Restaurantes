import type { NextConfig } from "next";

/* ============================================================
   Las cabeceras de seguridad (CSP, HSTS, X-Frame-Options,
   Referrer-Policy, Permissions-Policy, etc.) se aplican en UN
   solo lugar: el proxy (src/proxy.ts → applySecurityHeaders),
   que corre en cada petición. Antes también se definían aquí,
   lo que producía dos fuentes en conflicto (el proxy ganaba y
   anulaba estas). Se consolidaron en el proxy; aquí queda solo
   la configuración de imágenes.
   ============================================================ */
/* Pantallas que se fusionaron en «La PC del local» y cuyas rutas se
   conservan por los enlaces viejos (guía impresa, correos, marcadores).
   Se redirigen AQUÍ, antes de pintar nada, y no con `redirect()` dentro
   de la página: allí el armazón del panel ya se había enviado, el router
   de Next resolvía la redirección con una navegación dura y, al volver a
   pintarse, lanzaba «Rendered more hooks than during the previous render»
   (React #310) — visto en consola en cada carga directa de estas rutas,
   con una recarga de más por el camino. Las páginas se quedan como
   respaldo por si una petición llega por otro camino. */
const FUSIONADAS_EN_MI_PC = ['impresion', 'escritorio', 'sin-internet'];

const nextConfig: NextConfig = {
  async redirects() {
    return [
      ...FUSIONADAS_EN_MI_PC.flatMap((ruta) => [
        { source: `/panel/:slug/${ruta}`, destination: '/panel/:slug/mi-pc', permanent: false },
        { source: `/admin/${ruta}`, destination: '/admin/mi-pc', permanent: false },
      ]),
      /* «Canales externos» (Fase 5A) sigue apagado: misma razón que arriba,
         la página hacía `redirect()` y la consola lanzaba React #310 en cada
         carga directa (auditoría 2026-10-02, N-08). Al encenderlo, quitar
         estas dos líneas junto con CANALES_HABILITADO de la página. */
      { source: '/panel/:slug/canales', destination: '/panel/:slug', permanent: false },
      { source: '/admin/canales', destination: '/admin', permanent: false },
      /* Cobros vive dentro de Finanzas › Cobranza. La página vieja hacía
         `redirect()` con el armazón del Super ya transmitiéndose y el
         navegador lanzaba React #310 (encontrado en el barrido del
         2026-10-03). Aquí se redirige antes de pintar nada. */
      { source: '/super/cobros', destination: '/super/finanzas/cobranza', permanent: false },
    ];
  },
  images: {
    // Las fotos del bucket `restaurant-assets` ya NO pasan por aquí: van por
    // /img (ver src/lib/asset-image.ts). Este optimizador queda para el
    // resto de fuentes. Los anchos son los mismos que acepta /img, para que
    // un srcset valga igual por los dos caminos.
    //
    // Escritos a mano y NO importados de src/lib/asset-image.ts: `next
    // start` compila este archivo suelto y no resuelve imports de .ts
    // ("Cannot find module './src/lib/asset-image'" — el build sí pasaba y
    // el servidor no arrancaba). La prueba asset-image.test.ts comprueba
    // que las dos listas sigan iguales.
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
    imageSizes: [32, 48, 64, 96, 128, 256, 384],
    // 31 días en vez de 4 h: las URL de Supabase llevan nombre único por
    // subida, su contenido no cambia.
    minimumCacheTTL: 2678400,
    // Fotos de producto / logos servidos desde Supabase Storage. Permite que
    // next/image las optimice (redimensiona + webp) en vez de servir el original.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
};

export default nextConfig;
