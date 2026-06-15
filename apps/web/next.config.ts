import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Transpile the framework-free core package (it ships TS source via exports).
  transpilePackages: ["@trading/core"],
  // Pin the workspace root — a stray lockfile in $HOME otherwise confuses Next.
  outputFileTracingRoot: path.resolve(import.meta.dirname, "../.."),
  typedRoutes: true,
};

export default nextConfig;
