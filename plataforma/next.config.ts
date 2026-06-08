import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Permite servir imágenes de Supabase Storage (logos, fotos de platillos).
    // El hostname se actualizará con el project-id real en Fase 1.
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
