import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["gsap"],
  serverExternalPackages: ["pg", "@prisma/postgresql-field-encryption"], 
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals.push("pg-native");
    }
    // Specific alias to kill pg-native resolution
    config.resolve.alias = {
      ...config.resolve.alias,
      "pg-native": false,
    };
    return config;
  },
};

export default nextConfig;
