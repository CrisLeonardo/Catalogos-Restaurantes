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
const nextConfig: NextConfig = {
  images: {
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
