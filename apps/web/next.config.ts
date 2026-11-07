import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The web app consumes the repository-level shared source and dependencies.
  turbopack: {
    root: path.resolve(import.meta.dirname, "../.."),
  },
};

export default nextConfig;
