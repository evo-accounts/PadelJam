import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@padel/config",
    "@padel/auth",
    "@padel/i18n",
    "@padel/ui",
    "@padel/db",
    "@padel/utils",
  ],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
    ],
  },
};

export default nextConfig;
