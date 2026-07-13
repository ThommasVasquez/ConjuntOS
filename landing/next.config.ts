import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["gsap"],
  images: {
    unoptimized: true,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
