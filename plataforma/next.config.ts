import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
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
        headers: securityHeaders,
      },
      {
        // Allow preview pages to be embedded in iframes
        source: "/preview/:path*",
        headers: securityHeaders.filter((h) => h.key !== "X-Frame-Options"),
      },
    ];
  },
};

export default nextConfig;
