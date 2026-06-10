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
};

export default nextConfig;
