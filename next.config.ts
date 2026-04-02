import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["gsap"],
  experimental: {
    serverActions: {
      allowedOrigins: ["en-conjunto.pages.dev", "localhost:3000"],
    },
  },
};

export default nextConfig;
