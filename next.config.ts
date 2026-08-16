import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typescript: {
    tsconfigPath: "./tsconfig.json",
  },
  env: {
    NEXT_PUBLIC_APP_NAME: "AI Customer Operations Platform",
    NEXT_PUBLIC_APP_VERSION: "0.1.0",
  },
};

export default nextConfig;
