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
  async rewrites() {
    const apiUrl =
      process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';
    return [
      {
        source: '/api/v1/ws',
        destination: `${apiUrl}/api/v1/ws`,
      },
      {
        source: '/api/v1/:path*',
        destination: `${apiUrl}/api/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;
