import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["gsap"],
  images: {
    unoptimized: true,
  },
  serverExternalPackages: [],
  experimental: {
    serverActions: {
      allowedOrigins: [
        "https://en-conjunto.pages.dev",
        "en-conjunto.pages.dev",
        "*.en-conjunto.pages.dev",
        "app.conjuntos.app",
        "localhost:3000",
      ],
      bodySizeLimit: "10mb",
    },
  },
  typescript: {
    // Type errors now fail the build (the frontend↔backend contract is enforced).
    ignoreBuildErrors: false,
  },
  eslint: {
    // Lint runs in CI (`pnpm lint`), not as a build gate — style nits should not
    // block a production deploy. Type errors (above) DO block it.
    ignoreDuringBuilds: true,
  },
  async redirects() {
    // Las páginas legales viven en el landing (conjuntos.app), que es la URL
    // pública canónica. Aquí solo quedan los redirects para no romper enlaces
    // antiguos ni las tiendas de apps.
    return [
      { source: "/privacidad", destination: "https://conjuntos.app/privacidad", permanent: true },
      { source: "/proteccion-datos", destination: "https://conjuntos.app/proteccion-datos", permanent: true },
    ];
  },
  async headers() {
    // Baseline security headers for all routes. CSP is intentionally omitted here
    // until it can be tested against LiveKit + remote images + GSAP inline styles.
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Allow self for media — citofonía/asamblea use the mic/camera via LiveKit.
          { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=()" },
        ],
      },
    ];
  },
  // No /api/v1 rewrite proxy: the client talks to NEXT_PUBLIC_API_URL directly
  // in every environment. The backend CORS allowlist must include the frontend
  // origin (http://localhost:3000 for dev) — see cors_layer in backend/api/src/lib.rs.
};

export default nextConfig;
