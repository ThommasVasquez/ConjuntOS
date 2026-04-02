import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["gsap"],
  images: {
    unoptimized: true,
  },
  experimental: {
    serverActions: {
      allowedOrigins: ["https://en-conjunto.pages.dev", "en-conjunto.pages.dev", "localhost:3000"],
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
