import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["gsap"],
  images: {
    unoptimized: true,
  },
  serverExternalPackages: [],
  experimental: {
    serverActions: {
      allowedOrigins: ["https://en-conjunto.pages.dev", "en-conjunto.pages.dev", "localhost:3000"],
      bodySizeLimit: "10mb",
    },
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
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
